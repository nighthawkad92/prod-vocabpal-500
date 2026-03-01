insert into public.classes (name)
values
  ('Class A'),
  ('Class B')
on conflict (name_norm) do nothing;

insert into public.tests (code, name, version, is_active)
values
  ('BASELINE_V1', 'VocabPal Baseline Survey', 1, true)
on conflict (code) do update
set
  name = excluded.name,
  version = excluded.version,
  is_active = excluded.is_active;

with baseline as (
  select id as test_id
  from public.tests
  where code = 'BASELINE_V1'
  limit 1
),
updated_window as (
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
  from updated_window
);

with baseline as (
  select id as test_id
  from public.tests
  where code = 'BASELINE_V1'
)
insert into public.question_items (
  test_id,
  stage_no,
  item_no,
  item_type,
  prompt_text,
  options_json,
  answer_key,
  tts_text,
  display_order
)
select
  baseline.test_id,
  v.stage_no,
  v.item_no,
  v.item_type,
  v.prompt_text,
  v.options_json,
  v.answer_key,
  v.tts_text,
  v.display_order
from baseline
cross join (
  values
    (
      0,
      1,
      'mcq',
      'Which word starts with the same sound as "sun"?',
      '["sand","cat","pen"]'::jsonb,
      'sand',
      'Which word starts with the same sound as sun?',
      1
    ),
    (
      0,
      2,
      'dictation',
      'Write the word: cat',
      null::jsonb,
      'cat',
      'Write the word: cat',
      2
    ),
    (
      1,
      1,
      'mcq',
      'Choose the correct word for the spoken audio.',
      '["ship","sheep","shop"]'::jsonb,
      'ship',
      'Ship',
      3
    ),
    (
      1,
      2,
      'dictation',
      'Write the word: dog',
      null::jsonb,
      'dog',
      'Write the word: dog',
      4
    ),
    (
      2,
      1,
      'mcq',
      'Read: "Rita has a red bag." What color is the bag?',
      '["Blue","Red","Green"]'::jsonb,
      'Red',
      null,
      5
    ),
    (
      2,
      2,
      'dictation',
      'Write the word: green',
      null::jsonb,
      'green',
      'Write the word: green',
      6
    ),
    (
      3,
      1,
      'mcq',
      'Read: "Tom has a small dog. The dog likes to play in the park." Where does the dog like to play?',
      '["School","Park","House"]'::jsonb,
      'Park',
      null,
      7
    ),
    (
      3,
      2,
      'dictation',
      'Write the word: happy',
      null::jsonb,
      'happy',
      'Write the word: happy',
      8
    ),
    (
      4,
      1,
      'mcq',
      'Read: "Meena studied hard for her test. She wanted to make her parents proud. On Monday, she smiled when she saw her marks." Why did Meena smile?',
      '["She was tired","She did well in her test","She lost her book"]'::jsonb,
      'She did well in her test',
      null,
      9
    ),
    (
      4,
      2,
      'dictation',
      'Write the word: proud',
      null::jsonb,
      'proud',
      'Write the word: proud',
      10
    )
) as v(
  stage_no,
  item_no,
  item_type,
  prompt_text,
  options_json,
  answer_key,
  tts_text,
  display_order
)
on conflict (test_id, stage_no, item_no) do update
set
  item_type = excluded.item_type,
  prompt_text = excluded.prompt_text,
  options_json = excluded.options_json,
  answer_key = excluded.answer_key,
  tts_text = excluded.tts_text,
  display_order = excluded.display_order;
