import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { supabase } from '../../lib/supabase';
import { callFunction } from '../../lib/api';
import { CATEGORIES, REQUEST_STATUS_LABELS, STATUS_LABELS } from '../../lib/types';
import type { Complaint, CommunityVoteType, VoteCounts } from '../../lib/types';
import { Badge, Button, Card, CardBody, EmptyState, PageHeader, Select, Spinner } from '../../components/ui';
import { cx, errorMessage, timeAgo } from '../../lib/utils';

type FeedFilter = 'all' | 'complaint' | 'request';

interface FeedItem extends Complaint {
  counts: VoteCounts;
  myVotes: Set<CommunityVoteType>;
  following: boolean;
}

export default function Community() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sort, setSort] = useState<'recent' | 'popular' | 'affected'>('recent');
  const [busy, setBusy] = useState<string | null>(null);

  const canVote = profile?.role === 'student' || profile?.role === 'teacher'; // admin can't vote

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const { data: rows } = await supabase
      .from('complaints')
      .select('id, ticket_number, title, description, location, category, status, request_status, submission_type, visibility, priority, created_at, ai_summary, created_by, department:assigned_department_id(name)')
      .eq('visibility', 'campus')
      .eq('moderated', false)
      .order('created_at', { ascending: false })
      .limit(100);
    const list = (rows ?? []) as unknown as Complaint[];
    const ids = list.map((r) => r.id);

    let counts: Record<string, VoteCounts> = {};
    if (ids.length) {
      const { data: vc } = await supabase.rpc('vote_counts', { p_ids: ids });
      for (const v of (vc ?? []) as (VoteCounts & { complaint_id: string })[]) {
        counts[v.complaint_id] = { supporters: v.supporters, affected: v.affected, reports: v.reports };
      }
    }

    const { data: myVotes } = await supabase
      .from('community_votes').select('complaint_id, vote_type')
      .eq('voter_id', profile.id).in('complaint_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
    const voteMap = new Map<string, Set<CommunityVoteType>>();
    for (const v of myVotes ?? []) {
      if (!voteMap.has(v.complaint_id)) voteMap.set(v.complaint_id, new Set());
      voteMap.get(v.complaint_id)!.add(v.vote_type as CommunityVoteType);
    }

    const { data: follows } = await supabase
      .from('submission_follows').select('complaint_id')
      .eq('follower_id', profile.id).in('complaint_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
    const followSet = new Set((follows ?? []).map((f) => f.complaint_id));

    setItems(list.map((c) => ({
      ...c,
      counts: counts[c.id] ?? { supporters: 0, affected: 0, reports: 0 },
      myVotes: voteMap.get(c.id) ?? new Set(),
      following: followSet.has(c.id),
    })));
    setLoading(false);
  }, [profile]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    let out = items;
    if (filter !== 'all') out = out.filter((i) => i.submission_type === filter);
    if (categoryFilter) out = out.filter((i) => i.category === categoryFilter);
    if (sort === 'popular') out = [...out].sort((a, b) => b.counts.supporters - a.counts.supporters);
    if (sort === 'affected') out = [...out].sort((a, b) => b.counts.affected - a.counts.affected);
    return out;
  }, [items, filter, categoryFilter, sort]);

  const vote = async (item: FeedItem, type: CommunityVoteType) => {
    if (!profile || busy) return;
    setBusy(item.id + type);
    const active = item.myVotes.has(type);
    try {
      const res = await callFunction<{ counts: VoteCounts }>('community', {
        action: active ? 'unvote' : 'vote', complaint_id: item.id, vote_type: type,
      });
      setItems((prev) => prev.map((i) => {
        if (i.id !== item.id) return i;
        const mv = new Set(i.myVotes);
        if (active) mv.delete(type); else mv.add(type);
        return { ...i, myVotes: mv, counts: res.counts };
      }));
      if (type === 'report' && !active) toast('Thanks — moderators will review this submission.');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const follow = async (item: FeedItem) => {
    if (!profile || busy) return;
    setBusy(item.id + 'follow');
    try {
      await callFunction('community', {
        action: item.following ? 'unfollow' : 'follow', complaint_id: item.id,
      });
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, following: !i.following } : i)));
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const statusLabel = (i: FeedItem) =>
    i.submission_type === 'request' && i.request_status
      ? REQUEST_STATUS_LABELS[i.request_status]
      : STATUS_LABELS[i.status];

  if (loading) return <div className="flex justify-center py-20"><Spinner className="h-8 w-8 text-brand-600" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campus Community"
        subtitle="Public issues and requests from your campus. Support what matters, flag what doesn't look right."
        actions={
          <Link to="/student/new">
            <Button>New submission</Button>
          </Link>
        }
      />

      <div className="flex flex-col gap-3 rounded-[26px] bg-white p-3 shadow-[0_8px_28px_rgba(36,25,85,0.05)] lg:flex-row lg:flex-wrap lg:items-center">
        <div className="flex w-full rounded-full bg-slate-50 p-1 sm:w-auto">
          {(['all', 'complaint', 'request'] as FeedFilter[]).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={cx('flex-1 rounded-full px-4 py-2 text-xs font-semibold capitalize transition-colors sm:flex-none',
                filter === f ? 'bg-candy-ink text-white' : 'text-slate-500 hover:text-slate-900')}>
              {f === 'all' ? 'All' : f + 's'}
            </button>
          ))}
        </div>
        <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="w-full sm:w-44" aria-label="Category">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="w-full sm:w-44" aria-label="Sort">
          <option value="recent">Most recent</option>
          <option value="popular">Most supported</option>
          <option value="affected">Most affected</option>
        </Select>
        <p className="text-xs font-semibold text-slate-400 lg:ml-auto">{filtered.length} public submission{filtered.length === 1 ? '' : 's'}</p>
      </div>

      {filtered.length === 0 && (
        <EmptyState title="Nothing on the community feed yet"
          message="Campus-wide complaints and requests will appear here once students submit them. Personal submissions always stay private." />
      )}

      <div className="space-y-3">
        {filtered.map((item) => {
          const mine = item.created_by === profile?.id;
          return (
            <Card key={item.id}>
              <CardBody className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-slate-400">{item.ticket_number}</span>
                      <Badge className="bg-white text-slate-600 ring-slate-200">
                        {item.submission_type === 'request' ? 'Request' : 'Complaint'}
                      </Badge>
                      <Badge className="bg-[#171716] text-white ring-[#171716]">{statusLabel(item)}</Badge>
                      {item.ai_summary && <Badge>AI summary</Badge>}
                    </div>
                    <Link to={mine ? `/student/tickets/${item.id}` : `/community/${item.id}`}
                      className="mt-1 block text-base font-bold text-slate-900 hover:text-brand-700">
                      {item.title}
                    </Link>
                  </div>
                  <span className="text-xs text-slate-400">{timeAgo(item.created_at)}</span>
                </div>

                <p className="line-clamp-2 text-sm text-slate-600">
                  {item.ai_summary ?? item.description}
                </p>
                {item.ai_summary && (
                  <p className="text-[11px] italic text-slate-400">Summary generated by AI — see the original report for full details.</p>
                )}

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span>{item.location}</span>
                  <span className="capitalize">{CATEGORIES.find((c) => c.value === item.category)?.label ?? item.category}</span>
                  {item.department?.name && <span>Dept: {item.department.name}</span>}
                  <span className="font-semibold text-slate-600">{item.counts.supporters} supporters</span>
                  <span className="font-semibold text-slate-600">{item.counts.affected} affected</span>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                  {mine ? (
                    <p className="text-xs text-slate-400">Your submission — you can't vote on it yourself.</p>
                  ) : canVote ? (
                    <>
                      <Button size="sm" variant={item.myVotes.has('support') ? 'primary' : 'secondary'}
                        disabled={busy === item.id + 'support'}
                        onClick={() => vote(item, 'support')}>
                        {item.myVotes.has('support') ? '✓ Supported' : 'I support this'}
                      </Button>
                      <Button size="sm" variant={item.myVotes.has('affected') ? 'primary' : 'secondary'}
                        disabled={busy === item.id + 'affected'}
                        onClick={() => vote(item, 'affected')}>
                        {item.myVotes.has('affected') ? '✓ Affects me' : 'This affects me too'}
                      </Button>
                      <Button size="sm" variant={item.following ? 'primary' : 'secondary'}
                        disabled={busy === item.id + 'follow'}
                        onClick={() => follow(item)}>
                        {item.following ? '✓ Following' : 'Follow'}
                      </Button>
                      <button
                        onClick={() => vote(item, 'report')}
                        disabled={busy === item.id + 'report'}
                        className="ml-auto text-xs font-semibold text-slate-400 hover:text-red-600"
                      >
                        {item.myVotes.has('report') ? 'Reported — undo' : 'Report inaccurate'}
                      </button>
                    </>
                  ) : (
                    <p className="text-xs text-slate-400">Voting is for students and staff members.</p>
                  )}
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
