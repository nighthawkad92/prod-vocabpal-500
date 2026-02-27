import "@supabase/functions-js/edge-runtime.d.ts";

import { createAdminClient, handleOptions, json, requireTeacherSession } from "../_shared/auth.ts";
import { applyArchiveFilter, resolveArchiveFilter } from "../_shared/archive_filters.ts";
import { normalizeClassName } from "../_shared/student.ts";

type AttemptRow = {
  id: string;
  attempt_source: "student" | "qa";
  status: string;
  archived_at: string | null;
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
    const status = (url.searchParams.get("status") ?? "").trim();
    const className = (url.searchParams.get("className") ?? "").trim();
    const source = (url.searchParams.get("source") ?? "student").trim().toLowerCase();
    const archiveFilterResult = resolveArchiveFilter(
      url.searchParams.get("archive"),
      url.searchParams.get("archived"),
    );
    const archiveFilter = archiveFilterResult.filter;
    const stageRaw = (url.searchParams.get("stage") ?? "").trim();
    const stage = stageRaw ? Number(stageRaw) : null;
    const limit = Number(url.searchParams.get("limit") ?? "100");
    const offset = Number(url.searchParams.get("offset") ?? "0");
    if (archiveFilter === null) {
      return json(req, 400, { error: archiveFilterResult.error ?? "Invalid archive filter" });
    }
    if (stageRaw && (!Number.isFinite(stage) || stage === null || stage < 0 || stage > 4)) {
      return json(req, 400, { error: "stage must be an integer between 0 and 4" });
    }

    let query = client
      .from("attempts")
      .select(`
        id,
        attempt_source,
        status,
        archived_at,
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
      .order("started_at", { ascending: false })
      .range(offset, offset + Math.max(limit - 1, 0));

    if (status) {
      query = query.eq("status", status);
    }
    if (source === "student" || source === "qa") {
      query = query.eq("attempt_source", source);
    }
    query = applyArchiveFilter(query, archiveFilter);
    if (stage !== null) {
      query = query
        .eq("status", "completed")
        .eq("placement_stage", Math.trunc(stage));
    }

    const result = await query;
    if (result.error) {
      throw new Error(`Failed to load attempts: ${describeSupabaseError(result.error)}`);
    }

    let rows = (result.data ?? []) as AttemptRow[];
    if (className) {
      const classNorm = normalizeClassName(className).toLowerCase();
      rows = rows.filter((row) => row.students?.classes?.name.toLowerCase() === classNorm);
    }

    return json(req, 200, {
      count: rows.length,
      attempts: rows.map((row) => ({
        id: row.id,
        status: row.status,
        archiveAt: row.archived_at,
        archivedAt: row.archived_at,
        startedAt: row.started_at,
        endedAt: row.ended_at,
        totalCorrect: row.total_correct,
        totalWrong: row.total_wrong,
        totalScore10: row.total_score_10,
        stars: row.stars,
        placementStage: row.placement_stage,
        attemptSource: row.attempt_source,
        student: {
          id: row.students?.id ?? null,
          firstName: row.students?.first_name ?? null,
          lastName: row.students?.last_name ?? null,
          className: row.students?.classes?.name ?? null,
        },
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
