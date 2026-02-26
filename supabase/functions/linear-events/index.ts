import "@supabase/functions-js/edge-runtime.d.ts";

import { handleOptions, json } from "../_shared/auth.ts";

type BridgeEventPayload = {
  source?: string;
  eventType?: string;
  issueKey?: string;
  sha?: string;
  environment?: string;
  status?: string;
  url?: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
};

type LinearIssue = {
  id: string;
  identifier: string;
  title: string;
};

const LINEAR_API_URL = "https://api.linear.app/graphql";
const LINEAR_KEY_PATTERN = /\b[A-Z][A-Z0-9]+-\d+\b/;

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function requiredBridgeSecret(): string {
  const preferred = Deno.env.get("LINEAR_BRIDGE_SECRET")?.trim();
  if (preferred && preferred.length > 0) {
    return preferred;
  }

  const legacy = Deno.env.get("SUPABASE_LINEAR_BRIDGE_SECRET")?.trim();
  if (legacy && legacy.length > 0) {
    return legacy;
  }

  throw new Error("Missing required environment variable: LINEAR_BRIDGE_SECRET");
}

function normalize(value: unknown): string {
  return String(value ?? "").trim();
}

function extractLinearKey(input: unknown): string {
  const match = String(input ?? "").match(LINEAR_KEY_PATTERN);
  return match?.[0] ?? "";
}

function parseEventType(payload: BridgeEventPayload): string {
  return normalize(payload.eventType || "event");
}

function parseSource(payload: BridgeEventPayload): string {
  return normalize(payload.source || "manual").toLowerCase();
}

function parseStatus(payload: BridgeEventPayload): string {
  return normalize(payload.status || "unknown").toLowerCase();
}

function parseEnvironment(payload: BridgeEventPayload): string {
  const value = normalize(payload.environment || "preview").toLowerCase();
  if (["dev", "preview", "prod"].includes(value)) return value;
  return "preview";
}

function isIncidentEvent(source: string, eventType: string, status: string): boolean {
  if (source === "supabase") return true;
  if (eventType.includes("incident") || eventType.includes("migration")) return true;
  return status === "failed" || status === "failure";
}

async function linearRequest(
  apiKey: string,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
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
  if (payload.errors?.length) {
    const message = payload.errors.map((entry: { message?: string }) => entry.message ?? "Unknown error").join("; ");
    throw new Error(`Linear API error: ${message}`);
  }

  return payload.data ?? {};
}

async function findIssueByIdentifier(apiKey: string, identifier: string): Promise<LinearIssue | null> {
  const data = await linearRequest(
    apiKey,
    `query IssueByIdentifier($identifier: String!) {
      issue(id: $identifier) {
        id
        identifier
        title
      }
    }`,
    { identifier },
  );

  return (data.issue as LinearIssue | null) ?? null;
}

async function searchIssueByTitlePrefix(
  apiKey: string,
  teamId: string,
  titlePrefix: string,
): Promise<LinearIssue | null> {
  const data = await linearRequest(
    apiKey,
    `query SearchIssues($teamId: ID!, $query: String!) {
      issues(
        first: 50
        filter: {
          team: { id: { eq: $teamId } }
          title: { contains: $query }
        }
      ) {
        nodes {
          id
          identifier
          title
        }
      }
    }`,
    {
      teamId,
      query: titlePrefix,
    },
  );

  const nodes = ((data.issues as { nodes?: LinearIssue[] } | undefined)?.nodes ?? []);
  return nodes.find((issue) => issue.title.startsWith(titlePrefix)) ?? null;
}

async function createIssueComment(apiKey: string, issueId: string, body: string): Promise<void> {
  const data = await linearRequest(
    apiKey,
    `mutation CreateComment($input: CommentCreateInput!) {
      commentCreate(input: $input) {
        success
      }
    }`,
    {
      input: {
        issueId,
        body,
      },
    },
  );

  if (!(data.commentCreate as { success?: boolean } | undefined)?.success) {
    throw new Error("Failed to create Linear comment");
  }
}

