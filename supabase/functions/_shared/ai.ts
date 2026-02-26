import type {
  TeacherAiDeterministicResult,
  TeacherAiFiltersNormalized,
  TeacherAiIntent,
} from "./teacher_analytics.ts";

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4.1-mini";
const OPENAI_TIMEOUT_MS = 8_000;

type OpenAiMessage = {
  role: "system" | "user";
  content: string;
};

type OpenAiResponse = {
  choices?: Array<{
    message?: {
      content?: string;
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
        messages: buildPrompt(intent, filters, deterministic),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI request failed (${response.status}): ${errorText}`);
    }

    const payload = (await response.json()) as OpenAiResponse;
    const content = payload.choices?.[0]?.message?.content;
    if (!content || content.trim().length === 0) {
      throw new Error("OpenAI response contained no message content");
    }

    const normalized = removeCodeFence(content);
    return JSON.parse(normalized) as unknown;
  } finally {
    clearTimeout(timeoutId);
  }
}
