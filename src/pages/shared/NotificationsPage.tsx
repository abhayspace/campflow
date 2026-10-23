import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import type { AppNotification } from '../../lib/types';
import { Button, Card, CardBody, EmptyState, PageHeader, TableSkeleton } from '../../components/ui';
import { cx, timeAgo } from '../../lib/utils';

export default function NotificationsPage() {
  const { user, profile } = useAuth();
  const [items, setItems] = useState<AppNotification[] | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);
    setItems(data ?? []);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const markAll = async () => {
    await supabase.from('notifications').update({ read_at: new Date().toISOString() })
      .eq('recipient_id', user?.id).is('read_at', null);
    await load();
  };

  const mark = async (n: AppNotification) => {
    if (!n.read_at) {
      await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.id);
      await load();
    }
  };

  if (!items) return <TableSkeleton />;

  const dest = (n: AppNotification) =>
    n.complaint_id
      ? profile?.role === 'student' ? `/student/tickets/${n.complaint_id}` : `/staff/complaints/${n.complaint_id}`
      : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Notifications" actions={
        items.some((n) => !n.read_at) && <Button variant="secondary" size="sm" onClick={markAll}>Mark all read</Button>
      } />
      <Card>
        <CardBody className="divide-y divide-slate-100 p-0">
          {items.length === 0 ? (
            <EmptyState title="No notifications" message="Updates about your complaints will appear here." />
          ) : items.map((n) => {
            const link = dest(n);
            const inner = (
              <div className={cx('px-5 py-4', !n.read_at && 'bg-brand-50/40')}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-medium text-slate-800">{n.title}</p>
                  <span className="shrink-0 text-xs text-slate-400">{timeAgo(n.created_at)}</span>
                </div>
                <p className="mt-0.5 text-sm text-slate-500">{n.message}</p>
              </div>
            );
            return link ? (
              <Link key={n.id} to={link} onClick={() => mark(n)} className="block hover:bg-slate-50">{inner}</Link>
            ) : (
              <button key={n.id} onClick={() => mark(n)} className="block w-full text-left">{inner}</button>
            );
          })}
        </CardBody>
      </Card>
    </div>
  );
}
