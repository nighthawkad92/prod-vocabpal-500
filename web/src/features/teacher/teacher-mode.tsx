import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MotionButton } from "@/components/motion-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import type { MotionPolicy } from "@/hooks/use-motion-policy";
import type {
  SessionStatus,
  TeacherAttempt,
  TeacherAttemptDetail,
  TeacherSummary,
  TeacherWindowState,
} from "@/features/shared/types";
import { ApiError, callFunction } from "@/lib/env";
import { formatDurationMs, formatSessionStatus } from "@/lib/format";
import type { SfxEvent } from "@/lib/sfx";
import { cn } from "@/lib/utils";
import logoVocabPal from "@/assets/branding/logo-vocabpal.png";
import archiveIcon from "@/assets/icons/archive.svg";
import arrowLeftIcon from "@/assets/icons/arrow-left.svg";
import arrowRightIcon from "@/assets/icons/arrow-right.svg";
import cancelIcon from "@/assets/icons/cancel.svg";
import checkSquareIcon from "@/assets/icons/check-square.svg";
import filterIcon from "@/assets/icons/filter.svg";
import pauseIcon from "@/assets/icons/pause.svg";
import playIcon from "@/assets/icons/play.svg";
import refreshIcon from "@/assets/icons/refresh.svg";
import signoutIcon from "@/assets/icons/signout.svg";
import closeIcon from "@/assets/icons/times.svg";

const TOKEN_KEY = "vocabpal.teacher.token";
const ARCHIVE_CONFIRMATION_MESSAGE =
  "Archiving this attempt will reopen the baseline test for this student. Do you want to continue?";
const RESTORE_CONFIRMATION_MESSAGE = "Restoring this attempt will move it back to active attempts. Continue?";
const ATTEMPTS_PAGE_SIZE = 25;
const MOBILE_BREAKPOINT_QUERY = "(max-width: 768px)";
type AttemptListView = "active" | "archives";

type TeacherModeProps = {
  motionPolicy: MotionPolicy;
  playSound: (event: SfxEvent, options?: { fromInteraction?: boolean }) => Promise<boolean>;
  onAuthStateChange?: (active: boolean) => void;
};

type WindowMutationResponse = {
  status: SessionStatus;
  usedLatest?: boolean;
  window: {
    id: string;
  };
};

type TeacherAttemptListResponse = {
  totalCount: number;
  filteredCount: number;
  count: number;
  limit: number;
  offset: number;
  page: number;
  totalPages: number;
  attempts: TeacherAttempt[];
};

type AttemptMutationResponse = {
  movedToArchives?: boolean;
  movedToArchivesCount?: number;
  movedToArchiveAttemptIds?: string[];
  restoredFromArchives?: boolean;
  restoredFromArchivesCount?: number;
  restoredFromArchiveAttemptIds?: string[];
  archived?: boolean;
  restored?: boolean;
  reopened?: boolean;
  archivedCount?: number;
  restoredCount?: number;
  students: Array<{
    firstName: string | null;
    lastName: string | null;
  }>;
};

const cardMotion = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
};

