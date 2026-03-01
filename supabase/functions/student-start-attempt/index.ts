import "@supabase/functions-js/edge-runtime.d.ts";

import { handleOptions, json } from "../_shared/auth.ts";
import {
  adminClient,
  createAttempt,
  findOrCreateClass,
  findOrCreateStudent,
  getAttemptResponseCount,
  getBaselineTest,
  getCanonicalBaselineWindow,
  getLatestAttempt,
  getQuestionByOrder,
  isAttemptCreationAllowed,
  toQuestionResponse,
} from "../_shared/student.ts";

type StartAttemptRequest = {
  firstName?: string;
  lastName?: string;
  className?: string;
  attemptSource?: "student" | "qa";
};

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return handleOptions(req);
    }
    if (req.method !== "POST") {
      return json(req, 405, { error: "Method not allowed" });
    }

    const body = (await req.json()) as StartAttemptRequest;
    const firstName = (body.firstName ?? "").trim();
    const lastName = (body.lastName ?? "").trim();
    const className = (body.className ?? "").trim();
    const requestedAttemptSource = body.attemptSource === "qa" ? "qa" : "student";
    const qaSourceToken = Deno.env.get("QA_SOURCE_TOKEN");
    const requestQaSourceToken = req.headers.get("x-vocabpal-qa-source-token");
    const attemptSource: "student" | "qa" = requestedAttemptSource === "qa" &&
        qaSourceToken &&
        requestQaSourceToken &&
        requestQaSourceToken === qaSourceToken
      ? "qa"
      : "student";

    if (!firstName || !lastName || !className) {
      return json(req, 400, { error: "firstName, lastName, and className are required" });
    }

    const client = adminClient();
    const test = await getBaselineTest(client);
    const klass = await findOrCreateClass(client, className);
    const student = await findOrCreateStudent(client, firstName, lastName, klass.id);
    const window = await getCanonicalBaselineWindow(client, test.id);
    const latestAttempt = await getLatestAttempt(client, student.id, test.id);

    if (latestAttempt && latestAttempt.status === "in_progress") {
      const answered = await getAttemptResponseCount(client, latestAttempt.id);
      const nextOrder = answered + 1;
      const nextQuestion = await getQuestionByOrder(client, test.id, nextOrder);
      return json(req, 200, {
        resumed: true,
        attemptId: latestAttempt.id,
        testCode: test.code,
        nextQuestion: nextQuestion ? toQuestionResponse(nextQuestion) : null,
        progress: {
          totalItems: 10,
          answeredItems: answered,
          nextDisplayOrder: nextQuestion?.display_order ?? null,
        },
      });
    }

    const canCreate = await isAttemptCreationAllowed(client, student.id, test.id);
    if (!canCreate) {
      return json(req, 409, {
        error: "Baseline attempt limit reached for this student. Teacher reopen is required.",
      });
    }

    const attempt = await createAttempt(client, student.id, test.id, window.id, attemptSource);
    const firstQuestion = await getQuestionByOrder(client, test.id, 1);
    if (!firstQuestion) {
      return json(req, 500, { error: "No baseline questions are configured" });
    }

    return json(req, 200, {
      resumed: false,
      attemptId: attempt.id,
      testCode: test.code,
      firstQuestion: toQuestionResponse(firstQuestion),
      progress: {
        totalItems: 10,
        answeredItems: 0,
        nextDisplayOrder: 1,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return json(req, 500, { error: message });
  }
});
