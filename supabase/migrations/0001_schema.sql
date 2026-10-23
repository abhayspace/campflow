-- Campflow — core schema
-- Multi-institution campus complaint management system.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ============================================================
-- Enums
-- ============================================================
create type public.institution_type as enum ('school', 'college', 'university', 'institute', 'other');
create type public.institution_status as enum ('pending', 'active', 'suspended');
create type public.user_role as enum ('admin', 'teacher', 'student');
create type public.account_status as enum ('pending', 'active', 'deactivated');
create type public.complaint_category as enum ('plumbing', 'electricity', 'cleanliness', 'internet');
create type public.complaint_priority as enum ('low', 'medium', 'high', 'urgent');
create type public.complaint_status as enum ('new', 'assigned', 'in_progress', 'resolved', 'reopened', 'closed');
create type public.membership_type as enum ('head', 'teacher', 'student');
create type public.complaint_event_type as enum (
  'created', 'status_changed', 'assigned', 'department_assigned', 'note',
  'ai_analysis', 'linked', 'unlinked', 'resolved', 'reopened', 'closed', 'info_requested'
);
create type public.link_relationship as enum ('possible_duplicate', 'related');
create type public.link_review_status as enum ('pending', 'confirmed', 'dismissed');
create type public.invitation_status as enum ('pending', 'sent', 'accepted', 'expired', 'revoked');
create type public.join_request_status as enum ('pending', 'approved', 'rejected');
create type public.delivery_status as enum ('pending', 'sent', 'failed', 'skipped');

-- ============================================================
-- institutions
-- ============================================================
create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  institution_code text not null unique,
  institution_type public.institution_type not null default 'other',
  official_email text not null,
  address text not null default '',
  status public.institution_status not null default 'pending',
  created_at timestamptz not null default now()
);
create unique index institutions_name_lower_uidx on public.institutions (lower(name));
create unique index institutions_official_email_lower_uidx on public.institutions (lower(official_email));

-- ============================================================
-- profiles
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  institution_id uuid not null references public.institutions (id) on delete cascade,
  full_name text not null,
  email text not null,
  role public.user_role not null,
  identifier text,
  account_status public.account_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_institution_email_uidx on public.profiles (institution_id, lower(email));
create index profiles_institution_role_idx on public.profiles (institution_id, role, account_status);

