// ai-intake — Gemini-assisted complaint interpretation. Returns structured
// extraction, category suggestion, follow-up questions, and the department
// suggested by the institution's routing rules. Degrades gracefully when
// Gemini is unavailable.
import { errorResponse, handleOptions, jsonResponse } from '../_shared/cors.ts';
import { getCallerContext, requireActive } from '../_shared/supabase.ts';
import { runIntake } from '../_shared/gemini.ts';

const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // ~4 MB base64 payload cap

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== 'POST') return errorResponse('method not allowed', 405);

  const ctx = await getCallerContext(req);
  if ('error' in ctx) return errorResponse(ctx.error, ctx.status);
  if (!requireActive(ctx)) return errorResponse('active profile required', 403);

  const body = await req.json().catch(() => null);
  const title = String(body?.title ?? '').trim();
  const description = String(body?.description ?? '').trim();
  const location = String(body?.location ?? '').trim();
  const imageBase64 = body?.image_base64 ? String(body.image_base64) : null;
  const imageMime = body?.image_mime ? String(body.image_mime) : null;

  if (description.length < 10) return errorResponse('describe the problem in at least 10 characters');
  if (imageBase64 && imageBase64.length > MAX_IMAGE_BYTES * 1.37) {
    return errorResponse('image is too large (max 4 MB)');
  }
  if (imageMime && !['image/jpeg', 'image/png', 'image/webp', 'image/heic'].includes(imageMime)) {
    return errorResponse('unsupported image type');
  }

  const intake = await runIntake({ title, description, location, imageBase64, imageMime });
  if (!intake.ai_available) {
    return jsonResponse({ ai_available: false, error: intake.error });
  }

  // Department suggestion comes from the institution's own routing rules —
  // never invented by the model.
  let suggestedDepartment: { id: string; name: string } | null = null;
  if (intake.suggested_category) {
    const { data: rule } = await ctx.admin
      .from('department_routing_rules')
      .select('department_id, departments!inner(id, name, is_active)')
      .eq('institution_id', ctx.profile.institution_id)
      .eq('category', intake.suggested_category)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    const dept = (rule as { departments?: { id: string; name: string; is_active: boolean } } | null)?.departments;
    if (dept?.is_active) suggestedDepartment = { id: dept.id, name: dept.name };
  }

  return jsonResponse({
    ...intake,
    suggested_department: suggestedDepartment,
    department_reasoning: suggestedDepartment
      ? `${intake.suggested_category} complaints are routed to ${suggestedDepartment.name} by your institution's routing rules.`
      : 'No routing rule is configured for this category — an administrator will triage it.',
  });
});
