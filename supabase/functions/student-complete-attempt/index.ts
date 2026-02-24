import "@supabase/functions-js/edge-runtime.d.ts";

import { handleOptions, json } from "../_shared/auth.ts";
import {
  adminClient,
  instructionalNeedFromStage,
  placementStageFromScore,
  syncAttemptProgress,
} from "../_shared/student.ts";

type CompleteAttemptRequest = {
  attemptId?: string;
};

type AttemptRow = {
  id: string;
  test_id: string;
  status: "in_progress" | "completed" | "abandoned" | "expired";
  total_correct: number;
  total_wrong: number;
  total_score_10: number;
  stars: number;
  placement_stage: number | null;
};

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return handleOptions(req);
    }
    if (req.method !== "POST") {
      return json(req, 405, { error: "Method not allowed" });
    }

    const body = (await req.json()) as CompleteAttemptRequest;
    const attemptId = (body.attemptId ?? "").trim();
    if (!attemptId) {
      return json(req, 400, { error: "attemptId is required" });
    }

    const client = adminClient();
    const attemptResult = await client
      .from("attempts")
      .select("id, test_id, status, total_correct, total_wrong, total_score_10, stars, placement_stage")
      .eq("id", attemptId)
      .maybeSingle<AttemptRow>();

    if (attemptResult.error) {
      throw new Error(`Failed to load attempt: ${attemptResult.error.message}`);
    }
    if (!attemptResult.data) {
      return json(req, 404, { error: "Attempt not found" });
    }

    if (attemptResult.data.status === "completed") {
      const stage = attemptResult.data.placement_stage ?? placementStageFromScore(attemptResult.data.total_score_10);
      return json(req, 200, {
        attemptId,
        totalScore10: attemptResult.data.total_score_10,
        totalCorrect: attemptResult.data.total_correct,
        totalWrong: attemptResult.data.total_wrong,
        stars: attemptResult.data.stars,
        placementStage: stage,
        instructionalNeed: instructionalNeedFromStage(stage),
      });
    }
    if (attemptResult.data.status !== "in_progress") {
      return json(req, 409, { error: `Attempt is ${attemptResult.data.status}` });
    }

    const progress = await syncAttemptProgress(client, attemptId);
    const questionCountResult = await client
      .from("question_items")
      .select("id", { count: "exact", head: true })
      .eq("test_id", attemptResult.data.test_id);

    if (questionCountResult.error) {
      throw new Error(`Failed to count question items: ${questionCountResult.error.message}`);
    }
    const totalItems = questionCountResult.count ?? 0;

    const responseCountResult = await client
      .from("responses")
      .select("id", { count: "exact", head: true })
      .eq("attempt_id", attemptId);

    if (responseCountResult.error) {
      throw new Error(`Failed to count responses: ${responseCountResult.error.message}`);
    }
    const answeredItems = responseCountResult.count ?? 0;
    if (answeredItems < totalItems) {
      return json(req, 400, {
        error: "Attempt cannot be completed before all items are answered",
        answeredItems,
        totalItems,
      });
    }

    const placementStage = placementStageFromScore(progress.totalCorrect);
    const endedAt = new Date().toISOString();

    const updateAttempt = await client
      .from("attempts")
      .update({
        status: "completed",
        ended_at: endedAt,
        total_correct: progress.totalCorrect,
        total_wrong: progress.totalWrong,
        total_score_10: progress.totalCorrect,
        stars: progress.totalCorrect,
        placement_stage: placementStage,
      })
      .eq("id", attemptId);

    if (updateAttempt.error) {
      throw new Error(`Failed to complete attempt: ${updateAttempt.error.message}`);
    }

    return json(req, 200, {
      attemptId,
      totalScore10: progress.totalCorrect,
      totalCorrect: progress.totalCorrect,
      totalWrong: progress.totalWrong,
      stars: progress.totalCorrect,
      placementStage,
      instructionalNeed: instructionalNeedFromStage(placementStage),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return json(req, 500, { error: message });
  }
});
