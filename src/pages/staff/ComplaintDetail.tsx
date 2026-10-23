import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { supabase } from '../../lib/supabase';
import { callFunction } from '../../lib/api';
import type {
  Complaint, ComplaintAttachment, ComplaintEvent, ComplaintLink,
  ComplaintStatus, Department, Profile,
} from '../../lib/types';
import { STATUS_LABELS } from '../../lib/types';
import {
  Badge, Button, Card, CardBody, CardHeader, Modal, Select,
  TableSkeleton, Textarea,
} from '../../components/ui';
import { ComplaintMetaCard, ComplaintTimeline, StatusBadge } from '../../components/complaints';
import { DueBadge, EscalationBadge, PriorityPanel, VerificationBadge } from '../../components/intelligence';
import { AiAnalysisPanel, CommunitySignal, ModerationControl, RequestFlow, SolutionsPanel, SurveyLauncher } from '../../components/workspace';
import GeminiSolution from '../../components/GeminiSolution';
import { TicketUpgrade } from '../../components/CampusUpgrade';
import { errorMessage } from '../../lib/utils';

const NEXT_ACTIONS: Record<ComplaintStatus, { status: ComplaintStatus; label: string; variant?: 'accent' | 'primary' | 'secondary' }[]> = {
  new: [
    { status: 'in_progress', label: 'Start work' },
    { status: 'assigned', label: 'Mark assigned' },
  ],
  assigned: [
    { status: 'in_progress', label: 'Start work', variant: 'accent' },
    { status: 'resolved', label: 'Resolve' },
  ],
  in_progress: [{ status: 'resolved', label: 'Resolve', variant: 'accent' }],
  reopened: [
    { status: 'in_progress', label: 'Resume work' },
    { status: 'resolved', label: 'Resolve' },
  ],
  resolved: [
    { status: 'closed', label: 'Close ticket' },
    { status: 'reopened', label: 'Reopen' },
  ],
  closed: [{ status: 'reopened', label: 'Reopen' }],
};

