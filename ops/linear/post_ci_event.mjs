import process from "node:process";

import {
  createIssueComment,
  extractLinearKey,
  findIssueByIdentifier,
  parseCliArgs,
} from "./client.mjs";

function parseMetadata(value) {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return { raw: String(value) };
  }
}

function buildComment({
  source,
  eventType,
  environment,
  status,
  url,
  sha,
  timestamp,
  metadata,
}) {
  const lines = [
    "## CI / Build Event",
    "",
    `- Source: ${source}`,
    `- Event: ${eventType}`,
    `- Environment: ${environment}`,
    `- Status: ${status}`,
    `- SHA: ${sha || "-"}`,
    `- Timestamp: ${timestamp}`,
    `- URL: ${url || "-"}`,
  ];

  const metadataEntries = Object.entries(metadata ?? {});
  if (metadataEntries.length > 0) {
    lines.push("", "### Metadata");
    for (const [key, value] of metadataEntries) {
      lines.push(`- ${key}: ${String(value)}`);
    }
  }

  return lines.join("\n");
}

async function main() {
  const args = parseCliArgs();

  const issueKeyCandidate = String(
    args.issueKey
      ?? process.env.LINEAR_ISSUE_KEY
      ?? process.env.ISSUE_KEY
      ?? "",
  ).trim();

  const issueKey = extractLinearKey(issueKeyCandidate);
  if (!issueKey) {
    process.stdout.write("No Linear issue key found for CI event; skipping Linear post.\n");
    return;
  }

  const defaultRunUrl = process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID ?? ""}`
    : "";

  const payload = {
    source: String(args.source ?? process.env.LINEAR_EVENT_SOURCE ?? "github").trim(),
    eventType: String(args.eventType ?? process.env.LINEAR_EVENT_TYPE ?? "ci-event").trim(),
    environment: String(args.environment ?? process.env.LINEAR_ENVIRONMENT ?? "preview").trim(),
    status: String(args.status ?? process.env.LINEAR_STATUS ?? "unknown").trim(),
    url: String(args.url ?? process.env.LINEAR_URL ?? defaultRunUrl).trim(),
    sha: String(args.sha ?? process.env.LINEAR_SHA ?? process.env.GITHUB_SHA ?? "").trim(),
    timestamp: String(args.timestamp ?? process.env.LINEAR_TIMESTAMP ?? new Date().toISOString()).trim(),
    metadata: parseMetadata(args.metadata ?? process.env.LINEAR_METADATA ?? ""),
  };

  const issue = await findIssueByIdentifier(issueKey);
  if (!issue) {
    throw new Error(`Unable to find Linear issue ${issueKey}`);
  }

  const comment = buildComment(payload);
  await createIssueComment(issue.id, comment);

  process.stdout.write(`Posted CI event to ${issue.identifier}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
