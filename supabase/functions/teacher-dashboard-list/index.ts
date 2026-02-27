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

function clampLimit(value: number): number {
  if (!Number.isFinite(value)) return 25;
  return Math.max(1, Math.min(100, Math.trunc(value)));
}

function clampOffset(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

function escapeLike(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/,/g, "\\,");
}

function parseSourceFilter(value: string): "student" | "qa" | "all" {
  if (value === "all") return "all";
  if (value === "qa") return "qa";
  return "student";
}

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

function parseStageFilter(value: string): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0 || parsed > 4) return null;
  return Math.trunc(parsed);
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
    const search = (url.searchParams.get("search") ?? "").trim();
    const source = parseSourceFilter((url.searchParams.get("source") ?? "student").trim().toLowerCase());
    const archiveFilter = parseArchiveFilter(url.searchParams.get("archive"), url.searchParams.get("archived"));
    const stageRaw = (url.searchParams.get("stage") ?? "").trim();
    const stage = parseStageFilter(stageRaw);
    const limit = clampLimit(Number(url.searchParams.get("limit") ?? "25"));
    const offset = clampOffset(Number(url.searchParams.get("offset") ?? "0"));
    if (archiveFilter === null) {
      return json(req, 400, {
        error: "archive must be one of: active, archives, all (or archived: exclude, only, include)",
      });
    }
    if (stageRaw && stage === null) {
      return json(req, 400, { error: "stage must be an integer between 0 and 4" });
    }

    let totalCountQuery = client
      .from("attempts")
      .select("id", { count: "exact", head: true });

    if (source !== "all") {
      totalCountQuery = totalCountQuery.eq("attempt_source", source);
    }
    totalCountQuery = applyArchiveFilter(totalCountQuery, archiveFilter);
    if (status) {
      totalCountQuery = totalCountQuery.eq("status", status);
    }
    if (stage !== null) {
      totalCountQuery = totalCountQuery
        .eq("status", "completed")
        .eq("placement_stage", stage);
    }

    const totalCountResult = await totalCountQuery;
    if (totalCountResult.error) {
      throw new Error(`Failed to count attempts: ${totalCountResult.error.message}`);
    }

    let studentIds: string[] | null = null;
    if (className || search) {
      let classId: string | null = null;
      if (className) {
        const classNorm = normalizeClassName(className).toLowerCase();
        const classResult = await client
          .from("classes")
          .select("id")
          .eq("name_norm", classNorm)
          .maybeSingle<{ id: string }>();
        if (classResult.error) {
          throw new Error(`Failed to resolve class filter: ${classResult.error.message}`);
        }
        classId = classResult.data?.id ?? null;
        if (!classId) {
          return json(req, 200, {
            totalCount: totalCountResult.count ?? 0,
            filteredCount: 0,
            count: 0,
            limit,
            offset,
            page: Math.floor(offset / limit) + 1,
            totalPages: 0,
            attempts: [],
          });
        }
      }

      let studentQuery = client
        .from("students")
        .select("id");

      if (classId) {
        studentQuery = studentQuery.eq("class_id", classId);
      }

      if (search) {
        const searchLike = escapeLike(search);
        studentQuery = studentQuery.or(
          `first_name.ilike.%${searchLike}%,last_name.ilike.%${searchLike}%`,
        );
      }

      const studentResult = await studentQuery;
      if (studentResult.error) {
        throw new Error(`Failed to resolve student filters: ${studentResult.error.message}`);
      }

      studentIds = (studentResult.data ?? [])
        .map((row) => row.id)
        .filter((value): value is string => typeof value === "string");

      if (studentIds.length === 0) {
        return json(req, 200, {
          totalCount: totalCountResult.count ?? 0,
          filteredCount: 0,
          count: 0,
          limit,
          offset,
          page: Math.floor(offset / limit) + 1,
          totalPages: 0,
          attempts: [],
        });
      }
    }

    let filteredCountQuery = client
      .from("attempts")
      .select("id", { count: "exact", head: true });

    if (source !== "all") {
      filteredCountQuery = filteredCountQuery.eq("attempt_source", source);
    }
    filteredCountQuery = applyArchiveFilter(filteredCountQuery, archiveFilter);
    if (status) {
      filteredCountQuery = filteredCountQuery.eq("status", status);
    }
    if (stage !== null) {
      filteredCountQuery = filteredCountQuery
        .eq("status", "completed")
        .eq("placement_stage", stage);
    }
    if (studentIds) {
      filteredCountQuery = filteredCountQuery.in("student_id", studentIds);
    }

    const filteredCountResult = await filteredCountQuery;
    if (filteredCountResult.error) {
      throw new Error(`Failed to count filtered attempts: ${filteredCountResult.error.message}`);
    }

    const filteredCount = filteredCountResult.count ?? 0;
    const page = Math.floor(offset / limit) + 1;
    const totalPages = filteredCount === 0 ? 0 : Math.ceil(filteredCount / limit);

    if (filteredCount === 0 || offset >= filteredCount) {
      return json(req, 200, {
        totalCount: totalCountResult.count ?? 0,
        filteredCount,
        count: 0,
        limit,
        offset,
        page,
        totalPages,
        attempts: [],
      });
    }

    let dataQuery = client
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
      dataQuery = dataQuery.eq("status", status);
    }
    if (source !== "all") {
      dataQuery = dataQuery.eq("attempt_source", source);
    }
    dataQuery = applyArchiveFilter(dataQuery, archiveFilter);
    if (stage !== null) {
      dataQuery = dataQuery
        .eq("status", "completed")
        .eq("placement_stage", stage);
    }
    if (studentIds) {
      dataQuery = dataQuery.in("student_id", studentIds);
    }

    const result = await dataQuery;
    if (result.error) {
      throw new Error(`Failed to load attempts: ${result.error.message}`);
    }

    const rows = (result.data ?? []) as AttemptRow[];

    return json(req, 200, {
      totalCount: totalCountResult.count ?? 0,
      filteredCount,
      count: rows.length,
      limit,
      offset,
      page,
      totalPages,
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
