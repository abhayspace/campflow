-- Saved Gemini solution recommendations. One current suggestion per complaint.
-- Staff-only analysis lives in a separate table so students cannot read it.
-- Writes go through the ai-recommendation edge function (service role).

create table if not exists public.complaint_ai_recommendations (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  complaint_id uuid not null unique references public.complaints (id) on delete cascade,
  generated_by uuid references public.profiles (id),
  model_identifier text not null,
  problem_summary text not null,
  recommended_solution text not null,
  action_steps jsonb not null default '[]'::jsonb,
  suggested_department_id uuid references public.departments (id) on delete set null,
  suggested_department_name text,
  suggested_priority text,
  priority_reason text,
  effort_estimate text,
  missing_information jsonb not null default '[]'::jsonb,
  confidence_notes text not null,
  recommendation_status text not null default 'suggested'
    check (recommendation_status in ('suggested', 'accepted', 'modified', 'rejected')),
  modified_solution text,
  action_summary text,
  action_recorded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists complaint_ai_recommendations_institution_idx
  on public.complaint_ai_recommendations (institution_id, updated_at desc);

create trigger complaint_ai_recommendations_touch
  before update on public.complaint_ai_recommendations
  for each row execute function public.touch_updated_at();

create table if not exists public.complaint_ai_recommendation_staff (
  recommendation_id uuid primary key references public.complaint_ai_recommendations (id) on delete cascade,
  institution_id uuid not null references public.institutions (id) on delete cascade,
  complaint_id uuid not null references public.complaints (id) on delete cascade,
  hypotheses jsonb not null default '[]'::jsonb,
  investigation_steps jsonb not null default '[]'::jsonb,
  related_complaints jsonb not null default '[]'::jsonb,
  prior_resolutions jsonb not null default '[]'::jsonb,
  recurring_notes text,
  escalation_notes text
);

create table if not exists public.complaint_ai_recommendation_events (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  complaint_id uuid not null references public.complaints (id) on delete cascade,
  recommendation_id uuid not null references public.complaint_ai_recommendations (id) on delete cascade,
  actor_id uuid not null references public.profiles (id),
  event_type text not null check (event_type in (
    'generated', 'regenerated', 'accepted', 'modified', 'rejected', 'action_taken'
  )),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists complaint_ai_recommendation_events_complaint_idx
  on public.complaint_ai_recommendation_events (complaint_id, created_at);

alter table public.complaint_ai_recommendations enable row level security;
alter table public.complaint_ai_recommendation_staff enable row level security;
alter table public.complaint_ai_recommendation_events enable row level security;

create policy complaint_ai_recommendations_select on public.complaint_ai_recommendations
  for select to authenticated
  using (
    institution_id = public.my_institution()
    and public.can_view_complaint(complaint_id)
  );

create policy complaint_ai_recommendation_staff_select on public.complaint_ai_recommendation_staff
  for select to authenticated
  using (
    institution_id = public.my_institution()
    and public.can_view_complaint(complaint_id)
    and (
      public.my_role() = 'admin'
      or exists (
        select 1 from public.complaints c
        where c.id = complaint_ai_recommendation_staff.complaint_id
          and (
            c.assigned_to = auth.uid()
            or (
              c.assigned_department_id is not null
              and public.is_department_staff(c.assigned_department_id)
            )
          )
      )
    )
  );

create policy complaint_ai_recommendation_events_select on public.complaint_ai_recommendation_events
  for select to authenticated
  using (
    institution_id = public.my_institution()
    and public.can_view_complaint(complaint_id)
    and (
      event_type in ('generated', 'regenerated', 'accepted', 'modified', 'action_taken')
      or public.my_role() = 'admin'
      or exists (
        select 1 from public.complaints c
        where c.id = complaint_ai_recommendation_events.complaint_id
          and (
            c.assigned_to = auth.uid()
            or (
              c.assigned_department_id is not null
              and public.is_department_staff(c.assigned_department_id)
            )
          )
      )
    )
  );

grant select on public.complaint_ai_recommendations to authenticated;
grant select on public.complaint_ai_recommendation_staff to authenticated;
grant select on public.complaint_ai_recommendation_events to authenticated;
