# PM-DS-019 Design System Type Scale Details

## Locked Decisions
1. Add explicit type scale details to `/designsystem` within `Foundations -> Typography`.
2. Keep the existing font families unchanged (`Fraunces` and `Plus Jakarta Sans`).
3. Show role-level type examples with technical specs (size/line-height/weight) and sample text.
4. Reuse existing design-system visual language (cards, borders, tokens) without adding new dependencies.
5. No backend/API/schema change.

## File-Level Implementation Map
1. `web/src/features/design-system/foundations-section.tsx`
1. Add structured `TYPE_SCALE` dataset for typography roles.
2. Add `Type Scale` panel under existing typography card.
3. Render each role with:
1. role label
2. typographic spec string
3. live styled sample text

## Acceptance Checklist
1. `/designsystem` includes a visible `Type Scale` details block.
2. Each type role includes label, spec, and rendered sample.
3. Typography section still includes existing font-pair overview blocks.
4. No layout breakages in adjacent foundations sections.

## QA Notes
1. Run:
1. `npm --prefix web run typecheck`
2. `npm --prefix web run lint`
3. `npm --prefix web run build`
2. Manual check:
1. open `/designsystem`
2. verify `Foundations -> Typography -> Type Scale`
