# PM-DS-027 Subtitle Scale Parity + Full-Viewport Background Coverage

## Locked Decisions
1. `Step X of 2:` must use the same type scale as step action text.
2. Global SVG background pattern must render full viewport width and height.
3. Keep opacity at 30%.
4. No backend/API/schema changes.

## File-Level Implementation Map
1. `web/src/features/student/student-mode.tsx`
1. Update `Step X of 2:` subtitle segment to the same body-large class as action text.
2. `web/src/index.css`
1. Update `body::before` background layer sizing behavior to full viewport coverage.
2. Keep global overlay model and opacity unchanged.

## Acceptance Checklist
1. `Step 1 of 2:` and `Enter your full name` render with matching type scale.
2. `Step 2 of 2:` and `Choose your class and section` render with matching type scale.
3. Background pattern covers full viewport without visible tiling bands.
4. Existing app behavior remains unchanged.

## QA Notes
1. Run:
1. `npm --prefix web run typecheck`
2. `npm --prefix web run lint`
3. `npm --prefix web run build`
2. Manual checks:
1. student entry step 1 + step 2 subtitle hierarchy
2. full-page background coverage on `/` and `/designsystem`
