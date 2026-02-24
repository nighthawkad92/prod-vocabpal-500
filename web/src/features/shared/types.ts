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
  classBreakdown: Array<{ className: string; attempts: number; avgScore10: number }>;
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
    submittedAnswer: string;
    isCorrect: boolean;
    responseTimeMs: number;
  }>;
};
