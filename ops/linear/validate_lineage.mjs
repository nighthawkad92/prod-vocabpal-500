import process from "node:process";

import {
  parseCliArgs,
} from "./client.mjs";
import {
  hasIssueLabel,
  issueDescription,
  issueHasAnyCommentMarker,
  loadConfig,
  resolveIssueOrThrow,
} from "./gate_helpers.mjs";

const KEY_PATTERN = /\b[A-Z][A-Z0-9]+-\d+\b/;

function parseMarkerKey(text, marker) {
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`${escaped}\\s*(${KEY_PATTERN.source})`, "i");
  const match = String(text ?? "").match(pattern);
  return match?.[1] ?? null;
}

function collectIncludedIssueKeys(text) {
  const sectionMatch = String(text ?? "").match(/Included Issues:\s*([\s\S]*?)(\n\n|$)/i);
  if (!sectionMatch) {
    return [];
  }

  const keys = sectionMatch[1].match(new RegExp(KEY_PATTERN.source, "g")) ?? [];
  return [...new Set(keys)];
}

async function validateTaskLike(issue, config) {
  const description = issueDescription(issue);
  const parentDescription = issueDescription(issue.parent);

  const storyKeyFromMarker = parseMarkerKey(description, config.lineagePolicy.parentStoryMarker);
  const storyKeyFromParent = issue.parent?.identifier ?? null;
  const storyKey = storyKeyFromParent || storyKeyFromMarker;

  const requestKeyFromIssue = parseMarkerKey(description, config.lineagePolicy.parentRequestMarker);
  const requestKeyFromParent = parseMarkerKey(parentDescription, config.lineagePolicy.parentRequestMarker);
  const requestKey = requestKeyFromIssue || requestKeyFromParent;

  const hasEvidence = issueHasAnyCommentMarker(issue, config.lineagePolicy.minimumEvidenceMarkers ?? []);

  const checks = [
    {
      id: "story-link",
      pass: Boolean(storyKey),
      detail: storyKey ? `story=${storyKey}` : "missing Parent Story",
    },
    {
      id: "request-link",
      pass: Boolean(requestKey),
      detail: requestKey ? `request=${requestKey}` : "missing Parent Request",
    },
    {
      id: "evidence",
      pass: hasEvidence,
      detail: hasEvidence ? "handoff/qa evidence found" : "missing Role Handoff or QA Evidence comment marker",
    },
  ];

  return {
    issueKey: issue.identifier,
    issueType: "task-like",
    pass: checks.every((entry) => entry.pass),
    checks,
  };
}

async function validateRelease(issue) {
  const description = issueDescription(issue);
  const includedIssueKeys = collectIncludedIssueKeys(description);

  const checks = [
    {
      id: "release-type",
      pass: true,
      detail: "type:release",
    },
    {
      id: "included-issues",
      pass: includedIssueKeys.length > 0,
      detail: includedIssueKeys.length > 0
        ? `${includedIssueKeys.length} issue key(s)`
        : "missing Included Issues section",
    },
  ];

  return {
    issueKey: issue.identifier,
    issueType: "release",
    includedIssueKeys,
    pass: checks.every((entry) => entry.pass),
    checks,
  };
}

async function main() {
  const args = parseCliArgs();
  const issueKey = String(args.issue ?? "").trim();
  const asJson = Boolean(args.json);

  if (!issueKey) {
    throw new Error("Missing required argument: --issue <LINEAR_KEY>");
  }

  const config = await loadConfig();
  const issue = await resolveIssueOrThrow(issueKey);

  const isRelease = hasIssueLabel(issue, config.gatePolicy?.release?.typeLabel ?? "type:release");

  const result = isRelease
    ? await validateRelease(issue)
    : await validateTaskLike(issue, config);

  if (asJson) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(`Lineage ${result.pass ? "PASSED" : "FAILED"} for ${result.issueKey}\n`);
    for (const check of result.checks) {
      process.stdout.write(`- ${check.pass ? "PASS" : "FAIL"} ${check.id}: ${check.detail}\n`);
    }
  }

  if (!result.pass) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
