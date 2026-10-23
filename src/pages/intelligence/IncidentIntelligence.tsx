import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { callFunction } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import type { Complaint, ComplaintLink, Incident } from '../../lib/types';
import { INCIDENT_STATUS_LABELS, INCIDENT_STATUS_STYLES } from '../../lib/types';
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Modal, PageHeader, Select, TableSkeleton } from '../../components/ui';
import { StatusBadge, CategoryBadge } from '../../components/complaints';
import { buildingForLocation } from '../../lib/campus';
import { timeAgo } from '../../lib/utils';

interface LinkRow extends ComplaintLink {
  source_complaint?: Complaint;
  related_complaint?: Complaint;
}

/* Deterministic similarity explanation — never AI-invented. */
function whyRelated(l: LinkRow): string[] {
  const a = l.source_complaint;
  const b = l.related_complaint;
  const reasons: string[] = [];
  if (a && b) {
    if (a.category === b.category) reasons.push(`Same category (${a.category})`);
    if (a.location && b.location && buildingForLocation(a.location).id === buildingForLocation(b.location).id)
      reasons.push(`Same area (${buildingForLocation(a.location).name})`);
    const aWords = new Set(`${a.title} ${a.description}`.toLowerCase().split(/\W+/).filter((w) => w.length > 4));
    const shared = `${b.title} ${b.description}`.toLowerCase().split(/\W+/).filter((w) => aWords.has(w));
    if (shared.length) reasons.push(`Shared terms: ${[...new Set(shared)].slice(0, 4).join(', ')}`);
  }
  if (l.score != null) reasons.push(`Text similarity ${(Number(l.score) * 100).toFixed(0)}%`);
  return reasons.length ? reasons : ['Similar wording and timing'];
}

