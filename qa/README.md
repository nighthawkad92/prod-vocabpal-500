# QA Suites

Run live QA against the deployed app and Supabase functions.

## Required Environment

1. `APP_URL` (for example `https://vocabpal.xyz`)
2. `SUPABASE_URL` (for example `https://efbmcxadmdarzlfxjjsd.supabase.co`)
3. `SUPABASE_ANON_KEY` (publishable/anon key)
4. `TEACHER_PASSCODE` (current teacher passcode)

Optional:

1. `TEACHER_NAME` (defaults to suite-specific QA name)
2. `QA_DEPLOY_WAIT_MS` (default `480000` in after-deploy runner)
3. `QA_DEPLOY_POLL_MS` (default `20000` in after-deploy runner)
4. `QA_LOAD_*` overrides for weekly load profile thresholds/concurrency
5. `QA_LOAD_GATE_MODE` (`advisory` default, `hard` optional)
6. `QA_SOURCE_TOKEN` (required to mark automated attempts as `qa` source)
7. `QA_CLEANUP_MODE` (`strict` default: archive only `attempt_source=qa`; `hybrid`: include legacy prefix heuristics)
8. `QA_CLEANUP_PREFIXES` (used only in `hybrid` mode for legacy QA residue cleanup)

## Suites

1. Remote smoke (API/data checks + route health):
```bash
npm run qa:remote
```

2. UI + network + device matrix (3 devices x 3 network profiles):
```bash
npm run qa:matrix
```
Includes explicit checks for:
1. Student audio-before-submit gate.
2. Sound toggle persistence (`localStorage` + UI state).
3. Reduced-motion policy behavior (`prefers-reduced-motion`).
4. `/designsystem` route render health.

3. Data integrity audit (attempt/class/archive/reopen/timing invariants):
```bash
npm run qa:data
```

4. Archive contract canary (canonical vs legacy parity + archive/restore payload contract probe):
```bash
npm run qa:archive-canary
```

5. After-deploy orchestrator (waits for deployment, then runs smoke + matrix + data audit + archive canary):
```bash
npm run qa:after-deploy
```

6. Cleanup QA attempts (strict default archives only tagged `qa` attempts):
```bash
npm run qa:cleanup
```

7. Hard release gate (code gates + remote/matrix/data/archive-canary + after-deploy, writes aggregated decision report):
```bash
npm run qa:release-gate
```
This report (`latest_release_gate.json`) is consumed by `npm run linear:gate-hard -- --mode prod`.

8. Weekly 500-student phased load profile:
```bash
npm run qa:load-500
```

## Output

Reports are written to `qa/reports/`:

1. `latest_remote_smoke.json` + timestamped smoke reports
2. `latest_matrix_ui_network.json` + timestamped matrix reports
3. `latest_data_integrity_audit.json` + timestamped data audit reports
4. `latest_archive_contract_canary.json` + timestamped archive-canary reports
5. `latest_after_deploy.json` + timestamped after-deploy reports
6. `latest_release_gate.json` + timestamped release-gate reports
7. `latest_load_profile_500.json` + timestamped load-profile reports
8. `latest_cleanup_qa_attempts.json` + timestamped cleanup reports
9. Failure screenshots in `qa/reports/screenshots/`

## CI Secrets

For GitHub workflows, configure repository secrets:

1. `APP_URL`
2. `SUPABASE_URL`
3. `SUPABASE_ANON_KEY`
4. `TEACHER_PASSCODE`
5. `TEACHER_NAME` (optional)
6. `QA_SOURCE_TOKEN` (optional but strongly recommended for clean QA isolation)
