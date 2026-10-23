// retry-email-deliveries — admin-triggered re-send of failed/pending email
// deliveries for their institution.
import { errorResponse, handleOptions, jsonResponse } from '../_shared/cors.ts';
import { getCallerContext, requireActive } from '../_shared/supabase.ts';
import { emailLayout, esc, sendEmail } from '../_shared/email.ts';

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== 'POST') return errorResponse('method not allowed', 405);

  const ctx = await getCallerContext(req);
  if ('error' in ctx) return errorResponse(ctx.error, ctx.status);
  if (!requireActive(ctx)) return errorResponse('active profile required', 403);
  if (ctx.profile.role !== 'admin') return errorResponse('admin only', 403);

  const { data: failed } = await ctx.admin
    .from('email_deliveries')
    .select('id, recipient_email, subject, attempts')
    .eq('institution_id', ctx.profile.institution_id)
    .in('status', ['pending', 'failed'])
    .lt('attempts', 5)
    .order('created_at')
    .limit(50);

  let retried = 0;
  for (const d of failed ?? []) {
    await ctx.admin.from('email_deliveries').update({ attempts: d.attempts + 1 }).eq('id', d.id);
    const res = await sendEmail(ctx.admin, {
      institutionId: ctx.profile.institution_id,
      to: d.recipient_email,
      subject: d.subject,
      html: emailLayout(d.subject, `<p>${esc(d.subject)}</p><p>Please sign in to Campflow for details.</p>`),
    });
    if (res.delivered) retried++;
  }

  return jsonResponse({ retried, attempted: failed?.length ?? 0 });
});
