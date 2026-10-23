import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { EmptyState, PageHeader, TableSkeleton } from '../../components/ui';

export default function Receipts() {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[] | null>(null);

  useEffect(() => {
    if (!user) return;
    void supabase.from('complaints').select('id, ticket_number, title, status, submission_type, updated_at').eq('created_by', user.id).order('updated_at', { ascending: false }).limit(50)
      .then(({ data }) => setRows(data ?? []));
  }, [user]);

  if (!rows) return <TableSkeleton />;
  return (
    <div className="space-y-5">
      <PageHeader title="Decision receipts" subtitle="Open a ticket to see the events that were actually recorded. Private staff notes stay off this list." />
      {rows.length === 0 && <EmptyState title="No submissions yet" />}
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.id}>
            <Link to={`/student/tickets/${row.id}`} className="block rounded-2xl bg-white px-4 py-3 ring-1 ring-slate-100">
              <span className="font-mono text-xs font-bold">{row.ticket_number}</span>
              <p className="text-sm font-semibold">{row.title}</p>
              <p className="text-xs text-slate-400">{row.submission_type} · {row.status}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
