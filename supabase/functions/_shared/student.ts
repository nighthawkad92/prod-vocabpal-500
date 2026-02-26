import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";

import { createAdminClient } from "./auth.ts";

export const BASELINE_TEST_CODE = "BASELINE_V1";

const DICTATION_PUNCTUATION = /[.,/#!$%^&*;:{}=\-_`~()?"'[\]\\|<>@+]/g;

type TestRow = {
  id: string;
  code: string;
};

type ClassRow = {
  id: string;
  name: string;
  name_norm: string;
};

type StudentRow = {
  id: string;
  first_name: string;
  last_name: string;
  class_id: string;
};

type AttemptRow = {
  id: string;
  student_id: string;
  test_id: string;
  status: "in_progress" | "completed" | "abandoned" | "expired";
  started_at: string;
};

type WindowRow = {
  id: string;
  test_id: string;
  scope: "all" | "allowlist";
  class_id: string | null;
  is_open: boolean;
  start_at: string;
  end_at: string;
};

export type QuestionItem = {
  id: string;
  stage_no: number;
  item_no: number;
  item_type: "mcq" | "dictation";
  prompt_text: string;
  options_json: string[] | null;
  answer_key: string;
  tts_text: string | null;
  display_order: number;
};

export function normalizeHumanName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeClassName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeNameKey(value: string): string {
  return normalizeHumanName(value).toLowerCase();
}

export function normalizeDictationAnswer(value: string): string {
  return value
    .toLowerCase()
    .replace(DICTATION_PUNCTUATION, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeMcqAnswer(value: string): string {
  return value.trim().toLowerCase();
}

export function clampResponseTimeMs(shownAtIso: string, answeredAtIso: string): number {
  const shownAt = new Date(shownAtIso).getTime();
  const answeredAt = new Date(answeredAtIso).getTime();
  if (Number.isNaN(shownAt) || Number.isNaN(answeredAt)) {
    throw new Error("shownAtIso and answeredAtIso must be valid ISO timestamps");
  }
  const diff = answeredAt - shownAt;
  if (diff < 0) return 0;
  if (diff > 600000) return 600000;
  return diff;
}

export async function getBaselineTest(client: SupabaseClient): Promise<TestRow> {
  const { data, error } = await client
    .from("tests")
    .select("id, code")
    .eq("code", BASELINE_TEST_CODE)
    .eq("is_active", true)
    .maybeSingle<TestRow>();

  if (error) {
    throw new Error(`Failed to load baseline test: ${error.message}`);
  }
  if (!data) {
    throw new Error("No active baseline test configured");
  }
  return data;
}

export async function findOrCreateClass(client: SupabaseClient, className: string): Promise<ClassRow> {
  const cleanedName = normalizeClassName(className);
  const classNameNorm = cleanedName.toLowerCase();
  if (!cleanedName) {
    throw new Error("className is required");
  }

  const existing = await client
    .from("classes")
    .select("id, name, name_norm")
    .eq("name_norm", classNameNorm)
    .maybeSingle<ClassRow>();

  if (existing.error) {
    throw new Error(`Failed to query class: ${existing.error.message}`);
  }
  if (existing.data) return existing.data;

  const inserted = await client
    .from("classes")
    .insert({ name: cleanedName })
    .select("id, name, name_norm")
    .single<ClassRow>();

  if (!inserted.error && inserted.data) {
    return inserted.data;
  }

  const retry = await client
    .from("classes")
    .select("id, name, name_norm")
    .eq("name_norm", classNameNorm)
    .single<ClassRow>();

  if (retry.error) {
    throw new Error(`Failed to create class: ${retry.error.message}`);
  }
  return retry.data;
}

export async function findOrCreateStudent(
  client: SupabaseClient,
  firstName: string,
  lastName: string,
  classId: string,
): Promise<StudentRow> {
  const cleanFirst = normalizeHumanName(firstName);
  const cleanLast = normalizeHumanName(lastName);
  const firstNorm = cleanFirst.toLowerCase();
  const lastNorm = cleanLast.toLowerCase();

  if (!cleanFirst || !cleanLast) {
    throw new Error("firstName and lastName are required");
  }

  const existing = await client
    .from("students")
    .select("id, first_name, last_name, class_id")
    .eq("class_id", classId)
    .eq("first_name_norm", firstNorm)
    .eq("last_name_norm", lastNorm)
    .maybeSingle<StudentRow>();

  if (existing.error) {
    throw new Error(`Failed to query student: ${existing.error.message}`);
  }
  if (existing.data) return existing.data;

  const inserted = await client
    .from("students")
    .insert({
      first_name: cleanFirst,
      last_name: cleanLast,
      class_id: classId,
    })
    .select("id, first_name, last_name, class_id")
    .single<StudentRow>();

  if (!inserted.error && inserted.data) {
    return inserted.data;
  }

  const retry = await client
    .from("students")
    .select("id, first_name, last_name, class_id")
    .eq("class_id", classId)
    .eq("first_name_norm", firstNorm)
    .eq("last_name_norm", lastNorm)
    .single<StudentRow>();

  if (retry.error) {
    throw new Error(`Failed to create student: ${retry.error.message}`);
  }
  return retry.data;
}

export async function getOpenWindowForStudent(
  client: SupabaseClient,
  testId: string,
  classId: string,
  firstName: string,
  lastName: string,
  className: string,
): Promise<WindowRow> {
  const now = new Date().toISOString();
  const { data, error } = await client
    .from("test_windows")
    .select("id, test_id, scope, class_id, is_open, start_at, end_at")
    .eq("test_id", testId)
    .gt("end_at", now)
    .or(`class_id.is.null,class_id.eq.${classId}`)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(`Failed to query open windows: ${error.message}`);
  }
  if (!data || data.length === 0) {
    throw new Error("No baseline session is currently in progress");
  }

  const latestWindow = (data as WindowRow[])[0];
  if (!latestWindow.is_open) {
    throw new Error("Baseline session is currently paused");
  }
  if (Date.parse(latestWindow.start_at) > Date.now()) {
    throw new Error("No baseline session is currently in progress");
  }

  const firstNorm = normalizeNameKey(firstName);
  const lastNorm = normalizeNameKey(lastName);
  const classNorm = normalizeClassName(className).toLowerCase();

  if (latestWindow.scope === "all") {
    return latestWindow;
  }

  const allow = await client
    .from("window_allowlist")
    .select("id")
    .eq("window_id", latestWindow.id)
    .eq("first_name_norm", firstNorm)
    .eq("last_name_norm", lastNorm)
    .eq("class_name_norm", classNorm)
    .maybeSingle();

  if (allow.error) {
    throw new Error(`Failed to query window allowlist: ${allow.error.message}`);
  }
  if (allow.data) {
    return latestWindow;
  }

  throw new Error("Student is not allowed in the current baseline session");
}

export async function getLatestAttempt(
  client: SupabaseClient,
  studentId: string,
  testId: string,
): Promise<AttemptRow | null> {
  const { data, error } = await client
    .from("attempts")
    .select("id, student_id, test_id, status, started_at")
    .eq("student_id", studentId)
    .eq("test_id", testId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle<AttemptRow>();

  if (error) {
    throw new Error(`Failed to query latest attempt: ${error.message}`);
  }
  return data ?? null;
}

export async function isAttemptCreationAllowed(
  client: SupabaseClient,
  studentId: string,
  testId: string,
): Promise<boolean> {
  const attemptsResult = await client
    .from("attempts")
    .select("id", { count: "exact", head: true })
    .eq("student_id", studentId)
    .eq("test_id", testId);
  if (attemptsResult.error) {
    throw new Error(`Failed to count attempts: ${attemptsResult.error.message}`);
  }

  const reopenResult = await client
    .from("teacher_reopens")
    .select("id", { count: "exact", head: true })
    .eq("student_id", studentId)
    .eq("test_id", testId);
  if (reopenResult.error) {
    throw new Error(`Failed to count teacher reopens: ${reopenResult.error.message}`);
  }

  const totalAttempts = attemptsResult.count ?? 0;
  const totalReopens = reopenResult.count ?? 0;
  const maxAllowedAttempts = 1 + totalReopens;
  return totalAttempts < maxAllowedAttempts;
}

export async function createAttempt(
  client: SupabaseClient,
  studentId: string,
  testId: string,
  windowId: string,
  attemptSource: "student" | "qa" = "student",
): Promise<AttemptRow> {
  const startedAt = new Date().toISOString();
  const { data, error } = await client
    .from("attempts")
    .insert({
      student_id: studentId,
      test_id: testId,
      window_id: windowId,
      attempt_source: attemptSource,
      status: "in_progress",
      started_at: startedAt,
    })
    .select("id, student_id, test_id, status, started_at")
    .single<AttemptRow>();

  if (error) {
    throw new Error(`Failed to create attempt: ${error.message}`);
  }
  return data;
}

export async function getQuestionByOrder(
  client: SupabaseClient,
  testId: string,
  displayOrder: number,
): Promise<QuestionItem | null> {
  const { data, error } = await client
    .from("question_items")
    .select("id, stage_no, item_no, item_type, prompt_text, options_json, answer_key, tts_text, display_order")
    .eq("test_id", testId)
    .eq("display_order", displayOrder)
    .maybeSingle<QuestionItem>();

  if (error) {
    throw new Error(`Failed to load question item: ${error.message}`);
  }
  return data ?? null;
}

export async function getQuestionById(
  client: SupabaseClient,
  questionItemId: string,
): Promise<QuestionItem | null> {
  const { data, error } = await client
    .from("question_items")
    .select("id, stage_no, item_no, item_type, prompt_text, options_json, answer_key, tts_text, display_order")
    .eq("id", questionItemId)
    .maybeSingle<QuestionItem>();

  if (error) {
    throw new Error(`Failed to load question item by id: ${error.message}`);
  }
  return data ?? null;
}

export async function getAttemptResponseCount(
  client: SupabaseClient,
  attemptId: string,
): Promise<number> {
  const { count, error } = await client
    .from("responses")
    .select("id", { count: "exact", head: true })
    .eq("attempt_id", attemptId);
  if (error) {
    throw new Error(`Failed to count responses: ${error.message}`);
  }
  return count ?? 0;
}

export async function getAttemptResponses(
  client: SupabaseClient,
  attemptId: string,
): Promise<Array<{ is_correct: boolean }>> {
  const { data, error } = await client
    .from("responses")
    .select("is_correct")
    .eq("attempt_id", attemptId);
  if (error) {
    throw new Error(`Failed to load responses: ${error.message}`);
  }
  return (data ?? []) as Array<{ is_correct: boolean }>;
}

export async function syncAttemptProgress(
  client: SupabaseClient,
  attemptId: string,
): Promise<{ totalCorrect: number; totalWrong: number }> {
  const responses = await getAttemptResponses(client, attemptId);
  const totalCorrect = responses.filter((r) => r.is_correct).length;
  const totalWrong = responses.length - totalCorrect;

  const { error } = await client
    .from("attempts")
    .update({
      total_correct: totalCorrect,
      total_wrong: totalWrong,
      total_score_10: totalCorrect,
      stars: totalCorrect,
    })
    .eq("id", attemptId);

  if (error) {
    throw new Error(`Failed to sync attempt progress: ${error.message}`);
  }

  return { totalCorrect, totalWrong };
}

export function evaluateAnswer(question: QuestionItem, submittedAnswer: string): boolean {
  if (question.item_type === "dictation") {
    return normalizeDictationAnswer(submittedAnswer) === normalizeDictationAnswer(question.answer_key);
  }
  return normalizeMcqAnswer(submittedAnswer) === normalizeMcqAnswer(question.answer_key);
}

export function placementStageFromScore(score: number): number {
  if (score <= 2) return 0;
  if (score <= 4) return 1;
  if (score <= 6) return 2;
  if (score <= 8) return 3;
  return 4;
}

export function instructionalNeedFromStage(stage: number): string {
  switch (stage) {
    case 0:
      return "Phonics + Sound Work";
    case 1:
      return "Word Reading Practice";
    case 2:
      return "Sentence Fluency";
    case 3:
      return "Paragraph + Vocabulary";
    case 4:
      return "Inference + Expression";
    default:
      return "Not assigned";
  }
}

export function toQuestionResponse(question: QuestionItem) {
  return {
    id: question.id,
    stageNo: question.stage_no,
    itemNo: question.item_no,
    itemType: question.item_type,
    promptText: question.prompt_text,
    options: question.options_json,
    ttsText: question.tts_text,
    displayOrder: question.display_order,
  };
}

export function adminClient(): SupabaseClient {
  return createAdminClient();
}
