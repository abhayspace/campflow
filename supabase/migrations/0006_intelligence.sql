-- Campflow — campus intelligence layer
-- Incidents, escalation/SLA, resolution verification, investigation notes,
-- broadcasts, recurrence reviews, and deterministic priority scoring.

-- ============================================================
-- Enums
-- ============================================================
do $$ begin
  create type public.incident_status as enum ('suspected', 'confirmed', 'investigating', 'resolved', 'dismissed');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.verification_status as enum ('awaiting_verification', 'confirmed', 'reopen_requested', 'expired');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.incident_note_type as enum ('note', 'hypothesis', 'step', 'outcome');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.cause_review_status as enum ('suspected', 'investigated', 'confirmed', 'dismissed');
exception when duplicate_object then null; end $$;

alter type public.complaint_event_type add value if not exists 'priority_changed';
alter type public.complaint_event_type add value if not exists 'escalated';
alter type public.complaint_event_type add value if not exists 'verification';
alter type public.complaint_event_type add value if not exists 'linked_incident';
alter type public.complaint_event_type add value if not exists 'deferred';

-- ============================================================
-- complaints: operational columns
-- ============================================================
alter table public.complaints
  add column if not exists due_at timestamptz,
  add column if not exists first_response_at timestamptz,
  add column if not exists escalation_level int not null default 0,
  add column if not exists reopen_count int not null default 0,
  add column if not exists verification public.verification_status,
  add column if not exists safety_flagged boolean not null default false,
  add column if not exists resolution_attachment_id uuid;

create index complaints_due_idx on public.complaints (institution_id, due_at)
  where status not in ('resolved', 'closed');

-- ============================================================
-- incidents + membership
-- ============================================================
create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  title text not null,
  summary text,
  category public.complaint_category,
  location text not null default '',
  status public.incident_status not null default 'suspected',
  department_id uuid references public.departments (id) on delete set null,
  created_by uuid references public.profiles (id),
  confirmed_by uuid references public.profiles (id),
  confirmed_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index incidents_institution_idx on public.incidents (institution_id, status, created_at desc);

create table public.incident_complaints (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  incident_id uuid not null references public.incidents (id) on delete cascade,
  complaint_id uuid not null references public.complaints (id) on delete cascade,
  added_by uuid references public.profiles (id),
  link_source text not null default 'manual',
  created_at timestamptz not null default now(),
  unique (incident_id, complaint_id)
);
create index incident_complaints_incident_idx on public.incident_complaints (incident_id);
create index incident_complaints_complaint_idx on public.incident_complaints (complaint_id);