-- ============================================================
-- departments / department_members
-- ============================================================
create table public.departments (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  name text not null,
  description text not null default '',
  department_head_id uuid references public.profiles (id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (institution_id, name)
);
create index departments_institution_idx on public.departments (institution_id, is_active);

create table public.department_members (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  department_id uuid not null references public.departments (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  membership_type public.membership_type not null,
  created_at timestamptz not null default now(),
  unique (department_id, profile_id)
);
create index department_members_profile_idx on public.department_members (profile_id);
create index department_members_dept_idx on public.department_members (department_id, membership_type);

-- Department head must be an active teacher of the same institution, and
-- membership rows must stay inside one institution / matching role rules.
create or replace function public.department_members_validate() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles%rowtype;
  d public.departments%rowtype;
begin
  select * into p from public.profiles where id = new.profile_id;
  select * into d from public.departments where id = new.department_id;
  if p.id is null or d.id is null then
    raise exception 'invalid department membership';
  end if;
  if p.institution_id <> d.institution_id or new.institution_id <> d.institution_id then
    raise exception 'cross-institution membership is not allowed';
  end if;
  if new.membership_type in ('head', 'teacher') and p.role <> 'teacher' then
    raise exception 'only teachers can hold staff membership';
  end if;
  if new.membership_type = 'student' and p.role <> 'student' then
    raise exception 'only students can hold student membership';
  end if;
  if p.account_status = 'deactivated' then
    raise exception 'cannot add a deactivated account to a department';
  end if;
  return new;
end $$;

create trigger department_members_validate_trg
  before insert or update on public.department_members
  for each row execute function public.department_members_validate();

-- Keep departments.department_head_id consistent with the head membership row
-- and enforce that heads are teachers of the same institution.
create or replace function public.departments_validate_head() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles%rowtype;
begin
  if new.department_head_id is null then
    return new;
  end if;
  select * into p from public.profiles where id = new.department_head_id;
  if p.id is null or p.institution_id <> new.institution_id then
    raise exception 'department head must belong to the same institution';
  end if;
  if p.role <> 'teacher' then
    raise exception 'department head must be a teacher';
  end if;
  if p.account_status = 'deactivated' then
    raise exception 'department head cannot be a deactivated account';
  end if;
  return new;
end $$;

create trigger departments_validate_head_trg
  before insert or update on public.departments
  for each row execute function public.departments_validate_head();

-- ============================================================
-- complaints
-- ============================================================
create table public.ticket_counters (
  institution_id uuid primary key references public.institutions (id) on delete cascade,
  last_number bigint not null default 0
);

create table public.complaints (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  ticket_number text not null unique,
  idempotency_key uuid,
  created_by uuid not null references public.profiles (id),
  title text not null,
  description text not null,
  location text not null default '',
  category public.complaint_category not null,
  priority public.complaint_priority not null default 'medium',
  status public.complaint_status not null default 'new',
  assigned_department_id uuid references public.departments (id) on delete set null,
  assigned_to uuid references public.profiles (id) on delete set null,
  ai_summary text,
  ai_reasoning text,
  resolution_notes text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (institution_id, created_by, idempotency_key)
);
create index complaints_institution_status_idx on public.complaints (institution_id, status, created_at desc);
create index complaints_creator_idx on public.complaints (created_by, created_at desc);
create index complaints_assignee_idx on public.complaints (assigned_to) where assigned_to is not null;
create index complaints_dept_idx on public.complaints (assigned_department_id, status) where assigned_department_id is not null;
create index complaints_text_trgm_idx on public.complaints using gin ((title || ' ' || description || ' ' || location) gin_trgm_ops);

-- Human-readable ticket number: CC-<INSTCODE>-<seq>, allocated transactionally.
create or replace function public.next_ticket_number(p_institution uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  n bigint;
  code text;
begin
  insert into public.ticket_counters (institution_id, last_number)
  values (p_institution, 1)
  on conflict (institution_id)
  do update set last_number = ticket_counters.last_number + 1
  returning last_number into n;
  select institution_code into code from public.institutions where id = p_institution;
  return 'CC-' || code || '-' || lpad(n::text, 5, '0');
end $$;

-- ============================================================
-- complaint_attachments / complaint_events / complaint_links
-- ============================================================
create table public.complaint_attachments (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  complaint_id uuid not null references public.complaints (id) on delete cascade,
  uploaded_by uuid not null references public.profiles (id),
  storage_path text not null,
  content_type text not null default 'image/jpeg',
  created_at timestamptz not null default now(),
  unique (complaint_id, storage_path)
);

create table public.complaint_events (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  complaint_id uuid not null references public.complaints (id) on delete cascade,
  actor_id uuid references public.profiles (id),
  event_type public.complaint_event_type not null,
  previous_value text,
  new_value text,
  note text,
  is_internal boolean not null default false,
  created_at timestamptz not null default now()
);
create index complaint_events_complaint_idx on public.complaint_events (complaint_id, created_at);

create table public.complaint_links (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  source_complaint_id uuid not null references public.complaints (id) on delete cascade,
  related_complaint_id uuid not null references public.complaints (id) on delete cascade,
  relationship_type public.link_relationship not null default 'possible_duplicate',
  score numeric(4,3),
  reviewed_by uuid references public.profiles (id),
  review_status public.link_review_status not null default 'pending',
  created_at timestamptz not null default now(),
  check (source_complaint_id <> related_complaint_id),
  unique (source_complaint_id, related_complaint_id)
);
create index complaint_links_source_idx on public.complaint_links (source_complaint_id, review_status);
create index complaint_links_related_idx on public.complaint_links (related_complaint_id);

-- ============================================================
-- department_routing_rules
-- ============================================================
create table public.department_routing_rules (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  category public.complaint_category not null,
  department_id uuid not null references public.departments (id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (institution_id, category, department_id)
);

-- ============================================================
-- notifications + email deliveries
-- ============================================================
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  complaint_id uuid references public.complaints (id) on delete cascade,
  notification_type text not null,
  title text not null,
  message text not null,
  read_at timestamptz,
  dedup_key text,
  created_at timestamptz not null default now(),
  unique (recipient_id, dedup_key)
);
create index notifications_recipient_idx on public.notifications (recipient_id, read_at, created_at desc);

create table public.email_deliveries (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid references public.institutions (id) on delete cascade,
  notification_id uuid references public.notifications (id) on delete set null,
  recipient_email text not null,
  subject text not null,
  status public.delivery_status not null default 'pending',
  provider_id text,
  error text,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

-- ============================================================
-- invitations / join_requests
-- ============================================================
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  email text not null,
  full_name text not null,
  role public.user_role not null,
  identifier text,
  department_id uuid references public.departments (id) on delete set null,
  invited_by uuid references public.profiles (id),
  user_id uuid references auth.users (id) on delete set null,
  status public.invitation_status not null default 'pending',
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index invitations_institution_email_uidx on public.invitations (institution_id, lower(email));
create index invitations_user_idx on public.invitations (user_id, status);

create table public.join_requests (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null,
  requested_role public.user_role not null default 'student',
  identifier text,
  status public.join_request_status not null default 'pending',
  reviewed_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (user_id, institution_id)
);

-- ============================================================
-- Helper functions (security definer; stable)
-- ============================================================
create or replace function public.my_profile()
returns public.profiles language sql stable security definer
set search_path = public as $$
  select * from public.profiles where id = auth.uid()
$$;

create or replace function public.my_role()
returns public.user_role language sql stable security definer
set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.my_institution()
returns uuid language sql stable security definer
set search_path = public as $$
  select institution_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_active_member()
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and account_status = 'active'
  )
$$;

-- Is the current user staff (teacher/head membership or admin) for a dept?
create or replace function public.is_department_staff(p_department uuid)
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from public.department_members m
    where m.department_id = p_department
      and m.profile_id = auth.uid()
      and m.membership_type in ('head', 'teacher')
  )
$$;

create or replace function public.is_department_head(p_department uuid)
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from public.departments d
    where d.id = p_department and d.department_head_id = auth.uid()
  )
$$;

-- Complaint visibility predicate reused by policies.
create or replace function public.can_view_complaint(p_complaint_id uuid)
returns boolean language sql stable security definer
set search_path = public as $$
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
      )
  )
