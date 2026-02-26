import process from "node:process";

import {
  createIssueComment,
  getIssueWithContext,
  getRequiredEnv,
  getTeamStates,
  loadLinearConfig,
  normalizeStateName,
  parseCliArgs,
  updateIssue,
} from "./client.mjs";

function isPmActor(actorRole) {
  const normalized = String(actorRole ?? "").trim().toLowerCase();
  return normalized === "pm" || normalized === "role:pm";
}

function helpText() {
  return [
    "Usage: node ops/linear/transition_guard.mjs --issue VPB-123 --to REVIEW [--apply] [--actor-role role:pm] [--reason text] [--require-hard-preconditions]",
    "",
    "- Without --apply, this runs validation only.",
    "- With --apply, this validates and updates the Linear issue state.",
  ].join("\n");
}

function hasLabel(issue, labelName) {
  return (issue?.labels?.nodes ?? []).some((entry) => entry.name === labelName);
}

function hasMarkers(text, markers = []) {
  return markers.every((marker) => String(text ?? "").includes(marker));
}

async function main() {
  const args = parseCliArgs();
  if (args.help || args.h) {
    process.stdout.write(`${helpText()}\n`);
    return;
  }

  const issueKey = String(args.issue ?? "").trim();
  const targetState = normalizeStateName(args.to ?? "");
  const actorRole = String(args["actor-role"] ?? process.env.LINEAR_ACTOR_ROLE ?? "").trim();
  const shouldApply = Boolean(args.apply);
  const reason = String(args.reason ?? "").trim();
  const requireHard = Boolean(args["require-hard-preconditions"]);
  const mode = String(args.mode ?? "main").trim().toLowerCase();

  if (!issueKey || !targetState) {
    throw new Error("Missing required arguments: --issue and --to");
  }

  if (!isPmActor(actorRole)) {
    throw new Error(`Transition rejected: actor-role must be pm (received: ${actorRole || "<empty>"})`);
  }

  const config = await loadLinearConfig();
  const issue = await getIssueWithContext(issueKey);
  if (!issue) {
    throw new Error(`Could not find Linear issue ${issueKey}`);
  }

  const fromState = normalizeStateName(issue.state?.name ?? "");
  const allowedTargets = config.transitionGuard?.[fromState] ?? [];
  const allowed = allowedTargets.includes(targetState);

  if (!allowed) {
    throw new Error(
      `Transition rejected: ${fromState} -> ${targetState} is not allowed by transition_guard`,
    );
  }

  if (requireHard) {
    const hardPolicy = config.gatePolicy?.hard ?? {};
    const releasePolicy = config.gatePolicy?.release ?? {};
    const hardLabel = hardPolicy.label ?? "gate:hard";
    const hardApproval = hardPolicy.approvalLabel ?? "gate:hard-approved";
    const releaseType = releasePolicy.typeLabel ?? "type:release";
    const releaseOverride = releasePolicy.overrideLabel ?? "gate:override";

    const isHardLane = hasLabel(issue, hardLabel);
    if (isHardLane && [hardPolicy.requiredMainState ?? "REVIEW", "DONE"].includes(targetState)) {
      if (!hasLabel(issue, hardApproval)) {
        throw new Error(
          `Transition rejected: ${issueKey} is in hard gate lane but missing approval label ${hardApproval}`,
        );
      }
    }

    const isRelease = hasLabel(issue, releaseType);
    if (mode === "prod" && isRelease && targetState === "DONE") {
      const requiredChecklist = releasePolicy.requiredChecklistMarkers ?? [];
      if (!hasMarkers(issue.description ?? "", requiredChecklist)) {
        throw new Error(
          "Transition rejected: release issue is missing required checklist markers for prod hard gate",
        );
      }

      if (hasLabel(issue, releaseOverride)) {
        const overrideMarkers = releasePolicy.requiredOverrideMarkers ?? [];
        if (!hasMarkers(issue.description ?? "", overrideMarkers)) {
          throw new Error(
            "Transition rejected: gate:override present but override approval/follow-up markers are missing",
          );
        }
      }
    }
  }

  process.stdout.write(`Transition valid: ${issueKey} ${fromState} -> ${targetState}\n`);

  if (!shouldApply) {
    process.stdout.write("Dry-run complete. Use --apply to update Linear.\n");
    return;
  }

  const teamId = getRequiredEnv("LINEAR_TEAM_ID");
  const states = await getTeamStates(teamId);
  const target = states.find((entry) => normalizeStateName(entry.name) === targetState);

  if (!target) {
    throw new Error(`Target workflow state is not present in team: ${targetState}`);
  }

  const updated = await updateIssue(issue.id, { stateId: target.id });
  const body = [
    `State transition applied by PM guard: ${fromState} -> ${targetState}`,
    reason ? `Reason: ${reason}` : "Reason: (none provided)",
  ].join("\n");

  await createIssueComment(updated.id, body);
  process.stdout.write(`Transition applied to ${updated.identifier}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
