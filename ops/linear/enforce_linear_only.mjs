import { execSync } from "node:child_process";
import process from "node:process";

import { loadLinearConfig, parseCliArgs } from "./client.mjs";

function changedFiles(args) {
  const base = String(args.base ?? process.env.LINEAR_BASE_SHA ?? "").trim();
  const head = String(args.head ?? process.env.LINEAR_HEAD_SHA ?? "").trim();

  let command = "git diff --name-only";
  if (base && head) {
    command = /^0+$/.test(base)
      ? `git diff --name-only ${head}~20..${head}`
      : `git diff --name-only ${base}..${head}`;
  }

  const raw = execSync(command, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return raw
    .split("\n")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function isForbiddenPath(file, forbiddenPaths) {
  return forbiddenPaths.some((entry) => {
    const normalized = entry.replace(/^\.\//, "");
    return file === normalized || file.endsWith(`/${normalized}`);
  });
}

async function main() {
  const args = parseCliArgs();
  const allowLegacy = String(process.env.ALLOW_LEGACY_WORKFLOW_FILES ?? "false").toLowerCase() === "true";
  if (allowLegacy) {
    process.stdout.write("Linear-only enforcement bypassed by ALLOW_LEGACY_WORKFLOW_FILES=true\n");
    return;
  }

  const config = await loadLinearConfig();
  const forbiddenPaths = config.forbiddenWorkflowPaths ?? [];
  const changed = changedFiles(args);

  const violations = changed.filter((file) => isForbiddenPath(file, forbiddenPaths));

  if (violations.length > 0) {
    process.stderr.write("Linear-only enforcement failed. Forbidden workflow markdown files were changed:\n");
    for (const file of violations) {
      process.stderr.write(`- ${file}\n`);
    }
    process.exitCode = 1;
    return;
  }

  process.stdout.write("Linear-only enforcement passed. No forbidden workflow markdown files changed.\n");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
