// accept-invitation — after following the invite email link the user has a
// session; this creates their profile from the pending invitation.
import { errorResponse, handleOptions, jsonResponse } from '../_shared/cors.ts';
import { getCallerContext } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  const ctx = await getCallerContext(req);
  if ('error' in ctx) return errorResponse(ctx.error, ctx.status);

  // Already provisioned — idempotent retry.
  if (ctx.profile) {
    return jsonResponse({
      status: 'active',
      role: ctx.profile.role,
      institution_id: ctx.profile.institution_id,
      profile_created: false,
    });
  }

  const email = (ctx.user.email ?? '').toLowerCase();
  const { data: invitation } = await ctx.admin
    .from('invitations')
    .select('*')
    .or(`user_id.eq.${ctx.user.id},email.ilike.${email}`)
    .in('status', ['pending', 'sent'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!invitation) return errorResponse('no pending invitation found for this account', 404);
  if (new Date(invitation.expires_at) < new Date()) {
    await ctx.admin.from('invitations').update({ status: 'expired' }).eq('id', invitation.id);
    return errorResponse('this invitation has expired — ask your administrator to resend it', 410);
  }

  const { error: profileErr } = await ctx.admin.from('profiles').insert({
    id: ctx.user.id,
    institution_id: invitation.institution_id,
    full_name: invitation.full_name,
    email,
    role: invitation.role,
    identifier: invitation.identifier,
    account_status: 'active',
  });
  if (profileErr && profileErr.code !== '23505') {
    return errorResponse(`failed to create profile: ${profileErr.message}`, 500);
  }

  if (invitation.department_id) {
    await ctx.admin.from('department_members').insert({
      institution_id: invitation.institution_id,
      department_id: invitation.department_id,
      profile_id: ctx.user.id,
      membership_type: invitation.role === 'teacher' ? 'teacher' : 'student',
    });
  }

  await ctx.admin
    .from('invitations')
    .update({ status: 'accepted', accepted_at: new Date().toISOString(), user_id: ctx.user.id })
    .eq('id', invitation.id);

  return jsonResponse({
    status: 'active',
    role: invitation.role,
    institution_id: invitation.institution_id,
    profile_created: true,
  });
});
