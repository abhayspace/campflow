// ai-solutions — Gemini-powered analysis panel for a complaint or request.
// POST { complaint_id }
// Produces a structured analysis (stored on complaints.ai_analysis) and
// suggested solutions (stored as source='ai' rows in solutions) — all clearly
// reviewable; nothing is auto-accepted or auto-applied.
import { errorResponse, handleOptions, jsonResponse } from '../_shared/cors.ts';
import { getCallerContext, requireActive } from '../_shared/supabase.ts';
import { aiConfigured, aiJson } from '../_shared/ai.ts';

const PROMPT = `You are an operations analyst for a campus issue-management platform.
Analyze this submission and return ONLY compact JSON:
{
  "problem_statement": string,
  "known_facts": string[],
  "missing_information": string[],
  "hypotheses": [{ "text": string, "confidence": "high"|"medium"|"low", "evidence": string }],
  "suggested_steps": string[],
  "suggested_priority": "low"|"medium"|"high"|"urgent",
  "priority_reason": string,
  "suggested_department": string | null,
  "solutions": [{ "text": string, "caution": string }],
  "request_extras": {
    "intended_benefit": string,
    "affected_groups": string[],
    "questions_for_staff": string[],
    "implementation_approaches": string[],
    "info_needed_before_approval": string[]
  } | null
}
Rules: never present speculation as fact; hypotheses must be labeled; solutions
are suggestions only, never approvals. request_extras is null unless the
submission type is "request". Choose suggested_department from the provided
department list only.`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
  if (req.method !== 'POST') return errorResponse('POST required', 405);
  const ctx = await getCallerContext(req);
  if ('error' in ctx) return errorResponse(ctx.error, ctx.status);
  if (!requireActive(ctx)) return errorResponse('active profile required', 403);
  if (ctx.profile.role !== 'admin' && ctx.profile.role !== 'teacher') return errorResponse('staff only', 403);

  const body = await req.json().catch(() => null);
  const complaintId = body?.complaint_id ? String(body.complaint_id) : null;
  if (!complaintId) return errorResponse('complaint_id required');

  const { data: c } = await ctx.admin
    .from('complaints')
    .select('id, institution_id, ticket_number, title, description, location, category, priority, submission_type, preferred_outcome, status, request_status')
    .eq('id', complaintId).eq('institution_id', ctx.profile.institution_id).maybeSingle();
  if (!c) return errorResponse('submission not found', 404);

  if (!aiConfigured()) return errorResponse('AI analysis is not configured', 503);

  const { data: depts } = await ctx.admin
    .from('departments').select('name').eq('institution_id', ctx.profile.institution_id).eq('is_active', true);

  const { data: linked } = await ctx.admin
    .from('community_votes')
    .select('vote_type', { count: 'exact', head: false })
    .eq('complaint_id', complaintId);
  const counts = { support: 0, affected: 0, report: 0 };
  for (const v of linked ?? []) counts[v.vote_type as keyof typeof counts] += 1;

  const context = {
    type: c.submission_type, ticket: c.ticket_number, title: c.title,
    description: c.description, location: c.location, category: c.category,
    declared_priority: c.priority, status: c.submission_type === 'request' ? c.request_status : c.status,
    preferred_outcome: c.preferred_outcome,
    community: { supporters: counts.support, affected_students: counts.affected },
    departments: (depts ?? []).map((d: { name: string }) => d.name),
  };

  const r = await aiJson({
    system: PROMPT,
    user: `SUBMISSION:\n${JSON.stringify(context)}`,
    temperature: 0.2,
  });
  if (!r.ok || !r.text) return errorResponse(r.error ?? 'AI error', r.status === 429 ? 429 : 502);
  let analysis: Record<string, unknown>;
  try { analysis = JSON.parse(r.text); } catch { return errorResponse('could not parse AI analysis', 502); }
  if (r.provider) (analysis as Record<string, unknown>)._model = r.model;

  const now = new Date().toISOString();
  await ctx.admin.from('complaints').update({ ai_analysis: analysis, updated_at: now }).eq('id', complaintId);

  // Persist suggested solutions as reviewable rows (never auto-accepted).
  const sols = Array.isArray(analysis.solutions) ? (analysis.solutions as { text?: string; caution?: string }[]) : [];
  for (const s of sols.slice(0, 4)) {
    if (!s?.text) continue;
    await ctx.admin.from('solutions').insert({
      institution_id: ctx.profile.institution_id, complaint_id: complaintId,
      source: 'ai', content: s.text + (s.caution ? ` (note: ${s.caution})` : ''),
      status: 'suggested',
    });
  }
  await ctx.admin.from('complaint_events').insert({
    institution_id: ctx.profile.institution_id, complaint_id: complaintId, actor_id: ctx.user.id,
    event_type: 'note', note: 'AI analysis generated — hypotheses and solutions are suggestions for staff review',
    is_internal: true,
  });

  return jsonResponse({ analysis });
});
