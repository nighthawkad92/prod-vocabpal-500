import "@supabase/functions-js/edge-runtime.d.ts";

import {
  createAdminClient,
  handleOptions,
  json,
  logTeacherEvent,
  requireTeacherSession,
} from "../_shared/auth.ts";
import { getBaselineTest, normalizeClassName, normalizeNameKey } from "../_shared/student.ts";

type WindowAllowlistEntry = {
  firstName: string;
  lastName: string;
  className: string;
};

type CreateWindowRequest = {
  scope?: "all" | "allowlist";
  startAt?: string;
  endAt?: string;
  className?: string;
  allowlist?: WindowAllowlistEntry[];
  isOpen?: boolean;
};

type ToggleWindowRequest = {
  windowId?: string;
  isOpen?: boolean;
};

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return handleOptions(req);
    }
    if (req.method !== "POST" && req.method !== "PATCH") {
      return json(req, 405, { error: "Method not allowed" });
    }

    const client = createAdminClient();
    const teacherSession = await requireTeacherSession(client, req);
    if (req.method === "PATCH") {
      const body = (await req.json()) as ToggleWindowRequest;
      const windowId = (body.windowId ?? "").trim();
      const isOpen = body.isOpen;
      if (!windowId || typeof isOpen !== "boolean") {
        return json(req, 400, { error: "windowId and isOpen(boolean) are required" });
      }

      const updateResult = await client
        .from("test_windows")
        .update({ is_open: isOpen })
        .eq("id", windowId)
        .select("id, is_open, scope, start_at, end_at")
        .maybeSingle();

      if (updateResult.error) {
        throw new Error(`Failed to update test window: ${updateResult.error.message}`);
      }
      if (!updateResult.data) {
        return json(req, 404, { error: "Window not found" });
      }

      await logTeacherEvent(client, teacherSession.teacher_name, "window_toggled", {
        windowId,
        isOpen,
      });

      return json(req, 200, {
        updated: true,
        window: updateResult.data,
      });
    }

    const test = await getBaselineTest(client);
    const body = (await req.json()) as CreateWindowRequest;

    const scope = body.scope ?? "all";
    const startAt = body.startAt ?? new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const endAt = body.endAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const isOpen = body.isOpen ?? true;
    const className = (body.className ?? "").trim();
    const allowlist = body.allowlist ?? [];

    if (scope !== "all" && scope !== "allowlist") {
      return json(req, 400, { error: "scope must be all or allowlist" });
    }
    if (scope === "allowlist" && allowlist.length === 0) {
      return json(req, 400, { error: "allowlist entries are required when scope is allowlist" });
    }

    let classId: string | null = null;
    if (className) {
      const classNorm = normalizeClassName(className).toLowerCase();
      const classQuery = await client
        .from("classes")
        .select("id")
        .eq("name_norm", classNorm)
        .maybeSingle<{ id: string }>();

      if (classQuery.error) {
        throw new Error(`Failed to load class: ${classQuery.error.message}`);
      }
      if (!classQuery.data) {
        return json(req, 400, { error: "className does not exist in classes" });
      }
      classId = classQuery.data.id;
    }

    const windowInsert = await client
      .from("test_windows")
      .insert({
        test_id: test.id,
        is_open: isOpen,
        scope,
        class_id: classId,
        start_at: startAt,
        end_at: endAt,
        created_by_teacher_name: teacherSession.teacher_name,
      })
      .select("id, scope, is_open, start_at, end_at, class_id")
      .single();

    if (windowInsert.error) {
      throw new Error(`Failed to create test window: ${windowInsert.error.message}`);
    }

    if (scope === "allowlist") {
      const rows = allowlist.map((entry) => ({
        window_id: windowInsert.data.id,
        first_name_norm: normalizeNameKey(entry.firstName),
        last_name_norm: normalizeNameKey(entry.lastName),
        class_name_norm: normalizeClassName(entry.className).toLowerCase(),
      }));

      const allowInsert = await client.from("window_allowlist").insert(rows);
      if (allowInsert.error) {
        throw new Error(`Failed to write allowlist: ${allowInsert.error.message}`);
      }
    }

    await logTeacherEvent(client, teacherSession.teacher_name, "window_created", {
      windowId: windowInsert.data.id,
      scope,
      isOpen,
      allowlistCount: allowlist.length,
    });

    return json(req, 200, {
      created: true,
      window: windowInsert.data,
      allowlistCount: allowlist.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("Missing teacher session token") || message.includes("Invalid or expired teacher session")) {
      return json(req, 401, { error: message });
    }
    return json(req, 500, { error: message });
  }
});
