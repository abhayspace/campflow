-- activate_institution must accept the user id explicitly: edge functions call
-- RPCs with the service-role key, so auth.uid() is null inside the function.
create or replace function public.activate_institution(p_user uuid)
returns public.institutions language plpgsql security definer
set search_path = public as $$
declare
  p public.profiles%rowtype;
  inst public.institutions%rowtype;
  confirmed boolean;
begin
  -- Callable by the service role (edge functions) or the user themself.
  if auth.role() <> 'service_role' and auth.uid() <> p_user then
    raise exception 'not authorized';
  end if;

  select * into p from public.profiles where id = p_user;
  if p.id is null or p.role <> 'admin' then
    raise exception 'not authorized';
  end if;
  select (email_confirmed_at is not null) into confirmed from auth.users where id = p_user;
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

revoke execute on function public.activate_institution(uuid) from public, anon;
grant execute on function public.activate_institution(uuid) to authenticated, service_role;
