import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";

export const SESSION_COOKIE_NAME = "vp_teacher_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 12;

type SessionRow = {
  id: string;
  teacher_name: string;
  expires_at: string;
  revoked_at: string | null;
};

type TeacherEventPayload = Record<string, unknown>;

function splitCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function resolveAllowedOrigin(req: Request): string {
  const reqOrigin = req.headers.get("origin");
  const allowedOrigins = splitCsv(Deno.env.get("APP_ORIGINS"));
  if (!reqOrigin) {
    return allowedOrigins[0] ?? "*";
  }
  if (allowedOrigins.length === 0) {
    return reqOrigin;
  }
  return allowedOrigins.includes(reqOrigin) ? reqOrigin : allowedOrigins[0];
}

export function corsHeaders(req: Request): Headers {
  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", resolveAllowedOrigin(req));
  headers.set(
    "Access-Control-Allow-Headers",
    "authorization, x-client-info, apikey, content-type, x-teacher-session",
  );
  headers.set("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Vary", "Origin");
  return headers;
}

export function handleOptions(req: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

export function json(req: Request, status: number, payload: unknown): Response {
  const headers = corsHeaders(req);
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(payload), { status, headers });
}

export function jsonWithHeaders(
  req: Request,
  status: number,
  payload: unknown,
  extraHeaders: Headers,
): Response {
  const headers = corsHeaders(req);
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "no-store");
  for (const [key, value] of extraHeaders.entries()) {
    headers.append(key, value);
  }
  return new Response(JSON.stringify(payload), { status, headers });
}

function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function createAdminClient(): SupabaseClient {
  const supabaseUrl = getRequiredEnv("SUPABASE_URL");
  const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(value: string): Uint8Array {
  if (value.length % 2 !== 0) {
    throw new Error("Invalid hex length");
  }
  const result = new Uint8Array(value.length / 2);
  for (let i = 0; i < value.length; i += 2) {
    result[i / 2] = Number.parseInt(value.slice(i, i + 2), 16);
  }
  return result;
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const aBytes = hexToBytes(a);
  const bBytes = hexToBytes(b);
  let diff = 0;
  for (let i = 0; i < aBytes.length; i += 1) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

export function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function normalizedName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export async function verifyTeacherPasscode(passcode: string): Promise<boolean> {
  const expectedHash = getRequiredEnv("TEACHER_PASSCODE_HASH").toLowerCase();
  const providedHash = await sha256Hex(passcode);
  return timingSafeEqualHex(expectedHash, providedHash);
}

export async function createTeacherSession(
  client: SupabaseClient,
  teacherName: string,
): Promise<{ token: string; expiresAt: string }> {
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();

  const { error } = await client
    .from("teacher_sessions")
    .insert({ teacher_name: teacherName, token_hash: tokenHash, expires_at: expiresAt });

  if (error) {
    throw new Error(`Failed to create teacher session: ${error.message}`);
  }
  return { token, expiresAt };
}

export function extractSessionToken(req: Request): string | null {
  const teacherHeader = req.headers.get("x-teacher-session");
  if (teacherHeader && teacherHeader.trim().length > 0) {
    return teacherHeader.trim();
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    const bearerToken = authHeader.slice(7).trim();
    if (bearerToken.length > 0) return bearerToken;
  }

  const cookieHeader = req.headers.get("cookie");
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(";").map((cookie) => cookie.trim());
  for (const cookie of cookies) {
    if (cookie.startsWith(`${SESSION_COOKIE_NAME}=`)) {
      const value = cookie.slice(`${SESSION_COOKIE_NAME}=`.length);
      if (value.length > 0) return decodeURIComponent(value);
    }
  }
  return null;
}

export async function getActiveTeacherSession(
  client: SupabaseClient,
  token: string,
): Promise<SessionRow | null> {
  const tokenHash = await sha256Hex(token);
  const { data, error } = await client
    .from("teacher_sessions")
    .select("id, teacher_name, expires_at, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle<SessionRow>();

  if (error) {
    throw new Error(`Failed to load teacher session: ${error.message}`);
  }
  if (!data) return null;
  if (data.revoked_at) return null;
  if (new Date(data.expires_at).getTime() <= Date.now()) return null;
  return data;
}

export async function requireTeacherSession(
  client: SupabaseClient,
  req: Request,
): Promise<SessionRow> {
  const token = extractSessionToken(req);
  if (!token) {
    throw new Error("Missing teacher session token");
  }
  const session = await getActiveTeacherSession(client, token);
  if (!session) {
    throw new Error("Invalid or expired teacher session");
  }
  return session;
}

export async function revokeTeacherSession(client: SupabaseClient, token: string): Promise<void> {
  const tokenHash = await sha256Hex(token);
  const { error } = await client
    .from("teacher_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("token_hash", tokenHash)
    .is("revoked_at", null);

  if (error) {
    throw new Error(`Failed to revoke teacher session: ${error.message}`);
  }
}

export async function logTeacherEvent(
  client: SupabaseClient,
  teacherName: string,
  eventType: string,
  eventPayload: TeacherEventPayload = {},
): Promise<void> {
  const { error } = await client.from("teacher_audit_events").insert({
    teacher_name: teacherName,
    event_type: eventType,
    event_payload: eventPayload,
  });
  if (error) {
    throw new Error(`Failed to create teacher audit event: ${error.message}`);
  }
}

export function buildSessionCookie(token: string): string {
  const secureEnabled = Deno.env.get("SESSION_COOKIE_SECURE") !== "false";
  const cookieParts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    `Max-Age=${SESSION_TTL_SECONDS}`,
    "Path=/",
    "HttpOnly",
    "SameSite=None",
  ];
  if (secureEnabled) {
    cookieParts.push("Secure");
  }
  return cookieParts.join("; ");
}

export function buildClearSessionCookie(): string {
  const secureEnabled = Deno.env.get("SESSION_COOKIE_SECURE") !== "false";
  const cookieParts = [
    `${SESSION_COOKIE_NAME}=`,
    "Max-Age=0",
    "Path=/",
    "HttpOnly",
    "SameSite=None",
  ];
  if (secureEnabled) {
    cookieParts.push("Secure");
  }
  return cookieParts.join("; ");
}
