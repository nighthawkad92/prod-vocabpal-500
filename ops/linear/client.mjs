import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ROOT_DIR = path.resolve(__dirname, "..", "..");
export const DEFAULT_CONFIG_PATH = path.join(ROOT_DIR, "ops/linear/config.json");
export const LINEAR_API_URL = "https://api.linear.app/graphql";
export const LINEAR_KEY_REGEX = /\b[A-Z][A-Z0-9]+-\d+\b/;

export function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

export function getOptionalEnv(name, fallback = "") {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    return fallback;
  }
  return value.trim();
}

export function normalizeStateName(value) {
  return String(value ?? "").trim().toUpperCase();
}

export function parseCliArgs(argv = process.argv.slice(2)) {
  const parsed = { _: [] };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      parsed._.push(token);
      continue;
    }

    const body = token.slice(2);
    const equalsAt = body.indexOf("=");

    if (equalsAt >= 0) {
      const key = body.slice(0, equalsAt);
      const value = body.slice(equalsAt + 1);
      parsed[key] = value;
      continue;
    }

    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      parsed[body] = true;
      continue;
    }

    parsed[body] = next;
    i += 1;
  }

  return parsed;
}

export async function readJsonFile(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

export async function writeTextFile(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}

export async function loadLinearConfig(configPath = DEFAULT_CONFIG_PATH) {
  return readJsonFile(configPath);
}

export function resolveFromRoot(...parts) {
  return path.join(ROOT_DIR, ...parts);
}

export function extractLinearKey(value) {
  const match = String(value ?? "").match(LINEAR_KEY_REGEX);
  return match?.[0] ?? null;
}

export function extractLinearKeys(value) {
  const matches = String(value ?? "").match(new RegExp(LINEAR_KEY_REGEX.source, "g")) ?? [];
  return [...new Set(matches)];
}

export async function linearRequest(query, variables = {}, apiKey = getRequiredEnv("LINEAR_API_KEY")) {
  const response = await fetch(LINEAR_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Linear API request failed: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();

  if (payload.errors && payload.errors.length > 0) {
    const message = payload.errors.map((entry) => entry.message).join("; ");
    throw new Error(`Linear API error: ${message}`);
  }

  return payload.data;
}

export async function getTeamStates(teamId = getRequiredEnv("LINEAR_TEAM_ID")) {
  const data = await linearRequest(
    `query TeamStates($teamId: String!) {
      team(id: $teamId) {
        id
        key
        name
        states {
          nodes {
            id
            name
            type
            position
          }
        }
      }
    }`,
    { teamId },
  );

  return data.team?.states?.nodes ?? [];
}

export async function getTeamLabels(teamId = getRequiredEnv("LINEAR_TEAM_ID")) {
  const data = await linearRequest(
    `query TeamLabels($teamId: String!) {
      team(id: $teamId) {
        labels(first: 250) {
          nodes {
            id
            name
            color
          }
        }
      }
    }`,
    { teamId },
  );

  return data.team?.labels?.nodes ?? [];
}

export async function createLabel({ teamId, name, color = "#6b7280" }) {
  const data = await linearRequest(
    `mutation LabelCreate($input: IssueLabelCreateInput!) {
      issueLabelCreate(input: $input) {
        success
        issueLabel {
          id
          name
          color
        }
      }
    }`,
    {
      input: {
        teamId,
        name,
        color,
      },
    },
  );

  if (!data.issueLabelCreate?.success) {
    throw new Error(`Failed to create label: ${name}`);
  }

  return data.issueLabelCreate.issueLabel;
}

export async function ensureLabelIds(labelNames, { teamId = getRequiredEnv("LINEAR_TEAM_ID") } = {}) {
  const deduped = [...new Set((labelNames ?? []).filter((value) => Boolean(value && value.trim())))]
    .map((value) => value.trim());

  if (deduped.length === 0) {
    return [];
  }

  const existing = await getTeamLabels(teamId);
  const byName = new Map(existing.map((label) => [label.name, label]));
  const ids = [];

  for (const name of deduped) {
    const current = byName.get(name);
    if (current) {
      ids.push(current.id);
      continue;
    }

    const created = await createLabel({ teamId, name });
    byName.set(name, created);
    ids.push(created.id);
  }

  return ids;
}

export async function findIssueByIdentifier(identifier) {
  const data = await linearRequest(
    `query IssueByIdentifier($identifier: String!) {
      issue(id: $identifier) {
        id
        identifier
        title
        url
        state {
          id
          name
          type
        }
        labels {
          nodes {
            id
            name
          }
        }
        project {
          id
          name
        }
      }
    }`,
    { identifier },
  );

  return data.issue ?? null;
}

export async function getIssueWithContext(identifier) {
  const data = await linearRequest(
    `query IssueWithContext($identifier: String!) {
      issue(id: $identifier) {
        id
        identifier
        title
        description
        url
        state {
          id
          name
          type
        }
        labels {
          nodes {
            id
            name
          }
        }
        parent {
          id
          identifier
          title
          description
          state {
            id
            name
            type
          }
          labels {
            nodes {
              id
              name
            }
          }
        }
        project {
          id
          name
        }
        comments(first: 100) {
          nodes {
            id
            body
            createdAt
          }
        }
      }
    }`,
    { identifier },
  );

  return data.issue ?? null;
}

export async function searchIssues(
  queryText,
  {
    teamId = getRequiredEnv("LINEAR_TEAM_ID"),
    first = 50,
  } = {},
) {
  const data = await linearRequest(
    `query IssueSearch($teamId: ID!, $query: String!, $first: Int!) {
      issues(
        first: $first,
        filter: {
          team: { id: { eq: $teamId } }
          title: { contains: $query }
        }
      ) {
        nodes {
          id
          identifier
          title
          url
          state {
            id
            name
            type
          }
          labels {
            nodes {
              name
            }
          }
          updatedAt
          createdAt
          startedAt
          completedAt
          cycle {
            id
            name
            number
          }
        }
      }
    }`,
    {
      teamId,
      query: queryText,
      first,
    },
  );

  return data.issues?.nodes ?? [];
}

export async function findIssueByTaskId(taskId) {
  const candidates = await searchIssues(taskId);
  const expectedPrefix = `${taskId} |`;
  const match = candidates.find((issue) => issue.title?.startsWith(expectedPrefix));
  if (match) {
    return match;
  }
  return candidates.find((issue) => issue.identifier === taskId) ?? null;
}

export async function createIssue(input) {
  const data = await linearRequest(
    `mutation CreateIssue($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          id
          identifier
          title
          url
        }
      }
    }`,
    { input },
  );

  if (!data.issueCreate?.success || !data.issueCreate.issue) {
    throw new Error("Linear issueCreate failed");
  }

  return data.issueCreate.issue;
}

export async function updateIssue(issueId, input) {
  const data = await linearRequest(
    `mutation UpdateIssue($issueId: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $issueId, input: $input) {
        success
        issue {
          id
          identifier
          title
          url
          state {
            id
            name
            type
          }
        }
      }
    }`,
    {
      issueId,
      input,
    },
  );

  if (!data.issueUpdate?.success || !data.issueUpdate.issue) {
    throw new Error(`Linear issueUpdate failed for ${issueId}`);
  }

  return data.issueUpdate.issue;
}

export async function createIssueComment(issueId, body) {
  const data = await linearRequest(
    `mutation CreateComment($input: CommentCreateInput!) {
      commentCreate(input: $input) {
        success
        comment {
          id
          body
        }
      }
    }`,
    {
      input: {
        issueId,
        body,
      },
    },
  );

  if (!data.commentCreate?.success || !data.commentCreate.comment) {
    throw new Error(`Linear commentCreate failed for issue ${issueId}`);
  }

  return data.commentCreate.comment;
}

export async function createIssueRelation(issueId, relatedIssueId, type = "related") {
  const data = await linearRequest(
    `mutation CreateIssueRelation($input: IssueRelationCreateInput!) {
      issueRelationCreate(input: $input) {
        success
      }
    }`,
    {
      input: {
        issueId,
        relatedIssueId,
        type,
      },
    },
  );

  return Boolean(data.issueRelationCreate?.success);
}

export async function fetchTeamIssues({
  teamId = getRequiredEnv("LINEAR_TEAM_ID"),
  first = 200,
} = {}) {
  const items = [];
  let hasNextPage = true;
  let cursor = null;

  while (hasNextPage) {
    const data = await linearRequest(
      `query TeamIssuePage($teamId: ID!, $first: Int!, $after: String) {
        issues(
          first: $first,
          after: $after,
          filter: { team: { id: { eq: $teamId } } }
        ) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            identifier
            title
            description
            priority
            url
            createdAt
            updatedAt
            startedAt
            completedAt
            assignee {
              id
              name
            }
            state {
              id
              name
              type
            }
            cycle {
              id
              name
              number
              startsAt
              endsAt
            }
            labels {
              nodes {
                id
                name
              }
            }
          }
        }
      }`,
      {
        teamId,
        first,
        after: cursor,
      },
    );

    const connection = data.issues;
    items.push(...(connection?.nodes ?? []));

    hasNextPage = Boolean(connection?.pageInfo?.hasNextPage);
    cursor = connection?.pageInfo?.endCursor ?? null;
  }

  return items;
}

export async function fetchTeamCycles(teamId = getRequiredEnv("LINEAR_TEAM_ID")) {
  const data = await linearRequest(
    `query TeamCycles($teamId: String!) {
      team(id: $teamId) {
        cycles(first: 50) {
          nodes {
            id
            number
            name
            startsAt
            endsAt
            issues(first: 250) {
              nodes {
                id
                identifier
                title
                url
                state {
                  id
                  name
                  type
                }
                labels {
                  nodes {
                    name
                  }
                }
              }
            }
          }
        }
      }
    }`,
    { teamId },
  );

  return data.team?.cycles?.nodes ?? [];
}

export function taskPrefixFromTitle(title) {
  const match = String(title ?? "").match(/^([A-Z]+-\d+)\s+\|\s+(.+)$/);
  if (!match) {
    return { taskId: null, summary: String(title ?? "") };
  }
  return { taskId: match[1], summary: match[2] };
}

export function formatIsoDate(value = new Date()) {
  return new Date(value).toISOString().slice(0, 10);
}
