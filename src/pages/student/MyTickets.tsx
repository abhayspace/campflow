import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import type { Complaint } from '../../lib/types';
import { STATUS_LABELS } from '../../lib/types';
import { Button, Card, CardBody, EmptyState, FilterBar, Input, PageHeader, Select, TableSkeleton } from '../../components/ui';
import { ComplaintRow } from '../../components/complaints';

export default function MyTickets() {
  const { user } = useAuth();
  const [complaints, setComplaints] = useState<Complaint[] | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');

  useEffect(() => {
    if (!user) return;
    supabase
      .from('complaints')
      .select('*')
      .eq('created_by', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setComplaints(data ?? []));
  }, [user]);

  const filtered = useMemo(() => {
    let list = complaints ?? [];
    if (type) list = list.filter((c) => (c.submission_type ?? 'complaint') === type);
    if (status) list = list.filter((c) => c.status === status);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.ticket_number.toLowerCase().includes(q) ||
          c.location.toLowerCase().includes(q),
      );
    }
    return list;
  }, [complaints, query, status, type]);

  if (!complaints) return <TableSkeleton />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="My tickets"
        subtitle="Every complaint and request you've made, newest first."
        actions={<Link to="/student/new"><Button>New complaint</Button></Link>}
      />

      <FilterBar>
        <div className="min-w-0 flex-1 basis-full sm:basis-64">
          <Input
            placeholder="Search by ticket number, title, or location…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search tickets"
          />
        </div>
        <Select value={type} onChange={(e) => setType(e.target.value)} className="w-full sm:w-44" aria-label="Filter by type">
          <option value="">All types</option>
          <option value="complaint">Complaints</option>
          <option value="request">Requests</option>
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full sm:w-48" aria-label="Filter by status">
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </Select>
      </FilterBar>

      {filtered.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              title={complaints.length ? 'No tickets match your filters' : 'No complaints yet'}
              message={complaints.length ? 'Try a different search or status filter.' : 'Report your first issue to get started.'}
            />
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => <ComplaintRow key={c.id} c={c} to={`/student/tickets/${c.id}`} />)}
        </div>
      )}
    </div>
  );
}