export default function StaffComplaintDetail() {
  const { id } = useParams();
  const { profile } = useAuth();
  const { toast } = useToast();
  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [events, setEvents] = useState<ComplaintEvent[]>([]);
  const [images, setImages] = useState<{ url: string; id: string }[]>([]);
  const [links, setLinks] = useState<ComplaintLink[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [acting, setActing] = useState(false);

  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [noteText, setNoteText] = useState('');
  const [noteInternal, setNoteInternal] = useState(false);
  const [infoQuestion, setInfoQuestion] = useState('');
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignDept, setAssignDept] = useState('');
  const [assignee, setAssignee] = useState('');
  const [prioritySel, setPrioritySel] = useState('');
  const [priorityReason, setPriorityReason] = useState('');
  const [proofPhoto, setProofPhoto] = useState<File | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const { data: c, error } = await supabase
      .from('complaints')
      .select(
        '*, department:departments(name), assignee:profiles!complaints_assigned_to_fkey(full_name), creator:profiles!complaints_created_by_fkey(full_name, identifier, email)',
      )
      .eq('id', id)
      .maybeSingle();
    if (error || !c) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setComplaint(c as unknown as Complaint);
    setAssignDept(c.assigned_department_id ?? '');
    setAssignee(c.assigned_to ?? '');

    const [{ data: ev }, { data: atts }, { data: ln }, { data: depts }, { data: staff }] = await Promise.all([
      supabase
        .from('complaint_events')
        .select('*, actor:profiles!complaint_events_actor_id_fkey(full_name, role)')
        .eq('complaint_id', id)
        .order('created_at'),
      supabase.from('complaint_attachments').select('*').eq('complaint_id', id),
      supabase
        .from('complaint_links')
        .select('*, related:related_complaint_id(id, ticket_number, title, status, location, category, created_at)')
        .eq('source_complaint_id', id),
      supabase.from('departments').select('*').eq('is_active', true).order('name'),
      supabase.from('profiles').select('id, full_name, role, account_status').eq('role', 'teacher').eq('account_status', 'active').order('full_name'),
    ]);
    setEvents((ev ?? []) as unknown as ComplaintEvent[]);
    setLinks((ln ?? []) as unknown as ComplaintLink[]);
    setDepartments((depts ?? []) as Department[]);
    setTeachers((staff ?? []) as Profile[]);

    const signed: { url: string; id: string }[] = [];
    for (const a of (atts ?? []) as ComplaintAttachment[]) {
      const { data: s } = await supabase.storage.from('complaint-attachments').createSignedUrl(a.storage_path, 3600);
      if (s?.signedUrl) signed.push({ url: s.signedUrl, id: a.id });
    }
    setImages(signed);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (payload: Record<string, unknown>, okMsg: string) => {
    setActing(true);
    try {
      await callFunction('update-complaint', { complaint_id: id, ...payload });
      toast(okMsg, 'success');
      await load();
      return true;
    } catch (e) {
      toast(errorMessage(e), 'error');
      return false;
    } finally {
      setActing(false);
    }
  };

  if (loading) return <TableSkeleton />;
  if (notFound || !complaint) {
    return (
      <Card><CardBody className="py-10 text-center text-sm text-slate-500">
        Complaint not found or not accessible. <Link to="/staff/complaints" className="text-brand-700 underline">Back to queue</Link>
      </CardBody></Card>
    );
  }

  const canResolve = ['assigned', 'in_progress', 'reopened'].includes(complaint.status);
  void profile;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/staff/complaints" className="text-sm text-slate-500 hover:text-slate-700">← Queue</Link>
        <h1 className="text-xl font-semibold text-slate-900">{complaint.title}</h1>
        <StatusBadge status={complaint.status} />
        <VerificationBadge status={complaint.verification} />
        <DueBadge c={complaint} />
        <EscalationBadge level={complaint.escalation_level} />
        {complaint.safety_flagged && <Badge className="bg-[#171716] text-white ring-[#171716]">Safety</Badge>}
        {complaint.reopen_count > 0 && <Badge className="bg-orange-100 text-orange-700 ring-orange-200">reopened ×{complaint.reopen_count}</Badge>}
        <Badge className="bg-white text-slate-600 ring-slate-200">
          {complaint.submission_type === 'request' ? 'Request' : 'Complaint'}
        </Badge>
        <Badge className="bg-white text-slate-600 ring-slate-200">
          {complaint.visibility === 'campus' ? 'Campus' : 'Personal'}
        </Badge>
        {complaint.moderated && <Badge className="bg-red-100 text-red-700 ring-red-200">hidden from feed</Badge>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {/* Description */}
          <Card>
            <CardHeader title="Report"
              subtitle={complaint.creator ? `Reported by ${complaint.creator.full_name}${complaint.creator.identifier ? ` (${complaint.creator.identifier})` : ''}` : undefined} />
            <CardBody className="space-y-4">
              <p className="whitespace-pre-wrap text-sm text-slate-700">{complaint.description}</p>
              {complaint.ai_summary && (
                <div className="rounded-lg border border-accent-200 bg-accent-50/50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-accent-700">AI intake</p>
                  <p className="mt-1 text-sm text-slate-700">{complaint.ai_summary}</p>
                  {complaint.ai_reasoning && (
                    <p className="mt-1 text-xs italic text-slate-500">{complaint.ai_reasoning}</p>
                  )}
                </div>
              )}
              {images.length > 0 && (
                <div className="flex flex-wrap gap-3">
                  {images.map((img) => (
                    <a key={img.id} href={img.url} target="_blank" rel="noreferrer">
                      <img src={img.url} alt="Attachment" className="h-28 w-28 rounded-lg border border-slate-200 object-cover" />
                    </a>
                  ))}
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
          <TicketUpgrade complaintId={complaint.id} role={profile?.role} events={events} />

          {/* Duplicate suggestions */}
          {links.length > 0 && (
            <Card>
              <CardHeader title="Possible related tickets" subtitle="Review similarity suggestions — nothing is merged automatically." />
              <CardBody className="space-y-3">
                {links.map((l) => {
                  const rel = (l as unknown as { related?: { ticket_number: string; title: string; status: ComplaintStatus; location: string } }).related;
                  return (
                    <div key={l.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 p-3">
                      <div className="min-w-0 flex-1">
                        <Link to={`/staff/complaints/${l.related_complaint_id}`} className="font-mono text-xs font-semibold text-brand-700 hover:underline">
                          {rel?.ticket_number ?? 'ticket'}
                        </Link>
                        <p className="truncate text-sm text-slate-700">{rel?.title}</p>
                        <p className="text-xs text-slate-400">
                          {rel?.location} · similarity {l.score != null ? Math.round(Number(l.score) * 100) : '—'}%
                        </p>
                      </div>
                      {rel && <StatusBadge status={rel.status} />}
                      {l.review_status === 'pending' ? (
                        <div className="flex gap-2">
                          <Button size="sm" variant="secondary" loading={acting}
                            onClick={() => act({ action: 'review_link', link_id: l.id, review: 'confirmed' }, 'Marked as related')}>
                            Related
                          </Button>
                          <Button size="sm" variant="ghost" loading={acting}
                            onClick={() => act({ action: 'review_link', link_id: l.id, review: 'dismissed' }, 'Suggestion dismissed')}>
                            Dismiss
                          </Button>
                        </div>
                      ) : (
                        <Badge className={l.review_status === 'confirmed' ? 'bg-emerald-100 text-emerald-700 ring-emerald-200' : 'bg-slate-100 text-slate-500 ring-slate-200'}>
                          {l.review_status}
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </CardBody>
            </Card>
          )}

          {/* AI analysis + solutions */}
          <AiAnalysisPanel c={complaint} onChange={load} />
          <SolutionsPanel c={complaint} onChange={load} />

          {/* Timeline */}
          <Card>
            <CardHeader title="Event history" subtitle="Full audit trail — internal notes are staff-only." />
            <CardBody><ComplaintTimeline events={events} /></CardBody>
          </Card>
        </div>

        {/* Actions column */}
        <div className="space-y-4">
          <ComplaintMetaCard c={complaint} />
          <CommunitySignal c={complaint} />
          {complaint.submission_type === 'request' && <RequestFlow c={complaint} onChange={load} />}
          <ModerationControl c={complaint} onChange={load} />
          <SurveyLauncher c={complaint} />

          <Card className="space-y-3 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Priority & impact</p>
            <PriorityPanel complaintId={complaint.id} />
            <div className="space-y-2 border-t border-slate-100 pt-3">
              <Select value={prioritySel} onChange={(e) => setPrioritySel(e.target.value)}>
                <option value="">Change priority…</option>
                {(['low', 'medium', 'high', 'urgent'] as const).filter((p) => p !== complaint.priority).map((p) => (
                  <option key={p} value={p}>{p[0]!.toUpperCase() + p.slice(1)}</option>
                ))}
              </Select>
              {prioritySel && (
                <>
                  <Textarea rows={2} value={priorityReason} onChange={(e) => setPriorityReason(e.target.value)}
                    placeholder="Reason for the change (required, recorded in history)" />
                  <Button size="sm" variant="secondary" className="w-full" loading={acting}
                    disabled={priorityReason.trim().length < 5}
                    onClick={async () => {
                      const ok = await act({ action: 'set_priority', priority: prioritySel, reason: priorityReason.trim() }, 'Priority updated');
                      if (ok) { setPrioritySel(''); setPriorityReason(''); }
                    }}>
                    Override priority
                  </Button>
                </>
              )}
            </div>
          </Card>

          <Card className="space-y-3 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Actions</p>
            {(NEXT_ACTIONS[complaint.status] ?? []).map((a) =>
              a.status === 'resolved' ? (
                <Button key={a.status} variant="accent" className="w-full" disabled={!canResolve}
                  onClick={() => setResolveOpen(true)}>
                  {a.label}
                </Button>
              ) : (
                <Button key={a.status} variant={a.variant ?? 'primary'} className="w-full" loading={acting}
                  onClick={() => act({ action: 'set_status', status: a.status }, `Status → ${STATUS_LABELS[a.status]}`)}>
                  {a.label}
                </Button>
              ),
            )}
            <Button variant="secondary" className="w-full" onClick={() => setAssignOpen(true)}>
              Assign / route
            </Button>
          </Card>

          <Card className="space-y-3 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Request more info</p>
            <Textarea rows={2} value={infoQuestion} onChange={(e) => setInfoQuestion(e.target.value)}
              placeholder="Ask the reporter for missing details…" />
            <Button size="sm" variant="secondary" className="w-full" disabled={infoQuestion.trim().length < 5}
              loading={acting}
              onClick={async () => {
                const ok = await act({ action: 'request_info', question: infoQuestion.trim() }, 'Question sent to reporter');
                if (ok) setInfoQuestion('');
              }}>
              Send question
            </Button>
          </Card>

          <Card className="space-y-3 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Add note</p>
            <Textarea rows={3} value={noteText} onChange={(e) => setNoteText(e.target.value)}
              placeholder="Update the reporter or leave an internal remark…" />
            <label className="flex items-center gap-2 text-xs text-slate-500">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300"
                checked={noteInternal} onChange={(e) => setNoteInternal(e.target.checked)} />
              Internal note (hidden from the reporter)
            </label>
            <Button size="sm" variant="secondary" className="w-full" disabled={noteText.trim().length < 2}
              loading={acting}
              onClick={async () => {
                const ok = await act({ action: 'add_note', note: noteText.trim(), is_internal: noteInternal }, 'Note added');
                if (ok) { setNoteText(''); setNoteInternal(false); }
              }}>
              Add note
            </Button>
          </Card>
        </div>
      </div>

      {/* Resolve modal */}
      <Modal open={resolveOpen} onClose={() => setResolveOpen(false)} title={`Resolve ${complaint.ticket_number}`}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Describe how the issue was fixed. The reporter will be asked to verify the fix —
            resolution isn't final until they confirm it.
          </p>
          <Textarea value={resolutionNotes} onChange={(e) => setResolutionNotes(e.target.value)}
            placeholder="Replaced the faulty tap washer and verified no further leaking…" />
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">After photo (optional proof)</label>
            <input
              type="file" accept="image/jpeg,image/png,image/webp"
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-full file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-brand-700"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                if (f && f.size > 4 * 1024 * 1024) { toast('Photo must be under 4 MB', 'error'); return; }
                setProofPhoto(f);
              }}
            />
            {proofPhoto && <p className="mt-1 text-xs text-slate-400">{proofPhoto.name}</p>}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setResolveOpen(false)}>Cancel</Button>
            <Button variant="accent" loading={acting}
              onClick={async () => {
                let photo: { storage_path: string; content_type: string } | undefined;
                if (proofPhoto) {
                  const ext = proofPhoto.name.split('.').pop() ?? 'jpg';
                  const path = `${complaint.institution_id}/${complaint.id}/resolution-${crypto.randomUUID()}.${ext}`;
                  const { error } = await supabase.storage.from('complaint-attachments').upload(path, proofPhoto);
                  if (error) { toast(`Photo upload failed: ${error.message}`, 'error'); return; }
                  photo = { storage_path: path, content_type: proofPhoto.type };
                }
                const ok = await act(
                  { action: 'set_status', status: 'resolved', resolution_notes: resolutionNotes.trim() || null, resolution_photo: photo },
                  'Marked resolved — awaiting student verification',
                );
                if (ok) { setResolveOpen(false); setProofPhoto(null); }
              }}>
              Mark resolved
            </Button>
          </div>
        </div>
      </Modal>

      {/* Assign modal */}
      <Modal open={assignOpen} onClose={() => setAssignOpen(false)} title={`Assign ${complaint.ticket_number}`}>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Department</label>
            <Select value={assignDept} onChange={(e) => setAssignDept(e.target.value)}>
              <option value="">None / unassigned</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Assign to staff member</label>
            <Select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">Unassigned</option>
              {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button loading={acting}
              onClick={async () => {
                const ok = await act(
                  { action: 'assign', assigned_to: assignee || null, department_id: assignDept || null },
                  'Assignment updated',
                );
                if (ok) setAssignOpen(false);
              }}>
              Save assignment
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
