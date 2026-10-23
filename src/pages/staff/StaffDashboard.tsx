import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import type { Complaint } from '../../lib/types';
import { FeatureCard, Meter, NowCard, QuietCard, RingStat, SoftBars } from '../../components/dashboard';
import { Card, CardBody, CardHeader, EmptyState, PageHeader, TableSkeleton } from '../../components/ui';

export default function StaffDashboard() {
  const { user, profile } = useAuth();
  const [assigned, setAssigned] = useState<Complaint[] | null>(null);
  const [queue, setQueue] = useState<Complaint[] | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('complaints')
      .select('*, department:departments(name)')
      .eq('assigned_to', user.id)
      .not('status', 'in', '(resolved,closed)')
      .order('created_at', { ascending: false })
      .then(({ data }) => setAssigned((data ?? []) as unknown as Complaint[]));

    supabase
      .from('complaints')
      .select('*, department:departments(name)')
      .not('status', 'in', '(resolved,closed)')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => setQueue((data ?? []) as unknown as Complaint[]));
  }, [user]);

  if (!assigned || !queue) return <TableSkeleton />;

  const openQueue = queue.filter((c) => c.assigned_to !== user?.id);
  const counts = {
    new: queue.filter((c) => c.status === 'new').length,
    assigned: queue.filter((c) => c.status === 'assigned').length,
    in_progress: queue.filter((c) => c.status === 'in_progress').length,
    mine: assigned.length,
  };

  const statusBars = [
    { label: 'New', value: counts.new, active: counts.new >= counts.assigned && counts.new >= counts.in_progress && counts.new > 0 },
    { label: 'Mine', value: counts.mine, active: false },
    { label: 'Assigned', value: counts.assigned, active: false },
    { label: 'Active', value: counts.in_progress, active: counts.in_progress > counts.new },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="My work"
        subtitle={`Welcome, ${profile?.full_name?.split(' ')[0]}. Tickets assigned to you, and the open queue you can pick up.`}
        actions={<Link to="/staff/complaints"><button className="rounded-full bg-candy-ink px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-700">Open queue</button></Link>}
      />

      <div className="grid items-start gap-4 xl:grid-cols-12">
        <div className="flex flex-col gap-4 xl:col-span-4">
          <Card>
            <CardHeader title="Activity" action={<span className="rounded-full bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-500">Open queue</span>} />
            <CardBody>
              <p className="text-5xl font-extrabold tracking-tight text-slate-900">{counts.mine}<span className="ml-2 text-base font-semibold text-slate-400">on you</span></p>
              <div className="mt-6"><SoftBars items={statusBars} /></div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Where it sits" />
            <CardBody className="space-y-4">
              <Meter label="Assigned to me" value={counts.mine} max={Math.max(queue.length, 1)} />
              <Meter label="New, unstarted" value={counts.new} max={Math.max(queue.length, 1)} />
              <Meter label="Already in progress" value={counts.in_progress} max={Math.max(queue.length, 1)} />
            </CardBody>
          </Card>
        </div>

        <div className="flex flex-col gap-4 xl:col-span-8">
          <div className="grid items-stretch gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Queue" />
              <CardBody className="space-y-5">
                <p className="text-5xl font-extrabold tracking-tight text-slate-900">{queue.length}<span className="ml-2 text-base font-semibold text-slate-400">open</span></p>
                <div className="grid grid-cols-3 gap-2">
                  <RingStat tone="purple" value={counts.new} label="New" icon={<span className="text-sm font-black">N</span>} />
                  <RingStat tone="mint" value={counts.assigned} label="Assigned" icon={<span className="text-sm font-black">A</span>} />
                  <RingStat tone="peach" value={counts.in_progress} label="Active" icon={<span className="text-sm font-black">→</span>} />
                </div>
              </CardBody>
            </Card>
            <FeatureCard
              eyebrow="Today"
              pill="Queue"
              title={counts.mine ? `${counts.mine} ticket${counts.mine === 1 ? '' : 's'} with your name` : 'Nothing is assigned to you'}
              body={counts.mine
                ? 'Start with what is already yours. The department queue is there when you have room.'
                : 'Open the department queue if you can take the next ticket.'}
              progress={queue.length ? Math.round((counts.in_progress / queue.length) * 100) : 0}
              progressLabel="Already in progress"
              action={<Link to="/staff/complaints" className="flex h-12 items-center justify-center rounded-2xl bg-[#171716] text-sm font-bold text-white">Open the queue</Link>}
            />
          </div>
          <Card>
            <CardHeader title="Up next" action={<Link to="/staff/complaints" className="text-sm font-semibold text-slate-900">Full queue</Link>} />
            <CardBody>
              {assigned.length === 0 ? (
                <EmptyState title="Nothing assigned to you" message="Tickets with your name on them show up here." />
              ) : (
                <div className="grid gap-3 md:grid-cols-3">
                  {assigned[1] && <QuietCard when={assigned[1].ticket_number} title={assigned[1].title} meta={assigned[1].location} href={`/staff/complaints/${assigned[1].id}`} />}
                  <NowCard when={assigned[0].ticket_number} title={assigned[0].title} meta={assigned[0].location} href={`/staff/complaints/${assigned[0].id}`} />
                  {assigned[2]
                    ? <QuietCard when={assigned[2].ticket_number} title={assigned[2].title} meta={assigned[2].location} href={`/staff/complaints/${assigned[2].id}`} />
                    : openQueue[0]
                      ? <QuietCard when={openQueue[0].ticket_number} title={openQueue[0].title} meta="Department queue" href={`/staff/complaints/${openQueue[0].id}`} />
                      : <QuietCard when="Queue" title="Department queue is clear" meta="No other open tickets" href="/staff/complaints" />}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
