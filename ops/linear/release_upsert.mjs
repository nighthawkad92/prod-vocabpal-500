import process from "node:process";

import {
  createIssue,
  ensureLabelIds,
  formatIsoDate,
  getRequiredEnv,
  getTeamStates,
  parseCliArgs,
  searchIssues,
  updateIssue,
} from "./client.mjs";
import {
  addComment,
  loadConfig,
} from "./gate_helpers.mjs";

function splitCsv(value) {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function findStateIdByName(states, target) {
  const normalized = String(target ?? "").trim().toUpperCase();
  const match = states.find((entry) => String(entry.name ?? "").trim().toUpperCase() === normalized);
  return match?.id ?? null;
}

function buildReleaseBody({
  includedIssues,
  sha,
  environment,
  runUrl,
  qaReport,
  source,
  pmApproval,
  qaApproval,
  override,
}) {
  const includeText = includedIssues.length > 0 ? includedIssues.join(", ") : "";
  return [
    "## Release Metadata",
    `- SHA: ${sha}`,
    `- Environment: ${environment}`,
    `- Source: ${source}`,
    `- Run URL: ${runUrl || ""}`,
    "",
    "## Release Checklist",
    `Included Issues: ${includeText}`,
    `QA Report: ${qaReport}`,
    `PM Approval: ${pmApproval}`,
    `QA Approval: ${qaApproval}`,
    `Override: ${override ? "YES" : "NO"}`,
    "",
    "## Override Record (Required when gate:override present)",
    "Override approved by PM:",
    "Override approved by QA:",
    "Follow-up Issue:",
    "Rationale:",
    "",
    "## Changelog",
    "- Pending generation",
  ].join("\n");
}

async function findExistingReleaseIssue({ teamId, shaShort }) {
  const candidates = await searchIssues(`RELEASE | prod | ${shaShort}`, { teamId, first: 20 });
  return candidates.find((entry) => String(entry.title ?? "").includes(`| ${shaShort}`)) ?? null;
}

async function main() {
  const args = parseCliArgs();
  const config = await loadConfig();

  const teamId = String(args.teamId ?? getRequiredEnv("LINEAR_TEAM_ID")).trim();
  const projectId = String(args.projectId ?? process.env.LINEAR_PROJECT_ID ?? "").trim() || undefined;

  const sha = String(args.sha ?? process.env.GITHUB_SHA ?? "manual").trim();
  const shaShort = sha.slice(0, 7);
  const environment = String(args.environment ?? "prod").trim();
  const source = String(args.source ?? "github").trim();
  const defaultRunUrl = process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : "";
  const runUrl = String(args.url ?? process.env.LINEAR_URL ?? defaultRunUrl).trim();

  const includeFromArg = splitCsv(args.include ?? args.issues);
  const includeFromIssue = String(args.issue ?? process.env.LINEAR_ISSUE_KEY ?? "").trim();
  const includedIssues = [...new Set([...includeFromArg, ...(includeFromIssue ? [includeFromIssue] : [])])];

  const qaReport = String(args["qa-report"] ?? "qa/reports/latest_release_gate.json").trim();
  const pmApproval = String(args.pmApproval ?? "PENDING").trim();
  const qaApproval = String(args.qaApproval ?? "PENDING").trim();
  const override = Boolean(args.override);

  const title = String(args.title ?? `RELEASE | ${environment} | ${formatIsoDate()} | ${shaShort}`).trim();
  const description = buildReleaseBody({
    includedIssues,
    sha,
    environment,
    runUrl,
    qaReport,
    source,
    pmApproval,
    qaApproval,
    override,
  });

  const labelNames = [
    config.gatePolicy?.release?.typeLabel ?? "type:release",
    config.gatePolicy?.release?.environmentLabel ?? "env:prod",
    config.gatePolicy?.release?.sourceLabel ?? "source:github",
    config.gatePolicy?.hard?.label ?? "gate:hard",
  ];

  if (override) {
    labelNames.push(config.gatePolicy?.release?.overrideLabel ?? "gate:override");
  }

  const labelIds = await ensureLabelIds(labelNames, { teamId });

  const states = await getTeamStates(teamId);
  const doneStateId = findStateIdByName(states, config.gatePolicy?.hard?.requiredProdState ?? "DONE");

  const existing = await findExistingReleaseIssue({ teamId, shaShort });

  let releaseIssue;
  if (existing) {
    releaseIssue = await updateIssue(existing.id, {
      title,
      description,
      ...(projectId ? { projectId } : {}),
      labelIds,
      ...(doneStateId ? { stateId: doneStateId } : {}),
    });
  } else {
    releaseIssue = await createIssue({
      teamId,
      title,
      description,
      ...(projectId ? { projectId } : {}),
      labelIds,
      ...(doneStateId ? { stateId: doneStateId } : {}),
    });
  }

  if (includedIssues.length > 0) {
    await addComment(releaseIssue, `Included issues for this release: ${includedIssues.join(", ")}`);
  }

  process.stdout.write(`Release issue upserted: ${releaseIssue.identifier}\n`);

  const outputPath = String(args["github-output"] ?? process.env.GITHUB_OUTPUT ?? "").trim();
  if (outputPath) {
    const fs = await import("node:fs/promises");
    await fs.appendFile(outputPath, `release_issue_key=${releaseIssue.identifier}\n`, "utf8");
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