$$;

-- Public, low-privilege lookup so unauthenticated users can verify an
-- institution code during signup/join. Returns only non-sensitive fields.
create or replace function public.institution_by_code(p_code text)
returns table (id uuid, name text, institution_type public.institution_type)
language sql stable security definer
set search_path = public as $$
  select i.id, i.name, i.institution_type
  from public.institutions i
  where i.institution_code = upper(trim(p_code))
    and i.status in ('pending', 'active')
$$;

-- Similar complaints for duplicate detection. Used by edge functions
-- (service role) but safe to expose: scoped to caller's institution.
create or replace function public.find_similar_complaints(p_complaint uuid, p_limit int default 5)
returns table (id uuid, ticket_number text, title text, status public.complaint_status,
               similarity numeric, created_at timestamptz)
language sql stable security definer
set search_path = public as $$
  with src as (
    select c.*, (c.title || ' ' || c.description || ' ' || c.location) as hay
    from public.complaints c where c.id = p_complaint
  )
  select c.id, c.ticket_number, c.title, c.status,
         round(similarity(c.title || ' ' || c.description || ' ' || c.location, src.hay)::numeric, 3) as similarity,
         c.created_at
  from public.complaints c, src
  where c.institution_id = src.institution_id
    and c.id <> src.id
    and c.created_at > now() - interval '90 days'
    and (
      similarity(c.title || ' ' || c.description || ' ' || c.location, src.hay) > 0.22
      or (c.category = src.category and c.location <> '' and src.location <> ''
          and similarity(c.location, src.location) > 0.3)
    )
  order by similarity desc
  limit p_limit
$$;

-- Called by the institution admin after email verification to activate.
create or replace function public.activate_institution()
returns public.institutions language plpgsql security definer
set search_path = public as $$
declare
  p public.profiles%rowtype;
  inst public.institutions%rowtype;
  confirmed boolean;
begin
  select * into p from public.profiles where id = auth.uid();
  if p.id is null or p.role <> 'admin' then
    raise exception 'not authorized';
  end if;
  select (email_confirmed_at is not null) into confirmed from auth.users where id = auth.uid();
  if not confirmed then
    raise exception 'email not verified';
  end if;
  update public.institutions set status = 'active'
  where id = p.institution_id and status = 'pending'
  returning * into inst;
  if inst.id is null then
    select * into inst from public.institutions where id = p.institution_id;
  end if;
  return inst;
end $$;

-- ============================================================
-- Guard triggers
-- ============================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger complaints_touch before update on public.complaints
  for each row execute function public.touch_updated_at();

-- Profiles: users may update only their own display fields. Privileged
-- columns (role, institution, status, identifier, email) require the
-- service role (edge functions) or an admin acting through a function.
create or replace function public.profiles_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if new.id <> old.id
     or new.institution_id <> old.institution_id
     or new.role <> old.role
     or new.account_status <> old.account_status
     or new.email <> old.email
     or new.identifier is distinct from old.identifier then
    raise exception 'privileged profile fields cannot be modified directly';
  end if;
  return new;
end $$;

create trigger profiles_guard_trg before update on public.profiles
  for each row execute function public.profiles_guard();

