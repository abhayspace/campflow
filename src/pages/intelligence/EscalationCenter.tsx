import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { callFunction } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import type { Complaint, EscalationEvent, SlaRule } from '../../lib/types';
import { CATEGORIES, PRIORITY_LABELS } from '../../lib/types';
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, PageHeader, Select, TableSkeleton } from '../../components/ui';
import { DueBadge, EscalationBadge } from '../../components/intelligence';
import { StatusBadge } from '../../components/complaints';
import { cx, formatDateTime, timeAgo } from '../../lib/utils';

type Filter = 'overdue' | 'unassigned' | 'high' | 'reopened' | 'all';

export default function EscalationCenter() {
  const { toast: push } = useToast();
  const [rules, setRules] = useState<SlaRule[] | null>(null);
  const [complaints, setComplaints] = useState<Complaint[] | null>(null);
  const [events, setEvents] = useState<EscalationEvent[]>([]);
  const [filter, setFilter] = useState<Filter>('overdue');
  const [busy, setBusy] = useState(false);
  const [runResult, setRunResult] = useState<string | null>(null);
  const [form, setForm] = useState({ category: '', priority: '', response_hours: '24', resolve_hours: '72', escalate_after_hours: '24' });

  const load = async () => {
    const [{ data: r }, { data: c }, { data: e }] = await Promise.all([
      supabase.from('sla_rules').select('*').order('created_at'),
      supabase.from('complaints').select('*').not('status', 'in', '(resolved,closed)').order('created_at'),
      supabase.from('escalation_events').select('*').order('created_at', { ascending: false }).limit(25),
    ]);
    setRules((r ?? []) as SlaRule[]);
    setComplaints((c ?? []) as Complaint[]);
    setEvents((e ?? []) as EscalationEvent[]);
  };
  useEffect(() => {
    void load();
    // Evaluate SLA rules once per page visit — idempotent, server-side.
    callFunction('run-escalation', {}).catch(() => undefined);
  }, []);

  const runCheck = async () => {
    setBusy(true); setRunResult(null);
    try {
      const r = await callFunction<{ evaluated: number; escalated: number }>('run-escalation', {});
      setRunResult(`Evaluated ${r.evaluated} tickets — ${r.escalated} new escalation${r.escalated === 1 ? '' : 's'}.`);
      await load();
    } catch (e) { push((e as Error).message, 'error'); }
    setBusy(false);
  };

  const saveRule = async () => {
    setBusy(true);
    const { error } = await supabase.from('sla_rules').insert({
      category: form.category || null,
      priority: form.priority || null,
      response_hours: Math.max(1, Number(form.response_hours) || 24),
      resolve_hours: Math.max(1, Number(form.resolve_hours) || 72),
      escalate_after_hours: Math.max(1, Number(form.escalate_after_hours) || 24),
    });
    if (error) push(error.message, 'error');
    else { push('SLA rule added', 'success'); await load(); }
    setBusy(false);
  };

  const toggleRule = async (r: SlaRule) => {
    await supabase.from('sla_rules').update({ is_active: !r.is_active }).eq('id', r.id);
    await load();
  };
  const deleteRule = async (r: SlaRule) => {
    await supabase.from('sla_rules').delete().eq('id', r.id);
    await load();
  };

  const filtered = useMemo(() => {
    const open = complaints ?? [];
    const now = Date.now();
    switch (filter) {
      case 'overdue': return open.filter((c) => c.due_at && new Date(c.due_at).getTime() < now);
      case 'unassigned': return open.filter((c) => !c.assigned_to);
      case 'high': return open.filter((c) => ['high', 'urgent'].includes(c.priority) || c.safety_flagged);
      case 'reopened': return open.filter((c) => c.reopen_count > 0);
      default: return open;
    }
  }, [complaints, filter]);

  if (!rules || !complaints) return <TableSkeleton />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Escalation & Accountability"
        subtitle="Service targets are yours to configure — escalation runs server-side and every event is audited."
        actions={<Button size="sm" variant="secondary" onClick={runCheck} loading={busy}>Run escalation check</Button>}
      />
      {runResult && <p className="rounded-xl bg-brand-50 px-4 py-2.5 text-sm font-medium text-brand-800">{runResult}</p>}

      {/* SLA rules */}
      <Card>
        <CardHeader title="Service-level targets" subtitle="Response and resolution limits per category / priority. Blank applies to all." />
        <CardBody>
          <div className="space-y-2">
            {rules.length === 0 && <EmptyState title="No SLA rules" message="Add your first target below — escalation checks do nothing until a rule exists." />}
            {rules.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-100">
                <Badge className={r.is_active ? 'bg-brand-50 text-brand-700 ring-brand-200' : 'bg-slate-200 text-slate-500 ring-slate-300'}>
                  {r.is_active ? 'active' : 'paused'}
                </Badge>
                <span className="text-sm font-semibold text-slate-800 capitalize">
                  {r.category ?? 'all categories'} · {r.priority ?? 'all priorities'}
                </span>
                <span className="text-xs text-slate-500">
                  respond ≤ {r.response_hours}h · resolve ≤ {r.resolve_hours}h · re-escalate every {r.escalate_after_hours}h
                </span>
                <span className="ml-auto flex gap-2">
                  <button onClick={() => toggleRule(r)} className="text-xs font-semibold text-slate-500 hover:text-slate-800">{r.is_active ? 'Pause' : 'Activate'}</button>
                  <button onClick={() => deleteRule(r)} className="text-xs font-semibold text-red-500 hover:text-red-700">Delete</button>
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3 rounded-2xl bg-slate-50/60 p-4 sm:grid-cols-6">
            <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option value="">All categories</option>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
            <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              <option value="">All priorities</option>
              {Object.entries(PRIORITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
            <Field label="Respond ≤ h"><Input type="number" min={1} value={form.response_hours} onChange={(e) => setForm({ ...form, response_hours: e.target.value })} /></Field>
            <Field label="Resolve ≤ h"><Input type="number" min={1} value={form.resolve_hours} onChange={(e) => setForm({ ...form, resolve_hours: e.target.value })} /></Field>
            <Field label="Re-escalate h"><Input type="number" min={1} value={form.escalate_after_hours} onChange={(e) => setForm({ ...form, escalate_after_hours: e.target.value })} /></Field>
            <div className="flex items-end"><Button onClick={saveRule} loading={busy} className="w-full">Add rule</Button></div>
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Supervisor queue */}
        <Card className="lg:col-span-2">
          <CardHeader title="Supervisor queue"
            action={
              <div className="flex gap-1 rounded-full bg-slate-100 p-1">
                {([['overdue', 'Overdue'], ['unassigned', 'Unassigned'], ['high', 'High priority'], ['reopened', 'Reopened'], ['all', 'All open']] as [Filter, string][]).map(([v, l]) => (
                  <button key={v} onClick={() => setFilter(v)}
                    className={cx('rounded-full px-3 py-1 text-[11px] font-semibold', filter === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500')}>
                    {l}
                  </button>
                ))}
              </div>
            } />
          <CardBody className="space-y-2.5">
            {filtered.length === 0 && <EmptyState title="Queue is clear" message="No open tickets match this filter." />}
            {filtered.map((c) => (
              <Link key={c.id} to={`/staff/complaints/${c.id}`}
                className="block rounded-xl bg-slate-50 p-3.5 ring-1 ring-slate-100 hover:bg-brand-50/60">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-[11px] font-bold text-brand-600">{c.ticket_number}</span>
                  <StatusBadge status={c.status} />
                  <DueBadge c={c} />
                  <EscalationBadge level={c.escalation_level} />
                  {c.safety_flagged && <Badge className="bg-red-100 text-red-700 ring-red-200">safety</Badge>}
                  {c.reopen_count > 0 && <Badge className="bg-orange-100 text-orange-700 ring-orange-200">reopened ×{c.reopen_count}</Badge>}
                  <span className="ml-auto text-[11px] text-slate-400">{timeAgo(c.created_at)}</span>
                </div>
                <p className="mt-1 text-sm font-semibold text-slate-800">{c.title}</p>
                <p className="text-xs text-slate-400">{c.location} · {c.assigned_to ? 'assigned' : 'unassigned'}</p>
              </Link>
            ))}
          </CardBody>
        </Card>

        {/* Escalation history */}
        <Card>
          <CardHeader title="Escalation history" />
          <CardBody>
            {events.length === 0 && <EmptyState title="No escalations yet" />}
            <ul className="space-y-3">
              {events.map((e) => (
                <li key={e.id} className="border-l-2 border-red-200 pl-3 text-xs">
                  <p className="font-semibold text-slate-700">Level {e.level} escalation</p>
                  <p className="text-slate-400">{e.reason.split(':')[0]?.replace(/_/g, ' ')} · {formatDateTime(e.created_at)}</p>
                  <Link to={`/staff/complaints/${e.complaint_id}`} className="font-semibold text-brand-600 hover:underline">View ticket →</Link>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
