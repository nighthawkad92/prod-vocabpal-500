alter table public.attempts
  drop constraint if exists attempts_single_baseline_per_student_test;

create unique index if not exists idx_attempts_single_active_per_student_test
  on public.attempts (student_id, test_id)
  where status = 'in_progress';

create index if not exists idx_attempts_student_test_started
  on public.attempts (student_id, test_id, started_at desc);
