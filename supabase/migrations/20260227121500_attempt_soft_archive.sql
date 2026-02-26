alter table public.attempts
  add column if not exists archived_at timestamptz;

create index if not exists attempts_archived_at_idx
  on public.attempts (archived_at);

create index if not exists attempts_active_lookup_idx
  on public.attempts (student_id, test_id, archived_at, started_at desc);

notify pgrst, 'reload schema';
