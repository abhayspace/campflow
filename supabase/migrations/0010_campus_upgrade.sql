-- Campus improvement upgrade: memory, resolution criteria, relationships,
-- request pilots, priority overrides, policies, recurrence flags, quiet signals,
-- and incident dossiers. Writes go through the campus-upgrade edge function.

do $$ begin
  create type public.memory_outcome as enum ('successful', 'partial', 'unsuccessful', 'inconclusive');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.contract_status as enum ('proposed', 'approved', 'in_progress', 'staff_checked', 'student_pending', 'uncertain', 'reopened');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.criterion_state as enum ('proposed', 'confirmed', 'completed', 'waived');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.pilot_approach as enum ('quick_win', 'pilot', 'full');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.pilot_status as enum ('draft', 'proposed', 'approved', 'running', 'evaluated', 'deferred', 'declined');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.policy_status as enum ('draft', 'active', 'replaced', 'inactive');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.signal_status as enum ('open', 'reviewing', 'dismissed', 'confirmed');
exception when duplicate_object then null; end $$;

alter table public.complaints
  add column if not exists search_document tsvector
  generated always as (
    to_tsvector('english',
      coalesce(title, '') || ' ' || coalesce(description, '') || ' ' ||
      coalesce(location, '') || ' ' || coalesce(resolution_notes, ''))
  ) stored;
create index if not exists complaints_search_idx on public.complaints using gin (search_document);

