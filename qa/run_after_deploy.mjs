#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";

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
  report.stages.push({
    stage: "remote-smoke",
    at: new Date().toISOString(),
    pass: smoke.ok,
    exitCode: smoke.exitCode,
  });

  const matrix = await runScript(join("qa", "matrix_ui_network.mjs"));
  report.stages.push({
    stage: "matrix-ui-network",
    at: new Date().toISOString(),
    pass: matrix.ok,
    exitCode: matrix.exitCode,
  });

  report.status = smoke.ok && matrix.ok ? "passed" : "failed";
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
