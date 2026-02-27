alter table public.attempts
  add column if not exists archive_at timestamptz;

update public.attempts
set archive_at = archived_at
where archive_at is null
  and archived_at is not null;

create index if not exists attempts_archive_at_idx
  on public.attempts (archive_at);

create index if not exists attempts_active_lookup_archive_idx
  on public.attempts (student_id, test_id, archive_at, started_at desc);

notify pgrst, 'reload schema';
