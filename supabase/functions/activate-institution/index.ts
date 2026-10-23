// activate-institution — flips a pending institution to active once the
// administrator's email has been verified. Idempotent.
import { errorResponse, handleOptions, jsonResponse } from '../_shared/cors.ts';
import { getCallerContext, requireProfile } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  const ctx = await getCallerContext(req);
  if ('error' in ctx) return errorResponse(ctx.error, ctx.status);
  if (!requireProfile(ctx)) return errorResponse('profile not found', 403);
  if (ctx.profile.role !== 'admin') return errorResponse('admin only', 403);

  const { data, error } = await ctx.admin.rpc('activate_institution', { p_user: ctx.user.id });
  if (error) return errorResponse(error.message, 400);
  return jsonResponse({ institution: data });
});
