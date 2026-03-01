#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const requiredEnv = [
  "APP_URL",
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
  appUrl: process.env.APP_URL.trim().replace(/\/$/, ""),
  supabaseUrl: process.env.SUPABASE_URL.trim().replace(/\/$/, ""),
  anonKey: process.env.SUPABASE_ANON_KEY.trim(),
  teacherName: (process.env.TEACHER_NAME ?? "QA Agent").trim(),
  teacherPasscode: process.env.TEACHER_PASSCODE.trim(),
  studentPrefix: (process.env.QA_STUDENT_PREFIX ?? "QA").trim(),
  qaSourceToken: (process.env.QA_SOURCE_TOKEN ?? "").trim(),
};

const answerByDisplayOrder = {
  1: "sand",
  2: "cat!",
  3: "ship",
  4: "dog",
  5: "Red",
  6: " GREEN ",
  7: "Park",
  8: "happy.",
  9: "She did well in her test",
  10: "proud ",
};

const report = {
  runAt: new Date().toISOString(),
  status: "running",
  steps: [],
  artifacts: {},
};

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function addStep(step, details) {
  report.steps.push({
    step,
    at: new Date().toISOString(),
    details,
  });
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
    throw new Error(
      `${context} failed with ${result.status}: ${JSON.stringify(result.payload)}`,
    );
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
  addStep("teacher-login", { teacherName: config.teacherName });
  return result.payload.token;
}

async function getWindowStatus(token) {
  const result = await callFunction("teacher-windows", { token });
  expectStatus(result, 200, "teacher-windows GET");
  addStep("session-status-read", {
    status: result.payload?.status ?? null,
    windowId: result.payload?.window?.id ?? null,
    hasWindow: Boolean(result.payload?.hasWindow),
  });
  return result.payload;
}

