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
  teacherName: (process.env.TEACHER_NAME ?? "QA Cleanup Agent").trim(),
  qaSourceToken: (process.env.QA_SOURCE_TOKEN ?? "").trim(),
  prefixes: (process.env.QA_CLEANUP_PREFIXES ?? "QA,Mx,QD,LD,TEST,DEMO")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  batchSize: Math.max(1, Number(process.env.QA_CLEANUP_BATCH_SIZE ?? "50")),
};

const report = {
  runAt: new Date().toISOString(),
  status: "running",
  checks: [],
  artifacts: {
    detectedAttemptIds: [],
    archivedCount: 0,
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

async function loginTeacher() {
  const result = await callFunction("teacher-login", {
    method: "POST",
    body: {
      fullName: config.teacherName,
      passcode: config.teacherPasscode,
    },
  });

  if (!result.ok || !result.payload?.token) {
    throw new Error(`teacher-login failed (${result.status}): ${JSON.stringify(result.payload)}`);
  }

  addCheck("teacher-login", true, { teacherName: config.teacherName });
  return result.payload.token;
}

async function fetchAttemptsPage(token, query) {
  const result = await callFunction(`teacher-dashboard-list?${query.toString()}`, { token });
  if (!result.ok) {
    throw new Error(`teacher-dashboard-list failed (${result.status}): ${JSON.stringify(result.payload)}`);
  }
  return result.payload;
}

async function collectQaTaggedAttempts(token) {
  const attemptIds = new Set();
  let offset = 0;
  const limit = 200;
  while (true) {
    const query = new URLSearchParams({
      source: "qa",
      limit: String(limit),
      offset: String(offset),
    });
    const payload = await fetchAttemptsPage(token, query);
    const attempts = Array.isArray(payload.attempts) ? payload.attempts : [];
    attempts.forEach((attempt) => {
      if (attempt?.id) attemptIds.add(attempt.id);
    });

    offset += limit;
    if (offset >= Number(payload.filteredCount ?? attempts.length ?? 0) || attempts.length === 0) {
      break;
    }
  }
  return attemptIds;
}

function isLikelyQaAttempt(attempt) {
  const firstName = String(attempt?.student?.firstName ?? "").trim();
  const lastName = String(attempt?.student?.lastName ?? "").trim();
  const className = String(attempt?.student?.className ?? "").trim();
  if (!firstName) return false;
  const normalizedFirstName = firstName.toLowerCase();
  const normalizedLastName = lastName.toLowerCase();
  const normalizedClass = className.toLowerCase();
  if (normalizedLastName === "pilot") return true;
  if (normalizedClass.includes("qa")) return true;
  return config.prefixes.some((prefix) => normalizedFirstName.startsWith(prefix.toLowerCase()));
}

async function collectLegacyQaAttempts(token) {
  const attemptIds = new Set();

  for (const prefix of config.prefixes) {
    let offset = 0;
    const limit = 200;
    while (true) {
      const query = new URLSearchParams({
        source: "all",
        search: prefix,
        limit: String(limit),
        offset: String(offset),
      });
      const payload = await fetchAttemptsPage(token, query);
      const attempts = Array.isArray(payload.attempts) ? payload.attempts : [];
      attempts.forEach((attempt) => {
        if (attempt?.id && isLikelyQaAttempt(attempt)) {
          attemptIds.add(attempt.id);
        }
      });

      offset += limit;
      if (offset >= Number(payload.filteredCount ?? attempts.length ?? 0) || attempts.length === 0) {
        break;
      }
    }
  }

  return attemptIds;
}

function splitIntoBatches(values, batchSize) {
  const batches = [];
  for (let index = 0; index < values.length; index += batchSize) {
    batches.push(values.slice(index, index + batchSize));
  }
  return batches;
}

async function archiveAttempts(token, attemptIds) {
  const batches = splitIntoBatches(attemptIds, config.batchSize);
  let archivedCount = 0;
  for (const batch of batches) {
    const result = await callFunction("teacher-attempt-archive", {
      method: "POST",
      token,
      body: { attemptIds: batch },
    });
    if (!result.ok) {
      throw new Error(`teacher-attempt-archive failed (${result.status}): ${JSON.stringify(result.payload)}`);
    }
    archivedCount += Number(result.payload?.archivedCount ?? batch.length);
  }
  return archivedCount;
}

async function run() {
  const token = await loginTeacher();
  try {
    const taggedIds = await collectQaTaggedAttempts(token);
    addCheck("qa-tagged-attempts-detected", true, { count: taggedIds.size });

    const legacyIds = await collectLegacyQaAttempts(token);
    addCheck("legacy-prefix-attempts-detected", true, {
      count: legacyIds.size,
      prefixes: config.prefixes,
    });

    const allAttemptIds = Array.from(new Set([...taggedIds, ...legacyIds]));
    report.artifacts.detectedAttemptIds = allAttemptIds;

    if (allAttemptIds.length === 0) {
      addCheck("qa-cleanup-archive", true, { archivedCount: 0 });
      report.artifacts.archivedCount = 0;
      report.status = "passed";
      return;
    }

    const archivedCount = await archiveAttempts(token, allAttemptIds);
    report.artifacts.archivedCount = archivedCount;
    addCheck("qa-cleanup-archive", true, {
      requested: allAttemptIds.length,
      archivedCount,
      batchSize: config.batchSize,
    });
    report.status = "passed";
  } finally {
    await callFunction("teacher-logout", { method: "POST", token });
  }
}

const outDir = join(process.cwd(), "qa", "reports");
mkdirSync(outDir, { recursive: true });
const latestPath = join(outDir, "latest_cleanup_qa_attempts.json");
const datedPath = join(outDir, `cleanup_qa_attempts_${new Date().toISOString().replace(/[:.]/g, "-")}.json`);

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
  console.log(`QA cleanup report written to ${latestPath}`);
}
