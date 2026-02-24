import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import "./App.css";

type AppMode = "student" | "teacher";

type Question = {
  id: string;
  stageNo: number;
  itemNo: number;
  itemType: "mcq" | "dictation";
  promptText: string;
  options: string[] | null;
  ttsText: string | null;
  displayOrder: number;
};

type StudentComplete = {
  attemptId: string;
  totalScore10: number;
  totalCorrect: number;
  totalWrong: number;
  stars: number;
  placementStage: number;
  instructionalNeed: string;
};

type TeacherSummary = {
  attemptsToday: number;
  attemptsTotal: number;
  completedAttempts: number;
  avgScore10: number;
  classBreakdown: Array<{ className: string; attempts: number; avgScore10: number }>;
};

type TeacherAttempt = {
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

type TeacherAttemptDetail = {
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

const TOKEN_KEY = "vocabpal.teacher.token";
const NAME_KEY = "vocabpal.teacher.name";

function config() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const apikey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!supabaseUrl || !apikey) {
    return { error: "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in environment." };
  }
  return { supabaseUrl, apikey };
}

async function callFunction<T>(
  path: string,
  opts: {
    method?: "GET" | "POST" | "PATCH";
    body?: unknown;
    token?: string;
  } = {},
): Promise<T> {
  const c = config();
  if ("error" in c) {
    throw new Error(c.error);
  }
  const method = opts.method ?? "GET";
  const res = await fetch(`${c.supabaseUrl}/functions/v1/${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      apikey: c.apikey,
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: method === "GET" ? undefined : JSON.stringify(opts.body ?? {}),
  });

  const text = await res.text();
  const payload = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(payload.error ?? payload.message ?? `Request failed (${res.status})`);
  }
  return payload as T;
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function StudentMode() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [className, setClassName] = useState("Class A");
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [answer, setAnswer] = useState("");
  const [shownAtIso, setShownAtIso] = useState<string>("");
  const [answeredItems, setAnsweredItems] = useState(0);
  const [completion, setCompletion] = useState<StudentComplete | null>(null);
  const [busy, setBusy] = useState(false);
  const [audioBusy, setAudioBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (question) {
      setShownAtIso(new Date().toISOString());
      setAnswer("");
    }
  }, [question]);

  async function startAttempt(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await callFunction<{
        attemptId: string;
        firstQuestion?: Question;
        nextQuestion?: Question | null;
        progress: { answeredItems: number };
      }>("student-start-attempt", {
        method: "POST",
        body: { firstName, lastName, className },
      });
      setAttemptId(result.attemptId);
      setQuestion(result.firstQuestion ?? result.nextQuestion ?? null);
      setAnsweredItems(result.progress.answeredItems);
      setCompletion(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start attempt");
    } finally {
      setBusy(false);
    }
  }

  async function playAudio() {
    if (!question) return;
    setAudioBusy(true);
    setError(null);
    try {
      const audio = await callFunction<{ audioUrl: string }>(`student-question-audio/${question.id}`);
      const player = new Audio(audio.audioUrl);
      await player.play();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to play audio");
    } finally {
      setAudioBusy(false);
    }
  }

  async function submitAnswer(e: FormEvent) {
    e.preventDefault();
    if (!attemptId || !question || !answer.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const submit = await callFunction<{
        nextQuestion: Question | null;
        progress: { answeredItems: number };
      }>("student-submit-response", {
        method: "POST",
        body: {
          attemptId,
          questionItemId: question.id,
          stageNo: question.stageNo,
          itemNo: question.itemNo,
          answer,
          shownAtIso,
          answeredAtIso: new Date().toISOString(),
        },
      });

      setAnsweredItems(submit.progress.answeredItems);
      setQuestion(submit.nextQuestion);

      if (!submit.nextQuestion) {
        const complete = await callFunction<StudentComplete>("student-complete-attempt", {
          method: "POST",
          body: { attemptId },
        });
        setCompletion(complete);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit answer");
    } finally {
      setBusy(false);
    }
  }

  const progressLabel = useMemo(() => `${answeredItems}/10 answered`, [answeredItems]);

  return (
    <section className="panel">
      <h2>Student Baseline Test</h2>
      {!attemptId && (
        <form className="card" onSubmit={startAttempt}>
          <label>First Name</label>
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          <label>Last Name</label>
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          <label>Class</label>
          <input value={className} onChange={(e) => setClassName(e.target.value)} required />
          <button type="submit" disabled={busy}>
            {busy ? "Starting..." : "Start Baseline"}
          </button>
        </form>
      )}

      {attemptId && question && (
        <form className="card" onSubmit={submitAnswer}>
          <div className="meta-row">
            <span>Question {question.displayOrder} / 10</span>
            <span>{progressLabel}</span>
          </div>
          <p className="prompt">{question.promptText}</p>
          {question.ttsText && (
            <button type="button" className="secondary" onClick={playAudio} disabled={audioBusy}>
              {audioBusy ? "Loading audio..." : "Play Audio"}
            </button>
          )}

          {question.itemType === "mcq" && question.options && (
            <div className="option-grid">
              {question.options.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={answer === opt ? "option selected" : "option"}
                  onClick={() => setAnswer(opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}

          {question.itemType === "dictation" && (
            <>
              <label>Your answer</label>
              <input value={answer} onChange={(e) => setAnswer(e.target.value)} required />
            </>
          )}

          <button type="submit" disabled={busy || !answer.trim()}>
            {busy ? "Submitting..." : "Submit Answer"}
          </button>
        </form>
      )}

      {completion && (
        <div className="card success">
          <h3>Test Complete</h3>
          <p>Stars Collected: {completion.stars}</p>
          <p>Score: {completion.totalScore10} / 10</p>
          <p>Placement Stage: {completion.placementStage}</p>
          <p>Instructional Need: {completion.instructionalNeed}</p>
        </div>
      )}

      {error && <p className="error">{error}</p>}
    </section>
  );
}

function TeacherMode() {
  const [fullName, setFullName] = useState(localStorage.getItem(NAME_KEY) ?? "Akash Datta");
  const [passcode, setPasscode] = useState("");
  const [token, setToken] = useState(localStorage.getItem(TOKEN_KEY));
  const [summary, setSummary] = useState<TeacherSummary | null>(null);
  const [attempts, setAttempts] = useState<TeacherAttempt[]>([]);
  const [detail, setDetail] = useState<TeacherAttemptDetail | null>(null);
  const [windowScope, setWindowScope] = useState<"all" | "allowlist">("all");
  const [allowlistText, setAllowlistText] = useState("Ria,Patel,Class A");
  const [toggleWindowId, setToggleWindowId] = useState("");
  const [reopenFirstName, setReopenFirstName] = useState("");
  const [reopenLastName, setReopenLastName] = useState("");
  const [reopenClassName, setReopenClassName] = useState("Class A");
  const [reopenReason, setReopenReason] = useState("Pilot retake approved");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function login(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await callFunction<{ token: string; teacherName: string }>("teacher-login", {
        method: "POST",
        body: { fullName, passcode },
      });
      setToken(res.token);
      localStorage.setItem(TOKEN_KEY, res.token);
      localStorage.setItem(NAME_KEY, res.teacherName);
      setPasscode("");
      await refresh(res.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to login");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    if (!token) return;
    try {
      await callFunction("teacher-logout", { method: "POST", token });
    } finally {
      localStorage.removeItem(TOKEN_KEY);
      setToken(null);
      setSummary(null);
      setAttempts([]);
      setDetail(null);
    }
  }

  const refresh = useCallback(
    async (authToken = token ?? undefined) => {
      if (!authToken) return;
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        const [sum, list] = await Promise.all([
          callFunction<TeacherSummary>("teacher-dashboard-summary", { token: authToken }),
          callFunction<{ attempts: TeacherAttempt[] }>("teacher-dashboard-list?limit=30", { token: authToken }),
        ]);
        setSummary(sum);
        setAttempts(list.attempts);
        if (list.attempts.length > 0) {
          const firstId = list.attempts[0].id;
          const d = await callFunction<TeacherAttemptDetail>(`teacher-attempt-detail/${firstId}`, { token: authToken });
          setDetail(d);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
      } finally {
        setBusy(false);
      }
    },
    [token],
  );

  useEffect(() => {
    if (token) {
      void refresh(token);
    }
  }, [token, refresh]);

  async function createWindow(e: FormEvent) {
    e.preventDefault();
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
          const [firstName, lastName, className] = line.split(",").map((part) => part.trim());
          return { firstName, lastName, className };
        });
      await callFunction("teacher-windows", {
        method: "POST",
        token,
        body: {
          scope: windowScope,
          allowlist: windowScope === "allowlist" ? allowlist : [],
          isOpen: true,
          startAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
          endAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        },
      });
      setNotice("Baseline window created.");
      await refresh(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create window");
    } finally {
      setBusy(false);
    }
  }

  async function toggleWindow(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await callFunction("teacher-windows", {
        method: "PATCH",
        token,
        body: { windowId: toggleWindowId, isOpen: false },
      });
      setToggleWindowId("");
      setNotice("Window closed.");
      await refresh(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle window");
    } finally {
      setBusy(false);
    }
  }

  async function loadAttempt(attemptId: string) {
    if (!token) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const d = await callFunction<TeacherAttemptDetail>(`teacher-attempt-detail/${attemptId}`, { token });
      setDetail(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load attempt detail");
    } finally {
      setBusy(false);
    }
  }

  async function reopenStudent(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await callFunction<{
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
        `Reopen granted. Attempts used: ${result.attemptsUsed}, total reopens: ${result.totalReopens}, remaining attempts: ${result.remainingAttempts}.`,
      );
      await refresh(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reopen student");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <section className="panel">
        <h2>Teacher Dashboard</h2>
        <form className="card" onSubmit={login}>
          <label>Full Name</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          <label>Passcode</label>
          <input value={passcode} onChange={(e) => setPasscode(e.target.value)} required type="password" />
          <button type="submit" disabled={busy}>
            {busy ? "Signing in..." : "Sign In"}
          </button>
        </form>
        {error && <p className="error">{error}</p>}
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Teacher Dashboard</h2>
        <div className="row">
          <button className="secondary" onClick={() => refresh()} disabled={busy}>
            Refresh
          </button>
          <button className="danger" onClick={logout}>
            Logout
          </button>
        </div>
      </div>

      {summary && (
        <div className="card">
          <div className="metric-grid">
            <div><strong>Attempts Today:</strong> {summary.attemptsToday}</div>
            <div><strong>Total Attempts:</strong> {summary.attemptsTotal}</div>
            <div><strong>Completed:</strong> {summary.completedAttempts}</div>
            <div><strong>Avg Score:</strong> {summary.avgScore10}</div>
          </div>
        </div>
      )}

      <div className="card">
        <h3>Open Baseline Window</h3>
        <form onSubmit={createWindow}>
          <label>Scope</label>
          <select value={windowScope} onChange={(e) => setWindowScope(e.target.value as "all" | "allowlist")}>
            <option value="all">All Students</option>
            <option value="allowlist">Allowlist Only</option>
          </select>
          {windowScope === "allowlist" && (
            <>
              <label>Allowlist (one per line: First,Last,Class)</label>
              <textarea value={allowlistText} onChange={(e) => setAllowlistText(e.target.value)} rows={4} />
            </>
          )}
          <button type="submit" disabled={busy}>
            Create Window
          </button>
        </form>
      </div>

      <div className="card">
        <h3>Close Window</h3>
        <form onSubmit={toggleWindow}>
          <label>Window ID</label>
          <input value={toggleWindowId} onChange={(e) => setToggleWindowId(e.target.value)} placeholder="Paste window ID" />
          <button type="submit" disabled={busy || !toggleWindowId.trim()}>
            Close Window
          </button>
        </form>
      </div>

      <div className="card">
        <h3>Reopen Student Baseline</h3>
        <form onSubmit={reopenStudent}>
          <label>First Name</label>
          <input value={reopenFirstName} onChange={(e) => setReopenFirstName(e.target.value)} required />
          <label>Last Name</label>
          <input value={reopenLastName} onChange={(e) => setReopenLastName(e.target.value)} required />
          <label>Class</label>
          <input value={reopenClassName} onChange={(e) => setReopenClassName(e.target.value)} required />
          <label>Reason</label>
          <input value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} required />
          <button type="submit" disabled={busy}>
            Grant Reopen
          </button>
        </form>
      </div>

      <div className="card">
        <h3>Attempts</h3>
        <div className="attempt-list">
          {attempts.map((attempt) => (
            <button key={attempt.id} className="attempt-item" onClick={() => loadAttempt(attempt.id)}>
              <span>{attempt.student.firstName} {attempt.student.lastName} ({attempt.student.className})</span>
              <span>{attempt.totalScore10}/10</span>
              <span>{attempt.status}</span>
            </button>
          ))}
        </div>
      </div>

      {detail && (
        <div className="card">
          <h3>Attempt Detail</h3>
          <p>
            {detail.attempt.student.firstName} {detail.attempt.student.lastName} ({detail.attempt.student.className})
          </p>
          <p>Started: {formatDate(detail.attempt.startedAt)}</p>
          <p>Ended: {formatDate(detail.attempt.endedAt)}</p>
          <p>Score: {detail.attempt.totalScore10}/10 | Stars: {detail.attempt.stars}</p>
          <p>Total Time: {detail.attempt.totalResponseTimeMs} ms</p>
          <div className="response-table">
            {detail.responses.map((response) => (
              <div key={response.id} className="response-row">
                <span>S{response.stageNo} I{response.itemNo}</span>
                <span>{response.isCorrect ? "Correct" : "Wrong"}</span>
                <span>{response.responseTimeMs} ms</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {notice && <p className="notice">{notice}</p>}
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function App() {
  const [mode, setMode] = useState<AppMode>("student");
  const c = config();

  return (
    <main className="shell">
      <header className="hero">
        <p className="eyebrow">VocabPal Prototype</p>
        <h1>Baseline Assessment Console</h1>
        <p>Student and teacher workflows for the 500-student Ahmedabad pilot.</p>
        <div className="mode-switch">
          <button className={mode === "student" ? "active" : ""} onClick={() => setMode("student")}>Student</button>
          <button className={mode === "teacher" ? "active" : ""} onClick={() => setMode("teacher")}>Teacher</button>
        </div>
      </header>

      {"error" in c && <p className="error">{c.error}</p>}
      {mode === "student" ? <StudentMode /> : <TeacherMode />}
    </main>
  );
}

export default App;
