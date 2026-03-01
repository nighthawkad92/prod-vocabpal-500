alter table public.test_windows
  add column if not exists window_key text;

create unique index if not exists idx_test_windows_test_window_key_unique
  on public.test_windows (test_id, window_key)
  where window_key is not null;

with baseline as (
  select id as test_id
  from public.tests
  where code = 'BASELINE_V1'
  limit 1
),
updated as (
  update public.test_windows as tw
  set
    scope = 'all',
    class_id = null,
    is_open = true,
    start_at = now() - interval '1 minute',
    end_at = '2099-12-31T23:59:59Z'::timestamptz,
    created_by_teacher_name = 'SYSTEM_ALWAYS_ON'
  from baseline
  where tw.test_id = baseline.test_id
    and tw.window_key = 'baseline_always_on'
  returning tw.id
)
insert into public.test_windows (
  test_id,
  window_key,
  is_open,
  scope,
  class_id,
  start_at,
  end_at,
  created_by_teacher_name
)
select
  baseline.test_id,
  'baseline_always_on',
  true,
  'all',
  null,
  now() - interval '1 minute',
  '2099-12-31T23:59:59Z'::timestamptz,
  'SYSTEM_ALWAYS_ON'
from baseline
where not exists (
  select 1
  from updated
);