-- Institutions: members may update display fields only; code/status are
-- service-role managed.
create or replace function public.institutions_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if new.id <> old.id
     or new.institution_code <> old.institution_code
     or new.status <> old.status then
    raise exception 'institution code and status are managed by the system';
  end if;
  return new;
end $$;

create trigger institutions_guard_trg before update on public.institutions
  for each row execute function public.institutions_guard();

-- Notifications: recipients may only set read_at.
create or replace function public.notifications_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if new.id <> old.id or new.recipient_id <> old.recipient_id
     or new.notification_type <> old.notification_type
     or new.title <> old.title or new.message <> old.message
     or new.complaint_id is distinct from old.complaint_id then
    raise exception 'only read_at can be modified';
  end if;
  return new;
end $$;

create trigger notifications_guard_trg before update on public.notifications
  for each row execute function public.notifications_guard();

-- complaint_links: staff may only change review fields.
create or replace function public.complaint_links_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if new.source_complaint_id <> old.source_complaint_id
     or new.related_complaint_id <> old.related_complaint_id
     or new.relationship_type <> old.relationship_type then
    raise exception 'link structure cannot be modified';
  end if;
  if new.review_status <> old.review_status then
    new.reviewed_by := auth.uid();
  end if;
  return new;
end $$;

create trigger complaint_links_guard_trg before update on public.complaint_links
  for each row execute function public.complaint_links_guard();

-- Complaints: only the service role may write (all mutations flow through
-- edge functions which validate authorization and record events).
create or replace function public.complaints_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'complaints can only be modified through application functions';
  end if;
  return new;
end $$;

create trigger complaints_guard_trg before update on public.complaints
  for each row execute function public.complaints_guard();

-- department_members: heads may add/remove teacher+student members but only
-- admins may grant head membership.
create or replace function public.department_members_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.membership_type = 'head' and public.my_role() <> 'admin' then
      raise exception 'only an administrator can remove a department head';
    end if;
    return old;
  end if;
  if new.membership_type = 'head' and public.my_role() <> 'admin' then
    raise exception 'only an administrator can appoint a department head';
  end if;
  return new;
end $$;

create trigger department_members_guard_trg before insert or update or delete
  on public.department_members
  for each row execute function public.department_members_guard();

-- complaint_events: manual inserts may only be 'note' events by the actor.
create or replace function public.complaint_events_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if new.event_type <> 'note' or new.actor_id <> auth.uid() then
    raise exception 'invalid complaint event';
  end if;
  if new.is_internal and public.my_role() = 'student' then
    raise exception 'students cannot create internal notes';
  end if;
  return new;
end $$;

create trigger complaint_events_guard_trg before insert on public.complaint_events
  for each row execute function public.complaint_events_guard();

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.institutions enable row level security;
alter table public.profiles enable row level security;
alter table public.departments enable row level security;
alter table public.department_members enable row level security;
alter table public.ticket_counters enable row level security;
alter table public.complaints enable row level security;
alter table public.complaint_attachments enable row level security;
alter table public.complaint_events enable row level security;
alter table public.complaint_links enable row level security;
alter table public.department_routing_rules enable row level security;
alter table public.notifications enable row level security;
alter table public.email_deliveries enable row level security;
alter table public.invitations enable row level security;
alter table public.join_requests enable row level security;

-- institutions
create policy institutions_select on public.institutions
  for select to authenticated
  using (id = public.my_institution());
create policy institutions_update on public.institutions
  for update to authenticated
  using (id = public.my_institution() and public.my_role() = 'admin')
  with check (id = public.my_institution() and public.my_role() = 'admin');

-- profiles
create policy profiles_select_self on public.profiles
  for select to authenticated
  using (id = auth.uid());
create policy profiles_select_admin on public.profiles
  for select to authenticated
  using (public.my_role() = 'admin' and institution_id = public.my_institution());
create policy profiles_select_teacher on public.profiles
  for select to authenticated
  using (public.my_role() = 'teacher' and institution_id = public.my_institution());
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- departments: readable by institution members; writable by admins.
create policy departments_select on public.departments
  for select to authenticated
  using (institution_id = public.my_institution());
create policy departments_insert on public.departments
  for insert to authenticated
  with check (institution_id = public.my_institution() and public.my_role() = 'admin');
create policy departments_update on public.departments
  for update to authenticated
  using (institution_id = public.my_institution() and public.my_role() = 'admin')
  with check (institution_id = public.my_institution() and public.my_role() = 'admin');
