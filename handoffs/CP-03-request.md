# Checkpoint Request

## 1. Checkpoint Metadata
1. Checkpoint ID: `CP-03-GCP-TTS`
2. Triggered By Task ID: `BE-006`
3. Affected Tasks: `BE-006`, `QA-003` (audio path), `REL-001`
4. Requested By Agent: PM/Backend

## 2. Why Intervention Is Needed
1. Blocking reason: Google TTS credentials are not configured.
2. Autonomous flow cannot validate synthesis and caching without API access.

## 3. User Action Required
1. `gcloud auth login`
2. `gcloud config set project <GCP_PROJECT_ID>`
3. `gcloud services enable texttospeech.googleapis.com`
4. Create API key with Text-to-Speech API access.
5. Set key in Supabase secret store:
1. `npx supabase secrets set GOOGLE_TTS_API_KEY=<YOUR_API_KEY>`

## 4. Success Signal
1. `student-question-audio/<questionItemId>` returns `audioUrl` (not config error).
2. Second call returns `cached: true` for the same item/voice combination.

## 5. Resume Rule
1. On success, move `BE-006` from `BLOCKED` to `READY` and then `DONE` after cache smoke test.
2. Next task to start: `QA-001`.
