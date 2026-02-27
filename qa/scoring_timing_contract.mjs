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
  supabaseUrl: process.env.SUPABASE_URL.trim().replace(/\/$/, ""),
  anonKey: process.env.SUPABASE_ANON_KEY.trim(),
  teacherPasscode: process.env.TEACHER_PASSCODE.trim(),
  teacherName: (process.env.TEACHER_NAME ?? "QA Scoring Agent").trim(),
  qaSourceToken: (process.env.QA_SOURCE_TOKEN ?? "").trim(),
};

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
  checks: [],
  artifacts: {},
};

function addCheck(name, pass, details = {}) {
  report.checks.push({
    name,
    pass,
    at: new Date().toISOString(),
    details,
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function callFunction(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${config.supabaseUrl}/functions/v1/${path}`, {
    method,
    headers: {
      apikey: config.anonKey,
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(config.qaSourceToken ? { "x-vocabpal-qa-source-token": config.qaSourceToken } : {}),
    },
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
  });

  const text = await res.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }

  return {
    ok: res.ok,
    status: res.status,
    payload,
  };
}

function expectStatus(result, status, context) {
  if (result.status !== status) {
    throw new Error(`${context} failed with ${result.status}: ${JSON.stringify(result.payload)}`);
  }
}

async function loginTeacher() {
  const result = await callFunction("teacher-login", {
    method: "POST",
    body: {
      fullName: config.teacherName,
      passcode: config.teacherPasscode,
    },
  });
  expectStatus(result, 200, "teacher-login");
  assert(result.payload?.token, "teacher-login did not return token");
  addCheck("teacher-login", true, { teacherName: config.teacherName });
  return result.payload.token;
}

async function createWindow(token) {
  const now = Date.now();
  const result = await callFunction("teacher-windows", {
    method: "POST",
    token,
    body: {
      scope: "all",
      status: "in_progress",
      startAt: new Date(now - 5 * 60 * 1000).toISOString(),
      endAt: new Date(now + 60 * 60 * 1000).toISOString(),
    },
  });
  expectStatus(result, 200, "teacher-windows POST");
  assert(result.payload?.window?.id, "teacher-windows did not return window id");
  addCheck("session-created", true, {
    status: result.payload.status,
    windowId: result.payload.window.id,
  });
  return result.payload.window.id;
}

async function runAttempt(student, { forceWrongAtDisplayOrder = null, forceWrongAll = false } = {}) {
  const start = await callFunction("student-start-attempt", {
    method: "POST",
    body: { ...student, attemptSource: "qa" },
  });
  expectStatus(start, 200, "student-start-attempt");

  const attemptId = start.payload?.attemptId;
  let question = start.payload?.firstQuestion ?? null;
  assert(attemptId && question, "student-start-attempt missing attemptId/firstQuestion");

  let ix = 0;
  while (question) {
    const shownAtMs = Date.now() + ix * 2300;
    const shownAtIso = new Date(shownAtMs).toISOString();
    const answeredAtIso = new Date(shownAtMs + 1100 + ix * 60).toISOString();
    let answer = answerByDisplayOrder[question.displayOrder] ?? "sand";
    if (forceWrongAll) {
      answer = `definitely-wrong-answer-${question.displayOrder}`;
    } else if (forceWrongAtDisplayOrder === question.displayOrder) {
      answer = `definitely-wrong-answer-${question.displayOrder}`;
    }

    const submit = await callFunction("student-submit-response", {
      method: "POST",
      body: {
        attemptId,
        questionItemId: question.id,
        stageNo: question.stageNo,
        itemNo: question.itemNo,
        answer,
        shownAtIso,
        answeredAtIso,
      },
    });
    expectStatus(submit, 200, "student-submit-response");
    question = submit.payload?.nextQuestion ?? null;
    ix += 1;
  }

  const complete = await callFunction("student-complete-attempt", {
    method: "POST",
    body: { attemptId },
  });
  expectStatus(complete, 200, "student-complete-attempt");

  return {
    attemptId,
    completion: complete.payload,
  };
}

async function readAttemptDetail(token, attemptId) {
  const detail = await callFunction(`teacher-attempt-detail/${attemptId}`, { token });
  expectStatus(detail, 200, "teacher-attempt-detail");
  return detail.payload;
}

async function cleanupAttempts(token, attemptIds) {
  const uniqueAttemptIds = [...new Set(attemptIds.filter(Boolean))];
  if (uniqueAttemptIds.length === 0) return;
  const archive = await callFunction("teacher-attempt-archive", {
    method: "POST",
    token,
    body: { attemptIds: uniqueAttemptIds },
  });
  if (!(archive.status === 200 || archive.status === 404)) {
    throw new Error(`cleanup archive failed with ${archive.status}: ${JSON.stringify(archive.payload)}`);
  }
}

async function endWindow(token, windowId) {
  if (!windowId) return;
  await callFunction("teacher-windows", {
    method: "PATCH",
    token,
    body: { windowId, status: "ended" },
  });
}

async function run() {
  const runId = Date.now().toString().slice(-6);
  const token = await loginTeacher();
  const windowId = await createWindow(token);

  const perfectStudent = {
    firstName: `QSU${runId}`,
    lastName: "Perfect",
    className: "Class 5 - Section A",
  };
  const failFastStudent = {
    firstName: `QSU${runId}`,
    lastName: "FailFast",
    className: "Class 5 - Section B",
  };

  const attemptIds = [];
  try {
    const perfect = await runAttempt(perfectStudent);
    attemptIds.push(perfect.attemptId);
    const failFast = await runAttempt(failFastStudent, { forceWrongAll: true });
    attemptIds.push(failFast.attemptId);

    addCheck("score-stage-perfect", perfect.completion?.totalScore10 === 10 && perfect.completion?.placementStage === 4, {
      attemptId: perfect.attemptId,
      totalScore10: perfect.completion?.totalScore10,
      placementStage: perfect.completion?.placementStage,
    });

    addCheck("score-stage-fail-fast", failFast.completion?.totalScore10 === 0 && failFast.completion?.placementStage === 0, {
      attemptId: failFast.attemptId,
      totalScore10: failFast.completion?.totalScore10,
      placementStage: failFast.completion?.placementStage,
    });

    const detail = await readAttemptDetail(token, perfect.attemptId);
    const responseRows = Array.isArray(detail?.responses) ? detail.responses : [];
    const allNonNegative = responseRows.every((row) => Number.isFinite(row.responseTimeMs) && row.responseTimeMs >= 0);
    const sumResponseMs = responseRows.reduce((sum, row) => sum + Number(row.responseTimeMs || 0), 0);
    const totalResponseTimeMs = Number(detail?.attempt?.totalResponseTimeMs ?? -1);
    const timingPass = allNonNegative && Number.isFinite(totalResponseTimeMs) && totalResponseTimeMs >= sumResponseMs;

    addCheck("timing-integrity", timingPass, {
      attemptId: perfect.attemptId,
      responseCount: responseRows.length,
      sumResponseMs,
      totalResponseTimeMs,
      allNonNegative,
    });

    report.artifacts = {
      windowId,
      attemptIds,
      perfectAttemptId: perfect.attemptId,
      failFastAttemptId: failFast.attemptId,
    };
  } finally {
    await cleanupAttempts(token, attemptIds);
    await endWindow(token, windowId);
    await callFunction("teacher-logout", { method: "POST", token });
  }
}

const outDir = join(process.cwd(), "qa", "reports");
mkdirSync(outDir, { recursive: true });
const latestPath = join(outDir, "latest_scoring_timing_contract.json");
const datedPath = join(outDir, `scoring_timing_contract_${new Date().toISOString().replace(/[:.]/g, "-")}.json`);

try {
  await run();
  const allPass = report.checks.every((entry) => entry.pass);
  report.status = allPass ? "passed" : "failed";
  report.summary = {
    totalChecks: report.checks.length,
    passedChecks: report.checks.filter((entry) => entry.pass).length,
    failedChecks: report.checks.filter((entry) => !entry.pass).length,
  };
  if (!allPass) {
    process.exitCode = 1;
  }
} catch (error) {
  report.status = "failed";
  report.error = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
}

const content = `${JSON.stringify(report, null, 2)}\n`;
writeFileSync(latestPath, content, "utf8");
writeFileSync(datedPath, content, "utf8");
console.log(`Scoring/timing report written to ${latestPath}`);
console.log(`Scoring/timing report written to ${datedPath}`);
