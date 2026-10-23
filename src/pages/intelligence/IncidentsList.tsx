import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { Incident } from '../../lib/types';
import { INCIDENT_STATUS_LABELS, INCIDENT_STATUS_STYLES } from '../../lib/types';
import { Badge, Card, EmptyState, PageHeader, Select, TableSkeleton } from '../../components/ui';
import { CategoryBadge } from '../../components/complaints';
import { buildingForLocation } from '../../lib/campus';
import { timeAgo } from '../../lib/utils';

interface Row extends Incident { incident_complaints?: { count: number }[] }

export default function IncidentsList() {
  const [incidents, setIncidents] = useState<Row[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [status, setStatus] = useState('active');

  useEffect(() => {
    supabase.from('incidents').select('*').order('created_at', { ascending: false })
      .then(async ({ data }) => {
        const rows = (data ?? []) as Row[];
        setIncidents(rows);
        const { data: members } = await supabase.from('incident_complaints').select('incident_id');
        const tally: Record<string, number> = {};
        for (const m of members ?? []) tally[m.incident_id] = (tally[m.incident_id] ?? 0) + 1;
        setCounts(tally);
      });
  }, []);

  if (!incidents) return <TableSkeleton />;
  const list = incidents.filter((i) =>
    status === 'all' || (status === 'active' ? !['resolved', 'dismissed'].includes(i.status) : i.status === status));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Incidents"
        subtitle="Confirmed groups of related reports — the original tickets always stay separate."
        actions={
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="!w-auto">
            <option value="active">Active</option>
            <option value="all">All</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
          </Select>
        }
      />
      {list.length === 0 ? (
        <Card><EmptyState title="No incidents" message="Confirm related reports in Incident Intelligence to create one." action={<Link to="/intelligence"><span className="text-sm font-semibold text-brand-600 hover:underline">Open review queue →</span></Link>} /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((i) => (
            <Link key={i.id} to={`/incidents/${i.id}`}>
              <Card className="h-full p-5 transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-bold text-slate-900">{i.title}</h3>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {buildingForLocation(i.location).name} · {timeAgo(i.created_at)}
                    </p>
                  </div>
                  <Badge className={INCIDENT_STATUS_STYLES[i.status]}>{INCIDENT_STATUS_LABELS[i.status]}</Badge>
                </div>
                {i.summary && <p className="mt-2 line-clamp-2 text-sm text-slate-500">{i.summary}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {i.category && <CategoryBadge category={i.category} />}
                  <Badge>{counts[i.id] ?? 0} linked ticket{(counts[i.id] ?? 0) === 1 ? '' : 's'}</Badge>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
