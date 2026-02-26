export type AppMode = "student" | "teacher";
export type SessionStatus = "in_progress" | "paused" | "ended";

export type Question = {
  id: string;
  stageNo: number;
  itemNo: number;
  itemType: "mcq" | "dictation";
  promptText: string;
  options: string[] | null;
  ttsText: string | null;
  displayOrder: number;
};

export type StudentComplete = {
  attemptId: string;
  totalScore10: number;
  totalCorrect: number;
  totalWrong: number;
  stars: number;
  placementStage: number;
  instructionalNeed: string;
};

export type TeacherSummary = {
  attemptsToday: number;
  attemptsTotal: number;
  completedAttempts: number;
  avgScore10: number;
  classBreakdown: Array<{
    className: string;
    attempts: number;
    completedAttempts: number;
    inProgressAttempts: number;
    avgScore10: number;
    completionRate: number;
  }>;
};

export type TeacherWindowState = {
  hasWindow: boolean;
  status: SessionStatus;
  window: {
    id: string;
  } | null;
};

export type TeacherAttempt = {
  id: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  totalCorrect: number;
  totalWrong: number;
  totalScore10: number;
  stars: number;
  placementStage: number | null;
  student: {
    id: string | null;
    firstName: string | null;
    lastName: string | null;
    className: string | null;
  };
};

export type TeacherAttemptDetail = {
  attempt: {
    id: string;
    status: string;
    startedAt: string;
    endedAt: string | null;
    totalCorrect: number;
    totalWrong: number;
    totalScore10: number;
    stars: number;
    placementStage: number | null;
    totalResponseTimeMs: number;
    student: {
      id: string | null;
      firstName: string | null;
      lastName: string | null;
      className: string | null;
    };
  };
  responses: Array<{
    id: string;
    stageNo: number;
    itemNo: number;
    promptText: string | null;
    questionItemId: string | null;
    itemType: "mcq" | "dictation" | null;
    displayOrder: number | null;
    submittedAnswer: string;
    isCorrect: boolean;
    responseTimeMs: number;
    shownAt: string | null;
    answeredAt: string | null;
  }>;
};

export type TeacherAiIntent =
  | "class_snapshot"
  | "students_need_support"
  | "slow_questions"
  | "class_comparison"
  | "next_steps";

export type TeacherAiTimeframe = "today" | "7d" | "30d" | "all";
export type TeacherAiStatusFilter = "all" | "completed" | "in_progress";

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

export type TeacherAiRequest = {
  intent: TeacherAiIntent;
  filters: {
    className?: string;
    timeframe?: TeacherAiTimeframe;
    status?: TeacherAiStatusFilter;
    limit?: number;
  };
};

export type TeacherAiResponse = {
  requestId: string;
  intent: TeacherAiIntent;
  summary: string;
  insights: string[];
  actions: string[];
  chart: TeacherAiChartSpec;
  tableRows: TeacherAiTableRow[];
  sourceMetrics: Record<string, unknown>;
  fallbackUsed: boolean;
};
