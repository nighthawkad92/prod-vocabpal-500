import "@supabase/functions-js/edge-runtime.d.ts";

import {
  createAdminClient,
  handleOptions,
  json,
  logTeacherEvent,
  requireTeacherSession,
} from "../_shared/auth.ts";
import { getBaselineTest, getCanonicalBaselineWindow } from "../_shared/student.ts";

type CanonicalWindow = {
  id: string;
  scope: "all" | "allowlist";
  is_open: boolean;
  start_at: string;
  end_at: string;
  class_id: string | null;
  window_key: string | null;
};

function serializeWindow(window: CanonicalWindow) {
  return {
    id: window.id,
    scope: window.scope,
    is_open: true,
    start_at: window.start_at,
    end_at: window.end_at,
    class_id: window.class_id,
    window_key: window.window_key,
  };
}

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
    const test = await getBaselineTest(client);
    const window = await getCanonicalBaselineWindow(client, test.id);

    let body: unknown = null;
    try {
      body = await req.json();
    } catch {
      body = null;
    }

    await logTeacherEvent(client, teacherSession.teacher_name, "legacy_window_control_ignored", {
      endpoint: "teacher-window-set",
      method: req.method,
      requestedBody: body,
      canonicalWindowId: window.id,
    });

    return json(req, 200, {
      deprecated: true,
      ignored: true,
      updated: false,
      status: "in_progress",
      window: serializeWindow(window),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("Missing teacher session token") || message.includes("Invalid or expired teacher session")) {
      return json(req, 401, { error: message });
    }
    return json(req, 500, { error: message });
  }
});
