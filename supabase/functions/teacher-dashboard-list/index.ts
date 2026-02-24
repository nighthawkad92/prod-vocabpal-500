import "@supabase/functions-js/edge-runtime.d.ts";

import { createAdminClient, handleOptions, json, requireTeacherSession } from "../_shared/auth.ts";
import { normalizeClassName } from "../_shared/student.ts";

type AttemptRow = {
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
    const limit = Number(url.searchParams.get("limit") ?? "100");
    const offset = Number(url.searchParams.get("offset") ?? "0");

    let query = client
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
      .order("started_at", { ascending: false })
      .range(offset, offset + Math.max(limit - 1, 0));

    if (status) {
      query = query.eq("status", status);
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
        startedAt: row.started_at,
        endedAt: row.ended_at,
        totalCorrect: row.total_correct,
        totalWrong: row.total_wrong,
        totalScore10: row.total_score_10,
        stars: row.stars,
        placementStage: row.placement_stage,
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
