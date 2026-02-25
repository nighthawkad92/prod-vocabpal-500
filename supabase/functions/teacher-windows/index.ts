import "@supabase/functions-js/edge-runtime.d.ts";

import {
  createAdminClient,
  handleOptions,
  json,
  logTeacherEvent,
  requireTeacherSession,
} from "../_shared/auth.ts";
import { getBaselineTest, normalizeClassName, normalizeNameKey } from "../_shared/student.ts";

type SessionStatus = "in_progress" | "paused" | "ended";

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
  status?: SessionStatus;
  isOpen?: boolean;
};

type ToggleWindowRequest = {
  windowId?: string;
  status?: SessionStatus;
  isOpen?: boolean;
};

type WindowRow = {
  id: string;
  scope: "all" | "allowlist";
  is_open: boolean;
  start_at: string;
  end_at: string;
  class_id: string | null;
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_MINUTE_MS = 60 * 1000;

function asIso(ms: number): string {
  return new Date(ms).toISOString();
}

function toMsOrThrow(value: string, field: string): number {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`${field} must be an ISO timestamp`);
  }
  return parsed;
}

function parseStatus(status: SessionStatus | undefined, isOpen: boolean | undefined): SessionStatus {
  if (status) {
    if (status === "in_progress" || status === "paused" || status === "ended") {
      return status;
    }
    throw new Error("status must be one of in_progress, paused, ended");
  }
  if (typeof isOpen === "boolean") {
    return isOpen ? "in_progress" : "paused";
  }
  return "in_progress";
}

function deriveStatus(window: Pick<WindowRow, "is_open" | "end_at">): SessionStatus {
  const now = Date.now();
  const endMs = Date.parse(window.end_at);
  if (window.is_open && !Number.isNaN(endMs) && endMs > now) {
    return "in_progress";
  }
  if (!window.is_open && !Number.isNaN(endMs) && endMs > now) {
    return "paused";
  }
  return "ended";
}

function normalizeTimesForCreate(
  status: SessionStatus,
  startAtRaw: string | undefined,
  endAtRaw: string | undefined,
): { isOpen: boolean; startAt: string; endAt: string } {
  const now = Date.now();
  let startMs = startAtRaw ? toMsOrThrow(startAtRaw, "startAt") : now - 5 * ONE_MINUTE_MS;
  let endMs = endAtRaw ? toMsOrThrow(endAtRaw, "endAt") : now + ONE_DAY_MS;

  if (status === "ended") {
    endMs = now;
    if (startMs >= endMs) {
      startMs = endMs - ONE_MINUTE_MS;
    }
    return { isOpen: false, startAt: asIso(startMs), endAt: asIso(endMs) };
  }

  if (status === "in_progress" && startMs > now) {
    startMs = now - ONE_MINUTE_MS;
  }
  if (endMs <= now) {
    endMs = now + ONE_DAY_MS;
  }
  if (startMs >= endMs) {
    endMs = startMs + ONE_DAY_MS;
  }

  return {
    isOpen: status === "in_progress",
    startAt: asIso(startMs),
    endAt: asIso(endMs),
  };
}