async function completeAttempt(student, answerOverrides = {}) {
  const start = await callFunction("student-start-attempt", {
    method: "POST",
    body: { ...student, attemptSource: "qa" },
  });
  expectStatus(start, 200, "student-start-attempt");
  assert(start.payload?.attemptId, "student-start-attempt did not return attemptId");

  const attemptId = start.payload.attemptId;
  let question = start.payload.firstQuestion ?? start.payload.nextQuestion ?? null;
  let ix = 0;

  while (question) {
    const shownAtMs = Date.now() + ix * 2500;
    const shownAtIso = new Date(shownAtMs).toISOString();
    const answeredAtIso = new Date(shownAtMs + 1200 + ix * 90).toISOString();
    const answer = answerOverrides[question.displayOrder] ?? answerByDisplayOrder[question.displayOrder];

    assert(answer, `No answer configured for displayOrder ${question.displayOrder}`);

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
  if (!cleanup.ok) {
    throw new Error(
      `QA cleanup archive failed (${cleanup.status}): ${JSON.stringify(cleanup.payload)}`,
    );
  }
  addStep("qa-cleanup-archives", {
    requested: uniqueAttemptIds.length,
    movedToArchivesCount:
      cleanup.payload?.movedToArchivesCount ??
      cleanup.payload?.archivedCount ??
      uniqueAttemptIds.length,
    legacyArchivedCountPresent: typeof cleanup.payload?.archivedCount === "number",
  });
}

async function fetchAttemptDetail(token, attemptId) {
  const detail = await callFunction(`teacher-attempt-detail/${attemptId}`, {
    token,
  });
  expectStatus(detail, 200, "teacher-attempt-detail");
  return detail.payload;
}

async function verifyDesignSystemRoute() {
  const response = await fetch(`${config.appUrl}/designsystem`, {
    method: "GET",
  });
  const html = await response.text();
  const reachable =
    response.status === 200 &&
    html.includes("<div id=\"root\">");

  assert(
    reachable,
    `/designsystem route check failed with ${response.status}`,
  );

  addStep("designsystem-route-validated", {
    url: `${config.appUrl}/designsystem`,
    status: response.status,
  });
}

async function run() {
  await verifyDesignSystemRoute();

  const token = await loginTeacher();
  report.artifacts.teacherTokenIssued = true;

  const baselineState = await getWindowStatus(token);
  assert(baselineState?.status === "in_progress", "teacher-windows should report baseline always in progress");
  assert(baselineState?.window?.id, "teacher-windows should return the canonical baseline window");
  addStep("baseline-always-on-verified", {
    windowId: baselineState.window.id,
    status: baselineState.status,
  });
  report.artifacts.windowId = baselineState.window.id;

  const runId = Date.now().toString().slice(-6);
  const sharedIdentity = {
    firstName: `${config.studentPrefix}${runId}`,
    lastName: "Patel",
  };
  addStep("test-identities", {
    studentPrefix: config.studentPrefix,
    firstName: sharedIdentity.firstName,
    lastName: sharedIdentity.lastName,
  });
  const classAStudent = { ...sharedIdentity, className: "Class A" };
  const classBStudent = { ...sharedIdentity, className: "Class B" };

  const classAFirstAttempt = await completeAttempt(classAStudent);
  assert(classAFirstAttempt.completion.totalScore10 === 10, "Class A first attempt score should be 10");
  assert(classAFirstAttempt.completion.stars === 10, "Class A first attempt stars should be 10");
  addStep("class-a-attempt-complete", {
    attemptId: classAFirstAttempt.attemptId,
    score: classAFirstAttempt.completion.totalScore10,
  });

  const classBFirstAttempt = await completeAttempt(classBStudent, { 3: "shop" });
  assert(classBFirstAttempt.completion.totalScore10 === 9, "Class B first attempt score should be 9");
  assert(classBFirstAttempt.completion.totalWrong === 1, "Class B first attempt wrong count should be 1");
  addStep("class-b-attempt-complete", {
    attemptId: classBFirstAttempt.attemptId,
    score: classBFirstAttempt.completion.totalScore10,
  });

  const blockedRetake = await callFunction("student-start-attempt", {
    method: "POST",
    body: classAStudent,
  });
  expectStatus(blockedRetake, 409, "student retake blocked before reopen");
  addStep("retake-blocked-before-reopen", { status: blockedRetake.status });

  const reopen = await callFunction("teacher-reopen", {
    method: "POST",
    token,
    body: {
      firstName: classAStudent.firstName,
      lastName: classAStudent.lastName,
      className: classAStudent.className,
      reason: "QA validation reopen",
    },
  });
  expectStatus(reopen, 200, "teacher-reopen");
  assert(reopen.payload.remainingAttempts >= 1, "Reopen should grant at least one remaining attempt");
  addStep("teacher-reopen", { remainingAttempts: reopen.payload.remainingAttempts });

  const classASecondAttempt = await completeAttempt(classAStudent, { 5: "Blue", 9: "She was tired" });
  assert(
    classASecondAttempt.completion.totalScore10 === 8,
    "Class A second attempt score should be 8",
  );
  addStep("class-a-second-attempt-complete", {
    attemptId: classASecondAttempt.attemptId,
    score: classASecondAttempt.completion.totalScore10,
  });

  const listAll = await callFunction("teacher-dashboard-list?limit=200&source=all", { token });
  expectStatus(listAll, 200, "teacher-dashboard-list");
  const runAttempts = (listAll.payload.attempts ?? []).filter((attempt) =>
    attempt.student?.firstName === sharedIdentity.firstName &&
    attempt.student?.lastName === sharedIdentity.lastName
  );
  assert(runAttempts.length === 3, "Expected exactly 3 attempts for this run identity");

  const classCounts = runAttempts.reduce((acc, attempt) => {
    const cls = attempt.student?.className ?? "Unknown";
    acc[cls] = (acc[cls] ?? 0) + 1;
    return acc;
  }, {});
  assert(classCounts["Class A"] === 2, "Expected 2 attempts for Class A");
  assert(classCounts["Class B"] === 1, "Expected 1 attempt for Class B");
  addStep("dashboard-class-separation-validated", { classCounts });

  const listClassA = await callFunction("teacher-dashboard-list?className=Class A&limit=200&source=all", {
    token,
  });
  expectStatus(listClassA, 200, "teacher-dashboard-list class filter");
  const runClassA = (listClassA.payload.attempts ?? []).filter((attempt) =>
    attempt.student?.firstName === sharedIdentity.firstName &&
    attempt.student?.lastName === sharedIdentity.lastName
  );
  assert(runClassA.length === 2, "Class filter should return 2 Class A attempts for this identity");
  addStep("dashboard-class-filter-validated", { runClassACount: runClassA.length });

  const detailA = await fetchAttemptDetail(token, classAFirstAttempt.attemptId);
  assert(detailA.responses.length === 10, "Attempt detail should include 10 responses");
  const totalResponseTime = detailA.responses.reduce((sum, row) => sum + row.responseTimeMs, 0);
  assert(totalResponseTime === detailA.attempt.totalResponseTimeMs, "Total response time mismatch");
  for (const row of detailA.responses) {
    assert(row.responseTimeMs >= 0, "responseTimeMs must be non-negative");
    assert(row.responseTimeMs <= 600000, "responseTimeMs must be capped to 600000");
  }
  addStep("attempt-detail-time-validated", { totalResponseTimeMs: totalResponseTime });

  const summary = await callFunction("teacher-dashboard-summary?source=all", { token });
  expectStatus(summary, 200, "teacher-dashboard-summary");
  assert(summary.payload.attemptsTotal >= runAttempts.length, "Summary attemptsTotal should include run attempts");
  addStep("dashboard-summary-validated", {
    attemptsTotal: summary.payload.attemptsTotal,
    attemptsToday: summary.payload.attemptsToday,
  });

  const archiveProbe = await callFunction("teacher-attempt-archive", {
    method: "POST",
    token,
    body: { attemptIds: [classAFirstAttempt.attemptId] },
  });
  expectStatus(archiveProbe, 200, "teacher-attempt-archive probe");
  addStep("archive-probe-mutation", {
    attemptId: classAFirstAttempt.attemptId,
    movedToArchivesCount: archiveProbe.payload?.movedToArchivesCount ?? null,
    archivedCount: archiveProbe.payload?.archivedCount ?? null,
  });

  const archivesView = await callFunction(
    `teacher-dashboard-list?archive=archives&archived=only&search=${encodeURIComponent(sharedIdentity.firstName)}&limit=200&source=all`,
    { token },
  );
  expectStatus(archivesView, 200, "teacher-dashboard-list archives view");
  const archivedProbeRow = (archivesView.payload.attempts ?? []).find(
    (attempt) => attempt.id === classAFirstAttempt.attemptId,
  );
  assert(archivedProbeRow, "Archived probe attempt missing from archives view");
  assert(archivedProbeRow.archiveAt && archivedProbeRow.archivedAt, "Archived probe row missing archive timestamps");
  addStep("archives-view-retrieval-validated", {
    archivesCount: archivesView.payload.count ?? (archivesView.payload.attempts ?? []).length,
    archivedAttemptId: classAFirstAttempt.attemptId,
    archiveAt: archivedProbeRow.archiveAt,
    archivedAt: archivedProbeRow.archivedAt,
  });

  report.artifacts.identity = sharedIdentity;
  report.artifacts.attemptIds = [
    classAFirstAttempt.attemptId,
    classBFirstAttempt.attemptId,
    classASecondAttempt.attemptId,
  ];

  await cleanupQaAttempts(token, report.artifacts.attemptIds);

  const logout = await callFunction("teacher-logout", { method: "POST", token });
  expectStatus(logout, 200, "teacher-logout");
  addStep("teacher-logout", { loggedOut: true });

  report.status = "passed";
}

async function main() {
  try {
    await run();
  } catch (error) {
    report.status = "failed";
    report.error = error instanceof Error ? error.message : String(error);
    console.error(report.error);
    process.exitCode = 1;
  } finally {
    const outDir = join(process.cwd(), "qa", "reports");
    mkdirSync(outDir, { recursive: true });
    const latestPath = join(outDir, "latest_remote_smoke.json");
    const datedPath = join(outDir, `remote_smoke_${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    const content = `${JSON.stringify(report, null, 2)}\n`;
    writeFileSync(latestPath, content, "utf8");
    writeFileSync(datedPath, content, "utf8");
    console.log(`QA report written to ${latestPath}`);
    console.log(`QA report written to ${datedPath}`);
  }
}

await main();
