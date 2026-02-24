import "@supabase/functions-js/edge-runtime.d.ts";

import { createAdminClient, handleOptions, json, requireTeacherSession } from "../_shared/auth.ts";

type AttemptDetailRow = {
  id: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  total_correct: number;
  total_wrong: number;
  total_score_10: number;
  stars: number;
  placement_stage: number | null;
  students: {
    id: string;
    first_name: string;
    last_name: string;
    classes: {
      id: string;
      name: string;
    } | null;
  } | null;
};

type ResponseDetailRow = {
  id: string;
  stage_no: number;
  item_no: number;
  submitted_answer: string;
  is_correct: boolean;
  response_time_ms: number;
  shown_at: string;
  answered_at: string;
  question_items: {
    id: string;
    prompt_text: string;
    item_type: string;
    display_order: number;
  } | null;
};

function extractAttemptId(req: Request): string {
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  const tail = pathParts[pathParts.length - 1];
  if (tail && tail !== "teacher-attempt-detail") {
    return tail;
  }
  return (url.searchParams.get("attemptId") ?? "").trim();
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return handleOptions(req);
    }
    if (req.method !== "GET") {
      return json(req, 405, { error: "Method not allowed" });
    }

    const attemptId = extractAttemptId(req);
    if (!attemptId) {
      return json(req, 400, { error: "attemptId is required" });
    }

    const client = createAdminClient();
    await requireTeacherSession(client, req);

    const attemptResult = await client
      .from("attempts")
      .select(`
        id,
        status,
        started_at,
        ended_at,
        total_correct,
        total_wrong,
        total_score_10,
        stars,
        placement_stage,
        students!inner(
          id,
          first_name,
          last_name,
          classes!inner(
            id,
            name
          )
        )
      `)
      .eq("id", attemptId)
      .maybeSingle<AttemptDetailRow>();

    if (attemptResult.error) {
      throw new Error(`Failed to load attempt detail: ${attemptResult.error.message}`);
    }
    if (!attemptResult.data) {
      return json(req, 404, { error: "Attempt not found" });
    }

    const responsesResult = await client
      .from("responses")
      .select(`
        id,
        stage_no,
        item_no,
        submitted_answer,
        is_correct,
        response_time_ms,
        shown_at,
        answered_at,
        question_items!inner(
          id,
          prompt_text,
          item_type,
          display_order
        )
      `)
      .eq("attempt_id", attemptId)
      .order("stage_no", { ascending: true })
      .order("item_no", { ascending: true });

    if (responsesResult.error) {
      throw new Error(`Failed to load attempt responses: ${responsesResult.error.message}`);
    }

    const responses = (responsesResult.data ?? []) as ResponseDetailRow[];
    const totalResponseTimeMs = responses.reduce((sum, row) => sum + row.response_time_ms, 0);

    return json(req, 200, {
      attempt: {
        id: attemptResult.data.id,
        status: attemptResult.data.status,
        startedAt: attemptResult.data.started_at,
        endedAt: attemptResult.data.ended_at,
        totalCorrect: attemptResult.data.total_correct,
        totalWrong: attemptResult.data.total_wrong,
        totalScore10: attemptResult.data.total_score_10,
        stars: attemptResult.data.stars,
        placementStage: attemptResult.data.placement_stage,
        totalResponseTimeMs,
        student: {
          id: attemptResult.data.students?.id ?? null,
          firstName: attemptResult.data.students?.first_name ?? null,
          lastName: attemptResult.data.students?.last_name ?? null,
          className: attemptResult.data.students?.classes?.name ?? null,
        },
      },
      responses: responses.map((row) => ({
        id: row.id,
        stageNo: row.stage_no,
        itemNo: row.item_no,
        questionItemId: row.question_items?.id ?? null,
        promptText: row.question_items?.prompt_text ?? null,
        itemType: row.question_items?.item_type ?? null,
        displayOrder: row.question_items?.display_order ?? null,
        submittedAnswer: row.submitted_answer,
        isCorrect: row.is_correct,
        responseTimeMs: row.response_time_ms,
        shownAt: row.shown_at,
        answeredAt: row.answered_at,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("Missing teacher session token") || message.includes("Invalid or expired teacher session")) {
      return json(req, 401, { error: message });
    }
    return json(req, 500, { error: message });
  }
});
