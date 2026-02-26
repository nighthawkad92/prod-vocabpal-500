import path from "node:path";
import process from "node:process";

import {
  createIssue,
  ensureLabelIds,
  fetchTeamIssues,
  formatIsoDate,
  getRequiredEnv,
  parseCliArgs,
  resolveFromRoot,
  writeTextFile,
} from "./client.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;

function hasLabel(issue, expected) {
  return issue.labels?.nodes?.some((entry) => entry.name === expected) ?? false;
}

function withPrefix(issue, prefix) {
  return issue.labels?.nodes?.some((entry) => entry.name.startsWith(prefix)) ?? false;
}

function toPercent(value, total) {
  if (!total) return "0.0";
  return ((value / total) * 100).toFixed(1);
}

function renderInsight({ since, until, metrics, risks }) {
  const lines = [
    `# Weekly Insight Report (${formatIsoDate(since)} -> ${formatIsoDate(until)})`,
    "",
    "## Throughput",
    "",
    `- Issues created: ${metrics.created}`,
    `- Issues completed: ${metrics.completed}`,
    `- Issues currently in REVIEW: ${metrics.review}`,
    "",
    "## Quality and Reliability",
    "",
    `- Incidents created: ${metrics.incidents}`,
    `- Build-event records: ${metrics.buildEvents}`,
    `- Blocked >48h: ${metrics.blockedAging48h}`,
    "",
    "## Governance KPIs (Derived)",
    "",
    `- Linked commit coverage (source:github labels): ${toPercent(metrics.githubSourced, metrics.activeWork)}% (${metrics.githubSourced}/${metrics.activeWork || 0})`,
    `- Linked deploy event coverage (type:build-event): ${toPercent(metrics.buildEvents, metrics.completed || metrics.activeWork || 1)}%`,
    `- Handoff evidence coverage in REVIEW (handoff marker in description): ${toPercent(metrics.reviewWithHandoff, metrics.review)}% (${metrics.reviewWithHandoff}/${metrics.review || 0})`,
    `- Request-to-story conversion lead time proxy (count ratio): ${toPercent(metrics.stories, metrics.requests || 1)}% stories per request`,
    `- Escaped defects this window (type:incident in prod): ${metrics.prodIncidents}`,
    "",
    "## Risks",
    "",
  ];

  if (risks.length === 0) {
    lines.push("- No high-risk trend detected in this interval.");
  } else {
    for (const risk of risks) {
      lines.push(`- ${risk}`);
    }
  }

  lines.push("", "## Notes", "", "- Metrics are generated from Linear issue metadata and labels.");
  lines.push("- For exact commit/deploy coverage, keep `source:*`, `env:*`, and `type:*` labels current.");
  lines.push("");

  return lines.join("\n");
}

async function main() {
  const args = parseCliArgs();
  const post = Boolean(args.post);
  const days = Number.parseInt(String(args.days ?? "7"), 10);

  const until = new Date();
  const since = new Date(until.getTime() - days * DAY_MS);

  const issues = await fetchTeamIssues({ teamId: getRequiredEnv("LINEAR_TEAM_ID") });

  const inWindow = issues.filter((issue) => new Date(issue.createdAt).getTime() >= since.getTime());
  const completedInWindow = issues.filter((issue) => {
    if (!issue.completedAt) return false;
    return new Date(issue.completedAt).getTime() >= since.getTime();
  });

  const activeWork = issues.filter((issue) => !["completed", "canceled"].includes(String(issue.state?.type ?? "").toLowerCase())).length;

  const reviewIssues = issues.filter((issue) => String(issue.state?.name ?? "").toUpperCase() === "REVIEW");
  const blockedAging48h = issues.filter((issue) => {
    const state = String(issue.state?.name ?? "").toUpperCase();
    if (state !== "BLOCKED") return false;
    const ageMs = Date.now() - new Date(issue.updatedAt).getTime();
    return ageMs > 48 * 60 * 60 * 1000;
  }).length;

  const metrics = {
    created: inWindow.length,
    completed: completedInWindow.length,
    review: reviewIssues.length,
    incidents: inWindow.filter((issue) => hasLabel(issue, "type:incident")).length,
    prodIncidents: inWindow.filter((issue) => hasLabel(issue, "type:incident") && hasLabel(issue, "env:prod")).length,
    buildEvents: inWindow.filter((issue) => hasLabel(issue, "type:build-event")).length,
    blockedAging48h,
    githubSourced: inWindow.filter((issue) => hasLabel(issue, "source:github")).length,
    reviewWithHandoff: reviewIssues.filter((issue) =>
      String(issue.description ?? "").toLowerCase().includes("handoff")
    ).length,
    requests: inWindow.filter((issue) => hasLabel(issue, "type:request")).length,
    stories: inWindow.filter((issue) => hasLabel(issue, "type:story")).length,
    activeWork,
  };

  const risks = [];
  if (metrics.blockedAging48h > 0) {
    risks.push(`${metrics.blockedAging48h} blocked issue(s) exceeded 48h age.`);
  }
  if (metrics.prodIncidents > 0) {
    risks.push(`${metrics.prodIncidents} production incident issue(s) were logged this week.`);
  }
  if (metrics.review > 0 && metrics.reviewWithHandoff < metrics.review) {
    risks.push("Some REVIEW issues are missing explicit handoff evidence markers.");
  }

  const markdown = renderInsight({ since, until, metrics, risks });
  const outputPath = args.output
    ? path.resolve(process.cwd(), String(args.output))
    : resolveFromRoot("knowledge-base", "linear", `weekly-insight-${formatIsoDate(until)}.md`);

  await writeTextFile(outputPath, markdown);
  process.stdout.write(`Weekly insight report written: ${outputPath}\n`);

  if (post) {
    const teamId = getRequiredEnv("LINEAR_TEAM_ID");
    const projectId = getRequiredEnv("LINEAR_PROJECT_ID");
    const labelIds = await ensureLabelIds(["type:insight", "role:pm", "source:manual"], { teamId });

    const issue = await createIssue({
      teamId,
      projectId,
      title: `Weekly Insight Report | ${formatIsoDate(until)}`,
      description: markdown,
      labelIds,
    });

    process.stdout.write(`Posted weekly insight issue: ${issue.identifier}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
