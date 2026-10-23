import { useCallback, useEffect, useState } from 'react';
import { callFunction } from '../lib/api';
import { timeAgo } from '../lib/utils';
import GeminiMark from './GeminiMark';
import { Button, Card, CardBody, Modal, Textarea } from './ui';

interface Hypothesis {
  text: string;
  evidence: string;
}

interface StaffDetail {
  hypotheses: Hypothesis[];
  investigation_steps: string[];
  related_complaints: { ticket_number: string; title: string; status: string }[];
  prior_resolutions: string[];
  recurring_notes: string | null;
  escalation_notes: string | null;
}

interface Recommendation {
  id: string;
  problem_summary: string;
  recommended_solution: string;
  action_steps: string[];
  suggested_department_name: string | null;
  suggested_priority: string | null;
  priority_reason: string | null;
  effort_estimate: string | null;
  missing_information: string[];
  confidence_notes: string;
  recommendation_status: 'suggested' | 'accepted' | 'modified' | 'rejected';
  modified_solution: string | null;
  action_summary: string | null;
  action_recorded_at: string | null;
  model_identifier: string;
  updated_at: string;
  staff: StaffDetail | null;
}

const STATUS: Record<Recommendation['recommendation_status'], string> = {
  suggested: 'Suggested',
  accepted: 'Accepted for consideration',
  modified: 'Modified by staff',
  rejected: 'Not used',
};

