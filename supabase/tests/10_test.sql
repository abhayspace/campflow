-- Campflow RLS + workflow test script (run with psql -d cc_test -f 10_test.sql)
\set ON_ERROR_STOP on

begin;

-- ── fixture data (as service_role / superuser) ──────────────────────────────
insert into auth.users (id, email, email_confirmed_at) values
  ('a0000000-0000-0000-0000-000000000001', 'adminA@x.edu', now()),
  ('a0000000-0000-0000-0000-000000000002', 'teacherA@x.edu', now()),
  ('a0000000-0000-0000-0000-000000000003', 'studentA@x.edu', now()),
  ('a0000000-0000-0000-0000-000000000004', 'studentA2@x.edu', now()),
  ('b0000000-0000-0000-0000-000000000001', 'adminB@y.edu', now());

insert into public.institutions (id, name, institution_code, institution_type, official_email, address, status) values
  ('10000000-0000-0000-0000-000000000001', 'Alpha University', 'ALPHA01', 'university', 'office@alpha.edu', '1 Alpha Way', 'active'),
  ('20000000-0000-0000-0000-000000000002', 'Beta College', 'BETA001', 'college', 'office@beta.edu', '2 Beta Blvd', 'active');

insert into public.profiles (id, institution_id, full_name, email, role, identifier, account_status) values
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Admin A', 'adminA@x.edu', 'admin', null, 'active'),
  ('a0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Teacher A', 'teacherA@x.edu', 'teacher', 'STF-1', 'active'),
  ('a0000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Student A', 'studentA@x.edu', 'student', 'STU-1', 'active'),
  ('a0000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'Student A2', 'studentA2@x.edu', 'student', 'STU-2', 'active'),
  ('b0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'Admin B', 'adminB@y.edu', 'admin', null, 'active');

insert into public.departments (id, institution_id, name, description, department_head_id) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Maintenance', 'Facilities', 'a0000000-0000-0000-0000-000000000002');

insert into public.department_members (institution_id, department_id, profile_id, membership_type) values
  ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'head'),
  ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'student');

insert into public.department_routing_rules (institution_id, category, department_id) values
  ('10000000-0000-0000-0000-000000000001', 'plumbing', '30000000-0000-0000-0000-000000000001');

reset role; select set_config('app.role','service_role',false);
insert into public.complaints (id, institution_id, ticket_number, idempotency_key, created_by, title, description, location, category, status, assigned_department_id) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'CC-ALPHA01-00001', '50000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'Leaking pipe', 'Water dripping under sink', 'Block B washroom', 'plumbing', 'assigned', '30000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'CC-ALPHA01-00002', '50000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000004', 'Broken light', 'Tube light flickering', 'Library 3rd floor', 'electricity', 'new', null);
commit;

-- ══ TEST 1: student sees only own complaints ════════════════════════════════
reset role; set role authenticated; select set_config('app.role','authenticated',false);
select set_config('app.user_id', 'a0000000-0000-0000-0000-000000000003', false);
select 'T1 student sees own ticket' as test,
       count(*) = 1 as pass
  from public.complaints;  -- only their own

-- ══ TEST 2: student cannot see other students' complaints ═══════════════════
select 'T2 student cannot see A2 ticket' as test,
       not exists (select 1 from public.complaints where id = '40000000-0000-0000-0000-000000000002') as pass;

-- ══ TEST 3: student cannot write complaints directly ════════════════════════
do $$
declare blocked boolean := false;
begin
  begin
    insert into public.complaints (institution_id, ticket_number, created_by, title, description, location, category)
    values ('10000000-0000-0000-0000-000000000001', 'CC-X-1', 'a0000000-0000-0000-0000-000000000003', 't', 'dddddddddd', 'loc', 'plumbing');
  exception when insufficient_privilege or raise_exception then blocked := true;
  end;
  raise notice 'T3 student direct insert blocked: %', blocked;
end $$;

-- ══ TEST 4: student cannot update complaint status ══════════════════════════
do $$
declare blocked boolean := false;
begin
  begin
    update public.complaints set status = 'resolved' where id = '40000000-0000-0000-0000-000000000001';
    -- RLS hides rows anyway; also trigger guard should fire for service_role check
  exception when raise_exception or insufficient_privilege then blocked := true;
  end;
  raise notice 'T4 student direct update blocked-or-noop: %', blocked
    or not exists (select 1 from public.complaints where id = '40000000-0000-0000-0000-000000000001' and status = 'resolved');
end $$;

-- ══ TEST 5: student cannot self-promote ═════════════════════════════════════
select 'T5 self role change blocked' as test, true as attempted;
do $$
declare blocked boolean := false;
begin
  begin
    update public.profiles set role = 'admin' where id = 'a0000000-0000-0000-0000-000000000003';
  exception when raise_exception then blocked := true; end;
  raise notice 'T5 result: %', blocked;
end $$;

-- ══ TEST 6: student cannot read other profiles ══════════════════════════════
select 'T6 student sees only own profile' as test,
       count(*) = 1 as pass
  from public.profiles;

