# Checkpoint Request

## 1. Checkpoint Metadata
1. Checkpoint ID: `CP-01-SUPABASE-LINK`
2. Triggered By Task ID: `BE-002`
3. Affected Tasks: `BE-002`, `BE-003`, `BE-004`, `BE-005`, `BE-006`
4. Requested By Agent: PM/Backend

## 2. Why Intervention Is Needed
1. Blocking reason: project is not linked to a remote Supabase project ref.
2. Autonomous flow cannot continue for remote migration verification until link is complete.

## 3. User Action Required
1. `npx supabase login`
2. `npx supabase link --project-ref efbmcxadmdarzlfxjjsd`

Alternative non-interactive option:
1. `export SUPABASE_ACCESS_TOKEN=<YOUR_SUPABASE_ACCESS_TOKEN>`
2. `npx supabase link --project-ref efbmcxadmdarzlfxjjsd`

## 4. Success Signal
1. CLI confirms authenticated session and successful project link.
2. Running `npx supabase migration list` no longer returns `Access token not provided`.

## 5. Resume Rule
1. On success, move `BE-002` from `BLOCKED` to `READY`.
2. Next task to start: remote verification for `BE-002` then `BE-003`.
