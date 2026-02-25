# PM-DS-031 Utility Row Container Removal + 16px Spacing

## Locked Decisions
1. Remove outer white containers around both Sound and Student/Teacher controls.
2. Keep horizontal spacing between Sound and Student/Teacher controls at `16px`.
3. Preserve existing control behavior (sound toggle + mode switching).
4. No backend/API/schema impact.

## File-Level Implementation Map
1. `web/src/components/app-shell.tsx`
1. Remove `utilityCardClass` wrapper usage around both controls.
2. Keep Sound internals unchanged.
3. Keep mode tabs internals unchanged.
4. Set parent utility controls gap to `gap-4` (16px).

## Acceptance Checklist
1. No outer white shell around Sound block.
2. No outer white shell around Student/Teacher block.
3. Horizontal spacing between controls is 16px.
4. Sound and mode controls remain functional.

## QA Notes
1. Run:
1. `npm --prefix web run typecheck`
2. `npm --prefix web run lint`
3. `npm --prefix web run build`
