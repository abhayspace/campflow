import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import type { Complaint } from '../../lib/types';
import { FeatureCard, NowCard, QuietCard, RingStat, SegmentBar, SoftBars, weekBuckets } from '../../components/dashboard';
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, TableSkeleton } from '../../components/ui';

export default function StudentDashboard() {
  const { user, profile } = useAuth();
  const [complaints, setComplaints] = useState<Complaint[] | null>(null);
  const [supported, setSupported] = useState<Complaint[]>([]);
  const [affected, setAffected] = useState<Complaint[]>([]);
  const [followed, setFollowed] = useState<Complaint[]>([]);
  const [pendingSurveys, setPendingSurveys] = useState(0);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('complaints')
      .select('*')
      .eq('created_by', user.id)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => setComplaints(data ?? []));

    // submissions I've voted on or follow (campus feed items only)
    const loadVoted = async (vote: 'support' | 'affected', set: (c: Complaint[]) => void) => {
      const { data: votes } = await supabase
        .from('community_votes').select('complaint_id')
        .eq('voter_id', user.id).eq('vote_type', vote);
      const ids = (votes ?? []).map((v) => v.complaint_id);
      if (!ids.length) return set([]);
      const { data: items } = await supabase.from('complaints')
        .select('id, ticket_number, title, status, request_status, submission_type, location, category, created_at, verification, priority')
        .in('id', ids).order('created_at', { ascending: false }).limit(5);
      set((items ?? []) as Complaint[]);
    };
    void loadVoted('support', setSupported);
    void loadVoted('affected', setAffected);

    supabase.from('submission_follows').select('complaint_id').eq('follower_id', user.id)
      .then(async ({ data: f }) => {
        const ids = (f ?? []).map((x) => x.complaint_id);
        if (!ids.length) return setFollowed([]);
        const { data: items } = await supabase.from('complaints')
          .select('id, ticket_number, title, status, request_status, submission_type, location, category, created_at, verification, priority')
          .in('id', ids).order('created_at', { ascending: false }).limit(5);
        setFollowed((items ?? []) as Complaint[]);
      });

    // surveys awaiting my answer
    (async () => {
      const { data: recips } = await supabase.from('survey_recipients').select('survey_id').eq('profile_id', user.id);
      const ids = (recips ?? []).map((r) => r.survey_id);
      if (!ids.length) return;
      const [{ data: pubs }, { data: answered }] = await Promise.all([
        supabase.from('surveys').select('id').in('id', ids).eq('status', 'published'),
        supabase.from('survey_responses').select('survey_id').eq('respondent_id', user.id),
      ]);
      const answeredIds = new Set((answered ?? []).map((a) => a.survey_id));
      setPendingSurveys((pubs ?? []).filter((p) => !answeredIds.has(p.id)).length);
    })();
  }, [user]);

  if (!complaints) return <TableSkeleton />;

  const myComplaints = complaints.filter((c) => c.submission_type !== 'request');
  const myRequests = complaints.filter((c) => c.submission_type === 'request');
  const open = myComplaints.filter((c) => !['resolved', 'closed'].includes(c.status)).length;
  const resolved = myComplaints.filter((c) => ['resolved', 'closed'].includes(c.status)).length;
  const inProgress = myComplaints.filter((c) => ['assigned', 'in_progress'].includes(c.status)).length;

  const miniList = (items: Complaint[], empty: string) => (
    items.length === 0 ? (
      <p className="py-4 text-center text-xs text-slate-400">{empty}</p>
    ) : (
      <div className="space-y-2">
        {items.map((c) => (
          <Link key={c.id} to={c.created_by === user?.id ? `/student/tickets/${c.id}` : `/community/${c.id}`}
            className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2.5 hover:bg-slate-50">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-800">{c.title}</p>
              <p className="text-[11px] text-slate-400">{c.ticket_number} · {c.location}</p>
            </div>
            <Badge className="shrink-0">{c.submission_type === 'request' ? 'request' : c.status}</Badge>
          </Link>
        ))}
      </div>
    )
  );

  const total = myComplaints.length;
  const settled = total ? Math.round((resolved / total) * 100) : 0;
  const activity = weekBuckets(myComplaints.map((c) => c.created_at));
  const upcoming = myComplaints.filter((c) => !['resolved', 'closed'].includes(c.status));
  const now = upcoming[0];
  const later = upcoming.slice(1, 3);

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Hi, ${profile?.full_name?.split(' ')[0] ?? 'there'}`}
        subtitle="Your tickets, the ones you follow, and the next thing worth doing."
      />

      <div className="grid items-start gap-4 xl:grid-cols-12">
        <div className="flex flex-col gap-4 xl:col-span-4">
          <Card>
            <CardHeader title="Activity" action={
              <span className="rounded-full bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-500">Last 7 days</span>
            } />
            <CardBody>
              <p className="text-5xl font-extrabold tracking-tight text-slate-900">{open}<span className="ml-2 text-base font-semibold text-slate-400">open</span></p>
              <div className="mt-6">
                <SoftBars items={activity} />
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="By type" />
            <CardBody className="space-y-1">
              <Breakdown label="Complaints" detail={`${open} still open`} value={String(myComplaints.length)} />
              <Breakdown label="Requests" detail="Waiting on a decision" value={String(myRequests.length)} />
              <Breakdown label="Following" detail="Community updates" value={String(followed.length)} />
              <Breakdown label="Surveys" detail="Waiting for your answer" value={String(pendingSurveys)} />
            </CardBody>
          </Card>
        </div>

        <div className="flex flex-col gap-4 xl:col-span-8">
          <div className="grid items-stretch gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Progress" />
              <CardBody className="space-y-5">
                <div>
                  <p className="text-5xl font-extrabold tracking-tight text-slate-900">{settled}<span className="text-2xl text-slate-400">%</span></p>
                  <p className="mt-1 text-sm text-slate-400">resolved or closed</p>
                </div>
                <SegmentBar parts={[
                  { label: 'Waiting', value: Math.max(open - inProgress, 0), color: '#6d4aff' },
                  { label: 'In progress', value: inProgress, color: '#3dca8a' },
                  { label: 'Resolved', value: resolved, color: '#f5a04a' },
                ]} />
                <div className="grid grid-cols-3 gap-2">
                  <RingStat tone="purple" value={Math.max(open - inProgress, 0)} label="Waiting" icon={<Dot />} />
                  <RingStat tone="mint" value={inProgress} label="In progress" icon={<Dot />} />
                  <RingStat tone="peach" value={resolved} label="Resolved" icon={<Dot />} />
                </div>
              </CardBody>
            </Card>
            <FeatureCard
              eyebrow={pendingSurveys > 0 ? 'Survey waiting' : 'Next step'}
              pill={pendingSurveys > 0 ? 'Feedback' : 'Report'}
              title={pendingSurveys > 0 ? 'Tell staff if the fix held' : 'Report it once, then follow it'}
              body={pendingSurveys > 0
                ? 'A short answer closes the loop on a repair. It does not open a new ticket.'
                : 'A place and a short description are enough. The right department gets the ticket.'}
              progress={settled}
              progressLabel="Complaints closed"
              action={
                <Link to={pendingSurveys > 0 ? '/student/surveys' : '/student/new'}
                  className="flex h-12 items-center justify-center rounded-2xl bg-[#171716] text-sm font-bold text-white">
                  {pendingSurveys > 0 ? 'Answer survey' : 'Report an issue'}
                </Link>
              }
            />
          </div>

          <Card>
            <CardHeader
              title="Up next"
              action={<Link to="/student/tickets" className="text-sm font-semibold text-slate-900">View all</Link>}
            />
            <CardBody>
              {!now ? (
                <EmptyState title="Nothing waiting" message="Open tickets show up here, with the current one marked Now." />
              ) : (
                <div className="grid gap-3 md:grid-cols-3">
                  {later[0] ? (
                    <QuietCard when={later[0].status.replace('_', ' ')} title={later[0].title} meta={later[0].location} href={`/student/tickets/${later[0].id}`} />
                  ) : <div className="hidden md:block" />}
                  <NowCard when={now.ticket_number} title={now.title} meta={now.location} href={`/student/tickets/${now.id}`} />
                  {later[1] ? (
                    <QuietCard when={later[1].status.replace('_', ' ')} title={later[1].title} meta={later[1].location} href={`/student/tickets/${later[1].id}`} />
                  ) : (
                    <QuietCard when="Community" title={followed[0]?.title ?? 'See what campus is tracking'} meta={followed[0]?.location ?? 'Open the feed'} href={followed[0] ? `/community/${followed[0].id}` : '/community'} />
                  )}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="My requests" />
          <CardBody>{miniList(myRequests.slice(0, 3), 'No requests yet.')}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Issues I support" />
          <CardBody>{miniList(supported, 'Support a proposal and it will show up here.')}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Affecting me" />
          <CardBody>{miniList(affected, 'Mark a community issue if it affects you too.')}</CardBody>
        </Card>
      </div>
    </div>
  );
}

function Breakdown({ label, detail, value }: { label: string; detail: string; value: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">{label.slice(0, 1)}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        <p className="text-xs text-slate-400">{detail}</p>
      </div>
      <span className="text-sm font-bold text-slate-900">{value}</span>
    </div>
  );
}

function Dot() {
  return <span className="h-2.5 w-2.5 rounded-full bg-current" />;
}
