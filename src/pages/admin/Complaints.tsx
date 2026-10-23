import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Complaint } from '../../lib/types';
import { CATEGORIES, STATUS_LABELS } from '../../lib/types';
import { Card, CardBody, EmptyState, FilterBar, Input, PageHeader, Select, TableSkeleton } from '../../components/ui';
import { ComplaintRow } from '../../components/complaints';

export default function AdminComplaints() {
  const [complaints, setComplaints] = useState<Complaint[] | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');

  useEffect(() => {
    supabase
      .from('complaints')
      .select('*, department:departments(name), assignee:profiles!complaints_assigned_to_fkey(full_name), creator:profiles!complaints_created_by_fkey(full_name)')
      .order('created_at', { ascending: false })
      .limit(500)
      .then(({ data }) => setComplaints((data ?? []) as unknown as Complaint[]));
  }, []);

  const filtered = useMemo(() => {
    let list = complaints ?? [];
    if (status) list = list.filter((c) => c.status === status);
    if (category) list = list.filter((c) => c.category === category);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.ticket_number.toLowerCase().includes(q) ||
          c.location.toLowerCase().includes(q),
      );
    }
    return list;
  }, [complaints, query, status, category]);

  if (!complaints) return <TableSkeleton />;

  return (
    <div className="space-y-6">
      <PageHeader title="All complaints" subtitle={`${complaints.length} tickets in this institution.`} />
      <FilterBar>
        <div className="min-w-0 flex-1 basis-full sm:basis-64">
          <Input placeholder="Search ticket, title, or location…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full sm:w-44">
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
        <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full sm:w-48">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </Select>
      </FilterBar>
      {filtered.length === 0 ? (
        <Card><CardBody><EmptyState title="No complaints match" /></CardBody></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => <ComplaintRow key={c.id} c={c} to={`/staff/complaints/${c.id}`} />)}
        </div>
      )}
    </div>
  );
}
