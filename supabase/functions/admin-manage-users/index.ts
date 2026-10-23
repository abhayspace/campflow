// admin-manage-users — privileged account operations: edit display fields,
// activate/deactivate (also bans/unbans the auth account), resend invites.
import { errorResponse, handleOptions, jsonResponse } from '../_shared/cors.ts';
import { getCallerContext, requireActive } from '../_shared/supabase.ts';
import { ticketLink } from '../_shared/email.ts';

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== 'POST') return errorResponse('method not allowed', 405);

  const ctx = await getCallerContext(req);
  if ('error' in ctx) return errorResponse(ctx.error, ctx.status);
  if (!requireActive(ctx)) return errorResponse('active profile required', 403);
  if (ctx.profile.role !== 'admin') return errorResponse('admin only', 403);
  const inst = ctx.profile.institution_id;

  const body = await req.json().catch(() => null);
  const action = String(body?.action ?? '');

  if (action === 'update_profile') {
    const userId = String(body?.user_id ?? '');
    const patch: Record<string, unknown> = {};
    if (body?.full_name != null) {
      const n = String(body.full_name).trim();
      if (n.length < 2) return errorResponse('full name is too short');
      patch.full_name = n;
    }
    if (body?.identifier !== undefined) patch.identifier = body.identifier ? String(body.identifier).trim() : null;
    if (!Object.keys(patch).length) return errorResponse('nothing to update');
    const { error } = await ctx.admin
      .from('profiles')
      .update(patch)
      .eq('id', userId)
      .eq('institution_id', inst);
    if (error) return errorResponse(error.message, 500);
    return jsonResponse({ status: 'updated' });
  }

  if (action === 'set_status') {
    const userId = String(body?.user_id ?? '');
    const status = String(body?.status ?? '');
    if (!['active', 'deactivated'].includes(status)) return errorResponse('invalid status');
    if (userId === ctx.profile.id) return errorResponse('you cannot change your own account status');

    const { data: target } = await ctx.admin
      .from('profiles')
      .select('id, role')
      .eq('id', userId)
      .eq('institution_id', inst)
      .maybeSingle();
    if (!target) return errorResponse('user not found in your institution', 404);

    const { error } = await ctx.admin
      .from('profiles')
      .update({ account_status: status })
      .eq('id', userId);
    if (error) return errorResponse(error.message, 500);

    // Block/restore sign-in at the auth layer too.
    await ctx.admin.auth.admin.updateUserById(userId, {
      ban_duration: status === 'deactivated' ? '876000h' : 'none',
    }).catch(() => {});

    // Deactivated users can no longer be assigned work or hold memberships.
    if (status === 'deactivated') {
      await ctx.admin.from('complaints').update({ assigned_to: null }).eq('assigned_to', userId).neq('status', 'closed');
      await ctx.admin.from('departments').update({ department_head_id: null }).eq('department_head_id', userId);
    }
    return jsonResponse({ status });
  }

  if (action === 'resend_invite') {
    const invitationId = String(body?.invitation_id ?? '');
    const { data: inv } = await ctx.admin
      .from('invitations')
      .select('*')
      .eq('id', invitationId)
      .eq('institution_id', inst)
      .maybeSingle();
    if (!inv) return errorResponse('invitation not found', 404);
    if (inv.status === 'accepted') return errorResponse('invitation already accepted');

    const { data: invited, error: authErr } = await ctx.admin.auth.admin.inviteUserByEmail(inv.email, {
      redirectTo: ticketLink('/auth/accept-invite'),
      data: { full_name: inv.full_name },
    });
    await ctx.admin
      .from('invitations')
      .update({
        status: authErr ? 'pending' : 'sent',
        user_id: invited?.user?.id ?? inv.user_id,
        expires_at: new Date(Date.now() + 14 * 86400_000).toISOString(),
      })
      .eq('id', inv.id);
    if (authErr) return errorResponse(authErr.message, 502);
    return jsonResponse({ status: 'sent' });
  }

  return errorResponse('unknown action');
});