async function getTeamLabels(apiKey: string, teamId: string): Promise<Array<{ id: string; name: string }>> {
  const data = await linearRequest(
    apiKey,
    `query TeamLabels($teamId: String!) {
      team(id: $teamId) {
        labels(first: 250) {
          nodes {
            id
            name
          }
        }
      }
    }`,
    { teamId },
  );

  return ((data.team as { labels?: { nodes?: Array<{ id: string; name: string }> } } | undefined)?.labels?.nodes ?? []);
}

async function createLabel(apiKey: string, teamId: string, name: string): Promise<{ id: string; name: string }> {
  const color = name.startsWith("type:incident")
    ? "#ef4444"
    : name.startsWith("type:build-event")
      ? "#3b82f6"
      : name.startsWith("source:")
        ? "#6b7280"
        : "#84cc16";

  const data = await linearRequest(
    apiKey,
    `mutation CreateLabel($input: IssueLabelCreateInput!) {
      issueLabelCreate(input: $input) {
        success
        issueLabel {
          id
          name
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

  const label = (data.issueLabelCreate as { issueLabel?: { id: string; name: string } } | undefined)?.issueLabel;
  if (!label) {
    throw new Error(`Failed to create label ${name}`);
  }

  return label;
}

async function ensureLabelIds(apiKey: string, teamId: string, names: string[]): Promise<string[]> {
  const deduped = [...new Set(names.filter((entry) => entry.trim().length > 0))];
  if (deduped.length === 0) return [];

  const existing = await getTeamLabels(apiKey, teamId);
  const byName = new Map(existing.map((label) => [label.name, label.id]));
  const ids: string[] = [];

  for (const name of deduped) {
    const current = byName.get(name);
    if (current) {
      ids.push(current);
      continue;
    }

    const created = await createLabel(apiKey, teamId, name);
    byName.set(created.name, created.id);
    ids.push(created.id);
  }

  return ids;
}

async function createIssue(
  apiKey: string,
  input: Record<string, unknown>,
): Promise<LinearIssue> {
  const data = await linearRequest(
    apiKey,
    `mutation CreateIssue($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          id
          identifier
          title
        }
      }
    }`,
    { input },
  );

  const issue = (data.issueCreate as { issue?: LinearIssue } | undefined)?.issue;
  if (!issue) {
    throw new Error("Failed to create issue in Linear");
  }

  return issue;
}

function renderEventComment(payload: BridgeEventPayload): string {
  const metadata = payload.metadata ?? {};
  const lines = [
    "## Event Bridge Update",
    "",
    `- source: ${payload.source ?? "manual"}`,
    `- eventType: ${payload.eventType ?? "event"}`,
    `- environment: ${payload.environment ?? "preview"}`,
    `- status: ${payload.status ?? "unknown"}`,
    `- sha: ${payload.sha ?? "-"}`,
    `- url: ${payload.url ?? "-"}`,
    `- timestamp: ${payload.timestamp ?? new Date().toISOString()}`,
  ];

  const metadataEntries = Object.entries(metadata);
  if (metadataEntries.length > 0) {
    lines.push("", "### metadata");
    for (const [key, value] of metadataEntries) {
      lines.push(`- ${key}: ${String(value)}`);
    }
  }

  return lines.join("\n");
}

async function verifyBridgeAuth(req: Request): Promise<void> {
  const providedHeader = req.headers.get("x-bridge-secret")?.trim();
  const authHeader = req.headers.get("authorization")?.trim();
  const providedBearer = authHeader?.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const provided = providedHeader || providedBearer;

  const expectedBridgeSecret = Deno.env.get("LINEAR_BRIDGE_SECRET")?.trim()
    ?? Deno.env.get("SUPABASE_LINEAR_BRIDGE_SECRET")?.trim()
    ?? "";

  if (
    expectedBridgeSecret.length > 0 &&
    provided.length > 0 &&
    provided === expectedBridgeSecret
  ) {
    return;
  }

  throw new Error("Unauthorized bridge request");
}

function buildPayload(rawBody: string, req: Request): BridgeEventPayload {
  const parsed = JSON.parse(rawBody) as Record<string, unknown>;

  const source = normalize(parsed.source)
    || "manual";

  const eventType = normalize(parsed.eventType)
    || normalize(parsed.type)
    || normalize(parsed.event)
    || "event";

  const status = normalize(parsed.status)
    || normalize(parsed.state)
    || normalize((parsed.payload as Record<string, unknown> | undefined)?.status)
    || "unknown";

  const environment = normalize(parsed.environment)
    || normalize(parsed.target)
    || normalize((parsed.payload as Record<string, unknown> | undefined)?.target)
    || "preview";

  const url = normalize(parsed.url)
    || normalize((parsed.payload as Record<string, unknown> | undefined)?.url)
    || normalize((parsed.payload as Record<string, unknown> | undefined)?.alias)
    || "";

  const sha = normalize(parsed.sha)
    || normalize(parsed.commitSha)
    || normalize((parsed.payload as Record<string, unknown> | undefined)?.sha)
    || normalize((parsed.meta as Record<string, unknown> | undefined)?.githubCommitSha)
    || normalize((parsed.git as Record<string, unknown> | undefined)?.sha)
    || "";

  const explicitIssueKey = extractLinearKey(parsed.issueKey)
    || extractLinearKey((parsed.meta as Record<string, unknown> | undefined)?.issueKey)
    || extractLinearKey((parsed.payload as Record<string, unknown> | undefined)?.issueKey);

  const inferredIssueKey = explicitIssueKey || extractLinearKey(rawBody);

  return {
    source: source.toLowerCase(),
    eventType,
    issueKey: inferredIssueKey || undefined,
    sha,
    environment: environment.toLowerCase(),
    status: status.toLowerCase(),
    url,
    timestamp: normalize(parsed.timestamp) || new Date().toISOString(),
    metadata: (parsed.metadata as Record<string, unknown> | undefined)
      ?? (parsed.payload as Record<string, unknown> | undefined)
      ?? {},
  };
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return handleOptions(req);
    }

    if (req.method !== "POST") {
      return json(req, 405, { error: "Method not allowed" });
    }

    const rawBody = await req.text();
    await verifyBridgeAuth(req);

    const body = buildPayload(rawBody, req);
    const source = parseSource(body);
    const eventType = parseEventType(body);
    const status = parseStatus(body);
    const environment = parseEnvironment(body);

    const payload: BridgeEventPayload = {
      ...body,
      source,
      eventType,
      status,
      environment,
      timestamp: normalize(body.timestamp) || new Date().toISOString(),
    };

    const apiKey = requiredEnv("LINEAR_API_KEY");
    const teamId = requiredEnv("LINEAR_TEAM_ID");
    const projectId = requiredEnv("LINEAR_PROJECT_ID");

    const issueKey = normalize(payload.issueKey);
    let issue: LinearIssue | null = null;

    if (issueKey) {
      issue = await findIssueByIdentifier(apiKey, issueKey);
    }

    if (!issue) {
      const incident = isIncidentEvent(source, eventType, status);
      const issueTypeLabel = incident ? "type:incident" : "type:build-event";
      const areaLabel = source === "supabase" ? "area:backend" : "area:infra";

      const labelIds = await ensureLabelIds(apiKey, teamId, [
        issueTypeLabel,
        `source:${source}`,
        `env:${environment}`,
        areaLabel,
      ]);

      const titleBase = incident ? "INCIDENT" : "BUILD";
      const titlePrefix = `${titleBase} | ${environment} | ${eventType}`;

      issue = incident
        ? await searchIssueByTitlePrefix(apiKey, teamId, titlePrefix)
        : null;

      if (!issue) {
        issue = await createIssue(apiKey, {
          teamId,
          projectId,
          title: `${titlePrefix} | ${status}`,
          description: renderEventComment(payload),
          labelIds,
        });
      }
    }

    await createIssueComment(apiKey, issue.id, renderEventComment(payload));

    return json(req, 200, {
      ok: true,
      issueIdentifier: issue.identifier,
      issueId: issue.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return json(req, 400, { error: message });
  }
});