create table if not exists public.memory_outcomes (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  complaint_id uuid not null unique references public.complaints (id) on delete cascade,
  outcome public.memory_outcome not null,
  note text,
  labeled_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.resolution_contracts (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  complaint_id uuid not null unique references public.complaints (id) on delete cascade,
  status public.contract_status not null default 'proposed',
  summary text not null default '',
  safety_note text,
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.resolution_criteria (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  contract_id uuid not null references public.resolution_contracts (id) on delete cascade,
  complaint_id uuid not null references public.complaints (id) on delete cascade,
  position int not null default 0,
  label text not null,
  evidence_required text not null default '',
  source text not null default 'staff',
  state public.criterion_state not null default 'proposed',
  evidence_note text,
  completed_by uuid references public.profiles (id),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists resolution_criteria_contract_idx on public.resolution_criteria (contract_id, position);

create table if not exists public.issue_relationships (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  from_complaint_id uuid not null references public.complaints (id) on delete cascade,
  to_complaint_id uuid not null references public.complaints (id) on delete cascade,
  explanation text not null,
  evidence text not null,
  uncertainty text not null default 'high',
  ai_note text,
  review_status public.link_review_status not null default 'pending',
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (from_complaint_id < to_complaint_id),
  unique (from_complaint_id, to_complaint_id)
);
create index if not exists issue_relationships_inst_idx on public.issue_relationships (institution_id, review_status);

create table if not exists public.request_plans (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  complaint_id uuid not null unique references public.complaints (id) on delete cascade,
  approach public.pilot_approach,
  status public.pilot_status not null default 'draft',
  problem text not null default '',
  beneficiaries text not null default '',
  desired_outcome text not null default '',
  obstacles text not null default '',
  missing_info text not null default '',
  options jsonb not null default '[]'::jsonb,
  risks text not null default '',
  metrics text not null default '',
  effort_note text not null default 'Not enough information',
  department_id uuid references public.departments (id) on delete set null,
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  ai_generated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pilot_plans (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  request_plan_id uuid not null references public.request_plans (id) on delete cascade,
  objective text not null,
  scope text not null default '',
  starts_on date,
  ends_on date,
  responsible_profile_id uuid references public.profiles (id),
  evaluation_questions text not null default '',
  success_criteria text not null default '',
  feedback text,
  outcome_note text,
  evaluated_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.priority_overrides (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  complaint_id uuid not null references public.complaints (id) on delete cascade,
  previous_priority public.complaint_priority not null,
  new_priority public.complaint_priority not null,
  reason text not null,
  actor_id uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists priority_overrides_complaint_idx on public.priority_overrides (complaint_id, created_at desc);

create table if not exists public.policy_documents (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  title text not null,
  body text not null,
  version int not null default 1,
  status public.policy_status not null default 'draft',
  owner_id uuid references public.profiles (id),
  effective_on date,
  review_on date,
  replaces_id uuid references public.policy_documents (id) on delete set null,
  search_document tsvector generated always as (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body, ''))) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(body) <= 50000)
);
create index if not exists policy_documents_search_idx on public.policy_documents using gin (search_document);
create index if not exists policy_documents_inst_idx on public.policy_documents (institution_id, status);

create table if not exists public.recurrence_flags (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  complaint_id uuid not null references public.complaints (id) on delete cascade,
  prior_complaint_id uuid not null references public.complaints (id) on delete cascade,
  hours_since numeric,
  reason text not null,
  review_status public.signal_status not null default 'open',
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (complaint_id, prior_complaint_id),
  check (complaint_id <> prior_complaint_id)
);
create index if not exists recurrence_flags_complaint_idx on public.recurrence_flags (complaint_id);

create table if not exists public.quiet_signals (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  location_key text not null,
  category public.complaint_category not null,
  window_start date not null,
  window_end date not null,
  report_count int not null,
  baseline_count int not null,
  reason text not null,
  review_status public.signal_status not null default 'open',
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (institution_id, location_key, category, window_start)
);

create table if not exists public.incident_dossiers (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  complaint_id uuid references public.complaints (id) on delete cascade,
  incident_id uuid references public.incidents (id) on delete cascade,
  audience text not null default 'staff' check (audience in ('staff', 'student')),
  sections text[] not null default '{}',
  body jsonb not null,
  generated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  check (complaint_id is not null or incident_id is not null)
);
create index if not exists incident_dossiers_complaint_idx on public.incident_dossiers (complaint_id, created_at desc);

drop trigger if exists memory_outcomes_touch on public.memory_outcomes;
create trigger memory_outcomes_touch before update on public.memory_outcomes
  for each row execute function public.touch_updated_at();
drop trigger if exists resolution_contracts_touch on public.resolution_contracts;
create trigger resolution_contracts_touch before update on public.resolution_contracts
  for each row execute function public.touch_updated_at();
drop trigger if exists request_plans_touch on public.request_plans;
create trigger request_plans_touch before update on public.request_plans
  for each row execute function public.touch_updated_at();
drop trigger if exists policy_documents_touch on public.policy_documents;
create trigger policy_documents_touch before update on public.policy_documents
  for each row execute function public.touch_updated_at();

-- Campus memory: only records the caller is already allowed to read.
create or replace function public.search_campus_memory(p_complaint uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c public.complaints%rowtype;
  query tsquery;
  result jsonb;
begin
  if not public.can_view_complaint(p_complaint) then return '[]'::jsonb; end if;
  select * into c from public.complaints where id = p_complaint;
  if c.id is null then return '[]'::jsonb; end if;
  begin
    query := websearch_to_tsquery('english', left(regexp_replace(c.title, '[^[:alnum:] ]', ' ', 'g'), 80));
  exception when others then
    query := null;
  end;
  select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) into result
  from (
    select
      o.id, o.ticket_number, o.title, o.location, o.category::text, o.status::text,
      o.created_at, o.resolved_at, o.reopen_count,
      left(coalesce(o.resolution_notes, ''), 280) as resolution_notes,
      (o.category = c.category) as category_match,
      (length(trim(c.location)) > 2 and position(lower(left(trim(c.location), 24)) in lower(o.location)) > 0) as location_match,
      mo.outcome::text as outcome,
      case when public.my_role() in ('admin', 'teacher') then mo.note else null end as outcome_note,
      o.verification::text as verification,
      case
        when o.reopen_count > 0 then 'The earlier ticket was reopened after a recorded resolution.'
        when mo.outcome = 'successful' then 'Staff labeled that outcome successful. That does not mean the same fix will work here.'
        when mo.outcome = 'partial' then 'Staff labeled that outcome only partly successful.'
        when mo.outcome = 'unsuccessful' then 'Staff labeled that outcome unsuccessful.'
        when mo.outcome = 'inconclusive' then 'Staff labeled that outcome inconclusive.'
        when o.verification = 'confirmed' then 'A student confirmed the earlier resolution.'
        when o.resolution_notes is not null and length(trim(o.resolution_notes)) > 0 then 'A resolution note exists. The outcome was not labeled.'
        else 'The record is similar. No documented outcome was found.'
      end as relevance
    from public.complaints o
    left join public.memory_outcomes mo on mo.complaint_id = o.id
    where o.institution_id = c.institution_id
      and o.id <> c.id
      and public.can_view_complaint(o.id)
      and (
        o.category = c.category
        or (query is not null and o.search_document @@ query)
        or (length(trim(c.location)) > 2 and position(lower(left(trim(c.location), 24)) in lower(o.location)) > 0)
      )
    order by (o.category = c.category) desc, o.resolved_at desc nulls last, o.created_at desc
    limit 8
  ) s;
  return result;
end $$;

create or replace function public.recurrence_notices(p_complaint uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  result jsonb;
begin
  if not public.can_view_complaint(p_complaint) then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) into result
  from (
    select
      f.id, f.hours_since, f.reason, f.review_status::text, f.created_at,
      case when public.can_view_complaint(f.prior_complaint_id) then p.ticket_number else null end as prior_ticket,
      case when public.can_view_complaint(f.prior_complaint_id) then f.prior_complaint_id else null end as prior_complaint_id,
      case when public.can_view_complaint(f.prior_complaint_id) then left(coalesce(p.resolution_notes, ''), 240) else null end as prior_resolution,
      p.resolved_at as prior_resolved_at,
      p.verification::text as prior_verification
    from public.recurrence_flags f
    join public.complaints p on p.id = f.prior_complaint_id
    where f.complaint_id = p_complaint
    order by f.created_at desc
  ) s;
  return result;
end $$;

create or replace function public.flag_recurrence(p_complaint uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  c public.complaints%rowtype;
  prior record;
  n int := 0;
  elapsed numeric;
  why text;
  recipient uuid;
begin
  select * into c from public.complaints where id = p_complaint;
  if c.id is null then return 0; end if;
  if auth.role() <> 'service_role' and not public.can_view_complaint(p_complaint) then
    return 0;
  end if;
  for prior in
    select o.id, o.resolved_at, o.ticket_number, o.assigned_department_id
    from public.complaints o
    where o.institution_id = c.institution_id
      and o.id <> c.id
      and o.category = c.category
      and o.status in ('resolved', 'closed')
      and o.resolved_at is not null
      and length(trim(c.location)) > 2
      and position(lower(left(trim(c.location), 24)) in lower(o.location)) > 0
    order by o.resolved_at desc
    limit 3
  loop
    elapsed := extract(epoch from (c.created_at - prior.resolved_at)) / 3600;
    why := 'A resolved report in a similar place and category was found '
      || greatest(0, round(elapsed)) || ' hours after the earlier resolution. Review whether this is the same problem. This flag is not evidence that the earlier repair failed.';
    insert into public.recurrence_flags (institution_id, complaint_id, prior_complaint_id, hours_since, reason)
    values (c.institution_id, c.id, prior.id, elapsed, why)
    on conflict (complaint_id, prior_complaint_id) do nothing;
    if found then
      n := n + 1;
      for recipient in
        select id from public.profiles
        where institution_id = c.institution_id and role = 'admin' and account_status = 'active'
        union
        select profile_id from public.department_members
        where department_id = coalesce(c.assigned_department_id, prior.assigned_department_id)
          and membership_type in ('head', 'teacher')
      loop
        insert into public.notifications (institution_id, recipient_id, complaint_id, notification_type, title, message, dedup_key)
        values (
          c.institution_id, recipient, c.id, 'recurrence',
          'Possible recurrence ' || c.ticket_number,
          why,
          'recurrence:' || c.id || ':' || prior.id
        )
        on conflict (recipient_id, dedup_key) do nothing;
      end loop;
    end if;
  end loop;
  return n;
end $$;

create or replace function public.refresh_quiet_signals()
returns int language plpgsql security definer set search_path = public as $$
declare
  inst uuid := public.my_institution();
  n int := 0;
  start_day date := current_date - 14;
begin
  if public.my_role() not in ('admin', 'teacher') or inst is null then
    raise exception 'not allowed';
  end if;
  insert into public.quiet_signals (
    institution_id, location_key, category, window_start, window_end, report_count, baseline_count, reason
  )
  select inst, lower(trim(c.location)), c.category, start_day, current_date,
    count(*) filter (where c.created_at >= now() - interval '14 days'),
    count(*) filter (where c.created_at < now() - interval '14 days' and c.created_at >= now() - interval '28 days'),
    'More reports than the previous 14 days for this place and category. This is a pattern to review, not a confirmed fault or an emergency prediction.'
  from public.complaints c
  where c.institution_id = inst
    and c.created_at >= now() - interval '28 days'
    and length(trim(c.location)) > 2
    and public.can_view_complaint(c.id)
  group by lower(trim(c.location)), c.category
  having count(*) filter (where c.created_at >= now() - interval '14 days') >= 3
     and count(*) filter (where c.created_at >= now() - interval '14 days')
       >= greatest(3, 2 * count(*) filter (where c.created_at < now() - interval '14 days' and c.created_at >= now() - interval '28 days'))
  on conflict (institution_id, location_key, category, window_start) do update
    set report_count = excluded.report_count,
        baseline_count = excluded.baseline_count,
        reason = excluded.reason,
        window_end = excluded.window_end;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.fairqueue_board(p_limit int default 40)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  result jsonb;
  lim int := least(greatest(coalesce(p_limit, 40), 1), 80);
begin
  if public.my_role() not in ('admin', 'teacher') then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) into result
  from (
    select c.id, c.ticket_number, c.title, c.location, c.category::text, c.priority::text, c.status::text,
      c.safety_flagged, c.created_at,
      public.priority_explanation(c.id) as explanation
    from public.complaints c
    where c.institution_id = public.my_institution()
      and c.status in ('new', 'assigned', 'in_progress', 'reopened')
      and public.can_view_complaint(c.id)
    order by c.safety_flagged desc, c.created_at asc
    limit lim
  ) s;
  return result;
end $$;

-- Extend the existing deterministic score. Votes are intentionally absent.
create or replace function public.priority_explanation(p_complaint uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
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
  if not public.can_view_complaint(p_complaint) then return null; end if;

  score := score + case c.priority when 'urgent' then 40 when 'high' then 30 when 'medium' then 18 else 8 end;
  factors := factors || jsonb_build_object('factor', 'Declared priority', 'detail', c.priority, 'points',
    case c.priority when 'urgent' then 40 when 'high' then 30 when 'medium' then 18 else 8 end, 'source', 'complaint.priority');

  foreach kw in array keywords loop
    if (c.title || ' ' || c.description) ilike '%' || kw || '%' then
      found := found || kw;
    end if;
  end loop;
  if array_length(found, 1) > 0 or c.safety_flagged then
    score := score + 25;
    factors := factors || jsonb_build_object('factor', 'Safety indicators', 'detail',
      coalesce(array_to_string(found, ', '), 'flagged at intake'), 'points', 25, 'source', 'complaint text or safety flag');
  end if;

  if c.category in ('internet', 'electricity', 'plumbing') then
    score := score + 8;
    factors := factors || jsonb_build_object('factor', 'Essential service', 'detail',
      c.category || ' is scored as an essential campus service', 'points', 8, 'source', 'scoring rule');
  end if;

  if (c.title || ' ' || c.description || ' ' || coalesce(c.location, '')) ~* 'wheelchair|ramp|elevator|accessible entrance|braille|handrail' then
    score := score + 10;
    factors := factors || jsonb_build_object('factor', 'Campus access', 'detail',
      'The report describes access to a place or service. Personal characteristics are not used.', 'points', 10, 'source', 'complaint text');
  end if;

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
      linked_active || ' confirmed related ticket(s)', 'points', least(20, linked_active * 7), 'source', 'confirmed links');
  end if;

  if c.status not in ('resolved', 'closed') then
    age_hours := extract(epoch from (now() - c.created_at)) / 3600;
    if age_hours > 72 then
      score := score + 15;
      factors := factors || jsonb_build_object('factor', 'Time unresolved', 'detail',
        round(age_hours / 24, 1) || ' days without resolution', 'points', 15, 'source', 'created_at');
    elsif age_hours > 24 then
      score := score + 8;
      factors := factors || jsonb_build_object('factor', 'Time unresolved', 'detail',
        round(age_hours, 1) || ' hours without resolution', 'points', 8, 'source', 'created_at');
    end if;
  end if;

  reopen := c.reopen_count;
  if reopen > 0 then
    score := score + least(15, reopen * 10);
    factors := factors || jsonb_build_object('factor', 'Reopened before', 'detail',
      reopen || ' time(s)', 'points', least(15, reopen * 10), 'source', 'reopen_count');
  end if;

  if c.escalation_level > 0 then
    score := score + least(15, c.escalation_level * 8);
    factors := factors || jsonb_build_object('factor', 'Escalated', 'detail',
      'escalation level ' || c.escalation_level, 'points', least(15, c.escalation_level * 8), 'source', 'escalation_level');
  end if;

  score := least(100, score);
  return jsonb_build_object(
    'score', score,
    'level', case when score >= 75 then 'critical' when score >= 50 then 'high' when score >= 25 then 'medium' else 'low' end,
    'factors', factors,
    'votes_used', false,
    'evaluated_at', now(),
    'recommended_action', case
      when c.safety_flagged or score >= 75 then 'Follow the configured safety escalation. Do not wait for votes or this score.'
      when score >= 50 then 'Assign to the responsible department today'
      when score >= 25 then 'Handle in the regular queue with progress updates'
      else 'Routine handling is appropriate'
    end
  );
end $$;

alter table public.memory_outcomes enable row level security;
alter table public.resolution_contracts enable row level security;
alter table public.resolution_criteria enable row level security;
alter table public.issue_relationships enable row level security;
alter table public.request_plans enable row level security;
alter table public.pilot_plans enable row level security;
alter table public.priority_overrides enable row level security;
alter table public.policy_documents enable row level security;
alter table public.recurrence_flags enable row level security;
alter table public.quiet_signals enable row level security;
alter table public.incident_dossiers enable row level security;

create policy memory_outcomes_select on public.memory_outcomes for select to authenticated
  using (institution_id = public.my_institution() and public.my_role() in ('admin', 'teacher'));
create policy resolution_contracts_select on public.resolution_contracts for select to authenticated
  using (institution_id = public.my_institution() and (
    public.my_role() in ('admin', 'teacher')
    or exists (select 1 from public.complaints c where c.id = complaint_id and c.created_by = auth.uid())
  ));
create policy resolution_criteria_select on public.resolution_criteria for select to authenticated
  using (institution_id = public.my_institution() and (
    public.my_role() in ('admin', 'teacher')
    or exists (select 1 from public.complaints c where c.id = complaint_id and c.created_by = auth.uid())
  ));
create policy issue_relationships_select on public.issue_relationships for select to authenticated
  using (institution_id = public.my_institution() and public.my_role() in ('admin', 'teacher')
    and public.can_view_complaint(from_complaint_id) and public.can_view_complaint(to_complaint_id));
create policy request_plans_select on public.request_plans for select to authenticated
  using (institution_id = public.my_institution() and (
    public.my_role() in ('admin', 'teacher')
    or exists (select 1 from public.complaints c where c.id = complaint_id and c.created_by = auth.uid())
  ));
create policy pilot_plans_select on public.pilot_plans for select to authenticated
  using (institution_id = public.my_institution() and (
    public.my_role() in ('admin', 'teacher')
    or exists (
      select 1 from public.request_plans rp
      join public.complaints c on c.id = rp.complaint_id
      where rp.id = request_plan_id and c.created_by = auth.uid()
    )
  ));
create policy priority_overrides_select on public.priority_overrides for select to authenticated
  using (institution_id = public.my_institution() and (
    public.my_role() in ('admin', 'teacher')
    or exists (select 1 from public.complaints c where c.id = complaint_id and c.created_by = auth.uid())
  ));
create policy policy_documents_select on public.policy_documents for select to authenticated
  using (institution_id = public.my_institution() and (status = 'active' or public.my_role() = 'admin'));
create policy recurrence_flags_select on public.recurrence_flags for select to authenticated
  using (institution_id = public.my_institution() and public.my_role() in ('admin', 'teacher'));
create policy quiet_signals_select on public.quiet_signals for select to authenticated
  using (institution_id = public.my_institution() and public.my_role() in ('admin', 'teacher'));
create policy incident_dossiers_select on public.incident_dossiers for select to authenticated
  using (
    institution_id = public.my_institution()
    and (
      (audience = 'staff' and public.my_role() in ('admin', 'teacher'))
      or (audience = 'student' and complaint_id is not null and exists (
        select 1 from public.complaints c where c.id = complaint_id and c.created_by = auth.uid()
      ))
    )
  );

grant select on public.memory_outcomes, public.resolution_contracts, public.resolution_criteria,
  public.issue_relationships, public.request_plans, public.pilot_plans, public.priority_overrides,
  public.policy_documents, public.recurrence_flags, public.quiet_signals, public.incident_dossiers
  to authenticated;

revoke all on function public.search_campus_memory(uuid) from public, anon;
revoke all on function public.recurrence_notices(uuid) from public, anon;
revoke all on function public.flag_recurrence(uuid) from public, anon;
revoke all on function public.refresh_quiet_signals() from public, anon;
revoke all on function public.fairqueue_board(int) from public, anon;
grant execute on function public.search_campus_memory(uuid) to authenticated;
grant execute on function public.recurrence_notices(uuid) to authenticated;
grant execute on function public.flag_recurrence(uuid) to authenticated, service_role;
grant execute on function public.refresh_quiet_signals() to authenticated;
grant execute on function public.fairqueue_board(int) to authenticated;
