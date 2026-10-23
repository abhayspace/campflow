import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { supabase } from '../../lib/supabase';
import { callFunction } from '../../lib/api';
import type { Complaint, Incident } from '../../lib/types';
import { INCIDENT_STATUS_LABELS, INCIDENT_STATUS_STYLES } from '../../lib/types';
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, PageHeader, TableSkeleton } from '../../components/ui';
import { VerificationBadge } from '../../components/intelligence';
import { timeAgo } from '../../lib/utils';

interface IncidentLink { incident_id: string; complaint_id: string; incidents: Incident }

export default function IncidentUpdates() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [awaiting, setAwaiting] = useState<Complaint[] | null>(null);
  const [incidents, setIncidents] = useState<{ incident: Incident; myTicket: Complaint }[]>([]);
  const [busy, setBusy] = useState('');

  const load = async () => {
    const [{ data: mine }, { data: ic }] = await Promise.all([
      supabase.from('complaints').select('*')
        .eq('created_by', user!.id)
        .eq('verification', 'awaiting_verification')
        .order('resolved_at', { ascending: false }),
      supabase.from('incident_complaints')
        .select('incident_id, complaint_id, incidents(*)'),
    ]);
    setAwaiting((mine ?? []) as Complaint[]);
    const mineIds = new Set((await supabase.from('complaints').select('id').eq('created_by', user!.id)).data?.map((c) => c.id) ?? []);
    setIncidents((ic ?? [])
      .filter((r) => mineIds.has((r as unknown as IncidentLink).complaint_id) && (r as unknown as IncidentLink).incidents)
      .map((r) => {
        const row = r as unknown as IncidentLink;
        return { incident: row.incidents, myTicket: { id: row.complaint_id } as Complaint };
      }));
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const verify = async (c: Complaint, action: 'confirm_resolved' | 'request_reopen') => {
    setBusy(c.id);
    try {
      await callFunction('update-complaint', { complaint_id: c.id, action, status: action === 'request_reopen' ? 'reopened' : undefined });
      toast(action === 'confirm_resolved' ? 'Thanks for confirming!' : 'Reopen request sent to staff', 'success');
      await load();
    } catch (e) { toast((e as Error).message, 'error'); }
    setBusy('');
  };

  if (!awaiting) return <TableSkeleton />;

  return (
    <div className="space-y-6">
      <PageHeader title="Incident Updates" subtitle="Verify fixes on your tickets and follow campus incidents your reports are part of." />

      {/* Verification */}
      <Card>
        <CardHeader title="Resolution confirmation"
          subtitle="Staff marked these fixed — your confirmation closes the loop. No response means it's not verified." />
        <CardBody className="space-y-3">
          {awaiting.length === 0 && <EmptyState title="Nothing to verify" message="When staff resolve your tickets, you'll confirm the fix here." />}
          {awaiting.map((c) => (
            <div key={c.id} className="rounded-xl bg-sky-50/60 p-4 ring-1 ring-sky-100">
              <div className="flex flex-wrap items-center gap-2">
                <Link to={`/student/tickets/${c.id}`} className="font-mono text-[11px] font-bold text-brand-600 hover:underline">{c.ticket_number}</Link>
                <VerificationBadge status={c.verification} />
                <span className="ml-auto text-xs text-slate-400">resolved {c.resolved_at ? timeAgo(c.resolved_at) : ''}</span>
              </div>
              <p className="mt-1.5 text-sm font-semibold text-slate-800">{c.title}</p>
              {c.resolution_notes && <p className="mt-1 text-xs text-slate-500"><b>What staff did:</b> {c.resolution_notes}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button size="sm" variant="accent" loading={busy === c.id}
                  onClick={() => verify(c, 'confirm_resolved')}>Confirm — it's fixed</Button>
                <Button size="sm" variant="secondary" loading={busy === c.id}
                  onClick={() => verify(c, 'request_reopen')}>Still broken — reopen</Button>
                <Link to={`/student/tickets/${c.id}`} className="text-xs font-semibold text-slate-400 hover:text-slate-600">details →</Link>
              </div>
            </div>
          ))}
        </CardBody>
      </Card>

      {/* Linked incidents */}
      <Card>
        <CardHeader title="Campus incidents involving your reports"
          subtitle="When several reports describe the same issue, staff group them — you can follow progress here." />
        <CardBody className="space-y-3">
          {incidents.length === 0 && <EmptyState title="No linked incidents" message="If your report is grouped with similar reports, the shared incident shows up here." />}
          {incidents.map(({ incident, myTicket }) => (
            <div key={incident.id} className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-100">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-bold text-slate-900">{incident.title}</p>
                <Badge className={INCIDENT_STATUS_STYLES[incident.status]}>{INCIDENT_STATUS_LABELS[incident.status]}</Badge>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {incident.location} · updated {timeAgo(incident.resolved_at ?? incident.created_at)}
              </p>
              <Link to={`/student/tickets/${myTicket.id}`} className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:underline">
                View your linked ticket →
              </Link>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
