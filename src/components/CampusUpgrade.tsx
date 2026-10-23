import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { callFunction } from '../lib/api';
import { supabase } from '../lib/supabase';
import type { ComplaintEvent } from '../lib/types';
import { Badge, Button, Card, CardBody, CardHeader, Textarea } from './ui';
import { cx, formatDateTime } from '../lib/utils';

type Role = 'admin' | 'teacher' | 'student' | undefined;

export function CampusMemoryPanel({ complaintId, canLabel }: { complaintId: string; canLabel: boolean }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState('successful');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('search_campus_memory', { p_complaint: complaintId });
    setRows(error ? [] : (data as any[]) ?? []);
  }, [complaintId]);

  useEffect(() => { void load(); }, [load]);

  async function explain() {
    setBusy(true);
    setWarning(null);
    try {
      const result = await callFunction<{ summary: string | null; warning?: string }>('campus-upgrade', { action: 'memory_explain', complaint_id: complaintId });
      setSummary(result.summary);
      setWarning(result.warning ?? null);
    } catch (error) {
      setWarning(error instanceof Error ? error.message : 'Explanation failed');
    } finally {
      setBusy(false);
    }
  }

  async function label() {
    setBusy(true);
    try {
      await callFunction('campus-upgrade', { action: 'memory_label', complaint_id: complaintId, outcome, note });
      setNote('');
      await load();
    } catch (error) {
      setWarning(error instanceof Error ? error.message : 'Could not save the outcome');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Campus Memory" subtitle="Earlier records from this institution. A past outcome is not assumed to fix this report." />
      <CardBody className="space-y-3">
        {summary && <p className="rounded-2xl bg-slate-50 px-3 py-2 text-sm text-slate-700">{summary}</p>}
        {warning && <p className="text-xs text-amber-700">{warning}</p>}
        {rows === null && <p className="text-xs text-slate-400">Searching historical records…</p>}
        {rows?.length === 0 && <p className="text-sm text-slate-500">No similar historical records were found that you are allowed to see.</p>}
        <ul className="space-y-2">
          {rows?.map((row) => (
            <li key={row.id} className="rounded-2xl bg-slate-50 px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-bold">{row.ticket_number}</span>
                {row.category_match && <Badge>Same category</Badge>}
                {row.location_match && <Badge>Similar place</Badge>}
                {row.outcome && <Badge>{row.outcome}</Badge>}
                {row.reopen_count > 0 && <Badge>Recurred</Badge>}
              </div>
              <p className="mt-1 text-sm font-semibold text-slate-800">{row.title}</p>
              <p className="text-xs text-slate-500">{row.location} · {formatDateTime(row.created_at)}</p>
              <p className="mt-1 text-xs text-slate-600">{row.relevance}</p>
              {row.resolution_notes && <p className="mt-1 text-xs text-slate-500">Earlier note: {row.resolution_notes}</p>}
            </li>
          ))}
        </ul>
        <Button size="sm" variant="secondary" loading={busy} onClick={() => void explain()}>Explain these records</Button>
        {canLabel && (
          <div className="space-y-2 border-t border-slate-100 pt-3">
            <p className="text-xs font-semibold text-slate-500">Label this ticket’s documented outcome</p>
            <select className="rounded-xl border border-slate-200 px-3 py-2 text-sm" value={outcome} onChange={(event) => setOutcome(event.target.value)}>
              <option value="successful">Successful</option>
              <option value="partial">Partially successful</option>
              <option value="unsuccessful">Unsuccessful</option>
              <option value="inconclusive">Inconclusive</option>
            </select>
            <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="What was actually observed" />
            <Button size="sm" loading={busy} onClick={() => void label()}>Save outcome</Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export function ResolutionContractPanel({ complaintId, canEdit }: { complaintId: string; canEdit: boolean }) {
  const [contract, setContract] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: row }, { data: criteria }] = await Promise.all([
      supabase.from('resolution_contracts').select('*').eq('complaint_id', complaintId).maybeSingle(),
      supabase.from('resolution_criteria').select('*').eq('complaint_id', complaintId).order('position'),
    ]);
    setContract(row);
    setItems(criteria ?? []);
  }, [complaintId]);

  useEffect(() => { void load(); }, [load]);

  async function propose(regenerate = false) {
    setBusy(true);
    setMessage(null);
    try {
      await callFunction('campus-upgrade', { action: 'contract_propose', complaint_id: complaintId, regenerate });
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not propose criteria');
    } finally {
      setBusy(false);
    }
  }

  async function setState(id: string, state: string) {
    setBusy(true);
    try {
      const result = await callFunction<{ complaint_status_unchanged: string }>('campus-upgrade', { action: 'contract_item', complaint_id: complaintId, criterion_id: id, state });
      setMessage(`Checklist updated. Complaint status is still ${result.complaint_status_unchanged}.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update the checklist');
    } finally {
      setBusy(false);
    }
  }

  const done = items.filter((item) => item.state === 'completed' || item.state === 'confirmed').length;

  return (
    <Card>
      <CardHeader title="Resolution criteria" subtitle="What should be true before staff consider the work complete. Checking these boxes does not resolve the ticket." />
      <CardBody className="space-y-3">
        {contract?.safety_note && <p className="rounded-2xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">{contract.safety_note}</p>}
        {contract && <p className="text-xs text-slate-500">{done} of {items.length} checked by staff · contract {contract.status}</p>}
        {!contract && <p className="text-sm text-slate-500">No criteria yet.</p>}
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-2xl bg-slate-50 px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{item.state}</Badge>
                <Badge>{item.source}</Badge>
              </div>
              <p className="mt-1 text-sm font-semibold text-slate-800">{item.label}</p>
              <p className="text-xs text-slate-500">Evidence: {item.evidence_required}</p>
              {canEdit && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" loading={busy} onClick={() => void setState(item.id, 'confirmed')}>Confirm</Button>
                  <Button size="sm" variant="secondary" loading={busy} onClick={() => void setState(item.id, 'completed')}>Record evidence</Button>
                  <Button size="sm" variant="ghost" loading={busy} onClick={() => void setState(item.id, 'waived')}>Waive</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
        {message && <p className="text-xs text-slate-600">{message}</p>}
        {canEdit && (
          <div className="flex gap-2">
            <Button size="sm" loading={busy} onClick={() => void propose(false)}>Propose criteria</Button>
            <Button size="sm" variant="secondary" loading={busy} onClick={() => void propose(true)}>Regenerate</Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export function RecurrencePanel({ complaintId, canReview }: { complaintId: string; canReview: boolean }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('recurrence_notices', { p_complaint: complaintId });
    setRows((data as any[]) ?? []);
  }, [complaintId]);

  useEffect(() => { void load(); }, [load]);

  async function review(id: string, reviewStatus: string) {
    setBusy(true);
    try {
      await callFunction('campus-upgrade', { action: 'recurrence_review', id, review: reviewStatus });
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!rows?.length) return null;
  return (
    <Card>
      <CardHeader title="Recurrence watch" subtitle="A similar resolved report exists. That is a prompt to investigate, not proof the earlier repair failed." />
      <CardBody className="space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="rounded-2xl bg-slate-50 px-3 py-2.5 text-sm">
            <p className="text-slate-700">{row.reason}</p>
            <p className="mt-1 text-xs text-slate-500">
              {row.hours_since != null ? `${Math.max(0, Math.round(Number(row.hours_since)))} hours after the earlier resolution` : 'Timing unavailable'}
              {row.prior_ticket ? ` · ${row.prior_ticket}` : ' · the earlier ticket is not visible to you'}
              {row.prior_verification ? ` · verification ${row.prior_verification}` : ''}
            </p>
            {canReview && (
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="secondary" loading={busy} onClick={() => void review(row.id, 'confirmed')}>Link as related</Button>
                <Button size="sm" variant="ghost" loading={busy} onClick={() => void review(row.id, 'dismissed')}>Not the same issue</Button>
              </div>
            )}
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

export function DecisionReceipt({ complaintId, events }: { complaintId: string; events?: ComplaintEvent[] }) {
  const [rows, setRows] = useState<ComplaintEvent[]>(events ?? []);
  useEffect(() => {
    if (events) { setRows(events); return; }
    void supabase.from('complaint_events').select('*').eq('complaint_id', complaintId).order('created_at').then(({ data }) => setRows((data ?? []) as ComplaintEvent[]));
  }, [complaintId, events]);

  return (
    <Card>
      <CardHeader title="Decision receipt" subtitle="Events stored for this ticket. Nothing here is written by the assistant." />
      <CardBody>
        <ol className="space-y-2">
          {rows.map((event) => (
            <li key={event.id} className="grid grid-cols-[8rem_1fr] gap-3 text-sm">
              <span className="text-xs text-slate-400">{formatDateTime(event.created_at)}</span>
              <span>
                <span className="font-semibold text-slate-800">{event.event_type.replaceAll('_', ' ')}</span>
                {event.note && <span className="mt-0.5 block text-xs text-slate-500">{event.note}</span>}
              </span>
            </li>
          ))}
          {rows.length === 0 && <li className="text-sm text-slate-500">No events yet.</li>}
        </ol>
        <Button size="sm" variant="secondary" className="mt-3" onClick={() => window.print()}>Print receipt</Button>
      </CardBody>
    </Card>
  );
}

export function DossierButton({ complaintId, incidentId }: { complaintId?: string; incidentId?: string }) {
  const [busy, setBusy] = useState(false);
  const [dossier, setDossier] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [sections, setSections] = useState(['facts', 'memory', 'contract', 'policies', 'notes', 'summary', 'next']);

  function toggle(section: string) {
    setSections((current) => current.includes(section) ? current.filter((item) => item !== section) : [...current, section]);
  }

  async function generate(audience: 'staff' | 'student') {
    setBusy(true);
    setError(null);
    try {
      const result = await callFunction<{ dossier: any }>('campus-upgrade', {
        action: 'dossier', complaint_id: complaintId, incident_id: incidentId, sections, audience,
      });
      setDossier(result.dossier);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate the dossier');
    } finally {
      setBusy(false);
    }
  }

  const body = dossier?.body;
  return (
    <Card>
      <CardHeader title="Incident dossier" subtitle="A brief from records you can already access. Hypotheses stay labeled as unverified." />
      <CardBody className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {['facts', 'memory', 'contract', 'policies', 'notes', 'summary', 'next'].map((section) => (
            <button key={section} type="button" onClick={() => toggle(section)} className={cx('rounded-full px-3 py-1 text-xs font-semibold ring-1', sections.includes(section) ? 'bg-[#171716] text-white ring-[#171716]' : 'bg-white text-slate-600 ring-slate-200')}>
              {section}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" loading={busy} onClick={() => void generate('staff')}>Generate staff dossier</Button>
          <Button size="sm" variant="secondary" loading={busy} onClick={() => void generate('student')}>Student-safe copy</Button>
          {dossier && <Button size="sm" variant="ghost" onClick={() => window.print()}>Print</Button>}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        {body && (
          <div className="space-y-2 text-sm">
            <DossierList title="Verified facts" items={body.verified_facts} />
            <DossierList title="Historical records" items={body.historical_records} />
            <DossierList title="Staff notes" items={body.staff_notes} />
            <DossierList title="AI hypotheses" items={body.ai_hypotheses} />
            <DossierList title="Next steps" items={body.next_steps} />
            {(body.policy_excerpts ?? []).map((item: { title: string; excerpt: string }) => (
              <p key={item.title} className="text-xs text-slate-600"><b>{item.title}.</b> {item.excerpt}</p>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function DossierList({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{title}</p>
      <ul className="mt-1 list-disc space-y-1 pl-4 text-slate-700">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

export function PriorityOverride({ complaintId }: { complaintId: string }) {
  const [priority, setPriority] = useState('high');
  const [reason, setReason] = useState('');
  const [history, setHistory] = useState<any[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('priority_overrides').select('id, previous_priority, new_priority, reason, created_at').eq('complaint_id', complaintId).order('created_at', { ascending: false });
    setHistory(data ?? []);
  }, [complaintId]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      await callFunction('campus-upgrade', { action: 'priority_override', complaint_id: complaintId, priority, reason });
      setReason('');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not override priority');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Priority override" subtitle="The score above is calculated. This changes the stored priority and keeps the reason." />
      <CardBody className="space-y-2">
        <select className="rounded-xl border border-slate-200 px-3 py-2 text-sm" value={priority} onChange={(event) => setPriority(event.target.value)}>
          {['low', 'medium', 'high', 'urgent'].map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why this priority should change" />
        <Button size="sm" loading={busy} onClick={() => void save()}>Save override</Button>
        {message && <p className="text-xs text-red-600">{message}</p>}
        <ul className="space-y-1">
          {history.map((row) => (
            <li key={row.id} className="text-xs text-slate-500">{formatDateTime(row.created_at)}: {row.previous_priority} → {row.new_priority}. {row.reason}</li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

export function TicketUpgrade({ complaintId, role, events }: { complaintId: string; role: Role; events?: ComplaintEvent[] }) {
  const staff = role === 'admin' || role === 'teacher';
  return (
    <div className="space-y-5">
      {staff && <PriorityOverride complaintId={complaintId} />}
      <CampusMemoryPanel complaintId={complaintId} canLabel={staff} />
      <ResolutionContractPanel complaintId={complaintId} canEdit={staff} />
      <RecurrencePanel complaintId={complaintId} canReview={staff} />
      <DecisionReceipt complaintId={complaintId} events={events} />
      {staff && <DossierButton complaintId={complaintId} />}
      {staff && <p className="text-xs text-slate-400">Related hypotheses are on the <Link className="font-semibold underline" to="/graph">dependency graph</Link>.</p>}
    </div>
  );
}
