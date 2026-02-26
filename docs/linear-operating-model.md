# Linear Operating Model (VocabPal)

## Objective
Linear is the operational source of truth for workflow state, release gates, request lineage, QA evidence, incidents, and changelog history.

## Source of Truth Rules
1. All active work must exist as Linear issues.
2. All workflow state transitions happen in Linear only.
3. PM is the only role allowed to transition issue workflow states.
4. Markdown board files (`agent_board.md`, `state_machine_rules.md`, `checkpoint_playbook.md`) are archived context only and must not drive workflow state.
5. Every release must be represented by a `type:release` issue in Linear.

## Gate Model

### Soft Gate (Advisory)
1. Trigger: feature branch pushes and preview-oriented PR checks.
2. Behavior: non-blocking.
3. Action on failure: add `gate:soft-fail` and post advisory comment to issue.

### Hard Gate (Main)
1. Trigger: PRs targeting `main`.
2. Behavior: blocking.
3. Requirements:
   - Valid Linear key conventions for branch/PR/commits.
   - Linked issue in `REVIEW`.
   - `gate:hard` and `gate:hard-approved` labels present.
   - Lineage and handoff evidence present.

### Hard Gate (Prod Acceptance)
1. Trigger: production release acceptance workflow after deploy.
2. Behavior: blocking for release acceptance.
3. Requirements:
   - Dedicated `type:release` issue.
   - Included work items are `DONE`.
   - QA release gate report passed with load mode `hard`.
   - Release checklist includes PM and QA approvals.

## Canonical Workflow States
- `TODO`
- `READY`
- `RUNNING`
- `BLOCKED`
- `REVIEW`
- `DONE`

Excluded terminal states:
- `CANCELED`
- `DUPLICATE`

Allowed transitions are enforced by `ops/linear/transition_guard.mjs` + `ops/linear/config.json`.

## Label Taxonomy Highlights
1. Type labels include `type:release`.
2. Gate labels include:
   - `gate:soft`
   - `gate:soft-fail`
   - `gate:hard`
   - `gate:hard-approved`
   - `gate:hard-fail`
   - `gate:override`

## Required Integrations
1. GitHub -> Linear:
   - Branch format `vpb/<LINEAR_KEY>-slug`
   - PR title includes `<LINEAR_KEY>`
   - Commit messages include `<LINEAR_KEY>`
   - enforced by `.github/workflows/linear-issue-key-convention.yml`
2. Supabase -> Linear:
   - High-signal events only (migration/runtime failures, incidents)
   - bridge endpoint: `supabase/functions/linear-events`

## Vercel Constraint
Vercel webhook ingestion is not used (free-plan limitation). Deployment context is captured via GitHub workflow events/comments into Linear.

## Repo Tooling
1. `npm run linear:setup-schema` -> aligns Linear states + labels
2. `npm run linear:verify` -> branch/PR/commit key convention checks
3. `npm run linear:enforce-linear-only` -> blocks forbidden markdown workflow control edits
4. `npm run linear:transition` -> PM-only guarded transition updates
5. `npm run linear:gate-soft` -> advisory soft gate comments/labels
6. `npm run linear:gate-hard` -> blocking hard gate validation
7. `npm run linear:release-upsert` -> create/update release issue for a prod acceptance run
8. `npm run linear:validate-lineage` -> validates `Request -> Story -> Task/Bug -> Evidence`
9. `npm run linear:post-handoff` -> posts structured handoff evidence directly to Linear
10. `npm run linear:changelog` -> cycle changelog generation
11. `npm run linear:insights` -> weekly insight generation
12. `npm run linear:validate-skills` -> detects stale file-based workflow references in skill docs
13. `npm run linear:migration:import-board` -> migration-only import from legacy board
14. `npm run linear:migration:export-mirror` -> migration-only snapshot mirror

## Handoff Contract (Linear-Native)
`linear:post-handoff` payload:
- `taskId`
- `role`
- `summary`
- `testsRun`
- `risks`
- `evidenceUrls`
- `requestedPmAction`
- `handoffPath` (optional archival pointer)

## Release Checklist Contract
Release issue description must include:
1. `Included Issues:`
2. `QA Report:`
3. `PM Approval: APPROVED`
4. `QA Approval: APPROVED`

If `gate:override` is present, it must also include:
1. `Override approved by PM:`
2. `Override approved by QA:`
3. `Follow-up Issue:`

## Migration Status
1. Legacy markdown board/state files are deprecated for control flow.
2. Historical handoff markdown files are retained as archives only.
3. New workflow state and release decisions must be recorded in Linear.

## Operational Runbook
See [linear-gates-runbook.md](linear-gates-runbook.md) for required GitHub checks and release commands.
