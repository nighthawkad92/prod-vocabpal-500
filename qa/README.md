# QA Suites

Run live QA against the deployed app and Supabase functions.

## Required environment

1. `APP_URL` (for example `https://prod-vocabpal-500.vercel.app`)
2. `SUPABASE_URL` (for example `https://efbmcxadmdarzlfxjjsd.supabase.co`)
3. `SUPABASE_ANON_KEY` (publishable/anon key)
4. `TEACHER_PASSCODE` (current teacher passcode)

Optional:

1. `TEACHER_NAME` (defaults to `QA Agent` or `QA Matrix Agent` depending on suite)
2. `QA_DEPLOY_WAIT_MS` (default `480000` in after-deploy runner)
3. `QA_DEPLOY_POLL_MS` (default `20000` in after-deploy runner)

## Suites

1. Remote smoke (API/data checks only):
```bash
npm run qa:remote
```

2. UI + network + device matrix (3 devices x 3 network profiles):
```bash
npm run qa:matrix
```

3. After-deploy orchestrator (waits for deployment, then runs smoke + matrix):
```bash
npm run qa:after-deploy
```

## Output

Reports are written to `qa/reports/`:

1. `latest_remote_smoke.json` and timestamped smoke reports
2. `latest_matrix_ui_network.json` and timestamped matrix reports
3. `latest_after_deploy.json` and timestamped after-deploy reports
4. Failure screenshots in `qa/reports/screenshots/`

## Optional CI setup

To run `qa:after-deploy` in GitHub Actions, configure repository secrets:

1. `APP_URL`
2. `SUPABASE_URL`
3. `SUPABASE_ANON_KEY`
4. `TEACHER_PASSCODE`
5. `TEACHER_NAME` (optional)