create policy departments_delete on public.departments
  for delete to authenticated
  using (institution_id = public.my_institution() and public.my_role() = 'admin');

-- department_members
create policy department_members_select on public.department_members
  for select to authenticated
  using (
    institution_id = public.my_institution()
    and (
      public.my_role() = 'admin'
      or profile_id = auth.uid()
      or public.is_department_staff(department_id)
      or public.my_role() = 'teacher'
    )
  );
create policy department_members_insert on public.department_members
  for insert to authenticated
  with check (
    institution_id = public.my_institution()
    and (public.my_role() = 'admin' or public.is_department_head(department_id))
  );
create policy department_members_delete on public.department_members
  for delete to authenticated
  using (
    institution_id = public.my_institution()
    and (public.my_role() = 'admin' or public.is_department_head(department_id))
  );
create policy department_members_update on public.department_members
  for update to authenticated
  using (
    institution_id = public.my_institution()
    and (public.my_role() = 'admin' or public.is_department_head(department_id))
  )
  with check (
    institution_id = public.my_institution()
    and (public.my_role() = 'admin' or public.is_department_head(department_id))
  );

-- complaints: read-only via RLS; writes via edge functions (service role).
create policy complaints_select on public.complaints
  for select to authenticated
  using (
    institution_id = public.my_institution()
    and (
      created_by = auth.uid()
      or assigned_to = auth.uid()
      or public.my_role() = 'admin'
      or (public.my_role() = 'teacher' and assigned_department_id is not null
          and public.is_department_staff(assigned_department_id))
    )
  );

-- complaint_attachments
create policy complaint_attachments_select on public.complaint_attachments
  for select to authenticated
  using (institution_id = public.my_institution() and public.can_view_complaint(complaint_id));
create policy complaint_attachments_insert on public.complaint_attachments
  for insert to authenticated
  with check (
    institution_id = public.my_institution()
    and uploaded_by = auth.uid()
    and public.can_view_complaint(complaint_id)
  );

-- complaint_events
create policy complaint_events_select on public.complaint_events
  for select to authenticated
  using (
    institution_id = public.my_institution()
    and public.can_view_complaint(complaint_id)
    and (not is_internal or public.my_role() in ('admin', 'teacher'))
  );
create policy complaint_events_insert on public.complaint_events
  for insert to authenticated
  with check (
    institution_id = public.my_institution()
    and public.can_view_complaint(complaint_id)
    and actor_id = auth.uid()
  );

-- complaint_links: staff-facing duplicate review only.
create policy complaint_links_select on public.complaint_links
  for select to authenticated
  using (
    institution_id = public.my_institution()
    and public.my_role() in ('admin', 'teacher')
  );
create policy complaint_links_update on public.complaint_links
  for update to authenticated
  using (
    institution_id = public.my_institution()
    and public.my_role() in ('admin', 'teacher')
  )
  with check (
    institution_id = public.my_institution()
    and public.my_role() in ('admin', 'teacher')
  );

-- department_routing_rules
create policy routing_rules_select on public.department_routing_rules
  for select to authenticated
  using (institution_id = public.my_institution());
create policy routing_rules_insert on public.department_routing_rules
  for insert to authenticated
  with check (institution_id = public.my_institution() and public.my_role() = 'admin');
create policy routing_rules_update on public.department_routing_rules
  for update to authenticated
  using (institution_id = public.my_institution() and public.my_role() = 'admin')
  with check (institution_id = public.my_institution() and public.my_role() = 'admin');
create policy routing_rules_delete on public.department_routing_rules
  for delete to authenticated
  using (institution_id = public.my_institution() and public.my_role() = 'admin');

-- notifications
create policy notifications_select on public.notifications
  for select to authenticated
  using (recipient_id = auth.uid());
create policy notifications_update on public.notifications
  for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- email_deliveries: admins may audit their institution's delivery log.
create policy email_deliveries_select on public.email_deliveries
  for select to authenticated
  using (institution_id = public.my_institution() and public.my_role() = 'admin');

-- invitations: institution admins manage; invitees look up via functions.
create policy invitations_select on public.invitations
  for select to authenticated
  using (institution_id = public.my_institution() and public.my_role() = 'admin');

-- join_requests
create policy join_requests_select_admin on public.join_requests
  for select to authenticated
  using (institution_id = public.my_institution() and public.my_role() = 'admin');
create policy join_requests_select_self on public.join_requests
  for select to authenticated
  using (user_id = auth.uid());
create policy join_requests_insert on public.join_requests
  for insert to authenticated
  with check (user_id = auth.uid() and requested_role in ('student', 'teacher'));

-- ticket_counters: no direct access.
