# Linear Label Taxonomy

## Type Labels
- `type:request`: intake item from user/stakeholder
- `type:story`: scoped product story aligned to request
- `type:task`: implementation task
- `type:bug`: defect/remediation unit
- `type:decision`: explicit product/architecture decision
- `type:insight`: weekly/cycle synthesis and metrics reports
- `type:build-event`: CI/deploy/build lifecycle records
- `type:incident`: production/preview quality incidents
- `type:release`: production release acceptance record

## Role Labels
- `role:pm`
- `role:backend`
- `role:ui`
- `role:qa`
- `role:ux-research`
- `role:market-research`

## Area Labels
Use area labels to group changelogs and ownership slices.
- `area:frontend`
- `area:backend`
- `area:data`
- `area:infra`
- `area:qa`
- `area:ux`
- `area:research`

## Environment Labels
- `env:dev`
- `env:preview`
- `env:prod`

## Source Labels
- `source:manual`
- `source:github`
- `source:supabase`

## Priority Labels
- `priority:p0`
- `priority:p1`
- `priority:p2`
- `priority:p3`

## Gate Labels
- `gate:soft`
- `gate:soft-fail`
- `gate:hard`
- `gate:hard-approved`
- `gate:hard-fail`
- `gate:override`

## Labeling Rules
1. Every issue must have exactly one `type:*` label.
2. Every issue must have at least one owner role label for delivery items.
3. Build/deploy/incident/release issues must carry `source:*` and `env:*` labels.
4. Hard-gated work must include `gate:hard`; PM marks readiness with `gate:hard-approved`.
5. Override usage requires `gate:override` and linked follow-up incident/bug issue.
