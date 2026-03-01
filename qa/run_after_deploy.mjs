#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

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
  maxWaitMs: Number(process.env.QA_DEPLOY_WAIT_MS ?? 8 * 60 * 1000),
  pollEveryMs: Number(process.env.QA_DEPLOY_POLL_MS ?? 20000),
};

const report = {
  runAt: new Date().toISOString(),
  status: "running",
  appUrl: config.appUrl,
  stages: [],
  failureReasons: [],
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDeploymentReady() {
  const started = Date.now();
  while (Date.now() - started < config.maxWaitMs) {
    try {
      const res = await fetch(config.appUrl, { method: "GET", redirect: "follow" });
      const text = await res.text();
      const ready = res.ok && !/Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY/i.test(text);
      report.stages.push({
        stage: "deploy-poll",
        at: new Date().toISOString(),
        statusCode: res.status,
        ready,
      });
      if (ready) return true;
    } catch (error) {
      report.stages.push({
        stage: "deploy-poll",
        at: new Date().toISOString(),
        ready: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    await sleep(config.pollEveryMs);
  }
  return false;
}

function runScript(scriptPath) {
  return new Promise((resolve) => {
    const child = spawn("node", [scriptPath], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "pipe",
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      const text = String(chunk);
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = String(chunk);
      stderr += text;
      process.stderr.write(text);
    });

    child.on("close", (code) => {
      resolve({
        scriptPath,
        exitCode: code ?? 1,
        ok: code === 0,
        stdout,
        stderr,
      });
    });
  });
}

function summarizeScriptFailure(scriptPath) {
  const reportMap = {
    [join("qa", "remote_smoke.mjs")]: join("qa", "reports", "latest_remote_smoke.json"),
    [join("qa", "matrix_ui_network.mjs")]: join("qa", "reports", "latest_matrix_ui_network.json"),
    [join("qa", "data_integrity_audit.mjs")]: join("qa", "reports", "latest_data_integrity_audit.json"),
    [join("qa", "archive_contract_canary.mjs")]: join("qa", "reports", "latest_archive_contract_canary.json"),
    [join("qa", "cleanup_qa_attempts.mjs")]: join("qa", "reports", "latest_cleanup_qa_attempts.json"),
  };

  const reportPath = reportMap[scriptPath];
  if (!reportPath || !existsSync(reportPath)) {
    return "No detailed report file found";
  }

  try {
    const parsed = JSON.parse(readFileSync(reportPath, "utf8"));
    if (reportPath.endsWith("latest_data_integrity_audit.json")) {
      const failedCheck = (parsed.checks ?? []).find((check) => check.pass === false);
      if (failedCheck) {
        return `Failed check: ${failedCheck.name}`;
      }
    }
    if (reportPath.endsWith("latest_remote_smoke.json")) {
      if (parsed.error) return parsed.error;
      const failedStep = (parsed.steps ?? []).find((step) => step.pass === false);
      if (failedStep) return `Failed step: ${failedStep.step}`;
    }
    if (reportPath.endsWith("latest_matrix_ui_network.json")) {
      if (parsed.error) return parsed.error;
      const failedCase = (parsed.results ?? []).find((result) => result.pass === false);
      if (failedCase) return `Failed matrix case: ${failedCase.caseId ?? failedCase.name ?? "unknown"}`;
    }
    if (reportPath.endsWith("latest_cleanup_qa_attempts.json")) {
      if (parsed.error) return parsed.error;
      const failedCheck = (parsed.checks ?? []).find((check) => check.pass === false);
      if (failedCheck) return `Failed cleanup check: ${failedCheck.name}`;
    }
    if (reportPath.endsWith("latest_archive_contract_canary.json")) {
      if (parsed.error) return parsed.error;
      const failedCheck = (parsed.checks ?? []).find((check) => check.pass === false);
      if (failedCheck) return `Failed archive canary check: ${failedCheck.name}`;
    }
    if (parsed.error) return String(parsed.error);
  } catch (error) {
    return `Could not parse report: ${error instanceof Error ? error.message : String(error)}`;
  }

  return "See stage logs for details";
}

async function main() {
  const ready = await waitForDeploymentReady();
  report.stages.push({
    stage: "deploy-ready",
    at: new Date().toISOString(),
    pass: ready,
  });

  if (!ready) {
    throw new Error("Deployment did not become ready before timeout");
  }

  const smoke = await runScript(join("qa", "remote_smoke.mjs"));
  const smokeFailureReason = smoke.ok ? null : summarizeScriptFailure(join("qa", "remote_smoke.mjs"));
  report.stages.push({
    stage: "remote-smoke",
    at: new Date().toISOString(),
    pass: smoke.ok,
    exitCode: smoke.exitCode,
    ...(smokeFailureReason ? { failureReason: smokeFailureReason } : {}),
  });
  if (smokeFailureReason) {
    report.failureReasons.push({ stage: "remote-smoke", reason: smokeFailureReason });
  }

  const matrix = await runScript(join("qa", "matrix_ui_network.mjs"));
  const matrixFailureReason = matrix.ok ? null : summarizeScriptFailure(join("qa", "matrix_ui_network.mjs"));
  report.stages.push({
    stage: "matrix-ui-network",
    at: new Date().toISOString(),
    pass: matrix.ok,
    exitCode: matrix.exitCode,
    ...(matrixFailureReason ? { failureReason: matrixFailureReason } : {}),
  });
  if (matrixFailureReason) {
    report.failureReasons.push({ stage: "matrix-ui-network", reason: matrixFailureReason });
  }

  const dataAudit = await runScript(join("qa", "data_integrity_audit.mjs"));
  const dataFailureReason = dataAudit.ok ? null : summarizeScriptFailure(join("qa", "data_integrity_audit.mjs"));
  report.stages.push({
    stage: "data-integrity-audit",
    at: new Date().toISOString(),
    pass: dataAudit.ok,
    exitCode: dataAudit.exitCode,
    ...(dataFailureReason ? { failureReason: dataFailureReason } : {}),
  });
  if (dataFailureReason) {
    report.failureReasons.push({ stage: "data-integrity-audit", reason: dataFailureReason });
  }

  const archiveCanary = await runScript(join("qa", "archive_contract_canary.mjs"));
  const archiveCanaryFailureReason = archiveCanary.ok ? null : summarizeScriptFailure(join("qa", "archive_contract_canary.mjs"));
  report.stages.push({
    stage: "archive-contract-canary",
    at: new Date().toISOString(),
    pass: archiveCanary.ok,
    exitCode: archiveCanary.exitCode,
    ...(archiveCanaryFailureReason ? { failureReason: archiveCanaryFailureReason } : {}),
  });
  if (archiveCanaryFailureReason) {
    report.failureReasons.push({ stage: "archive-contract-canary", reason: archiveCanaryFailureReason });
  }

  const cleanup = await runScript(join("qa", "cleanup_qa_attempts.mjs"));
  const cleanupFailureReason = cleanup.ok ? null : summarizeScriptFailure(join("qa", "cleanup_qa_attempts.mjs"));
  report.stages.push({
    stage: "cleanup-qa-attempts",
    at: new Date().toISOString(),
    pass: cleanup.ok,
    exitCode: cleanup.exitCode,
    ...(cleanupFailureReason ? { failureReason: cleanupFailureReason } : {}),
  });
  if (cleanupFailureReason) {
    report.failureReasons.push({ stage: "cleanup-qa-attempts", reason: cleanupFailureReason });
  }

  report.status = smoke.ok && matrix.ok && dataAudit.ok && archiveCanary.ok && cleanup.ok ? "passed" : "failed";
}

const outDir = join(process.cwd(), "qa", "reports");
mkdirSync(outDir, { recursive: true });
const latestPath = join(outDir, "latest_after_deploy.json");
const datedPath = join(outDir, `after_deploy_${new Date().toISOString().replace(/[:.]/g, "-")}.json`);

try {
  await main();
} catch (error) {
  report.status = "failed";
  report.error = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  const content = `${JSON.stringify(report, null, 2)}\n`;
  writeFileSync(latestPath, content, "utf8");
  writeFileSync(datedPath, content, "utf8");
  console.log(`After-deploy QA report written to ${latestPath}`);
  console.log(`After-deploy QA report written to ${datedPath}`);
  if (report.status !== "passed") {
    process.exitCode = 1;
  }
}
