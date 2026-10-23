import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../../context/ToastContext';
import { supabase } from '../../lib/supabase';
import { callFunction } from '../../lib/api';
import type { JoinRequest } from '../../lib/types';
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, PageHeader, TableSkeleton } from '../../components/ui';
import { errorMessage, formatDate } from '../../lib/utils';

export default function AdminJoinRequests() {
  const { toast } = useToast();
  const [requests, setRequests] = useState<JoinRequest[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('join_requests')
      .select('*')
      .eq('status', 'pending')
      .order('created_at');
    setRequests(data ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const review = async (r: JoinRequest, action: 'approve' | 'reject') => {
    setBusyId(r.id);
    try {
      await callFunction('review-join-request', { request_id: r.id, action });
      toast(`${r.full_name} ${action === 'approve' ? 'approved' : 'rejected'}`, 'success');
      await load();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusyId(null);
    }
  };

  if (!requests) return <TableSkeleton />;

  return (
    <div className="space-y-6">
      <PageHeader title="Join requests" subtitle="People who entered your institution code and await approval." />
      <Card>
        <CardHeader title={`Pending (${requests.length})`} />
        <CardBody>
          {requests.length === 0 ? (
            <EmptyState title="No pending requests" message="Requests appear here when someone joins with your institution code." />
          ) : (
            <div className="divide-y divide-slate-100">
              {requests.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-4 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">{r.full_name}</p>
                    <p className="text-sm text-slate-500">{r.email}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      requested {formatDate(r.created_at)}{r.identifier ? ` · ID ${r.identifier}` : ''}
                    </p>
                  </div>
                  <Badge className="bg-brand-50 text-brand-700 ring-brand-200 capitalize">{r.requested_role}</Badge>
                  <div className="flex gap-2">
                    <Button size="sm" loading={busyId === r.id} onClick={() => review(r, 'approve')}>Approve</Button>
                    <Button size="sm" variant="secondary" loading={busyId === r.id} onClick={() => review(r, 'reject')}>Reject</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
