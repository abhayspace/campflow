import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { supabase } from '../../lib/supabase';
import { callFunction } from '../../lib/api';
import { CATEGORIES, REQUEST_STATUS_LABELS, STATUS_LABELS } from '../../lib/types';
import type { Complaint, ComplaintEvent, CommunityVoteType, VoteCounts } from '../../lib/types';
import { Badge, Button, Card, CardBody, EmptyState, Spinner } from '../../components/ui';
import { errorMessage, formatDateTime, timeAgo } from '../../lib/utils';
import GeminiSolution from '../../components/GeminiSolution';

export default function CommunityDetail() {
  const { id } = useParams();
  const { profile } = useAuth();
  const { toast } = useToast();
  const [item, setItem] = useState<Complaint | null>(null);
  const [counts, setCounts] = useState<VoteCounts>({ supporters: 0, affected: 0, reports: 0 });
  const [myVotes, setMyVotes] = useState<Set<CommunityVoteType>>(new Set());
  const [following, setFollowing] = useState(false);
  const [events, setEvents] = useState<ComplaintEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id || !profile) return;
    (async () => {
      const { data: c } = await supabase
        .from('complaints')
        .select('*, department:assigned_department_id(name)')
        .eq('id', id).eq('visibility', 'campus').eq('moderated', false)
        .maybeSingle();
      if (!c) { setNotFound(true); setLoading(false); return; }
      setItem(c as Complaint);

      const [{ data: vc }, { data: mv }, { data: fl }, { data: ev }] = await Promise.all([
        supabase.rpc('vote_counts', { p_ids: [id] }),
        supabase.from('community_votes').select('vote_type').eq('complaint_id', id).eq('voter_id', profile.id),
        supabase.from('submission_follows').select('id').eq('complaint_id', id).eq('follower_id', profile.id),
        supabase.from('complaint_events').select('*').eq('complaint_id', id).eq('is_internal', false)
          .order('created_at', { ascending: false }).limit(20),
      ]);
      const row = (vc ?? [])[0] as (VoteCounts & { complaint_id: string }) | undefined;
      if (row) setCounts({ supporters: row.supporters, affected: row.affected, reports: row.reports });
      setMyVotes(new Set((mv ?? []).map((v) => v.vote_type as CommunityVoteType)));
      setFollowing((fl ?? []).length > 0);
      setEvents((ev ?? []) as ComplaintEvent[]);
      setLoading(false);
    })();
  }, [id, profile]);

  const mine = item?.created_by === profile?.id;
  const canVote = profile?.role === 'student' || profile?.role === 'teacher';

  const act = async (payload: Record<string, unknown>, ok?: () => void) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await callFunction<{ counts?: VoteCounts }>('community', { complaint_id: id, ...payload });
      if (res.counts) setCounts(res.counts);
      ok?.();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const statusLabel = useMemo(() => {
    if (!item) return '';
    return item.submission_type === 'request' && item.request_status
      ? REQUEST_STATUS_LABELS[item.request_status]
      : STATUS_LABELS[item.status];
  }, [item]);

  if (loading) return <div className="flex justify-center py-20"><Spinner className="h-8 w-8 text-brand-600" /></div>;
  if (notFound || !item) {
    return <EmptyState title="Submission not found" message="It may be private, moderated, or removed." />;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link to="/community" className="text-sm font-semibold text-slate-400 hover:text-slate-700">← Community feed</Link>

      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-slate-400">{item.ticket_number}</span>
            <Badge className="bg-white text-slate-600 ring-slate-200">
              {item.submission_type === 'request' ? 'Request' : 'Complaint'}
            </Badge>
            <Badge className="bg-[#171716] text-white ring-[#171716]">{statusLabel}</Badge>
            <Badge>Campus</Badge>
          </div>

          <h1 className="text-xl font-bold text-slate-900">{item.title}</h1>
          <p className="text-sm leading-relaxed text-slate-600 whitespace-pre-wrap">{item.description}</p>

          {item.ai_summary && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">AI-generated summary</p>
              <p className="mt-1 text-sm text-slate-700">{item.ai_summary}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
            <span>📍 {item.location}</span>
            <span className="capitalize">{CATEGORIES.find((c) => c.value === item.category)?.label}</span>
            {item.department?.name && <span>Department: {item.department.name}</span>}
            <span>{formatDateTime(item.created_at)}</span>
            <span>Reported by a student</span>
          </div>

          {item.preferred_outcome && (
            <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
              <span className="font-semibold">Preferred outcome:</span> {item.preferred_outcome}
            </p>
          )}

          {item.resolution_notes && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Staff response</p>
              <p className="mt-1 text-sm text-slate-700">{item.resolution_notes}</p>
            </div>
          )}

          <div className="flex items-center gap-4 border-t border-slate-100 pt-3 text-sm">
            <span><strong>{counts.supporters}</strong> supporters</span>
            <span><strong>{counts.affected}</strong> affected students</span>
            {following && <span className="text-brand-600">Following</span>}
          </div>

          {!mine && canVote && (
            <div className="flex flex-wrap gap-2">
              <Button variant={myVotes.has('support') ? 'primary' : 'secondary'} disabled={busy}
                onClick={() => act({ action: myVotes.has('support') ? 'unvote' : 'vote', vote_type: 'support' },
                  () => setMyVotes((v) => { const n = new Set(v); myVotes.has('support') ? n.delete('support') : n.add('support'); return n; }))}>
                {myVotes.has('support') ? '✓ Supported' : 'I support this'}
              </Button>
              <Button variant={myVotes.has('affected') ? 'primary' : 'secondary'} disabled={busy}
                onClick={() => act({ action: myVotes.has('affected') ? 'unvote' : 'vote', vote_type: 'affected' },
                  () => setMyVotes((v) => { const n = new Set(v); myVotes.has('affected') ? n.delete('affected') : n.add('affected'); return n; }))}>
                {myVotes.has('affected') ? '✓ Affects me' : 'This affects me too'}
              </Button>
              <Button variant={following ? 'primary' : 'secondary'} disabled={busy}
                onClick={() => act({ action: following ? 'unfollow' : 'follow' }, () => setFollowing(!following))}>
                {following ? '✓ Following' : 'Follow'}
              </Button>
              <button disabled={busy} className="ml-auto text-xs font-semibold text-slate-400 hover:text-red-600"
                onClick={() => act({ action: myVotes.has('report') ? 'unvote' : 'vote', vote_type: 'report' },
                  () => setMyVotes((v) => { const n = new Set(v); myVotes.has('report') ? n.delete('report') : n.add('report'); return n; }))}>
                {myVotes.has('report') ? 'Reported — undo' : 'Report inaccurate'}
              </button>
            </div>
          )}
          {mine && <p className="text-xs text-slate-400">This is your submission — manage it under My Tickets.</p>}
        </CardBody>
      </Card>

      <GeminiSolution complaintId={item.id} canAddDetail={mine} />

      {events.length > 0 && (
        <Card>
          <CardBody>
            <h3 className="mb-3 text-sm font-bold text-slate-900">Public timeline</h3>
            <ol className="relative space-y-3 border-l border-slate-200 pl-4">
              {events.map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-brand-400 ring-4 ring-brand-50" />
                  <p className="text-sm text-slate-700">
                    {e.note ?? `${e.event_type.replace(/_/g, ' ')}${e.new_value ? ` → ${e.new_value}` : ''}`}
                  </p>
                  <p className="text-[11px] text-slate-400">{timeAgo(e.created_at)}</p>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
