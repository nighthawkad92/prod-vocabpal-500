const CLARITY_SCRIPT_ID = "vp-clarity-script";
const CLARITY_PAGE_ID = "student_baseline";
const CLARITY_FRIENDLY_NAME = "VocabPal Student Attempt";

type ClarityPrimitive = string | number | boolean;

export const CLARITY_EVENT_NAMES = [
  "vp_student_entry_viewed",
  "vp_student_step1_next_clicked",
  "vp_student_class_selected",
  "vp_student_section_selected",
  "vp_student_attempt_start_requested",
  "vp_student_attempt_started",
  "vp_student_attempt_start_failed",
  "vp_question_viewed",
  "vp_reading_prelude_viewed",
  "vp_show_question_clicked",
  "vp_audio_play_requested",
  "vp_audio_play_started",
  "vp_audio_play_ended",
  "vp_audio_play_failed",
  "vp_mcq_option_selected",
  "vp_dictation_input_started",
  "vp_submit_answer_requested",
  "vp_submit_answer_success",
  "vp_answer_correct",
  "vp_answer_wrong",
  "vp_submit_answer_failed",
  "vp_attempt_completed",
  "vp_completion_viewed",
] as const;

export type ClarityEventName = (typeof CLARITY_EVENT_NAMES)[number];

export const CLARITY_TAG_KEYS = [
  "vp_app_mode",
  "vp_student_view_state",
  "vp_motion_policy",
  "vp_sound_enabled",
  "vp_onboarding_step",
  "vp_class_number",
  "vp_section_letter",
  "vp_attempt_alias",
  "vp_question_order",
  "vp_question_type",
  "vp_stage_no",
  "vp_has_reading_prelude",
  "vp_audio_source",
  "vp_audio_gate_locked",
  "vp_progress_answered_count",
  "vp_total_score_10",
  "vp_total_correct",
  "vp_total_wrong",
  "vp_stars_collected",
  "vp_placement_stage",
  "vp_error_surface",
  "vp_error_category",
] as const;

export type ClarityTagKey = (typeof CLARITY_TAG_KEYS)[number];

export type ClarityTagRecord = Partial<
  Record<ClarityTagKey, ClarityPrimitive | null | undefined>
>;

type ClarityCall = {
  method: string;
  args: unknown[];
  atIso: string;
  enabled: boolean;
};

const EVENT_SET = new Set<string>(CLARITY_EVENT_NAMES);
const TAG_SET = new Set<string>(CLARITY_TAG_KEYS);
let initialized = false;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isClarityEnabled(): boolean {
  return import.meta.env.PROD &&
    import.meta.env.VITE_CLARITY_ENABLED === "true" &&
    typeof import.meta.env.VITE_CLARITY_PROJECT_ID === "string" &&
    import.meta.env.VITE_CLARITY_PROJECT_ID.trim().length > 0;
}

function getProjectId(): string {
  const projectId = import.meta.env.VITE_CLARITY_PROJECT_ID as string | undefined;
  return projectId?.trim() ?? "";
}

function ensureDebugStore(): void {
  if (!isBrowser() || import.meta.env.PROD) return;
  if (!window.__vpClarityDebug) {
    window.__vpClarityDebug = { calls: [] };
  }
}

function debugCall(method: string, args: unknown[], enabled: boolean): void {
  ensureDebugStore();
  if (!isBrowser() || import.meta.env.PROD || !window.__vpClarityDebug) return;

  const entry: ClarityCall = {
    method,
    args,
    atIso: new Date().toISOString(),
    enabled,
  };
  window.__vpClarityDebug.calls.push(entry);
}

function invokeClarity(method: string, ...args: unknown[]): void {
  const enabled = isClarityEnabled();
  debugCall(method, args, enabled);

  if (!enabled || !isBrowser()) return;
  initClarity();
  if (typeof window.clarity !== "function") return;

  window.clarity(method, ...args);
}

export function sanitizeTagValue(value: unknown): ClarityPrimitive {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";

  if (Array.isArray(value)) {
    return value.map((item) => String(item)).join(",").slice(0, 120);
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value).slice(0, 120);
    } catch {
      return "[object]";
    }
  }

  return String(value).slice(0, 120);
}

export function initClarity(): void {
  if (!isBrowser() || initialized || !isClarityEnabled()) {
    return;
  }

  const projectId = getProjectId();
  if (!projectId) return;

  if (!window.clarity) {
    const clarityQueue = (...args: unknown[]) => {
      const clarityFn = window.clarity as ((...params: unknown[]) => void) & { q?: unknown[][] };
      clarityFn.q = clarityFn.q ?? [];
      clarityFn.q.push(args);
    };
    clarityQueue.q = [] as unknown[][];
    window.clarity = clarityQueue;
  }

  if (!document.getElementById(CLARITY_SCRIPT_ID)) {
    const script = document.createElement("script");
    script.id = CLARITY_SCRIPT_ID;
    script.async = true;
    script.src = `https://www.clarity.ms/tag/${projectId}`;
    document.head.appendChild(script);
  }

  initialized = true;
}

export function clarityEvent(name: ClarityEventName): void {
  if (!EVENT_SET.has(name)) return;
  invokeClarity("event", name);
}

export function claritySet(tags: ClarityTagRecord): void {
  for (const [key, rawValue] of Object.entries(tags)) {
    if (!TAG_SET.has(key)) continue;
    if (rawValue === null || rawValue === undefined) continue;
    const value = sanitizeTagValue(rawValue);
    invokeClarity("set", key, value);
  }
}

function hexFromBuffer(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function fallbackHash(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return Math.abs(hash >>> 0).toString(16).padStart(8, "0").repeat(4);
}

async function hashAttemptId(attemptId: string): Promise<string> {
  const trimmed = attemptId.trim();
  if (!trimmed) return fallbackHash("empty_attempt");

  if (typeof crypto !== "undefined" && crypto.subtle) {
    const data = new TextEncoder().encode(trimmed);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return hexFromBuffer(digest);
  }

  return fallbackHash(trimmed);
}

export async function clarityIdentifyAttempt(attemptId: string): Promise<string> {
  const hash = await hashAttemptId(attemptId);
  const attemptAlias = `a_${hash.slice(0, 16)}`;

  invokeClarity("identify", attemptAlias, attemptAlias, CLARITY_PAGE_ID, CLARITY_FRIENDLY_NAME);
  claritySet({ vp_attempt_alias: attemptAlias });

  return attemptAlias;
}