export default function IncidentIntelligence() {
  const { toast: push } = useToast();
  const [links, setLinks] = useState<LinkRow[] | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [target, setTarget] = useState<LinkRow | null>(null);
  const [incidentChoice, setIncidentChoice] = useState('new');
  const [newTitle, setNewTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [{ data: l }, { data: i }] = await Promise.all([
      supabase.from('complaint_links').select('*, source_complaint:source_complaint_id(*), related_complaint:related_complaint_id(*)')
        .eq('review_status', 'pending').order('score', { ascending: false }),
      supabase.from('incidents').select('*').neq('status', 'dismissed').order('created_at', { ascending: false }),
    ]);
    setLinks((l ?? []) as LinkRow[]);
    setIncidents((i ?? []) as Incident[]);
  };
  useEffect(() => { void load(); }, []);

  const grouped = useMemo(() => links ?? [], [links]);

  // Dismiss/defer update the link review directly — staff RLS allows it and
  // the guard trigger records the reviewer automatically.
  const decide = async (link: LinkRow, decision: 'dismiss' | 'defer') => {
    setBusy(true);
    const { error } = await supabase.from('complaint_links')
      .update({ review_status: decision === 'dismiss' ? 'dismissed' : 'pending' })
      .eq('id', link.id);
    if (error) push(error.message, 'error');
    else { push(decision === 'dismiss' ? 'Suggestion dismissed' : 'Kept pending for later', 'success'); await load(); }
    setBusy(false);
  };

  const confirm = async () => {
    if (!target) return;
    setBusy(true);
    try {
      if (incidentChoice === 'new') {
        const title = newTitle.trim() || suggestedTitle(target);
        await callFunction('manage-incident', {
          action: 'create', title,
          complaint_ids: [target.source_complaint_id, target.related_complaint_id],
        });
      } else {
        await callFunction('manage-incident', {
          action: 'review_suggestion', incident_id: incidentChoice, link_id: target.id, decision: 'confirm',
        });
      }
      push('Reports linked to an incident', 'success');
      setTarget(null); setNewTitle(''); setIncidentChoice('new');
      await load();
    } catch (e) {
      push((e as Error).message, 'error');
    } finally { setBusy(false); }
  };

  const suggestedTitle = (l: LinkRow) => {
    const a = l.source_complaint;
    if (!a) return 'Campus incident';
    return `${a.category[0]!.toUpperCase()}${a.category.slice(1)} issue — ${buildingForLocation(a.location).name}`;
  };

  if (!links) return <TableSkeleton />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Incident Intelligence"
        subtitle="Review reports that may describe the same incident. Nothing is merged automatically — you decide."
      />

      {grouped.length === 0 ? (
        <Card><EmptyState title="No pending suggestions" message="When similar reports come in, they'll appear here for review." /></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {grouped.map((l) => {
            const a = l.source_complaint;
            const b = l.related_complaint;
            return (
              <Card key={l.id} className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Possible related reports</span>
                  {l.score != null && <Badge className="bg-brand-50 text-brand-700 ring-brand-200">{(Number(l.score) * 100).toFixed(0)}% similar</Badge>}
                </div>
                <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                  {[a, b].map((c, i) => c && (
                    <div key={i} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Link to={`/staff/complaints/${c.id}`} className="font-mono text-[11px] font-bold text-brand-600 hover:underline">{c.ticket_number}</Link>
                        <StatusBadge status={c.status} />
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm font-semibold text-slate-800">{c.title}</p>
                      <p className="mt-0.5 line-clamp-1 text-xs text-slate-400">{c.location} · {timeAgo(c.created_at)}</p>
                      <div className="mt-1.5"><CategoryBadge category={c.category} /></div>
                    </div>
                  ))}
                </div>
                <ul className="mt-3 space-y-1">
                  {whyRelated(l).map((r, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />{r}
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => { setTarget(l); setNewTitle(suggestedTitle(l)); }} disabled={busy}>Confirm — same incident</Button>
                  <Button size="sm" variant="secondary" onClick={() => decide(l, 'defer')} disabled={busy}>Defer</Button>
                  <Button size="sm" variant="ghost" onClick={() => decide(l, 'dismiss')} disabled={busy}>Dismiss</Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader title="Confirmed incidents" action={<Link to="/incidents" className="text-sm font-semibold text-brand-600 hover:underline">View all</Link>} />
        <CardBody className="space-y-2">
          {incidents.length === 0 && <EmptyState title="No incidents yet" message="Confirm a suggestion above to create the first incident." />}
          {incidents.slice(0, 5).map((i) => (
            <Link key={i.id} to={`/incidents/${i.id}`} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-100 hover:bg-brand-50/60">
              <div>
                <p className="text-sm font-semibold text-slate-800">{i.title}</p>
                <p className="text-xs text-slate-400">{i.location} · {timeAgo(i.created_at)}</p>
              </div>
              <Badge className={INCIDENT_STATUS_STYLES[i.status]}>{INCIDENT_STATUS_LABELS[i.status]}</Badge>
            </Link>
          ))}
        </CardBody>
      </Card>

      {/* Confirm dialog */}
      <Modal open={!!target} onClose={() => setTarget(null)} title="Group reports into an incident">
        {target && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Link <b>{target.source_complaint?.ticket_number}</b> and <b>{target.related_complaint?.ticket_number}</b> to an incident.
              The original tickets stay separate.
            </p>
            <Select value={incidentChoice} onChange={(e) => setIncidentChoice(e.target.value)}>
              <option value="new">Create a new incident</option>
              {incidents.filter((i) => !['resolved', 'dismissed'].includes(i.status)).map((i) => (
                <option key={i.id} value={i.id}>Add to: {i.title}</option>
              ))}
            </Select>
            {incidentChoice === 'new' && (
              <input
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Incident title"
              />
            )}
            <div className="flex gap-2">
              <Button onClick={confirm} loading={busy}>Confirm link</Button>
              <Button variant="secondary" onClick={() => setTarget(null)}>Cancel</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
