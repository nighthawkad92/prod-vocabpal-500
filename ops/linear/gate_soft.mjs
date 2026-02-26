import process from "node:process";

import { parseCliArgs } from "./client.mjs";
import {
  addComment,
  applyIssueLabels,
  loadConfig,
  resolveIssueOrThrow,
} from "./gate_helpers.mjs";

function normalizeStatus(value) {
  const status = String(value ?? "unknown").trim().toLowerCase();
  if (["pass", "passed", "success", "ok"].includes(status)) return "passed";
  if (["fail", "failed", "error"].includes(status)) return "failed";
  return "warning";
}

function renderComment({ status, context, source, url }) {
  return [
    "## Soft Gate Result",
    "",
    `- Status: ${status.toUpperCase()}`,
    `- Source: ${source}`,
    `- Context: ${context}`,
    `- URL: ${url || "-"}`,
    "",
    "Soft gate is advisory and does not block merge by itself.",
  ].join("\n");
}

async function run() {
  const args = parseCliArgs();
  const issueKey = String(args.issue ?? process.env.LINEAR_ISSUE_KEY ?? "").trim();
  if (!issueKey) {
    process.stdout.write("Soft gate skipped: no issue key provided.\n");
    return;
  }

  const status = normalizeStatus(args.status ?? process.env.LINEAR_GATE_STATUS ?? "warning");
  const context = String(args.context ?? process.env.LINEAR_GATE_CONTEXT ?? "preview-validation").trim();
  const source = String(args.source ?? process.env.LINEAR_EVENT_SOURCE ?? "github").trim();
  const url = String(args.url ?? process.env.LINEAR_URL ?? "").trim();

  const config = await loadConfig();
  const issue = await resolveIssueOrThrow(issueKey);

  const softLabel = config.gatePolicy?.soft?.label ?? "gate:soft";
  const softFailLabel = config.gatePolicy?.soft?.failureLabel ?? "gate:soft-fail";

  const add = [softLabel];
  const remove = [];

  if (status === "failed") {
    add.push(softFailLabel);
  } else {
    remove.push(softFailLabel);
  }

  await applyIssueLabels(issue, { add, remove });
  await addComment(issue, renderComment({ status, context, source, url }));

  process.stdout.write(`Soft gate recorded for ${issue.identifier} (${status}).\n`);
}

run()
  .catch((error) => {
    process.stderr.write(`Soft gate advisory error: ${error instanceof Error ? error.message : String(error)}\n`);
  })
  .finally(() => {
    process.exitCode = 0;
  });
