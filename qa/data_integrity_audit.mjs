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

async function getBaselineWindowStatus(token) {
  const result = await callFunction("teacher-windows", {
    method: "GET",
    token,
  });
  expectStatus(result, 200, "teacher-windows GET");
  assert(result.payload?.window?.id, "teacher-windows did not return window id");
  assert(result.payload?.status === "in_progress", "teacher-windows should report always-on baseline");
  addCheck("baseline-always-on", true, {
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

function getAttemptIdsFromListPayload(payload) {
  return (payload?.attempts ?? [])
    .map((attempt) => attempt?.id)
    .filter((value) => typeof value === "string");
}

function sortedIdSignature(attemptIds) {
  return [...new Set(attemptIds)].sort((a, b) => a.localeCompare(b)).join(",");
}

function hasArchiveTimestampFields(payload) {
  return (payload?.attempts ?? []).every(
    (attempt) => "archiveAt" in attempt && "archivedAt" in attempt,
  );
}

function mapArchiveModeToLegacy(mode) {
  if (mode === "active") return "exclude";
  if (mode === "archives") return "only";
  return "include";
}

function buildListPath({ mode, legacy, source = "all", search = "", limit = 250 }) {
  const params = new URLSearchParams({
    limit: String(limit),
    source,
    ...(search ? { search } : {}),
  });
  if (mode) params.set("archive", mode);
  if (legacy) params.set("archived", legacy);
  return `teacher-dashboard-list?${params.toString()}`;
}

async function run() {
  const token = await loginTeacher();
  report.artifacts.teacherTokenIssued = true;

  const windowId = await getBaselineWindowStatus(token);
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

  const archiveModes = ["active", "archives", "all"];
  const listsBeforeArchive = {};
  for (const mode of archiveModes) {
    const canonicalPath = buildListPath({ mode, search: sharedIdentity.firstName });
    const legacyPath = buildListPath({
      mode: null,
      legacy: mapArchiveModeToLegacy(mode),
      search: sharedIdentity.firstName,
    });
    const [canonical, legacy] = await Promise.all([
      callFunction(canonicalPath, { token }),
      callFunction(legacyPath, { token }),
    ]);
    expectStatus(canonical, 200, `teacher-dashboard-list canonical (${mode}) before archive`);
    expectStatus(legacy, 200, `teacher-dashboard-list legacy (${mode}) before archive`);
    listsBeforeArchive[mode] = { canonical, legacy };
  }

  const beforeParityPass = archiveModes.every((mode) =>
    sortedIdSignature(getAttemptIdsFromListPayload(listsBeforeArchive[mode].canonical.payload)) ===
      sortedIdSignature(getAttemptIdsFromListPayload(listsBeforeArchive[mode].legacy.payload))
  );
  addCheck("archive-filter-canonical-legacy-parity-before-archive", beforeParityPass, {
    activeCanonicalCount: getAttemptIdsFromListPayload(listsBeforeArchive.active.canonical.payload).length,
    activeLegacyCount: getAttemptIdsFromListPayload(listsBeforeArchive.active.legacy.payload).length,
    archivesCanonicalCount: getAttemptIdsFromListPayload(listsBeforeArchive.archives.canonical.payload).length,
    archivesLegacyCount: getAttemptIdsFromListPayload(listsBeforeArchive.archives.legacy.payload).length,
    allCanonicalCount: getAttemptIdsFromListPayload(listsBeforeArchive.all.canonical.payload).length,
    allLegacyCount: getAttemptIdsFromListPayload(listsBeforeArchive.all.legacy.payload).length,
  });

  const activeBeforeIds = new Set(getAttemptIdsFromListPayload(listsBeforeArchive.active.canonical.payload));
  const archivesBeforeIds = new Set(getAttemptIdsFromListPayload(listsBeforeArchive.archives.canonical.payload));
  const allBeforeIds = new Set(getAttemptIdsFromListPayload(listsBeforeArchive.all.canonical.payload));
  const beforeOverlap = [...activeBeforeIds].filter((id) => archivesBeforeIds.has(id));
  const beforeUnionSize = new Set([...activeBeforeIds, ...archivesBeforeIds]).size;
  const beforeInvariantPass = beforeOverlap.length === 0 && beforeUnionSize === allBeforeIds.size;
  addCheck("archive-set-invariants-before-archive", beforeInvariantPass, {
    activeCount: activeBeforeIds.size,
    archivesCount: archivesBeforeIds.size,
    allCount: allBeforeIds.size,
    overlapCount: beforeOverlap.length,
    unionCount: beforeUnionSize,
  });

  const listConflict = await callFunction(
    buildListPath({ mode: "active", legacy: "only", search: sharedIdentity.firstName }),
    { token },
  );
  const listConflictPass = listConflict.status === 400;
  addCheck("archive-filter-conflict-list-returns-400", listConflictPass, {
    status: listConflict.status,
    error: listConflict.payload?.error ?? null,
  });

  const summaryConflict = await callFunction("teacher-dashboard-summary?archive=active&archived=only&source=all", {
    token,
  });
  const summaryConflictPass = summaryConflict.status === 400;
  addCheck("archive-filter-conflict-summary-returns-400", summaryConflictPass, {
    status: summaryConflict.status,
    error: summaryConflict.payload?.error ?? null,
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

  const archiveIdsContractPass = Array.isArray(archive.payload?.movedToArchiveAttemptIds) &&
    Array.isArray(archive.payload?.archivedAttemptIds);
  addCheck("archive-response-id-array-contract", archiveIdsContractPass, {
    movedToArchiveAttemptIdsLength: Array.isArray(archive.payload?.movedToArchiveAttemptIds)
      ? archive.payload.movedToArchiveAttemptIds.length
      : null,
    archivedAttemptIdsLength: Array.isArray(archive.payload?.archivedAttemptIds)
      ? archive.payload.archivedAttemptIds.length
      : null,
  });

  const listsAfterArchive = {};
  for (const mode of archiveModes) {
    const canonicalPath = buildListPath({ mode, search: sharedIdentity.firstName });
    const legacyPath = buildListPath({
      mode: null,
      legacy: mapArchiveModeToLegacy(mode),
      search: sharedIdentity.firstName,
    });
    const [canonical, legacy] = await Promise.all([
      callFunction(canonicalPath, { token }),
      callFunction(legacyPath, { token }),
    ]);
    expectStatus(canonical, 200, `teacher-dashboard-list canonical (${mode}) after archive`);
    expectStatus(legacy, 200, `teacher-dashboard-list legacy (${mode}) after archive`);
    listsAfterArchive[mode] = { canonical, legacy };
  }

  const afterParityPass = archiveModes.every((mode) =>
    sortedIdSignature(getAttemptIdsFromListPayload(listsAfterArchive[mode].canonical.payload)) ===
      sortedIdSignature(getAttemptIdsFromListPayload(listsAfterArchive[mode].legacy.payload))
  );
  addCheck("archive-filter-canonical-legacy-parity-after-archive", afterParityPass, {
    activeCanonicalCount: getAttemptIdsFromListPayload(listsAfterArchive.active.canonical.payload).length,
    activeLegacyCount: getAttemptIdsFromListPayload(listsAfterArchive.active.legacy.payload).length,
    archivesCanonicalCount: getAttemptIdsFromListPayload(listsAfterArchive.archives.canonical.payload).length,
    archivesLegacyCount: getAttemptIdsFromListPayload(listsAfterArchive.archives.legacy.payload).length,
    allCanonicalCount: getAttemptIdsFromListPayload(listsAfterArchive.all.canonical.payload).length,
    allLegacyCount: getAttemptIdsFromListPayload(listsAfterArchive.all.legacy.payload).length,
  });

  const activeAfterIds = new Set(getAttemptIdsFromListPayload(listsAfterArchive.active.canonical.payload));
  const archivesAfterIds = new Set(getAttemptIdsFromListPayload(listsAfterArchive.archives.canonical.payload));
  const allAfterIds = new Set(getAttemptIdsFromListPayload(listsAfterArchive.all.canonical.payload));
  const afterOverlap = [...activeAfterIds].filter((id) => archivesAfterIds.has(id));
  const afterUnionSize = new Set([...activeAfterIds, ...archivesAfterIds]).size;
  const afterInvariantPass = afterOverlap.length === 0 && afterUnionSize === allAfterIds.size;
  addCheck("archive-set-invariants-after-archive", afterInvariantPass, {
    activeCount: activeAfterIds.size,
    archivesCount: archivesAfterIds.size,
    allCount: allAfterIds.size,
    overlapCount: afterOverlap.length,
    unionCount: afterUnionSize,
  });

  const listContractPass = hasArchiveTimestampFields(listsAfterArchive.all.canonical.payload) &&
    hasArchiveTimestampFields(listsAfterArchive.all.legacy.payload);
  addCheck("attempt-list-archive-contract", listContractPass, {
    checkedCanonicalAttempts: (listsAfterArchive.all.canonical.payload?.attempts ?? []).length,
    checkedLegacyAttempts: (listsAfterArchive.all.legacy.payload?.attempts ?? []).length,
  });

  const archiveVisibilityPass = !activeAfterIds.has(attemptA.attemptId) &&
    archivesAfterIds.has(attemptA.attemptId) &&
    allAfterIds.has(attemptA.attemptId) &&
    activeAfterIds.has(attemptB.attemptId);

  addCheck("archives-removes-only-target-attempt", archiveVisibilityPass, {
    archivedAttemptId: attemptA.attemptId,
    retainedAttemptId: attemptB.attemptId,
  });

  const restore = await callFunction("teacher-attempt-restore", {
    method: "POST",
    token,
    body: {
      attemptIds: [attemptA.attemptId],
    },
  });
  expectStatus(restore, 200, "teacher-attempt-restore");
  const restoreCompatibilityPass =
    Number.isFinite(Number(restore.payload?.restoredFromArchivesCount)) &&
    typeof restore.payload?.restoredCount === "number";
  addCheck("restore-response-compatibility", restoreCompatibilityPass, {
    restoredFromArchivesCount: restore.payload?.restoredFromArchivesCount ?? null,
    restoredCount: restore.payload?.restoredCount ?? null,
  });

  const restoreIdsContractPass = Array.isArray(restore.payload?.restoredFromArchiveAttemptIds) &&
    Array.isArray(restore.payload?.restoredAttemptIds);
  addCheck("restore-response-id-array-contract", restoreIdsContractPass, {
    restoredFromArchiveAttemptIdsLength: Array.isArray(restore.payload?.restoredFromArchiveAttemptIds)
      ? restore.payload.restoredFromArchiveAttemptIds.length
      : null,
    restoredAttemptIdsLength: Array.isArray(restore.payload?.restoredAttemptIds)
      ? restore.payload.restoredAttemptIds.length
      : null,
  });

  const activeAfterRestore = await callFunction(buildListPath({
    mode: "active",
    search: sharedIdentity.firstName,
  }), { token });
  const archivesAfterRestore = await callFunction(buildListPath({
    mode: "archives",
    search: sharedIdentity.firstName,
  }), { token });
  expectStatus(activeAfterRestore, 200, "teacher-dashboard-list active after restore");
  expectStatus(archivesAfterRestore, 200, "teacher-dashboard-list archives after restore");
  const activeAfterRestoreIds = new Set(getAttemptIdsFromListPayload(activeAfterRestore.payload));
  const archivesAfterRestoreIds = new Set(getAttemptIdsFromListPayload(archivesAfterRestore.payload));
  const restoreVisibilityPass = activeAfterRestoreIds.has(attemptA.attemptId) &&
    !archivesAfterRestoreIds.has(attemptA.attemptId);
  addCheck("restore-returns-attempt-to-active", restoreVisibilityPass, {
    restoredAttemptId: attemptA.attemptId,
    activeCount: activeAfterRestoreIds.size,
    archivesCount: archivesAfterRestoreIds.size,
  });

  const rearchive = await callFunction("teacher-attempt-archive", {
    method: "POST",
    token,
    body: {
      attemptIds: [attemptA.attemptId],
    },
  });
  expectStatus(rearchive, 200, "teacher-attempt-archive (rearchive after restore)");

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
