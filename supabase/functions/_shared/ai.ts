import type {
  TeacherAiDeterministicResult,
  TeacherAiFiltersNormalized,
  TeacherAiIntent,
} from "./teacher_analytics.ts";

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4.1-mini";
const OPENAI_TIMEOUT_MS = 15_000;

type OpenAiMessage = {
  role: "system" | "user";
  content: string;
};

type OpenAiResponse = {
  choices?: Array<{
    message?: {
      content?:
        | string
        | Array<{
            type?: string;
            text?: string;
          }>;
    };
  }>;
};

function removeCodeFence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```") || !trimmed.endsWith("```")) {
    return trimmed;
  }

  return trimmed
    .replace(/^```[a-zA-Z]*\n?/, "")
    .replace(/```$/, "")
    .trim();
}

function getOpenAiConfig(): { apiKey: string; model: string } | null {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey || apiKey.trim().length === 0) {
    return null;
  }

  const model = Deno.env.get("OPENAI_MODEL")?.trim() || DEFAULT_MODEL;
  return { apiKey: apiKey.trim(), model };
}

function extractOpenAiContent(payload: OpenAiResponse): string {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("")
      .trim();
  }
  return "";
}

function parseJsonSafe(input: string): unknown {
  const normalized = removeCodeFence(input);
  try {
    return JSON.parse(normalized) as unknown;
  } catch {
    const firstBrace = normalized.indexOf("{");
    const lastBrace = normalized.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const sliced = normalized.slice(firstBrace, lastBrace + 1);
      return JSON.parse(sliced) as unknown;
    }
    throw new Error("OpenAI response was not valid JSON");
  }
}

function buildPrompt(
  intent: TeacherAiIntent,
  filters: TeacherAiFiltersNormalized,
  deterministic: TeacherAiDeterministicResult,
): OpenAiMessage[] {
  const system = [
    "You are an analytics copilot for teachers in India.",
    "Write concise plain-English insights with simple vocabulary.",
    "Return ONLY valid JSON, no markdown, no extra keys.",
    "Required keys: summary (string), insights (string[]), actions (string[]), chart (object), tableRows (object[]).",
    "chart must include: type, title, labels[], series[].",
    "Do not invent metrics not present in sourceMetrics/tableRows/chart.",
    "Avoid student full names in summary; names are allowed in tableRows only when already present.",
  ].join(" ");

  const user = {
    intent,
    filters,
    deterministic,
    outputRules: {
      maxInsights: 4,
      maxActions: 4,
      maxRows: 8,
    },
  };

  return [
    { role: "system", content: system },
    { role: "user", content: JSON.stringify(user) },
  ];
}

export function isOpenAiConfigured(): boolean {
  return getOpenAiConfig() !== null;
}

export async function generateTeacherAiLanguagePatch(
  intent: TeacherAiIntent,
  filters: TeacherAiFiltersNormalized,
  deterministic: TeacherAiDeterministicResult,
): Promise<unknown | null> {
  const config = getOpenAiConfig();
  if (!config) {
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort("openai-timeout"), OPENAI_TIMEOUT_MS);

  try {
    const response = await fetch(OPENAI_CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        max_tokens: 900,
        messages: buildPrompt(intent, filters, deterministic),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI request failed (${response.status}): ${errorText}`);
    }

    const payload = (await response.json()) as OpenAiResponse;
    const content = extractOpenAiContent(payload);
    if (!content || content.trim().length === 0) {
      throw new Error("OpenAI response contained no message content");
    }

    return parseJsonSafe(content);
  } finally {
    clearTimeout(timeoutId);
  }
}
