import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Complaint, PriorityExplanation, VerificationStatus } from '../lib/types';
import { VERIFICATION_LABELS } from '../lib/types';
import { META_CHIP, STATUS_CHIP, cx } from '../lib/utils';
import { dueLabel } from '../lib/campus';
import { Badge } from './ui';
export { dueLabel };

/* ---- Verification status badge ---- */
const V_STYLES: Record<VerificationStatus, string> = {
  awaiting_verification: META_CHIP,
  confirmed: STATUS_CHIP,
  reopen_requested: STATUS_CHIP,
  expired: META_CHIP,
};

export function VerificationBadge({ status }: { status: VerificationStatus | null | undefined }) {
  if (!status) return null;
  return <Badge className={V_STYLES[status]}>{VERIFICATION_LABELS[status]}</Badge>;
}

/* ---- Due / overdue chip ---- */
export function DueBadge({ c }: { c: Complaint }) {
  const d = dueLabel(c.due_at, c.status);
  if (!d) return null;
  return (
    <Badge className={d.tone === 'late' ? STATUS_CHIP : META_CHIP}>{d.text}</Badge>
  );
}

/* ---- Escalation level chip ---- */
export function EscalationBadge({ level }: { level: number }) {
  if (!level) return null;
  return <Badge className={STATUS_CHIP}>Escalated L{level}</Badge>;
}

/* ---- Explainable priority score panel ---- */
const LEVEL_STYLES: Record<string, string> = {
  critical: 'bg-red-600',
  high: 'bg-orange-500',
  medium: 'bg-amber-400',
  low: 'bg-emerald-500',
};

export function PriorityPanel({ complaintId }: { complaintId: string }) {
  const [data, setData] = useState<PriorityExplanation | null | 'loading' | 'unavailable'>('loading');

  useEffect(() => {
    setData('loading');
    supabase
      .rpc('priority_explanation', { p_complaint: complaintId })
      .then(({ data, error }) => setData(error || !data ? 'unavailable' : (data as PriorityExplanation)));
  }, [complaintId]);

  if (data === 'loading') return <p className="text-xs text-slate-400">Scoring ticket…</p>;
  if (data === 'unavailable' || !data) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div className={cx('h-full rounded-full transition-all', LEVEL_STYLES[data.level])} style={{ width: `${data.score}%` }} />
        </div>
        <span className="text-sm font-extrabold tabular-nums text-slate-900">{data.score}</span>
        <Badge className={cx(
          data.level === 'critical' ? 'bg-red-100 text-red-700 ring-red-200'
            : data.level === 'high' ? 'bg-orange-100 text-orange-700 ring-orange-200'
            : data.level === 'medium' ? 'bg-amber-100 text-amber-800 ring-amber-200'
            : 'bg-emerald-100 text-emerald-700 ring-emerald-200',
        )}>{data.level}</Badge>
      </div>
      <ul className="space-y-1.5">
        {data.factors.map((f, i) => (
          <li key={i} className="flex items-baseline justify-between gap-3 text-xs">
            <span className="text-slate-600"><b className="font-semibold text-slate-800">{f.factor}</b> — {f.detail}</span>
            <span className="shrink-0 font-bold text-brand-600">+{f.points}</span>
          </li>
        ))}
      </ul>
      <p className="rounded-xl bg-brand-50 px-3 py-2 text-xs font-medium text-brand-800">
        Recommended: {data.recommended_action}
      </p>
    </div>
  );
}
