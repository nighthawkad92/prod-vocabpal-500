# PM-DS-033 Utility Row Horizontal Gap to 24px

## Locked Decisions
1. Increase horizontal gap between Sound control and Student/Teacher toggle to `24px`.
2. Keep wrap-safe vertical spacing controlled independently.
3. No behavior/backend/API changes.

## File-Level Implementation Map
1. `web/src/components/app-shell.tsx`
1. Update utility-row controls container from `gap-4` to `gap-x-6` and add `gap-y-2`.

## Acceptance Checklist
1. Horizontal gap between controls is 24px.
2. Wrapped rows retain reasonable vertical spacing.
3. Control interactions unchanged.

## QA Notes
1. Run:
1. `npm --prefix web run typecheck`
2. `npm --prefix web run lint`
3. `npm --prefix web run build`
