import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { STATUS_LABELS, type Complaint, type Department, type Profile } from '../../lib/types';
import { FeatureCard, Meter, NowCard, QuietCard, RingStat, SegmentBar, SoftBars, weekBuckets } from '../../components/dashboard';
import { Card, CardBody, CardHeader, EmptyState, PageHeader, TableSkeleton } from '../../components/ui';
import { ComplaintRow } from '../../components/complaints';

const CATEGORY_LABELS: Record<string, string> = {
  plumbing: 'Plumbing', electricity: 'Electricity', cleanliness: 'Cleanliness', internet: 'Internet',
};

export default function AdminDashboard() {
  const { profile } = useAuth();
  const [complaints, setComplaints] = useState<Complaint[] | null>(null);
  const [users, setUsers] = useState<Profile[] | null>(null);
  const [departments, setDepartments] = useState<Department[] | null>(null);
  const [surveyStats, setSurveyStats] = useState<{ sent: number; answered: number } | null>(null);

  useEffect(() => {
    supabase.from('complaints').select('*').order('created_at', { ascending: false }).limit(500)
      .then(({ data }) => setComplaints(data ?? []));
    supabase.from('profiles').select('*').then(({ data }) => setUsers(data ?? []));
    supabase.from('departments').select('*').then(({ data }) => setDepartments(data ?? []));
    (async () => {
      const [{ count: recips }, { count: resps }] = await Promise.all([
        supabase.from('survey_recipients').select('id', { count: 'exact', head: true }),
        supabase.from('survey_responses').select('id', { count: 'exact', head: true }),
      ]);
      setSurveyStats({ sent: recips ?? 0, answered: resps ?? 0 });
    })();
  }, []);

  const stats = useMemo(() => {
    const c = complaints ?? [];
    const resolved = c.filter((x) => x.resolved_at);
    const avgHours = resolved.length
      ? resolved.reduce((s, x) => s + (new Date(x.resolved_at!).getTime() - new Date(x.created_at).getTime()), 0) /
        resolved.length / 3_600_000
      : null;
    const byStatus = Object.entries(STATUS_LABELS).map(([k, label]) => ({
      name: label, value: c.filter((x) => x.status === k).length,
    })).filter((d) => d.value > 0);
    const byCategory = ['plumbing', 'electricity', 'cleanliness', 'internet'].map((cat) => ({
      name: CATEGORY_LABELS[cat], value: c.filter((x) => x.category === cat).length,
    }));
    const byDept = (departments ?? []).map((d) => ({
      name: d.name,
      open: c.filter((x) => x.assigned_department_id === d.id && !['resolved', 'closed'].includes(x.status)).length,
      resolved: c.filter((x) => x.assigned_department_id === d.id && ['resolved', 'closed'].includes(x.status)).length,
    })).filter((d) => d.open + d.resolved > 0);
    const byLocation = Object.entries(
      c.reduce<Record<string, number>>((acc, x) => {
        const loc = x.location.trim().toLowerCase();
        if (loc) acc[loc] = (acc[loc] ?? 0) + 1;
        return acc;
      }, {}),
    ).map(([name, count]) => ({ name, count })).filter((l) => l.count > 1)
      .sort((a, b) => b.count - a.count).slice(0, 6);

    const complaintsOnly = c.filter((x) => (x.submission_type ?? 'complaint') === 'complaint');
    const requests = c.filter((x) => x.submission_type === 'request');
    const awaitingDecision = requests.filter((x) =>
      ['submitted', 'under_review', 'info_required', 'under_consideration'].includes(x.request_status ?? 'submitted')).length;

    return {
      total: c.length,
      complaints: complaintsOnly.length,
      requests: requests.length,
      campusWide: c.filter((x) => x.visibility === 'campus').length,
      personal: c.filter((x) => (x.visibility ?? 'personal') === 'personal').length,
      awaitingDecision,
      implemented: requests.filter((x) => x.request_status === 'implemented').length,
      verifiedFixes: complaintsOnly.filter((x) => x.verification === 'confirmed').length,
      open: c.filter((x) => !['resolved', 'closed'].includes(x.status)).length,
      inProgress: c.filter((x) => ['assigned', 'in_progress'].includes(x.status)).length,
      resolved: resolved.length,
      avgHours,
      byStatus, byCategory, byDept, byLocation,
      students: (users ?? []).filter((u) => u.role === 'student').length,
      teachers: (users ?? []).filter((u) => u.role === 'teacher').length,
      deptCount: (departments ?? []).filter((d) => d.is_active).length,
    };
  }, [complaints, users, departments]);

  if (!complaints || !users || !departments) return <TableSkeleton />;

  const recent = complaints.slice(0, 6);

  const resolutionRate = stats.complaints ? Math.round((stats.resolved / stats.complaints) * 100) : 0;
  const surveyRate = surveyStats && surveyStats.sent ? Math.round((surveyStats.answered / surveyStats.sent) * 100) : null;
  const avgLabel = stats.avgHours == null
    ? 'Waiting on the first resolution'
    : `About ${stats.avgHours < 24 ? `${stats.avgHours.toFixed(1)} hours` : `${(stats.avgHours / 24).toFixed(1)} days`} to resolve`;
  return (
    <div className="space-y-5">
      <PageHeader
        title="Overview"
        subtitle={`${profile?.full_name ?? 'Admin'} · how the campus is moving, and where work is still open.`}
        actions={<Link to="/admin/complaints"><button className="rounded-full bg-candy-ink px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-700">All complaints</button></Link>}
      />

      <div className="grid items-start gap-4 xl:grid-cols-12">
        <div className="flex flex-col gap-4 xl:col-span-4">
          <Card>
            <CardHeader title="Activity" action={<span className="rounded-full bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-500">Last 7 days</span>} />
            <CardBody>
              <p className="text-5xl font-extrabold tracking-tight text-slate-900">{stats.open}<span className="ml-2 text-base font-semibold text-slate-400">open</span></p>
              <div className="mt-6">
                <SoftBars items={weekBuckets(complaints.map((c) => c.created_at))} />
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="By category" />
            <CardBody className="space-y-1">
              {stats.byCategory.map((item) => (
                <div key={item.name} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-sm font-semibold text-slate-800">{item.name}</span>
                  <span className="text-sm font-bold text-slate-900">{item.value}</span>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>

        <div className="flex flex-col gap-4 xl:col-span-8">
          <div className="grid items-stretch gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Resolution" />
              <CardBody className="space-y-5">
                <div>
                  <p className="text-5xl font-extrabold tracking-tight text-slate-900">{resolutionRate}<span className="text-2xl text-slate-400">%</span></p>
                  <p className="mt-1 text-sm text-slate-400">{stats.resolved} resolved · {stats.complaints} complaints</p>
                </div>
                <SegmentBar parts={[
                  { label: 'Waiting', value: Math.max(stats.open - stats.inProgress, 0), color: '#6d4aff' },
                  { label: 'In progress', value: stats.inProgress, color: '#3dca8a' },
                  { label: 'Resolved', value: stats.resolved, color: '#f5a04a' },
                ]} />
                <div className="grid grid-cols-3 gap-2">
                  <RingStat tone="purple" value={stats.open} label="Open" icon={<span className="h-2.5 w-2.5 rounded-full bg-current" />} />
                  <RingStat tone="mint" value={stats.verifiedFixes} label="Verified" icon={<span className="h-2.5 w-2.5 rounded-full bg-current" />} />
                  <RingStat tone="peach" value={stats.requests} label="Requests" icon={<span className="h-2.5 w-2.5 rounded-full bg-current" />} />
                </div>
              </CardBody>
            </Card>
            <FeatureCard
              eyebrow="Campus"
              pill={`${stats.deptCount} departments`}
              title={stats.open ? `${stats.open} reports still open` : 'Nothing is waiting right now'}
              body={`${stats.students} students and ${stats.teachers} staff. ${avgLabel}.`}
              progress={surveyRate ?? resolutionRate}
              progressLabel={surveyRate == null ? 'Resolved' : 'Surveys answered'}
              action={<Link to="/pulse" className="flex h-12 items-center justify-center rounded-2xl bg-[#171716] text-sm font-bold text-white">Open Campus Pulse</Link>}
            />
          </div>
          <Card>
            <CardHeader title="Up next" action={<Link to="/admin/complaints" className="text-sm font-semibold text-slate-900">View all</Link>} />
            <CardBody>
              {recent.length === 0 ? (
                <EmptyState title="No complaints yet" message="Student reports will land here." />
              ) : (
                <div className="grid gap-3 md:grid-cols-3">
                  {recent[1] && <QuietCard when={recent[1].ticket_number} title={recent[1].title} meta={recent[1].location} href={`/staff/complaints/${recent[1].id}`} />}
                  <NowCard when={recent[0].ticket_number} title={recent[0].title} meta={recent[0].location} href={`/staff/complaints/${recent[0].id}`} />
                  {recent[2]
                    ? <QuietCard when={recent[2].ticket_number} title={recent[2].title} meta={recent[2].location} href={`/staff/complaints/${recent[2].id}`} />
                    : <QuietCard when="Departments" title="Review workload" meta={`${stats.deptCount} active departments`} href="/admin/departments" />}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-7">
          <CardHeader title="Recent complaints" action={
            <Link to="/admin/complaints" className="text-sm font-semibold text-brand-700 hover:underline">View all</Link>} />
          <CardBody className="space-y-3">
            {recent.length === 0 ? (
              <EmptyState title="No complaints yet" message="Student reports will land here." />
            ) : (
              recent.slice(0, 4).map((c) => <ComplaintRow key={c.id} c={c} to={`/staff/complaints/${c.id}`} />)
            )}
          </CardBody>
        </Card>

        <Card className="xl:col-span-5">
          <CardHeader title="Department workload" subtitle="Open tickets sitting with each team." />
          <CardBody className="space-y-4">
            {stats.byDept.length === 0 ? (
              <EmptyState title="No routed complaints" message="Set routing rules so reports reach a department on their own." />
            ) : (
              stats.byDept.slice(0, 6).map((dept) => (
                <Meter key={dept.name} label={dept.name} value={dept.open} max={Math.max(...stats.byDept.map((d) => d.open), 1)} hint={`${dept.resolved} already resolved`} />
              ))
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Signals worth a look" />
          <CardBody>
            <ul className="grid gap-3 sm:grid-cols-2">
              <Signal label="Requests waiting" value={String(stats.awaitingDecision)} hint={`${stats.implemented} already implemented`} />
              <Signal label="Campus-wide" value={String(stats.campusWide)} hint={`${stats.personal} private submissions`} />
              <Signal label="Verified fixes" value={String(stats.verifiedFixes)} hint="Students confirmed the resolution" />
              <Signal label="Survey replies" value={surveyRate == null ? '—' : `${surveyRate}%`} hint={surveyStats ? `${surveyStats.answered} of ${surveyStats.sent} answered` : 'Loading'} />
            </ul>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Places that repeat" subtitle="Locations with more than one complaint." />
          <CardBody>
            {stats.byLocation.length === 0 ? (
              <EmptyState title="No repeats yet" message="When the same place is reported again, it shows up here." />
            ) : (
              <ul className="space-y-2">
                {stats.byLocation.map((place) => (
                  <li key={place.name} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                    <span className="truncate text-sm font-semibold capitalize text-slate-700">{place.name}</span>
                    <span className="shrink-0 rounded-full bg-candy-yellow px-2.5 py-1 text-xs font-bold text-slate-900">{place.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      {stats.byStatus.length > 0 && (
        <p className="px-1 text-xs text-slate-400">
          Status mix: {stats.byStatus.map((item) => `${item.name} ${item.value}`).join(' · ')}
        </p>
      )}
    </div>
  );
}

function Signal({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <li className="rounded-2xl bg-slate-50 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{hint}</p>
    </li>
  );
}
