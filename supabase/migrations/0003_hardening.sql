-- Hardening: restrict direct RPC access to sensitive functions.
-- Postgres grants EXECUTE to PUBLIC by default; tighten that here.

-- Similarity search is staff-facing only (edge functions run as service_role).
create or replace function public.find_similar_complaints(p_complaint uuid, p_limit int default 5)
returns table (id uuid, ticket_number text, title text, status public.complaint_status,
               similarity numeric, created_at timestamptz)
language sql stable security definer
set search_path = public as $$
  select c.id, c.ticket_number, c.title, c.status,
         round(similarity(c.title || ' ' || c.description || ' ' || c.location, src.hay)::numeric, 3) as similarity,
         c.created_at
  from public.complaints c,
       (select c2.*, (c2.title || ' ' || c2.description || ' ' || c2.location) as hay
        from public.complaints c2 where c2.id = p_complaint) src
  where c.institution_id = src.institution_id
    and c.id <> src.id
    and c.created_at > now() - interval '90 days'
    and (
      similarity(c.title || ' ' || c.description || ' ' || c.location, src.hay) > 0.22
      or (c.category = src.category and c.location <> '' and src.location <> ''
          and similarity(c.location, src.location) > 0.3)
    )
    -- Only staff (or the service role) may enumerate similar tickets.
    and (auth.role() = 'service_role' or public.my_role() in ('admin', 'teacher'))
  order by similarity desc
  limit p_limit
$$;

-- Ticket counter allocation is internal to edge functions.
revoke execute on function public.next_ticket_number(uuid) from public, anon, authenticated;
grant execute on function public.next_ticket_number(uuid) to service_role;

-- Institution code lookup: usable by authenticated users (join flow runs via
-- edge functions anyway) but not anonymous callers.
revoke execute on function public.institution_by_code(text) from public, anon;
grant execute on function public.institution_by_code(text) to authenticated, service_role;

-- Similarity search: keep for staff + service role.
revoke execute on function public.find_similar_complaints(uuid, int) from public, anon;
grant execute on function public.find_similar_complaints(uuid, int) to authenticated, service_role;
