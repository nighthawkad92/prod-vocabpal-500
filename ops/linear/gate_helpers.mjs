import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  createIssueComment,
  ensureLabelIds,
  getIssueWithContext,
  getRequiredEnv,
  loadLinearConfig,
  normalizeStateName,
  resolveFromRoot,
  updateIssue,
} from "./client.mjs";

export function issueLabelNames(issue) {
  return (issue?.labels?.nodes ?? []).map((entry) => entry.name);
}

export function hasIssueLabel(issue, labelName) {
  return issueLabelNames(issue).includes(labelName);
}

export function issueComments(issue) {
  return issue?.comments?.nodes ?? [];
}

export function issueHasCommentMarker(issue, marker) {
  return issueComments(issue).some((entry) => String(entry.body ?? "").includes(marker));
}

export function issueHasAnyCommentMarker(issue, markers) {
  return markers.some((marker) => issueHasCommentMarker(issue, marker));
}

export function issueHasAllCommentMarkers(issue, markers) {
  return markers.every((marker) => issueHasCommentMarker(issue, marker));
}

export function issueDescription(issue) {
  return String(issue?.description ?? "");
}

export function issueState(issue) {
  return normalizeStateName(issue?.state?.name ?? "");
}

export async function loadQaReport(reportPath) {
  if (!reportPath) {
    return null;
  }

  const resolved = path.isAbsolute(reportPath)
    ? reportPath
    : resolveFromRoot(reportPath);

  const raw = await fs.readFile(resolved, "utf8");
  return JSON.parse(raw);
}

export function qaReportPassed(report) {
  if (!report) {
    return false;
  }

  if (report.hardGateEligible === true) {
    return true;
  }

  return String(report.overallStatus ?? "").toLowerCase() === "passed";
}

export async function applyIssueLabels(issue, {
  add = [],
  remove = [],
  teamId = getRequiredEnv("LINEAR_TEAM_ID"),
} = {}) {
  const current = new Set(issueLabelNames(issue));
  for (const label of add) {
    if (label) current.add(label);
  }
  for (const label of remove) {
    if (label) current.delete(label);
  }

  const nextLabels = [...current];
  const labelIds = await ensureLabelIds(nextLabels, { teamId });
  return updateIssue(issue.id, { labelIds });
}

export async function addComment(issue, body) {
  return createIssueComment(issue.id, body);
}

export function formatCheckLines(checks) {
  return checks.map((entry) => `- [${entry.pass ? "x" : " "}] ${entry.label}${entry.detail ? ` (${entry.detail})` : ""}`).join("\n");
}

export function summarizeOutcome(title, checks, footer = "") {
  const pass = checks.every((entry) => entry.pass);
  const status = pass ? "PASSED" : "FAILED";
  return [
    `## ${title}`,
    "",
    `Result: **${status}**`,
    "",
    formatCheckLines(checks),
    footer ? `\n${footer}` : "",
  ].join("\n").trim();
}

export async function resolveIssueOrThrow(issueKey) {
  const issue = await getIssueWithContext(issueKey);
  if (!issue) {
    throw new Error(`Unable to find Linear issue: ${issueKey}`);
  }
  return issue;
}

export async function loadConfig() {
  return loadLinearConfig();
}

export function outputAndExitCode(result, shouldFailOnError = false) {
  process.stdout.write(`${result}\n`);
  if (shouldFailOnError) {
    process.exitCode = 1;
  }
}
