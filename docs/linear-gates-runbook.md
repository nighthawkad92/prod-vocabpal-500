# Linear Gates Runbook

## Required GitHub Checks for `main`
Configure branch protection to require:
1. `verify-linear-key`
2. `linear-hard-gate-pr`

## Workflow Files
1. `.github/workflows/linear-issue-key-convention.yml`
2. `.github/workflows/linear-soft-gate.yml`
3. `.github/workflows/linear-hard-gate-pr.yml`
4. `.github/workflows/qa-after-deploy.yml`

## Manual PM Flow
1. Apply `gate:hard` when item enters merge/release path.
2. Ensure lineage markers and evidence comments exist.
3. Apply `gate:hard-approved` only after checks pass.
4. For release acceptance, review `type:release` issue checklist and QA report.

## Release Acceptance Commands
```bash
npm run linear:release-upsert -- --issue VPB-123 --sha <sha> --environment prod
npm run linear:gate-hard -- --mode prod --issue <RELEASE_KEY> --qa-report qa/reports/latest_release_gate.json
```

## Override Flow
1. Add `gate:override` on release issue.
2. Fill override markers in release description:
   - `Override approved by PM:`
   - `Override approved by QA:`
   - `Follow-up Issue:`
3. Link follow-up incident/bug issue.
