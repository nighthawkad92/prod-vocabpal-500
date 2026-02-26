import process from "node:process";

import {
  parseCliArgs,
} from "./client.mjs";
import {
  addComment,
  applyIssueLabels,
  hasIssueLabel,
  issueDescription,
  issueHasCommentMarker,
  issueState,
  loadConfig,
  loadQaReport,
  qaReportPassed,
  resolveIssueOrThrow,
} from "./gate_helpers.mjs";

const ISSUE_KEY_PATTERN = /\b[A-Z][A-Z0-9]+-\d+\b/g;

function parseMarkerKey(text, marker) {
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`${escaped}\\s*([A-Z][A-Z0-9]+-\\d+)`, "i");
  const match = String(text ?? "").match(pattern);
  return match?.[1] ?? null;
}

function parseIncludedIssueKeys(description) {
  const block = String(description ?? "").match(/Included Issues:\s*([\s\S]*?)(\n\n|$)/i);
  if (!block) {
    return [];
  }
  const keys = block[1].match(ISSUE_KEY_PATTERN) ?? [];
  return [...new Set(keys)];
}

function hasAllMarkers(text, markers) {
  return markers.every((marker) => String(text ?? "").includes(marker));
}

function renderReport(title, checks) {
  const pass = checks.every((entry) => entry.pass);
  const lines = [
    `## ${title}`,
    "",
    `Result: **${pass ? "PASSED" : "FAILED"}**`,
    "",
    ...checks.map((entry) => `- [${entry.pass ? "x" : " "}] ${entry.id}: ${entry.detail}`),
  ];

  return {
    pass,
    text: lines.join("\n"),
  };
}

async function validateMainGate(issue, config) {
  const hard = config.gatePolicy?.hard ?? {};
  const lineage = config.lineagePolicy ?? {};

  const description = issueDescription(issue);
  const parentDescription = issueDescription(issue.parent);

  const storyKey = issue.parent?.identifier || parseMarkerKey(description, lineage.parentStoryMarker ?? "Parent Story:");
  const requestKey = parseMarkerKey(description, lineage.parentRequestMarker ?? "Parent Request:")
    || parseMarkerKey(parentDescription, lineage.parentRequestMarker ?? "Parent Request:");

  const checks = [
    {
      id: "state",
      pass: issueState(issue) === String(hard.requiredMainState ?? "REVIEW").toUpperCase(),
      detail: `state=${issueState(issue)}`,
    },
    {
      id: "gate-label",
      pass: hasIssueLabel(issue, hard.label ?? "gate:hard"),
      detail: `requires ${hard.label ?? "gate:hard"}`,
    },
    {
      id: "approval-label",
      pass: hasIssueLabel(issue, hard.approvalLabel ?? "gate:hard-approved"),
      detail: `requires ${hard.approvalLabel ?? "gate:hard-approved"}`,
    },
    {
      id: "lineage-story",
      pass: Boolean(storyKey),
      detail: storyKey ? `story=${storyKey}` : "missing Parent Story",
    },
    {
      id: "lineage-request",
      pass: Boolean(requestKey),
      detail: requestKey ? `request=${requestKey}` : "missing Parent Request",
    },
    {
      id: "handoff-evidence",
      pass: issueHasCommentMarker(issue, hard.requiredHandoffMarker ?? "## Role Handoff"),
      detail: `requires comment marker ${hard.requiredHandoffMarker ?? "## Role Handoff"}`,
    },
  ];

  return renderReport("Hard Gate (Main)", checks);
}

async function validateProdGate(releaseIssue, config, qaReportPath) {
  const hard = config.gatePolicy?.hard ?? {};
  const release = config.gatePolicy?.release ?? {};

  const description = issueDescription(releaseIssue);
  const includedIssueKeys = parseIncludedIssueKeys(description);

  const includedIssues = await Promise.all(includedIssueKeys.map((key) => resolveIssueOrThrow(key)));
  const includedDone = includedIssues.every((entry) => issueState(entry) === "DONE");

  const qaReport = await loadQaReport(qaReportPath);
  const qaPassed = qaReportPassed(qaReport);
  const qaLoadMode = String(qaReport?.loadGate?.mode ?? "").toLowerCase();

  const hasOverride = hasIssueLabel(releaseIssue, release.overrideLabel ?? "gate:override");
  const overrideMarkersPass = hasOverride
    ? hasAllMarkers(description, release.requiredOverrideMarkers ?? [])
    : true;

  const checks = [
    {
      id: "release-type",
      pass: hasIssueLabel(releaseIssue, release.typeLabel ?? "type:release"),
      detail: `requires ${release.typeLabel ?? "type:release"}`,
    },
    {
      id: "state",
      pass: issueState(releaseIssue) === String(hard.requiredProdState ?? "DONE").toUpperCase(),
      detail: `state=${issueState(releaseIssue)}`,
    },
    {
      id: "gate-label",
      pass: hasIssueLabel(releaseIssue, hard.label ?? "gate:hard"),
      detail: `requires ${hard.label ?? "gate:hard"}`,
    },
    {
      id: "approval-label",
      pass: hasIssueLabel(releaseIssue, hard.approvalLabel ?? "gate:hard-approved"),
      detail: `requires ${hard.approvalLabel ?? "gate:hard-approved"}`,
    },
    {
      id: "release-checklist",
      pass: hasAllMarkers(description, release.requiredChecklistMarkers ?? []),
      detail: "required checklist markers present",
    },
    {
      id: "included-issues",
      pass: includedIssueKeys.length > 0,
      detail: includedIssueKeys.length > 0 ? includedIssueKeys.join(", ") : "no included issues",
    },
    {
      id: "included-issues-done",
      pass: includedDone,
      detail: includedDone ? "all included issues are DONE" : "one or more included issues are not DONE",
    },
    {
      id: "qa-report",
      pass: qaPassed,
      detail: qaPassed ? "qa release gate passed" : "qa release gate did not pass",
    },
    {
      id: "qa-load-hard",
      pass: qaLoadMode === "hard",
      detail: `load mode=${qaLoadMode || "missing"}`,
    },
    {
      id: "override-checklist",
      pass: overrideMarkersPass,
      detail: hasOverride ? "override markers present" : "override not requested",
    },
  ];

  return renderReport("Hard Gate (Prod)", checks);
}

async function run() {
  const args = parseCliArgs();
  const mode = String(args.mode ?? "main").trim().toLowerCase();
  const issueKey = String(args.issue ?? args.release ?? process.env.LINEAR_ISSUE_KEY ?? "").trim();
  const qaReportPath = String(args["qa-report"] ?? "qa/reports/latest_release_gate.json").trim();

  if (!issueKey) {
    throw new Error("Missing required argument: --issue <LINEAR_KEY>");
  }

  if (!["main", "prod"].includes(mode)) {
    throw new Error(`Unsupported mode: ${mode}. Use --mode main|prod`);
  }

  const config = await loadConfig();
  const issue = await resolveIssueOrThrow(issueKey);

  const result = mode === "main"
    ? await validateMainGate(issue, config)
    : await validateProdGate(issue, config, qaReportPath);

  const hardFailLabel = config.gatePolicy?.hard?.failureLabel ?? "gate:hard-fail";

  await applyIssueLabels(issue, {
    add: result.pass ? [] : [hardFailLabel],
    remove: result.pass ? [hardFailLabel] : [],
  });

  await addComment(issue, result.text);
  process.stdout.write(`${result.text}\n`);

  if (!result.pass) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
