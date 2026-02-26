import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";

import { normalizeClassName } from "./student.ts";

export const TEACHER_AI_INTENTS = [
  "class_snapshot",
  "students_need_support",
  "slow_questions",
  "class_comparison",
  "next_steps",
] as const;

export const TEACHER_AI_TIMEFRAMES = ["today", "7d", "30d", "all"] as const;

export const TEACHER_AI_STATUS = ["all", "completed", "in_progress"] as const;

export type TeacherAiIntent = typeof TEACHER_AI_INTENTS[number];
export type TeacherAiTimeframe = typeof TEACHER_AI_TIMEFRAMES[number];
export type TeacherAiStatusFilter = typeof TEACHER_AI_STATUS[number];

export type TeacherAiFilters = {
  className?: string;
  timeframe?: TeacherAiTimeframe;
  status?: TeacherAiStatusFilter;
  limit?: number;
};

export type TeacherAiFiltersNormalized = {
  className: string | null;
  timeframe: TeacherAiTimeframe;
  status: TeacherAiStatusFilter;
  limit: number;
};

export type TeacherAiChartType = "bar" | "stacked_bar" | "donut" | "trend_line";
export type TeacherAiChartUnit = "count" | "score" | "seconds" | "percent";

export type TeacherAiChartSeries = {
  label: string;
  data: number[];
};

export type TeacherAiChartSpec = {
  type: TeacherAiChartType;
  title: string;
  labels: string[];
  series: TeacherAiChartSeries[];
  yUnit?: TeacherAiChartUnit;
};

export type TeacherAiTableRow = {
  label: string;
  primary: string;
  secondary?: string;
  value: string;
  trend?: string;
};

export type TeacherAiDeterministicResult = {
  summary: string;
  insights: string[];
  actions: string[];
  chart: TeacherAiChartSpec;
  tableRows: TeacherAiTableRow[];
  sourceMetrics: Record<string, unknown>;
};

type AttemptRow = {
  id: string;
  status: string;
  total_score_10: number;
  total_correct: number;
  total_wrong: number;
  stars: number;
  started_at: string;
  ended_at: string | null;
  student_id: string;
  students: {
    first_name: string;
    last_name: string;
    classes: {
      name: string;
    } | null;
  } | null;
};

type ResponseRow = {
  id: string;
  attempt_id: string;
  is_correct: boolean;
  response_time_ms: number;
  question_items: {
    display_order: number;
    prompt_text: string;
    item_type: "mcq" | "dictation";
    stage_no: number;
  } | null;
};

type StudentAggregate = {
  studentId: string;
  fullName: string;
  className: string;
  attempts: number;
  completed: number;
  inProgress: number;
  totalScore: number;
  totalWrong: number;
  latestStartedAt: string;
};

type ClassAggregate = {
  className: string;
  attempts: number;
  completed: number;
  inProgress: number;
  totalScore: number;
};

type QuestionAggregate = {
  displayOrder: number;
  promptText: string;
  itemType: "mcq" | "dictation";
  stageNo: number;
  responseCount: number;
  correctCount: number;
  wrongCount: number;
  totalTimeMs: number;
};

type StageAggregate = {
  stageNo: number;
  responseCount: number;
  correctCount: number;
  wrongCount: number;
};

type TeacherAnalyticsDataset = {
  attempts: AttemptRow[];
  responses: ResponseRow[];
  attemptsById: Map<string, AttemptRow>;
  classAggregates: ClassAggregate[];
  studentAggregates: StudentAggregate[];
  questionAggregates: QuestionAggregate[];
  stageAggregates: StageAggregate[];
  totals: {
    attempts: number;
    completed: number;
    inProgress: number;
    avgScore10: number;
  };
};

function isIntent(value: string): value is TeacherAiIntent {
  return (TEACHER_AI_INTENTS as readonly string[]).includes(value);
}

function isTimeframe(value: string): value is TeacherAiTimeframe {
  return (TEACHER_AI_TIMEFRAMES as readonly string[]).includes(value);
}

function isStatusFilter(value: string): value is TeacherAiStatusFilter {
  return (TEACHER_AI_STATUS as readonly string[]).includes(value);
}

function toFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function sanitizeText(value: string, fallback: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.length > 0 ? trimmed : fallback;
}

