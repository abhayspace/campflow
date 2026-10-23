import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { callFunction } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import type { Complaint, ComplaintEvent, Incident, IncidentBroadcast, IncidentNote } from '../../lib/types';
import { INCIDENT_STATUS_LABELS, INCIDENT_STATUS_STYLES } from '../../lib/types';
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Modal, Select, Spinner, Textarea } from '../../components/ui';
import { ComplaintRow, CategoryBadge, StatusBadge, ComplaintTimeline } from '../../components/complaints';
import { buildingForLocation } from '../../lib/campus';
import { DossierButton } from '../../components/CampusUpgrade';
import { cx, formatDateTime, timeAgo } from '../../lib/utils';

const TABS = ['Overview', 'Tickets', 'Timeline', 'Investigation', 'Broadcasts'] as const;
type Tab = (typeof TABS)[number];

export default function IncidentDetail() {
  const { id } = useParams();

  const { toast: push } = useToast();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [members, setMembers] = useState<Complaint[]>([]);
  const [notes, setNotes] = useState<IncidentNote[]>([]);
  const [broadcasts, setBroadcasts] = useState<IncidentBroadcast[]>([]);
  const [events, setEvents] = useState<ComplaintEvent[]>([]);
  const [tab, setTab] = useState<Tab>('Overview');
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteType, setNoteType] = useState<'note' | 'step' | 'outcome'>('note');
  const [aiBusy, setAiBusy] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [recipients, setRecipients] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [candidates, setCandidates] = useState<Complaint[]>([]);

  const load = async () => {
    const [{ data: i }, { data: m }, { data: n }, { data: b }] = await Promise.all([
      supabase.from('incidents').select('*').eq('id', id).maybeSingle(),
      supabase.from('incident_complaints').select('complaint_id, complaints(*)').eq('incident_id', id),
      supabase.from('incident_notes').select('*, author:author_id(full_name)').eq('incident_id', id).order('created_at'),
      supabase.from('incident_broadcasts').select('*, sender:sent_by(full_name)').eq('incident_id', id).order('created_at', { ascending: false }),
    ]);
    if (!i) { setMissing(true); return; }
    setIncident(i as Incident);
    const comps = (m ?? []).map((r) => (r as unknown as { complaints: Complaint }).complaints).filter(Boolean);
    setMembers(comps);
    setNotes((n ?? []) as IncidentNote[]);
    setBroadcasts((b ?? []) as IncidentBroadcast[]);
    if (comps.length) {
      const { data: ev } = await supabase.from('complaint_events')
        .select('*, actor:actor_id(full_name)').in('complaint_id', comps.map((c) => c.id))
        .order('created_at', { ascending: false }).limit(60);
      setEvents((ev ?? []) as ComplaintEvent[]);
    }
    callFunction<{ recipient_count: number }>('manage-incident', { action: 'preview_recipients', incident_id: id })
      .then((r) => setRecipients(r.recipient_count)).catch(() => setRecipients(null));
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const setStatus = async (status: string) => {
    setBusy(true);
    try {
      await callFunction('manage-incident', { action: 'set_status', incident_id: id, status });
      push('Incident updated — affected students were notified', 'success');
      await load();
    } catch (e) { push((e as Error).message, 'error'); }
    setBusy(false);
  };

  const addNote = async () => {
    if (noteText.trim().length < 3) return;
    setBusy(true);
    try {
      await callFunction('manage-incident', { action: 'add_note', incident_id: id, note_type: noteType, content: noteText.trim() });
      setNoteText('');
      await load();
    } catch (e) { push((e as Error).message, 'error'); }
    setBusy(false);
  };

  const reviewNote = async (noteId: string, state: 'confirmed' | 'rejected' | '') => {
    try {
      await callFunction('manage-incident', { action: 'review_note', incident_id: id, note_id: noteId, state });
      await load();
    } catch (e) { push((e as Error).message, 'error'); }
  };

  const runInvestigation = async () => {
    setAiBusy(true);
    try {
      await callFunction('ai-investigate', { incident_id: id });
      push('AI hypotheses added for review', 'success');
      await load();
    } catch (e) { push((e as Error).message, 'error'); }
    setAiBusy(false);
  };

  const sendBroadcast = async () => {
    setBusy(true);
    try {
      await callFunction('manage-incident', { action: 'broadcast', incident_id: id, message: broadcastMsg.trim() });
      push(`Broadcast sent to ${recipients ?? 0} student(s)`, 'success');
      setBroadcastOpen(false); setBroadcastMsg('');
      await load();
    } catch (e) { push((e as Error).message, 'error'); }
    setBusy(false);
  };

  const openAdd = async () => {
    const { data } = await supabase.from('complaints').select('*')
      .in('category', incident?.category ? [incident.category] : ['plumbing', 'electricity', 'cleanliness', 'internet'])
      .not('status', 'in', '(closed)').order('created_at', { ascending: false }).limit(30);
    setCandidates(((data ?? []) as Complaint[]).filter((c) => !members.some((m) => m.id === c.id)));
    setAddOpen(true);
  };


  if (missing) return <Card><EmptyState title="Incident not found" message="It may have been removed or isn't visible to you." /></Card>;
  if (!incident) return <div className="flex justify-center py-16"><Spinner /></div>;

  const facts = [
    ['Status', INCIDENT_STATUS_LABELS[incident.status]],
    ['Area', buildingForLocation(incident.location).name],
    ['Linked tickets', String(members.length)],
    ['Confirmed', incident.confirmed_at ? formatDateTime(incident.confirmed_at) : 'Not yet'],
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight">{incident.title}</h1>
            <Badge className={INCIDENT_STATUS_STYLES[incident.status]}>{INCIDENT_STATUS_LABELS[incident.status]}</Badge>
            {incident.category && <CategoryBadge category={incident.category} />}
          </div>
          <p className="mt-1 text-sm text-slate-500">{incident.location}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value="" onChange={(e) => { if (e.target.value) void setStatus(e.target.value); e.target.value = ''; }} className="!w-auto">
            <option value="">Set status…</option>
            {Object.entries(INCIDENT_STATUS_LABELS).filter(([k]) => k !== incident.status).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
          <Button size="sm" variant="secondary" onClick={openAdd}>Link a ticket</Button>
          <Button size="sm" onClick={() => setBroadcastOpen(true)}>Notify affected students</Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-full bg-white p-1.5 shadow-sm">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cx('whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-semibold transition-colors',
              tab === t ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900')}>
            {t}{t === 'Tickets' ? ` (${members.length})` : t === 'Investigation' ? ` (${notes.length})` : ''}
          </button>
        ))}
      </div>

      {tab === 'Overview' && (
        <div className="space-y-5">
        <DossierButton incidentId={incident.id} complaintId={members[0]?.id} />
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="p-6">
            <h3 className="text-base font-bold">Confirmed facts</h3>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              {facts.map(([k, v]) => (
                <div key={k}><dt className="text-xs text-slate-400">{k}</dt><dd className="font-semibold text-slate-800">{v}</dd></div>
              ))}
            </dl>
            {incident.summary && (
              <div className="mt-4 rounded-xl bg-brand-50 p-3.5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-brand-500">AI summary — review, not verified</p>
                <p className="mt-1 text-sm text-brand-900">{incident.summary}</p>
              </div>
            )}
          </Card>
          <Card className="p-6">
            <h3 className="text-base font-bold">Affected reports</h3>
            <ul className="mt-3 space-y-2">
              {members.map((c) => (
                <li key={c.id} className="flex items-center justify-between text-sm">
                  <Link to={`/staff/complaints/${c.id}`} className="font-mono text-xs font-bold text-brand-600 hover:underline">{c.ticket_number}</Link>
                  <span className="line-clamp-1 flex-1 px-3 text-slate-600">{c.title}</span>
                  <StatusBadge status={c.status} />
                </li>
              ))}
            </ul>
          </Card>
        </div>
        </div>
      )}

      {tab === 'Tickets' && (
        <Card><CardBody className="space-y-3">
          {members.length === 0 && <EmptyState title="No linked tickets" />}
          {members.map((c) => <ComplaintRow key={c.id} c={c} to={`/staff/complaints/${c.id}`} />)}
        </CardBody></Card>
      )}

      {tab === 'Timeline' && (
        <Card><CardBody>
          {events.length === 0 ? <EmptyState title="No activity yet" /> : <ComplaintTimeline events={events} />}
        </CardBody></Card>
      )}

      {tab === 'Investigation' && (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="p-6 lg:col-span-2">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">Investigation notes & hypotheses</h3>
              <Button size="sm" variant="accent" onClick={runInvestigation} loading={aiBusy}>Run AI investigation</Button>
            </div>
            <div className="mt-4 space-y-3">
              {notes.length === 0 && <EmptyState title="No investigation notes" message="Add notes manually or run the AI investigation to draft hypotheses." />}
              {notes.map((n) => (
                <div key={n.id} className={cx('rounded-xl p-3.5 ring-1',
                  n.note_type === 'hypothesis' ? 'bg-violet-50/70 ring-violet-100'
                    : n.note_type === 'step' ? 'bg-sky-50/70 ring-sky-100'
                    : n.note_type === 'outcome' ? 'bg-emerald-50/70 ring-emerald-100'
                    : 'bg-slate-50 ring-slate-100')}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-white text-slate-600 ring-slate-200 capitalize">{n.note_type}</Badge>
                    {n.ai_generated && <Badge className="bg-violet-100 text-violet-700 ring-violet-200">AI suggestion</Badge>}
                    {n.review_state === 'confirmed' && <Badge className="bg-emerald-100 text-emerald-700 ring-emerald-200">confirmed by staff</Badge>}
                    {n.review_state === 'rejected' && <Badge className="bg-red-100 text-red-600 ring-red-200">rejected</Badge>}
                    <span className="ml-auto text-[11px] text-slate-400">
                      {(n.author as unknown as { full_name?: string })?.full_name ?? (n.ai_generated ? 'Campflow AI' : 'System')} · {timeAgo(n.created_at)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm text-slate-700">{n.content}</p>
                  {(n.note_type === 'hypothesis' || n.ai_generated) && !n.review_state && (
                    <div className="mt-2 flex gap-2">
                      <button onClick={() => reviewNote(n.id, 'confirmed')} className="rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-bold text-white hover:bg-emerald-700">Confirm</button>
                      <button onClick={() => reviewNote(n.id, 'rejected')} className="rounded-full bg-white px-3 py-1 text-[11px] font-bold text-red-600 ring-1 ring-red-200 hover:bg-red-50">Reject</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-6">
            <h3 className="text-base font-bold">Add a note</h3>
            <div className="mt-3 space-y-3">
              <Select value={noteType} onChange={(e) => setNoteType(e.target.value as typeof noteType)}>
                <option value="note">Field note</option>
                <option value="step">Investigation step</option>
                <option value="outcome">Final outcome</option>
              </Select>
              <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="What did you find?" />
              <Button size="sm" onClick={addNote} loading={busy} disabled={noteText.trim().length < 3}>Save note</Button>
              <p className="text-[11px] text-slate-400">Staff notes and AI hypotheses stay separate from confirmed facts. AI never closes an incident on its own.</p>
            </div>
          </Card>
        </div>
      )}

      {tab === 'Broadcasts' && (
        <Card>
          <CardHeader title="Notifications to affected students"
            action={<Button size="sm" onClick={() => setBroadcastOpen(true)}>New broadcast</Button>} />
          <CardBody className="space-y-3">
            {broadcasts.length === 0 && <EmptyState title="No broadcasts sent" message="Send a status update to every student whose ticket is linked here." />}
            {broadcasts.map((b) => (
              <div key={b.id} className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-100">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>{(b.sender as unknown as { full_name?: string })?.full_name ?? 'Staff'} · {formatDateTime(b.created_at)}</span>
                  <Badge>{b.recipient_count} recipient{b.recipient_count === 1 ? '' : 's'}</Badge>
                </div>
                <p className="mt-1.5 text-sm text-slate-700">{b.message}</p>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      {/* Broadcast composer */}
      <Modal open={broadcastOpen} onClose={() => setBroadcastOpen(false)} title="Notify affected students" wide>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            This update goes to <b>{recipients ?? '…'}</b> student{recipients === 1 ? '' : 's'} whose tickets are linked to
            “{incident.title}”. Names and other reports are never shared.
          </p>
          <Field label="Message" required>
            <Textarea value={broadcastMsg} onChange={(e) => setBroadcastMsg(e.target.value)}
              placeholder={`Update on “${incident.title}”: our team is…`} />
          </Field>
          <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
            Preview — students receive an in-app notification and an email with your message and a link to their own ticket.
          </div>
          <div className="flex gap-2">
            <Button onClick={sendBroadcast} loading={busy} disabled={broadcastMsg.trim().length < 10}>Send broadcast</Button>
            <Button variant="secondary" onClick={() => setBroadcastOpen(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>

      {/* Link a ticket */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Link a ticket to this incident" wide>
        <div className="max-h-96 space-y-2 overflow-y-auto">
          {candidates.length === 0 && <EmptyState title="No eligible tickets" />}
          {candidates.map((c) => (
            <button key={c.id} onClick={async () => {
              try {
                await callFunction('manage-incident', { action: 'add_complaint', incident_id: id, complaint_id: c.id });
                push('Ticket linked', 'success'); setAddOpen(false); await load();
              } catch (e) { push((e as Error).message, 'error'); }
            }} className="block w-full rounded-xl bg-slate-50 p-3 text-left ring-1 ring-slate-100 hover:bg-brand-50">
              <span className="font-mono text-[11px] font-bold text-brand-600">{c.ticket_number}</span>
              <span className="ml-2 text-sm font-semibold text-slate-800">{c.title}</span>
              <span className="block text-xs text-slate-400">{c.location} · {timeAgo(c.created_at)}</span>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
