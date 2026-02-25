import "@supabase/functions-js/edge-runtime.d.ts";

import { createAdminClient, handleOptions, json, requireTeacherSession } from "../_shared/auth.ts";
import { normalizeClassName } from "../_shared/student.ts";

type AttemptSummaryRow = {
  id: string;
  status: string;
  total_score_10: number;
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
    const dateFrom = url.searchParams.get("dateFrom");
    const dateTo = url.searchParams.get("dateTo");

    let query = client.from("attempts").select(`
      id,
      status,
      total_score_10,
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

    if (dateFrom) query = query.gte("started_at", dateFrom);
    if (dateTo) query = query.lte("started_at", dateTo);

    const result = await query;
    if (result.error) {
      throw new Error(`Failed to load dashboard summary data: ${result.error.message}`);
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
