import "@supabase/functions-js/edge-runtime.d.ts";

import { handleOptions, json } from "../_shared/auth.ts";
import {
  adminClient,
  clampResponseTimeMs,
  evaluateAnswer,
  getAttemptResponseCount,
  getQuestionById,
  getQuestionByOrder,
  syncAttemptProgress,
  toQuestionResponse,
} from "../_shared/student.ts";

type SubmitResponseRequest = {
  attemptId?: string;
  questionItemId?: string;
  stageNo?: number;
  itemNo?: number;
  answer?: string;
  shownAtIso?: string;
  answeredAtIso?: string;
};

type AttemptStatusRow = {
  id: string;
  test_id: string;
  status: "in_progress" | "completed" | "abandoned" | "expired";
};

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return handleOptions(req);
    }
    if (req.method !== "POST") {
      return json(req, 405, { error: "Method not allowed" });
    }

    const body = (await req.json()) as SubmitResponseRequest;
    const attemptId = (body.attemptId ?? "").trim();
    const questionItemId = (body.questionItemId ?? "").trim();
    const answer = (body.answer ?? "").trim();
    const shownAtIso = (body.shownAtIso ?? "").trim();
    const answeredAtIso = (body.answeredAtIso ?? "").trim();

    if (!attemptId || !questionItemId || !answer || !shownAtIso || !answeredAtIso) {
      return json(req, 400, {
        error: "attemptId, questionItemId, answer, shownAtIso and answeredAtIso are required",
      });
    }

    const client = adminClient();
    const attemptQuery = await client
      .from("attempts")
      .select("id, test_id, status")
      .eq("id", attemptId)
      .maybeSingle<AttemptStatusRow>();

    if (attemptQuery.error) {
      throw new Error(`Failed to load attempt: ${attemptQuery.error.message}`);
    }
    if (!attemptQuery.data) {
      return json(req, 404, { error: "Attempt not found" });
    }
    if (attemptQuery.data.status !== "in_progress") {
      return json(req, 409, { error: `Attempt is ${attemptQuery.data.status}` });
    }

    const answeredBefore = await getAttemptResponseCount(client, attemptId);
    const expectedOrder = answeredBefore + 1;
    const expectedQuestion = await getQuestionByOrder(client, attemptQuery.data.test_id, expectedOrder);

    if (!expectedQuestion) {
      return json(req, 409, { error: "All items are already answered. Complete the attempt." });
    }

    if (
      questionItemId !== expectedQuestion.id ||
      body.stageNo !== expectedQuestion.stage_no ||
      body.itemNo !== expectedQuestion.item_no
    ) {
      const previouslyAnswered = await client
        .from("responses")
        .select("id, is_correct")
        .eq("attempt_id", attemptId)
        .eq("question_item_id", questionItemId)
        .maybeSingle<{ id: string; is_correct: boolean }>();

      if (previouslyAnswered.error) {
        throw new Error(`Failed to check existing response: ${previouslyAnswered.error.message}`);
      }
      if (previouslyAnswered.data) {
        return json(req, 200, {
          accepted: true,
          idempotent: true,
          isCorrect: previouslyAnswered.data.is_correct,
          nextQuestion: toQuestionResponse(expectedQuestion),
          progress: {
            totalItems: 10,
            answeredItems: answeredBefore,
            nextDisplayOrder: expectedQuestion.display_order,
          },
        });
      }
      return json(req, 409, { error: "Out-of-order submission" });
    }

    const fullQuestion = await getQuestionById(client, questionItemId);
    if (!fullQuestion) {
      return json(req, 404, { error: "Question item not found" });
    }

    const isCorrect = evaluateAnswer(fullQuestion, answer);
    const responseTimeMs = clampResponseTimeMs(shownAtIso, answeredAtIso);

    const insertResponse = await client.from("responses").insert({
      attempt_id: attemptId,
      question_item_id: questionItemId,
      stage_no: fullQuestion.stage_no,
      item_no: fullQuestion.item_no,
      submitted_answer: answer,
      is_correct: isCorrect,
      shown_at: shownAtIso,
      answered_at: answeredAtIso,
      response_time_ms: responseTimeMs,
    });

    if (insertResponse.error) {
      throw new Error(`Failed to save response: ${insertResponse.error.message}`);
    }

    const progress = await syncAttemptProgress(client, attemptId);
    const answeredAfter = answeredBefore + 1;
    const nextQuestion = await getQuestionByOrder(client, attemptQuery.data.test_id, answeredAfter + 1);

    return json(req, 200, {
      accepted: true,
      idempotent: false,
      isCorrect,
      nextQuestion: nextQuestion ? toQuestionResponse(nextQuestion) : null,
      progress: {
        totalItems: 10,
        answeredItems: answeredAfter,
        nextDisplayOrder: nextQuestion?.display_order ?? null,
      },
      totals: progress,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return json(req, 500, { error: message });
  }
});
