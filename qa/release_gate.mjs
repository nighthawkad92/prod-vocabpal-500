#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
  targetUrl: process.env.APP_URL.trim().replace(/\/$/, ""),
  loadGateMode: (process.env.QA_LOAD_GATE_MODE ?? "advisory").trim().toLowerCase(),
  loadGateMaxAgeHours: Number(process.env.QA_LOAD_MAX_AGE_HOURS ?? 8 * 24),
};

const report = {
  runAt: new Date().toISOString(),
  targetUrl: config.targetUrl,
  codeGate: {
    pass: false,
    stages: [],
  },
  uiUxGate: {
    pass: false,
    stages: [],
  },
  dataGate: {
    pass: false,
    stages: [],
  },
  apiGate: {
    pass: false,
    stages: [],
  },
  loadGate: {
    mode: config.loadGateMode,
    pass: true,
    status: "not-evaluated",
    details: {},
  },
  overallStatus: "running",
  blockers: [],
};

function runCommand(command, args) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(command, args, {
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
        command: `${command} ${args.join(" ")}`,
        pass: code === 0,
        exitCode: code ?? 1,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr,
      });
    });
  });
}

async function runGateStage(gateKey, stageName, command, args) {
  const result = await runCommand(command, args);
  report[gateKey].stages.push({
    stage: stageName,
    pass: result.pass,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    command: result.command,
  });

  if (!result.pass) {
    report.blockers.push(`${gateKey}:${stageName}`);
  }

  return result;
}

function evaluateLoadGate() {
  const loadReportPath = join(process.cwd(), "qa", "reports", "latest_load_profile_500.json");

  if (!existsSync(loadReportPath)) {
    const missing = {
      reason: "missing-report",
      path: loadReportPath,
    };

    if (config.loadGateMode === "hard") {
      report.loadGate = {
        mode: config.loadGateMode,
        pass: false,
        status: "failed",
        details: missing,
      };
      report.blockers.push("loadGate:missing-report");
    } else {
      report.loadGate = {
        mode: config.loadGateMode,
        pass: true,
        status: "advisory-missing",
        details: missing,
      };
    }
    return;
  }

  try {
    const parsed = JSON.parse(readFileSync(loadReportPath, "utf8"));
    const runAt = parsed?.runAt ? new Date(parsed.runAt) : null;
    const ageHours = runAt ? (Date.now() - runAt.getTime()) / (1000 * 60 * 60) : null;
    const freshEnough = ageHours !== null && Number.isFinite(ageHours) && ageHours <= config.loadGateMaxAgeHours;
    const passed = parsed?.status === "passed";

    const details = {
      path: loadReportPath,
      runAt: parsed?.runAt ?? null,
      status: parsed?.status ?? null,
      ageHours: ageHours === null ? null : Number(ageHours.toFixed(2)),
      freshEnough,
    };

    if (config.loadGateMode === "hard") {
      const pass = Boolean(passed && freshEnough);
      report.loadGate = {
        mode: config.loadGateMode,
        pass,
        status: pass ? "passed" : "failed",
        details,
      };
      if (!pass) {
        report.blockers.push("loadGate:hard-threshold");
      }
      return;
    }

    report.loadGate = {
      mode: config.loadGateMode,
      pass: true,
      status: passed && freshEnough ? "advisory-passed" : "advisory-warning",
      details,
    };
  } catch (error) {
    const details = {
      reason: "parse-failed",
      path: loadReportPath,
      error: error instanceof Error ? error.message : String(error),
    };

    if (config.loadGateMode === "hard") {
      report.loadGate = {
        mode: config.loadGateMode,
        pass: false,
        status: "failed",
        details,
      };
      report.blockers.push("loadGate:parse-failed");
    } else {
      report.loadGate = {
        mode: config.loadGateMode,
        pass: true,
        status: "advisory-warning",
        details,
      };
    }
  }
}

async function main() {
  await runGateStage("codeGate", "typecheck", "npm", ["--prefix", "web", "run", "typecheck"]);
  await runGateStage("codeGate", "lint", "npm", ["--prefix", "web", "run", "lint"]);
  await runGateStage("codeGate", "build", "npm", ["--prefix", "web", "run", "build"]);

  await runGateStage("apiGate", "remote-smoke", "npm", ["run", "qa:remote"]);
  await runGateStage("uiUxGate", "matrix-ui-network", "npm", ["run", "qa:matrix"]);
  await runGateStage("dataGate", "data-integrity-audit", "npm", ["run", "qa:data"]);
  await runGateStage("dataGate", "cleanup-qa-attempts", "npm", ["run", "qa:cleanup"]);

  const afterDeploy = await runGateStage("apiGate", "after-deploy", "npm", ["run", "qa:after-deploy"]);
  report.uiUxGate.stages.push({
    stage: "after-deploy",
    pass: afterDeploy.pass,
    exitCode: afterDeploy.exitCode,
    durationMs: afterDeploy.durationMs,
    command: afterDeploy.command,
  });
  report.dataGate.stages.push({
    stage: "after-deploy",
    pass: afterDeploy.pass,
    exitCode: afterDeploy.exitCode,
    durationMs: afterDeploy.durationMs,
    command: afterDeploy.command,
  });
  if (!afterDeploy.pass) {
    report.blockers.push("uiUxGate:after-deploy");
    report.blockers.push("dataGate:after-deploy");
  }

  report.codeGate.pass = report.codeGate.stages.every((stage) => stage.pass);
  report.uiUxGate.pass = report.uiUxGate.stages.every((stage) => stage.pass);
  report.dataGate.pass = report.dataGate.stages.every((stage) => stage.pass);
  report.apiGate.pass = report.apiGate.stages.every((stage) => stage.pass);

  evaluateLoadGate();

  const hardGatePass =
    report.codeGate.pass &&
    report.uiUxGate.pass &&
    report.dataGate.pass &&
    report.apiGate.pass;

  const loadGatePass = config.loadGateMode === "hard" ? report.loadGate.pass : true;

  report.overallStatus = hardGatePass && loadGatePass ? "passed" : "failed";
}

const outDir = join(process.cwd(), "qa", "reports");
mkdirSync(outDir, { recursive: true });
const latestPath = join(outDir, "latest_release_gate.json");
const datedPath = join(outDir, `release_gate_${new Date().toISOString().replace(/[:.]/g, "-")}.json`);

try {
  await main();
} catch (error) {
  report.overallStatus = "failed";
  report.blockers.push(`runtime:${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  const content = `${JSON.stringify(report, null, 2)}\n`;
  writeFileSync(latestPath, content, "utf8");
  writeFileSync(datedPath, content, "utf8");
  console.log(`Release gate report written to ${latestPath}`);
  console.log(`Release gate report written to ${datedPath}`);
  if (report.overallStatus !== "passed") {
    process.exitCode = 1;
  }
}
