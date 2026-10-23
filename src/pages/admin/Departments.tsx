import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { supabase } from '../../lib/supabase';
import type { Department, DepartmentMember, MembershipType, Profile } from '../../lib/types';
import {
  Badge, Button, Card, CardBody, EmptyState, Field, Input,
  Modal, PageHeader, Select, TableSkeleton, Textarea,
} from '../../components/ui';
import { errorMessage } from '../../lib/utils';

export default function AdminDepartments() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [departments, setDepartments] = useState<Department[] | null>(null);
  const [members, setMembers] = useState<DepartmentMember[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [editDept, setEditDept] = useState<Department | 'new' | null>(null);
  const [membersDept, setMembersDept] = useState<Department | null>(null);

  const load = useCallback(async () => {
    const [{ data: d }, { data: m }, { data: p }] = await Promise.all([
      supabase.from('departments').select('*, head:profiles!departments_department_head_id_fkey(full_name)').order('name'),
      supabase.from('department_members').select('*, profile:profiles(full_name, email, role, account_status)'),
      supabase.from('profiles').select('*').eq('account_status', 'active').order('full_name'),
    ]);
    setDepartments((d ?? []) as unknown as Department[]);
    setMembers((m ?? []) as unknown as DepartmentMember[]);
    setPeople(p ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleActive = async (d: Department) => {
    const { error } = await supabase.from('departments').update({ is_active: !d.is_active }).eq('id', d.id);
    if (error) toast(error.message, 'error');
    else {
      toast(`${d.name} ${d.is_active ? 'deactivated' : 'activated'}`, 'success');
      await load();
    }
  };

  if (!departments) return <TableSkeleton />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Departments"
        subtitle="Create departments, appoint heads, and manage membership."
        actions={<Button onClick={() => setEditDept('new')}>New department</Button>}
      />

      {departments.length === 0 ? (
        <Card><CardBody>
          <EmptyState title="No departments yet" message="Create a department to start routing complaints."
            action={<Button size="sm" onClick={() => setEditDept('new')}>Create department</Button>} />
        </CardBody></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {departments.map((d) => {
            const deptMembers = members.filter((m) => m.department_id === d.id);
            const staff = deptMembers.filter((m) => m.membership_type !== 'student');
            const students = deptMembers.filter((m) => m.membership_type === 'student');
            return (
              <Card key={d.id} className={!d.is_active ? 'opacity-60' : ''}>
                <CardBody className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-slate-900">{d.name}</h3>
                      {d.description && <p className="mt-0.5 text-xs text-slate-500">{d.description}</p>}
                    </div>
                    {!d.is_active && <Badge className="bg-slate-100 text-slate-500 ring-slate-200">inactive</Badge>}
                  </div>
                  <p className="text-sm text-slate-600">
                    Head: <span className="font-medium">{(d as unknown as { head?: { full_name: string } }).head?.full_name ?? '—'}</span>
                  </p>
                  <div className="flex gap-4 text-xs text-slate-500">
                    <span>{staff.length} staff</span>
                    <span>{students.length} students</span>
                  </div>
                  <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                    <Button size="sm" variant="secondary" onClick={() => setEditDept(d)}>Edit</Button>
                    <Button size="sm" variant="secondary" onClick={() => setMembersDept(d)}>Members</Button>
                    <Button size="sm" variant="ghost" className={d.is_active ? 'text-red-600' : 'text-emerald-600'}
                      onClick={() => toggleActive(d)}>
                      {d.is_active ? 'Deactivate' : 'Activate'}
                    </Button>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      <DeptFormModal dept={editDept} people={people} onClose={() => setEditDept(null)} onDone={load} />
      <MembersModal dept={membersDept} members={members} people={people} onClose={() => setMembersDept(null)} onDone={load} />
      {!profile && null}
    </div>
  );
}

function DeptFormModal({ dept, people, onClose, onDone }: {
  dept: Department | 'new' | null;
  people: Profile[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const isNew = dept === 'new';
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [headId, setHeadId] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (dept && dept !== 'new') {
      setName(dept.name);
      setDescription(dept.description);
      setHeadId(dept.department_head_id ?? '');
    } else {
      setName(''); setDescription(''); setHeadId('');
    }
  }, [dept]);

  if (!dept) return null;
  const teachers = people.filter((p) => p.role === 'teacher');

  const save = async () => {
    if (name.trim().length < 2) return toast('Name is required', 'error');
    setBusy(true);
    try {
      if (isNew) {
        const { error } = await supabase.from('departments').insert({
          institution_id: profile!.institution_id,
          name: name.trim(),
          description: description.trim(),
          department_head_id: headId || null,
        });
        if (error) throw error;
        if (headId) {
          // ensure the head also holds a 'head' membership row
          const { data: newDept } = await supabase.from('departments').select('id').eq('name', name.trim()).single();
          if (newDept) {
            await supabase.from('department_members').upsert({
              institution_id: profile!.institution_id,
              department_id: newDept.id,
              profile_id: headId,
              membership_type: 'head',
            }, { onConflict: 'department_id,profile_id' });
          }
        }
      } else {
        const { error } = await supabase.from('departments').update({
          name: name.trim(),
          description: description.trim(),
          department_head_id: headId || null,
        }).eq('id', dept.id);
        if (error) throw error;
        // Demote any previous head membership, then record the new head.
        await supabase
          .from('department_members')
          .update({ membership_type: 'teacher' })
          .eq('department_id', dept.id)
          .eq('membership_type', 'head')
          .neq('profile_id', headId || '');
        if (headId) {
          await supabase.from('department_members').upsert({
            institution_id: profile!.institution_id,
            department_id: dept.id,
            profile_id: headId,
            membership_type: 'head',
          }, { onConflict: 'department_id,profile_id' });
        }
      }
      toast(isNew ? 'Department created' : 'Department updated', 'success');
      onDone();
      onClose();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={!!dept} onClose={onClose} title={isNew ? 'New department' : `Edit ${name}`}>
      <div className="space-y-4">
        <Field label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Facilities & Maintenance" /></Field>
        <Field label="Description"><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <Field label="Department head" hint="Must be an active staff member.">
          <Select value={headId} onChange={(e) => setHeadId(e.target.value)}>
            <option value="">None</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
          </Select>
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={busy} onClick={save}>{isNew ? 'Create' : 'Save'}</Button>
        </div>
      </div>
    </Modal>
  );
}

function MembersModal({ dept, members, people, onClose, onDone }: {
  dept: Department | null;
  members: DepartmentMember[];
  people: Profile[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [addId, setAddId] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => setAddId(''), [dept]);
  if (!dept) return null;

  const deptMembers = members.filter((m) => m.department_id === dept.id);
  const memberIds = new Set(deptMembers.map((m) => m.profile_id));
  const candidates = people.filter((p) => !memberIds.has(p.id) && p.role !== 'admin');

  const add = async () => {
    const p = people.find((x) => x.id === addId);
    if (!p) return;
    setBusy(true);
    const type: MembershipType = p.role === 'student' ? 'student' : 'teacher';
    const { error } = await supabase.from('department_members').insert({
      institution_id: profile!.institution_id,
      department_id: dept.id,
      profile_id: p.id,
      membership_type: type,
    });
    setBusy(false);
    if (error) toast(errorMessage(error), 'error');
    else {
      toast(`${p.full_name} added`, 'success');
      setAddId('');
      onDone();
    }
  };

  const remove = async (m: DepartmentMember) => {
    const { error } = await supabase.from('department_members').delete().eq('id', m.id);
    if (error) toast(errorMessage(error), 'error');
    else {
      toast('Member removed', 'success');
      onDone();
    }
  };

  return (
    <Modal open={!!dept} onClose={onClose} title={`Members — ${dept.name}`} wide>
      <div className="space-y-4">
        <div className="flex gap-2">
          <Select value={addId} onChange={(e) => setAddId(e.target.value)} className="flex-1">
            <option value="">Add a person…</option>
            {candidates.map((p) => (
              <option key={p.id} value={p.id}>{p.full_name} ({p.role})</option>
            ))}
          </Select>
          <Button onClick={add} loading={busy} disabled={!addId}>Add</Button>
        </div>

        <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
          {deptMembers.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-slate-400">No members yet.</p>
          )}
          {deptMembers.map((m) => (
            <div key={m.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <div>
                <span className="font-medium text-slate-800">{m.profile?.full_name}</span>
                <span className="ml-2 text-xs text-slate-400">{m.profile?.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={m.membership_type === 'head'
                  ? 'bg-brand-100 text-brand-800 ring-brand-200'
                  : 'bg-slate-100 text-slate-600 ring-slate-200'}>
                  {m.membership_type}
                </Badge>
                <Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove(m)}>Remove</Button>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400">
          Only teachers can hold staff membership; students get student membership. Heads are appointed from the
          department edit dialog.
        </p>
      </div>
    </Modal>
  );
}
