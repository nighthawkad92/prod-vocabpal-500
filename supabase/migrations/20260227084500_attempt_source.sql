alter table public.attempts
  add column if not exists attempt_source text not null default 'student';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'attempts_attempt_source_valid'
  ) then
    alter table public.attempts
      add constraint attempts_attempt_source_valid
      check (attempt_source in ('student', 'qa'));
  end if;
end $$;

create index if not exists idx_attempts_source_status_started
  on public.attempts (attempt_source, status, started_at desc);
