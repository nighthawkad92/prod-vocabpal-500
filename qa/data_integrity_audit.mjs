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
  teacherName: (process.env.TEACHER_NAME ?? "QA Data Agent").trim(),
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

async function completeAttempt(student) {
  const start = await callFunction("student-start-attempt", {
    method: "POST",
    body: { ...student, attemptSource: "qa" },
  });
  expectStatus(start, 200, "student-start-attempt");
  const attemptId = start.payload?.attemptId;
  const firstQuestion = start.payload?.firstQuestion;
  assert(attemptId && firstQuestion, "student-start-attempt missing attemptId or firstQuestion");

  let question = firstQuestion;
  let ix = 0;
  while (question) {
    const shownAtMs = Date.now() + ix * 2100;
    const shownAtIso = new Date(shownAtMs).toISOString();
    const answeredAtIso = new Date(shownAtMs + 1200 + ix * 75).toISOString();
    const answer = answerByDisplayOrder[question.displayOrder] ?? "sand";

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

async function cleanupQaAttempts(token, attemptIds) {
  const uniqueAttemptIds = Array.from(new Set(attemptIds.filter(Boolean)));
  if (!token || uniqueAttemptIds.length === 0) return;
  const cleanup = await callFunction("teacher-attempt-archive", {
    method: "POST",
    token,
    body: { attemptIds: uniqueAttemptIds },
  });
  const missingAttemptIds = Array.isArray(cleanup.payload?.missingAttemptIds)
    ? cleanup.payload.missingAttemptIds.filter((value) => typeof value === "string")
    : [];
  const idempotentMissingOnly =
    cleanup.status === 404 &&
    missingAttemptIds.length > 0 &&
    missingAttemptIds.length <= uniqueAttemptIds.length;
  if (cleanup.status !== 200 && !idempotentMissingOnly) {
    throw new Error(`teacher-attempt-archive cleanup failed with ${cleanup.status}: ${JSON.stringify(cleanup.payload)}`);
  }
  addCheck("qa-cleanup-archives", true, {
    requested: uniqueAttemptIds.length,
    movedToArchivesCount:
      cleanup.payload?.movedToArchivesCount ??
      cleanup.payload?.archivedCount ??
      Math.max(uniqueAttemptIds.length - missingAttemptIds.length, 0),
    skippedMissing: missingAttemptIds.length,
    legacyArchivedCountPresent: typeof cleanup.payload?.archivedCount === "number",
  });
}

function sumResponseTimes(rows) {
  return rows.reduce((acc, row) => acc + (Number(row.responseTimeMs) || 0), 0);
}

async function run() {
  const token = await loginTeacher();
  report.artifacts.teacherTokenIssued = true;

  const windowId = await createWindow(token);
  report.artifacts.windowId = windowId;

  const runId = Date.now().toString().slice(-6);
  const sharedIdentity = {
    firstName: `QD${runId}`,
    lastName: "Patel",
  };
  const studentClassA = { ...sharedIdentity, className: "Class 1 - Section A" };
  const studentClassB = { ...sharedIdentity, className: "Class 2 - Section B" };

  const attemptA = await completeAttempt(studentClassA);
  const attemptB = await completeAttempt(studentClassB);
  report.artifacts.attemptIds = [attemptA.attemptId, attemptB.attemptId];

  addCheck("attempts-completed", true, {
    classA: { attemptId: attemptA.attemptId, score: attemptA.completion?.totalScore10 ?? null },
    classB: { attemptId: attemptB.attemptId, score: attemptB.completion?.totalScore10 ?? null },
  });

  const listBeforeArchive = await callFunction("teacher-dashboard-list?limit=250&source=all", { token });
  expectStatus(listBeforeArchive, 200, "teacher-dashboard-list (before archive)");

  const matchedByIdentity = (listBeforeArchive.payload?.attempts ?? []).filter(
    (attempt) =>
      attempt.student?.firstName === sharedIdentity.firstName &&
      attempt.student?.lastName === sharedIdentity.lastName,
  );

  const classSet = new Set(matchedByIdentity.map((row) => row.student?.className).filter(Boolean));
  const identityClassIsolationPass =
    classSet.has(studentClassA.className) &&
    classSet.has(studentClassB.className) &&
    classSet.size >= 2;

  addCheck("identity-class-isolation", identityClassIsolationPass, {
    matchedAttempts: matchedByIdentity.length,
    classes: Array.from(classSet),
  });

  const detailA = await callFunction(`teacher-attempt-detail/${attemptA.attemptId}`, { token });
  const detailB = await callFunction(`teacher-attempt-detail/${attemptB.attemptId}`, { token });
  expectStatus(detailA, 200, "teacher-attempt-detail A");
  expectStatus(detailB, 200, "teacher-attempt-detail B");

  const details = [detailA.payload, detailB.payload];
  const timeIntegrityPass = details.every((detail) => {
    const responses = detail?.responses ?? [];
    const totalResponseMs = Number(detail?.attempt?.totalResponseTimeMs ?? -1);
    if (!Number.isFinite(totalResponseMs) || totalResponseMs < 0) return false;
    const responsesValid = responses.every((row) => Number.isFinite(row.responseTimeMs) && row.responseTimeMs >= 0);
    if (!responsesValid) return false;
    const summed = sumResponseTimes(responses);
    return totalResponseMs >= summed;
  });

  addCheck("attempt-time-integrity", timeIntegrityPass, {
    attemptIds: [attemptA.attemptId, attemptB.attemptId],
  });

  const archive = await callFunction("teacher-attempt-archive", {
    method: "POST",
    token,
    body: {
      attemptIds: [attemptA.attemptId],
    },
  });
  expectStatus(archive, 200, "teacher-attempt-archive");
  const archiveCompatibilityPass =
    Number.isFinite(Number(archive.payload?.movedToArchivesCount)) &&
    typeof archive.payload?.archivedCount === "number";
  addCheck("archive-response-compatibility", archiveCompatibilityPass, {
    movedToArchivesCount: archive.payload?.movedToArchivesCount ?? null,
    archivedCount: archive.payload?.archivedCount ?? null,
  });

  const listAfterArchive = await callFunction("teacher-dashboard-list?limit=250&source=all", { token });
  expectStatus(listAfterArchive, 200, "teacher-dashboard-list (after archive)");
  const listContractPass = (listAfterArchive.payload?.attempts ?? []).every(
    (attempt) => "archiveAt" in attempt && "archivedAt" in attempt,
  );
  addCheck("attempt-list-archive-contract", listContractPass, {
    checkedAttempts: (listAfterArchive.payload?.attempts ?? []).length,
  });

  const visibleAttemptIds = new Set((listAfterArchive.payload?.attempts ?? []).map((row) => row.id));
  const archiveVisibilityPass = !visibleAttemptIds.has(attemptA.attemptId) && visibleAttemptIds.has(attemptB.attemptId);

  addCheck("archives-removes-only-target-attempt", archiveVisibilityPass, {
    archivedAttemptId: attemptA.attemptId,
    retainedAttemptId: attemptB.attemptId,
  });

  const retakeAfterArchive = await callFunction("student-start-attempt", {
    method: "POST",
    body: studentClassA,
  });

  const untouchedClassRetake = await callFunction("student-start-attempt", {
    method: "POST",
    body: studentClassB,
  });

  const reopenPass = retakeAfterArchive.status === 200 && untouchedClassRetake.status === 409;
  addCheck("archives-reopens-only-target-student", reopenPass, {
    archivedClassStatus: retakeAfterArchive.status,
    untouchedClassStatus: untouchedClassRetake.status,
  });

  const summary = await callFunction("teacher-dashboard-summary?source=all", { token });
  const summaryPass = summary.status === 200 && Number.isFinite(summary.payload?.attemptsTotal);
  addCheck("summary-available", summaryPass, {
    status: summary.status,
    attemptsTotal: summary.payload?.attemptsTotal ?? null,
    attemptsToday: summary.payload?.attemptsToday ?? null,
  });

  const cleanupAttemptIds = [...report.artifacts.attemptIds];
  if (retakeAfterArchive.status === 200 && retakeAfterArchive.payload?.attemptId) {
    cleanupAttemptIds.push(retakeAfterArchive.payload.attemptId);
  }
  await cleanupQaAttempts(token, cleanupAttemptIds);

  await callFunction("teacher-windows", {
    method: "PATCH",
    token,
    body: { windowId, status: "ended" },
  });
  await callFunction("teacher-logout", { method: "POST", token });

  const allPass = report.checks.every((check) => check.pass);
  report.status = allPass ? "passed" : "failed";
  report.summary = {
    totalChecks: report.checks.length,
    passedChecks: report.checks.filter((check) => check.pass).length,
    failedChecks: report.checks.filter((check) => !check.pass).length,
  };
}

const outDir = join(process.cwd(), "qa", "reports");
mkdirSync(outDir, { recursive: true });
const latestPath = join(outDir, "latest_data_integrity_audit.json");
const datedPath = join(outDir, `data_integrity_audit_${new Date().toISOString().replace(/[:.]/g, "-")}.json`);

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
  console.log(`Data integrity report written to ${latestPath}`);
  console.log(`Data integrity report written to ${datedPath}`);
  if (report.status !== "passed") {
    process.exitCode = 1;
  }
}
