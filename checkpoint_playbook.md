# Checkpoint Playbook (Explicit User Intervention)

This playbook defines all mandatory user checkpoints for the autonomous single-chat workflow.

## Current Status (2026-02-24)
1. `CP-01-SUPABASE-LINK`: Cleared.
2. `CP-02-SUPABASE-PUSH`: Cleared.
3. `CP-03-GCP-TTS`: Cleared.
4. `CP-04-GITHUB-PUSH`: Pending.
5. `CP-05-VERCEL-LINK`: Pending.
6. `CP-06-VERCEL-ENV`: Pending.
7. `CP-07-CI-SECRETS`: Pending.

## CP-01-SUPABASE-LINK
1. Trigger: before first remote Supabase operation.
2. User commands:
1. `supabase login`
2. `supabase link --project-ref <SUPABASE_PROJECT_REF>`
3. Success signal:
1. CLI confirms authenticated session.
2. CLI confirms linked project ref.
4. Unblocks:
1. `BE-002`
2. Any task requiring remote Supabase context.

## CP-02-SUPABASE-PUSH
1. Trigger: before applying migrations remotely.
2. User command:
1. `supabase db push`
3. Success signal:
1. No migration errors.
2. Migration list reflects expected applied state.
4. Optional verify:
1. `supabase migration list`
5. Unblocks:
1. Remote verification for `BE-002`
2. Backend integration tasks that require remote schema.

## CP-03-GCP-TTS
1. Trigger: before first live Google TTS call or audio pre-generation.
2. User commands:
1. `gcloud auth login`
2. `gcloud config set project <GCP_PROJECT_ID>`
3. `gcloud services enable texttospeech.googleapis.com`
3. Required credential step:
1. Create service account with least privilege for TTS usage.
2. Provide secret via backend secret store (not committed to repo).
4. Success signal:
1. API enable command succeeds.
2. Backend TTS test endpoint can synthesize one prompt.
5. Unblocks:
1. `BE-006`
2. TTS-dependent test scenarios.

## CP-04-GITHUB-PUSH
1. Trigger: before first remote push or pull request workflow.
2. User commands:
1. `git remote -v` (verify remote)
2. `git push -u origin <branch>`
3. Success signal:
1. Branch appears on GitHub remote.
2. PR can be opened.
4. Unblocks:
1. `PM-002`
2. `REL-001`

## CP-05-VERCEL-LINK
1. Trigger: before first Vercel preview/production deployment.
2. User commands:
1. `vercel login`
2. `vercel link`
3. Success signal:
1. Local project linked to target Vercel project.
4. Unblocks:
1. `REL-001`

## CP-06-VERCEL-ENV
1. Trigger: before deploy requiring runtime environment variables.
2. User commands:
1. `vercel env add VITE_SUPABASE_URL`
2. `vercel env add VITE_SUPABASE_ANON_KEY`
3. Success signal:
1. Env vars listed for target environment.
2. Deploy reads envs without runtime config errors.
4. Unblocks:
1. `REL-001`

## CP-07-CI-SECRETS
1. Trigger: before enabling automated CI deploy and infra operations.
2. User action in GitHub secrets:
1. `SUPABASE_ACCESS_TOKEN`
2. `SUPABASE_PROJECT_REF`
3. `VERCEL_TOKEN`
4. `VERCEL_ORG_ID`
5. `VERCEL_PROJECT_ID`
3. Success signal:
1. CI pipeline can run without secret-missing failures.
4. Unblocks:
1. Final automation path in `REL-001`
2. Ongoing `PM-002` status confidence.
