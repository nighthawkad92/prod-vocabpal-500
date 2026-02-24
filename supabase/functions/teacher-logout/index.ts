import "@supabase/functions-js/edge-runtime.d.ts";

import {
  buildClearSessionCookie,
  createAdminClient,
  extractSessionToken,
  getActiveTeacherSession,
  handleOptions,
  json,
  jsonWithHeaders,
  logTeacherEvent,
  revokeTeacherSession,
} from "../_shared/auth.ts";

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return handleOptions(req);
    }
    if (req.method !== "POST") {
      return json(req, 405, { error: "Method not allowed" });
    }

    const token = extractSessionToken(req);
    if (!token) {
      const clearHeaders = new Headers();
      clearHeaders.append("Set-Cookie", buildClearSessionCookie());
      return jsonWithHeaders(req, 200, { loggedOut: true }, clearHeaders);
    }

    const adminClient = createAdminClient();
    const existingSession = await getActiveTeacherSession(adminClient, token);
    await revokeTeacherSession(adminClient, token);

    if (existingSession) {
      await logTeacherEvent(adminClient, existingSession.teacher_name, "teacher_logout", {
        source: "teacher-logout-function",
      });
    }

    const clearHeaders = new Headers();
    clearHeaders.append("Set-Cookie", buildClearSessionCookie());

    return jsonWithHeaders(req, 200, { loggedOut: true }, clearHeaders);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return json(req, 500, { error: message });
  }
});
