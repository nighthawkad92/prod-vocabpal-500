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
  stageBreakdown: Array<{
    stage: 0 | 1 | 2 | 3 | 4;
    students: number;
    attempts: number;
    avgScore10: number;
  }>;
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
  attemptSource?: "student" | "qa";
  status: string;
  archivedAt?: string | null;
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
