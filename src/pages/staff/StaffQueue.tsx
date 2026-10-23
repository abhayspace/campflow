import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import type { Complaint } from '../../lib/types';
import { CATEGORIES, PRIORITY_LABELS, STATUS_LABELS } from '../../lib/types';
import { Card, CardBody, EmptyState, FilterBar, Input, PageHeader, Select, TableSkeleton } from '../../components/ui';
import { ComplaintRow } from '../../components/complaints';

export default function StaffQueue() {
  const { user } = useAuth();
  const [complaints, setComplaints] = useState<Complaint[] | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState('');
  const [mineOnly, setMineOnly] = useState(false);

  useEffect(() => {
    supabase
      .from('complaints')
      .select('*, department:departments(name), assignee:profiles!complaints_assigned_to_fkey(full_name)')
      .order('created_at', { ascending: false })
      .limit(300)
      .then(({ data }) => setComplaints((data ?? []) as unknown as Complaint[]));
  }, []);

  const filtered = useMemo(() => {
    let list = complaints ?? [];
    if (mineOnly) list = list.filter((c) => c.assigned_to === user?.id);
    if (status) list = list.filter((c) => c.status === status);
    if (category) list = list.filter((c) => c.category === category);
    if (priority) list = list.filter((c) => c.priority === priority);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.ticket_number.toLowerCase().includes(q) ||
          c.location.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q),
      );
    }
    return list;
  }, [complaints, query, status, category, priority, mineOnly, user?.id]);

  if (!complaints) return <TableSkeleton />;

  return (
    <div className="space-y-6">
      <PageHeader title="Complaint queue" subtitle="All complaints you can access, newest first." />

      <FilterBar>
        <div className="min-w-0 flex-1 basis-full sm:basis-64">
          <Input placeholder="Search ticket, location, or text…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full sm:w-44" aria-label="Status">
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
        <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full sm:w-44" aria-label="Category">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </Select>
        <Select value={priority} onChange={(e) => setPriority(e.target.value)} className="w-full sm:w-40" aria-label="Priority">
          <option value="">All priorities</option>
          {Object.entries(PRIORITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
        <label className="flex h-11 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-slate-600">
          <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600"
            checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
          Assigned to me
        </label>
      </FilterBar>

      {filtered.length === 0 ? (
        <Card><CardBody><EmptyState title="No complaints match" message="Adjust the filters or check back later." /></CardBody></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((c: Complaint) => <ComplaintRow key={c.id} c={c} to={`/staff/complaints/${c.id}`} />)}
        </div>
      )}
    </div>
  );
}
