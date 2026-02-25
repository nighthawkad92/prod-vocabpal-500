import { useCallback, useEffect, useState, type FormEvent } from "react";
import { motion } from "motion/react";
import { RefreshCw } from "lucide-react";
import { MotionButton } from "@/components/motion-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import type { MotionPolicy } from "@/hooks/use-motion-policy";
import type { SessionStatus, TeacherAttempt, TeacherAttemptDetail, TeacherSummary } from "@/features/shared/types";
import { callFunction } from "@/lib/env";
import { formatDate, formatDurationMs, formatSessionStatus } from "@/lib/format";
import type { SfxEvent } from "@/lib/sfx";
import logoVocabPal from "@/assets/branding/logo-vocabpal.png";

const TOKEN_KEY = "vocabpal.teacher.token";
const NAME_KEY = "vocabpal.teacher.name";

type TeacherModeProps = {
  motionPolicy: MotionPolicy;
  playSound: (event: SfxEvent, options?: { fromInteraction?: boolean }) => Promise<boolean>;
  onAuthStateChange?: (active: boolean) => void;
};

type CreateWindowResponse = {
  status: SessionStatus;
  window: {
    id: string;
  };
};

type UpdateWindowResponse = {
  status: SessionStatus;
  usedLatest: boolean;
  window: {
    id: string;
  };
};

const cardMotion = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
};

