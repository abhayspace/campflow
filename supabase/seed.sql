-- Development seed data (NOT for production).
-- Creates a demo institution + department structure. Auth users still need to
-- be created through the app or the Supabase dashboard — profiles reference
-- auth.users so they cannot be seeded meaningfully here.
--
-- Usage: supabase db reset  (runs migrations + seed on a local instance)

insert into public.institutions (name, institution_code, institution_type, official_email, address, status)
values ('Demo University', 'DEMO001', 'university', 'office@demo-university.edu', '1 Campus Way, Demo City', 'active')
on conflict (institution_code) do nothing;
