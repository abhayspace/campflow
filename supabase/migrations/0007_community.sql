-- Campflow — community issue validation, requests, and resolution surveys
-- Extends complaints with submission type + visibility, adds community votes,
-- follows, solutions, request categories, request workflow, and surveys.

-- ============================================================
-- Enums
-- ============================================================
do $$ begin
  create type public.submission_type as enum ('complaint', 'request');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.submission_visibility as enum ('personal', 'campus');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.request_status as enum
    ('submitted', 'under_review', 'info_required', 'under_consideration', 'approved', 'declined', 'planned', 'in_progress', 'implemented', 'closed');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.community_vote_type as enum ('support', 'affected', 'report');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.solution_status as enum ('suggested', 'accepted', 'rejected');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.survey_status as enum ('draft', 'published', 'closed');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.survey_question_type as enum ('single', 'multi', 'rating', 'yesno', 'text');
exception when duplicate_object then null; end $$;

alter type public.complaint_event_type add value if not exists 'vote';
alter type public.complaint_event_type add value if not exists 'moderated';
alter type public.complaint_event_type add value if not exists 'request_status';
alter type public.complaint_event_type add value if not exists 'solution_chosen';
alter type public.complaint_event_type add value if not exists 'survey_sent';

-- ============================================================
-- complaints: submission type, visibility, request workflow
-- ============================================================
alter table public.complaints
  add column if not exists submission_type public.submission_type not null default 'complaint',
  add column if not exists visibility public.submission_visibility not null default 'personal',
  add column if not exists request_status public.request_status,
  add column if not exists request_category_id uuid,
  add column if not exists preferred_outcome text,
  add column if not exists moderated boolean not null default false,
  add column if not exists moderated_by uuid references public.profiles (id),
  add column if not exists moderation_note text,
  add column if not exists ai_analysis jsonb;

create index complaints_visibility_idx on public.complaints (institution_id, visibility, moderated, created_at desc);
create index complaints_submission_type_idx on public.complaints (institution_id, submission_type);

-- ============================================================
-- request_categories — admin-configurable categories for requests
-- ============================================================
create table if not exists public.request_categories (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (institution_id, name)
);

-- ============================================================
-- community votes + follows
-- ============================================================
create table if not exists public.community_votes (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  complaint_id uuid not null references public.complaints (id) on delete cascade,
  voter_id uuid not null references public.profiles (id) on delete cascade,
  vote_type public.community_vote_type not null,
  created_at timestamptz not null default now(),
  unique (complaint_id, voter_id, vote_type)
);
create index community_votes_complaint_idx on public.community_votes (complaint_id, vote_type);

create table if not exists public.submission_follows (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  complaint_id uuid not null references public.complaints (id) on delete cascade,
  follower_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (complaint_id, follower_id)
);
create index submission_follows_follower_idx on public.submission_follows (follower_id);

-- Aggregate vote counts without exposing voter identities.
create or replace function public.vote_counts(p_ids uuid[])
returns table (complaint_id uuid, supporters bigint, affected bigint, reports bigint)
language sql stable security definer set search_path = public as $$
  select v.complaint_id,
    count(*) filter (where v.vote_type = 'support'),
    count(*) filter (where v.vote_type = 'affected'),
    count(*) filter (where v.vote_type = 'report')
  from public.community_votes v
  where v.complaint_id = any (p_ids)
  group by v.complaint_id;
$$;
revoke all on function public.vote_counts(uuid[]) from public, anon;
grant execute on function public.vote_counts(uuid[]) to authenticated;

