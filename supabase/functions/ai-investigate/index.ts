// ai-investigate — Gemini-powered investigator assist for an incident.
// Produces a summary, hypotheses (stored as ai_generated notes for staff
// review — never auto-confirmed), and suggested investigation steps.
// Facts come from the database; the model only interprets them.
import { errorResponse, handleOptions, jsonResponse } from '../_shared/cors.ts';
import { getCallerContext, requireActive } from '../_shared/supabase.ts';
import { aiConfigured, aiJson } from '../_shared/ai.ts';

const PROMPT = `You are an investigation assistant for Campflow, a campus operations platform.
You are given an incident and its linked complaint reports (real database records).
Return ONLY a JSON object with:
- "summary": 2-3 sentence factual summary of the incident based only on the evidence.
- "hypotheses": array of up to 4 objects {"text": possible root cause, "confidence": "low"|"medium"|"high", "evidence": which reports support it}.
- "suggested_steps": array of up to 5 concrete investigation or resolution steps for staff.
Rules:
- Only use the provided reports; do not invent locations, counts, or facts.
- Hypotheses are unconfirmed suggestions for staff review, never conclusions.
- If evidence is thin, say so plainly.
Return JSON only, no markdown fences.`;

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== 'POST') return errorResponse('method not allowed', 405);

  const ctx = await getCallerContext(req);
  if ('error' in ctx) return errorResponse(ctx.error, ctx.status);
  if (!requireActive(ctx)) return errorResponse('active profile required', 403);
  const me = ctx.profile!;
  if (!['admin', 'teacher'].includes(me.role)) return errorResponse('staff only', 403);
  const inst = me.institution_id;

  const body = await req.json().catch(() => null);
  const incidentId = String(body?.incident_id ?? '');

  const { data: incident } = await ctx.admin
    .from('incidents').select('*').eq('id', incidentId).eq('institution_id', inst).maybeSingle();
  if (!incident) return errorResponse('incident not found', 404);

  const { data: members } = await ctx.admin
    .from('incident_complaints')
    .select('complaints!inner(ticket_number, title, description, location, category, priority, status, created_at, ai_summary)')
    .eq('incident_id', incidentId);

  const reports = (members ?? []).map((m) => m.complaints as unknown as Record<string, unknown>);
  if (reports.length === 0) return errorResponse('incident has no linked reports');

  if (!aiConfigured()) return errorResponse('AI analysis is not configured', 503);

  const evidence = reports.map((r, i) =>
    `Report ${i + 1} [${r.ticket_number}] category=${r.category} priority=${r.priority} status=${r.status} location="${r.location}"\nTitle: ${r.title}\nDescription: ${r.description}`
  ).join('\n\n');

  try {
    const r = await aiJson({
      system: PROMPT,
      user: `Incident: "${incident.title}" (status=${incident.status}, category=${incident.category ?? 'unset'}, location="${incident.location}")\n\n${evidence}`,
      temperature: 0.3,
      timeoutMs: 25000,
    });
    if (!r.ok || !r.text) return errorResponse(r.error ?? 'AI analysis failed', r.status === 429 ? 429 : 502);
    const parsed = JSON.parse(r.text.replace(/```json|```/g, '').trim());

    // Persist hypotheses as clearly-labeled AI notes (staff must review).
    const hypotheses: { text: string; confidence?: string; evidence?: string }[] =
      Array.isArray(parsed.hypotheses) ? parsed.hypotheses.slice(0, 4) : [];
    for (const h of hypotheses) {
      const content = `${h.text}${h.evidence ? ` — supported by: ${h.evidence}` : ''}${h.confidence ? ` (AI confidence: ${h.confidence})` : ''}`;
      await ctx.admin.from('incident_notes').insert({
        institution_id: inst, incident_id: incidentId, author_id: null,
        note_type: 'hypothesis', content: String(content).slice(0, 2000), ai_generated: true,
      });
    }
    const steps: string[] = Array.isArray(parsed.suggested_steps) ? parsed.suggested_steps.map(String).slice(0, 5) : [];
    for (const s of steps) {
      await ctx.admin.from('incident_notes').insert({
        institution_id: inst, incident_id: incidentId, author_id: null,
        note_type: 'step', content: String(s).slice(0, 2000), ai_generated: true,
      });
    }

    // Store the AI summary on the incident (labeled in the UI).
    const summary = typeof parsed.summary === 'string' ? parsed.summary.slice(0, 1000) : null;
    if (summary) {
      await ctx.admin.from('incidents').update({ summary }).eq('id', incidentId);
    }

    return jsonResponse({ summary, hypotheses, suggested_steps: steps });
  } catch (e) {
    return errorResponse(`investigation failed: ${(e as Error).message}`, 502);
  }
});