export default function GeminiSolution({
  complaintId,
  canAddDetail = true,
  onChange,
}: {
  complaintId: string;
  canAddDetail?: boolean;
  onChange?: () => void;
}) {
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [canDecide, setCanDecide] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [modifyOpen, setModifyOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [actionOpen, setActionOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [steps, setSteps] = useState('');
  const [reason, setReason] = useState('');
  const [summary, setSummary] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await callFunction<{ recommendation: Recommendation | null; can_decide: boolean }>('ai-recommendation', {
        action: 'load',
        complaint_id: complaintId,
      });
      setRecommendation(result.recommendation);
      setCanDecide(result.can_decide);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The recommendation could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [complaintId]);

  useEffect(() => { void load(); }, [load]);

  const run = async (label: string, body: Record<string, unknown>) => {
    if (busy) return;
    setBusy(label);
    setError(null);
    try {
      const result = await callFunction<{ recommendation: Recommendation | null; can_decide: boolean }>('ai-recommendation', {
        complaint_id: complaintId,
        ...body,
      });
      setRecommendation(result.recommendation);
      setCanDecide(result.can_decide);
      setMoreOpen(false);
      setModifyOpen(false);
      setRejectOpen(false);
      setActionOpen(false);
      onChange?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The assistant could not complete that request.');
    } finally {
      setBusy(null);
    }
  };

  const askMore = async () => {
    if (busy || draft.trim().length < 5) return;
    setBusy('more');
    setError(null);
    try {
      await callFunction('update-complaint', canDecide
        ? { complaint_id: complaintId, action: 'request_info', question: draft.trim() }
        : { complaint_id: complaintId, action: 'add_note', note: draft.trim() });
      setMoreOpen(false);
      onChange?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The request could not be saved.');
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    if (!recommendation) return;
    const lines = [
      'Flow AI — Suggested Solution',
      'This is a suggestion, not a confirmed diagnosis or a completed repair.',
      '',
      `Problem: ${recommendation.problem_summary}`,
      `Recommended solution: ${recommendation.modified_solution || recommendation.recommended_solution}`,
      '',
      'Steps:',
      ...recommendation.action_steps.map((step, index) => `${index + 1}. ${step}`),
      '',
      `Department: ${recommendation.suggested_department_name ?? 'No configured department matched.'}`,
      `Urgency: ${recommendation.suggested_priority ?? 'not suggested'} — ${recommendation.priority_reason ?? ''}`,
      `Effort: ${recommendation.effort_estimate ?? 'Not enough information'}`,
      '',
      recommendation.missing_information.length
        ? `Still needed: ${recommendation.missing_information.join('; ')}`
        : 'No missing details were listed.',
      recommendation.confidence_notes,
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard may be blocked */ }
  };

  const plan = recommendation?.modified_solution || recommendation?.recommended_solution;

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <GeminiMark size={22} />
            <div>
              <h2 className="text-base font-extrabold tracking-tight text-slate-900">Flow AI — Suggested Solution</h2>
              <p className="mt-0.5 text-xs text-slate-500">A suggestion for review. It is not a confirmed diagnosis, and it does not resolve the complaint.</p>
            </div>
          </div>
          {recommendation && (
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-600">
              {STATUS[recommendation.recommendation_status]}
            </span>
          )}
        </div>

        {loading && <p className="text-sm text-slate-400">Checking for a saved recommendation…</p>}

        {!loading && !recommendation && !error && (
          <div className="rounded-2xl bg-slate-50 px-4 py-4">
            <p className="text-sm text-slate-600">No suggestion has been generated for this complaint yet. Flow uses the report, photos you can access, and configured departments. It will not invent a department or a repair cost.</p>
            <Button className="mt-3" size="sm" loading={busy === 'generate'} onClick={() => void run('generate', { action: 'generate' })}>
              Generate Recommendation
            </Button>
          </div>
        )}

        {recommendation && (
          <div className="space-y-4">
            <p className="text-[11px] text-slate-400">
              Generated {timeAgo(recommendation.updated_at)} · {recommendation.model_identifier} · suggestion, not a verified fact
            </p>
            <Section title="Problem understanding" body={recommendation.problem_summary} />
            <Section title="Recommended solution" body={plan ?? ''} />
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Step-by-step action plan</p>
              <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-slate-700">
                {recommendation.action_steps.map((step) => <li key={step}>{step}</li>)}
              </ol>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Fact label="Responsible department" value={recommendation.suggested_department_name ?? 'No configured department matched.'} />
              <Fact label="Priority and urgency" value={`${recommendation.suggested_priority ?? 'not set'} — ${recommendation.priority_reason ?? ''}`} />
              <Fact label="Estimated effort" value={recommendation.effort_estimate ?? 'Not enough information'} />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Additional information needed</p>
              {recommendation.missing_information.length === 0 ? (
                <p className="mt-1 text-sm text-slate-600">Flow did not list a missing detail. Staff can still ask a question.</p>
              ) : (
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
                  {recommendation.missing_information.map((item) => <li key={item}>{item}</li>)}
                </ul>
              )}
            </div>
            <Section title="Confidence and limitations" body={recommendation.confidence_notes} />

            {recommendation.staff && (
              <div className="space-y-3 rounded-2xl bg-slate-50 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Staff view — hypotheses, not findings</p>
                {recommendation.staff.investigation_steps.length > 0 && (
                  <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
                    {recommendation.staff.investigation_steps.map((step) => <li key={step}>{step}</li>)}
                  </ol>
                )}
                {recommendation.staff.hypotheses.map((item) => (
                  <p key={item.text} className="text-sm text-slate-700">
                    <span className="font-semibold">Hypothesis:</span> {item.text}
                    {item.evidence && <span className="block text-xs text-slate-500">Based on: {item.evidence}</span>}
                  </p>
                ))}
                {recommendation.staff.related_complaints.length > 0 && (
                  <p className="text-sm text-slate-600">
                    Related reports: {recommendation.staff.related_complaints.map((item) => `${item.ticket_number} (${item.status})`).join(', ')}
                  </p>
                )}
                {recommendation.staff.prior_resolutions.length > 0 && (
                  <p className="text-sm text-slate-600">Earlier resolution notes: {recommendation.staff.prior_resolutions.join(' · ')}</p>
                )}
                {recommendation.staff.recurring_notes && <p className="text-sm text-slate-600">{recommendation.staff.recurring_notes}</p>}
                {recommendation.staff.escalation_notes && <p className="text-sm text-slate-600">{recommendation.staff.escalation_notes}</p>}
              </div>
            )}

            {recommendation.action_summary && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Work recorded — complaint still open</p>
                <p className="mt-1 text-sm text-slate-700">{recommendation.action_summary}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {(canDecide || (recommendation.recommendation_status === 'suggested' && !recommendation.action_summary)) && (
                <Button size="sm" variant="secondary" loading={busy === 'regenerate'} onClick={() => void run('regenerate', { action: 'generate', regenerate: true })}>
                  Regenerate
                </Button>
              )}
              <Button size="sm" variant="secondary" onClick={() => void copy()}>{copied ? 'Copied' : 'Copy Solution'}</Button>
              <Button size="sm" variant="secondary" onClick={() => { setDraft(recommendation.missing_information.join('\n')); setMoreOpen(true); }}>
                Request More Information
              </Button>
              {canDecide && (
                <>
                  <Button size="sm" loading={busy === 'accept'} onClick={() => void run('accept', { action: 'decide', decision: 'accepted' })}>
                    Accept Suggestion
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => { setDraft(plan ?? ''); setSteps(recommendation.action_steps.join('\n')); setModifyOpen(true); }}>
                    Modify Solution
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setReason(''); setRejectOpen(true); }}>Reject Suggestion</Button>
                  <Button size="sm" variant="secondary" onClick={() => { setSummary(''); setActionOpen(true); }}>Mark as Action Taken</Button>
                </>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-2xl bg-red-50 px-3 py-3 text-sm text-red-700">
            <p>{error}</p>
            <p className="mt-1 text-xs">You can still add notes and use the usual status controls. Accepting a suggestion never resolves the complaint.</p>
            <Button className="mt-2" size="sm" variant="secondary" loading={Boolean(busy)} onClick={() => void (recommendation ? run('regenerate', { action: 'generate', regenerate: true }) : run('generate', { action: 'generate' }))}>
              Retry
            </Button>
          </div>
        )}
      </CardBody>

      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="Request more information">
        <p className="text-sm text-slate-600">
          {canDecide
            ? 'This asks the reporter for the missing details. It does not change the complaint status.'
            : canAddDetail
              ? 'Add the missing detail to this complaint. It is saved as a note on the ticket.'
              : 'These are the details Flow still needs. Only the reporter can add them from their own ticket.'}
        </p>
        {(canDecide || canAddDetail) && (
          <Textarea className="mt-3" rows={4} value={draft} onChange={(event) => setDraft(event.target.value)} />
        )}
        {!canDecide && !canAddDetail && recommendation && (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
            {(recommendation.missing_information.length ? recommendation.missing_information : ['No missing detail was listed.']).map((item) => <li key={item}>{item}</li>)}
          </ul>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setMoreOpen(false)}>Close</Button>
          {(canDecide || canAddDetail) && (
            <Button loading={busy === 'more'} disabled={draft.trim().length < 5} onClick={() => void askMore()}>
              {canDecide ? 'Ask the reporter' : 'Add this detail'}
            </Button>
          )}
        </div>
      </Modal>

      <Modal open={modifyOpen} onClose={() => setModifyOpen(false)} title="Modify the suggestion">
        <p className="text-sm text-slate-600">Saving this records your plan. It does not resolve the complaint.</p>
        <Textarea className="mt-3" rows={4} value={draft} onChange={(event) => setDraft(event.target.value)} />
        <p className="mt-3 text-xs font-semibold text-slate-500">Steps, one per line</p>
        <Textarea className="mt-1" rows={4} value={steps} onChange={(event) => setSteps(event.target.value)} />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setModifyOpen(false)}>Cancel</Button>
          <Button
            loading={busy === 'modify'}
            disabled={draft.trim().length < 8}
            onClick={() => void run('modify', {
              action: 'decide',
              decision: 'modified',
              modified_solution: draft.trim(),
              action_steps: steps.split('\n').map((line) => line.trim()).filter(Boolean),
            })}
          >
            Save modified plan
          </Button>
        </div>
      </Modal>

      <Modal open={rejectOpen} onClose={() => setRejectOpen(false)} title="Reject the suggestion">
        <p className="text-sm text-slate-600">The reason stays with staff. The reporter only sees that the suggestion was not used.</p>
        <Textarea className="mt-3" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Optional reason" />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setRejectOpen(false)}>Cancel</Button>
          <Button loading={busy === 'reject'} onClick={() => void run('reject', { action: 'decide', decision: 'rejected', reason: reason.trim() })}>
            Reject suggestion
          </Button>
        </div>
      </Modal>

      <Modal open={actionOpen} onClose={() => setActionOpen(false)} title="Record the action taken">
        <p className="text-sm text-slate-600">This records what was actually done. The complaint stays open until the existing resolution workflow is finished.</p>
        <Textarea className="mt-3" rows={3} value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="What was done?" />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setActionOpen(false)}>Cancel</Button>
          <Button
            loading={busy === 'action'}
            disabled={summary.trim().length < 8}
            onClick={() => void run('action', { action: 'action_taken', summary: summary.trim() })}
          >
            Save action
          </Button>
        </div>
      </Modal>
    </Card>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{title}</p>
      <p className="mt-1 text-sm leading-relaxed text-slate-700">{body}</p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-sm text-slate-700">{value}</p>
    </div>
  );
}
