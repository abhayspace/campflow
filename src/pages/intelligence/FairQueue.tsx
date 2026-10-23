import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Badge, Card, EmptyState, PageHeader, TableSkeleton } from '../../components/ui';

export default function FairQueue() {
  const [rows, setRows] = useState<any[] | null>(null);

  useEffect(() => {
    void supabase.rpc('fairqueue_board', { p_limit: 40 }).then(({ data, error }) => {
      const list = Array.isArray(data) ? data : [];
      const ranked = [...list].sort((a, b) => (b.explanation?.score ?? 0) - (a.explanation?.score ?? 0));
      setRows(error ? [] : ranked);
    });
  }, []);

  if (!rows) return <TableSkeleton />;
  return (
    <div className="space-y-5">
      <PageHeader title="FairQueue" subtitle="Priority comes from a fixed formula: safety, essential service, time open, confirmed links, reopening, and escalation. Votes are not part of the score." />
      {rows.length === 0 && <EmptyState title="No open tickets in your queue" />}
      <div className="space-y-3">
        {rows.map((row) => (
          <Card key={row.id} className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Link to={`/staff/complaints/${row.id}`} className="font-mono text-xs font-bold">{row.ticket_number}</Link>
              <Badge>{row.explanation?.level ?? 'unscored'}</Badge>
              <span className="text-sm font-extrabold tabular-nums">{row.explanation?.score ?? '—'}</span>
              {row.safety_flagged && <Badge>Safety</Badge>}
            </div>
            <p className="mt-1 text-sm font-semibold text-slate-800">{row.title}</p>
            <p className="text-xs text-slate-500">{row.explanation?.recommended_action}</p>
            <ul className="mt-2 space-y-1">
              {(row.explanation?.factors ?? []).map((factor: { factor: string; detail: string; points: number; source?: string }) => (
                <li key={factor.factor} className="text-xs text-slate-600">{factor.factor}: {factor.detail} {factor.source ? `(${factor.source})` : ''} +{factor.points}</li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
