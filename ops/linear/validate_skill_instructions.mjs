import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import os from "node:os";
import process from "node:process";

import { parseCliArgs } from "./client.mjs";

const FORBIDDEN_TOKENS = [
  "artifacts/workflow/task-board.md",
  "artifacts/workflow/state-transitions.jsonl",
  "agent_board.md",
  "state_machine_rules.md",
  "scripts/update_task_state.py",
  "scripts/validate_transition.py",
  "scripts/validate_handoff_packet.py",
];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function main() {
  const args = parseCliArgs();
  const defaultRoot = `${os.homedir()}/.codex/skills`;
  const root = String(args.root ?? process.env.CODEX_SKILLS_ROOT ?? defaultRoot).trim();

  if (!existsSync(root)) {
    process.stdout.write(`Skill validator skipped. Skills root not found: ${root}\n`);
    return;
  }

  const pattern = FORBIDDEN_TOKENS.map(escapeRegex).join("|");

  let output = "";
  try {
    output = execSync(
      `rg -n -S '${pattern}' '${root}' -g 'SKILL.md' -g 'references/workflow-contract.md'`,
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (error) {
    const stdout = String(error?.stdout ?? "");
    const stderr = String(error?.stderr ?? "");

    // rg returns exit code 1 when no matches are found.
    if (!stdout.trim() && !stderr.trim()) {
      process.stdout.write("Skill validator passed. No stale markdown workflow references found.\n");
      return;
    }

    if (stdout.trim().length > 0) {
      output = stdout;
    } else {
      throw error;
    }
  }

  const trimmed = output.trim();
  if (!trimmed) {
    process.stdout.write("Skill validator passed. No stale markdown workflow references found.\n");
    return;
  }

  process.stderr.write("Skill validator failed. Found stale file-based workflow references:\n");
  process.stderr.write(`${trimmed}\n`);
  process.exitCode = 1;
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
