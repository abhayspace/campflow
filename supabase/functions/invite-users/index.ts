// invite-users — admin creates invitations for students/teachers (single or
// CSV batch). Each invitee gets a Supabase invite email; accepting it creates
// their profile via the accept-invitation function.
import { errorResponse, handleOptions, jsonResponse } from '../_shared/cors.ts';
import { getCallerContext, requireActive } from '../_shared/supabase.ts';
import { ticketLink } from '../_shared/email.ts';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface InviteInput {
  email?: unknown;
  full_name?: unknown;
  role?: unknown;
  identifier?: unknown;
  department_id?: unknown;
}

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== 'POST') return errorResponse('method not allowed', 405);

  const ctx = await getCallerContext(req);
  if ('error' in ctx) return errorResponse(ctx.error, ctx.status);
  if (!requireActive(ctx)) return errorResponse('active profile required', 403);
  if (ctx.profile.role !== 'admin') return errorResponse('admin only', 403);

  const body = await req.json().catch(() => null);
  const users: InviteInput[] = Array.isArray(body?.users) ? body.users : body?.users ? [body.users] : [];
  if (!users.length || users.length > 200) return errorResponse('provide between 1 and 200 users');

  const results: { email: string; status: string; error?: string }[] = [];

  for (const u of users) {
    const email = String(u.email ?? '').trim().toLowerCase();
    const fullName = String(u.full_name ?? '').trim();
    const role = String(u.role ?? '');
    const identifier = u.identifier ? String(u.identifier).trim() : null;
    const departmentId = u.department_id ? String(u.department_id) : null;

    if (!EMAIL_RE.test(email) || fullName.length < 2 || !['student', 'teacher'].includes(role)) {
      results.push({ email: email || '(missing)', status: 'failed', error: 'invalid email, name, or role' });
      continue;
    }

    // Department must belong to this institution.
    if (departmentId) {
      const { data: dept } = await ctx.admin
        .from('departments')
        .select('id')
        .eq('id', departmentId)
        .eq('institution_id', ctx.profile.institution_id)
        .maybeSingle();
      if (!dept) {
        results.push({ email, status: 'failed', error: 'department not found' });
        continue;
      }
    }

    // Block duplicates: existing profile in this institution.
    const { data: existing } = await ctx.admin
      .from('profiles')
      .select('id')
      .eq('institution_id', ctx.profile.institution_id)
      .ilike('email', email)
      .maybeSingle();
    if (existing) {
      results.push({ email, status: 'failed', error: 'a user with this email already exists' });
      continue;
    }

    const { data: existingInv } = await ctx.admin
      .from('invitations')
      .select('id, status')
      .eq('institution_id', ctx.profile.institution_id)
      .ilike('email', email)
      .maybeSingle();

    const invitePayload = {
      full_name: fullName,
      role,
      identifier,
      department_id: departmentId,
      invited_by: ctx.profile.id,
      status: 'pending' as const,
      expires_at: new Date(Date.now() + 14 * 86400_000).toISOString(),
    };
    const invErr = existingInv
      ? (await ctx.admin.from('invitations').update(invitePayload).eq('id', existingInv.id)).error
      : (await ctx.admin.from('invitations').insert({
          ...invitePayload,
          institution_id: ctx.profile.institution_id,
          email,
        })).error;
    if (invErr) {
      results.push({ email, status: 'failed', error: invErr.message });
      continue;
    }

    const { data: invited, error: authErr } = await ctx.admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: ticketLink('/auth/accept-invite'),
      data: { full_name: fullName },
    });

    const { data: invRow } = await ctx.admin
      .from('invitations')
      .update({
        status: authErr ? 'pending' : 'sent',
        user_id: invited?.user?.id ?? null,
      })
      .eq('institution_id', ctx.profile.institution_id)
      .ilike('email', email)
      .select('id')
      .single();

    results.push({
      email,
      status: authErr ? 'failed' : 'sent',
      error: authErr?.message,
      ...(invRow ? {} : {}),
    });
  }

  return jsonResponse({ results });
});
