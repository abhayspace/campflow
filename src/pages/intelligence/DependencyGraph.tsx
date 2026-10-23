import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { callFunction } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { CATEGORIES } from '../../lib/types';
import { Button, Card, EmptyState, PageHeader, Select } from '../../components/ui';
import { cx } from '../../lib/utils';

const STYLE: Record<string, string> = {
  pending: 'stroke-amber-500',
  confirmed: 'stroke-emerald-600',
  dismissed: 'stroke-slate-300',
};

export default function DependencyGraph() {
  const [rows, setRows] = useState<any[]>([]);
  const [names, setNames] = useState<Map<string, { ticket: string; title: string }>>(new Map());
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [complaintId, setComplaintId] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    let query = supabase.from('issue_relationships').select('*').order('created_at', { ascending: false }).limit(80);
    if (status) query = query.eq('review_status', status);
    const { data } = await query;
    const list = data ?? [];
    setRows(list);
    const ids = [...new Set(list.flatMap((row) => [row.from_complaint_id, row.to_complaint_id]))];
    if (!ids.length) return;
    const { data: tickets } = await supabase.from('complaints').select('id, ticket_number, title, category').in('id', ids);
    setNames(new Map((tickets ?? []).filter((row) => !category || row.category === category).map((row) => [row.id, { ticket: row.ticket_number, title: row.title }])));
  }

  useEffect(() => { void load(); }, [status, category]);

  const visible = useMemo(() => rows.filter((row) => !category || names.has(row.from_complaint_id) || names.has(row.to_complaint_id)), [rows, names, category]);

  async function suggest() {
    setMessage(null);
    try {
      const result = await callFunction<{ created: number }>('campus-upgrade', { action: 'graph_suggest', complaint_id: complaintId });
      setMessage(`${result.created} hypothesis row(s) saved. Nothing was merged.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not suggest links');
    }
  }

  async function review(id: string, reviewStatus: string) {
    await callFunction('campus-upgrade', { action: 'graph_review', id, review: reviewStatus });
    await load();
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Dependency graph" subtitle="Possible connections for staff to review. A line is not a confirmed cause, and complaints are never merged automatically." />
      <Card className="flex flex-wrap items-center gap-2 px-4 py-3">
        <Select value={status} onChange={(event) => setStatus(event.target.value)} className="!w-auto">
          <option value="">Any review</option>
          <option value="pending">Proposed</option>
          <option value="confirmed">Confirmed</option>
          <option value="dismissed">Dismissed</option>
        </Select>
        <Select value={category} onChange={(event) => setCategory(event.target.value)} className="!w-auto">
          <option value="">Any category</option>
          {CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </Select>
        <input value={complaintId} onChange={(event) => setComplaintId(event.target.value)} placeholder="Complaint id to compare" className="h-10 rounded-xl border border-slate-200 px-3 text-sm" />
        <Button size="sm" onClick={() => void suggest()}>Suggest from this ticket</Button>
      </Card>
      {message && <p className="text-sm text-slate-600">{message}</p>}
      {visible.length === 0 && <EmptyState title="No relationships yet" message="Suggest links from a complaint, or confirm a recurrence review." />}
      <svg viewBox="0 0 800 220" className="w-full rounded-[22px] bg-slate-50">
        {visible.slice(0, 8).map((row, index) => (
          <line key={row.id} x1={80} y1={30 + index * 24} x2={520} y2={30 + index * 24} className={cx('fill-none stroke-2', STYLE[row.review_status] ?? 'stroke-slate-400')} />
        ))}
      </svg>
      <ul className="space-y-2">
        {visible.map((row) => (
          <li key={row.id} className="rounded-2xl bg-white px-4 py-3 ring-1 ring-slate-100">
            <p className="text-sm font-semibold">
              <Link to={`/staff/complaints/${row.from_complaint_id}`}>{names.get(row.from_complaint_id)?.ticket ?? 'Ticket'}</Link>
              {' → '}
              <Link to={`/staff/complaints/${row.to_complaint_id}`}>{names.get(row.to_complaint_id)?.ticket ?? 'Ticket'}</Link>
              <span className="ml-2 text-xs uppercase text-slate-400">{row.review_status}</span>
            </p>
            <p className="text-xs text-slate-600">{row.explanation}</p>
            <p className="text-xs text-slate-400">Evidence: {row.evidence}. Uncertainty: {row.uncertainty}.</p>
            {row.review_status === 'pending' && (
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => void review(row.id, 'confirmed')}>Confirm hypothesis</Button>
                <Button size="sm" variant="ghost" onClick={() => void review(row.id, 'dismissed')}>Dismiss</Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