export function TeacherMode({
  motionPolicy,
  playSound,
  onAuthStateChange,
}: TeacherModeProps) {
  const [fullName, setFullName] = useState(localStorage.getItem(NAME_KEY) ?? "Akash Datta");
  const [passcode, setPasscode] = useState("");
  const [token, setToken] = useState(localStorage.getItem(TOKEN_KEY));
  const [summary, setSummary] = useState<TeacherSummary | null>(null);
  const [attempts, setAttempts] = useState<TeacherAttempt[]>([]);
  const [detail, setDetail] = useState<TeacherAttemptDetail | null>(null);

  const [windowScope, setWindowScope] = useState<"all" | "allowlist">("all");
  const [createWindowStatus, setCreateWindowStatus] = useState<SessionStatus>("in_progress");
  const [allowlistText, setAllowlistText] = useState("Ria,Patel,Class A");
  const [statusWindowId, setStatusWindowId] = useState("");
  const [nextWindowStatus, setNextWindowStatus] = useState<SessionStatus>("paused");
  const [reopenFirstName, setReopenFirstName] = useState("");
  const [reopenLastName, setReopenLastName] = useState("");
  const [reopenClassName, setReopenClassName] = useState("Class A");
  const [reopenReason, setReopenReason] = useState("Pilot retake approved");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(
    async (authToken = token ?? undefined) => {
      if (!authToken) return;

      setBusy(true);
      setError(null);
      setNotice(null);

      try {
        const [sum, list] = await Promise.all([
          callFunction<TeacherSummary>("teacher-dashboard-summary", { token: authToken }),
          callFunction<{ attempts: TeacherAttempt[] }>("teacher-dashboard-list?limit=30", {
            token: authToken,
          }),
        ]);

        setSummary(sum);
        setAttempts(list.attempts);

        if (list.attempts.length > 0) {
          const firstAttemptId = list.attempts[0].id;
          const firstDetail = await callFunction<TeacherAttemptDetail>(
            `teacher-attempt-detail/${firstAttemptId}`,
            { token: authToken },
          );
          setDetail(firstDetail);
        } else {
          setDetail(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
        void playSound("error", { fromInteraction: true });
      } finally {
        setBusy(false);
      }
    },
    [playSound, token],
  );

  useEffect(() => {
    if (!token) return;
    void refresh(token);
  }, [token, refresh]);

  useEffect(() => {
    onAuthStateChange?.(Boolean(token));
  }, [onAuthStateChange, token]);

  useEffect(() => {
    return () => {
      onAuthStateChange?.(false);
    };
  }, [onAuthStateChange]);

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
        localStorage.setItem(NAME_KEY, response.teacherName);
        setPasscode("");
        await refresh(response.token);
        void playSound("submit", { fromInteraction: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to sign in");
        void playSound("error", { fromInteraction: true });
      } finally {
        setBusy(false);
      }
    },
    [fullName, passcode, playSound, refresh],
  );

  const logout = useCallback(async () => {
    if (!token) return;

    try {
      await callFunction("teacher-logout", { method: "POST", token });
    } finally {
      localStorage.removeItem(TOKEN_KEY);
      setToken(null);
      setSummary(null);
      setAttempts([]);
      setDetail(null);
      void playSound("tap", { fromInteraction: true });
    }
  }, [playSound, token]);

  const createSession = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (!token) return;

      setBusy(true);
      setError(null);
      setNotice(null);

      try {
        const allowlist = allowlistText
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const [firstName, lastName, className] = line
              .split(",")
              .map((value) => value.trim());
            return { firstName, lastName, className };
          });

        const response = await callFunction<CreateWindowResponse>("teacher-windows", {
          method: "POST",
          token,
          body: {
            scope: windowScope,
            allowlist: windowScope === "allowlist" ? allowlist : [],
            status: createWindowStatus,
            startAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
            endAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          },
        });

        setStatusWindowId(response.window.id);
        setNotice(
          `Session ${response.window.id} created (${formatSessionStatus(response.status)}).`,
        );
        await refresh(token);
        void playSound("submit", { fromInteraction: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create session");
        void playSound("error", { fromInteraction: true });
      } finally {
        setBusy(false);
      }
    },
    [allowlistText, createWindowStatus, playSound, refresh, token, windowScope],
  );

  const updateSessionStatus = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (!token) return;

      setBusy(true);
      setError(null);
      setNotice(null);

      try {
        const response = await callFunction<UpdateWindowResponse>("teacher-windows", {
          method: "PATCH",
          token,
          body: {
            windowId: statusWindowId.trim() || undefined,
            status: nextWindowStatus,
          },
        });

        setStatusWindowId(response.window.id);
        setNotice(
          `Session ${response.window.id} set to ${formatSessionStatus(response.status)}${
            response.usedLatest ? " (latest session)." : "."
          }`,
        );
        await refresh(token);
        void playSound("submit", { fromInteraction: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update session status");
        void playSound("error", { fromInteraction: true });
      } finally {
        setBusy(false);
      }
    },
    [nextWindowStatus, playSound, refresh, statusWindowId, token],
  );

  const loadAttempt = useCallback(
    async (attemptId: string) => {
      if (!token) return;

      setBusy(true);
      setError(null);
      setNotice(null);

      try {
        const nextDetail = await callFunction<TeacherAttemptDetail>(
          `teacher-attempt-detail/${attemptId}`,
          { token },
        );
        setDetail(nextDetail);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load attempt detail");
        void playSound("error", { fromInteraction: true });
      } finally {
        setBusy(false);
      }
    },
    [playSound, token],
  );

  const reopenStudent = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (!token) return;

      setBusy(true);
      setError(null);
      setNotice(null);

      try {
        const response = await callFunction<{
          reopened: boolean;
          attemptsUsed: number;
          totalReopens: number;
          remainingAttempts: number;
        }>("teacher-reopen", {
          method: "POST",
          token,
          body: {
            firstName: reopenFirstName,
            lastName: reopenLastName,
            className: reopenClassName,
            reason: reopenReason,
          },
        });

        setNotice(
          `Reopen granted. Attempts used: ${response.attemptsUsed}, total reopens: ${response.totalReopens}, remaining attempts: ${response.remainingAttempts}.`,
        );
        await refresh(token);
        void playSound("submit", { fromInteraction: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to reopen student");
        void playSound("error", { fromInteraction: true });
      } finally {
        setBusy(false);
      }
    },
    [
      playSound,
      refresh,
      reopenClassName,
      reopenFirstName,
      reopenLastName,
      reopenReason,
      token,
    ],
  );

  if (!token) {
    return (
      <section
        className="flex min-h-[calc(100vh-10rem)] flex-col items-center justify-center gap-6"
        aria-label="teacher-login"
      >
        <div className="flex flex-col items-center gap-2 px-2 text-center">
          <img src={logoVocabPal} alt="VocabPal" className="h-auto w-[250px] max-w-full" />
          <p className="text-base font-semibold text-[color:var(--ink)]">English Vocabulary Revision</p>
        </div>

        <Card className="w-full max-w-[450px]">
          <CardHeader>
            <CardTitle className="text-left text-4xl">Baseline Test</CardTitle>
            <CardDescription className="text-left">Teacher sign in</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="card grid gap-3" onSubmit={login}>
              <Label htmlFor="teacher-name">Full Name</Label>
              <Input
                id="teacher-name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
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

  return (
    <section className="space-y-4" aria-label="teacher-mode">
      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="text-4xl">Teacher Dashboard</CardTitle>
            <CardDescription>Monitor attempts, session state, and retake controls.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <MotionButton
              motionPolicy={motionPolicy}
              variant="secondary"
              onClick={() => {
                void playSound("tap", { fromInteraction: true });
                void refresh();
              }}
              disabled={busy}
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </MotionButton>
            <MotionButton
              motionPolicy={motionPolicy}
              variant="destructive"
              onClick={logout}
            >
              Logout
            </MotionButton>
          </div>
        </CardHeader>

        {summary && (
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Attempts Today" value={summary.attemptsToday} />
              <Stat label="Total Attempts" value={summary.attemptsTotal} />
              <Stat label="Completed" value={summary.completedAttempts} />
              <Stat label="Avg Score" value={summary.avgScore10} />
            </div>
            {summary.classBreakdown.length > 0 && (
              <>
                <Separator className="my-4" />
                <div className="flex flex-wrap gap-2">
                  {summary.classBreakdown.map((item) => (
                    <Badge key={item.className}>
                      {item.className}: {item.attempts} attempts, avg {item.avgScore10}
                    </Badge>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        )}
      </Card>

      <motion.div
        className="grid gap-4 xl:grid-cols-2"
        {...(motionPolicy === "full" ? cardMotion : { initial: false, animate: { opacity: 1, y: 0 } })}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl">Create Baseline Session</CardTitle>
            <CardDescription>
              Set who can take the baseline and choose session state.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={createSession}>
              <Label htmlFor="window-scope">Scope</Label>
              <Select
                id="window-scope"
                value={windowScope}
                onChange={(event) => {
                  setWindowScope(event.target.value as "all" | "allowlist");
                  void playSound("tap", { fromInteraction: true });
                }}
              >
                <option value="all">All Students</option>
                <option value="allowlist">Allowlist Only</option>
              </Select>

              <Label htmlFor="create-window-status">Initial Status</Label>
              <Select
                id="create-window-status"
                value={createWindowStatus}
                onChange={(event) => {
                  setCreateWindowStatus(event.target.value as SessionStatus);
                  void playSound("tap", { fromInteraction: true });
                }}
              >
                <option value="in_progress">In Progress</option>
                <option value="paused">Paused</option>
                <option value="ended">Ended</option>
              </Select>

              {windowScope === "allowlist" && (
                <>
                  <Label htmlFor="allowlist-text">Allowlist (one per line: First,Last,Class)</Label>
                  <Textarea
                    id="allowlist-text"
                    rows={4}
                    value={allowlistText}
                    onChange={(event) => setAllowlistText(event.target.value)}
                  />
                </>
              )}

              <MotionButton motionPolicy={motionPolicy} type="submit" disabled={busy}>
                Create Session
              </MotionButton>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-3xl">Update Session Status</CardTitle>
            <CardDescription>
              Keep session open, pause intake, or end the session.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={updateSessionStatus}>
              <Label htmlFor="status-window-id">Session ID (optional)</Label>
              <Input
                id="status-window-id"
                value={statusWindowId}
                onChange={(event) => setStatusWindowId(event.target.value)}
                placeholder="Leave blank to target latest session"
              />

              <Label htmlFor="next-window-status">Status</Label>
              <Select
                id="next-window-status"
                value={nextWindowStatus}
                onChange={(event) => {
                  setNextWindowStatus(event.target.value as SessionStatus);
                  void playSound("tap", { fromInteraction: true });
                }}
              >
                <option value="in_progress">In Progress</option>
                <option value="paused">Paused</option>
                <option value="ended">Ended</option>
              </Select>

              <MotionButton motionPolicy={motionPolicy} type="submit" disabled={busy}>
                Update Status
              </MotionButton>
            </form>
          </CardContent>
        </Card>
      </motion.div>

      <Card>
        <CardHeader>
          <CardTitle className="text-3xl">Reopen Student Baseline</CardTitle>
          <CardDescription>
            Grant a controlled retake for a specific student identity.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-5" onSubmit={reopenStudent}>
            <div className="space-y-1">
              <Label htmlFor="reopen-first">First Name</Label>
              <Input
                id="reopen-first"
                value={reopenFirstName}
                onChange={(event) => setReopenFirstName(event.target.value)}
                required
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="reopen-last">Last Name</Label>
              <Input
                id="reopen-last"
                value={reopenLastName}
                onChange={(event) => setReopenLastName(event.target.value)}
                required
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="reopen-class">Class</Label>
              <Input
                id="reopen-class"
                value={reopenClassName}
                onChange={(event) => setReopenClassName(event.target.value)}
                required
              />
            </div>

            <div className="space-y-1 xl:col-span-2">
              <Label htmlFor="reopen-reason">Reason</Label>
              <Input
                id="reopen-reason"
                value={reopenReason}
                onChange={(event) => setReopenReason(event.target.value)}
                required
              />
            </div>

            <div className="xl:col-span-5">
              <MotionButton motionPolicy={motionPolicy} type="submit" disabled={busy}>
                Grant Reopen
              </MotionButton>
            </div>
          </form>
        </CardContent>
      </Card>

      <motion.div
        className="grid gap-4 xl:grid-cols-[1fr_1.2fr]"
        {...(motionPolicy === "full" ? cardMotion : { initial: false, animate: { opacity: 1, y: 0 } })}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl">Attempts</CardTitle>
            <CardDescription>Click any record to inspect detailed response timing.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="attempt-list grid gap-2">
              {attempts.map((attempt) => (
                <MotionButton
                  key={attempt.id}
                  variant="secondary"
                  motionPolicy={motionPolicy}
                  className="attempt-item grid h-auto grid-cols-[1fr_auto_auto] gap-2 text-left"
                  onClick={() => {
                    void playSound("tap", { fromInteraction: true });
                    void loadAttempt(attempt.id);
                  }}
                >
                  <span>{attempt.student.firstName} {attempt.student.lastName} ({attempt.student.className})</span>
                  <span>{attempt.totalScore10}/10</span>
                  <span>{attempt.status}</span>
                </MotionButton>
              ))}
            </div>
          </CardContent>
        </Card>

        {detail && (
          <Card>
            <CardHeader>
              <CardTitle className="text-3xl">Attempt Detail</CardTitle>
              <CardDescription>
                {detail.attempt.student.firstName} {detail.attempt.student.lastName} ({detail.attempt.student.className})
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm text-[color:var(--muted)]">
                <p>Started: {formatDate(detail.attempt.startedAt)}</p>
                <p>Ended: {formatDate(detail.attempt.endedAt)}</p>
                <p>
                  Score: {detail.attempt.totalScore10}/10 | Stars: {detail.attempt.stars}
                </p>
                <p>Total Time: {formatDurationMs(detail.attempt.totalResponseTimeMs)}</p>
              </div>

              <Separator className="my-3" />

              <div className="response-table grid gap-2 text-sm">
                {detail.responses.map((response) => (
                  <div key={response.id} className="response-row grid grid-cols-[1fr_auto_auto] gap-2 rounded-lg bg-white px-3 py-2">
                    <span>S{response.stageNo} I{response.itemNo}</span>
                    <span>{response.isCorrect ? "Correct" : "Wrong"}</span>
                    <span>{formatDurationMs(response.responseTimeMs)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </motion.div>

      {notice && <Alert variant="success">{notice}</Alert>}
      {error && <Alert variant="destructive">{error}</Alert>}
    </section>
  );
}

type StatProps = {
  label: string;
  value: number;
};

function Stat({ label, value }: StatProps) {
  return (
    <div className="rounded-2xl border border-[color:var(--line)] bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--muted)]">{label}</p>
      <p className="text-2xl font-bold text-[color:var(--ink)]">{value}</p>
    </div>
  );
}
