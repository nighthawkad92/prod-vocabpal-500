import "@supabase/functions-js/edge-runtime.d.ts";

import {
  buildSessionCookie,
  createAdminClient,
  createTeacherSession,
  handleOptions,
  json,
  jsonWithHeaders,
  logTeacherEvent,
  normalizedName,
  verifyTeacherPasscode,
} from "../_shared/auth.ts";

type LoginRequest = {
  fullName?: string;
  passcode?: string;
};

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return handleOptions(req);
    }
    if (req.method !== "POST") {
      return json(req, 405, { error: "Method not allowed" });
    }

    const body = (await req.json()) as LoginRequest;
    const fullName = normalizedName(body.fullName ?? "");
    const passcode = (body.passcode ?? "").trim();

    if (fullName.length === 0 || passcode.length === 0) {
      return json(req, 400, { error: "fullName and passcode are required" });
    }

    const validPasscode = await verifyTeacherPasscode(passcode);
    if (!validPasscode) {
      return json(req, 401, { error: "Invalid credentials" });
    }

    const adminClient = createAdminClient();
    const session = await createTeacherSession(adminClient, fullName);
    await logTeacherEvent(adminClient, fullName, "teacher_login", {
      source: "teacher-login-function",
    });

    const extraHeaders = new Headers();
    extraHeaders.append("Set-Cookie", buildSessionCookie(session.token));
    return jsonWithHeaders(req, 200, {
      authenticated: true,
      teacherName: fullName,
      token: session.token,
      expiresAt: session.expiresAt,
    }, extraHeaders);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return json(req, 500, { error: message });
  }
});
