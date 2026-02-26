import "@supabase/functions-js/edge-runtime.d.ts";

import { createAdminClient, handleOptions, json, sha256Hex } from "../_shared/auth.ts";

const DEFAULT_BUCKET = "tts-audio";
const DEFAULT_LANGUAGE_CODE = "en-IN";
const DEFAULT_VOICE_NAME = "en-IN-Wavenet-A";
const DEFAULT_SPEAKING_RATE = 0.9;
const DEFAULT_DICTATION_SPEAKING_RATE = 0.78;

type QuestionTtsRow = {
  id: string;
  item_type: "mcq" | "dictation";
  answer_key: string;
  tts_text: string | null;
  display_order: number;
};

function extractQuestionItemId(req: Request): string {
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  const fromPath = pathParts[pathParts.length - 1];
  if (fromPath && fromPath !== "student-question-audio") {
    return fromPath;
  }
  return (url.searchParams.get("questionItemId") ?? "").trim();
}

async function ensureBucketExists(client: ReturnType<typeof createAdminClient>, bucket: string): Promise<void> {
  const listBuckets = await client.storage.listBuckets();
  if (listBuckets.error) {
    throw new Error(`Failed to list storage buckets: ${listBuckets.error.message}`);
  }
  const exists = (listBuckets.data ?? []).some((item) => item.name === bucket);
  if (exists) return;
  const createBucket = await client.storage.createBucket(bucket, { public: false });
  if (createBucket.error && !createBucket.error.message.toLowerCase().includes("already")) {
    throw new Error(`Failed to create storage bucket: ${createBucket.error.message}`);
  }
}

function decodeBase64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function parseSpeakingRate(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(1.5, Math.max(0.6, parsed));
}

function escapeSsml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}

function buildSpeechInput(question: QuestionTtsRow): { input: { text?: string; ssml?: string }; cacheInput: string } {
  if (question.item_type !== "dictation") {
    return {
      input: { text: question.tts_text ?? "" },
      cacheInput: `text:${question.tts_text ?? ""}`,
    };
  }

  const targetWord = (question.answer_key ?? question.tts_text ?? "").trim();
  const safeWord = escapeSsml(targetWord);
  const ssml = `<speak>Listen carefully.<break time="220ms"/><emphasis level="strong">${safeWord}</emphasis>.<break time="320ms"/>${safeWord}.</speak>`;
  return {
    input: { ssml },
    cacheInput: `ssml:${ssml}`,
  };
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return handleOptions(req);
    }
    if (req.method !== "GET") {
      return json(req, 405, { error: "Method not allowed" });
    }

    const questionItemId = extractQuestionItemId(req);
    if (!questionItemId) {
      return json(req, 400, { error: "questionItemId is required" });
    }

    const client = createAdminClient();
    const questionResult = await client
      .from("question_items")
      .select("id, item_type, answer_key, tts_text, display_order")
      .eq("id", questionItemId)
      .maybeSingle<QuestionTtsRow>();

    if (questionResult.error) {
      throw new Error(`Failed to load question item: ${questionResult.error.message}`);
    }
    if (!questionResult.data) {
      return json(req, 404, { error: "Question item not found" });
    }
    if (!questionResult.data.tts_text) {
      return json(req, 404, { error: "No TTS text configured for this question item" });
    }

    const bucket = Deno.env.get("TTS_STORAGE_BUCKET") ?? DEFAULT_BUCKET;
    const languageCode = Deno.env.get("GOOGLE_TTS_LANGUAGE_CODE") ?? DEFAULT_LANGUAGE_CODE;
    const voiceName = Deno.env.get("GOOGLE_TTS_VOICE_NAME") ?? DEFAULT_VOICE_NAME;
    const speakingRate = parseSpeakingRate(
      Deno.env.get("GOOGLE_TTS_SPEAKING_RATE"),
      DEFAULT_SPEAKING_RATE,
    );
    const dictationSpeakingRate = parseSpeakingRate(
      Deno.env.get("GOOGLE_TTS_DICTATION_SPEAKING_RATE"),
      DEFAULT_DICTATION_SPEAKING_RATE,
    );
    const speechInput = buildSpeechInput(questionResult.data);
    const resolvedSpeakingRate = questionResult.data.item_type === "dictation"
      ? dictationSpeakingRate
      : speakingRate;
    const cacheKeyInput = `${languageCode}|${voiceName}|${resolvedSpeakingRate}|${speechInput.cacheInput}`;
    const cacheKey = await sha256Hex(cacheKeyInput);
    const objectPath = `baseline_v1/${cacheKey}.mp3`;

    await ensureBucketExists(client, bucket);

    const existingSigned = await client.storage.from(bucket).createSignedUrl(objectPath, 3600);
    if (!existingSigned.error && existingSigned.data?.signedUrl) {
      return json(req, 200, {
        questionItemId,
        audioUrl: existingSigned.data.signedUrl,
        cached: true,
        cacheKey,
      });
    }

    const googleApiKey = Deno.env.get("GOOGLE_TTS_API_KEY");
    if (!googleApiKey) {
      return json(req, 503, {
        error: "Google TTS is not configured. Set GOOGLE_TTS_API_KEY to enable synthesis.",
      });
    }

    const synthResponse = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(googleApiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: speechInput.input,
          voice: {
            languageCode,
            name: voiceName,
            ssmlGender: "FEMALE",
          },
          audioConfig: {
            audioEncoding: "MP3",
            speakingRate: resolvedSpeakingRate,
          },
        }),
      },
    );

    if (!synthResponse.ok) {
      const errBody = await synthResponse.text();
      throw new Error(`Google TTS synthesis failed: ${synthResponse.status} ${errBody}`);
    }

    const synthJson = await synthResponse.json();
    const audioContent = synthJson.audioContent as string | undefined;
    if (!audioContent) {
      throw new Error("Google TTS returned no audio content");
    }

    const uploadResult = await client.storage
      .from(bucket)
      .upload(objectPath, decodeBase64ToBytes(audioContent), {
        contentType: "audio/mpeg",
        upsert: true,
      });

    if (uploadResult.error) {
      throw new Error(`Failed to upload synthesized audio: ${uploadResult.error.message}`);
    }

    const signedUrlResult = await client.storage.from(bucket).createSignedUrl(objectPath, 3600);
    if (signedUrlResult.error || !signedUrlResult.data?.signedUrl) {
      throw new Error(`Failed to create signed URL: ${signedUrlResult.error?.message ?? "unknown error"}`);
    }

    return json(req, 200, {
      questionItemId,
      audioUrl: signedUrlResult.data.signedUrl,
      cached: false,
      cacheKey,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return json(req, 500, { error: message });
  }
});
