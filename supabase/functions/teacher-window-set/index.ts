import "@supabase/functions-js/edge-runtime.d.ts";

import {
  createAdminClient,
  handleOptions,
  json,
  logTeacherEvent,
  requireTeacherSession,
} from "../_shared/auth.ts";

type ToggleWindowRequest = {
  windowId?: string;
  isOpen?: boolean;
};

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return handleOptions(req);
    }
    if (req.method !== "POST") {
      return json(req, 405, { error: "Method not allowed" });
    }

    const client = createAdminClient();
    const teacherSession = await requireTeacherSession(client, req);
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("Missing teacher session token") || message.includes("Invalid or expired teacher session")) {
      return json(req, 401, { error: message });
    }
    return json(req, 500, { error: message });
  }
});
