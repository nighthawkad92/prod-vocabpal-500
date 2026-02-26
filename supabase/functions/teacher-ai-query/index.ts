import "@supabase/functions-js/edge-runtime.d.ts";

import {
  createAdminClient,
  handleOptions,
  json,
  logTeacherEvent,
  requireTeacherSession,
} from "../_shared/auth.ts";
import { getBaselineTest } from "../_shared/student.ts";
import { generateTeacherAiLanguagePatch, isOpenAiConfigured } from "../_shared/ai.ts";
import {
  assertTeacherAiResponseShape,
  buildTeacherAiDeterministicResult,
  mergeTeacherAiLanguagePatch,
  normalizeTeacherAiFilters,
  parseTeacherAiIntent,
  loadTeacherAnalyticsDataset,
  type TeacherAiIntent,
} from "../_shared/teacher_analytics.ts";

type TeacherAiQueryRequest = {
  intent?: unknown;
  filters?: unknown;
};

function isTeacherSessionError(message: string): boolean {
  return message.includes("Missing teacher session token") || message.includes("Invalid or expired teacher session");
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return handleOptions(req);
    }
    if (req.method !== "POST") {
      return json(req, 405, { error: "Method not allowed" });
    }

    const body = (await req.json()) as TeacherAiQueryRequest;
    const intent = parseTeacherAiIntent(body.intent);
    const filters = normalizeTeacherAiFilters(body.filters);

    const client = createAdminClient();
    const teacherSession = await requireTeacherSession(client, req);
    const test = await getBaselineTest(client);

    const requestId = crypto.randomUUID();

    const dataset = await loadTeacherAnalyticsDataset(client, test.id, filters);
    const deterministic = buildTeacherAiDeterministicResult(intent, filters, dataset);

    let fallbackUsed = true;
    let result = deterministic;

    if (isOpenAiConfigured()) {
      try {
        const patch = await generateTeacherAiLanguagePatch(intent as TeacherAiIntent, filters, deterministic);
        if (patch) {
          result = mergeTeacherAiLanguagePatch(deterministic, patch);
          fallbackUsed = false;
        }
      } catch {
        fallbackUsed = true;
      }
    }

    const payload = {
      requestId,
      intent,
      summary: result.summary,
      insights: result.insights,
      actions: result.actions,
      chart: result.chart,
      tableRows: result.tableRows,
      sourceMetrics: result.sourceMetrics,
      fallbackUsed,
    };

    assertTeacherAiResponseShape(payload);

    await logTeacherEvent(client, teacherSession.teacher_name, "teacher_ai_query", {
      intent,
      filters,
      fallbackUsed,
      sourceSummary: {
        totalAttempts: dataset.totals.attempts,
        classCount: dataset.classAggregates.length,
        responseCount: dataset.responses.length,
      },
    });

    return json(req, 200, payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (isTeacherSessionError(message)) {
      return json(req, 401, { error: message });
    }

    return json(req, 500, { error: message });
  }
});
