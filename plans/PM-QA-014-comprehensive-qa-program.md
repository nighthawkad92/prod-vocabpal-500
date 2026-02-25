# Comprehensive QA Program Plan (UX/UI/Data/Code)

## Summary
This plan establishes a **hard release gate QA program** using your existing workflow system and skills.
Locked decisions from this planning turn:
1. QA mode: **Hard Gate** for every push to `main`.
2. Load strategy: **Phased Load** (daily smoke+matrix, scheduled weekly 500-concurrency load windows).

This plan is aligned to:
1. `/Users/akashdatta/Desktop/prod-vocabpal-baseline-500/agent_board.md`
2. `/Users/akashdatta/Desktop/prod-vocabpal-baseline-500/state_machine_rules.md`
3. `/Users/akashdatta/Desktop/prod-vocabpal-baseline-500/templates/task_template.md`
4. `/Users/akashdatta/Desktop/prod-vocabpal-baseline-500/templates/handoff_template.md`
5. Existing QA harness:
`/Users/akashdatta/Desktop/prod-vocabpal-baseline-500/qa/remote_smoke.mjs`, `/Users/akashdatta/Desktop/prod-vocabpal-baseline-500/qa/matrix_ui_network.mjs`, `/Users/akashdatta/Desktop/prod-vocabpal-baseline-500/qa/run_after_deploy.mjs`

## Skills Routing (Existing Skills, Explicit)
1. `pm-scheduler` intent: task sequencing, board-state governance, dependency ordering.
2. `qa-engineer` intent: risk-based test design, quality gates, release readiness.
3. `ux-research` intent: UX acceptance heuristics and classroom usability checks.
4. `ui-context-design-planner` intent: visual/state consistency QA against current DS patterns.
5. `backend-developer` intent: data/API invariants and failure-mode validation support.

## Baseline Snapshot (Current Truth)
1. Last full automated after-deploy QA report is present and passed at `2026-02-25T02:15:04.854Z` in `/Users/akashdatta/Desktop/prod-vocabpal-baseline-500/qa/reports/latest_after_deploy.json`.
2. Multiple commits landed after that point, so the report is stale for current `main`.
3. Existing board already has open pilot-readiness items (`QA-004`, `REL-002`) and a strong history of UI-focused checks, but no continuously enforced cross-domain hard-gate blueprint.

## QA Scope (End-to-End Domains)
1. Code Quality:
   Type safety, lint, build integrity, dependency sanity, and deterministic CI execution.
2. UI Fidelity:
   Visual consistency, responsive behavior, interaction states, no-jump layout behavior, and design-system conformance.
3. UX Quality:
   Student/teacher journey clarity, error messaging quality, step continuity, and classroom usability under tablet/network constraints.
4. Data Integrity:
   Attempt lifecycle correctness, class/section separation, duplicate-name disambiguation, archive/reopen effects, timing accuracy per question.
5. API/Backend:
   Auth/session correctness, window state transitions, archive semantics, idempotency, and payload contract reliability.
6. Non-Functional:
   Network resilience, device matrix, performance under constrained conditions, and phased 500-student load readiness.

## Board Task Additions (Decision-Complete)
Add these tasks to `/Users/akashdatta/Desktop/prod-vocabpal-baseline-500/agent_board.md`:

1. `PM-QA-014` Define comprehensive hard-gate QA execution path
Owner: PM
Depends on: `PM-002`
Initial state: `READY`

2. `QA-046` Expand automated gate coverage across UI/UX/data/code paths
Owner: QA
Depends on: `PM-QA-014`
Initial state: `TODO`

3. `QA-047` Add UX stability and visual consistency checks (no layout jump, sticky behavior, state continuity)
Owner: QA
Depends on: `QA-046`
Initial state: `TODO`

4. `QA-048` Add data-integrity audit pack for attempts/classes/archive/reopen/time-per-question invariants
Owner: QA
Depends on: `QA-046`
Initial state: `TODO`

5. `QA-049` Integrate hard release gate policy into CI and local release checklist
Owner: QA
Depends on: `QA-046`, `QA-047`, `QA-048`
Initial state: `TODO`

6. `QA-050` Implement phased 500-student load validation track with thresholds and weekly cadence
Owner: QA
Depends on: `QA-049`
Initial state: `TODO`

7. `PM-QA-015` Final QA signoff and pilot readiness recommendation
Owner: PM
Depends on: `QA-050`
Initial state: `TODO`

## Required State Transitions
1. `PM-QA-014 READY -> RUNNING -> REVIEW -> DONE`
2. `QA-046 TODO -> READY -> RUNNING -> REVIEW -> DONE`
3. `QA-047 TODO -> READY -> RUNNING -> REVIEW -> DONE`
4. `QA-048 TODO -> READY -> RUNNING -> REVIEW -> DONE`
5. `QA-049 TODO -> READY -> RUNNING -> REVIEW -> DONE`
6. `QA-050 TODO -> READY -> RUNNING -> REVIEW -> DONE`
7. `PM-QA-015 TODO -> READY -> RUNNING -> REVIEW -> DONE`

Every `RUNNING -> REVIEW` transition must include a new handoff in `/Users/akashdatta/Desktop/prod-vocabpal-baseline-500/handoffs` using `/Users/akashdatta/Desktop/prod-vocabpal-baseline-500/templates/handoff_template.md`.

## Execution Design (What gets built into QA process)

