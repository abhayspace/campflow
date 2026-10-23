// community — campus-wide voting, following, and moderation.
// POST { action: 'vote'|'unvote'|'follow'|'unfollow'|'moderate'|'unmoderate',
//        complaint_id, vote_type?, reason? }
import { errorResponse, handleOptions, jsonResponse } from '../_shared/cors.ts';
import { getCallerContext, requireActive } from '../_shared/supabase.ts';
import { notify } from '../_shared/notify.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
  if (req.method !== 'POST') return errorResponse('POST required', 405);

  const ctx = await getCallerContext(req);
  if ('error' in ctx) return errorResponse(ctx.error, ctx.status);
  if (!requireActive(ctx)) return errorResponse('active profile required', 403);
  const body = await req.json().catch(() => null);
  const action = body?.action;
  const complaintId = body?.complaint_id ? String(body.complaint_id) : null;
  if (!complaintId) return errorResponse('complaint_id required');

  const { data: c } = await ctx.admin
    .from('complaints')
    .select('id, institution_id, created_by, visibility, moderated, title, submission_type, status')
    .eq('id', complaintId)
    .eq('institution_id', ctx.profile.institution_id)
    .maybeSingle();
  if (!c) return errorResponse('submission not found', 404);

  // ---------- community voting ----------
  if (action === 'vote' || action === 'unvote') {
    const voteType = body?.vote_type;
    if (!['support', 'affected', 'report'].includes(voteType)) return errorResponse('invalid vote_type');
    if (ctx.profile.role === 'admin' && voteType !== 'report') return errorResponse('administrators do not cast community votes', 403);
    if (c.visibility !== 'campus' || c.moderated) return errorResponse('not a public submission', 400);
    if (c.created_by === ctx.user.id) return errorResponse('you cannot vote on your own submission');

    // crude rate limit: max 40 vote writes / minute per user
    const since = new Date(Date.now() - 60_000).toISOString();
    const { count: recent } = await ctx.admin
      .from('community_votes')
      .select('id', { count: 'exact', head: true })
      .eq('voter_id', ctx.user.id)
      .gt('created_at', since);
    if ((recent ?? 0) > 40) return errorResponse('too many votes — slow down', 429);

    if (action === 'vote') {
      const { error } = await ctx.admin.from('community_votes').insert({
        institution_id: ctx.profile.institution_id, complaint_id: complaintId,
        voter_id: ctx.user.id, vote_type: voteType,
      });
      if (error?.code === '23505') return errorResponse('already recorded', 409);
      if (error) return errorResponse(error.message, 500);
      if (voteType === 'report') {
        await ctx.admin.from('complaint_events').insert({
          institution_id: ctx.profile.institution_id, complaint_id: complaintId, actor_id: ctx.user.id,
          event_type: 'vote', new_value: 'report', is_internal: true,
          note: 'Reported for moderator review',
        });
      }
    } else {
      await ctx.admin.from('community_votes').delete()
        .eq('complaint_id', complaintId).eq('voter_id', ctx.user.id).eq('vote_type', voteType);
    }
    const { data: counts } = await ctx.admin.rpc('vote_counts', { p_ids: [complaintId] });
    return jsonResponse({ counts: counts?.[0] ?? { supporters: 0, affected: 0, reports: 0 } });
  }

  // ---------- follow ----------
  if (action === 'follow' || action === 'unfollow') {
    if (c.visibility !== 'campus' || c.moderated) return errorResponse('not a public submission', 400);
    if (action === 'follow') {
      await ctx.admin.from('submission_follows').upsert(
        { institution_id: ctx.profile.institution_id, complaint_id: complaintId, follower_id: ctx.user.id },
        { onConflict: 'complaint_id,follower_id' },
      );
    } else {
      await ctx.admin.from('submission_follows').delete()
        .eq('complaint_id', complaintId).eq('follower_id', ctx.user.id);
    }
    return jsonResponse({ following: action === 'follow' });
  }

  // ---------- moderation (staff only) ----------
  if (action === 'moderate' || action === 'unmoderate') {
    if (ctx.profile.role !== 'admin' && ctx.profile.role !== 'teacher') return errorResponse('staff only', 403);
    const reason = body?.reason ? String(body.reason).trim().slice(0, 500) : null;
    if (action === 'moderate' && !reason) return errorResponse('a moderation note is required');
    const moderated = action === 'moderate';
    await ctx.admin.from('complaints').update({
      moderated, moderated_by: moderated ? ctx.user.id : null,
      moderation_note: reason, updated_at: new Date().toISOString(),
    }).eq('id', complaintId);
    await ctx.admin.from('complaint_events').insert({
      institution_id: ctx.profile.institution_id, complaint_id: complaintId, actor_id: ctx.user.id,
      event_type: 'moderated', new_value: moderated ? 'hidden' : 'visible', note: reason,
    });
    if (moderated && c.created_by) {
      await notify(ctx.admin, {
        institutionId: ctx.profile.institution_id, recipientId: c.created_by,
        type: 'moderation', title: 'Your submission was hidden from the community feed',
        message: `"${c.title}" was hidden by moderators${reason ? `: ${reason}` : '.'}`,
        complaintId, dedupKey: `moderate:${complaintId}`,
      });
    }
    return jsonResponse({ moderated });
  }

  return errorResponse('unknown action');
});
