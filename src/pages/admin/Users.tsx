import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { supabase } from '../../lib/supabase';
import { callFunction } from '../../lib/api';
import type { Department, Invitation, Profile } from '../../lib/types';
import {
  Badge, Button, Card, CardBody, CardHeader, EmptyState, Field,
  Input, Modal, PageHeader, Select, TableSkeleton, Textarea,
} from '../../components/ui';
import { cx, errorMessage, formatDate } from '../../lib/utils';

const PAGE_SIZE = 12;

export default function AdminUsers() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<'members' | 'invitations'>('members');
  const [users, setUsers] = useState<Profile[] | null>(null);
  const [invitations, setInvitations] = useState<Invitation[] | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [editUser, setEditUser] = useState<Profile | null>(null);

  const load = useCallback(async () => {
    const [{ data: u }, { data: i }, { data: d }] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('invitations').select('*').order('created_at', { ascending: false }),
      supabase.from('departments').select('*').eq('is_active', true).order('name'),
    ]);
    setUsers(u ?? []);
    setInvitations(i ?? []);
    setDepartments(d ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    let list = users ?? [];
    if (roleFilter) list = list.filter((u) => u.role === roleFilter);
    if (statusFilter) list = list.filter((u) => u.account_status === statusFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (u) => u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.identifier ?? '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [users, query, roleFilter, statusFilter]);

  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const pageCount = Math.ceil(filtered.length / PAGE_SIZE);

  const setStatus = async (u: Profile, status: 'active' | 'deactivated') => {
    try {
      await callFunction('admin-manage-users', { action: 'set_status', user_id: u.id, status });
      toast(`${u.full_name} ${status === 'active' ? 'reactivated' : 'deactivated'}`, 'success');
      await load();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  const resend = async (inv: Invitation) => {
    try {
      await callFunction('admin-manage-users', { action: 'resend_invite', invitation_id: inv.id });
      toast(`Invitation resent to ${inv.email}`, 'success');
      await load();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  if (!users || !invitations) return <TableSkeleton />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        subtitle="Manage students, staff, and pending invitations."
        actions={<Button onClick={() => setInviteOpen(true)}>Invite users</Button>}
      />

      <div className="flex gap-1 rounded-full bg-slate-100 p-1 w-fit">
        {(['members', 'invitations'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cx('rounded-full px-4 py-1.5 text-sm font-semibold capitalize',
              tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500')}>
            {t} {t === 'invitations' && invitations.filter((i) => i.status === 'sent' || i.status === 'pending').length > 0 &&
              `(${invitations.filter((i) => i.status === 'sent' || i.status === 'pending').length})`}
          </button>
        ))}
      </div>

      {tab === 'members' ? (
        <Card>
          <CardBody className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <div className="min-w-52 flex-1">
                <Input placeholder="Search name, email, or ID…" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} />
              </div>
              <Select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(0); }} className="w-36">
                <option value="">All roles</option>
                <option value="student">Students</option>
                <option value="teacher">Teachers</option>
                <option value="admin">Admins</option>
              </Select>
              <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }} className="w-36">
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="deactivated">Deactivated</option>
              </Select>
            </div>

            {paged.length === 0 ? (
              <EmptyState title="No users found" message="Invite students and staff to get started." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="pb-2 pr-4 font-medium">Name</th>
                      <th className="pb-2 pr-4 font-medium">Email</th>
                      <th className="pb-2 pr-4 font-medium">Role</th>
                      <th className="pb-2 pr-4 font-medium">ID</th>
                      <th className="pb-2 pr-4 font-medium">Status</th>
                      <th className="pb-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {paged.map((u) => (
                      <tr key={u.id}>
                        <td className="py-3 pr-4 font-medium text-slate-800">{u.full_name}</td>
                        <td className="py-3 pr-4 text-slate-600">{u.email}</td>
                        <td className="py-3 pr-4 capitalize text-slate-600">{u.role}</td>
                        <td className="py-3 pr-4 text-slate-500">{u.identifier ?? '—'}</td>
                        <td className="py-3 pr-4">
                          <Badge className={u.account_status === 'active'
                            ? 'bg-emerald-100 text-emerald-700 ring-emerald-200'
                            : 'bg-slate-100 text-slate-500 ring-slate-200'}>
                            {u.account_status}
                          </Badge>
                        </td>
                        <td className="py-3">
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" onClick={() => setEditUser(u)}>Edit</Button>
                            {u.id !== user?.id && u.account_status === 'active' && (
                              <Button size="sm" variant="ghost" className="text-red-600"
                                onClick={() => setStatus(u, 'deactivated')}>Deactivate</Button>
                            )}
                            {u.id !== user?.id && u.account_status === 'deactivated' && (
                              <Button size="sm" variant="ghost" className="text-emerald-600"
                                onClick={() => setStatus(u, 'active')}>Reactivate</Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {pageCount > 1 && (
              <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-sm text-slate-500">
                <span>{filtered.length} users</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
                  <span className="self-center text-xs">Page {page + 1} of {pageCount}</span>
                  <Button size="sm" variant="secondary" disabled={page >= pageCount - 1} onClick={() => setPage(page + 1)}>Next</Button>
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardHeader title="Invitations" subtitle="People who have been invited but not yet activated." />
          <CardBody>
            {invitations.length === 0 ? (
              <EmptyState title="No invitations" message="Invite users from the button above." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="pb-2 pr-4 font-medium">Name</th>
                      <th className="pb-2 pr-4 font-medium">Email</th>
                      <th className="pb-2 pr-4 font-medium">Role</th>
                      <th className="pb-2 pr-4 font-medium">Status</th>
                      <th className="pb-2 pr-4 font-medium">Expires</th>
                      <th className="pb-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {invitations.map((i) => (
                      <tr key={i.id}>
                        <td className="py-3 pr-4 font-medium text-slate-800">{i.full_name}</td>
                        <td className="py-3 pr-4 text-slate-600">{i.email}</td>
                        <td className="py-3 pr-4 capitalize text-slate-600">{i.role}</td>
                        <td className="py-3 pr-4">
                          <Badge className={i.status === 'accepted'
                            ? 'bg-emerald-100 text-emerald-700 ring-emerald-200'
                            : i.status === 'expired'
                              ? 'bg-red-100 text-red-700 ring-red-200'
                              : 'bg-amber-100 text-amber-700 ring-amber-200'}>
                            {i.status}
                          </Badge>
                        </td>
                        <td className="py-3 pr-4 text-slate-500">{formatDate(i.expires_at)}</td>
                        <td className="py-3">
                          {i.status !== 'accepted' && (
                            <Button size="sm" variant="ghost" onClick={() => resend(i)}>Resend</Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} departments={departments} onDone={load} />
      <EditUserModal user={editUser} onClose={() => setEditUser(null)} onDone={load} />
    </div>
  );
}

/* ------------------------------ Invite modal ----------------------------- */
function InviteModal({ open, onClose, departments, onDone }: {
  open: boolean; onClose: () => void; departments: Department[]; onDone: () => void;
}) {
  const { toast } = useToast();
  const [mode, setMode] = useState<'single' | 'csv'>('single');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'student' | 'teacher'>('student');
  const [identifier, setIdentifier] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [csv, setCsv] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<{ email: string; status: string; error?: string }[] | null>(null);

  const parseCsv = () => {
    // Format: full_name,email,role[,identifier] — one per line, header optional.
    return csv
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((l) => !/^full_name|^name\s*,/i.test(l))
      .map((l) => {
        const [full_name, email, role = 'student', identifier] = l.split(',').map((s) => s.trim());
        return { full_name, email, role, identifier: identifier || null };
      });
  };

  const send = async () => {
    setBusy(true);
    setResults(null);
    try {
      const users = mode === 'single'
        ? [{ full_name: fullName, email, role, identifier: identifier || null, department_id: departmentId || null }]
        : parseCsv();
      if (!users.length) throw new Error('Nothing to invite');
      const res = await callFunction<{ results: { email: string; status: string; error?: string }[] }>(
        'invite-users', { users },
      );
      setResults(res.results);
      const ok = res.results.filter((r) => r.status === 'sent').length;
      toast(`${ok} invitation${ok === 1 ? '' : 's'} sent`, ok ? 'success' : 'error');
      onDone();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setResults(null); setFullName(''); setEmail(''); setIdentifier(''); setCsv(''); setDepartmentId('');
  };

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="Invite users" wide>
      <div className="space-y-4">
        <div className="flex gap-1 rounded-full bg-slate-100 p-1 w-fit">
          {(['single', 'csv'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={cx('rounded-full px-4 py-1.5 text-sm font-semibold',
                mode === m ? 'bg-white shadow-sm' : 'text-slate-500')}>
              {m === 'single' ? 'Single invite' : 'CSV import'}
            </button>
          ))}
        </div>

        {mode === 'single' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" required><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field>
            <Field label="Email" required><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label="Role" required>
              <Select value={role} onChange={(e) => setRole(e.target.value as 'student' | 'teacher')}>
                <option value="student">Student</option>
                <option value="teacher">Teacher / Staff</option>
              </Select>
            </Field>
            <Field label={role === 'student' ? 'Student ID' : 'Staff ID'}><Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} /></Field>
            <Field label="Department (optional)">
              <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                <option value="">None</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            </Field>
          </div>
        ) : (
          <Field label="CSV rows" required hint="One per line: full_name,email,role[,identifier]. Role = student or teacher.">
            <Textarea rows={8} className="font-mono text-xs" value={csv} onChange={(e) => setCsv(e.target.value)}
              placeholder={'Asha Verma,asha@uni.edu,student,STU-101\nRavi Kulkarni,ravi@uni.edu,teacher,STF-07'} />
          </Field>
        )}

        {results && (
          <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 text-xs">
            {results.map((r, i) => (
              <div key={i} className={cx('flex justify-between border-b border-slate-100 px-3 py-1.5 last:border-0',
                r.status === 'sent' ? 'text-emerald-700' : 'text-red-600')}>
                <span>{r.email}</span>
                <span>{r.status === 'sent' ? 'sent' : r.error ?? 'failed'}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => { reset(); onClose(); }}>Close</Button>
          <Button loading={busy} onClick={send}>Send invitations</Button>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------ Edit modal ------------------------------- */
function EditUserModal({ user, onClose, onDone }: {
  user: Profile | null; onClose: () => void; onDone: () => void;
}) {
  const { toast } = useToast();
  const [fullName, setFullName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setFullName(user?.full_name ?? '');
    setIdentifier(user?.identifier ?? '');
  }, [user]);

  if (!user) return null;

  const save = async () => {
    setBusy(true);
    try {
      await callFunction('admin-manage-users', {
        action: 'update_profile', user_id: user.id, full_name: fullName, identifier: identifier || null,
      });
      toast('User updated', 'success');
      onDone();
      onClose();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={!!user} onClose={onClose} title={`Edit ${user.full_name}`}>
      <div className="space-y-4">
        <Field label="Full name" required><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field>
        <Field label={user.role === 'student' ? 'Student ID' : 'Staff ID'}>
          <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
        </Field>
        <p className="text-xs text-slate-400">
          Role and institution are fixed at invitation time and can't be changed here.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={busy} onClick={save}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}
