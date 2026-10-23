// review-join-request — admin approves or rejects a pending join request.
// Approving creates the user's profile inside the admin's institution.
import { errorResponse, handleOptions, jsonResponse } from '../_shared/cors.ts';
import { getCallerContext, requireActive } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== 'POST') return errorResponse('method not allowed', 405);

  const ctx = await getCallerContext(req);
  if ('error' in ctx) return errorResponse(ctx.error, ctx.status);
  if (!requireActive(ctx)) return errorResponse('active profile required', 403);
  if (ctx.profile.role !== 'admin') return errorResponse('admin only', 403);

  const body = await req.json().catch(() => null);
  const requestId = String(body?.request_id ?? '');
  const action = String(body?.action ?? '');

  const { data: jr } = await ctx.admin
    .from('join_requests')
    .select('*')
    .eq('id', requestId)
    .eq('institution_id', ctx.profile.institution_id)
    .eq('status', 'pending')
    .maybeSingle();
  if (!jr) return errorResponse('pending join request not found', 404);

  if (action === 'reject') {
    await ctx.admin
      .from('join_requests')
      .update({ status: 'rejected', reviewed_by: ctx.profile.id })
      .eq('id', jr.id);
    return jsonResponse({ status: 'rejected' });
  }
  if (action !== 'approve') return errorResponse('action must be approve or reject');

  const { error: profileErr } = await ctx.admin.from('profiles').insert({
    id: jr.user_id,
    institution_id: jr.institution_id,
    full_name: jr.full_name,
    email: jr.email,
    role: jr.requested_role,
    identifier: jr.identifier,
    account_status: 'active',
  });
  if (profileErr && profileErr.code !== '23505') {
    return errorResponse(`failed to create profile: ${profileErr.message}`, 500);
  }

  await ctx.admin
    .from('join_requests')
    .update({ status: 'approved', reviewed_by: ctx.profile.id })
    .eq('id', jr.id);

  return jsonResponse({ status: 'approved' });
});
