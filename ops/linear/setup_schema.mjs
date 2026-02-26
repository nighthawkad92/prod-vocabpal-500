import process from "node:process";

import {
  ensureLabelIds,
  getRequiredEnv,
  getTeamStates,
  linearRequest,
  loadLinearConfig,
  normalizeStateName,
  parseCliArgs,
} from "./client.mjs";

const STATE_RENAMES = [
  ["Backlog", "TODO"],
  ["Todo", "READY"],
  ["In Progress", "RUNNING"],
  ["In Review", "REVIEW"],
  ["Done", "DONE"],
];

async function updateStateName(stateId, name) {
  const data = await linearRequest(
    `mutation WorkflowStateRename($id: String!, $input: WorkflowStateUpdateInput!) {
      workflowStateUpdate(id: $id, input: $input) {
        success
        workflowState {
          id
          name
        }
      }
    }`,
    {
      id: stateId,
      input: { name },
    },
  );

  if (!data.workflowStateUpdate?.success) {
    throw new Error(`Failed to rename workflow state ${stateId} to ${name}`);
  }
}

async function createBlockedState(teamId) {
  const data = await linearRequest(
    `mutation WorkflowStateCreate($input: WorkflowStateCreateInput!) {
      workflowStateCreate(input: $input) {
        success
        workflowState {
          id
          name
        }
      }
    }`,
    {
      input: {
        teamId,
        name: "BLOCKED",
        type: "started",
        color: "#f59e0b",
      },
    },
  );

  if (!data.workflowStateCreate?.success) {
    throw new Error("Failed to create BLOCKED workflow state");
  }
}

async function main() {
  const args = parseCliArgs();
  const strict = Boolean(args.strict);
  const teamId = getRequiredEnv("LINEAR_TEAM_ID");
  const config = await loadLinearConfig();

  const states = await getTeamStates(teamId);
  const byName = new Map(states.map((entry) => [normalizeStateName(entry.name), entry]));

  for (const [from, to] of STATE_RENAMES) {
    const fromNormalized = normalizeStateName(from);
    const toNormalized = normalizeStateName(to);
    if (byName.has(toNormalized)) {
      continue;
    }

    const sourceState = byName.get(fromNormalized);
    if (!sourceState) {
      continue;
    }

    try {
      await updateStateName(sourceState.id, to);
      process.stdout.write(`Renamed state '${from}' -> '${to}'\n`);
    } catch (error) {
      const message = `Could not rename state '${from}' -> '${to}': ${error instanceof Error ? error.message : String(error)}`;
      if (strict) {
        throw new Error(message);
      }
      process.stderr.write(`${message}\n`);
    }
  }

  const refreshedStates = await getTeamStates(teamId);
  const hasBlocked = refreshedStates.some((entry) => normalizeStateName(entry.name) === "BLOCKED");
  if (!hasBlocked) {
    try {
      await createBlockedState(teamId);
      process.stdout.write("Created BLOCKED state\n");
    } catch (error) {
      const message = `Could not create BLOCKED state: ${error instanceof Error ? error.message : String(error)}`;
      if (strict) {
        throw new Error(message);
      }
      process.stderr.write(`${message}\n`);
    }
  }

  const labelNames = [
    ...(config.labels?.types ?? []),
    ...(config.labels?.roles ?? []),
    "type:release",
    "gate:soft",
    "gate:soft-fail",
    "gate:hard",
    "gate:hard-approved",
    "gate:hard-fail",
    "gate:override",
    "env:dev",
    "env:preview",
    "env:prod",
    "source:manual",
    "source:github",
    "source:supabase",
  ];

  await ensureLabelIds(labelNames, { teamId });
  process.stdout.write("Schema setup complete (states + labels).\n");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