function normalizeTimesForPatch(
  status: SessionStatus,
  current: Pick<WindowRow, "start_at" | "end_at">,
): { is_open: boolean; start_at: string; end_at: string } {
  const now = Date.now();
  let startMs = Date.parse(current.start_at);
  let endMs = Date.parse(current.end_at);
  if (Number.isNaN(startMs)) startMs = now - ONE_MINUTE_MS;
  if (Number.isNaN(endMs)) endMs = now + ONE_DAY_MS;

  if (status === "ended") {
    if (startMs >= now) {
      startMs = now - ONE_MINUTE_MS;
    }
    return { is_open: false, start_at: asIso(startMs), end_at: asIso(now) };
  }

  if (endMs <= now) {
    endMs = now + ONE_DAY_MS;
  }
  if (startMs >= endMs) {
    startMs = endMs - ONE_MINUTE_MS;
  }
  if (status === "in_progress" && startMs > now) {
    startMs = now - ONE_MINUTE_MS;
  }

  return {
    is_open: status === "in_progress",
    start_at: asIso(startMs),
    end_at: asIso(endMs),
  };
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return handleOptions(req);
    }
    if (req.method !== "GET" && req.method !== "POST" && req.method !== "PATCH") {
      return json(req, 405, { error: "Method not allowed" });
    }

    const client = createAdminClient();
    const teacherSession = await requireTeacherSession(client, req);
    if (req.method === "GET") {
      const test = await getBaselineTest(client);
      const latestResult = await client
        .from("test_windows")
        .select("id, scope, is_open, start_at, end_at, class_id")
        .eq("test_id", test.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<WindowRow>();

      if (latestResult.error) {
        throw new Error(`Failed to load latest baseline session: ${latestResult.error.message}`);
      }

      const latestWindow = latestResult.data ?? null;

      return json(req, 200, {
        hasWindow: Boolean(latestWindow),
        status: latestWindow ? deriveStatus(latestWindow) : "paused",
        window: latestWindow,
      });
    }

    if (req.method === "PATCH") {
      const test = await getBaselineTest(client);
      const body = (await req.json()) as ToggleWindowRequest;
      const requestedWindowId = (body.windowId ?? "").trim();
      const status = parseStatus(body.status, body.isOpen);

      let currentWindow: WindowRow | null = null;
      if (requestedWindowId) {
        const byIdResult = await client
          .from("test_windows")
          .select("id, scope, is_open, start_at, end_at, class_id")
          .eq("id", requestedWindowId)
          .eq("test_id", test.id)
          .maybeSingle<WindowRow>();
        if (byIdResult.error) {
          throw new Error(`Failed to load test window: ${byIdResult.error.message}`);
        }
        currentWindow = byIdResult.data ?? null;
      } else {
        const latestResult = await client
          .from("test_windows")
          .select("id, scope, is_open, start_at, end_at, class_id")
          .eq("test_id", test.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle<WindowRow>();
        if (latestResult.error) {
          throw new Error(`Failed to load latest test window: ${latestResult.error.message}`);
        }
        currentWindow = latestResult.data ?? null;
      }

      if (!currentWindow) {
        return json(req, 404, { error: "No baseline session found to update" });
      }

      const patch = normalizeTimesForPatch(status, currentWindow);
      const updateResult = await client
        .from("test_windows")
        .update(patch)
        .eq("id", currentWindow.id)
        .select("id, scope, is_open, start_at, end_at, class_id")
        .maybeSingle<WindowRow>();

      if (updateResult.error) {
        throw new Error(`Failed to update baseline session: ${updateResult.error.message}`);
      }
      if (!updateResult.data) {
        return json(req, 404, { error: "Baseline session not found" });
      }
      const resolvedStatus = deriveStatus(updateResult.data);

      await logTeacherEvent(client, teacherSession.teacher_name, "window_status_updated", {
        windowId: updateResult.data.id,
        status: resolvedStatus,
        requestedStatus: status,
        requestedWindowId: requestedWindowId || null,
      });

      return json(req, 200, {
        updated: true,
        status: resolvedStatus,
        usedLatest: !requestedWindowId,
        window: updateResult.data,
      });
    }

    const test = await getBaselineTest(client);
    const body = (await req.json()) as CreateWindowRequest;

    const scope = body.scope ?? "all";
    const status = parseStatus(body.status, body.isOpen);
    const normalizedTimes = normalizeTimesForCreate(status, body.startAt, body.endAt);
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
        is_open: normalizedTimes.isOpen,
        scope,
        class_id: classId,
        start_at: normalizedTimes.startAt,
        end_at: normalizedTimes.endAt,
        created_by_teacher_name: teacherSession.teacher_name,
      })
      .select("id, scope, is_open, start_at, end_at, class_id")
      .single<WindowRow>();

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
      status,
      allowlistCount: allowlist.length,
    });

    return json(req, 200, {
      created: true,
      status: deriveStatus(windowInsert.data),
      window: windowInsert.data,
      allowlistCount: allowlist.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("Missing teacher session token") || message.includes("Invalid or expired teacher session")) {
      return json(req, 401, { error: message });
    }
    if (message.includes("status must be one of") || message.includes("must be an ISO timestamp")) {
      return json(req, 400, { error: message });
    }
    return json(req, 500, { error: message });
  }
});
