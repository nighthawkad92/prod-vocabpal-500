#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const requiredEnv = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "TEACHER_PASSCODE",
];

for (const key of requiredEnv) {
  if (!process.env[key] || !process.env[key].trim()) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const config = {
  appUrl: (process.env.APP_URL ?? "").trim().replace(/\/$/, ""),
  supabaseUrl: process.env.SUPABASE_URL.trim().replace(/\/$/, ""),
  anonKey: process.env.SUPABASE_ANON_KEY.trim(),
  teacherPasscode: process.env.TEACHER_PASSCODE.trim(),
  teacherName: (process.env.TEACHER_NAME ?? "QA Load Agent").trim(),
  qaSourceToken: (process.env.QA_SOURCE_TOKEN ?? "").trim(),
  totalStudents: Number(process.env.QA_LOAD_TOTAL_STUDENTS ?? 500),
  concurrency: Number(process.env.QA_LOAD_CONCURRENCY ?? 500),
  readBurstRequests: Number(process.env.QA_LOAD_READ_REQUESTS ?? 120),
  readBurstConcurrency: Number(process.env.QA_LOAD_READ_CONCURRENCY ?? 30),
  archiveBatchSize: Number(process.env.QA_LOAD_ARCHIVE_BATCH_SIZE ?? 50),
  archiveConcurrency: Number(process.env.QA_LOAD_ARCHIVE_CONCURRENCY ?? 4),
  thresholds: {
    errorRateMax: Number(process.env.QA_LOAD_MAX_ERROR_RATE ?? 0.01),
    startP95Ms: Number(process.env.QA_LOAD_P95_START_MS ?? 2500),
    submitP95Ms: Number(process.env.QA_LOAD_P95_SUBMIT_MS ?? 3000),
    readP95Ms: Number(process.env.QA_LOAD_P95_READ_MS ?? 2200),
    archiveP95Ms: Number(process.env.QA_LOAD_P95_ARCHIVE_MS ?? 3500),
  },
};

if (!Number.isFinite(config.totalStudents) || config.totalStudents <= 0) {
  console.error("QA_LOAD_TOTAL_STUDENTS must be a positive number.");
  process.exit(1);
}
if (!Number.isFinite(config.concurrency) || config.concurrency <= 0) {
  console.error("QA_LOAD_CONCURRENCY must be a positive number.");
  process.exit(1);
}

const answerByDisplayOrder = {
  1: "sand",
  2: "cat",
  3: "ship",
  4: "dog",
  5: "red",
  6: "green",
  7: "park",
  8: "happy",
  9: "She did well in her test",
  10: "proud",
};

const report = {
  runAt: new Date().toISOString(),
  status: "running",
  appUrl: config.appUrl || null,
  supabaseUrl: config.supabaseUrl,
  settings: {
    totalStudents: config.totalStudents,
    concurrency: config.concurrency,
    readBurstRequests: config.readBurstRequests,
    readBurstConcurrency: config.readBurstConcurrency,
    archiveBatchSize: config.archiveBatchSize,
    archiveConcurrency: config.archiveConcurrency,
  },
  thresholds: config.thresholds,
  checks: [],
  metrics: {
    totalOperations: 0,
    failedOperations: 0,
    errorRate: 0,
    p95Ms: {
      studentStart: null,
      firstSubmit: null,
      dashboardRead: null,
      archive: null,
    },
  },
  artifacts: {
    runId: null,
    windowId: null,
    teacherTokenIssued: false,
    startedAttemptCount: 0,
    submittedAttemptCount: 0,
    movedToArchivesAttemptCount: 0,
    archivedAttemptCount: 0,
  },
};

function addCheck(name, pass, details = {}) {
  report.checks.push({
    name,
    pass,
    at: new Date().toISOString(),
    details,
  });
}

function p95(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[idx];
}

function chunk(array, size) {
  const output = [];
  for (let i = 0; i < array.length; i += size) {
    output.push(array.slice(i, i + size));
  }
  return output;
}

async function runWithConcurrency(items, concurrency, worker) {
  const outputs = new Array(items.length);
  let index = 0;
  const safeConcurrency = Math.max(1, Math.min(concurrency, items.length));

  async function runner() {
    while (true) {
      const current = index;
      index += 1;
      if (current >= items.length) {
        return;
      }
      outputs[current] = await worker(items[current], current);
    }
  }

  await Promise.all(Array.from({ length: safeConcurrency }, () => runner()));
  return outputs;
}

async function callFunction(path, { method = "GET", token, body } = {}) {
  const startedAt = Date.now();
  try {
    const response = await fetch(`${config.supabaseUrl}/functions/v1/${path}`, {
      method,
      headers: {
        apikey: config.anonKey,
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(config.qaSourceToken ? { "x-vocabpal-qa-source-token": config.qaSourceToken } : {}),
      },
      body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
    });

    const durationMs = Date.now() - startedAt;
    const text = await response.text();
    let payload = {};
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { raw: text };
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      payload,
      durationMs,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      payload: null,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function loginTeacher() {
  const login = await callFunction("teacher-login", {
    method: "POST",
    body: {
      fullName: config.teacherName,
      passcode: config.teacherPasscode,
    },
  });

  if (!login.ok || !login.payload?.token) {
    throw new Error(`teacher-login failed (${login.status}): ${JSON.stringify(login.payload)}`);
  }

  addCheck("teacher-login", true, {
    teacherName: config.teacherName,
    status: login.status,
    durationMs: login.durationMs,
  });

  return login.payload.token;
}

async function getBaselineWindowStatus(token) {
  const result = await callFunction("teacher-windows", {
    method: "GET",
    token,
  });

  if (!result.ok || !result.payload?.window?.id || result.payload?.status !== "in_progress") {
    throw new Error(`teacher-windows GET failed (${result.status}): ${JSON.stringify(result.payload)}`);
  }

  addCheck("baseline-always-on", true, {
    windowId: result.payload.window.id,
    status: result.payload.status,
    durationMs: result.durationMs,
  });

  return result.payload.window.id;
}

async function logoutTeacher(token) {
  await callFunction("teacher-logout", { method: "POST", token });
}

function buildStudents(runId) {
  const students = [];
  for (let i = 0; i < config.totalStudents; i += 1) {
    const classNumber = (i % 6) + 1;
    const sectionLetter = String.fromCharCode(65 + (Math.floor(i / 6) % 6));
    students.push({
      firstName: `LD${runId}${String(i + 1).padStart(3, "0")}`,
      lastName: "Pilot",
      className: `Class ${classNumber} - Section ${sectionLetter}`,
    });
  }
  return students;
}

async function executeLoad(token, students) {
  const startDurations = [];
  const submitDurations = [];
  const readDurations = [];
  const archiveDurations = [];
  const attemptIds = [];

  let failedOperations = 0;
  let totalOperations = 0;

  const startResults = await runWithConcurrency(students, config.concurrency, async (student) => {
    const started = await callFunction("student-start-attempt", {
      method: "POST",
      body: { ...student, attemptSource: "qa" },
    });

    totalOperations += 1;
    startDurations.push(started.durationMs);

    if (!started.ok || !started.payload?.attemptId || !started.payload?.firstQuestion) {
      failedOperations += 1;
      return {
        student,
        startStatus: started.status,
        startDurationMs: started.durationMs,
        submitStatus: null,
        submitDurationMs: null,
        attemptId: null,
        error: started.error,
      };
    }

    const attemptId = started.payload.attemptId;
    const firstQuestion = started.payload.firstQuestion;
    attemptIds.push(attemptId);

    const now = Date.now();
    const shownAtIso = new Date(now - 1000).toISOString();
    const answeredAtIso = new Date(now).toISOString();
    const answer =
      answerByDisplayOrder[firstQuestion.displayOrder] ??
      firstQuestion.options?.[0] ??
      "sand";

    const submitted = await callFunction("student-submit-response", {
      method: "POST",
      body: {
        attemptId,
        questionItemId: firstQuestion.id,
        stageNo: firstQuestion.stageNo,
        itemNo: firstQuestion.itemNo,
        answer,
        shownAtIso,
        answeredAtIso,
      },
    });

    totalOperations += 1;
    submitDurations.push(submitted.durationMs);

    if (!submitted.ok) {
      failedOperations += 1;
    }

    return {
      student,
      startStatus: started.status,
      startDurationMs: started.durationMs,
      submitStatus: submitted.status,
      submitDurationMs: submitted.durationMs,
      attemptId,
      error: started.error || submitted.error,
    };
  });

  const readOps = Array.from({ length: config.readBurstRequests }, (_, index) => index);
  const readResults = await runWithConcurrency(
    readOps,
    config.readBurstConcurrency,
    async (index) => {
      const endpoint = index % 2 === 0
        ? "teacher-dashboard-summary?source=all"
        : "teacher-dashboard-list?limit=120&source=all";
      const read = await callFunction(endpoint, { token });
      totalOperations += 1;
      readDurations.push(read.durationMs);
      if (!read.ok) {
        failedOperations += 1;
      }

      return {
        endpoint,
        status: read.status,
        durationMs: read.durationMs,
        error: read.error,
      };
    },
  );

  const archiveBatches = chunk(attemptIds, config.archiveBatchSize);
  const archiveResults = await runWithConcurrency(
    archiveBatches,
    config.archiveConcurrency,
    async (batchAttemptIds) => {
      const archived = await callFunction("teacher-attempt-archive", {
        method: "POST",
        token,
        body: {
          attemptIds: batchAttemptIds,
        },
      });

      totalOperations += 1;
      archiveDurations.push(archived.durationMs);
      if (!archived.ok) {
        failedOperations += 1;
      }

      return {
        batchSize: batchAttemptIds.length,
        status: archived.status,
        durationMs: archived.durationMs,
        movedToArchivesCount: Number(
          archived.payload?.movedToArchivesCount ?? archived.payload?.archivedCount ?? 0,
        ),
        archivedCount: Number(archived.payload?.archivedCount ?? 0),
        error: archived.error,
      };
    },
  );

  const summaryCheck = await callFunction("teacher-dashboard-summary?source=all", { token });
  totalOperations += 1;
  readDurations.push(summaryCheck.durationMs);
  if (!summaryCheck.ok) {
    failedOperations += 1;
  }

  const p95Start = p95(startDurations);
  const p95Submit = p95(submitDurations);
  const p95Read = p95(readDurations);
  const p95Archive = p95(archiveDurations);

  const uniqueAttemptIds = new Set(attemptIds);
  const archivedTotal = archiveResults.reduce((sum, item) => sum + item.movedToArchivesCount, 0);

  report.metrics.totalOperations = totalOperations;
  report.metrics.failedOperations = failedOperations;
  report.metrics.errorRate = totalOperations > 0 ? failedOperations / totalOperations : 1;
  report.metrics.p95Ms.studentStart = p95Start;
  report.metrics.p95Ms.firstSubmit = p95Submit;
  report.metrics.p95Ms.dashboardRead = p95Read;
  report.metrics.p95Ms.archive = p95Archive;

  report.artifacts.startedAttemptCount = attemptIds.length;
  report.artifacts.submittedAttemptCount = startResults.filter((item) => item.submitStatus === 200).length;
  report.artifacts.movedToArchivesAttemptCount = archivedTotal;
  report.artifacts.archivedAttemptCount = archivedTotal;

  const thresholdsPass = {
    errorRate: report.metrics.errorRate < config.thresholds.errorRateMax,
    startP95: p95Start !== null && p95Start <= config.thresholds.startP95Ms,
    submitP95: p95Submit !== null && p95Submit <= config.thresholds.submitP95Ms,
    readP95: p95Read !== null && p95Read <= config.thresholds.readP95Ms,
    archiveP95: p95Archive !== null && p95Archive <= config.thresholds.archiveP95Ms,
  };

  addCheck("load-thresholds", Object.values(thresholdsPass).every(Boolean), {
    thresholdsPass,
    p95Ms: report.metrics.p95Ms,
    errorRate: Number(report.metrics.errorRate.toFixed(4)),
  });

  const invariantsPass =
    attemptIds.length === uniqueAttemptIds.size &&
    archivedTotal >= attemptIds.length &&
    summaryCheck.status === 200;

  addCheck("load-data-invariants", invariantsPass, {
    startedAttempts: attemptIds.length,
    uniqueAttempts: uniqueAttemptIds.size,
    movedToArchivesCount: archivedTotal,
    legacyArchivedCountAlias: report.artifacts.archivedAttemptCount,
    summaryStatus: summaryCheck.status,
  });

  addCheck("read-burst-success-rate", readResults.every((item) => item.status === 200), {
    totalReads: readResults.length,
    failedReads: readResults.filter((item) => item.status !== 200).length,
  });

  return {
    thresholdsPass,
    invariantsPass,
  };
}

async function run() {
  const runId = Date.now().toString().slice(-6);
  report.artifacts.runId = runId;

  const token = await loginTeacher();
  report.artifacts.teacherTokenIssued = true;

  const windowId = await getBaselineWindowStatus(token);
  report.artifacts.windowId = windowId;

  try {
    const students = buildStudents(runId);
    const results = await executeLoad(token, students);

    const allChecksPass = report.checks.every((check) => check.pass);
    const thresholdPass = Object.values(results.thresholdsPass).every(Boolean);

    report.status = allChecksPass && thresholdPass ? "passed" : "failed";
  } finally {
    await logoutTeacher(token);
  }
}

const outDir = join(process.cwd(), "qa", "reports");
mkdirSync(outDir, { recursive: true });
const latestPath = join(outDir, "latest_load_profile_500.json");
const datedPath = join(outDir, `load_profile_500_${new Date().toISOString().replace(/[:.]/g, "-")}.json`);

try {
  await run();
} catch (error) {
  report.status = "failed";
  report.error = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  const content = `${JSON.stringify(report, null, 2)}\n`;
  writeFileSync(latestPath, content, "utf8");
  writeFileSync(datedPath, content, "utf8");
  console.log(`Load profile report written to ${latestPath}`);
  console.log(`Load profile report written to ${datedPath}`);
  if (report.status !== "passed") {
    process.exitCode = 1;
  }
}
