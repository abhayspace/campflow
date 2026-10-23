import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import type { CauseReview, Complaint, Department } from '../../lib/types';
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Modal, PageHeader, TableSkeleton } from '../../components/ui';
import { StatusBadge, CategoryBadge } from '../../components/complaints';
import { buildingForLocation } from '../../lib/campus';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { cx, formatDate, timeAgo } from '../../lib/utils';

interface Hotspot {
  key: string;
  building: string;
  category: string;
  tickets: Complaint[];
  review?: CauseReview;
}

export default function RecurrenceRadar() {
  const { profile } = useAuth();
  const [complaints, setComplaints] = useState<Complaint[] | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [reviews, setReviews] = useState<CauseReview[]>([]);
  const [detail, setDetail] = useState<Hotspot | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [{ data: c }, { data: d }, { data: r }] = await Promise.all([
      supabase.from('complaints').select('*').order('created_at', { ascending: false }).limit(1000),
      supabase.from('departments').select('*'),
      supabase.from('cause_reviews').select('*'),
    ]);
    setComplaints((c ?? []) as Complaint[]);
    setDepartments(d ?? []);
    setReviews((r ?? []) as CauseReview[]);
  };
  useEffect(() => { void load(); }, []);

  const hotspots = useMemo<Hotspot[]>(() => {
    const groups = new Map<string, Complaint[]>();
    for (const c of complaints ?? []) {
      const key = `${buildingForLocation(c.location).id}|${c.category}`;
      groups.set(key, [...(groups.get(key) ?? []), c]);
    }
    return [...groups.entries()]
      .map(([key, tickets]) => {
        const [bid, cat] = key.split('|');
        const review = reviews.find((r) => r.location_key === key);
        return { key, building: CAMPUS_NAME_BY_ID[bid!] ?? 'Campus grounds', category: cat!, tickets, review };
      })
      .filter((h) => h.tickets.length >= 2)
      .sort((a, b) => b.tickets.length - a.tickets.length);
  }, [complaints, reviews]);

  const reopened = (complaints ?? []).filter((c) => c.reopen_count > 0);

  const byMonth = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of complaints ?? []) {
      const k = c.created_at.slice(0, 7);
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return [...map.entries()].sort().slice(-8).map(([month, count]) => ({ month, count }));
  }, [complaints]);

  const deptLoad = useMemo(() =>
    departments.map((d) => ({
      name: d.name.length > 16 ? `${d.name.slice(0, 15)}…` : d.name,
      open: (complaints ?? []).filter((c) => c.assigned_department_id === d.id && !['resolved', 'closed'].includes(c.status)).length,
      resolved: (complaints ?? []).filter((c) => c.assigned_department_id === d.id && ['resolved', 'closed'].includes(c.status)).length,
    })).filter((d) => d.open + d.resolved > 0),
  [complaints, departments]);

  const markCause = async (h: Hotspot, status: CauseReview['status'], note?: string) => {
    setBusy(true);
    const { error } = await supabase.from('cause_reviews').upsert({
      institution_id: profile!.institution_id,
      location_key: h.key,
      category: h.category,
      status,
      note: note ?? null,
      reviewed_by: profile!.id,
    }, { onConflict: 'institution_id,location_key,category' });
    if (error) console.error(error);
    await load();
    setBusy(false);
  };

  if (!complaints) return <TableSkeleton />;
  const enough = complaints.length >= 4;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recurrence Radar"
        subtitle="Repeated problems, reopenings, and where preventive work pays off — all from real ticket history."
      />

      {!enough && (
        <Card className="border-l-4 border-l-amber-400 px-5 py-4 text-sm text-amber-800">
          Limited history ({complaints.length} ticket{complaints.length === 1 ? '' : 's'}). Patterns will sharpen as more reports come in —
          nothing below is a prediction.
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Hotspots */}
        <Card>
          <CardHeader title="Repeat problem areas" subtitle="Location + category pairs with 2+ tickets." />
          <CardBody className="space-y-2.5">
            {hotspots.length === 0 && <EmptyState title="No recurring patterns" message="Locations with repeated complaints will appear here." />}
            {hotspots.slice(0, 8).map((h) => (
              <div key={h.key} className="rounded-xl bg-slate-50 p-3.5 ring-1 ring-slate-100">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-800">{h.building}</span>
                  <CategoryBadge category={h.category as Complaint['category']} />
                  <Badge className="bg-amber-100 text-amber-800 ring-amber-200">{h.tickets.length}× tickets</Badge>
                  <span className="ml-auto flex items-center gap-2">
                    {h.review ? (
                      <Badge className={cx(
                        h.review.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700 ring-emerald-200'
                          : h.review.status === 'dismissed' ? 'bg-slate-200 text-slate-500 ring-slate-300'
                          : 'bg-sky-100 text-sky-700 ring-sky-200')}>
                        cause {h.review.status}
                      </Badge>
                    ) : <Badge className="bg-slate-100 text-slate-500 ring-slate-200">cause unverified</Badge>}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setDetail(h)}>Evidence</Button>
                  {!h.review && <Button size="sm" variant="ghost" onClick={() => markCause(h, 'investigated')} loading={busy}>Mark investigated</Button>}
                  {h.review?.status === 'investigated' && <Button size="sm" variant="ghost" onClick={() => markCause(h, 'confirmed')} loading={busy}>Confirm cause</Button>}
                  {h.review && h.review.status !== 'dismissed' && <Button size="sm" variant="ghost" onClick={() => markCause(h, 'dismissed')} loading={busy}>Dismiss</Button>}
                </div>
              </div>
            ))}
          </CardBody>
        </Card>

        {/* Reopened + trends */}
        <div className="space-y-6">
          <Card>
            <CardHeader title="Reopened after resolution" subtitle="Fixes that didn't hold — these need a second look." />
            <CardBody className="space-y-2">
              {reopened.length === 0 && <EmptyState title="No reopenings" message="Tickets reopened after being resolved appear here." />}
              {reopened.slice(0, 6).map((c) => (
                <Link key={c.id} to={`/staff/complaints/${c.id}`} className="flex items-center gap-2.5 rounded-xl bg-orange-50/60 px-3.5 py-2.5 ring-1 ring-orange-100">
                  <span className="font-mono text-[11px] font-bold text-brand-600">{c.ticket_number}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700">{c.title}</span>
                  <Badge className="bg-orange-100 text-orange-700 ring-orange-200">×{c.reopen_count}</Badge>
                  <StatusBadge status={c.status} />
                </Link>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Report volume trend" subtitle="Tickets per month." />
            <CardBody>
              {byMonth.length === 0 ? <EmptyState title="No data" /> : (
                <ResponsiveContainer width="100%" height={170}>
                  <BarChart data={byMonth}>
                    <CartesianGrid vertical={false} stroke="#e8eaf2" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={24} />
                    <Tooltip cursor={{ fill: '#f3f1fe' }} />
                    <Bar dataKey="count" fill="#7a55ea" radius={[8, 8, 8, 8]} barSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Department workload" subtitle="Open vs resolved — context, not a ranking." />
            <CardBody>
              {deptLoad.length === 0 ? <EmptyState title="No routed work" /> : (
                <ResponsiveContainer width="100%" height={170}>
                  <BarChart data={deptLoad} layout="vertical">
                    <CartesianGrid horizontal={false} stroke="#e8eaf2" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: '#f3f1fe' }} />
                    <Bar dataKey="open" name="Open" fill="#d4ccfb" radius={[8, 8, 8, 8]} barSize={12} />
                    <Bar dataKey="resolved" name="Resolved" fill="#7a55ea" radius={[8, 8, 8, 8]} barSize={12} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Preventive suggestions — derived from data, labeled as suggestions */}
      {hotspots.length > 0 && (
        <Card>
          <CardHeader title="Preventive maintenance suggestions"
            subtitle="Data-driven recommendations — a human decides whether to act." />
          <CardBody className="grid gap-3 sm:grid-cols-2">
            {hotspots.slice(0, 4).map((h) => (
              <div key={h.key} className="rounded-xl bg-brand-50/50 p-4 ring-1 ring-brand-100">
                <p className="text-sm font-semibold text-slate-800 capitalize">
                  Schedule a {h.category} inspection at {h.building}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {h.tickets.length} related ticket{h.tickets.length === 1 ? '' : 's'} since {formatDate(h.tickets[h.tickets.length - 1]!.created_at)}.
                  A recurring pattern suggests an underlying cause worth investigating.
                </p>
                <Button size="sm" variant="secondary" className="mt-2.5" onClick={() => setDetail(h)}>Review evidence</Button>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      {/* Evidence modal */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `${detail.building} — ${detail.category}` : ''} wide>
        {detail && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">{detail.tickets.length} tickets behind this pattern:</p>
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {detail.tickets.map((c) => (
                <Link key={c.id} to={`/staff/complaints/${c.id}`} onClick={() => setDetail(null)}
                  className="block rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100 hover:bg-brand-50">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] font-bold text-brand-600">{c.ticket_number}</span>
                    <StatusBadge status={c.status} />
                    <span className="ml-auto text-[11px] text-slate-400">{timeAgo(c.created_at)}</span>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-slate-800">{c.title}</p>
                  <p className="text-xs text-slate-400">{c.location}</p>
                </Link>
              ))}
            </div>
            <div className="flex gap-2 border-t border-slate-100 pt-3">
              <Button size="sm" onClick={() => { void markCause(detail, 'investigated'); }} loading={busy}>Mark investigated</Button>
              <Button size="sm" variant="secondary" onClick={() => { void markCause(detail, 'confirmed'); }} loading={busy}>Confirm as root cause</Button>
              <Button size="sm" variant="ghost" onClick={() => { void markCause(detail, 'dismissed'); setDetail(null); }}>Dismiss</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

const CAMPUS_NAME_BY_ID: Record<string, string> = {
  academic: 'Academic Block', library: 'Central Library', itblock: 'IT & Computer Block',
  canteen: 'Canteen & Dining', main: 'Main Block', hostel: 'Hostel & Residences',
  sports: 'Sports Complex', admin: 'Admin Offices', grounds: 'Campus grounds',
};
