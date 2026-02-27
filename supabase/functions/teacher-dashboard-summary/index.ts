import "@supabase/functions-js/edge-runtime.d.ts";

import { createAdminClient, handleOptions, json, requireTeacherSession } from "../_shared/auth.ts";
import { applyArchiveFilter, resolveArchiveFilter } from "../_shared/archive_filters.ts";
import { normalizeClassName } from "../_shared/student.ts";

type AttemptSummaryRow = {
  id: string;
  attempt_source: "student" | "qa";
  status: string;
  archived_at: string | null;
  total_score_10: number;
  placement_stage: number | null;
  started_at: string;
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

function describeSupabaseError(error: { message?: string | null; details?: string | null; hint?: string | null; code?: string | null }) {
  const message = (error.message ?? "").trim();
  const details = (error.details ?? "").trim();
  const hint = (error.hint ?? "").trim();
  const code = (error.code ?? "").trim();
  return JSON.stringify({
    message: message || null,
    details: details || null,
    hint: hint || null,
    code: code || null,
  });
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return handleOptions(req);
    }
    if (req.method !== "GET") {
      return json(req, 405, { error: "Method not allowed" });
    }

    const client = createAdminClient();
    await requireTeacherSession(client, req);

    const url = new URL(req.url);
    const classFilter = (url.searchParams.get("className") ?? "").trim();
    const sourceFilter = (url.searchParams.get("source") ?? "student").trim().toLowerCase();
    const archiveFilterResult = resolveArchiveFilter(
      url.searchParams.get("archive"),
      url.searchParams.get("archived"),
    );
    const archiveFilter = archiveFilterResult.filter;
    const dateFrom = url.searchParams.get("dateFrom");
    const dateTo = url.searchParams.get("dateTo");
    const includeAllSources = sourceFilter === "all";

    if (archiveFilter === null) {
      return json(req, 400, { error: archiveFilterResult.error ?? "Invalid archive filter" });
    }

    let query = client.from("attempts").select(`
      id,
      attempt_source,
      status,
      archived_at,
      total_score_10,
      placement_stage,
      started_at,
      students!inner(
        id,
        first_name,
        last_name,
        classes!inner(
          id,
          name
        )
      )
    `);

    if (!includeAllSources) {
      const resolvedSource = sourceFilter === "qa" ? "qa" : "student";
      query = query.eq("attempt_source", resolvedSource);
    }
    query = applyArchiveFilter(query, archiveFilter);
    if (dateFrom) query = query.gte("started_at", dateFrom);
    if (dateTo) query = query.lte("started_at", dateTo);

    const result = await query;
    if (result.error) {
      throw new Error(`Failed to load dashboard summary data: ${describeSupabaseError(result.error)}`);
    }

    let rows = (result.data ?? []) as AttemptSummaryRow[];
    if (classFilter) {
      const norm = normalizeClassName(classFilter).toLowerCase();
      rows = rows.filter((row) => row.students?.classes?.name?.toLowerCase() === norm);
    }

    const attemptsTotal = rows.length;
    const completedAttempts = rows.filter((row) => row.status === "completed").length;
    const avgScore10 = attemptsTotal === 0
      ? 0
      : Number((rows.reduce((sum, row) => sum + row.total_score_10, 0) / attemptsTotal).toFixed(2));

    const todayIsoPrefix = new Date().toISOString().slice(0, 10);
    const attemptsToday = rows.filter((row) => row.started_at.startsWith(todayIsoPrefix)).length;
    const completedRows = rows.filter((row) => row.status === "completed");
    const stageBreakdown = [0, 1, 2, 3, 4].map((stage) => {
      const stageRows = completedRows.filter((row) => row.placement_stage === stage);
      const uniqueStudents = new Set(
        stageRows
          .map((row) => row.students?.id)
          .filter((value): value is string => typeof value === "string" && value.length > 0),
      );

      return {
        stage: stage as 0 | 1 | 2 | 3 | 4,
        students: uniqueStudents.size,
        attempts: stageRows.length,
        avgScore10: stageRows.length === 0
          ? 0
          : Number((stageRows.reduce((sum, row) => sum + row.total_score_10, 0) / stageRows.length).toFixed(2)),
      };
    });

    const classMap = new Map<
      string,
      { attempts: number; totalScore: number; completedAttempts: number; inProgressAttempts: number }
    >();
    for (const row of rows) {
      const className = row.students?.classes?.name ?? "Unknown";
      const current = classMap.get(className) ?? {
        attempts: 0,
        totalScore: 0,
        completedAttempts: 0,
        inProgressAttempts: 0,
      };
      current.attempts += 1;
      current.totalScore += row.total_score_10;
      if (row.status === "completed") {
        current.completedAttempts += 1;
      }
      if (row.status === "in_progress") {
        current.inProgressAttempts += 1;
      }
      classMap.set(className, current);
    }

    const classBreakdown = Array.from(classMap.entries())
      .map(([className, info]) => ({
        className,
        attempts: info.attempts,
        completedAttempts: info.completedAttempts,
        inProgressAttempts: info.inProgressAttempts,
        avgScore10: Number((info.totalScore / info.attempts).toFixed(2)),
        completionRate: Number(((info.completedAttempts / info.attempts) * 100).toFixed(1)),
      }))
      .sort((a, b) => a.className.localeCompare(b.className));

    return json(req, 200, {
      attemptsToday,
      attemptsTotal,
      completedAttempts,
      avgScore10,
      stageBreakdown,
      classBreakdown,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("Missing teacher session token") || message.includes("Invalid or expired teacher session")) {
      return json(req, 401, { error: message });
    }
    return json(req, 500, { error: message });
  }
});
