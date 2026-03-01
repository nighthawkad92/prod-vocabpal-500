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
  teacherName: (process.env.TEACHER_NAME ?? "QA Archive Canary").trim(),
  qaSourceToken: (process.env.QA_SOURCE_TOKEN ?? "").trim(),
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapArchiveModeToLegacy(mode) {
  if (mode === "active") return "exclude";
  if (mode === "archives") return "only";
  return "include";
}

function buildListPath({ mode, legacy, source = "all", limit = 250, search = "" }) {
  const params = new URLSearchParams({
    source,
    limit: String(limit),
    ...(search ? { search } : {}),
  });
  if (mode) params.set("archive", mode);
  if (legacy) params.set("archived", legacy);
  return `teacher-dashboard-list?${params.toString()}`;
}

function getAttemptIds(payload) {
  return (payload?.attempts ?? [])
    .map((attempt) => attempt?.id)
    .filter((value) => typeof value === "string");
}

function signature(ids) {
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b)).join(",");
}

function hasArchiveTimestampFields(payload) {
  return (payload?.attempts ?? []).every((attempt) => "archiveAt" in attempt && "archivedAt" in attempt);
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function mutationContractPass(payload, kind) {
  if (kind === "archive") {
    return Number.isFinite(Number(payload?.movedToArchivesCount)) &&
      Number.isFinite(Number(payload?.archivedCount)) &&
      isStringArray(payload?.movedToArchiveAttemptIds) &&
      isStringArray(payload?.archivedAttemptIds);
  }
  return Number.isFinite(Number(payload?.restoredFromArchivesCount)) &&
    Number.isFinite(Number(payload?.restoredCount)) &&
    isStringArray(payload?.restoredFromArchiveAttemptIds) &&
    isStringArray(payload?.restoredAttemptIds);
}

async function callFunction(path, { method = "GET", token, body } = {}) {
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
  };
}

function expectStatus(result, expected, context) {
  if (result.status !== expected) {
    throw new Error(`${context} failed with ${result.status}: ${JSON.stringify(result.payload)}`);
  }
}