-- ============================================================
-- escalation rules + escalation events
-- ============================================================
create table public.sla_rules (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  category public.complaint_category,          -- null = applies to all
  priority public.complaint_priority,           -- null = applies to all
  response_hours int not null default 24,       -- time to first staff action
  resolve_hours int not null default 72,        -- time to resolution
  escalate_after_hours int not null default 24, -- repeat-escalation cadence
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index sla_rules_institution_idx on public.sla_rules (institution_id, is_active);

create table public.escalation_events (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  complaint_id uuid not null references public.complaints (id) on delete cascade,
  rule_id uuid references public.sla_rules (id) on delete set null,
  level int not null,
  reason text not null,
  actor_id uuid references public.profiles (id), -- null = system
  created_at timestamptz not null default now(),
  unique (complaint_id, level, reason)
);
create index escalation_events_complaint_idx on public.escalation_events (complaint_id, created_at);
create index escalation_events_institution_idx on public.escalation_events (institution_id, created_at desc);

-- ============================================================
-- investigation notes (incident-scoped)
-- ============================================================
create table public.incident_notes (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  incident_id uuid not null references public.incidents (id) on delete cascade,
  author_id uuid references public.profiles (id),
  note_type public.incident_note_type not null default 'note',
  content text not null,
  ai_generated boolean not null default false,
  review_state text,                      -- null | 'confirmed' | 'rejected'
  reviewed_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index incident_notes_incident_idx on public.incident_notes (incident_id, created_at);

-- ============================================================
-- broadcasts to affected students
-- ============================================================
create table public.incident_broadcasts (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  incident_id uuid not null references public.incidents (id) on delete cascade,
  sent_by uuid references public.profiles (id),
  message text not null,
  recipient_count int not null default 0,
  created_at timestamptz not null default now()
);
create index incident_broadcasts_incident_idx on public.incident_broadcasts (incident_id);

-- ============================================================
-- cause reviews for the Recurrence Radar
-- ============================================================
create table public.cause_reviews (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  location_key text not null,
  category public.complaint_category not null,
  status public.cause_review_status not null default 'suspected',
  note text,
  reviewed_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (institution_id, location_key, category)
);

-- ============================================================
-- Deterministic priority scoring.
-- Score 0..100 built only from real data — never AI-invented.
-- ============================================================
create or replace function public.priority_explanation(p_complaint uuid)
returns jsonb language plpgsql stable security definer
set search_path = public as $$
declare
  c public.complaints%rowtype;
  score int := 0;
  factors jsonb := '[]'::jsonb;
  link_count int;
  reopen int;
  age_hours numeric;
  linked_active int;
  keywords text[] := array['fire','spark','smoke','gas','shock','electroc','flood','collapse',
    'injur','hazard','exposed','burn','toxic','short circuit','live wire','sewage'];
  kw text;
  found text[] := '{}';
begin
  select * into c from public.complaints where id = p_complaint;
  if c.id is null then return null; end if;
  -- Respect complaint visibility: callers only see scores for tickets
  -- they can already read.
  if not public.can_view_complaint(p_complaint) then return null; end if;

  -- Base priority weight
  score := score + case c.priority when 'urgent' then 40 when 'high' then 30 when 'medium' then 18 else 8 end;
  factors := factors || jsonb_build_object('factor', 'Declared priority', 'detail', c.priority, 'points',
    case c.priority when 'urgent' then 40 when 'high' then 30 when 'medium' then 18 else 8 end);

  -- Safety keywords (deterministic scan)
  foreach kw in array keywords loop
    if (c.title || ' ' || c.description) ilike '%' || kw || '%' then
      found := found || kw;
    end if;
  end loop;
  if array_length(found, 1) > 0 or c.safety_flagged then
    score := score + 25;
    factors := factors || jsonb_build_object('factor', 'Safety indicators', 'detail',
      coalesce(array_to_string(found, ', '), 'flagged at intake'), 'points', 25);
  end if;

  -- Linked reports (people affected = confirmed link count, not guessed)
  select count(*) into link_count from public.incident_complaints ic where ic.complaint_id = c.id;
  select
    (select count(distinct related_complaint_id) from public.complaint_links
      where source_complaint_id = c.id and review_status = 'confirmed')
  + (select count(distinct source_complaint_id) from public.complaint_links
      where related_complaint_id = c.id and review_status = 'confirmed')
  into linked_active;
  linked_active := coalesce(linked_active, 0) + coalesce(link_count, 0);
  if linked_active > 0 then
    score := score + least(20, linked_active * 7);
    factors := factors || jsonb_build_object('factor', 'Linked reports', 'detail',
      linked_active || ' related ticket(s) — likely ' || (linked_active + 1) || ' people affected', 'points', least(20, linked_active * 7));
  end if;

  -- Age while unresolved
  if c.status not in ('resolved', 'closed') then
    age_hours := extract(epoch from (now() - c.created_at)) / 3600;
    if age_hours > 72 then
      score := score + 15;
      factors := factors || jsonb_build_object('factor', 'Time unresolved', 'detail',
        round(age_hours / 24, 1) || ' days without resolution', 'points', 15);
    elsif age_hours > 24 then
      score := score + 8;
      factors := factors || jsonb_build_object('factor', 'Time unresolved', 'detail',
        round(age_hours, 1) || ' hours without resolution', 'points', 8);
    end if;
  end if;

  -- Reopened history
  reopen := c.reopen_count;
  if reopen > 0 then
    score := score + least(15, reopen * 10);
    factors := factors || jsonb_build_object('factor', 'Reopened before', 'detail',
      reopen || ' time(s) — previous fix did not hold', 'points', least(15, reopen * 10));
  end if;

  -- Escalation level
  if c.escalation_level > 0 then
    score := score + least(15, c.escalation_level * 8);
    factors := factors || jsonb_build_object('factor', 'Escalated', 'detail',
      'escalation level ' || c.escalation_level, 'points', least(15, c.escalation_level * 8));
  end if;

  score := least(100, score);
  return jsonb_build_object(
    'score', score,
    'level', case when score >= 75 then 'critical' when score >= 50 then 'high' when score >= 25 then 'medium' else 'low' end,
    'factors', factors,
    'recommended_action', case
      when score >= 75 then 'Escalate immediately and assign a senior staff member'
      when score >= 50 then 'Assign to the responsible department today'
      when score >= 25 then 'Handle in the regular queue with progress updates'
      else 'Routine handling is appropriate'
    end
  );
end $$;

-- ============================================================
-- Guards
-- ============================================================
create or replace function public.incidents_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' then return new; end if;
  if new.institution_id <> old.institution_id then
    raise exception 'institution cannot be modified';
  end if;
  return new;
end $$;

create trigger incidents_guard_trg before update on public.incidents
  for each row execute function public.incidents_guard();

create trigger incidents_touch before update on public.incidents
  for each row execute function public.touch_updated_at();
create trigger cause_reviews_touch before update on public.cause_reviews
  for each row execute function public.touch_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.incidents enable row level security;
alter table public.incident_complaints enable row level security;
alter table public.sla_rules enable row level security;
alter table public.escalation_events enable row level security;
alter table public.incident_notes enable row level security;
alter table public.incident_broadcasts enable row level security;
alter table public.cause_reviews enable row level security;

-- incidents: staff see everything; students see incidents containing their own reports
create policy incidents_select_staff on public.incidents
  for select to authenticated
  using (institution_id = public.my_institution() and public.my_role() in ('admin', 'teacher'));
create policy incidents_select_student on public.incidents
  for select to authenticated
  using (
    institution_id = public.my_institution()
    and exists (
      select 1 from public.incident_complaints ic
      join public.complaints c on c.id = ic.complaint_id
      where ic.incident_id = incidents.id and c.created_by = auth.uid()
    )
  );

-- incident_complaints: staff all; students only rows tied to their own complaints
create policy incident_complaints_select_staff on public.incident_complaints
  for select to authenticated
  using (institution_id = public.my_institution() and public.my_role() in ('admin', 'teacher'));
create policy incident_complaints_select_student on public.incident_complaints
  for select to authenticated
  using (
    institution_id = public.my_institution()
    and exists (select 1 from public.complaints c where c.id = complaint_id and c.created_by = auth.uid())
  );

-- sla_rules: readable by staff, writable by admins
create policy sla_rules_select on public.sla_rules
  for select to authenticated
  using (institution_id = public.my_institution() and public.my_role() in ('admin', 'teacher'));
create policy sla_rules_insert on public.sla_rules
  for insert to authenticated
  with check (institution_id = public.my_institution() and public.my_role() = 'admin');
create policy sla_rules_update on public.sla_rules
  for update to authenticated
  using (institution_id = public.my_institution() and public.my_role() = 'admin')
  with check (institution_id = public.my_institution() and public.my_role() = 'admin');
create policy sla_rules_delete on public.sla_rules
  for delete to authenticated
  using (institution_id = public.my_institution() and public.my_role() = 'admin');

-- escalation_events: staff read; students see events on their own complaints
create policy escalation_events_select_staff on public.escalation_events
  for select to authenticated
  using (institution_id = public.my_institution() and public.my_role() in ('admin', 'teacher'));
create policy escalation_events_select_student on public.escalation_events
  for select to authenticated
  using (
    institution_id = public.my_institution()
    and exists (select 1 from public.complaints c where c.id = complaint_id and c.created_by = auth.uid())
  );

-- incident_notes: staff only (investigation workspace is internal)
create policy incident_notes_select on public.incident_notes
  for select to authenticated
  using (institution_id = public.my_institution() and public.my_role() in ('admin', 'teacher'));
create policy incident_notes_insert on public.incident_notes
  for insert to authenticated
  with check (
    institution_id = public.my_institution()
    and public.my_role() in ('admin', 'teacher')
    and author_id = auth.uid()
  );
create policy incident_notes_update on public.incident_notes
  for update to authenticated
  using (institution_id = public.my_institution() and public.my_role() in ('admin', 'teacher'))
  with check (institution_id = public.my_institution() and public.my_role() in ('admin', 'teacher'));

-- broadcasts: staff read; students see nothing (they get notifications instead)
create policy incident_broadcasts_select on public.incident_broadcasts
  for select to authenticated
  using (institution_id = public.my_institution() and public.my_role() in ('admin', 'teacher'));

-- cause_reviews: staff only
create policy cause_reviews_select on public.cause_reviews
  for select to authenticated
  using (institution_id = public.my_institution() and public.my_role() in ('admin', 'teacher'));
create policy cause_reviews_insert on public.cause_reviews
  for insert to authenticated
  with check (institution_id = public.my_institution() and public.my_role() in ('admin', 'teacher'));
create policy cause_reviews_update on public.cause_reviews
  for update to authenticated
  using (institution_id = public.my_institution() and public.my_role() in ('admin', 'teacher'))
  with check (institution_id = public.my_institution() and public.my_role() in ('admin', 'teacher'));

-- Mutations to incidents/membership/escalations go through edge functions.
revoke all on function public.priority_explanation(uuid) from public, anon, authenticated;
grant execute on function public.priority_explanation(uuid) to authenticated;
