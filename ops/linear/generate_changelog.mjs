import path from "node:path";
import process from "node:process";

import {
  createIssue,
  createIssueComment,
  ensureLabelIds,
  fetchTeamCycles,
  formatIsoDate,
  getRequiredEnv,
  normalizeStateName,
  parseCliArgs,
  resolveFromRoot,
  writeTextFile,
} from "./client.mjs";

function toSlug(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "cycle";
}

function labelWithPrefix(issue, prefix, fallback) {
  const label = issue.labels?.nodes?.find((entry) => entry.name.startsWith(prefix));
  return label?.name ?? fallback;
}

function pickCycle(cycles, args) {
  if (args["cycle-id"]) {
    return cycles.find((cycle) => cycle.id === String(args["cycle-id"])) ?? null;
  }

  if (args["cycle-number"]) {
    const num = Number(args["cycle-number"]);
    return cycles.find((cycle) => Number(cycle.number) === num) ?? null;
  }

  if (args["cycle-name"]) {
    const name = String(args["cycle-name"]).trim().toLowerCase();
    return cycles.find((cycle) => String(cycle.name).trim().toLowerCase() === name) ?? null;
  }

  const now = Date.now();
  const active = cycles.find((cycle) => {
    const start = new Date(cycle.startsAt).getTime();
    const end = new Date(cycle.endsAt).getTime();
    return now >= start && now <= end;
  });

  if (active) return active;

  return [...cycles]
    .sort((a, b) => new Date(b.endsAt).getTime() - new Date(a.endsAt).getTime())[0] ?? null;
}

function isDoneIssue(issue) {
  const stateName = normalizeStateName(issue.state?.name ?? "");
  const stateType = String(issue.state?.type ?? "").toLowerCase();
  return stateName === "DONE" || stateType === "completed";
}

function groupIssues(issues) {
  const grouped = new Map();

  for (const issue of issues) {
    const type = labelWithPrefix(issue, "type:", "type:task");
    const area = labelWithPrefix(issue, "area:", "area:unspecified");
    const key = `${type}__${area}`;

    if (!grouped.has(key)) {
      grouped.set(key, { type, area, issues: [] });
    }

    grouped.get(key).issues.push(issue);
  }

  return [...grouped.values()]
    .sort((a, b) => `${a.type}/${a.area}`.localeCompare(`${b.type}/${b.area}`));
}

function renderChangelog(cycle, doneIssues) {
  const grouped = groupIssues(doneIssues);
  const decisions = doneIssues.filter((issue) =>
    issue.labels?.nodes?.some((entry) => entry.name === "type:decision")
  );
  const incidents = doneIssues.filter((issue) =>
    issue.labels?.nodes?.some((entry) => entry.name === "type:incident")
  );

  const lines = [
    `# Release Changelog - ${cycle.name}`,
    "",
    `- Cycle Number: ${cycle.number}`,
    `- Cycle Window: ${formatIsoDate(cycle.startsAt)} -> ${formatIsoDate(cycle.endsAt)}`,
    `- Generated On: ${new Date().toISOString()}`,
    `- DONE Issues: ${doneIssues.length}`,
    "",
  ];

  if (grouped.length === 0) {
    lines.push("No DONE issues found for the selected cycle.");
  }

  for (const bucket of grouped) {
    lines.push(`## ${bucket.type} / ${bucket.area}`);
    lines.push("");
    for (const issue of bucket.issues) {
      lines.push(`- ${issue.identifier}: ${issue.title}`);
    }
    lines.push("");
  }

  lines.push("## Decision References");
  lines.push("");
  if (decisions.length === 0) {
    lines.push("- None");
  } else {
    for (const item of decisions) {
      lines.push(`- ${item.identifier}: ${item.title}`);
    }
  }
  lines.push("");

  lines.push("## Incident References");
  lines.push("");
  if (incidents.length === 0) {
    lines.push("- None");
  } else {
    for (const item of incidents) {
      lines.push(`- ${item.identifier}: ${item.title}`);
    }
  }
  lines.push("");

  return lines.join("\n");
}

async function maybePostToLinear({ cycle, doneIssues, markdown }) {
  const teamId = getRequiredEnv("LINEAR_TEAM_ID");
  const projectId = getRequiredEnv("LINEAR_PROJECT_ID");
  const labelIds = await ensureLabelIds(["type:insight", "role:pm", "source:manual"], { teamId });

  const insightIssue = await createIssue({
    teamId,
    projectId,
    title: `Release Changelog | ${cycle.name}`,
    description: markdown,
    labelIds,
  });

  if (doneIssues.length > 0) {
    const summaryBody = [
      `Cycle changelog generated: ${insightIssue.identifier}`,
      `Cycle: ${cycle.name}`,
      `Done issues counted: ${doneIssues.length}`,
    ].join("\n");
    await createIssueComment(doneIssues[0].id, summaryBody);
  }

  return insightIssue;
}

async function main() {
  const args = parseCliArgs();
  const post = Boolean(args.post);

  const cycles = await fetchTeamCycles(getRequiredEnv("LINEAR_TEAM_ID"));
  const cycle = pickCycle(cycles, args);

  if (!cycle) {
    throw new Error("No cycle found for the provided selector.");
  }

  const doneIssues = (cycle.issues?.nodes ?? []).filter(isDoneIssue);
  const markdown = renderChangelog(cycle, doneIssues);

  const outputPath = args.output
    ? path.resolve(process.cwd(), String(args.output))
    : resolveFromRoot("knowledge-base", "linear", `changelog-${toSlug(cycle.name)}.md`);

  await writeTextFile(outputPath, markdown);
  process.stdout.write(`Changelog written: ${outputPath}\n`);

  if (post) {
    const insight = await maybePostToLinear({ cycle, doneIssues, markdown });
    process.stdout.write(`Posted changelog insight issue: ${insight.identifier}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
