// join-institution — a verified user without a profile requests to join an
// institution by code. Creates a join_request the admin must approve; the
// code alone grants nothing.
import { errorResponse, handleOptions, jsonResponse } from '../_shared/cors.ts';
import { getCallerContext } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== 'POST') return errorResponse('method not allowed', 405);

  const ctx = await getCallerContext(req);
  if ('error' in ctx) return errorResponse(ctx.error, ctx.status);
  if (ctx.profile) return errorResponse('account already belongs to an institution', 409);
  if (!ctx.user.email_confirmed_at) return errorResponse('verify your email first', 403);

  const body = await req.json().catch(() => null);
  const code = String(body?.institution_code ?? '').trim();
  const requestedRole = String(body?.requested_role ?? 'student');
  const fullName = String(body?.full_name ?? '').trim();
  const identifier = body?.identifier ? String(body.identifier).trim() : null;

  if (!code) return errorResponse('institution code is required');
  if (!['student', 'teacher'].includes(requestedRole)) return errorResponse('invalid role');
  if (fullName.length < 2) return errorResponse('full name is required');

  const { data: instRows } = await ctx.admin.rpc('institution_by_code', { p_code: code });
  const inst = (instRows as { id: string; name: string }[] | null)?.[0];
  if (!inst) return errorResponse('institution code not recognized', 404);

  const { data: instRow } = await ctx.admin
    .from('institutions')
    .select('id, status')
    .eq('id', inst.id)
    .single();
  if (!instRow || instRow.status !== 'active') {
    return errorResponse('this institution is not accepting members yet', 409);
  }

  const { data, error } = await ctx.admin
    .from('join_requests')
    .upsert(
      {
        institution_id: inst.id,
        user_id: ctx.user.id,
        email: (ctx.user.email ?? '').toLowerCase(),
        full_name: fullName,
        requested_role: requestedRole,
        identifier,
        status: 'pending',
      },
      { onConflict: 'user_id,institution_id' },
    )
    .select('id, status')
    .single();

  if (error) return errorResponse(error.message, 500);
  return jsonResponse({ join_request: data, institution: { id: inst.id, name: inst.name } });
});
