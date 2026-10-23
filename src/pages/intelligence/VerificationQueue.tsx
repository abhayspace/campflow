import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { callFunction } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import type { Complaint, VerificationStatus } from '../../lib/types';

import { Badge, Button, Card, EmptyState, PageHeader, Select, TableSkeleton } from '../../components/ui';
import { StatusBadge, CategoryBadge } from '../../components/complaints';
import { VerificationBadge } from '../../components/intelligence';
import { cx, formatDateTime, hoursSinceLabel } from '../../lib/utils';

type Row = Complaint & { creator?: { full_name: string } | null; resolver?: { full_name: string } | null };

export default function VerificationQueue() {
  const { toast: push } = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState<'awaiting' | 'all' | VerificationStatus>('awaiting');
  const [busy, setBusy] = useState('');

  const load = async () => {
    const { data } = await supabase
      .from('complaints')
      .select('*, creator:profiles!complaints_created_by_fkey(full_name), resolver:profiles!complaints_assigned_to_fkey(full_name)')
      .not('verification', 'is', null)
      .order('resolved_at', { ascending: false });
    setRows((data ?? []) as unknown as Row[]);
  };
  useEffect(() => { void load(); }, []);

  const list = useMemo(() => {
    const r = rows ?? [];
    if (filter === 'all') return r;
    if (filter === 'awaiting') return r.filter((c) => c.verification === 'awaiting_verification' || c.verification === 'reopen_requested');
    return r.filter((c) => c.verification === filter);
  }, [rows, filter]);

  const stats = useMemo(() => ({
    awaiting: (rows ?? []).filter((c) => c.verification === 'awaiting_verification').length,
    requested: (rows ?? []).filter((c) => c.verification === 'reopen_requested').length,
    confirmed: (rows ?? []).filter((c) => c.verification === 'confirmed').length,
    stale: (rows ?? []).filter((c) => c.verification === 'awaiting_verification' && c.resolved_at
      && Date.now() - new Date(c.resolved_at).getTime() > 3 * 86_400_000).length,
  }), [rows]);

  const reopen = async (c: Row) => {
    setBusy(c.id);
    try {
      await callFunction('update-complaint', { complaint_id: c.id, action: 'request_reopen', status: 'reopened' });
      push(`${c.ticket_number} reopened`, 'success');
      await load();
    } catch (e) { push((e as Error).message, 'error'); }
    setBusy('');
  };

  if (!rows) return <TableSkeleton />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Resolution Verification"
        subtitle="A resolution only counts when the reporter confirms it. Silence is not proof of a fix."
        actions={
          <Select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="!w-auto">
            <option value="awaiting">Needs attention</option>
            <option value="awaiting_verification">Awaiting verification</option>
            <option value="reopen_requested">Reopening requested</option>
            <option value="confirmed">Student confirmed</option>
            <option value="expired">Unverified / expired</option>
            <option value="all">All</option>
          </Select>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Awaiting student', stats.awaiting, 'text-sky-600'],
          ['Reopen requested', stats.requested, 'text-orange-600'],
          ['Stale >3 days', stats.stale, 'text-red-600'],
          ['Confirmed', stats.confirmed, 'text-emerald-600'],
        ].map(([label, v, cls]) => (
          <Card key={label as string} className="px-4 py-3">
            <p className="text-xs font-semibold text-slate-500">{label}</p>
            <p className={cx('mt-0.5 text-2xl font-extrabold tabular-nums', cls as string)}>{v}</p>
          </Card>
        ))}
      </div>

      {list.length === 0 ? (
        <Card><EmptyState title="Nothing in this view" message="Resolved tickets awaiting student verification will appear here." /></Card>
      ) : (
        <div className="space-y-3">
          {list.map((c) => {
            const stale = c.verification === 'awaiting_verification' && c.resolved_at
              && Date.now() - new Date(c.resolved_at).getTime() > 3 * 86_400_000;
            return (
              <Card key={c.id} className="p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Link to={`/staff/complaints/${c.id}`} className="font-mono text-xs font-bold text-brand-600 hover:underline">{c.ticket_number}</Link>
                  <StatusBadge status={c.status} />
                  <VerificationBadge status={c.verification} />
                  <CategoryBadge category={c.category} />
                  {stale && <Badge className="bg-red-100 text-red-700 ring-red-200">no response — unverified</Badge>}
                  <span className="ml-auto text-xs text-slate-400">
                    resolved {c.resolved_at ? hoursSinceLabel(c.resolved_at) : '—'}
                  </span>
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-800">{c.title}</p>
                <p className="text-xs text-slate-400">
                  {c.location} · reported by {c.creator?.full_name ?? 'student'}
                  {c.resolver?.full_name ? ` · resolved by ${c.resolver.full_name}` : ''}
                  {c.resolved_at ? ` · ${formatDateTime(c.resolved_at)}` : ''}
                </p>
                {c.resolution_notes && (
                  <p className="mt-2 rounded-xl bg-emerald-50/70 px-3 py-2 text-xs text-slate-600">
                    <b className="text-emerald-800">Resolution notes:</b> {c.resolution_notes}
                  </p>
                )}
                {c.verification === 'reopen_requested' && (
                  <div className="mt-3 flex gap-2">
                    <Link to={`/staff/complaints/${c.id}`}><Button size="sm">Review & resume work</Button></Link>
                  </div>
                )}
                {stale && c.status === 'resolved' && (
                  <div className="mt-3 flex items-center gap-3">
                    <p className="text-xs text-slate-500">No response after 3 days. It stays unresolved until the student confirms.</p>
                    <Button size="sm" variant="secondary" loading={busy === c.id} onClick={() => reopen(c)}>Reopen manually</Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