-- ══ TEST 7: teacher sees dept complaint + own assigned, not unrelated ═══════
select set_config('app.user_id', 'a0000000-0000-0000-0000-000000000002', false);
select 'T7 teacher sees dept complaint' as test,
       exists (select 1 from public.complaints where id = '40000000-0000-0000-0000-000000000001') as pass;
select 'T7b teacher does NOT see unrelated new complaint' as test,
       not exists (select 1 from public.complaints where id = '40000000-0000-0000-0000-000000000002') as pass;

-- ══ TEST 8: teacher sees institution profiles ═══════════════════════════════
select 'T8 teacher sees institution profiles' as test,
       count(*) >= 4 as pass from public.profiles;

-- ══ TEST 9: head can add a member; cannot appoint another head ══════════════
do $$
declare add_ok boolean := false; head_blocked boolean := false;
begin
  begin
    insert into public.department_members (institution_id, department_id, profile_id, membership_type)
    values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'student');
    add_ok := true;
  exception when raise_exception or insufficient_privilege then null; end;
  begin
    insert into public.department_members (institution_id, department_id, profile_id, membership_type)
    values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'head');
  exception when raise_exception or insufficient_privilege then head_blocked := true; end;
  raise notice 'T9 head added student member: %, head appoint blocked: %', add_ok, head_blocked;
  delete from public.department_members
   where department_id = '30000000-0000-0000-0000-000000000001'
     and profile_id = 'a0000000-0000-0000-0000-000000000004';
end $$;

-- ══ TEST 10: admin sees all institution complaints + profiles ═══════════════
select set_config('app.user_id', 'a0000000-0000-0000-0000-000000000001', false);
select 'T10 admin sees all inst complaints' as test,
       count(*) = 2 as pass from public.complaints;
select 'T10b admin sees all inst profiles' as test,
       count(*) = 4 as pass from public.profiles;

-- ══ TEST 11: cross-institution isolation ════════════════════════════════════
select set_config('app.user_id', 'b0000000-0000-0000-0000-000000000001', false);
select 'T11 adminB sees zero Alpha complaints' as test,
       count(*) = 0 as pass from public.complaints;
select 'T11b adminB sees only Beta profiles' as test,
       count(*) = 1 as pass from public.profiles;
select 'T11c adminB sees only Beta institution' as test,
       count(*) = 1 as pass from public.institutions;

-- ══ TEST 12: ticket counter + similar complaints functions ══════════════════
reset role; select set_config('app.role','service_role',false);
select 'T12 ticket number' as test,
       public.next_ticket_number('10000000-0000-0000-0000-000000000001') = 'CC-ALPHA01-00001' as pass;

insert into public.complaints (institution_id, ticket_number, created_by, title, description, location, category)
values ('10000000-0000-0000-0000-000000000001', 'CC-ALPHA01-00004', 'a0000000-0000-0000-0000-000000000004',
        'Leaking pipe washroom', 'Pipe leaking under the sink again', 'Block B washroom', 'plumbing');
select 'T12b similar complaints found' as test,
       exists (select 1 from public.find_similar_complaints(
         (select id from public.complaints where ticket_number = 'CC-ALPHA01-00004'), 5)) as pass;

-- ══ TEST 13: student blocked from similarity RPC ════════════════════════════
reset role; set role authenticated; select set_config('app.role','authenticated',false);
select set_config('app.user_id', 'a0000000-0000-0000-0000-000000000003', false);
select 'T13 student similarity RPC returns nothing' as test,
       not exists (select 1 from public.find_similar_complaints('40000000-0000-0000-0000-000000000001', 5)) as pass;

-- ══ TEST 14: notifications — recipient only + read_at guard ═════════════════
reset role; select set_config('app.role','service_role',false);
insert into public.notifications (institution_id, recipient_id, complaint_id, notification_type, title, message)
values ('10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001', 'test', 'Hi', 'msg');

reset role; set role authenticated; select set_config('app.role','authenticated',false);
select set_config('app.user_id', 'a0000000-0000-0000-0000-000000000003', false);
select 'T14 recipient reads own notification' as test,
       count(*) = 1 as pass from public.notifications;
update public.notifications set read_at = now() where recipient_id = 'a0000000-0000-0000-0000-000000000003';
do $$
declare blocked boolean := false;
begin
  begin
    update public.notifications set title = 'hax' where recipient_id = 'a0000000-0000-0000-0000-000000000003';
  exception when raise_exception then blocked := true; end;
  raise notice 'T14b title tamper blocked: %', blocked;
end $$;

select set_config('app.user_id', 'a0000000-0000-0000-0000-000000000004', false);
select 'T14c other user sees no notifications' as test,
       count(*) = 0 as pass from public.notifications;

-- ══ TEST 15: membership validation rejects role mismatch ════════════════════
reset role; select set_config('app.role','service_role',false);
do $$
declare blocked boolean := false;
begin
  begin
    insert into public.department_members (institution_id, department_id, profile_id, membership_type)
    values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'teacher');
  exception when raise_exception then blocked := true; end;
  raise notice 'T15 student-as-teacher member blocked: %', blocked;
end $$;

select 'done' as status;