async function run() {
  const login = await callFunction("teacher-login", {
    method: "POST",
    body: {
      fullName: config.teacherName,
      passcode: config.teacherPasscode,
    },
  });
  expectStatus(login, 200, "teacher-login");
  const token = login.payload?.token;
  assert(token, "teacher-login did not return token");

  const baselineState = await callFunction("teacher-windows", { token });
  expectStatus(baselineState, 200, "teacher-windows baseline state");
  addCheck("baseline-always-on", baselineState.payload?.status === "in_progress" && Boolean(baselineState.payload?.window?.id), {
    status: baselineState.payload?.status ?? null,
    windowId: baselineState.payload?.window?.id ?? null,
  });

  const modes = ["active", "archives", "all"];
  const listResponses = {};

  for (const mode of modes) {
    const [canonical, legacy] = await Promise.all([
      callFunction(buildListPath({ mode, source: "all" }), { token }),
      callFunction(buildListPath({ mode: null, legacy: mapArchiveModeToLegacy(mode), source: "all" }), { token }),
    ]);
    expectStatus(canonical, 200, `list canonical ${mode}`);
    expectStatus(legacy, 200, `list legacy ${mode}`);
    listResponses[mode] = { canonical, legacy };
  }

  for (const mode of modes) {
    const canonicalPayload = listResponses[mode].canonical.payload;
    const legacyPayload = listResponses[mode].legacy.payload;
    const parityPass = Number(canonicalPayload?.filteredCount ?? -1) === Number(legacyPayload?.filteredCount ?? -2) &&
      Number(canonicalPayload?.count ?? -1) === Number(legacyPayload?.count ?? -2) &&
      signature(getAttemptIds(canonicalPayload)) === signature(getAttemptIds(legacyPayload));
    addCheck(`canonical-legacy-parity-${mode}`, parityPass, {
      canonicalFilteredCount: canonicalPayload?.filteredCount ?? null,
      legacyFilteredCount: legacyPayload?.filteredCount ?? null,
      canonicalCount: canonicalPayload?.count ?? null,
      legacyCount: legacyPayload?.count ?? null,
    });
  }

  const activeFiltered = Number(listResponses.active.canonical.payload?.filteredCount ?? 0);
  const archivesFiltered = Number(listResponses.archives.canonical.payload?.filteredCount ?? 0);
  const allFiltered = Number(listResponses.all.canonical.payload?.filteredCount ?? 0);
  addCheck("archive-partition-count-invariant", activeFiltered + archivesFiltered === allFiltered, {
    activeFiltered,
    archivesFiltered,
    allFiltered,
  });

  const listContractPass = hasArchiveTimestampFields(listResponses.active.canonical.payload) &&
    hasArchiveTimestampFields(listResponses.archives.canonical.payload) &&
    hasArchiveTimestampFields(listResponses.all.canonical.payload);
  addCheck("list-contract-archive-fields-present", listContractPass, {
    activeCount: listResponses.active.canonical.payload?.count ?? null,
    archivesCount: listResponses.archives.canonical.payload?.count ?? null,
    allCount: listResponses.all.canonical.payload?.count ?? null,
  });

  const listConflict = await callFunction("teacher-dashboard-list?archive=active&archived=only&source=all", { token });
  addCheck("list-conflict-returns-400", listConflict.status === 400, {
    status: listConflict.status,
    error: listConflict.payload?.error ?? null,
  });

  const summaryConflict = await callFunction("teacher-dashboard-summary?archive=active&archived=only&source=all", {
    token,
  });
  addCheck("summary-conflict-returns-400", summaryConflict.status === 400, {
    status: summaryConflict.status,
    error: summaryConflict.payload?.error ?? null,
  });

  let probeArchived = await callFunction(buildListPath({ mode: "archives", source: "qa", limit: 1 }), { token });
  expectStatus(probeArchived, 200, "probe archived list");
  let probeActive = await callFunction(buildListPath({ mode: "active", source: "qa", limit: 1 }), { token });
  expectStatus(probeActive, 200, "probe active list");

  let archivedProbeAttempt = probeArchived.payload?.attempts?.[0] ?? null;
  let activeProbeAttempt = probeActive.payload?.attempts?.[0] ?? null;
  let probeAttempt = archivedProbeAttempt ?? activeProbeAttempt;
  let startedArchived = Boolean(archivedProbeAttempt);
  let createdProbeAttemptId = null;

  if (!probeAttempt?.id) {
    const className =
      listResponses.all.canonical.payload?.attempts?.[0]?.student?.className ??
      "Class 5 - Section A";
    const suffix = Date.now().toString().slice(-6);
    const probeFirstName = `QAARCH${suffix}`;
    const startProbe = await callFunction("student-start-attempt", {
      method: "POST",
      body: {
        firstName: probeFirstName,
        lastName: "Canary",
        className,
        attemptSource: "qa",
      },
    });
    expectStatus(startProbe, 200, "student-start-attempt canary probe");
    createdProbeAttemptId = startProbe.payload?.attemptId ?? null;
    assert(createdProbeAttemptId, "student-start-attempt canary probe missing attemptId");

    probeActive = await callFunction(
      buildListPath({ mode: "active", source: "all", limit: 10, search: probeFirstName }),
      { token },
    );
    expectStatus(probeActive, 200, "probe active list after canary attempt creation");
    activeProbeAttempt = (probeActive.payload?.attempts ?? []).find((attempt) => attempt.id === createdProbeAttemptId) ?? null;
    probeAttempt = activeProbeAttempt;
    startedArchived = false;

    if (createdProbeAttemptId) {
      report.artifacts.createdProbeAttemptId = createdProbeAttemptId;
    }
  }

  assert(probeAttempt?.id, "No QA attempt available for archive contract probe");
  report.artifacts.probeAttemptId = probeAttempt.id;
  report.artifacts.probeStartedArchived = startedArchived;

  if (startedArchived) {
    const restore = await callFunction("teacher-attempt-restore", {
      method: "POST",
      token,
      body: { attemptIds: [probeAttempt.id] },
    });
    expectStatus(restore, 200, "restore probe");
    addCheck("restore-contract-shape", mutationContractPass(restore.payload, "restore"), {
      restoredFromArchivesCount: restore.payload?.restoredFromArchivesCount ?? null,
      restoredCount: restore.payload?.restoredCount ?? null,
    });
  }

  const archive = await callFunction("teacher-attempt-archive", {
    method: "POST",
    token,
    body: { attemptIds: [probeAttempt.id] },
  });
  expectStatus(archive, 200, "archive probe");
  addCheck("archive-contract-shape", mutationContractPass(archive.payload, "archive"), {
    movedToArchivesCount: archive.payload?.movedToArchivesCount ?? null,
    archivedCount: archive.payload?.archivedCount ?? null,
  });

  let archivedRow = null;
  for (let attemptIndex = 0; attemptIndex < 5; attemptIndex += 1) {
    const archivesProbeCheck = await callFunction(
      buildListPath({ mode: "archives", source: "all", limit: 200, search: probeAttempt.student?.firstName ?? "" }),
      { token },
    );
    expectStatus(archivesProbeCheck, 200, "archives probe check");
    archivedRow = (archivesProbeCheck.payload?.attempts ?? []).find((attempt) => attempt.id === probeAttempt.id) ?? null;
    if (archivedRow?.archiveAt && archivedRow?.archivedAt) {
      break;
    }
    await sleep(600);
  }
  const archivedProbePass = Boolean(archivedRow?.archiveAt) && Boolean(archivedRow?.archivedAt);
  addCheck("archives-view-row-has-both-timestamps", archivedProbePass, {
    attemptId: probeAttempt.id,
    archiveAt: archivedRow?.archiveAt ?? null,
    archivedAt: archivedRow?.archivedAt ?? null,
  });

  if (!startedArchived) {
    const restore = await callFunction("teacher-attempt-restore", {
      method: "POST",
      token,
      body: { attemptIds: [probeAttempt.id] },
    });
    expectStatus(restore, 200, "restore probe (return to active)");
    addCheck("restore-contract-shape", mutationContractPass(restore.payload, "restore"), {
      restoredFromArchivesCount: restore.payload?.restoredFromArchivesCount ?? null,
      restoredCount: restore.payload?.restoredCount ?? null,
    });
  }

  if (createdProbeAttemptId) {
    const cleanupProbe = await callFunction("teacher-attempt-archive", {
      method: "POST",
      token,
      body: { attemptIds: [createdProbeAttemptId] },
    });
    expectStatus(cleanupProbe, 200, "cleanup canary probe attempt");
  }

  const logout = await callFunction("teacher-logout", { method: "POST", token });
  expectStatus(logout, 200, "teacher-logout");

  report.status = report.checks.every((check) => check.pass) ? "passed" : "failed";
}

const outDir = join(process.cwd(), "qa", "reports");
mkdirSync(outDir, { recursive: true });
const latestPath = join(outDir, "latest_archive_contract_canary.json");
const datedPath = join(outDir, `archive_contract_canary_${new Date().toISOString().replace(/[:.]/g, "-")}.json`);

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
  console.log(`Archive contract canary report written to ${latestPath}`);
  console.log(`Archive contract canary report written to ${datedPath}`);
  if (report.status !== "passed") {
    process.exitCode = 1;
  }
}
