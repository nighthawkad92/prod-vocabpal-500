const CONFIG_ERROR = "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in environment.";

type ClientConfig = {
  supabaseUrl: string;
  apikey: string;
};

export function getClientConfig(): ClientConfig {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const apikey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  if (!supabaseUrl || !apikey) {
    throw new Error(CONFIG_ERROR);
  }

  return { supabaseUrl, apikey };
}

export function getClientConfigError(): string | null {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const apikey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return supabaseUrl && apikey ? null : CONFIG_ERROR;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function parsePayload(text: string): unknown {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

export async function callFunction<T>(
  path: string,
  opts: {
    method?: "GET" | "POST" | "PATCH";
    body?: unknown;
    token?: string;
  } = {},
): Promise<T> {
  const { supabaseUrl, apikey } = getClientConfig();
  const method = opts.method ?? "GET";
  const headers = new Headers({
    "Content-Type": "application/json",
    apikey,
  });
  if (opts.token) {
    if (opts.token.split(".").length === 3) {
      headers.set("Authorization", `Bearer ${opts.token}`);
    } else {
      headers.set("x-teacher-session", opts.token);
    }
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/${path}`, {
    method,
    credentials: "include",
    headers,
    body: method === "GET" ? undefined : JSON.stringify(opts.body ?? {}),
  });

  const text = await response.text();
  const payload = parsePayload(text) as Record<string, unknown>;

  if (!response.ok) {
    const message =
      typeof payload.error === "string"
        ? payload.error
        : typeof payload.message === "string"
          ? payload.message
          : `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }

  return payload as T;
}
