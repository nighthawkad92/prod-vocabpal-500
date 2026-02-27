import "@supabase/functions-js/edge-runtime.d.ts";

import { createAdminClient, handleOptions, json, requireTeacherSession } from "../_shared/auth.ts";
import { normalizeClassName } from "../_shared/student.ts";

type AttemptRow = {
  id: string;
  attempt_source: "student" | "qa";
  status: string;
  archive_at: string | null;
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

type ArchiveFilter = "active" | "archives" | "all";

function parseArchiveFilter(
  canonicalRaw: string | null,
  legacyRaw: string | null,
): ArchiveFilter | null {
  const canonical = (canonicalRaw ?? "").trim().toLowerCase();
  if (canonical) {
    if (canonical === "active") return "active";
    if (canonical === "archives") return "archives";
    if (canonical === "all") return "all";
    return null;
  }

  const legacy = (legacyRaw ?? "").trim().toLowerCase();
  if (!legacy || legacy === "exclude") return "active";
  if (legacy === "only") return "archives";
  if (legacy === "include") return "all";
  return null;
}

type ArchiveFilterQuery = {
  is: (column: string, value: null) => ArchiveFilterQuery;
  or: (filters: string) => ArchiveFilterQuery;
};

function applyArchiveFilter<T extends ArchiveFilterQuery>(query: T, archiveFilter: ArchiveFilter): T {
  const q = query as ArchiveFilterQuery;
  if (archiveFilter === "active") {
    return q.is("archive_at", null).is("archived_at", null) as T;
  }
  if (archiveFilter === "archives") {
    return q.or("archive_at.not.is.null,archived_at.not.is.null") as T;
  }
  return query;
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
    const archiveFilter = parseArchiveFilter(url.searchParams.get("archive"), url.searchParams.get("archived"));
    const stageRaw = (url.searchParams.get("stage") ?? "").trim();
    const stage = stageRaw ? Number(stageRaw) : null;
    const limit = Number(url.searchParams.get("limit") ?? "100");
    const offset = Number(url.searchParams.get("offset") ?? "0");
    if (archiveFilter === null) {
      return json(req, 400, {
        error: "archive must be one of: active, archives, all (or archived: exclude, only, include)",
      });
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
        archive_at,
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
      throw new Error(`Failed to load attempts: ${result.error.message}`);
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
        archiveAt: row.archive_at ?? row.archived_at,
        archivedAt: row.archive_at ?? row.archived_at,
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
