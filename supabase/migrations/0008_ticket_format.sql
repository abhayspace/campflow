-- Shorter ticket numbers: CF-00001 instead of CC-DEMO001-00001.
-- Numbering stays per-institution; existing ticket numbers are unchanged.
create or replace function public.next_ticket_number(p_institution uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  n bigint;
begin
  insert into public.ticket_counters (institution_id, last_number)
  values (p_institution, 1)
  on conflict (institution_id)
  do update set last_number = ticket_counters.last_number + 1
  returning last_number into n;
  return 'CF-' || lpad(n::text, 5, '0');
end $$;

-- Ticket numbers are per-institution, so uniqueness is per institution too.
alter table public.complaints drop constraint if exists complaints_ticket_number_key;
alter table public.complaints
  add constraint complaints_institution_ticket_number_key unique (institution_id, ticket_number);

-- Renumber existing tickets: CC-<CODE>-NNNNN -> CF-NNNNN.
update public.complaints
set ticket_number = 'CF-' || split_part(ticket_number, '-', 3)
where ticket_number ~ '^CC-[A-Z0-9]+-[0-9]+$';