function toTitleCase(value: string): string {
  if (!value) return "-";
  return value
    .split(" ")
    .filter(Boolean)
    .map((token) => token[0]?.toUpperCase() + token.slice(1).toLowerCase())
    .join(" ");
}

function asPercent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(1));
}

function asScore(value: number): number {
  return Number(value.toFixed(2));
}

function toSeconds(valueMs: number): number {
  return Number((valueMs / 1000).toFixed(1));
}

function formatStudentName(row: AttemptRow): string {
  const first = row.students?.first_name?.trim() ?? "";
  const last = row.students?.last_name?.trim() ?? "";
  const full = `${first} ${last}`.trim();
  if (full) return full;
  return `Student ${row.student_id.slice(0, 6)}`;
}

function nowMinusDaysIso(days: number): string {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() - days);
  return now.toISOString();
}

function timeframeStartIso(timeframe: TeacherAiTimeframe): string | null {
  if (timeframe === "all") return null;
  if (timeframe === "today") {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    return start.toISOString();
  }
  if (timeframe === "7d") return nowMinusDaysIso(7);
  return nowMinusDaysIso(30);
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function resolveClassId(client: SupabaseClient, className: string): Promise<string | null> {
  const normalized = normalizeClassName(className).toLowerCase();
  const result = await client
    .from("classes")
    .select("id")
    .eq("name_norm", normalized)
    .maybeSingle<{ id: string }>();

  if (result.error) {
    throw new Error(`Failed to resolve class filter: ${result.error.message}`);
  }

  return result.data?.id ?? null;
}

async function resolveStudentIdsForClass(client: SupabaseClient, classId: string): Promise<string[]> {
  const result = await client
    .from("students")
    .select("id")
    .eq("class_id", classId);

  if (result.error) {
    throw new Error(`Failed to resolve class students: ${result.error.message}`);
  }

  return (result.data ?? [])
    .map((row) => row.id)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
}

function buildAggregates(attempts: AttemptRow[], responses: ResponseRow[]): TeacherAnalyticsDataset {
  const attemptsById = new Map<string, AttemptRow>();
  const classMap = new Map<string, ClassAggregate>();
  const studentMap = new Map<string, StudentAggregate>();
  const questionMap = new Map<number, QuestionAggregate>();
  const stageMap = new Map<number, StageAggregate>();

  for (const attempt of attempts) {
    attemptsById.set(attempt.id, attempt);

    const className = attempt.students?.classes?.name ?? "Unknown";
    const classAggregate = classMap.get(className) ?? {
      className,
      attempts: 0,
      completed: 0,
      inProgress: 0,
      totalScore: 0,
    };

    classAggregate.attempts += 1;
    classAggregate.totalScore += attempt.total_score_10;
    if (attempt.status === "completed") classAggregate.completed += 1;
    if (attempt.status === "in_progress") classAggregate.inProgress += 1;
    classMap.set(className, classAggregate);

    const studentKey = attempt.student_id;
    const studentAggregate = studentMap.get(studentKey) ?? {
      studentId: attempt.student_id,
      fullName: formatStudentName(attempt),
      className,
      attempts: 0,
      completed: 0,
      inProgress: 0,
      totalScore: 0,
      totalWrong: 0,
      latestStartedAt: attempt.started_at,
    };

    studentAggregate.attempts += 1;
    studentAggregate.totalScore += attempt.total_score_10;
    studentAggregate.totalWrong += attempt.total_wrong;
    if (attempt.status === "completed") studentAggregate.completed += 1;
    if (attempt.status === "in_progress") studentAggregate.inProgress += 1;
    if (Date.parse(attempt.started_at) > Date.parse(studentAggregate.latestStartedAt)) {
      studentAggregate.latestStartedAt = attempt.started_at;
    }
    studentMap.set(studentKey, studentAggregate);
  }

  for (const response of responses) {
    const question = response.question_items;
    if (!question) continue;

    const currentQuestion = questionMap.get(question.display_order) ?? {
      displayOrder: question.display_order,
      promptText: question.prompt_text,
      itemType: question.item_type,
      stageNo: question.stage_no,
      responseCount: 0,
      correctCount: 0,
      wrongCount: 0,
      totalTimeMs: 0,
    };

    currentQuestion.responseCount += 1;
    currentQuestion.totalTimeMs += response.response_time_ms;
    if (response.is_correct) {
      currentQuestion.correctCount += 1;
    } else {
      currentQuestion.wrongCount += 1;
    }
    questionMap.set(question.display_order, currentQuestion);

    const currentStage = stageMap.get(question.stage_no) ?? {
      stageNo: question.stage_no,
      responseCount: 0,
      correctCount: 0,
      wrongCount: 0,
    };

    currentStage.responseCount += 1;
    if (response.is_correct) {
      currentStage.correctCount += 1;
    } else {
      currentStage.wrongCount += 1;
    }
    stageMap.set(question.stage_no, currentStage);
  }

  const totals = {
    attempts: attempts.length,
    completed: attempts.filter((attempt) => attempt.status === "completed").length,
    inProgress: attempts.filter((attempt) => attempt.status === "in_progress").length,
    avgScore10: attempts.length
      ? asScore(attempts.reduce((sum, attempt) => sum + attempt.total_score_10, 0) / attempts.length)
      : 0,
  };

  return {
    attempts,
    responses,
    attemptsById,
    classAggregates: Array.from(classMap.values()).sort((a, b) => a.className.localeCompare(b.className)),
    studentAggregates: Array.from(studentMap.values()).sort((a, b) => a.fullName.localeCompare(b.fullName)),
    questionAggregates: Array.from(questionMap.values()).sort((a, b) => a.displayOrder - b.displayOrder),
    stageAggregates: Array.from(stageMap.values()).sort((a, b) => a.stageNo - b.stageNo),
    totals,
  };
}

export function parseTeacherAiIntent(value: unknown): TeacherAiIntent {
  if (typeof value !== "string") {
    throw new Error("intent is required");
  }

  const normalized = value.trim();
  if (!isIntent(normalized)) {
    throw new Error("intent must be one of class_snapshot, students_need_support, slow_questions, class_comparison, next_steps");
  }
  return normalized;
}

export function normalizeTeacherAiFilters(value: unknown): TeacherAiFiltersNormalized {
  const input = value && typeof value === "object" ? (value as TeacherAiFilters) : {};

  const className = typeof input.className === "string" ? input.className.trim() : "";
  const timeframeRaw = typeof input.timeframe === "string" ? input.timeframe.trim() : "7d";
  const statusRaw = typeof input.status === "string" ? input.status.trim() : "all";
  const limitRaw = toFiniteNumber(input.limit, 5);

  const timeframe = isTimeframe(timeframeRaw) ? timeframeRaw : "7d";
  const status = isStatusFilter(statusRaw) ? statusRaw : "all";
  const limit = clampInt(limitRaw, 3, 10);

  return {
    className: className.length > 0 && className.toLowerCase() !== "all" ? normalizeClassName(className) : null,
    timeframe,
    status,
    limit,
  };
}

export async function loadTeacherAnalyticsDataset(
  client: SupabaseClient,
  testId: string,
  filters: TeacherAiFiltersNormalized,
): Promise<TeacherAnalyticsDataset> {
  let classStudentIds: string[] | null = null;

  if (filters.className) {
    const classId = await resolveClassId(client, filters.className);
    if (!classId) {
      return buildAggregates([], []);
    }
    classStudentIds = await resolveStudentIdsForClass(client, classId);
    if (classStudentIds.length === 0) {
      return buildAggregates([], []);
    }
  }

  let attemptsQuery = client
    .from("attempts")
    .select(`
      id,
      status,
      total_score_10,
      total_correct,
      total_wrong,
      stars,
      started_at,
      ended_at,
      student_id,
      students!inner(
        first_name,
        last_name,
        classes!inner(
          name
        )
      )
    `)
    .eq("test_id", testId)
    .order("started_at", { ascending: false });

  const sinceIso = timeframeStartIso(filters.timeframe);
  if (sinceIso) {
    attemptsQuery = attemptsQuery.gte("started_at", sinceIso);
  }
  if (filters.status !== "all") {
    attemptsQuery = attemptsQuery.eq("status", filters.status);
  }
  if (classStudentIds) {
    attemptsQuery = attemptsQuery.in("student_id", classStudentIds);
  }

  const attemptsResult = await attemptsQuery;
  if (attemptsResult.error) {
    throw new Error(`Failed to load attempts for AI analytics: ${attemptsResult.error.message}`);
  }

  const attempts = (attemptsResult.data ?? []) as AttemptRow[];
  if (attempts.length === 0) {
    return buildAggregates([], []);
  }

  const attemptIds = attempts.map((attempt) => attempt.id);
  const responseChunks = chunk(attemptIds, 100);
  const responses: ResponseRow[] = [];

  for (const attemptChunk of responseChunks) {
    const responseResult = await client
      .from("responses")
      .select(`
        id,
        attempt_id,
        is_correct,
        response_time_ms,
        question_items!inner(
          display_order,
          prompt_text,
          item_type,
          stage_no
        )
      `)
      .in("attempt_id", attemptChunk);

    if (responseResult.error) {
      throw new Error(`Failed to load responses for AI analytics: ${responseResult.error.message}`);
    }

    responses.push(...((responseResult.data ?? []) as ResponseRow[]));
  }

  return buildAggregates(attempts, responses);
}

function instructionNeedFromStage(stageNo: number): string {
  switch (stageNo) {
    case 0:
      return "Phonics and sound matching";
    case 1:
      return "Word reading and decoding";
    case 2:
      return "Sentence fluency";
    case 3:
      return "Paragraph comprehension";
    case 4:
      return "Inference and expression";
    default:
      return "Core vocabulary practice";
  }
}

function withDefaultDeterministicSource(
  filters: TeacherAiFiltersNormalized,
  dataset: TeacherAnalyticsDataset,
): Record<string, unknown> {
  return {
    filters: {
      className: filters.className,
      timeframe: filters.timeframe,
      status: filters.status,
      limit: filters.limit,
    },
    totals: dataset.totals,
    classCount: dataset.classAggregates.length,
    responseCount: dataset.responses.length,
  };
}

function buildClassSnapshot(
  filters: TeacherAiFiltersNormalized,
  dataset: TeacherAnalyticsDataset,
): TeacherAiDeterministicResult {
  const sourceBase = withDefaultDeterministicSource(filters, dataset);

  if (dataset.totals.attempts === 0) {
    return {
      summary: "No attempts match the current filters yet.",
      insights: [
        "Try removing class or status filters to expand the view.",
        "Once students submit responses, this panel will summarize score and completion trends.",
      ],
      actions: [
        "Set baseline to In Progress and invite a class to start attempts.",
      ],
      chart: {
        type: "bar",
        title: "No attempt data",
        labels: ["Attempts"],
        series: [{ label: "Count", data: [0] }],
        yUnit: "count",
      },
      tableRows: [],
      sourceMetrics: sourceBase,
    };
  }

  const classRows = [...dataset.classAggregates]
    .sort((a, b) => b.attempts - a.attempts)
    .slice(0, filters.limit);

  const completionRate = asPercent(dataset.totals.completed, dataset.totals.attempts);

  return {
    summary: `Across ${dataset.totals.attempts} attempts, average score is ${dataset.totals.avgScore10}/10 and completion is ${completionRate}%.`,
    insights: [
      `${dataset.totals.completed} attempts are completed and ${dataset.totals.inProgress} are still in progress.`,
      `${classRows.length > 0 ? classRows[0].className : "No class"} has the highest visible attempt volume right now.`,
    ],
    actions: [
      "Focus support on classes with low average score before opening a new baseline cycle.",
      "Use In Progress counts to identify classes needing in-class completion reminders.",
    ],
    chart: {
      type: "bar",
      title: "Average score by class",
      labels: classRows.map((row) => row.className),
      series: [
        {
          label: "Avg score",
          data: classRows.map((row) => asScore(row.totalScore / Math.max(row.attempts, 1))),
        },
      ],
      yUnit: "score",
    },
    tableRows: classRows.map((row) => ({
      label: row.className,
      primary: `${row.attempts} attempts`,
      secondary: `${row.completed} completed · ${row.inProgress} in progress`,
      value: `${asScore(row.totalScore / Math.max(row.attempts, 1))}/10`,
      trend: `${asPercent(row.completed, row.attempts)}% completion`,
    })),
    sourceMetrics: {
      ...sourceBase,
      completionRate,
    },
  };
}

function buildStudentsNeedSupport(
  filters: TeacherAiFiltersNormalized,
  dataset: TeacherAnalyticsDataset,
): TeacherAiDeterministicResult {
  const sourceBase = withDefaultDeterministicSource(filters, dataset);

  const ranked = dataset.studentAggregates
    .map((student) => ({
      ...student,
      avgScore: asScore(student.totalScore / Math.max(student.attempts, 1)),
    }))
    .sort((a, b) => {
      if (a.avgScore !== b.avgScore) return a.avgScore - b.avgScore;
      if (a.totalWrong !== b.totalWrong) return b.totalWrong - a.totalWrong;
      return a.fullName.localeCompare(b.fullName);
    })
    .slice(0, filters.limit);

  if (ranked.length === 0) {
    return {
      summary: "No student-level data is available for the selected filters.",
      insights: ["Student support ranking appears after attempts are submitted."],
      actions: ["Collect more attempts before using support prioritization."],
      chart: {
        type: "bar",
        title: "Students needing support",
        labels: ["No data"],
        series: [{ label: "Avg score", data: [0] }],
        yUnit: "score",
      },
      tableRows: [],
      sourceMetrics: sourceBase,
    };
  }

  const averageOfRanked = asScore(
    ranked.reduce((sum, item) => sum + item.avgScore, 0) / ranked.length,
  );

  return {
    summary: `Priority support list highlights ${ranked.length} students with average score around ${averageOfRanked}/10.`,
    insights: [
      "Students are ranked by lower average score first, then higher wrong-answer count.",
      `${ranked[0].fullName} currently needs the earliest intervention in this filtered view.`,
    ],
    actions: [
      "Run 1:1 or small-group review for the first three students in the list.",
      "Use dictation-heavy remediation where wrong-answer counts are high.",
    ],
    chart: {
      type: "bar",
      title: "Support priority (average score)",
      labels: ranked.map((item) => item.fullName),
      series: [{ label: "Avg score", data: ranked.map((item) => item.avgScore) }],
      yUnit: "score",
    },
    tableRows: ranked.map((item) => ({
      label: item.fullName,
      primary: item.className,
      secondary: `${item.attempts} attempts · ${item.totalWrong} wrong answers`,
      value: `${item.avgScore}/10`,
      trend: item.inProgress > 0 ? `${item.inProgress} in progress` : "Ready for review",
    })),
    sourceMetrics: {
      ...sourceBase,
      rankedStudents: ranked.length,
      rankedAverageScore: averageOfRanked,
    },
  };
}

function buildSlowQuestions(
  filters: TeacherAiFiltersNormalized,
  dataset: TeacherAnalyticsDataset,
): TeacherAiDeterministicResult {
  const sourceBase = withDefaultDeterministicSource(filters, dataset);

  const ranked = dataset.questionAggregates
    .map((question) => ({
      ...question,
      avgTimeMs: question.responseCount ? question.totalTimeMs / question.responseCount : 0,
      wrongRate: asPercent(question.wrongCount, question.responseCount),
    }))
    .sort((a, b) => b.avgTimeMs - a.avgTimeMs)
    .slice(0, filters.limit);

  if (ranked.length === 0) {
    return {
      summary: "No question response data is available yet.",
      insights: ["Question speed analytics will appear after students answer questions."],
      actions: ["Collect completed attempts to identify slow questions."],
      chart: {
        type: "bar",
        title: "Slowest questions",
        labels: ["No data"],
        series: [{ label: "Avg time (sec)", data: [0] }],
        yUnit: "seconds",
      },
      tableRows: [],
      sourceMetrics: sourceBase,
    };
  }

  return {
    summary: `The slowest question currently averages ${toSeconds(ranked[0].avgTimeMs)} seconds per response.`,
    insights: [
      "Slow questions usually combine longer response time with higher wrong-answer rates.",
      `Q${ranked[0].displayOrder} shows the highest response time in this filter scope.`,
    ],
    actions: [
      "Pre-teach vocabulary for the top two slow questions before the next baseline cycle.",
      "Model one solved example before independent student responses.",
    ],
    chart: {
      type: "bar",
      title: "Average time by question",
      labels: ranked.map((question) => `Q${question.displayOrder}`),
      series: [{ label: "Avg time (sec)", data: ranked.map((question) => toSeconds(question.avgTimeMs)) }],
      yUnit: "seconds",
    },
    tableRows: ranked.map((question) => ({
      label: `Q${question.displayOrder}`,
      primary: sanitizeText(question.promptText, `Question ${question.displayOrder}`),
      secondary: `${toTitleCase(question.itemType)} · Stage ${question.stageNo}`,
      value: `${toSeconds(question.avgTimeMs)} sec`,
      trend: `${question.wrongRate}% wrong`,
    })),
    sourceMetrics: {
      ...sourceBase,
      topQuestion: ranked[0].displayOrder,
      topQuestionAvgSeconds: toSeconds(ranked[0].avgTimeMs),
    },
  };
}

function buildClassComparison(
  filters: TeacherAiFiltersNormalized,
  dataset: TeacherAnalyticsDataset,
): TeacherAiDeterministicResult {
  const sourceBase = withDefaultDeterministicSource(filters, dataset);

  const classRows = [...dataset.classAggregates]
    .sort((a, b) => b.attempts - a.attempts)
    .slice(0, filters.limit);

  if (classRows.length === 0) {
    return {
      summary: "No class-level attempt data is available for comparison.",
      insights: ["Class comparison appears when attempts are present."],
      actions: ["Collect attempts from at least one class to unlock this view."],
      chart: {
        type: "stacked_bar",
        title: "Class comparison",
        labels: ["No data"],
        series: [
          { label: "Completed", data: [0] },
          { label: "In Progress", data: [0] },
        ],
        yUnit: "count",
      },
      tableRows: [],
      sourceMetrics: sourceBase,
    };
  }

  const bestClass = [...classRows]
    .sort((a, b) => (b.totalScore / Math.max(b.attempts, 1)) - (a.totalScore / Math.max(a.attempts, 1)))[0];

  return {
    summary: `Class comparison includes ${classRows.length} classes with visible attempts in the current filter.`,
    insights: [
      `${bestClass.className} has the highest average score in this snapshot.`,
      "Compare completion and in-progress counts together before prioritizing teaching support.",
    ],
    actions: [
      "Prioritize classes with high in-progress counts for completion push.",
      "Review teaching strategy in classes with lower average score and high attempt volume.",
    ],
    chart: {
      type: "stacked_bar",
      title: "Completion vs In Progress by class",
      labels: classRows.map((row) => row.className),
      series: [
        { label: "Completed", data: classRows.map((row) => row.completed) },
        { label: "In Progress", data: classRows.map((row) => row.inProgress) },
      ],
      yUnit: "count",
    },
    tableRows: classRows.map((row) => {
      const avgScore = asScore(row.totalScore / Math.max(row.attempts, 1));
      return {
        label: row.className,
        primary: `${row.attempts} attempts`,
        secondary: `${row.completed} completed · ${row.inProgress} in progress`,
        value: `${avgScore}/10`,
        trend: `${asPercent(row.completed, row.attempts)}% completion`,
      };
    }),
    sourceMetrics: {
      ...sourceBase,
      comparedClasses: classRows.length,
      bestClass: bestClass.className,
    },
  };
}

function buildNextSteps(
  filters: TeacherAiFiltersNormalized,
  dataset: TeacherAnalyticsDataset,
): TeacherAiDeterministicResult {
  const sourceBase = withDefaultDeterministicSource(filters, dataset);

  const stageRanks = [...dataset.stageAggregates]
    .map((stage) => ({
      ...stage,
      accuracy: asPercent(stage.correctCount, stage.responseCount),
    }))
    .sort((a, b) => a.accuracy - b.accuracy);

  const weakestStage = stageRanks[0] ?? null;

  const recentAttempts = [...dataset.attempts]
    .sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at))
    .slice(-Math.max(filters.limit, 6));

  const trendLabels = recentAttempts.map((attempt, index) => {
    const date = new Date(attempt.started_at);
    const short = Number.isNaN(date.getTime()) ? `${index + 1}` : `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
    return short;
  });

  const trendData = recentAttempts.map((attempt) => attempt.total_score_10);

  const dictationResponses = dataset.questionAggregates
    .filter((question) => question.itemType === "dictation")
    .reduce(
      (acc, question) => {
        acc.total += question.responseCount;
        acc.correct += question.correctCount;
        return acc;
      },
      { total: 0, correct: 0 },
    );

  const dictationAccuracy = asPercent(dictationResponses.correct, dictationResponses.total);

  const topSlow = [...dataset.questionAggregates]
    .map((question) => ({
      ...question,
      avgTimeMs: question.responseCount ? question.totalTimeMs / question.responseCount : 0,
    }))
    .sort((a, b) => b.avgTimeMs - a.avgTimeMs)[0] ?? null;

  return {
    summary: weakestStage
      ? `Stage ${weakestStage.stageNo} needs the earliest teaching attention in the current data window.`
      : "No stage-level response data is available yet.",
    insights: [
      weakestStage
        ? `Current stage accuracy is ${weakestStage.accuracy}% for Stage ${weakestStage.stageNo}.`
        : "Run a few more attempts to generate stage-wise accuracy.",
      `Dictation accuracy is ${dictationAccuracy}% across visible responses.`,
    ],
    actions: [
      weakestStage
        ? `Focus next lesson on ${instructionNeedFromStage(weakestStage.stageNo)}.`
        : "Start with mixed phonics and vocabulary warm-up.",
      topSlow
        ? `Pre-teach vocabulary from Q${topSlow.displayOrder} before the next practice set.`
        : "Review one slow question verbally before written response.",
    ],
    chart: {
      type: "trend_line",
      title: "Recent score trend",
      labels: trendLabels.length > 0 ? trendLabels : ["No data"],
      series: [{ label: "Score", data: trendData.length > 0 ? trendData : [0] }],
      yUnit: "score",
    },
    tableRows: [
      {
        label: "Priority stage",
        primary: weakestStage ? `Stage ${weakestStage.stageNo}` : "-",
        secondary: weakestStage ? instructionNeedFromStage(weakestStage.stageNo) : "No stage data",
        value: weakestStage ? `${weakestStage.accuracy}% accuracy` : "-",
      },
      {
        label: "Dictation performance",
        primary: "Dictation accuracy",
        value: `${dictationAccuracy}%`,
        trend: `${dictationResponses.total} responses`,
      },
      {
        label: "Slowest question",
        primary: topSlow ? `Q${topSlow.displayOrder}` : "-",
        secondary: topSlow ? sanitizeText(topSlow.promptText, "") : "No question data",
        value: topSlow ? `${toSeconds(topSlow.avgTimeMs)} sec avg` : "-",
      },
    ],
    sourceMetrics: {
      ...sourceBase,
      weakestStage: weakestStage?.stageNo ?? null,
      weakestStageAccuracy: weakestStage?.accuracy ?? null,
      dictationAccuracy,
      trendPoints: trendData.length,
    },
  };
}

export function buildTeacherAiDeterministicResult(
  intent: TeacherAiIntent,
  filters: TeacherAiFiltersNormalized,
  dataset: TeacherAnalyticsDataset,
): TeacherAiDeterministicResult {
  switch (intent) {
    case "class_snapshot":
      return buildClassSnapshot(filters, dataset);
    case "students_need_support":
      return buildStudentsNeedSupport(filters, dataset);
    case "slow_questions":
      return buildSlowQuestions(filters, dataset);
    case "class_comparison":
      return buildClassComparison(filters, dataset);
    case "next_steps":
      return buildNextSteps(filters, dataset);
    default:
      return buildClassSnapshot(filters, dataset);
  }
}

function isValidChartType(value: string): value is TeacherAiChartType {
  return value === "bar" || value === "stacked_bar" || value === "donut" || value === "trend_line";
}

function isValidChartUnit(value: string): value is TeacherAiChartUnit {
  return value === "count" || value === "score" || value === "seconds" || value === "percent";
}

export function sanitizeChartSpec(input: unknown, fallback: TeacherAiChartSpec): TeacherAiChartSpec {
  if (!input || typeof input !== "object") {
    return fallback;
  }

  const record = input as Record<string, unknown>;
  const type = typeof record.type === "string" && isValidChartType(record.type) ? record.type : fallback.type;
  const title = typeof record.title === "string"
    ? sanitizeText(record.title, fallback.title)
    : fallback.title;

  const labels = Array.isArray(record.labels)
    ? record.labels
      .filter((label): label is string => typeof label === "string")
      .map((label) => sanitizeText(label, "-"))
      .slice(0, 12)
    : fallback.labels;

  const series = Array.isArray(record.series)
    ? record.series
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map((item) => ({
        label: sanitizeText(typeof item.label === "string" ? item.label : "Series", "Series"),
        data: Array.isArray(item.data)
          ? item.data
            .map((value) => toFiniteNumber(value, 0))
            .map((value) => Number(value.toFixed(2)))
            .slice(0, 12)
          : [],
      }))
      .filter((item) => item.data.length > 0)
      .slice(0, 4)
    : fallback.series;

  const yUnit = typeof record.yUnit === "string" && isValidChartUnit(record.yUnit)
    ? record.yUnit
    : fallback.yUnit;

  if (labels.length === 0 || series.length === 0) {
    return fallback;
  }

  const alignedSeries = series.map((item) => ({
    ...item,
    data: labels.map((_, index) => item.data[index] ?? 0),
  }));

  return {
    type,
    title,
    labels,
    series: alignedSeries,
    yUnit,
  };
}

function sanitizeStringArray(input: unknown, fallback: string[]): string[] {
  if (!Array.isArray(input)) return fallback;
  const values = input
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => sanitizeText(entry, ""))
    .filter((entry) => entry.length > 0)
    .slice(0, 6);
  return values.length > 0 ? values : fallback;
}

function sanitizeTableRows(input: unknown, fallback: TeacherAiTableRow[]): TeacherAiTableRow[] {
  if (!Array.isArray(input)) return fallback;

  const rows = input
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
    .map((row) => {
      const label = sanitizeText(typeof row.label === "string" ? row.label : "-", "-");
      const primary = sanitizeText(typeof row.primary === "string" ? row.primary : "-", "-");
      const secondary = typeof row.secondary === "string" ? sanitizeText(row.secondary, "") : undefined;
      const value = sanitizeText(typeof row.value === "string" ? row.value : "-", "-");
      const trend = typeof row.trend === "string" ? sanitizeText(row.trend, "") : undefined;

      return {
        label,
        primary,
        secondary: secondary && secondary.length > 0 ? secondary : undefined,
        value,
        trend: trend && trend.length > 0 ? trend : undefined,
      };
    })
    .slice(0, 10);

  return rows.length > 0 ? rows : fallback;
}

export function mergeTeacherAiLanguagePatch(
  deterministic: TeacherAiDeterministicResult,
  patch: unknown,
): TeacherAiDeterministicResult {
  if (!patch || typeof patch !== "object") {
    return deterministic;
  }

  const record = patch as Record<string, unknown>;
  const summary = typeof record.summary === "string"
    ? sanitizeText(record.summary, deterministic.summary)
    : deterministic.summary;

  const insights = sanitizeStringArray(record.insights, deterministic.insights);
  const actions = sanitizeStringArray(record.actions, deterministic.actions);
  const chart = sanitizeChartSpec(record.chart, deterministic.chart);
  const tableRows = sanitizeTableRows(record.tableRows, deterministic.tableRows);

  return {
    ...deterministic,
    summary,
    insights,
    actions,
    chart,
    tableRows,
  };
}

export function assertTeacherAiResponseShape(payload: {
  requestId: string;
  intent: TeacherAiIntent;
  summary: string;
  insights: string[];
  actions: string[];
  chart: TeacherAiChartSpec;
  tableRows: TeacherAiTableRow[];
  sourceMetrics: Record<string, unknown>;
  fallbackUsed: boolean;
}): void {
  if (!payload.requestId || typeof payload.requestId !== "string") {
    throw new Error("Invalid AI response: requestId is required");
  }
  if (!isIntent(payload.intent)) {
    throw new Error("Invalid AI response: intent is invalid");
  }
  if (!payload.summary || payload.summary.trim().length === 0) {
    throw new Error("Invalid AI response: summary is required");
  }
  if (!Array.isArray(payload.insights) || payload.insights.length === 0) {
    throw new Error("Invalid AI response: insights are required");
  }
  if (!Array.isArray(payload.actions) || payload.actions.length === 0) {
    throw new Error("Invalid AI response: actions are required");
  }

  const chart = sanitizeChartSpec(payload.chart, payload.chart);
  if (!chart.labels.length || !chart.series.length) {
    throw new Error("Invalid AI response: chart is invalid");
  }
}
