# Handoff: UI-017 Assignment Brief (Fresh-Lime Non-Typography)

## 1. Metadata
1. Task ID: UI-017
2. Title: Apply fresh-lime non-typography token mapping across app + design system
3. Owner Agent: UI
4. Handoff Date: 2026-02-25
5. Proposed Next State: `RUNNING`

## 2. Scope
1. Goal:
1. Apply fresh-lime theme appearance while preserving all typography settings.
2. In Scope:
1. CSS token mapping in `web/src/index.css`.
2. Shared primitive updates to consume tokenized radius/shadow/border/ring values.
3. Background recolor preserving existing layered structure.
4. `/` and `/designsystem` visual parity.
3. Out of Scope:
1. Font family changes.
2. Font size/weight scale changes.
3. Backend/API/schema/auth updates.

## 3. Inputs
1. Required docs:
1. `handoffs/PM-DS-007-kickoff.md`
2. `state_machine_rules.md`
2. Required files:
1. `web/src/index.css`
2. `web/src/lib/design-system.ts`
3. `web/src/components/ui/card.tsx`
4. `web/src/components/ui/button-variants.ts`
5. `web/src/components/ui/input.tsx`
6. `web/src/components/ui/tabs.tsx`
3. Required checkpoints (if any):
1. none.

## 4. Implementation Plan
1. Install theme source and copy only non-typography tokens.
2. Map theme tokens into existing variable contract without breaking current selectors.
3. Replace hardcoded radius/shadow/border literals in shared primitives with variable-backed values.
4. Recolor background anchors while preserving current gradient/pattern structure.
5. Verify both `/` and `/designsystem` for consistency.

## 5. Outputs
1. Files/artifacts to produce:
1. Updated UI styling files.
2. `handoffs/UI-017.md` with evidence.
2. Tests to add or run:
1. `npm --prefix web run typecheck`
2. `npm --prefix web run lint`
3. `npm --prefix web run build`
3. Handoff evidence required:
1. before/after screenshots for `/` and `/designsystem`.
2. explicit confirmation that typography tokens/classes are unchanged.

## 6. Acceptance Criteria
1. Fresh-lime non-typography look applies across core screens and `/designsystem`.
2. Existing typography remains unchanged in family, weight classes, and sizing scale.
3. Build/lint/typecheck pass with no functional regression to student/teacher flows.

## 7. Risks and Mitigations
1. Risk: accidental font import/token override.
2. Mitigation: explicitly diff typography declarations and block merge if changed.

## 8. Requested PM Action
1. Move `UI-017` from `READY` to `RUNNING` when execution begins.
2. On completion, require `handoffs/UI-017.md` before moving to `REVIEW`.
