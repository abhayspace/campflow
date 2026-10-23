// Staff workspace panels: request approval flow, AI analysis, solution
// decisions, community signal, and survey launch.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { callFunction } from '../lib/api';
import { REQUEST_NEXT, REQUEST_STATUS_LABELS } from '../lib/types';
import type { AiAnalysis, Complaint, RequestStatus, Solution, VoteCounts } from '../lib/types';
import { Badge, Button, Card, CardBody, CardHeader, Field, Modal, Textarea } from './ui';
import { useToast } from '../context/ToastContext';
import { cx, errorMessage, timeAgo } from '../lib/utils';

// ---------- Request approval workflow ----------
export function RequestFlow({ c, onChange }: { c: Complaint; onChange: () => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [reasonFor, setReasonFor] = useState<RequestStatus | null>(null);
  const [reason, setReason] = useState('');
  const current = (c.request_status ?? 'submitted') as RequestStatus;
  const next = REQUEST_NEXT[current] ?? [];

  const move = async (to: RequestStatus, r?: string) => {
    setBusy(true);
    try {
      await callFunction('manage-request', { complaint_id: c.id, to_status: to, reason: r ?? null });
      toast(`Request → ${REQUEST_STATUS_LABELS[to]}`, 'success');
      onChange();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
      setReasonFor(null);
      setReason('');
    }
  };

  return (
    <Card>
      <CardHeader title="Request workflow" subtitle="Requests move through approval — separate from complaint statuses." />
      <CardBody className="space-y-3">
        <div className="flex items-center gap-2">
          <Badge className="bg-[#171716] text-white ring-[#171716]">{REQUEST_STATUS_LABELS[current]}</Badge>
          {c.request_category_id && <ReqCategoryName id={c.request_category_id} />}
        </div>
        {c.preferred_outcome && (
          <p className="rounded-lg bg-slate-50 p-2.5 text-xs text-slate-600">
            <span className="font-semibold">Preferred outcome:</span> {c.preferred_outcome}
          </p>
        )}
        {next.length === 0 && <p className="text-xs text-slate-400">No further transitions.</p>}
        <div className="flex flex-col gap-2">
          {next.map((n) => (
            <Button key={n.to} size="sm" variant={n.to === 'declined' ? 'danger' : 'secondary'} loading={busy}
              onClick={() => (n.needsReason ? setReasonFor(n.to) : move(n.to))}>
              {n.label} → {REQUEST_STATUS_LABELS[n.to]}
            </Button>
          ))}
        </div>

        <Modal open={reasonFor !== null} onClose={() => setReasonFor(null)} title={reasonFor ? REQUEST_STATUS_LABELS[reasonFor] : ''}>
          <Field label="Reason" required hint="Shown to the requester; public for campus-wide requests.">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} autoFocus />
          </Field>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setReasonFor(null)}>Cancel</Button>
            <Button disabled={reason.trim().length < 5} loading={busy}
              onClick={() => reasonFor && move(reasonFor, reason.trim())}>Confirm</Button>
          </div>
        </Modal>
      </CardBody>
    </Card>
  );
}

function ReqCategoryName({ id }: { id: string }) {
  const [name, setName] = useState('');
  useEffect(() => {
    supabase.from('request_categories').select('name').eq('id', id).maybeSingle()
      .then(({ data }) => data && setName(data.name));
  }, [id]);
  return name ? <Badge>{name}</Badge> : null;
}

