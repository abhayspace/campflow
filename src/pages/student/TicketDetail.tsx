import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { supabase } from '../../lib/supabase';
import { callFunction } from '../../lib/api';
import type { Complaint, ComplaintAttachment, ComplaintEvent } from '../../lib/types';
import { REQUEST_STATUS_LABELS, REQUEST_STATUS_STYLES } from '../../lib/types';
import { Badge, Button, Card, CardBody, CardHeader, Modal, TableSkeleton, Textarea } from '../../components/ui';
import { ComplaintMetaCard, ComplaintTimeline } from '../../components/complaints';
import GeminiSolution from '../../components/GeminiSolution';
import { TicketUpgrade } from '../../components/CampusUpgrade';
import { PriorityPanel, VerificationBadge } from '../../components/intelligence';
import { errorMessage } from '../../lib/utils';

export default function StudentTicketDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [events, setEvents] = useState<ComplaintEvent[]>([]);
  const [images, setImages] = useState<{ url: string; id: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenNote, setReopenNote] = useState('');
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data: c, error } = await supabase
      .from('complaints')
      .select('*, department:departments(name), assignee:profiles!complaints_assigned_to_fkey(full_name)')
      .eq('id', id)
      .maybeSingle();
    if (error || !c || c.created_by !== user?.id) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setComplaint(c as unknown as Complaint);

    const [{ data: ev }, { data: atts }] = await Promise.all([
      supabase
        .from('complaint_events')
        .select('*, actor:profiles!complaint_events_actor_id_fkey(full_name)')
        .eq('complaint_id', id)
        .order('created_at'),
      supabase.from('complaint_attachments').select('*').eq('complaint_id', id),
    ]);
    setEvents((ev ?? []) as unknown as ComplaintEvent[]);

    const signed: { url: string; id: string }[] = [];
    for (const a of (atts ?? []) as ComplaintAttachment[]) {
      const { data: s } = await supabase.storage
        .from('complaint-attachments')
        .createSignedUrl(a.storage_path, 3600);
      if (s?.signedUrl) signed.push({ url: s.signedUrl, id: a.id });
    }
    setImages(signed);
    setLoading(false);
  }, [id, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (payload: Record<string, unknown>, okMsg: string) => {
    setActing(true);
    try {
      await callFunction('update-complaint', { complaint_id: id, ...payload });
      toast(okMsg, 'success');
      setReopenOpen(false);
      await load();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setActing(false);
    }
  };

  if (loading) return <TableSkeleton />;
  if (notFound || !complaint) {
    return (
      <Card>
        <CardBody className="py-10 text-center text-sm text-slate-500">
          Ticket not found. <Link to="/student/tickets" className="text-brand-700 underline">Back to my tickets</Link>
        </CardBody>
      </Card>
    );
  }

  const canConfirm = complaint.status === 'resolved';
  const canReopen = ['resolved', 'closed'].includes(complaint.status);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/student/tickets" className="text-sm text-slate-500 hover:text-slate-700">← My tickets</Link>
        <h1 className="text-xl font-semibold text-slate-900">{complaint.title}</h1>
        <VerificationBadge status={complaint.verification} />
        {complaint.safety_flagged && <Badge className="bg-[#171716] text-white ring-[#171716]">Safety</Badge>}
        {complaint.submission_type === 'request' && complaint.request_status && (
          <Badge className={REQUEST_STATUS_STYLES[complaint.request_status]}>
            {REQUEST_STATUS_LABELS[complaint.request_status]}
          </Badge>
        )}
        {complaint.visibility === 'campus' && (
          <Badge>Campus</Badge>
        )}
        {complaint.moderated && (
          <Badge className="bg-red-100 text-red-700 ring-red-200">hidden by moderators</Badge>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Description" />
            <CardBody className="space-y-4">
              <p className="whitespace-pre-wrap text-sm text-slate-700">{complaint.description}</p>
              {complaint.ai_summary && (
                <div className="rounded-lg border border-accent-200 bg-accent-50/50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-accent-700">AI summary</p>
                  <p className="mt-1 text-sm text-slate-700">{complaint.ai_summary}</p>
                </div>
              )}
              {images.length > 0 && (
                <div className="flex flex-wrap gap-3">
                  {images.map((img) => (
                    <a key={img.id} href={img.url} target="_blank" rel="noreferrer">
                      <img src={img.url} alt="Complaint attachment" className="h-28 w-28 rounded-lg border border-slate-200 object-cover" />
                    </a>
                  ))}
                </div>
              )}
              {complaint.preferred_outcome && (
                <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Preferred outcome</p>
                  <p className="mt-1 text-sm text-slate-700">{complaint.preferred_outcome}</p>
                </div>
              )}
              {complaint.moderated && complaint.moderation_note && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  This submission was hidden from the community feed: {complaint.moderation_note}
                </div>
              )}
              {complaint.resolution_notes && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Resolution notes</p>
                  <p className="mt-1 text-sm text-slate-700">{complaint.resolution_notes}</p>
                </div>
              )}
            </CardBody>
          </Card>

          <GeminiSolution complaintId={complaint.id} onChange={load} />
          <TicketUpgrade complaintId={complaint.id} role="student" events={events} />

          {(canConfirm || canReopen) && (
            <Card>
              <CardBody className="flex flex-wrap items-center gap-3">
                <p className="flex-1 text-sm text-slate-600">
                  {complaint.status === 'resolved'
                    ? 'Staff marked this resolved and it\'s awaiting your verification — does everything work now?'
                    : complaint.verification === 'reopen_requested'
                      ? 'You asked for this to be reopened — staff have been notified.'
                      : 'Issue still not fixed? You can reopen this ticket.'}
                </p>
                {canConfirm && (
                  <Button variant="accent" loading={acting}
                    onClick={() => act({ action: 'confirm_resolved' }, 'Thanks for confirming!')}>
                    Confirm resolved
                  </Button>
                )}
                {canReopen && (
                  <Button variant="secondary" onClick={() => setReopenOpen(true)}>Request reopen</Button>
                )}
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="Progress history" subtitle="Every update on this ticket, in order." />
            <CardBody><ComplaintTimeline events={events} /></CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          <ComplaintMetaCard c={complaint} />
          <Card className="space-y-3 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Ticket priority</p>
            <PriorityPanel complaintId={complaint.id} />
          </Card>
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Need to add info?</p>
            <p className="mt-1 text-xs text-slate-500">
              If staff asked a question, reply below — it goes straight onto the ticket.
            </p>
            <AddPublicNote complaintId={complaint.id} onAdded={load} />
          </Card>
        </div>
      </div>

      <Modal open={reopenOpen} onClose={() => setReopenOpen(false)} title="Request reopening">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Tell staff why the issue isn't resolved.</p>
          <Textarea value={reopenNote} onChange={(e) => setReopenNote(e.target.value)}
            placeholder="The leak started again this morning…" />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setReopenOpen(false)}>Cancel</Button>
            <Button loading={acting}
              onClick={() => act({ action: 'request_reopen', status: 'reopened', note: reopenNote }, 'Reopen request sent')}>
              Reopen ticket
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function AddPublicNote({ complaintId, onAdded }: { complaintId: string; onAdded: () => void }) {
  const { toast } = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (note.trim().length < 2) return;
    setBusy(true);
    try {
      await callFunction('update-complaint', { complaint_id: complaintId, action: 'add_note', note: note.trim() });
      setNote('');
      toast('Note added', 'success');
      onAdded();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 space-y-2">
      <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a detail or reply…" />
      <Button size="sm" variant="secondary" onClick={send} loading={busy} disabled={note.trim().length < 2}>
        Add note
      </Button>
    </div>
  );
}