-- ============================================================
-- solutions — AI suggestions + staff decisions
-- ============================================================
create table if not exists public.solutions (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  complaint_id uuid not null references public.complaints (id) on delete cascade,
  source text not null default 'staff' check (source in ('ai', 'staff')),
  content text not null,
  status public.solution_status not null default 'suggested',
  decided_by uuid references public.profiles (id),
  decided_reason text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index solutions_complaint_idx on public.solutions (complaint_id);
create trigger solutions_touch before update on public.solutions
  for each row execute function public.touch_updated_at();

-- ============================================================
-- surveys
-- ============================================================
create table if not exists public.surveys (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  complaint_id uuid references public.complaints (id) on delete cascade,
  title text not null,
  description text,
  anonymous boolean not null default true,
  deadline timestamptz,
  status public.survey_status not null default 'draft',
  created_by uuid references public.profiles (id),
  published_at timestamptz,
  created_at timestamptz not null default now()
);
create index surveys_institution_idx on public.surveys (institution_id, status);
create index surveys_complaint_idx on public.surveys (complaint_id);

create table if not exists public.survey_questions (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys (id) on delete cascade,
  ord int not null default 0,
  question_type public.survey_question_type not null,
  text text not null,
  options jsonb not null default '[]',
  required boolean not null default true
);
create index survey_questions_survey_idx on public.survey_questions (survey_id, ord);

create table if not exists public.survey_recipients (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  survey_id uuid not null references public.surveys (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (survey_id, profile_id)
);
create index survey_recipients_profile_idx on public.survey_recipients (profile_id);
create index survey_recipients_survey_idx on public.survey_recipients (survey_id);

create table if not exists public.survey_responses (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys (id) on delete cascade,
  respondent_id uuid not null references public.profiles (id) on delete cascade,
  submitted_at timestamptz not null default now(),
  unique (survey_id, respondent_id)
);

create table if not exists public.survey_answers (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.survey_responses (id) on delete cascade,
  question_id uuid not null references public.survey_questions (id) on delete cascade,
  value jsonb not null,
  unique (response_id, question_id)
);

-- ============================================================
-- RLS
-- ============================================================
alter table public.request_categories enable row level security;
alter table public.community_votes enable row level security;
alter table public.submission_follows enable row level security;
alter table public.solutions enable row level security;
alter table public.surveys enable row level security;
alter table public.survey_questions enable row level security;
alter table public.survey_recipients enable row level security;
alter table public.survey_responses enable row level security;
alter table public.survey_answers enable row level security;

-- complaints: extend read access for un-moderated campus-wide submissions
create policy complaints_select_campus on public.complaints
  for select to authenticated
  using (
    institution_id = public.my_institution()
    and visibility = 'campus'
    and moderated = false
    and public.my_role() in ('student', 'teacher', 'admin')
  );

-- request_categories: members read, admins manage
create policy request_categories_select on public.request_categories
  for select to authenticated
  using (institution_id = public.my_institution() and public.my_role() in ('admin', 'teacher', 'student'));
create policy request_categories_write on public.request_categories
  for all to authenticated
  using (institution_id = public.my_institution() and public.my_role() = 'admin')
  with check (institution_id = public.my_institution() and public.my_role() = 'admin');

-- votes: users see only their own votes (public counts go through vote_counts RPC);
-- inserts/deletes happen via the community edge function for rate limits +
-- author-inflation checks.
create policy community_votes_select_own on public.community_votes
  for select to authenticated
  using (institution_id = public.my_institution() and voter_id = auth.uid());
-- staff need aggregate review access (never shown with voter names)
create policy community_votes_select_staff on public.community_votes
  for select to authenticated
  using (institution_id = public.my_institution() and public.my_role() in ('admin', 'teacher'));

-- follows: own rows only
create policy submission_follows_select on public.submission_follows
  for select to authenticated
  using (institution_id = public.my_institution() and follower_id = auth.uid());
create policy submission_follows_insert on public.submission_follows
  for insert to authenticated
  with check (institution_id = public.my_institution() and follower_id = auth.uid());
create policy submission_follows_delete on public.submission_follows
  for delete to authenticated
  using (institution_id = public.my_institution() and follower_id = auth.uid());

-- solutions: staff read; writes via edge functions (service role)
create policy solutions_select on public.solutions
  for select to authenticated
  using (institution_id = public.my_institution() and public.my_role() in ('admin', 'teacher'));

-- surveys: staff see all; students only published surveys they're recipients of
create policy surveys_select_staff on public.surveys
  for select to authenticated
  using (institution_id = public.my_institution() and public.my_role() in ('admin', 'teacher'));
create policy surveys_select_student on public.surveys
  for select to authenticated
  using (
    institution_id = public.my_institution()
    and status in ('published', 'closed')
    and exists (select 1 from public.survey_recipients r where r.survey_id = surveys.id and r.profile_id = auth.uid())
  );

create policy survey_questions_select_staff on public.survey_questions
  for select to authenticated
  using (
    exists (select 1 from public.surveys s where s.id = survey_questions.survey_id
      and s.institution_id = public.my_institution()
      and (public.my_role() in ('admin', 'teacher')
        or (s.status in ('published', 'closed') and exists
          (select 1 from public.survey_recipients r where r.survey_id = s.id and r.profile_id = auth.uid()))))
  );

create policy survey_recipients_select on public.survey_recipients
  for select to authenticated
  using (
    institution_id = public.my_institution()
    and (profile_id = auth.uid() or public.my_role() in ('admin', 'teacher'))
  );

-- responses: staff read aggregates (respondent identity hidden at query layer
-- when the survey is anonymous); respondents read their own row only.
create policy survey_responses_select_staff on public.survey_responses
  for select to authenticated
  using (
    exists (select 1 from public.surveys s where s.id = survey_responses.survey_id
      and s.institution_id = public.my_institution() and public.my_role() in ('admin', 'teacher'))
  );
create policy survey_responses_select_self on public.survey_responses
  for select to authenticated
  using (respondent_id = auth.uid());

create policy survey_answers_select on public.survey_answers
  for select to authenticated
  using (
    exists (
      select 1 from public.survey_responses r
      join public.surveys s on s.id = r.survey_id
      where r.id = survey_answers.response_id
        and s.institution_id = public.my_institution()
        and (r.respondent_id = auth.uid() or public.my_role() in ('admin', 'teacher'))
    )
  );

-- Extend can_view_complaint for campus visibility: campus-wide, unmoderated
-- submissions (and their events/attachments metadata) are readable by anyone
-- in the institution. Personal submissions stay restricted.
create or replace function public.can_view_complaint(p_complaint_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.complaints c
    where c.id = p_complaint_id
      and c.institution_id = public.my_institution()
      and (
        c.created_by = auth.uid()
        or c.assigned_to = auth.uid()
        or public.my_role() = 'admin'
        or (public.my_role() = 'teacher' and c.assigned_department_id is not null
            and public.is_department_staff(c.assigned_department_id))
        or (c.visibility = 'campus' and c.moderated = false
            and public.my_role() in ('student','teacher','admin'))
      )
  )
$$;
