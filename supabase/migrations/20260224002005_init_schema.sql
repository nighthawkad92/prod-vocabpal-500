create extension if not exists pgcrypto;

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_norm text generated always as (lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))) stored,
  created_at timestamptz not null default now(),
  constraint classes_name_not_blank check (length(btrim(name)) > 0),
  constraint classes_name_norm_unique unique (name_norm)
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  class_id uuid not null references public.classes(id) on delete restrict,
  first_name_norm text generated always as (lower(regexp_replace(btrim(first_name), '\s+', ' ', 'g'))) stored,
  last_name_norm text generated always as (lower(regexp_replace(btrim(last_name), '\s+', ' ', 'g'))) stored,
  identity_key text generated always as (
    lower(regexp_replace(btrim(first_name), '\s+', ' ', 'g')) || '|' ||
    lower(regexp_replace(btrim(last_name), '\s+', ' ', 'g')) || '|' ||
    class_id::text
  ) stored,
  created_at timestamptz not null default now(),
  constraint students_first_name_not_blank check (length(btrim(first_name)) > 0),
  constraint students_last_name_not_blank check (length(btrim(last_name)) > 0),
  constraint students_identity_key_unique unique (identity_key)
);

create table if not exists public.tests (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  version integer not null check (version > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint tests_code_not_blank check (length(btrim(code)) > 0),
  constraint tests_name_not_blank check (length(btrim(name)) > 0)
);

create table if not exists public.question_items (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.tests(id) on delete cascade,
  stage_no integer not null check (stage_no between 0 and 4),
  item_no integer not null check (item_no in (1, 2)),
  item_type text not null check (item_type in ('mcq', 'dictation')),
  prompt_text text not null,
  options_json jsonb,
  answer_key text not null,
  tts_text text,
  display_order integer not null check (display_order between 1 and 10),
  created_at timestamptz not null default now(),
  constraint question_items_prompt_not_blank check (length(btrim(prompt_text)) > 0),
  constraint question_items_answer_not_blank check (length(btrim(answer_key)) > 0),
  constraint question_items_stage_item_unique unique (test_id, stage_no, item_no),
  constraint question_items_display_order_unique unique (test_id, display_order)
);

create table if not exists public.test_windows (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.tests(id) on delete cascade,
  is_open boolean not null default false,
  scope text not null check (scope in ('all', 'allowlist')),
  class_id uuid references public.classes(id) on delete set null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  created_by_teacher_name text not null,
  created_at timestamptz not null default now(),
  constraint test_windows_time_order check (start_at < end_at),
  constraint test_windows_teacher_not_blank check (length(btrim(created_by_teacher_name)) > 0)
);

create table if not exists public.window_allowlist (
  id uuid primary key default gen_random_uuid(),
  window_id uuid not null references public.test_windows(id) on delete cascade,
  first_name_norm text not null,
  last_name_norm text not null,
  class_name_norm text not null,
  created_at timestamptz not null default now(),
  constraint window_allowlist_first_not_blank check (length(btrim(first_name_norm)) > 0),
  constraint window_allowlist_last_not_blank check (length(btrim(last_name_norm)) > 0),
  constraint window_allowlist_class_not_blank check (length(btrim(class_name_norm)) > 0),
  constraint window_allowlist_identity_unique unique (window_id, first_name_norm, last_name_norm, class_name_norm)
);

create table if not exists public.teacher_reopens (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  test_id uuid not null references public.tests(id) on delete cascade,
  reopened_by_teacher_name text not null,
  reason text not null,
  created_at timestamptz not null default now(),
  constraint teacher_reopens_name_not_blank check (length(btrim(reopened_by_teacher_name)) > 0),
  constraint teacher_reopens_reason_not_blank check (length(btrim(reason)) > 0)
);

create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  test_id uuid not null references public.tests(id) on delete restrict,
  window_id uuid not null references public.test_windows(id) on delete restrict,
  status text not null check (status in ('in_progress', 'completed', 'abandoned', 'expired')),
  started_at timestamptz not null,
  ended_at timestamptz,
  total_correct integer not null default 0 check (total_correct between 0 and 10),
  total_wrong integer not null default 0 check (total_wrong between 0 and 10),
  total_score_10 integer not null default 0 check (total_score_10 between 0 and 10),
  stars integer not null default 0 check (stars between 0 and 10),
  placement_stage integer check (placement_stage between 0 and 4),
  created_at timestamptz not null default now(),
  constraint attempts_single_baseline_per_student_test unique (student_id, test_id),
  constraint attempts_score_consistency check (total_score_10 = total_correct),
  constraint attempts_wrong_consistency check (total_correct + total_wrong <= 10),
  constraint attempts_star_consistency check (stars = total_correct),
  constraint attempts_end_after_start check (ended_at is null or ended_at >= started_at)
);

create table if not exists public.responses (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  question_item_id uuid not null references public.question_items(id) on delete restrict,
  stage_no integer not null check (stage_no between 0 and 4),
  item_no integer not null check (item_no in (1, 2)),
  submitted_answer text not null,
  is_correct boolean not null,
  shown_at timestamptz not null,
  answered_at timestamptz not null,
  response_time_ms integer not null check (response_time_ms >= 0 and response_time_ms <= 600000),
  server_received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint responses_answer_not_blank check (length(btrim(submitted_answer)) > 0),
  constraint responses_answer_after_shown check (answered_at >= shown_at),
  constraint responses_attempt_stage_item_unique unique (attempt_id, stage_no, item_no),
  constraint responses_attempt_item_unique unique (attempt_id, question_item_id)
);

create table if not exists public.teacher_sessions (
  id uuid primary key default gen_random_uuid(),
  teacher_name text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint teacher_sessions_name_not_blank check (length(btrim(teacher_name)) > 0),
  constraint teacher_sessions_token_not_blank check (length(btrim(token_hash)) > 0)
);

create table if not exists public.teacher_audit_events (
  id uuid primary key default gen_random_uuid(),
  teacher_name text not null,
  event_type text not null,
  event_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint teacher_audit_name_not_blank check (length(btrim(teacher_name)) > 0),
  constraint teacher_audit_event_not_blank check (length(btrim(event_type)) > 0)
);

create index if not exists idx_responses_attempt_stage_item
  on public.responses (attempt_id, stage_no, item_no);

create index if not exists idx_attempts_test_status_started
  on public.attempts (test_id, status, started_at desc);

create index if not exists idx_students_class_last_first
  on public.students (class_id, last_name_norm, first_name_norm);

create index if not exists idx_test_windows_open_time
  on public.test_windows (is_open, start_at, end_at);

create index if not exists idx_teacher_sessions_token_exp
  on public.teacher_sessions (token_hash, expires_at);

create index if not exists idx_question_items_test_order
  on public.question_items (test_id, display_order);

create or replace function public.placement_stage_from_score(score integer)
returns integer
language sql
immutable
as $$
  select
    case
      when score between 0 and 2 then 0
      when score between 3 and 4 then 1
      when score between 5 and 6 then 2
      when score between 7 and 8 then 3
      when score between 9 and 10 then 4
      else null
    end;
$$;

alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.tests enable row level security;
alter table public.question_items enable row level security;
alter table public.test_windows enable row level security;
alter table public.window_allowlist enable row level security;
alter table public.teacher_reopens enable row level security;
alter table public.attempts enable row level security;
alter table public.responses enable row level security;
alter table public.teacher_sessions enable row level security;
alter table public.teacher_audit_events enable row level security;
