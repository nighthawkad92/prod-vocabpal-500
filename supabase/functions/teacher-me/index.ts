import "@supabase/functions-js/edge-runtime.d.ts";

import {
  createAdminClient,
  extractSessionToken,
  getActiveTeacherSession,
  handleOptions,
  json,
} from "../_shared/auth.ts";

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return handleOptions(req);
    }
    if (req.method !== "GET") {
      return json(req, 405, { error: "Method not allowed" });
    }

    const token = extractSessionToken(req);
    if (!token) {
      return json(req, 401, { authenticated: false, error: "Missing session token" });
    }

    const adminClient = createAdminClient();
    const session = await getActiveTeacherSession(adminClient, token);
    if (!session) {
      return json(req, 401, { authenticated: false, error: "Invalid or expired session" });
    }

    return json(req, 200, {
      authenticated: true,
      teacherName: session.teacher_name,
      expiresAt: session.expires_at,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return json(req, 500, { error: message });
  }
});
