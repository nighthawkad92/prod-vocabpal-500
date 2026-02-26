import { execSync } from "node:child_process";
import process from "node:process";

import { extractLinearKey, parseCliArgs } from "./client.mjs";

const BRANCH_PATTERN = /^vpb\/([A-Z][A-Z0-9]+-\d+)(?:-.+)?$/;

function getBranch(args) {
  return String(
    args.branch
      ?? process.env.LINEAR_BRANCH
      ?? process.env.GITHUB_HEAD_REF
      ?? process.env.GITHUB_REF_NAME
      ?? "",
  ).trim();
}

function getCommitMessages(base, head) {
  if (!base || !head) {
    return [];
  }

  const range = /^0+$/.test(base)
    ? `${head}~20..${head}`
    : `${base}..${head}`;

  const raw = execSync(`git log --format=%H:::%B%x00 ${range}`, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  return raw
    .split("\u0000")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const splitAt = entry.indexOf(":::");
      if (splitAt < 0) return { sha: "unknown", message: entry };
      return {
        sha: entry.slice(0, splitAt),
        message: entry.slice(splitAt + 3).trim(),
      };
    });
}

function isMainLike(branch) {
  return branch === "main" || branch === "master";
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function pass(message) {
  process.stdout.write(`${message}\n`);
}

function printHelp() {
  process.stdout.write(
    [
      "Usage: node ops/linear/verify_issue_key_convention.mjs [options]",
      "",
      "Options:",
      "  --branch <name>       Branch to validate (default from CI env)",
      "  --pr-title <title>    Pull request title to validate",
      "  --base <sha>          Commit range start for commit-message checks",
      "  --head <sha>          Commit range end for commit-message checks",
      "  --strict-main         Enforce branch format even on main/master",
      "  --help                Show this help message",
    ].join("\n"),
  );
}

function main() {
  const args = parseCliArgs();
  if (args.help || args.h) {
    printHelp();
    return;
  }
  const branch = getBranch(args);

  if (!branch) {
    fail("Unable to determine branch name for Linear key verification.");
    return;
  }

  if (isMainLike(branch) && !args["strict-main"]) {
    pass(`Skipping branch naming check on ${branch}.`);
    return;
  }

  const branchMatch = branch.match(BRANCH_PATTERN);
  if (!branchMatch) {
    fail(`Branch does not follow required format vpb/<LINEAR_KEY>-slug: ${branch}`);
    return;
  }

  const branchKey = branchMatch[1];
  const prTitle = String(args["pr-title"] ?? process.env.LINEAR_PR_TITLE ?? "").trim();
  if (prTitle.length > 0 && !prTitle.includes(branchKey)) {
    fail(`PR title must include branch Linear key ${branchKey}. Received: ${prTitle}`);
    return;
  }

  const baseSha = String(args.base ?? process.env.LINEAR_BASE_SHA ?? "").trim();
  const headSha = String(args.head ?? process.env.LINEAR_HEAD_SHA ?? "").trim();

  if (baseSha && headSha) {
    const commits = getCommitMessages(baseSha, headSha)
      .filter((commit) => !commit.message.startsWith("Merge "));

    const offenders = commits.filter((commit) => !commit.message.includes(branchKey));
    if (offenders.length > 0) {
      fail(
        [
          `Found commit(s) missing required Linear key ${branchKey}:`,
          ...offenders.map((entry) => `- ${entry.sha.slice(0, 12)}`),
        ].join("\n"),
      );
      return;
    }

    if (commits.length === 0) {
      pass("No non-merge commits found in range; commit key check skipped.");
    } else {
      pass(`Commit convention check passed for ${commits.length} commit(s).`);
    }
  }

  const extracted = extractLinearKey(branchKey);
  pass(`Linear key convention passed (${extracted}) for branch ${branch}.`);
}

main();
