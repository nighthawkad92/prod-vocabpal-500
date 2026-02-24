# QA Remote Smoke

Run the live QA smoke suite against deployed Supabase Edge Functions.

## Required environment

1. `SUPABASE_URL` (for example `https://efbmcxadmdarzlfxjjsd.supabase.co`)
2. `SUPABASE_ANON_KEY` (publishable/anon key)
3. `TEACHER_PASSCODE` (current teacher passcode)

Optional:

1. `TEACHER_NAME` (defaults to `QA Agent`)

## Run

```bash
npm run qa:remote
```

## Output

Reports are written to:

1. `qa/reports/latest_remote_smoke.json`
2. `qa/reports/remote_smoke_<timestamp>.json`
