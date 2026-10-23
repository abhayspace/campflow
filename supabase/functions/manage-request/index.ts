// manage-request — the distinct approval workflow for requests.
// POST { complaint_id, to_status, reason?, plan_note? }
// submitted → under_review → (info_required | under_consideration) → approved |
// declined → approved → planned → in_progress → implemented | closed
import { errorResponse, handleOptions, jsonResponse } from '../_shared/cors.ts';
import { getCallerContext, requireActive } from '../_shared/supabase.ts';
import { notify } from '../_shared/notify.ts';

const REQUEST_FLOW: Record<string, string[]> = {
  submitted: ['under_review'],
  under_review: ['info_required', 'under_consideration', 'declined'],
  info_required: ['under_review'],
  under_consideration: ['approved', 'declined'],
  approved: ['planned'],
  planned: ['in_progress'],
  in_progress: ['implemented'],
  implemented: ['closed'],
  declined: ['under_review'],
};

const REQUIRES_REASON = new Set(['declined', 'info_required']);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
  if (req.method !== 'POST') return errorResponse('POST required', 405);
  const ctx = await getCallerContext(req);
  if ('error' in ctx) return errorResponse(ctx.error, ctx.status);
  if (!requireActive(ctx)) return errorResponse('active profile required', 403);
  if (ctx.profile.role !== 'admin' && ctx.profile.role !== 'teacher') return errorResponse('staff only', 403);

  const body = await req.json().catch(() => null);
  const complaintId = body?.complaint_id ? String(body.complaint_id) : null;
  const to = body?.to_status ? String(body.to_status) : null;
  const reason = body?.reason ? String(body.reason).trim().slice(0, 1000) : null;
  if (!complaintId || !to) return errorResponse('complaint_id and to_status required');

  const { data: c } = await ctx.admin
    .from('complaints')
    .select('id, institution_id, ticket_number, title, submission_type, request_status, created_by, visibility')
    .eq('id', complaintId).eq('institution_id', ctx.profile.institution_id).maybeSingle();
  if (!c) return errorResponse('submission not found', 404);
  if (c.submission_type !== 'request') return errorResponse('not a request', 400);

  const current = c.request_status ?? 'submitted';
  if (!REQUEST_FLOW[current]?.includes(to)) {
    return errorResponse(`cannot move from ${current} to ${to}`);
  }
  if (REQUIRES_REASON.has(to) && !reason) return errorResponse(`a reason is required when setting "${to}"`);

  const now = new Date().toISOString();
  const resolved = to === 'implemented' ? now : null;
  await ctx.admin.from('complaints').update({
    request_status: to, resolved_at: resolved ?? undefined,
    status: to === 'implemented' ? 'resolved' : to === 'closed' ? 'closed' : 'in_progress',
    verification: to === 'implemented' ? 'awaiting_verification' : undefined,
    updated_at: now,
  }).eq('id', complaintId);

  await ctx.admin.from('complaint_events').insert({
    institution_id: ctx.profile.institution_id, complaint_id: complaintId, actor_id: ctx.user.id,
    event_type: 'request_status', previous_value: current, new_value: to, note: reason,
  });

  const label = to.replace(/_/g, ' ');
  if (c.created_by) {
    await notify(ctx.admin, {
      institutionId: ctx.profile.institution_id, recipientId: c.created_by,
      type: 'request_update', title: `Request ${c.ticket_number}: ${label}`,
      message: `"${c.title}" is now ${label.replace(/\b\w/g, (x: string) => x.toUpperCase())}${reason ? ` — ${reason}` : '.'}`,
      complaintId, dedupKey: `req-status:${complaintId}:${to}`,
    });
  }
  // followers of a campus-wide request get status updates too
  if (c.visibility === 'campus') {
    const { data: followers } = await ctx.admin
      .from('submission_follows').select('follower_id').eq('complaint_id', complaintId);
    for (const f of followers ?? []) {
      if (f.follower_id === c.created_by) continue;
      await notify(ctx.admin, {
        institutionId: ctx.profile.institution_id, recipientId: f.follower_id,
        type: 'followed_update', title: `Update on a request you follow`,
        message: `"${c.title}" is now ${label}.`,
        complaintId, dedupKey: `req-status:${complaintId}:${to}:${f.follower_id}`,
      });
    }
  }
  return jsonResponse({ request_status: to });
});