// ---------- Community signal ----------
export function CommunitySignal({ c }: { c: Complaint }) {
  const [counts, setCounts] = useState<VoteCounts | null>(null);
  useEffect(() => {
    if (c.visibility !== 'campus') return;
    supabase.rpc('vote_counts', { p_ids: [c.id] }).then(({ data }) => {
      const row = (data ?? [])[0] as (VoteCounts & { complaint_id: string }) | undefined;
      if (row) setCounts({ supporters: row.supporters, affected: row.affected, reports: row.reports });
      else setCounts({ supporters: 0, affected: 0, reports: 0 });
    });
  }, [c.id, c.visibility]);

  if (c.visibility !== 'campus') return null;
  return (
    <Card>
      <CardHeader title="Community signal" subtitle="Support informs prioritization — it doesn't prove an allegation." />
      <CardBody>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-lg font-bold text-slate-900">{counts?.supporters ?? '—'}</p>
            <p className="text-[11px] text-slate-400">supporters</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-lg font-bold text-slate-900">{counts?.affected ?? '—'}</p>
            <p className="text-[11px] text-slate-400">affected</p>
          </div>
          <div className="rounded-xl bg-red-50 p-3">
            <p className="text-lg font-bold text-red-600">{counts?.reports ?? '—'}</p>
            <p className="text-[11px] text-slate-400">reports</p>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

// ---------- AI analysis ----------
export function AiAnalysisPanel({ c, onChange }: { c: Complaint; onChange: () => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const a = c.ai_analysis as AiAnalysis | null;

  const run = async () => {
    setBusy(true);
    try {
      await callFunction('ai-solutions', { complaint_id: c.id });
      toast('AI analysis generated', 'success');
      onChange();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="AI analysis"
        subtitle="Suggestions for review — nothing here is a confirmed fact or an approval."
        action={<Button size="sm" variant="secondary" loading={busy} onClick={run}>{a ? 'Regenerate' : 'Analyze with AI'}</Button>}
      />
      <CardBody className="space-y-4">
        {!a && <p className="text-sm text-slate-400">No analysis yet — run it to get a structured breakdown, hypotheses, and suggested solutions.</p>}
        {a?.problem_statement && <p className="text-sm font-medium text-slate-800">{a.problem_statement}</p>}
        {!!a?.known_facts?.length && (
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Known facts</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm text-slate-600">{a.known_facts.map((f, i) => <li key={i}>{f}</li>)}</ul>
          </div>
        )}
        {!!a?.missing_information?.length && (
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Missing information</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm text-slate-600">{a.missing_information.map((f, i) => <li key={i}>{f}</li>)}</ul>
          </div>
        )}
        {!!a?.hypotheses?.length && (
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Hypotheses — unverified</p>
            <ul className="mt-1 space-y-1.5">
              {a.hypotheses.map((h, i) => (
                <li key={i} className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-slate-700">
                  {h.text}
                  <span className="ml-1 text-[11px] font-semibold uppercase text-amber-700">({h.confidence})</span>
                  {h.evidence && <span className="block text-[11px] text-slate-400">evidence: {h.evidence}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {!!a?.suggested_steps?.length && (
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Suggested next steps</p>
            <ol className="mt-1 list-inside list-decimal space-y-0.5 text-sm text-slate-600">{a.suggested_steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
          </div>
        )}
        {(a?.suggested_priority || a?.suggested_department) && (
          <div className="flex flex-wrap gap-2 text-xs">
            {a.suggested_priority && <Badge className="bg-slate-100 text-slate-700 ring-slate-200">suggested: {a.suggested_priority}</Badge>}
            {a.suggested_department && <Badge className="bg-slate-100 text-slate-700 ring-slate-200">dept: {a.suggested_department}</Badge>}
            {a.priority_reason && <span className="text-slate-400">{a.priority_reason}</span>}
          </div>
        )}
        {a?.request_extras && (
          <div className="space-y-2 rounded-xl border border-violet-200 bg-violet-50/50 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-violet-700">Request analysis</p>
            {a.request_extras.intended_benefit && <p className="text-sm text-slate-700"><span className="font-semibold">Benefit:</span> {a.request_extras.intended_benefit}</p>}
            {!!a.request_extras.affected_groups?.length && <p className="text-sm text-slate-600"><span className="font-semibold">Affects:</span> {a.request_extras.affected_groups.join(', ')}</p>}
            {!!a.request_extras.questions_for_staff?.length && (
              <div>
                <p className="text-xs font-semibold text-slate-500">Questions to consider</p>
                <ul className="list-inside list-disc text-sm text-slate-600">{a.request_extras.questions_for_staff.map((q, i) => <li key={i}>{q}</li>)}</ul>
              </div>
            )}
            {!!a.request_extras.implementation_approaches?.length && (
              <div>
                <p className="text-xs font-semibold text-slate-500">Possible approaches</p>
                <ul className="list-inside list-disc text-sm text-slate-600">{a.request_extras.implementation_approaches.map((q, i) => <li key={i}>{q}</li>)}</ul>
              </div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// ---------- Solutions ----------
export function SolutionsPanel({ c, onChange }: { c: Complaint; onChange: () => void }) {
  const { toast } = useToast();
  const [solutions, setSolutions] = useState<Solution[]>([]);
  const [newSolution, setNewSolution] = useState('');
  const [decideFor, setDecideFor] = useState<{ id: string; decision: 'accepted' | 'rejected' } | null>(null);
  const [why, setWhy] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase.from('solutions').select('*').eq('complaint_id', c.id).order('created_at');
    setSolutions((data ?? []) as Solution[]);
  };
  useEffect(() => { void load(); }, [c.id]);

  const add = async () => {
    if (newSolution.trim().length < 5) return;
    setBusy(true);
    try {
      await callFunction('update-complaint', { complaint_id: c.id, action: 'add_solution', solution: newSolution.trim() });
      setNewSolution('');
      await load();
    } catch (e) { toast(errorMessage(e), 'error'); } finally { setBusy(false); }
  };

  const decide = async () => {
    if (!decideFor) return;
    if (decideFor.decision === 'accepted' && why.trim().length < 5) return;
    setBusy(true);
    try {
      await callFunction('update-complaint', {
        complaint_id: c.id, action: 'decide_solution', solution_id: decideFor.id,
        decision: decideFor.decision, reason: why.trim() || null,
      });
      setDecideFor(null); setWhy('');
      await load(); onChange();
    } catch (e) { toast(errorMessage(e), 'error'); } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader title="Solutions" subtitle="AI and staff proposals — staff decide, with a recorded reason." />
      <CardBody className="space-y-3">
        {solutions.length === 0 && <p className="text-sm text-slate-400">No solutions yet — run AI analysis or add one.</p>}
        {solutions.map((s) => (
          <div key={s.id} className={cx('rounded-xl border p-3', s.status === 'accepted' ? 'border-emerald-200 bg-emerald-50/60' : s.status === 'rejected' ? 'border-slate-200 bg-slate-50 opacity-70' : 'border-slate-200')}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm text-slate-800">{s.content}</p>
                <p className="mt-1 text-[11px] text-slate-400">
                  {s.source === 'ai' ? 'AI suggestion — unverified' : 'staff'} · {timeAgo(s.created_at)}
                  {s.decided_reason ? ` · reason: ${s.decided_reason}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {s.status === 'suggested' ? (
                  <>
                    <Button size="sm" onClick={() => setDecideFor({ id: s.id, decision: 'accepted' })}>Accept</Button>
                    <Button size="sm" variant="ghost" onClick={() => setDecideFor({ id: s.id, decision: 'rejected' })}>Reject</Button>
                  </>
                ) : (
                  <Badge className={s.status === 'accepted' ? 'bg-emerald-100 text-emerald-700 ring-emerald-200' : 'bg-slate-100 text-slate-500 ring-slate-200'}>
                    {s.status}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        ))}
        <div className="flex gap-2">
          <Textarea rows={2} value={newSolution} onChange={(e) => setNewSolution(e.target.value)}
            placeholder="Add your own proposed solution…" className="flex-1" />
          <Button variant="secondary" onClick={add} loading={busy} disabled={newSolution.trim().length < 5}>Add</Button>
        </div>

        <Modal open={decideFor !== null} onClose={() => setDecideFor(null)} title={decideFor?.decision === 'accepted' ? 'Accept solution' : 'Reject solution'}>
          <Field label={decideFor?.decision === 'accepted' ? 'Why was this chosen?' : 'Reason'} required={decideFor?.decision === 'accepted'}
            hint="Recorded in the event history.">
            <Textarea value={why} onChange={(e) => setWhy(e.target.value)} rows={3} autoFocus />
          </Field>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDecideFor(null)}>Cancel</Button>
            <Button loading={busy} disabled={decideFor?.decision === 'accepted' && why.trim().length < 5} onClick={decide}>
              Confirm {decideFor?.decision}
            </Button>
          </div>
        </Modal>
      </CardBody>
    </Card>
  );
}

// ---------- Moderation (hide campus content without deleting it) ----------
export function ModerationControl({ c, onChange }: { c: Complaint; onChange: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  if (c.visibility !== 'campus') return null;

  const run = async (action: 'moderate' | 'unmoderate', reason?: string) => {
    setBusy(true);
    try {
      await callFunction('community', { action, complaint_id: c.id, reason });
      toast(action === 'moderate' ? 'Hidden from the community feed' : 'Restored to the community feed', 'success');
      setOpen(false); setNote('');
      onChange();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Moderation" subtitle="Hiding removes it from the public feed — history is preserved." />
      <CardBody className="space-y-2">
        {c.moderated ? (
          <>
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
              Currently hidden{c.moderation_note ? `: ${c.moderation_note}` : ''}
            </p>
            <Button size="sm" variant="secondary" className="w-full" loading={busy} onClick={() => run('unmoderate')}>
              Restore to feed
            </Button>
          </>
        ) : (
          <Button size="sm" variant="secondary" className="w-full" onClick={() => setOpen(true)}>
            Hide from community feed…
          </Button>
        )}
        <Modal open={open} onClose={() => setOpen(false)} title="Hide this submission?">
          <p className="text-sm text-slate-600">
            It disappears from the community feed and voting stops. The record, votes, and audit history are preserved.
            The reporter is notified.
          </p>
          <Field label="Moderation note" required>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} autoFocus
              placeholder="Why is this being hidden?" />
          </Field>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="danger" loading={busy} disabled={note.trim().length < 3}
              onClick={() => run('moderate', note.trim())}>Hide it</Button>
          </div>
        </Modal>
      </CardBody>
    </Card>
  );
}

// ---------- Survey launch ----------
export function SurveyLauncher({ c }: { c: Complaint }) {
  const navigate = useNavigate();
  const eligible = c.status === 'resolved' || (c.submission_type === 'request' && c.request_status === 'implemented');
  return (
    <Card>
      <CardHeader title="Resolution survey" subtitle="Ask the reporter and affected students whether the fix worked." />
      <CardBody className="space-y-3">
        {!eligible && <p className="text-xs text-slate-400">Available once the submission is marked resolved or implemented.</p>}
        {eligible && (
          <Button variant="secondary" size="sm" onClick={() => navigate(`/surveys/new?complaint=${c.id}`)}>
            Build a survey →
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => navigate('/surveys')}>All surveys</Button>
      </CardBody>
    </Card>
  );
}
