import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  createIssue,
  createIssueComment,
  createIssueRelation,
  ensureLabelIds,
  findIssueByTaskId,
  getRequiredEnv,
  getTeamStates,
  loadLinearConfig,
  normalizeStateName,
  parseCliArgs,
  resolveFromRoot,
  updateIssue,
  writeTextFile,
} from "./client.mjs";

function parseBoardRows(markdown) {
  const lines = markdown.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) =>
    line.includes("| Task ID | Title | Owner | Depends On | State | Notes |")
  );

  if (headerIndex < 0) {
    throw new Error("Could not find board table header in agent_board.md");
  }

  const rows = [];
  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const raw = lines[i].trim();
    if (!raw.startsWith("|")) {
      if (rows.length > 0) break;
      continue;
    }

    if (raw.startsWith("|---")) {
      continue;
    }

    const cols = raw.split("|").slice(1, -1).map((value) => value.trim());
    if (cols.length < 6) {
      continue;
    }

    const [taskId, title, owner, dependsOn, state, ...noteParts] = cols;
    if (!taskId || taskId === "Task ID") {
      continue;
    }

    rows.push({
      taskId,
      title,
      owner,
      dependsOn,
      state,
      notes: noteParts.join(" | "),
    });
  }

  return rows;
}

function parseDependencies(rawDependsOn) {
  if (!rawDependsOn || rawDependsOn === "-" || rawDependsOn.toLowerCase() === "none") {
    return [];
  }

  return rawDependsOn
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && value !== "-");
}

function selectRowsForImport(rows, { includeDone = true, recentDone = 120, max = Number.POSITIVE_INFINITY } = {}) {
  if (!includeDone) {
    return rows.filter((row) => normalizeStateName(row.state) !== "DONE").slice(0, max);
  }

  const activeIds = new Set(
    rows
      .filter((row) => normalizeStateName(row.state) !== "DONE")
      .map((row) => row.taskId),
  );

  const doneRows = rows.filter((row) => normalizeStateName(row.state) === "DONE");
  const recentDoneRows = doneRows.slice(-recentDone);
  const selectedIds = new Set([...activeIds, ...recentDoneRows.map((row) => row.taskId)]);

  return rows.filter((row) => selectedIds.has(row.taskId)).slice(0, max);
}

function taskKindFromId(taskId, config) {
  const prefix = taskId.split("-")[0];
  return config.taskTypeMap?.[prefix] ?? "type:task";
}

function buildDescription(row) {
  const dependencies = parseDependencies(row.dependsOn);
  const dependencyText = dependencies.length > 0 ? dependencies.join(", ") : "-";
  return [
    "## Imported From agent_board.md",
    "",
    `- Task ID: ${row.taskId}`,
    `- Owner: ${row.owner || "-"}`,
    `- Depends On: ${dependencyText}`,
    `- Original State: ${row.state || "-"}`,
    "",
    "### Notes",
    row.notes || "-",
  ].join("\n");
}

async function main() {
  const args = parseCliArgs();
  const dryRun = Boolean(args["dry-run"]);
  const includeDone = args["include-done"] !== "false";
  const recentDone = Number.parseInt(String(args["recent-done"] ?? "120"), 10);
  const max = Number.parseInt(String(args.max ?? "9999"), 10);
  const config = await loadLinearConfig();

  const boardFile = args.file
    ? path.resolve(process.cwd(), String(args.file))
    : resolveFromRoot(config.migration?.legacyBoardPath ?? "agent_board.md");

  const teamId = getRequiredEnv("LINEAR_TEAM_ID");
  const projectId = getRequiredEnv("LINEAR_PROJECT_ID");

  const markdown = await fs.readFile(boardFile, "utf8");
  const rows = parseBoardRows(markdown);
  const selectedRows = selectRowsForImport(rows, { includeDone, recentDone, max });

  const states = await getTeamStates(teamId);
  const stateByName = new Map(states.map((state) => [normalizeStateName(state.name), state.id]));

  const issueIndex = new Map();
  const unresolved = [];

  for (const row of selectedRows) {
    const rowState = normalizeStateName(row.state || "TODO");
    const stateId = stateByName.get(rowState) ?? stateByName.get("TODO") ?? null;

    if (!stateId) {
      unresolved.push(`No matching Linear state id for row ${row.taskId} (${rowState})`);
      continue;
    }

    const roleLabel = config.ownerRoleMap?.[row.owner] ?? null;
    const typeLabel = taskKindFromId(row.taskId, config);
    const labelNames = [typeLabel, roleLabel].filter(Boolean);
    const labelIds = dryRun ? [] : await ensureLabelIds(labelNames, { teamId });

    const basePayload = {
      title: `${row.taskId} | ${row.title}`,
      description: buildDescription(row),
      stateId,
      projectId,
      labelIds,
    };

    const existing = dryRun ? null : await findIssueByTaskId(row.taskId);

    if (dryRun) {
      process.stdout.write(`[dry-run] ${existing ? "update" : "create"} ${row.taskId}\n`);
      issueIndex.set(row.taskId, {
        id: `dry-${row.taskId}`,
        identifier: row.taskId,
        title: basePayload.title,
      });
      continue;
    }

    const issue = existing
      ? await updateIssue(existing.id, basePayload)
      : await createIssue({ ...basePayload, teamId });

    issueIndex.set(row.taskId, issue);
    process.stdout.write(`[sync] ${issue.identifier} <= ${row.taskId}\n`);
  }

  let relationCount = 0;
  let relationWarnings = 0;

  for (const row of selectedRows) {
    const issue = issueIndex.get(row.taskId);
    if (!issue || dryRun) continue;

    const dependencyTaskIds = parseDependencies(row.dependsOn);
    if (dependencyTaskIds.length === 0) continue;

    const dependencyIssues = dependencyTaskIds
      .map((taskId) => issueIndex.get(taskId))
      .filter(Boolean);

    if (dependencyIssues.length === 0) continue;

    for (const depIssue of dependencyIssues) {
      try {
        const linked = await createIssueRelation(issue.id, depIssue.id);
        if (linked) {
          relationCount += 1;
        }
      } catch {
        relationWarnings += 1;
      }
    }

    const dependencyText = dependencyIssues.map((entry) => entry.identifier).join(", ");
    await createIssueComment(issue.id, `Dependencies imported: ${dependencyText}`);
  }

  const reportLines = [
    `Board rows parsed: ${rows.length}`,
    `Rows selected for import: ${selectedRows.length}`,
    `Issues synced: ${issueIndex.size}`,
    `Relations linked: ${relationCount}`,
    `Relation warnings: ${relationWarnings}`,
  ];

  if (unresolved.length > 0) {
    reportLines.push("", "Warnings:", ...unresolved.map((line) => `- ${line}`));
  }

  const reportPath = resolveFromRoot("knowledge-base", "linear", "import-last-run.txt");
  await writeTextFile(reportPath, reportLines.join("\n"));

  process.stdout.write(`Import complete. Report: ${reportPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
