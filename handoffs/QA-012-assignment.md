# Handoff: QA-012 Assignment Brief (Fresh-Lime Verification)

## 1. Metadata
1. Task ID: QA-012
2. Title: Verify fresh-lime rollout, typography invariance, and visual regression gates
3. Owner Agent: QA
4. Handoff Date: 2026-02-25
5. Proposed Next State: `READY`

## 2. Scope
1. Goal:
1. Validate that fresh-lime non-typography migration is correct and safe.
2. In Scope:
1. Visual regression checks for `/` and `/designsystem`.
2. Typography invariance checks.
3. Core build gates and functional smoke.
3. Out of Scope:
1. Functional feature expansion.
2. Backend/data contract testing unrelated to UI changes.

## 3. Inputs
1. Required docs:
1. `handoffs/UI-017.md`
2. `handoffs/PM-DS-007-kickoff.md`
2. Required files:
1. UI files changed by `UI-017`.
2. Required checkpoints (if any):
1. none.

## 4. Verification Plan
1. Confirm typography declarations unchanged from baseline (font families/type scale).
2. Run static quality gates.
3. Validate `/` and `/designsystem` render correctly at tablet portrait/landscape widths.
4. Confirm no visual breakage in student and teacher primary surfaces.

## 5. Outputs
1. Files/artifacts to produce:
1. `handoffs/QA-012.md` with pass/fail evidence.
2. screenshots for visual comparison.
2. Tests to run:
1. `npm --prefix web run typecheck`
2. `npm --prefix web run lint`
3. `npm --prefix web run build`
4. `npm run qa:remote` (smoke confirmation)
3. Handoff evidence required:
1. explicit typography invariance result.
2. list of changed files verified.

## 6. Acceptance Criteria
1. No typography drift detected.
2. `/` and `/designsystem` are visually coherent and responsive.
3. Required quality gates pass.

## 7. Requested PM Action
1. Move `QA-012` to `READY` after `UI-017` reaches `DONE`.
2. Require `handoffs/QA-012.md` before PM signoff task starts.
