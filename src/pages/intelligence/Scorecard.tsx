import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Complaint, Department } from '../../lib/types';
import { CATEGORIES } from '../../lib/types';
import { Card, CardBody, CardHeader, EmptyState, PageHeader, Select, TableSkeleton } from '../../components/ui';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Legend,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { cx } from '../../lib/utils';

export default function Scorecard() {
  const [complaints, setComplaints] = useState<Complaint[] | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [range, setRange] = useState('90');
  const [dept, setDept] = useState('');
  const [category, setCategory] = useState('');

  useEffect(() => {
    supabase.from('complaints').select('*').order('created_at').limit(2000)
      .then(({ data }) => setComplaints((data ?? []) as Complaint[]));
    supabase.from('departments').select('*').then(({ data }) => setDepartments(data ?? []));
  }, []);

  const filtered = useMemo(() => {
    const cutoff = Date.now() - Number(range) * 86_400_000;
    return (complaints ?? []).filter((c) =>
      new Date(c.created_at).getTime() >= cutoff
      && (!dept || c.assigned_department_id === dept)
      && (!category || c.category === category));
  }, [complaints, range, dept, category]);

  const metrics = useMemo(() => {
    const c = filtered;
    const resolved = c.filter((x) => x.resolved_at);
    const open = c.filter((x) => !['resolved', 'closed'].includes(x.status));
    const overdue = open.filter((x) => x.due_at && new Date(x.due_at) < new Date());
    const resolvedHours = resolved.map((x) => (new Date(x.resolved_at!).getTime() - new Date(x.created_at).getTime()) / 3_600_000);
    const reopenBase = c.filter((x) => ['resolved', 'closed', 'reopened'].includes(x.status) || x.reopen_count > 0);
    return {
      total: c.length,
      resolved: resolved.length,
      rate: c.length ? Math.round((resolved.length / c.length) * 100) : null,
      avgH: resolvedHours.length ? resolvedHours.reduce((a, b) => a + b, 0) / resolvedHours.length : null,
      open: open.length,
      overdue: overdue.length,
      reopenRate: reopenBase.length ? Math.round((c.filter((x) => x.reopen_count > 0).length / reopenBase.length) * 100) : null,
      verified: resolved.filter((x) => x.verification === 'confirmed').length,
      unverified: resolved.filter((x) => x.verification === 'awaiting_verification').length,
    };
  }, [filtered]);

  const weekly = useMemo(() => {
    const map = new Map<string, { week: string; created: number; resolved: number }>();
    for (const c of filtered) {
      const wk = weekKey(c.created_at);
      const e = map.get(wk) ?? { week: wk, created: 0, resolved: 0 };
      e.created++;
      if (c.resolved_at) e.resolved++;
      map.set(wk, e);
    }
    return [...map.values()];
  }, [filtered]);

  const resolveDist = useMemo(() => {
    const buckets = [
      { name: '<4h', min: 0, max: 4, count: 0 },
      { name: '4–24h', min: 4, max: 24, count: 0 },
      { name: '1–3d', min: 24, max: 72, count: 0 },
      { name: '3–7d', min: 72, max: 168, count: 0 },
      { name: '>7d', min: 168, max: Infinity, count: 0 },
    ];
    for (const c of filtered.filter((x) => x.resolved_at)) {
      const h = (new Date(c.resolved_at!).getTime() - new Date(c.created_at).getTime()) / 3_600_000;
      const b = buckets.find((x) => h >= x.min && h < x.max)!;
      b.count++;
    }
    return buckets;
  }, [filtered]);

  const catTrend = useMemo(() =>
    CATEGORIES.map((cat) => ({
      name: cat.label.split(' ')[0],
      count: filtered.filter((x) => x.category === cat.value).length,
    })),
  [filtered]);

  if (!complaints) return <TableSkeleton />;
  const enough = filtered.length >= 3;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reliability Scorecard"
        subtitle="Operational metrics from real records — correct denominators, honest empty states."
        actions={
          <div className="flex gap-2">
            <Select value={range} onChange={(e) => setRange(e.target.value)} className="!w-auto">
              <option value="7">7 days</option><option value="30">30 days</option>
              <option value="90">90 days</option><option value="3650">All time</option>
            </Select>
            <Select value={dept} onChange={(e) => setDept(e.target.value)} className="!w-auto">
              <option value="">All departments</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
            <Select value={category} onChange={(e) => setCategory(e.target.value)} className="!w-auto">
              <option value="">All categories</option>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          </div>
        }
      />

      {!enough && (
        <Card className="border-l-4 border-l-amber-400 px-5 py-4 text-sm text-amber-800">
          Only {filtered.length} ticket{filtered.length === 1 ? '' : 's'} in this range — percentages below are based on very little data.
        </Card>
      )}

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {[
          ['Total', String(metrics.total)],
          ['Resolved', metrics.rate != null ? `${metrics.rate}%` : '—'],
          ['Avg resolution', metrics.avgH != null ? (metrics.avgH < 24 ? `${metrics.avgH.toFixed(1)}h` : `${(metrics.avgH / 24).toFixed(1)}d`) : '—'],
          ['Open now', String(metrics.open)],
          ['Overdue', String(metrics.overdue)],
          ['Reopen rate', metrics.reopenRate != null ? `${metrics.reopenRate}%` : '—'],
          ['Verified fixes', String(metrics.verified)],
          ['Unverified', String(metrics.unverified)],
        ].map(([label, v]) => (
          <Card key={label} className="px-4 py-3">
            <p className="text-[11px] font-semibold text-slate-500">{label}</p>
            <p className={cx('mt-0.5 text-xl font-extrabold tabular-nums',
              label === 'Overdue' && Number(v) > 0 ? 'text-red-600' : 'text-slate-900')}>{v}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Volume over time" subtitle="Created vs resolved per week." />
          <CardBody>
            {weekly.length < 2 ? <EmptyState title="Not enough data" message="Weekly trends appear once you have a few weeks of history." /> : (
              <ResponsiveContainer width="100%" height={230}>
                <AreaChart data={weekly}>
                  <CartesianGrid vertical={false} stroke="#e8eaf2" />
                  <XAxis dataKey="week" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={24} />
                  <Tooltip /><Legend />
                  <Area dataKey="created" name="Created" stroke="#7a55ea" fill="#d4ccfb" fillOpacity={0.6} />
                  <Area dataKey="resolved" name="Resolved" stroke="#25bb98" fill="#c9f4e7" fillOpacity={0.6} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Resolution-time distribution" subtitle="How long fixes actually take." />
          <CardBody>
            {filtered.every((x) => !x.resolved_at) ? <EmptyState title="No resolutions yet" /> : (
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={resolveDist}>
                  <CartesianGrid vertical={false} stroke="#e8eaf2" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={24} />
                  <Tooltip cursor={{ fill: '#f3f1fe' }} />
                  <Bar dataKey="count" name="Tickets" fill="#7a55ea" radius={[10, 10, 10, 10]} barSize={30} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Category mix" subtitle="What the campus reports most." />
          <CardBody>
            {catTrend.every((c) => c.count === 0) ? <EmptyState title="No data" /> : (
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={catTrend} layout="vertical">
                  <CartesianGrid horizontal={false} stroke="#e8eaf2" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: '#f3f1fe' }} />
                  <Bar dataKey="count" fill="#957bf1" radius={[10, 10, 10, 10]} barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Verification outcomes" subtitle="What students said about completed work." />
          <CardBody>
            {metrics.resolved === 0 ? <EmptyState title="No resolved tickets" /> : (
              <div className="space-y-3 pt-2">
                {([
                  ['Confirmed by students', metrics.verified, 'bg-emerald-500'],
                  ['Awaiting student response', metrics.unverified, 'bg-sky-400'],
                  ['Resolved without verification state', Math.max(0, metrics.resolved - metrics.verified - metrics.unverified), 'bg-slate-300'],
                ] as [string, number, string][]).map(([label, v, cls]) => (
                  <div key={label}>
                    <div className="flex justify-between text-xs font-semibold text-slate-600">
                      <span>{label}</span><span className="tabular-nums">{v} ({metrics.resolved ? Math.round((v / metrics.resolved) * 100) : 0}%)</span>
                    </div>
                    <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div className={cx('h-full rounded-full', cls)} style={{ width: `${metrics.resolved ? (v / metrics.resolved) * 100 : 0}%` }} />
                    </div>
                  </div>
                ))}
                <p className="pt-2 text-[11px] text-slate-400">
                  An unanswered resolution stays unverified — the student always has the final say.
                </p>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function weekKey(iso: string): string {
  const d = new Date(iso);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