### Workstream A: Hard Gate Definition (Code + Deploy)
1. Gate entry condition:
   Every push to `main` triggers full QA.
2. Gate command chain:
   `npm --prefix web run typecheck`
   `npm --prefix web run lint`
   `npm --prefix web run build`
   `npm run qa:remote`
   `npm run qa:matrix`
   `npm run qa:after-deploy`
3. Gate failure policy:
   Any failed stage marks release `NO-GO` until fixed or PM exception logged in handoff.
4. Canonical target:
   Production custom domain as primary (`https://vocabpal.xyz`) and Vercel app URL as fallback target in QA env config.

### Workstream B: UI + UX Risk Matrix
1. Core flows to verify:
   Student onboarding (2-step), question progression, audio-gated submit, completion state, teacher login, teacher attempts list, detail sticky panel, archive actions.
2. UX stability checks:
   No vertical resize/jump for state changes in active screens.
3. Visual consistency checks:
   Token alignment, control states, toast behavior, drawer behavior, and responsive breakpoints (tablet portrait/landscape + desktop).
4. Interaction recovery:
   Network slow/spotty handling, retries, and non-blocking error messaging.

### Workstream C: Data Integrity and Backend Invariants
1. Identity invariants:
   Same first/last name across different class/section must remain disambiguated.
2. Class isolation:
   Filters and aggregates must not bleed across classes.
3. Attempt lifecycle:
   Start -> responses -> completion -> archive -> reopen must remain consistent.
4. Timing correctness:
   `responseTimeMs`, per-question time rollups, total response time, displayed formatting must match persisted values.
5. Aggregates:
   Counts/averages/class cards/dashboard summary must refresh accurately after archive actions.

### Workstream D: Security + Contract Reliability
1. Teacher auth contract:
   Login/logout/dashboard JWT flow, expiry handling, and invalid token response behavior.
2. Window/session controls:
   Paused/In Progress state transitions are idempotent and reflected in UI.
3. Archive endpoint behavior:
   One/many IDs, confirmation semantics, and downstream reopen effect.
4. CORS/domain checks:
   Both production domain and Vercel domain allowed where required.

### Workstream E: Phased Load Program (500-student readiness)
1. Daily:
   Run smoke + matrix only (fast confidence cycle).
2. Weekly:
   Controlled 500-concurrency load window.
3. Load scenario:
   Burst student-start, Q1 submit, dashboard read pressure, archive/read operations.
4. Thresholds:
   Error rate `<1%`, p95 for critical endpoints within agreed budget, no data integrity violations.
5. Weekly output:
   Versioned load report and pass/fail recommendation.

### Workstream F: Reporting and Governance
1. Persist latest reports:
   `latest_remote_smoke.json`, `latest_matrix_ui_network.json`, `latest_after_deploy.json`.
2. Add release QA summary artifact:
   `qa/reports/latest_release_gate.json` (aggregated pass/fail per domain).
3. PM weekly review:
   Risk trend, flaky test list, top regressions, and open blocker tasks.

## Important Changes/Additions to Public APIs / Interfaces / Types
1. Runtime product APIs:
   No mandatory backend schema/API contract changes required for this QA plan.
2. QA artifacts/interfaces:
   Add a standardized release-gate JSON schema in reports:
   `runAt`, `targetUrl`, `codeGate`, `uiUxGate`, `dataGate`, `apiGate`, `loadGate`, `overallStatus`, `blockers`.
3. UI automation contracts:
   Keep/extend stable `data-testid` selectors for critical teacher and student controls to avoid flaky UI checks.
4. CI interface:
   Hard-gate pipeline must surface explicit stage failures and link to the corresponding report artifact path.

## Test Cases and Scenarios (Acceptance Gate)

### Code
1. Typecheck/lint/build pass on current `main`.
2. No repo-dirty side effects from QA scripts.

### UI/UX
1. Student flow:
   Entry stepper, class/section selection, question controls, submit states, completion state.
2. Teacher flow:
   Login, status toggle loading skeleton, refresh loading skeleton, class-card filter behavior, sticky detail.
3. Layout stability:
   No state-change-induced vertical jump in question and dashboard critical zones.
4. Responsive:
   Desktop + tablet portrait + tablet landscape across network profiles.

### Data/API
1. Student identity save correctness by class/section.
2. Class filter and dashboard class cards consistency.
3. Archive single/multi behavior with correct reopen effect.
4. Timing fields stored/displayed correctly and totals consistent.
5. Teacher summary/list/detail values consistent before/after archive.

### Non-Functional
1. 3x3 device/network matrix pass.
2. Weekly 500-load run pass thresholds.
3. No critical regressions in custom domain production checks.

## Go/No-Go Criteria
1. GO:
   All hard-gate stages green, zero open P0/P1 defects, no unresolved data-integrity violation.
2. NO-GO:
   Any failed hard-gate stage, any data invariant break, any unresolved auth/session regression, or load error-rate threshold breach.
3. Conditional GO (exception):
   PM-approved exception documented in handoff with mitigation and rollback condition.

## Assumptions and Defaults
1. Existing board/state-machine workflow remains source of truth over `artifacts/workflow/*`.
2. Existing credentials/checkpoints are already cleared; no new credential checkpoint is required for planning.
3. Production validation targets `vocabpal.xyz` first; Vercel URL remains fallback for diagnostic reruns.
4. Load tests use synthetic QA identities and controlled cleanup; no destructive operations on real pilot records.
5. This plan is QA-governance and verification focused, not a feature-delivery plan.
