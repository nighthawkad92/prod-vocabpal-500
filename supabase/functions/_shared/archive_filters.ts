export type ArchiveFilter = "active" | "archives" | "all";
export type LegacyArchiveFilter = "exclude" | "only" | "include";

const LEGACY_TO_CANONICAL: Record<LegacyArchiveFilter, ArchiveFilter> = {
  exclude: "active",
  only: "archives",
  include: "all",
};

export function mapCanonicalToLegacy(filter: ArchiveFilter): LegacyArchiveFilter {
  if (filter === "active") return "exclude";
  if (filter === "archives") return "only";
  return "include";
}

function parseCanonicalArchiveFilter(value: string): ArchiveFilter | null {
  if (value === "active" || value === "archives" || value === "all") {
    return value;
  }
  return null;
}

function parseLegacyArchiveFilter(value: string): LegacyArchiveFilter | null {
  if (value === "exclude" || value === "only" || value === "include") {
    return value;
  }
  return null;
}

export function resolveArchiveFilter(
  canonicalRaw: string | null,
  legacyRaw: string | null,
): { filter: ArchiveFilter | null; error?: string } {
  const canonicalInput = (canonicalRaw ?? "").trim().toLowerCase();
  const legacyInput = (legacyRaw ?? "").trim().toLowerCase();

  const canonical = canonicalInput ? parseCanonicalArchiveFilter(canonicalInput) : null;
  const legacy = legacyInput ? parseLegacyArchiveFilter(legacyInput) : null;

  if (canonicalInput && !canonical) {
    return { filter: null, error: "archive must be one of: active, archives, all" };
  }

  if (legacyInput && !legacy) {
    return { filter: null, error: "archived must be one of: exclude, only, include" };
  }

  if (canonical && legacy) {
    const mappedLegacy = LEGACY_TO_CANONICAL[legacy];
    if (mappedLegacy !== canonical) {
      return {
        filter: null,
        error: `archive (${canonical}) conflicts with archived (${legacy})`,
      };
    }
    return { filter: canonical };
  }

  if (canonical) {
    return { filter: canonical };
  }

  if (legacy) {
    return { filter: LEGACY_TO_CANONICAL[legacy] };
  }

  return { filter: "active" };
}

type ArchiveFilterQuery = {
  is: (column: string, value: null) => ArchiveFilterQuery;
  not: (column: string, operator: string, value: null) => ArchiveFilterQuery;
};

export function applyArchiveFilter<T extends ArchiveFilterQuery>(query: T, archiveFilter: ArchiveFilter): T {
  const q = query as ArchiveFilterQuery;
  if (archiveFilter === "active") {
    return q.is("archived_at", null) as T;
  }
  if (archiveFilter === "archives") {
    return q.not("archived_at", "is", null) as T;
  }
  return query;
}
