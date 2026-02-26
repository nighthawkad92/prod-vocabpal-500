import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  createIssueComment,
  extractLinearKey,
  findIssueByIdentifier,
  findIssueByTaskId,
  parseCliArgs,
  resolveFromRoot,
} from "./client.mjs";

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (!value || String(value).trim().length === 0) return [];
  return String(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function toMaybePathString(value) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : "";
}

async function loadPayload(args) {
  if (args.payload) {
    const payloadPath = path.resolve(process.cwd(), String(args.payload));
    const raw = await fs.readFile(payloadPath, "utf8");
    return JSON.parse(raw);
  }

  return {
    taskId: args.taskId ?? args.task,
    handoffPath: args.handoffPath ?? args.handoff,
    role: args.role ?? "",
    summary: args.summary ?? "",
    testsRun: toArray(args.testsRun),
    risks: toArray(args.risks),
    evidenceUrls: toArray(args.evidenceUrls),
    requestedPmAction: args.requestedPmAction ?? "",
  };
}

function normalizePayload(input) {
  return {
    taskId: String(input.taskId ?? "").trim(),
    handoffPath: toMaybePathString(input.handoffPath),
    role: String(input.role ?? "").trim(),
    summary: String(input.summary ?? "").trim(),
    testsRun: toArray(input.testsRun),
    risks: toArray(input.risks),
    evidenceUrls: toArray(input.evidenceUrls),
    requestedPmAction: String(input.requestedPmAction ?? "").trim(),
  };
}

function renderHandoffComment(payload) {
  const tests = payload.testsRun.length > 0
    ? payload.testsRun.map((item) => `- ${item}`).join("\n")
    : "- Not provided";

  const risks = payload.risks.length > 0
    ? payload.risks.map((item) => `- ${item}`).join("\n")
    : "- None listed";

  const evidence = payload.evidenceUrls.length > 0
    ? payload.evidenceUrls.map((item) => `- ${item}`).join("\n")
    : "- Not provided";

  return [
    "## Role Handoff",
    "",
    `- Task: ${payload.taskId}`,
    `- Role: ${payload.role || "(not provided)"}`,
    `- Handoff artifact: ${payload.handoffPath || "(inline only)"}`,
    "",
    "### Summary",
    payload.summary || "No summary provided.",
    "",
    "### Tests Run",
    tests,
    "",
    "### Risks",
    risks,
    "",
    "### Evidence URLs",
    evidence,
    "",
    "### Requested PM Action",
    payload.requestedPmAction || "Review and progress according to transition guard.",
  ].join("\n");
}

async function resolveIssue(taskId) {
  const key = extractLinearKey(taskId);
  if (key) {
    const byKey = await findIssueByIdentifier(key);
    if (byKey) return byKey;
  }

  return findIssueByTaskId(taskId);
}

async function main() {
  const args = parseCliArgs();
  const payload = normalizePayload(await loadPayload(args));

  if (!payload.taskId) {
    throw new Error("Missing required taskId in handoff payload");
  }

  if (payload.handoffPath) {
    const handoffAbs = path.isAbsolute(payload.handoffPath)
      ? payload.handoffPath
      : resolveFromRoot(payload.handoffPath);

    try {
      await fs.access(handoffAbs);
    } catch {
      throw new Error(`Handoff file does not exist: ${handoffAbs}`);
    }

    payload.handoffPath = path.relative(resolveFromRoot("."), handoffAbs);
  }

  const issue = await resolveIssue(payload.taskId);
  if (!issue) {
    throw new Error(`Could not locate Linear issue for taskId: ${payload.taskId}`);
  }

  const comment = renderHandoffComment(payload);
  await createIssueComment(issue.id, comment);

  process.stdout.write(`Posted handoff to ${issue.identifier}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