function formatDateOnly(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

function formatTimeOnly(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDateTimeCompact(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function parseClassSection(className: string | null): { classLabel: string; sectionLabel: string } {
  if (!className) {
    return { classLabel: "-", sectionLabel: "-" };
  }

  const parts = className.split("-").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return {
      classLabel: parts[0],
      sectionLabel: parts.slice(1).join(" - "),
    };
  }

  return { classLabel: className, sectionLabel: "-" };
}

function instructionalNeedFromStage(stage: number | null): string {
  switch (stage) {
    case 0:
      return "Phonics + Sound Work";
    case 1:
      return "Word Reading Practice";
    case 2:
      return "Sentence Fluency";
    case 3:
      return "Paragraph + Vocabulary";
    case 4:
      return "Inference + Expression";
    default:
      return "-";
  }
}

function isTeacherSessionError(error: unknown): boolean {
  if (error instanceof ApiError && error.status === 401) {
    return true;
  }
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("invalid or expired teacher session") ||
    message.includes("missing teacher session token")
  );
}

export function TeacherMode({
  motionPolicy,
  playSound,
  onAuthStateChange,
}: TeacherModeProps) {
  const [fullName, setFullName] = useState("");
  const [passcode, setPasscode] = useState("");
  const [token, setToken] = useState(localStorage.getItem(TOKEN_KEY));
  const [summary, setSummary] = useState<TeacherSummary | null>(null);
  const [windowState, setWindowState] = useState<TeacherWindowState | null>(null);
  const [attempts, setAttempts] = useState<TeacherAttempt[]>([]);
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);
  const [selectedAttemptIds, setSelectedAttemptIds] = useState<string[]>([]);
  const [detail, setDetail] = useState<TeacherAttemptDetail | null>(null);
  const [searchText, setSearchText] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState<"all" | "0" | "1" | "2" | "3" | "4">("all");
  const [attemptListView, setAttemptListView] = useState<AttemptListView>("active");
  const [attemptPage, setAttemptPage] = useState(1);
  const [attemptsTotal, setAttemptsTotal] = useState(0);
  const [filteredAttemptsTotal, setFilteredAttemptsTotal] = useState(0);

  const [busy, setBusy] = useState(false);
  const [detailBusy, setDetailBusy] = useState(false);
  const [headerActionLoading, setHeaderActionLoading] = useState<"status" | "refresh" | "attempt-view" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isMobileTeacher, setIsMobileTeacher] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.matchMedia(MOBILE_BREAKPOINT_QUERY).matches;
  });
  const [isDetailSheetOpen, setIsDetailSheetOpen] = useState(false);
  const [detailAttemptId, setDetailAttemptId] = useState<string | null>(null);
  const [isClassFilterSheetOpen, setIsClassFilterSheetOpen] = useState(false);
  const [draftClassFilter, setDraftClassFilter] = useState("all");
  const pendingAttemptViewRefresh = useRef(false);

  const resetDashboardState = useCallback(() => {
    setSummary(null);
    setWindowState(null);
    setAttempts([]);
    setSelectedAttemptId(null);
    setSelectedAttemptIds([]);
    setDetail(null);
    setSearchText("");
    setClassFilter("all");
    setStageFilter("all");
    setAttemptListView("active");
    setDraftClassFilter("all");
    setAttemptPage(1);
    setAttemptsTotal(0);
    setFilteredAttemptsTotal(0);
    setIsDetailSheetOpen(false);
    setDetailAttemptId(null);
    setIsClassFilterSheetOpen(false);
    pendingAttemptViewRefresh.current = false;
  }, []);

  const expireTeacherSession = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    resetDashboardState();
    setNotice(null);
    setError("Teacher session expired. Please sign in again.");
  }, [resetDashboardState]);

  const refresh = useCallback(
    async (
      authToken = token ?? undefined,
      source: "auto" | "refresh" | "status" = "auto",
      opts?: { throwOnError?: boolean },
    ) => {
      if (!authToken) return;
      const throwOnError = opts?.throwOnError ?? false;
      let resolvedSource: "auto" | "refresh" | "status" | "attempt-view" = source;

      if (source === "auto" && pendingAttemptViewRefresh.current) {
        resolvedSource = "attempt-view";
        pendingAttemptViewRefresh.current = false;
      }

      if (resolvedSource !== "auto") {
        setHeaderActionLoading(resolvedSource);
      }
      setBusy(true);
      setError(null);

      try {
        const offset = (attemptPage - 1) * ATTEMPTS_PAGE_SIZE;
        const archiveMode = attemptListView === "archives" ? "archives" : "active";
        // TODO(PM-QA-023): Remove legacy archived=* shim after two consecutive post-deploy parity passes.
        const listParams = new URLSearchParams({
          limit: String(ATTEMPTS_PAGE_SIZE),
          offset: String(offset),
          source: "student",
          archive: archiveMode,
          archived: archiveMode === "archives" ? "only" : "exclude",
        });
        const trimmedSearch = searchText.trim();
        if (classFilter !== "all") {
          listParams.set("className", classFilter);
        }
        if (stageFilter !== "all") {
          listParams.set("stage", stageFilter);
        }
        if (trimmedSearch) {
          listParams.set("search", trimmedSearch);
        }

        const [nextSummary, list, nextWindowState] = await Promise.all([
          callFunction<TeacherSummary>("teacher-dashboard-summary", { token: authToken }),
          callFunction<TeacherAttemptListResponse>(`teacher-dashboard-list?${listParams.toString()}`, {
            token: authToken,
          }),
          callFunction<TeacherWindowState>("teacher-windows", { token: authToken }),
        ]);

        setSummary(nextSummary);
        setAttempts(list.attempts);
        setAttemptsTotal(list.totalCount);
        setFilteredAttemptsTotal(list.filteredCount);
        setWindowState(nextWindowState);

        if (list.totalPages > 0 && attemptPage > list.totalPages) {
          setAttemptPage(list.totalPages);
          return;
        }
        if (list.totalPages === 0 && attemptPage !== 1) {
          setAttemptPage(1);
          return;
        }

        setSelectedAttemptId((currentAttemptId) => {
          if (list.attempts.length === 0) {
            return null;
          }
          if (currentAttemptId && list.attempts.some((attempt) => attempt.id === currentAttemptId)) {
            return currentAttemptId;
          }
          return list.attempts[0].id;
        });
      } catch (err) {
        if (isTeacherSessionError(err)) {
          expireTeacherSession();
          if (throwOnError) {
            throw err instanceof Error ? err : new Error("Teacher session expired");
          }
          return;
        }

        const message = err instanceof Error ? err.message : "Failed to load dashboard";
        setError(message);
        void playSound("error", { fromInteraction: true });
        if (throwOnError) {
          throw err instanceof Error ? err : new Error(message);
        }
      } finally {
        setBusy(false);
        if (resolvedSource !== "auto") {
          setHeaderActionLoading(null);
        }
      }
    },
    [attemptListView, attemptPage, classFilter, expireTeacherSession, playSound, searchText, stageFilter, token],
  );

  const loadAttempt = useCallback(
    async (attemptId: string, authToken = token ?? undefined) => {
      if (!authToken || !attemptId) return;

      setDetailBusy(true);
      setError(null);

      try {
        const nextDetail = await callFunction<TeacherAttemptDetail>(
          `teacher-attempt-detail/${attemptId}`,
          { token: authToken },
        );
        setDetail(nextDetail);
      } catch (err) {
        if (isTeacherSessionError(err)) {
          expireTeacherSession();
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load attempt detail");
        void playSound("error", { fromInteraction: true });
      } finally {
        setDetailBusy(false);
      }
    },
    [expireTeacherSession, playSound, token],
  );

  useEffect(() => {
    if (!token) return;
    void refresh(token);
  }, [token, refresh]);

  useEffect(() => {
    if (!token || !selectedAttemptId) {
      setDetail(null);
      return;
    }
    void loadAttempt(selectedAttemptId, token);
  }, [loadAttempt, selectedAttemptId, token]);

  useEffect(() => {
    const validAttemptIds = new Set(attempts.map((attempt) => attempt.id));
    setSelectedAttemptIds((current) => current.filter((attemptId) => validAttemptIds.has(attemptId)));
  }, [attempts]);

  useEffect(() => {
    onAuthStateChange?.(Boolean(token));
  }, [onAuthStateChange, token]);

  useEffect(() => {
    return () => {
      onAuthStateChange?.(false);
    };
  }, [onAuthStateChange]);

  useEffect(() => {
    if (!notice) return;
    const timeoutId = window.setTimeout(() => {
      setNotice(null);
    }, 3000);
    return () => window.clearTimeout(timeoutId);
  }, [notice]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia(MOBILE_BREAKPOINT_QUERY);
    const updateMatch = (matches: boolean) => {
      setIsMobileTeacher(matches);
    };

    updateMatch(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      updateMatch(event.matches);
    };

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  const classOptions = useMemo(() => {
    const classSet = new Set<string>();
    summary?.classBreakdown.forEach((row) => classSet.add(row.className));
    attempts
      .map((attempt) => attempt.student.className)
      .filter((value): value is string => Boolean(value))
      .forEach((className) => classSet.add(className));
    return Array.from(classSet).sort((a, b) => a.localeCompare(b));
  }, [attempts, summary]);

  const stageCards = useMemo(() => {
    const fallback = [0, 1, 2, 3, 4].map((stage) => ({
      stage: stage as 0 | 1 | 2 | 3 | 4,
      students: 0,
      attempts: 0,
      avgScore10: 0,
    }));

    if (!summary?.stageBreakdown?.length) {
      return fallback;
    }

    const byStage = new Map(summary.stageBreakdown.map((row) => [row.stage, row]));
    return fallback.map((row) => byStage.get(row.stage) ?? row);
  }, [summary]);

  useEffect(() => {
    if (attempts.length === 0) {
      setSelectedAttemptId(null);
      setDetail(null);
      return;
    }

    if (!selectedAttemptId || !attempts.some((attempt) => attempt.id === selectedAttemptId)) {
      setSelectedAttemptId(attempts[0].id);
    }
  }, [attempts, selectedAttemptId]);

  useEffect(() => {
    setSelectedAttemptIds([]);
  }, [attemptListView, attemptPage, classFilter, searchText, stageFilter]);

  useEffect(() => {
    setDraftClassFilter(classFilter);
  }, [classFilter]);

  useEffect(() => {
    if (!isMobileTeacher && isDetailSheetOpen) {
      setIsDetailSheetOpen(false);
      setDetailAttemptId(null);
    }
  }, [isDetailSheetOpen, isMobileTeacher]);

  useEffect(() => {
    if (!isDetailSheetOpen || !detailAttemptId) return;
    const stillVisible = attempts.some((attempt) => attempt.id === detailAttemptId);
    if (!stillVisible) {
      setIsDetailSheetOpen(false);
      setDetailAttemptId(null);
    }
  }, [attempts, detailAttemptId, isDetailSheetOpen]);

  const selectedAttemptIdSet = useMemo(() => new Set(selectedAttemptIds), [selectedAttemptIds]);
  const allFilteredSelected = useMemo(
    () =>
      attempts.length > 0 &&
      attempts.every((attempt) => selectedAttemptIdSet.has(attempt.id)),
    [attempts, selectedAttemptIdSet],
  );

  const login = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      setBusy(true);
      setError(null);
      setNotice(null);

      try {
        const response = await callFunction<{ token: string; teacherName: string }>(
          "teacher-login",
          {
            method: "POST",
            body: { fullName, passcode },
          },
        );

        setToken(response.token);
        localStorage.setItem(TOKEN_KEY, response.token);
        setPasscode("");
        setSearchText("");
        setClassFilter("all");
        setStageFilter("all");
        setDraftClassFilter("all");
        setAttemptPage(1);
        setSelectedAttemptIds([]);
        void playSound("submit", { fromInteraction: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to sign in");
        void playSound("error", { fromInteraction: true });
      } finally {
        setBusy(false);
      }
    },
    [fullName, passcode, playSound],
  );

  const logout = useCallback(async () => {
    if (!token) return;

    try {
      await callFunction("teacher-logout", { method: "POST", token });
    } finally {
      localStorage.removeItem(TOKEN_KEY);
      setToken(null);
      resetDashboardState();
      setNotice(null);
      setError(null);
      void playSound("tap", { fromInteraction: true });
    }
  }, [playSound, resetDashboardState, token]);

  const sessionStatus: SessionStatus = windowState?.status ?? "ended";
  const isStatusActionLoading = headerActionLoading === "status";
  const isRefreshActionLoading = headerActionLoading === "refresh";
  const isAttemptViewActionLoading = headerActionLoading === "attempt-view";
  const isArchiveView = attemptListView === "archives";
  const totalPages = Math.max(1, Math.ceil(filteredAttemptsTotal / ATTEMPTS_PAGE_SIZE));
  const showingStart = filteredAttemptsTotal === 0
    ? 0
    : (attemptPage - 1) * ATTEMPTS_PAGE_SIZE + 1;
  const showingEnd = filteredAttemptsTotal === 0
    ? 0
    : Math.min((attemptPage - 1) * ATTEMPTS_PAGE_SIZE + attempts.length, filteredAttemptsTotal);
  const stageFilterLabel = stageFilter === "all" ? null : `Stage ${stageFilter}`;

  const updateSessionStatus = useCallback(
    async (nextStatus: "paused" | "in_progress") => {
      if (!token) return;

      setBusy(true);
      setError(null);
      setNotice(null);

      try {
        if (!windowState?.window?.id && nextStatus === "paused") {
          setError("No active baseline session to pause. Set baseline to In Progress first.");
          void playSound("error", { fromInteraction: true });
          return;
        }

        let response: WindowMutationResponse;
        if (windowState?.window?.id) {
          response = await callFunction<WindowMutationResponse>("teacher-windows", {
            method: "PATCH",
            token,
            body: {
              windowId: windowState.window.id,
              status: nextStatus,
            },
          });
        } else {
          response = await callFunction<WindowMutationResponse>("teacher-windows", {
            method: "POST",
            token,
            body: {
              scope: "all",
              status: nextStatus,
              startAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
              endAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            },
          });
        }

        setNotice(`Baseline set to ${formatSessionStatus(response.status)}.`);
        await refresh(token, "status");
        void playSound("submit", { fromInteraction: true });
      } catch (err) {
        if (isTeacherSessionError(err)) {
          expireTeacherSession();
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to update baseline status");
        void playSound("error", { fromInteraction: true });
      } finally {
        setBusy(false);
      }
    },
    [expireTeacherSession, playSound, refresh, token, windowState?.window?.id],
  );

  const mutateAttempts = useCallback(
    async (attemptIds: string[], action: "archive" | "restore") => {
      if (!token || attemptIds.length === 0) return;

      const uniqueAttemptIds = Array.from(new Set(attemptIds));
      const confirmationMessage = action === "archive"
        ? ARCHIVE_CONFIRMATION_MESSAGE
        : RESTORE_CONFIRMATION_MESSAGE;
      const shouldProceed = window.confirm(confirmationMessage);
      if (!shouldProceed) {
        return;
      }

      setBusy(true);
      setError(null);
      setNotice(null);

      try {
        const endpoint = action === "archive" ? "teacher-attempt-archive" : "teacher-attempt-restore";
        const response = await callFunction<AttemptMutationResponse>(endpoint, {
          method: "POST",
          token,
          body: {
            attemptIds: uniqueAttemptIds,
          },
        });

        const count = action === "archive"
          ? response.movedToArchivesCount ?? response.archivedCount ?? uniqueAttemptIds.length
          : response.restoredFromArchivesCount ?? response.restoredCount ?? uniqueAttemptIds.length;
        const student = response.students[0];
        const studentName = student
          ? [student.firstName, student.lastName].filter(Boolean).join(" ") || "student"
          : "student";
        const successNotice = count === 0
          ? action === "archive"
            ? "No attempts were moved to Archives."
            : "No attempts were restored from Archives."
          : count === 1
          ? action === "archive"
            ? `Attempt moved to Archives for ${studentName}. Baseline test reopened.`
            : `Attempt restored from Archives for ${studentName}.`
          : action === "archive"
          ? `${count} attempts moved to Archives. Baseline test reopened for selected students.`
          : `${count} attempts restored from Archives.`;

        setSelectedAttemptIds((current) =>
          current.filter((attemptId) => !uniqueAttemptIds.includes(attemptId))
        );

        try {
          await refresh(token, "auto", { throwOnError: true });
          setNotice(successNotice);
        } catch (refreshError) {
          const refreshMessage = refreshError instanceof Error
            ? refreshError.message
            : "Failed to refresh dashboard";
          const actionLabel = action === "archive" ? "Move to Archives" : "Restore from Archives";
          setError(`${actionLabel} succeeded but dashboard refresh failed: ${refreshMessage}`);
          setNotice(`${successNotice} Refresh failed, tap Refresh.`);
        }

        void playSound("submit", { fromInteraction: true });
      } catch (err) {
        if (isTeacherSessionError(err)) {
          expireTeacherSession();
          return;
        }
        const actionLabel = action === "archive" ? "archive" : "restore";
        setError(err instanceof Error ? err.message : `Failed to ${actionLabel} attempts`);
        void playSound("error", { fromInteraction: true });
      } finally {
        setBusy(false);
      }
    },
    [expireTeacherSession, playSound, refresh, token],
  );

  const archiveAttempt = useCallback(() => {
    if (!detail) return;
    void mutateAttempts([detail.attempt.id], attemptListView === "archives" ? "restore" : "archive");
  }, [attemptListView, detail, mutateAttempts]);

  const archiveSelectedAttempts = useCallback(() => {
    if (selectedAttemptIds.length === 0) return;
    void mutateAttempts(selectedAttemptIds, attemptListView === "archives" ? "restore" : "archive");
  }, [attemptListView, mutateAttempts, selectedAttemptIds]);

  const toggleAttemptSelection = useCallback((attemptId: string, shouldSelect: boolean) => {
    setSelectedAttemptIds((current) => {
      const next = new Set(current);
      if (shouldSelect) {
        next.add(attemptId);
      } else {
        next.delete(attemptId);
      }
      return Array.from(next);
    });
  }, []);

  const toggleSelectAllFiltered = useCallback((shouldSelectAll: boolean) => {
    setSelectedAttemptIds((current) => {
      const next = new Set(current);
      if (shouldSelectAll) {
        attempts.forEach((attempt) => next.add(attempt.id));
      } else {
        attempts.forEach((attempt) => next.delete(attempt.id));
      }
      return Array.from(next);
    });
  }, [attempts]);

  const handleAttemptSelect = useCallback((attemptId: string) => {
    setSelectedAttemptId(attemptId);
    if (isMobileTeacher) {
      setDetailAttemptId(attemptId);
      setIsDetailSheetOpen(true);
    }
  }, [isMobileTeacher]);

  if (!token) {
    return (
      <section
        className="flex min-h-[calc(100vh-10rem)] flex-col items-center justify-center gap-12"
        aria-label="teacher-login"
      >
        <div className="flex flex-col items-center gap-[8px] px-2 text-center">
          <img src={logoVocabPal} alt="VocabPal" className="h-auto w-[250px] max-w-full" />
          <p className="text-base font-semibold text-[color:var(--ink)]">English Vocabulary Revision</p>
        </div>

        <Card className="w-full max-w-[450px]">
          <CardHeader>
            <CardTitle className="text-left text-2xl">Baseline Test</CardTitle>
            <CardDescription className="text-left">Teacher sign in</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="card grid gap-3" onSubmit={login}>
              <Label htmlFor="teacher-name">Full Name</Label>
              <Input
                id="teacher-name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                data-clarity-mask="true"
                required
              />

              <Label htmlFor="teacher-passcode">Passcode</Label>
              <Input
                id="teacher-passcode"
                type="password"
                value={passcode}
                onChange={(event) => setPasscode(event.target.value)}
                required
              />

              <MotionButton
                motionPolicy={motionPolicy}
                type="submit"
                disabled={busy}
                onClick={() => {
                  void playSound("tap", { fromInteraction: true });
                }}
              >
                {busy ? "Signing in..." : "Sign In"}
              </MotionButton>
            </form>
          </CardContent>
        </Card>

        {error && <Alert variant="destructive">{error}</Alert>}
      </section>
    );
  }

  const emptyAttemptsMessage = isArchiveView ? "No attempts in Archives." : "No attempts recorded.";
  const emptyFilteredAttemptsMessage = isArchiveView
    ? "No attempts in Archives match this search/filter combination."
    : "No attempts match this search/filter combination.";

  const attemptRows = filteredAttemptsTotal === 0 ? (
    <Alert>{emptyAttemptsMessage}</Alert>
  ) : attempts.length === 0 ? (
    <Alert>{emptyFilteredAttemptsMessage}</Alert>
  ) : (
    attempts.map((attempt) => {
      const className = attempt.student.className ?? "Unknown";
      const fullStudentName = [attempt.student.firstName, attempt.student.lastName]
        .filter(Boolean)
        .join(" ") || "Unknown student";
      const isSelected = selectedAttemptIdSet.has(attempt.id);

      return (
        <div key={attempt.id} className={cn("flex items-stretch gap-2", isMobileTeacher && "gap-1.5")}>
          <label className={cn(
            "flex items-center justify-center rounded-[var(--radius-lg)] border border-[color:var(--line)] bg-white shadow-[var(--shadow-2xs)]",
            isMobileTeacher ? "min-h-11 w-11" : "w-9",
          )}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(event) => {
                toggleAttemptSelection(attempt.id, event.target.checked);
                void playSound("tap", { fromInteraction: true });
              }}
              aria-label={`Select attempt for ${fullStudentName}`}
              className="h-4 w-4 accent-[color:var(--brand-600)]"
            />
          </label>

          <MotionButton
            variant="secondary"
            motionPolicy={motionPolicy}
            className={cn(
              "h-auto flex-1 justify-start text-left !bg-white hover:!bg-white",
              isMobileTeacher ? "px-2.5 py-2.5" : "px-3 py-3",
              attempt.id === selectedAttemptId ? "ring-2 ring-[color:var(--ring)]" : "",
            )}
            onClick={() => {
              handleAttemptSelect(attempt.id);
              void playSound("tap", { fromInteraction: true });
            }}
          >
            <div className="grid w-full gap-1 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <p className="text-sm font-semibold text-[color:var(--ink)]">{fullStudentName}</p>
                <p className="text-xs text-[color:var(--muted)]">{className}</p>
              </div>
              <div className="text-right text-xs font-semibold text-[color:var(--ink)]">
                <p>Score {attempt.totalScore10}/10</p>
                <p>{formatDateTimeCompact(attempt.startedAt)}</p>
              </div>
            </div>
          </MotionButton>
        </div>
      );
    })
  );

  const desktopAttemptsCard = (
    <Card>
      <CardHeader>
        <CardTitle className="text-3xl">Attempts</CardTitle>
        <CardDescription>
          Search by student name and filter by class before selecting an attempt.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 xl:max-h-[calc(100vh-23rem)] xl:overflow-y-auto xl:pr-1">
        <div className="space-y-3">
          {isAttemptViewActionLoading ? (
            <HeaderActionSkeleton className="w-[184px]" />
          ) : (
            <AttemptListToggle
              value={attemptListView}
              disabled={busy}
              onChange={(nextValue) => {
                if (attemptListView === nextValue) return;
                pendingAttemptViewRefresh.current = true;
                setAttemptListView(nextValue);
                setAttemptPage(1);
                setStageFilter("all");
                setSelectedAttemptIds([]);
                void playSound("tap", { fromInteraction: true });
              }}
            />
          )}

          <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="attempt-search">Search</Label>
                <Input
                  id="attempt-search"
                  placeholder="Search by name"
                  value={searchText}
                  onChange={(event) => {
                    setSearchText(event.target.value);
                    setAttemptPage(1);
                  }}
                  data-clarity-mask="true"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="attempt-class-filter">Filter by class</Label>
                <Select
                  id="attempt-class-filter"
                  value={classFilter}
                  onChange={(event) => {
                    setClassFilter(event.target.value);
                    setAttemptPage(1);
                    void playSound("tap", { fromInteraction: true });
                  }}
                >
                  <option value="all">All classes</option>
                  {classOptions.map((className) => (
                    <option key={className} value={className}>
                      {className}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <p className="text-xs font-semibold text-[color:var(--muted)]">
              Showing {showingStart}-{showingEnd} of {filteredAttemptsTotal} {isArchiveView ? "attempts in Archives" : "attempts"}
              {attemptsTotal !== filteredAttemptsTotal ? ` (total ${attemptsTotal})` : ""}
              {stageFilterLabel ? ` · ${stageFilterLabel}` : ""}
            </p>

            <motion.div
              layout
              className="flex flex-wrap items-center gap-2"
              transition={motionPolicy === "full" ? { duration: 0.18, ease: "easeOut" } : undefined}
            >
              <AnimatePresence initial={false}>
                {selectedAttemptIds.length > 0 ? (
                  <motion.div
                    key="selected-attempts-badge"
                    layout
                    initial={motionPolicy === "full" ? { opacity: 0, x: -8 } : { opacity: 0 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={motionPolicy === "full" ? { opacity: 0, x: -8 } : { opacity: 0 }}
                    transition={motionPolicy === "full" ? { duration: 0.18, ease: "easeOut" } : undefined}
                  >
                    <Badge>{selectedAttemptIds.length} selected</Badge>
                  </motion.div>
                ) : null}
              </AnimatePresence>
              <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                <MotionButton
                  motionPolicy={motionPolicy}
                  variant="secondary"
                  size="sm"
                  disabled={busy || attempts.length === 0}
                  onClick={() => {
                    const nextSelectAll = !allFilteredSelected;
                    toggleSelectAllFiltered(nextSelectAll);
                    void playSound("tap", { fromInteraction: true });
                  }}
                >
                  {allFilteredSelected ? "Unselect visible" : "Select visible"}
                </MotionButton>
                <MotionButton
                  motionPolicy={motionPolicy}
                  variant={
                    isArchiveView
                      ? "secondary"
                      : selectedAttemptIds.length > 0
                      ? "destructive"
                      : "secondary"
                  }
                  size="sm"
                  disabled={busy || selectedAttemptIds.length === 0}
                  title={isArchiveView ? RESTORE_CONFIRMATION_MESSAGE : ARCHIVE_CONFIRMATION_MESSAGE}
                  onClick={() => {
                    void playSound("tap", { fromInteraction: true });
                    archiveSelectedAttempts();
                  }}
                >
                  <IconGlyph src={isArchiveView ? refreshIcon : archiveIcon} alt="" />
                  {isArchiveView ? "Restore selected" : "Archive selected"}
                </MotionButton>
              </div>
            </motion.div>
          </div>

          <div className="grid gap-2 pb-16">
            {attemptRows}
          </div>

          <div className="sticky bottom-0 z-10 mt-2 flex flex-wrap items-center gap-2 bg-[color:var(--surface)]/95 py-2 backdrop-blur-[2px]">
            <MotionButton
              motionPolicy={motionPolicy}
              variant="secondary"
              size="sm"
              disabled={busy || attemptPage <= 1}
              onClick={() => {
                setAttemptPage((current) => Math.max(1, current - 1));
                void playSound("tap", { fromInteraction: true });
              }}
            >
              Previous
            </MotionButton>
            <Badge>Page {attemptPage} of {totalPages}</Badge>
            <MotionButton
              motionPolicy={motionPolicy}
              variant="secondary"
              size="sm"
              disabled={busy || filteredAttemptsTotal === 0 || attemptPage >= totalPages}
              onClick={() => {
                setAttemptPage((current) => Math.min(totalPages, current + 1));
                void playSound("tap", { fromInteraction: true });
              }}
            >
              Next
            </MotionButton>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const desktopDetailCard = (
    <Card className="h-fit xl:sticky xl:top-6">
      {!detail ? (
        <CardContent>
          <p className="text-sm text-[color:var(--muted)]">
            {detailBusy
              ? "Loading attempt detail..."
              : "Select an attempt to review detailed performance."}
          </p>
        </CardContent>
      ) : (
        <>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-3xl">Attempt Detail</CardTitle>
              <CardDescription>
                Review timing, correctness, and question-level outcomes.
              </CardDescription>
            </div>
            <MotionButton
              motionPolicy={motionPolicy}
              variant="secondary"
              className="self-start"
              disabled={busy}
              title={isArchiveView ? RESTORE_CONFIRMATION_MESSAGE : ARCHIVE_CONFIRMATION_MESSAGE}
              onClick={() => {
                void playSound("tap", { fromInteraction: true });
                archiveAttempt();
              }}
            >
              <IconGlyph src={isArchiveView ? refreshIcon : archiveIcon} alt="" />
              {isArchiveView ? "Restore" : "Archive"}
            </MotionButton>
          </CardHeader>

          <CardContent>
            <AttemptDetailBody detail={detail} />
          </CardContent>
        </>
      )}
    </Card>
  );

  return (
    <section className="space-y-4" aria-label="teacher-mode">
      {notice ? (
        <div className="fixed inset-x-0 top-4 z-50 flex justify-center px-4" role="status" aria-live="polite">
          <Alert variant="success" className="w-full max-w-5xl shadow-[var(--shadow-md)]">
            {notice}
          </Alert>
        </div>
      ) : null}

      <div className="space-y-4 px-2 md:px-0">
        <div className={cn("flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between", isMobileTeacher && "gap-2")}>
          <div className={cn(isMobileTeacher && "space-y-1")}>
            <CardTitle className={cn("text-4xl", isMobileTeacher && "text-3xl leading-tight")}>Teacher Dashboard</CardTitle>
            <CardDescription className={cn(isMobileTeacher && "max-w-[38ch] text-base")}>
              Track class performance, inspect attempts, and control baseline availability.
            </CardDescription>
          </div>

          <div className={cn("flex flex-wrap items-center gap-2", isMobileTeacher && "w-full")}>
            {isStatusActionLoading ? (
              <HeaderActionSkeleton className={isMobileTeacher ? "w-[88px]" : "w-[220px]"} />
            ) : (
              <SessionStatusToggle
                status={sessionStatus}
                compact={isMobileTeacher}
                iconOnly={isMobileTeacher}
                disabled={busy}
                onChange={(nextStatus) => {
                  void playSound("tap", { fromInteraction: true });
                  void updateSessionStatus(nextStatus);
                }}
              />
            )}
            {isRefreshActionLoading ? (
              <HeaderActionSkeleton className={isMobileTeacher ? "w-11" : "w-[128px]"} />
            ) : (
              <MotionButton
                motionPolicy={motionPolicy}
                variant="secondary"
                size={isMobileTeacher ? "icon" : undefined}
                title="Refresh attempts"
                aria-label="Refresh attempts"
                onClick={() => {
                  void playSound("tap", { fromInteraction: true });
                  void refresh(token ?? undefined, "refresh");
                }}
                disabled={busy}
              >
                <IconGlyph src={refreshIcon} alt="" />
                {isMobileTeacher ? null : "Refresh"}
              </MotionButton>
            )}
            <MotionButton
              motionPolicy={motionPolicy}
              variant="destructive"
              size={isMobileTeacher ? "icon" : undefined}
              title="Logout"
              aria-label="Logout"
              onClick={logout}
            >
              <IconGlyph src={signoutIcon} alt="" />
              {isMobileTeacher ? null : "Logout"}
            </MotionButton>
          </div>
        </div>

        {summary ? (
          <div className="space-y-3">
            {isArchiveView ? (
              <p className="text-sm font-semibold text-[color:var(--muted)]">
                Archives view is active. Dashboard summaries show active attempts only.
              </p>
            ) : (
              <>
                <div className="overflow-x-auto pb-1">
                  <div className="flex min-w-max items-stretch gap-3 pr-1">
                    {stageCards.map((stageSummary) => {
                      const stageValue = String(stageSummary.stage) as "0" | "1" | "2" | "3" | "4";
                      return (
                        <StageDistributionCard
                          key={`stage-${stageSummary.stage}`}
                          summary={stageSummary}
                          isActive={stageFilter === stageValue}
                          onSelect={(selectedStage) => {
                            const nextFilter = stageFilter === selectedStage ? "all" : selectedStage;
                            setStageFilter(nextFilter);
                            setAttemptPage(1);
                            void playSound("tap", { fromInteraction: true });
                          }}
                        />
                      );
                    })}
                  </div>
                </div>

                {summary.classBreakdown.length > 0 ? (
                  <div className="overflow-x-auto pb-1">
                    <div className="flex min-w-max items-stretch gap-3 pr-1">
                      {summary.classBreakdown.map((classSummary) => (
                        <ClassPerformanceRow
                          key={classSummary.className}
                          summary={classSummary}
                          isActive={classFilter === classSummary.className}
                          onSelect={(selectedClassName) => {
                            const nextFilter = classFilter === selectedClassName ? "all" : selectedClassName;
                            setClassFilter(nextFilter);
                            setAttemptPage(1);
                            void playSound("tap", { fromInteraction: true });
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-[color:var(--muted)]">No class summaries yet.</p>
                )}
              </>
            )}
          </div>
        ) : (
          <p className="text-sm text-[color:var(--muted)]">No attempts available yet.</p>
        )}
      </div>

      {isMobileTeacher ? (
        <div className="space-y-3 px-2">
          <div className="space-y-1">
            <CardTitle className="text-[2.15rem] leading-tight">Attempts</CardTitle>
            <CardDescription>
              Search by student name and filter by class before selecting an attempt.
            </CardDescription>
          </div>

          {isAttemptViewActionLoading ? (
            <HeaderActionSkeleton className="w-[172px]" />
          ) : (
            <AttemptListToggle
              value={attemptListView}
              compact
              disabled={busy}
              onChange={(nextValue) => {
                if (attemptListView === nextValue) return;
                pendingAttemptViewRefresh.current = true;
                setAttemptListView(nextValue);
                setAttemptPage(1);
                setStageFilter("all");
                setSelectedAttemptIds([]);
                void playSound("tap", { fromInteraction: true });
              }}
            />
          )}

          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="attempt-search-mobile">Search</Label>
              <Input
                id="attempt-search-mobile"
                placeholder="Search by name"
                value={searchText}
                onChange={(event) => {
                  setSearchText(event.target.value);
                  setAttemptPage(1);
                }}
                data-clarity-mask="true"
              />
            </div>
            <MotionButton
              motionPolicy={motionPolicy}
              variant="secondary"
              size="icon"
              title="Filter by class"
              aria-label="Filter by class"
              onClick={() => {
                setDraftClassFilter(classFilter);
                setIsClassFilterSheetOpen(true);
                void playSound("tap", { fromInteraction: true });
              }}
            >
              <IconGlyph src={filterIcon} alt="" />
            </MotionButton>
          </div>

          <p className="text-xs font-semibold text-[color:var(--muted)]">
            Showing {showingStart}-{showingEnd} of {filteredAttemptsTotal} {isArchiveView ? "attempts in Archives" : "attempts"}
            {attemptsTotal !== filteredAttemptsTotal ? ` (total ${attemptsTotal})` : ""}
            {stageFilterLabel ? ` · ${stageFilterLabel}` : ""}
          </p>

          <AnimatePresence initial={false}>
            {selectedAttemptIds.length > 0 ? (
              <motion.div
                key="mobile-selected-attempt-actions"
                initial={motionPolicy === "full" ? { opacity: 0, y: -6 } : { opacity: 0 }}
                animate={{ opacity: 1, y: 0 }}
                exit={motionPolicy === "full" ? { opacity: 0, y: -6 } : { opacity: 0 }}
                transition={motionPolicy === "full" ? { duration: 0.16, ease: "easeOut" } : undefined}
                className="flex flex-wrap items-center justify-end gap-2"
              >
                <Badge>{selectedAttemptIds.length} selected</Badge>
                <MotionButton
                  motionPolicy={motionPolicy}
                  variant="secondary"
                  size="icon"
                  title={allFilteredSelected ? "Unselect visible attempts" : "Select visible attempts"}
                  aria-label={allFilteredSelected ? "Unselect visible attempts" : "Select visible attempts"}
                  disabled={busy || attempts.length === 0}
                  onClick={() => {
                    const nextSelectAll = !allFilteredSelected;
                    toggleSelectAllFiltered(nextSelectAll);
                    void playSound("tap", { fromInteraction: true });
                  }}
                >
                  <IconGlyph src={checkSquareIcon} alt="" />
                </MotionButton>
                <MotionButton
                  motionPolicy={motionPolicy}
                  variant={
                    isArchiveView
                      ? "secondary"
                      : selectedAttemptIds.length > 0
                      ? "destructive"
                      : "secondary"
                  }
                  size="icon"
                  title={isArchiveView ? "Restore selected attempts" : "Archive selected attempts"}
                  aria-label={isArchiveView ? "Restore selected attempts" : "Archive selected attempts"}
                  disabled={busy || selectedAttemptIds.length === 0}
                  onClick={() => {
                    void playSound("tap", { fromInteraction: true });
                    archiveSelectedAttempts();
                  }}
                >
                  <IconGlyph src={isArchiveView ? refreshIcon : archiveIcon} alt="" />
                </MotionButton>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <div className="grid gap-2">
            {attemptRows}
          </div>

          <div className="flex items-center justify-center gap-2 pt-2">
            <MotionButton
              motionPolicy={motionPolicy}
              variant="secondary"
              size="icon"
              title="Previous page"
              aria-label="Previous page"
              disabled={busy || attemptPage <= 1}
              onClick={() => {
                setAttemptPage((current) => Math.max(1, current - 1));
                void playSound("tap", { fromInteraction: true });
              }}
            >
              <IconGlyph src={arrowLeftIcon} alt="" />
            </MotionButton>
            <Badge>Page {attemptPage} of {totalPages}</Badge>
            <MotionButton
              motionPolicy={motionPolicy}
              variant="secondary"
              size="icon"
              title="Next page"
              aria-label="Next page"
              disabled={busy || filteredAttemptsTotal === 0 || attemptPage >= totalPages}
              onClick={() => {
                setAttemptPage((current) => Math.min(totalPages, current + 1));
                void playSound("tap", { fromInteraction: true });
              }}
            >
              <IconGlyph src={arrowRightIcon} alt="" />
            </MotionButton>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <motion.div
            className="grid items-start gap-4 xl:grid-cols-[1fr_1.08fr]"
            {...(motionPolicy === "full" ? cardMotion : { initial: false, animate: { opacity: 1, y: 0 } })}
          >
            {desktopAttemptsCard}
            {desktopDetailCard}
          </motion.div>
        </div>
      )}

      <AnimatePresence>
        {isMobileTeacher && isClassFilterSheetOpen ? (
          <>
            <motion.button
              type="button"
              className="fixed inset-0 z-40 bg-black/20"
              aria-label="Close class filter sheet"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: motionPolicy === "full" ? 0.16 : 0.01 }}
              onClick={() => setIsClassFilterSheetOpen(false)}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: motionPolicy === "full" ? 0.2 : 0.01 }}
              className="fixed inset-x-0 bottom-0 z-50 rounded-t-[var(--radius-xl)] border-t border-[color:var(--line)] bg-[color:var(--card)] p-4 shadow-[var(--shadow-lg)]"
              role="dialog"
              aria-modal="true"
              aria-label="Class filter"
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold">Filter by class</p>
                <MotionButton
                  motionPolicy={motionPolicy}
                  variant="secondary"
                  size="icon"
                  title="Close filter"
                  aria-label="Close filter"
                  onClick={() => {
                    setIsClassFilterSheetOpen(false);
                    void playSound("tap", { fromInteraction: true });
                  }}
                >
                  <IconGlyph src={closeIcon} alt="" />
                </MotionButton>
              </div>

              <div className="max-h-[42vh] space-y-2 overflow-y-auto pb-2">
                {["all", ...classOptions].map((className) => {
                  const label = className === "all" ? "All classes" : className;
                  const selected = draftClassFilter === className;
                  return (
                    <button
                      key={className}
                      type="button"
                      className={cn(
                        "w-full rounded-[var(--radius-lg)] border px-3 py-2 text-left text-sm font-semibold",
                        selected
                          ? "border-[color:var(--ring)] bg-[color:var(--secondary)]"
                          : "border-[color:var(--line)] bg-white",
                      )}
                      onClick={() => {
                        setDraftClassFilter(className);
                        void playSound("tap", { fromInteraction: true });
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              <div className="mt-2 flex items-center justify-end gap-2">
                <MotionButton
                  motionPolicy={motionPolicy}
                  variant="secondary"
                  size="icon"
                  title="Clear class filter"
                  aria-label="Clear class filter"
                  onClick={() => {
                    setDraftClassFilter("all");
                    setClassFilter("all");
                    setAttemptPage(1);
                    setIsClassFilterSheetOpen(false);
                    void playSound("tap", { fromInteraction: true });
                  }}
                >
                  <IconGlyph src={cancelIcon} alt="" />
                </MotionButton>
                <MotionButton
                  motionPolicy={motionPolicy}
                  variant="secondary"
                  size="icon"
                  title="Apply class filter"
                  aria-label="Apply class filter"
                  onClick={() => {
                    setClassFilter(draftClassFilter);
                    setAttemptPage(1);
                    setIsClassFilterSheetOpen(false);
                    void playSound("tap", { fromInteraction: true });
                  }}
                >
                  <IconGlyph src={checkSquareIcon} alt="" />
                </MotionButton>
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isMobileTeacher && isDetailSheetOpen ? (
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: motionPolicy === "full" ? 0.2 : 0.01 }}
            className="fixed inset-0 z-50 overflow-y-auto bg-[color:var(--surface)]"
            role="dialog"
            aria-modal="true"
            aria-label="Attempt detail sheet"
          >
            <div className="mx-auto max-w-[850px] space-y-4 px-4 pb-6 pt-4">
              <div className="sticky top-0 z-20 -mx-4 border-b border-[color:var(--line)] bg-[color:var(--surface)]/95 px-4 py-2 backdrop-blur-[2px]">
                <div className="flex items-center justify-between gap-2">
                  <MotionButton
                    motionPolicy={motionPolicy}
                    variant="secondary"
                    size="icon"
                    title="Back to attempts"
                    aria-label="Back to attempts"
                    onClick={() => {
                      setIsDetailSheetOpen(false);
                      setDetailAttemptId(null);
                      void playSound("tap", { fromInteraction: true });
                    }}
                  >
                    <IconGlyph src={arrowLeftIcon} alt="" />
                  </MotionButton>
                  <p className="text-base font-semibold text-[color:var(--ink)]">Attempt Detail</p>
                  <MotionButton
                    motionPolicy={motionPolicy}
                    variant="secondary"
                    size="icon"
                    title={isArchiveView ? "Restore attempt" : "Archive attempt"}
                    aria-label={isArchiveView ? "Restore attempt" : "Archive attempt"}
                    disabled={busy}
                    onClick={() => {
                      void playSound("tap", { fromInteraction: true });
                      archiveAttempt();
                    }}
                  >
                    <IconGlyph src={isArchiveView ? refreshIcon : archiveIcon} alt="" />
                  </MotionButton>
                </div>
              </div>

              {!detail || detailAttemptId !== selectedAttemptId ? (
                <Alert>{detailBusy ? "Loading attempt detail..." : "Select an attempt to review."}</Alert>
              ) : (
                <AttemptDetailBody detail={detail} />
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {error && <Alert variant="destructive">{error}</Alert>}
    </section>
  );
}

type SessionStatusToggleProps = {
  status: SessionStatus;
  compact?: boolean;
  iconOnly?: boolean;
  disabled?: boolean;
  onChange: (status: "paused" | "in_progress") => void;
};

type AttemptListToggleProps = {
  value: AttemptListView;
  disabled?: boolean;
  compact?: boolean;
  onChange: (value: AttemptListView) => void;
};

function SessionStatusToggle({
  status,
  compact = false,
  iconOnly = false,
  disabled = false,
  onChange,
}: SessionStatusToggleProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-white p-1 shadow-[var(--shadow-2xs)]",
        compact && "w-fit",
      )}
    >
      <button
        type="button"
        className={cn(
          "rounded-[var(--radius-lg)] font-semibold leading-none transition-colors",
          compact
            ? (iconOnly ? "inline-flex h-9 w-9 items-center justify-center p-0" : "min-h-9 px-3 py-1 text-sm")
            : "px-3 py-1.5 text-sm",
          status === "paused"
            ? "bg-[color:var(--secondary)] text-[color:var(--ink)]"
            : "bg-transparent text-[color:var(--muted)]",
        )}
        aria-label="Pause baseline"
        title="Pause baseline"
        disabled={disabled}
        onClick={() => onChange("paused")}
      >
        {iconOnly ? <IconGlyph src={pauseIcon} alt="" /> : "Paused"}
      </button>
      <button
        type="button"
        className={cn(
          "rounded-[var(--radius-lg)] font-semibold leading-none transition-colors",
          compact
            ? (iconOnly ? "inline-flex h-9 w-9 items-center justify-center p-0" : "min-h-9 px-3 py-1 text-sm")
            : "px-3 py-1.5 text-sm",
          status === "in_progress"
            ? "bg-[color:var(--secondary)] text-[color:var(--ink)]"
            : "bg-transparent text-[color:var(--muted)]",
        )}
        aria-label="Set baseline in progress"
        title="Set baseline in progress"
        disabled={disabled}
        onClick={() => onChange("in_progress")}
      >
        {iconOnly ? <IconGlyph src={playIcon} alt="" /> : "In Progress"}
      </button>
    </div>
  );
}

function AttemptListToggle({
  value,
  disabled = false,
  compact = false,
  onChange,
}: AttemptListToggleProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-white p-1 shadow-[var(--shadow-2xs)]",
        compact && "w-fit",
      )}
      role="group"
      aria-label="Attempt list view"
    >
      <button
        type="button"
        className={cn(
          "rounded-[var(--radius-lg)] font-semibold leading-none transition-colors",
          compact ? "min-h-9 px-3 py-1 text-sm" : "px-3 py-1.5 text-sm",
          value === "active"
            ? "bg-[color:var(--secondary)] text-[color:var(--ink)]"
            : "bg-transparent text-[color:var(--muted)]",
        )}
        disabled={disabled}
        aria-pressed={value === "active"}
        onClick={() => onChange("active")}
      >
        Active
      </button>
      <button
        type="button"
        className={cn(
          "rounded-[var(--radius-lg)] font-semibold leading-none transition-colors",
          compact ? "min-h-9 px-3 py-1 text-sm" : "px-3 py-1.5 text-sm",
          value === "archives"
            ? "bg-[color:var(--secondary)] text-[color:var(--ink)]"
            : "bg-transparent text-[color:var(--muted)]",
        )}
        disabled={disabled}
        aria-pressed={value === "archives"}
        onClick={() => onChange("archives")}
      >
        Archives
      </button>
    </div>
  );
}

type HeaderActionSkeletonProps = {
  className: string;
};

function HeaderActionSkeleton({ className }: HeaderActionSkeletonProps) {
  return (
    <div
      className={`${className} h-11 animate-pulse rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[color:var(--surface-2)] shadow-[var(--shadow-2xs)]`}
      aria-hidden="true"
    />
  );
}

type ClassSummaryRow = TeacherSummary["classBreakdown"][number];
type StageSummaryRow = TeacherSummary["stageBreakdown"][number];

type IconGlyphProps = {
  src: string;
  alt: string;
};

function IconGlyph({ src, alt }: IconGlyphProps) {
  return <img src={src} alt={alt} aria-hidden={alt === ""} className="h-4 w-4 shrink-0" />;
}

type StageDistributionCardProps = {
  summary: StageSummaryRow;
  isActive: boolean;
  onSelect: (stage: "0" | "1" | "2" | "3" | "4") => void;
};

function StageDistributionCard({ summary, isActive, onSelect }: StageDistributionCardProps) {
  const stageLabel = `Stage ${summary.stage}`;

  return (
    <button
      type="button"
      onClick={() => onSelect(String(summary.stage) as "0" | "1" | "2" | "3" | "4")}
      className={`w-fit min-w-[180px] rounded-[var(--radius-xl)] border bg-white p-3 text-left shadow-[var(--shadow-2xs)] transition-colors ${
        isActive
          ? "border-[color:var(--ring)] ring-2 ring-[color:var(--ring)]/30"
          : "border-[color:var(--line)] hover:bg-[color:var(--surface)]"
      }`}
      aria-pressed={isActive}
      aria-label={`Filter attempts by ${stageLabel}`}
    >
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--muted)]">
          {stageLabel}
        </p>
        <p className="text-3xl font-bold leading-none text-[color:var(--ink)]">
          {summary.students}
        </p>
        <p className="text-xs font-semibold text-[color:var(--muted)]">
          {summary.students === 1 ? "student" : "students"}
        </p>
      </div>
    </button>
  );
}

type ClassPerformanceRowProps = {
  summary: ClassSummaryRow;
  isActive: boolean;
  onSelect: (className: string) => void;
};

function ClassPerformanceRow({ summary, isActive, onSelect }: ClassPerformanceRowProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(summary.className)}
      className={`w-fit min-w-[280px] rounded-[var(--radius-xl)] border bg-white p-3 text-left shadow-[var(--shadow-2xs)] transition-colors ${
        isActive
          ? "border-[color:var(--ring)] ring-2 ring-[color:var(--ring)]/30"
          : "border-[color:var(--line)] hover:bg-[color:var(--surface)]"
      }`}
      aria-pressed={isActive}
      aria-label={`Filter attempts by ${summary.className}`}
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[color:var(--muted)]">
            {summary.className}
          </p>
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[color:var(--muted)]">
              Avg Score
            </p>
            <p className="text-2xl font-bold leading-none text-[color:var(--ink)]">
              {summary.avgScore10}
            </p>
          </div>
        </div>

        <div className="space-y-1 text-sm font-semibold text-[color:var(--ink)]">
          <div className="flex items-baseline justify-between gap-3">
            <span>Attempts</span>
            <span>{summary.attempts}</span>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <span>Completed</span>
            <span>{summary.completedAttempts}</span>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <span>In Progress</span>
            <span>{summary.inProgressAttempts}</span>
          </div>
        </div>
      </div>
    </button>
  );
}

type MetricChipProps = {
  label: string;
  value: string | number;
};

function MetricChip({ label, value }: MetricChipProps) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[color:var(--line)] bg-[color:var(--surface)] px-2 py-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[color:var(--muted)]">{label}</p>
      <p className="text-sm font-semibold text-[color:var(--ink)]">{value}</p>
    </div>
  );
}

type AttemptDetailBodyProps = {
  detail: TeacherAttemptDetail;
};

function AttemptDetailBody({ detail }: AttemptDetailBodyProps) {
  const studentName = [detail.attempt.student.firstName, detail.attempt.student.lastName]
    .filter(Boolean)
    .join(" ") || "-";

  const { classLabel, sectionLabel } = parseClassSection(detail.attempt.student.className);

  const maxResponseTime = Math.max(
    ...detail.responses.map((response) => response.responseTimeMs),
    1,
  );
  const readingStage = detail.attempt.placementStage;
  const instructionalNeed = instructionalNeedFromStage(readingStage);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 xl:grid-cols-3">
        <DetailGroup title="Student">
          <DetailRow label="Full Name" value={studentName} />
          <DetailRow label="Class" value={classLabel} />
          <DetailRow label="Section" value={sectionLabel} />
        </DetailGroup>

        <DetailGroup title="Timing">
          <DetailRow
            label="Start"
            value={`${formatDateOnly(detail.attempt.startedAt)} · ${formatTimeOnly(detail.attempt.startedAt)}`}
          />
          <DetailRow
            label="End"
            value={`${formatDateOnly(detail.attempt.endedAt)} · ${formatTimeOnly(detail.attempt.endedAt)}`}
          />
          <DetailRow label="Total Time" value={formatDurationMs(detail.attempt.totalResponseTimeMs)} />
        </DetailGroup>

        <DetailGroup title="Performance">
          <DetailRow label="Score" value={`${detail.attempt.totalScore10}/10`} />
          <DetailRow
            label="Reading Stage"
            value={readingStage === null ? "-" : `${readingStage}`}
          />
          <DetailRow label="Instructional Need" value={instructionalNeed} />
        </DetailGroup>
      </div>

      <div className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-white p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--muted)]">
          Time Graph (per question)
        </p>
        <div className="mt-3 space-y-2">
          {detail.responses.map((response, index) => {
            const width = (response.responseTimeMs / maxResponseTime) * 100;
            return (
              <div key={response.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 text-xs">
                <span className="w-8 font-semibold text-[color:var(--ink)]">Q{response.displayOrder ?? index + 1}</span>
                <div className="h-2 rounded-full bg-[color:var(--surface-2)]">
                  <div
                    className="h-full rounded-full bg-[color:var(--brand-600)]"
                    style={{ width: `${Math.max(width, 4)}%` }}
                  />
                </div>
                <span className="font-semibold text-[color:var(--ink)]">{formatDurationMs(response.responseTimeMs)}</span>
              </div>
            );
          })}
        </div>
      </div>

      <Separator className="my-3" />

      <div className="space-y-2">
        {detail.responses.map((response, index) => {
          const prompt = response.promptText?.trim() || `Question ${response.displayOrder ?? index + 1}`;

          return (
            <div
              key={response.id}
              className="rounded-[var(--radius-lg)] border border-[color:var(--line)] bg-white px-3 py-2"
            >
              <p className="text-sm font-semibold text-[color:var(--ink)]">{prompt}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                <MetricChip label="Result" value={response.isCorrect ? "Correct" : "Wrong"} />
                <MetricChip label="Time" value={formatDurationMs(response.responseTimeMs)} />
                <MetricChip label="Answer" value={response.submittedAnswer} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type DetailGroupProps = {
  title: string;
  children: ReactNode;
};

function DetailGroup({ title, children }: DetailGroupProps) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[color:var(--line)] bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--muted)]">{title}</p>
      <div className="mt-2 space-y-2">{children}</div>
    </div>
  );
}

type DetailRowProps = {
  label: string;
  value: string | number;
};

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[color:var(--muted)]">
        {label}
      </p>
      <p className="text-sm font-semibold text-[color:var(--ink)]">{value}</p>
    </div>
  );
}
