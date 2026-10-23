import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import type { Complaint, Department } from '../../lib/types';
import { CATEGORIES, PRIORITY_LABELS, STATUS_LABELS } from '../../lib/types';
import { ALL_BUILDINGS, buildingForLocation, hoursSince } from '../../lib/campus';
import CampusScene from '../../components/CampusScene';
import { DueBadge, EscalationBadge } from '../../components/intelligence';
import { StatusBadge } from '../../components/complaints';
import { Badge, Card, EmptyState, PageHeader, Select, TableSkeleton } from '../../components/ui';
import { cx, formatDateTime, timeAgo } from '../../lib/utils';

const OPEN_STATUSES = ['new', 'assigned', 'in_progress', 'reopened'];

export default function CampusPulse() {
  const { profile, user } = useAuth();
  const [complaints, setComplaints] = useState<Complaint[] | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('open');
  const [priority, setPriority] = useState('');
  const [dept, setDept] = useState('');
  const [range, setRange] = useState('30');

  const load = useCallback(async () => {
    const [{ data: rows }, { data: depts }] = await Promise.all([
      supabase.from('complaints').select('*').order('created_at', { ascending: false }).limit(800),
      supabase.from('departments').select('*'),
    ]);
    setComplaints((rows ?? []) as Complaint[]);
    setDepartments(depts ?? []);
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 12000);
    return () => window.clearInterval(timer);
  }, [load]);

  const filtered = useMemo(() => {
    const cutoff = Date.now() - Number(range) * 86_400_000;
    return (complaints ?? []).filter((c) =>
      new Date(c.created_at).getTime() >= cutoff
      && (!category || c.category === category)
      && (!priority || c.priority === priority)
      && (!dept || c.assigned_department_id === dept)
      && (status === 'all' || (status === 'open' ? OPEN_STATUSES.includes(c.status) : ['resolved', 'closed'].includes(c.status))));
  }, [complaints, category, priority, dept, status, range]);

  const byBuilding = useMemo(() => {
    const map = new Map<string, Complaint[]>();
    for (const c of filtered) {
      const b = buildingForLocation(c.location).id;
      map.set(b, [...(map.get(b) ?? []), c]);
    }
    return map;
  }, [filtered]);

  const stats = useMemo(() => {
    const open = filtered.filter((c) => OPEN_STATUSES.includes(c.status));
    return {
      open: open.length,
      overdue: open.filter((c) => c.due_at && new Date(c.due_at) < new Date()).length,
      recurring: [...byBuilding.values()].filter((l) => l.length > 1).length,
      resolved7d: filtered.filter((c) => c.resolved_at && hoursSince(c.resolved_at) < 168).length,
      critical: open.filter((c) => c.priority === 'urgent' || c.safety_flagged).length,
    };
  }, [filtered, byBuilding]);

  const selectedBuilding = ALL_BUILDINGS.find((b) => b.id === selected);
  const selectedComplaints = selected ? (byBuilding.get(selected) ?? []) : [];

  if (!complaints) return <TableSkeleton />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Campus Pulse"
        subtitle="An isometric campus. Tap a building to open its floor. When a department starts work, someone follows the roads to that building."
      />

      {/* Filter bar */}
      <Card className="flex flex-wrap items-center gap-2.5 px-4 py-3">
        <Select value={category} onChange={(e) => setCategory(e.target.value)} className="!w-auto">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="!w-auto">
          <option value="open">Open tickets</option>
          <option value="all">All tickets</option>
          <option value="closed">Resolved & closed</option>
        </Select>
        <Select value={priority} onChange={(e) => setPriority(e.target.value)} className="!w-auto">
          <option value="">Any priority</option>
          {Object.entries(PRIORITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
        <Select value={dept} onChange={(e) => setDept(e.target.value)} className="!w-auto">
          <option value="">All departments</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>
        <Select value={range} onChange={(e) => setRange(e.target.value)} className="!w-auto">
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="3650">All time</option>
        </Select>
      </Card>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          ['Open', stats.open, 'text-slate-900'],
          ['Overdue', stats.overdue, 'text-red-600'],
          ['Hotspots', stats.recurring, 'text-amber-600'],
          ['Resolved (7d)', stats.resolved7d, 'text-emerald-600'],
          ['Critical', stats.critical, 'text-red-700'],
        ].map(([label, v, cls]) => (
          <Card key={label as string} className="px-4 py-3">
            <p className="text-xs font-semibold text-slate-500">{label}</p>
            <p className={cx('mt-0.5 text-2xl font-extrabold tabular-nums', cls as string)}>{v}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Map */}
        <Card className="p-4 lg:col-span-2">
          <CampusScene complaints={filtered} departments={departments} selected={selected} onSelect={setSelected} />
          <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-[#1c1e22]" /> Name board on each building</span>
            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-[#ff7a45]" /> Count means open reports</span>
            <span>Tap a building for its floor. Available desks have no open report.</span>
          </div>
        </Card>

        {/* Right column: building detail / activity */}
        <div className="space-y-5">
          <Card className="p-5">
            <h3 className="text-base font-bold tracking-tight">
              {selectedBuilding ? selectedBuilding.name : 'Most active areas'}
            </h3>
            {!selectedBuilding ? (
              <ul className="mt-3 space-y-2">
                {[...byBuilding.entries()]
                  .sort((a, b) => b[1].filter((c) => OPEN_STATUSES.includes(c.status)).length - a[1].filter((c) => OPEN_STATUSES.includes(c.status)).length)
                  .slice(0, 5)
                  .map(([id, list]) => {
                    const b = ALL_BUILDINGS.find((x) => x.id === id)!;
                    const open = list.filter((c) => OPEN_STATUSES.includes(c.status));
                    return (
                      <li key={id}>
                        <button onClick={() => setSelected(id)} className="flex w-full items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2.5 text-left hover:bg-brand-50">
                          <span className="text-sm font-semibold text-slate-800">{b.name}</span>
                          <span className="flex items-center gap-2 text-xs text-slate-500">
                            {open.length > 0 && <Badge className="bg-orange-100 text-orange-700 ring-orange-200">{open.length} open</Badge>}
                            {list.length > 2 && <Badge className="bg-amber-100 text-amber-800 ring-amber-200">recurring</Badge>}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                {byBuilding.size === 0 && <EmptyState title="No matching tickets" message="Adjust the filters to see campus activity." />}
              </ul>
            ) : (
              <div className="mt-3 space-y-2.5">
                <p className="text-xs text-slate-500">
                  {selectedComplaints.filter((c) => OPEN_STATUSES.includes(c.status)).length} open ·{' '}
                  {selectedComplaints.filter((c) => ['resolved', 'closed'].includes(c.status)).length} resolved
                  {selectedComplaints.length > 3 ? ' · recurring location' : ''}
                </p>
                {selectedComplaints.length === 0 && <EmptyState title="No tickets here" message="This area is clear for the selected filters." />}
                <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                  {selectedComplaints.map((c) => (
                    <Link key={c.id} to={ticketHref(c, profile?.role, user?.id)}
                      className="block rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100 hover:bg-brand-50/60">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-[11px] font-bold text-brand-600">{c.ticket_number}</span>
                        <StatusBadge status={c.status} />
                        <DueBadge c={c} />
                        <EscalationBadge level={c.escalation_level} />
                        {c.safety_flagged && <Badge className="bg-red-100 text-red-700 ring-red-200">safety</Badge>}
                      </div>
                      <p className="mt-1 text-sm font-semibold text-slate-800">{c.title}</p>
                      <p className="text-xs text-slate-400">{c.location} · {timeAgo(c.created_at)}</p>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Activity timeline */}
          <Card className="p-5">
            <h3 className="text-base font-bold tracking-tight">Recent campus activity</h3>
            <ul className="mt-3 space-y-2.5">
              {filtered.slice(0, 8).map((c) => (
                <li key={c.id} className="flex items-start gap-2.5 text-xs">
                  <span className={cx('mt-1 h-2 w-2 shrink-0 rounded-full', OPEN_STATUSES.includes(c.status) ? 'bg-orange-400' : 'bg-emerald-400')} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-700">{c.title}</p>
                    <p className="text-slate-400">{STATUS_LABELS[c.status]} · {buildingForLocation(c.location).name} · {formatDateTime(c.created_at)}</p>
                  </div>
                </li>
              ))}
              {filtered.length === 0 && <EmptyState title="No recent activity" />}
            </ul>
          </Card>
        </div>
      </div>
      <p className="text-[11px] text-slate-400">The plan is a sample layout. The people, the walks, and the counts come from complaint records you are allowed to see.</p>
    </div>
  );
}

function ticketHref(c: Complaint, role: string | undefined, userId: string | undefined) {
  if (role === 'student') return c.created_by === userId ? `/student/tickets/${c.id}` : `/community/${c.id}`;
  return `/staff/complaints/${c.id}`;
}
