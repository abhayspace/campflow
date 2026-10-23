// surveys — create / publish / respond / close.
// POST { action: 'create' | 'publish' | 'respond' | 'close', ... }
import { errorResponse, handleOptions, jsonResponse } from '../_shared/cors.ts';
import { getCallerContext, requireActive } from '../_shared/supabase.ts';
import { notify } from '../_shared/notify.ts';

interface QuestionInput { question_type: string; text: string; options?: string[]; required?: boolean }

const VALID_TYPES = new Set(['single', 'multi', 'rating', 'yesno', 'text']);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
  if (req.method !== 'POST') return errorResponse('POST required', 405);
  const ctx = await getCallerContext(req);
  if ('error' in ctx) return errorResponse(ctx.error, ctx.status);
  if (!requireActive(ctx)) return errorResponse('active profile required', 403);
  const body = await req.json().catch(() => null);
  const action = body?.action;
  const inst = ctx.profile.institution_id;

  // ---------- create ----------
  if (action === 'create') {
    if (ctx.profile.role !== 'admin' && ctx.profile.role !== 'teacher') return errorResponse('staff only', 403);
    const title = body?.title ? String(body.title).trim() : '';
    const complaintId = body?.complaint_id ? String(body.complaint_id) : null;
    if (!title) return errorResponse('title required');
    const questions: QuestionInput[] = Array.isArray(body?.questions) ? body.questions : [];
    if (!questions.length) return errorResponse('at least one question required');
    for (const q of questions) {
      if (!VALID_TYPES.has(q.question_type)) return errorResponse(`invalid question type: ${q.question_type}`);
      if (!q.text?.trim()) return errorResponse('question text required');
      if ((q.question_type === 'single' || q.question_type === 'multi') && !((q.options?.length ?? 0) >= 2)) {
        return errorResponse('choice questions need at least 2 options');
      }
    }
    if (complaintId) {
      const { data: c } = await ctx.admin.from('complaints').select('id')
        .eq('id', complaintId).eq('institution_id', inst).maybeSingle();
      if (!c) return errorResponse('submission not found', 404);
    }
    const { data: survey, error } = await ctx.admin.from('surveys').insert({
      institution_id: inst, complaint_id: complaintId, title,
      description: body?.description ? String(body.description).trim() : null,
      anonymous: body?.anonymous !== false,
      deadline: body?.deadline ? String(body.deadline) : null,
      status: 'draft', created_by: ctx.user.id,
    }).select().single();
    if (error) return errorResponse(error.message, 500);
    const qRows = questions.map((q, i) => ({
      survey_id: survey.id, ord: i,
      question_type: q.question_type, text: q.text.trim(),
      options: q.options ?? [], required: q.required !== false,
    }));
    await ctx.admin.from('survey_questions').insert(qRows);
    return jsonResponse({ survey }, 201);
  }

  // ---------- publish ----------
  if (action === 'publish') {
    if (ctx.profile.role !== 'admin' && ctx.profile.role !== 'teacher') return errorResponse('staff only', 403);
    const surveyId = body?.survey_id ? String(body.survey_id) : null;
    if (!surveyId) return errorResponse('survey_id required');
    const { data: s } = await ctx.admin.from('surveys').select('*')
      .eq('id', surveyId).eq('institution_id', inst).maybeSingle();
    if (!s) return errorResponse('survey not found', 404);
    if (s.status !== 'draft') return errorResponse('survey is not a draft');

    // Eligible recipients: explicit list, else derive from the linked submission —
    // personal → submitter only; campus-wide → submitter + affected voters.
    let recipients: string[] = Array.isArray(body?.recipient_ids) ? body.recipient_ids : [];
    if (!recipients.length && s.complaint_id) {
      const { data: c } = await ctx.admin.from('complaints')
        .select('created_by, visibility').eq('id', s.complaint_id).single();
      if (c?.created_by) recipients.push(c.created_by);
      if (c?.visibility === 'campus') {
        const { data: affected } = await ctx.admin.from('community_votes')
          .select('voter_id').eq('complaint_id', s.complaint_id).eq('vote_type', 'affected');
        for (const v of affected ?? []) recipients.push(v.voter_id);
      }
    }
    recipients = [...new Set(recipients)];
    if (!recipients.length) return errorResponse('no eligible recipients');

    // validate recipients belong to the institution + are students
    const { data: profiles } = await ctx.admin.from('profiles')
      .select('id').in('id', recipients).eq('institution_id', inst).eq('role', 'student');
    const valid = new Set((profiles ?? []).map((p: { id: string }) => p.id));
    recipients = recipients.filter((r) => valid.has(r));
    if (!recipients.length) return errorResponse('no eligible recipients');

    await ctx.admin.from('survey_recipients').insert(
      recipients.map((pid) => ({ institution_id: inst, survey_id: surveyId, profile_id: pid })),
    );
    await ctx.admin.from('surveys').update({ status: 'published', published_at: new Date().toISOString() })
      .eq('id', surveyId);
    if (s.complaint_id) {
      await ctx.admin.from('complaint_events').insert({
        institution_id: inst, complaint_id: s.complaint_id, actor_id: ctx.user.id,
        event_type: 'survey_sent', new_value: 'published',
        note: `Survey "${s.title}" sent to ${recipients.length} eligible student${recipients.length === 1 ? '' : 's'}`,
      });
    }
    for (const pid of recipients) {
      await notify(ctx.admin, {
        institutionId: inst, recipientId: pid,
        type: 'survey', title: 'Your feedback is requested',
        message: `"${s.title}" — please share your experience${s.deadline ? ` by ${new Date(s.deadline).toLocaleDateString()}` : ''}. Responses are ${s.anonymous ? 'anonymous' : 'visible to staff'}.`,
        complaintId: s.complaint_id, dedupKey: `survey:${surveyId}:${pid}`,
      });
    }
    return jsonResponse({ recipients: recipients.length });
  }

  // ---------- respond ----------
  if (action === 'respond') {
    if (ctx.profile.role !== 'student') return errorResponse('students only', 403);
    const surveyId = body?.survey_id ? String(body.survey_id) : null;
    const answers = body?.answers;
    if (!surveyId || !Array.isArray(answers)) return errorResponse('survey_id and answers required');

    const { data: s } = await ctx.admin.from('surveys').select('*')
      .eq('id', surveyId).eq('institution_id', inst).maybeSingle();
    if (!s) return errorResponse('survey not found', 404);
    if (s.status !== 'published') return errorResponse('survey is not open');
    if (s.deadline && new Date(s.deadline) < new Date()) return errorResponse('survey deadline has passed');

    const { data: eligible } = await ctx.admin.from('survey_recipients').select('id')
      .eq('survey_id', surveyId).eq('profile_id', ctx.user.id).maybeSingle();
    if (!eligible) return errorResponse('you are not an eligible respondent', 403);

    const { data: existing } = await ctx.admin.from('survey_responses').select('id')
      .eq('survey_id', surveyId).eq('respondent_id', ctx.user.id).maybeSingle();
    if (existing) return errorResponse('you have already responded', 409);

    const { data: questions } = await ctx.admin.from('survey_questions').select('*').eq('survey_id', surveyId);
    const qMap = new Map((questions ?? []).map((q: { id: string }) => [q.id, q]));
    for (const a of answers) {
      const q = qMap.get(a.question_id);
      if (!q) return errorResponse('invalid question in answers');
    }
    for (const q of questions ?? []) {
      const a = answers.find((x: { question_id: string }) => x.question_id === q.id);
      if (q.required && (a === undefined || a.value === null || a.value === '' || (Array.isArray(a.value) && !a.value.length))) {
        return errorResponse(`question "${q.text}" requires an answer`);
      }
      if (a !== undefined && q.question_type !== 'text') {
        if (q.question_type === 'rating' && (typeof a.value !== 'number' || a.value < 1 || a.value > 5)) {
          return errorResponse(`invalid rating for "${q.text}"`);
        }
        if (q.question_type === 'yesno' && !['yes', 'no', 'not_sure'].includes(a.value)) {
          return errorResponse(`invalid answer for "${q.text}"`);
        }
        if (q.question_type === 'single' && !(q.options as string[]).includes(a.value)) {
          return errorResponse(`invalid option for "${q.text}"`);
        }
        if (q.question_type === 'multi' && (!Array.isArray(a.value) || a.value.some((v: string) => !(q.options as string[]).includes(v)))) {
          return errorResponse(`invalid options for "${q.text}"`);
        }
      }
    }

    const { data: response, error } = await ctx.admin.from('survey_responses')
      .insert({ survey_id: surveyId, respondent_id: ctx.user.id }).select().single();
    if (error?.code === '23505') return errorResponse('you have already responded', 409);
    if (error) return errorResponse(error.message, 500);
    const rows = answers
      .filter((a: { question_id: string; value: unknown }) => qMap.has(a.question_id) && a.value !== undefined && a.value !== null && a.value !== '')
      .map((a: { question_id: string; value: unknown }) => ({
        response_id: response.id, question_id: a.question_id,
        value: typeof a.value === 'object' ? a.value : String(a.value).slice(0, 2000),
      }));
    if (rows.length) await ctx.admin.from('survey_answers').insert(rows);
    return jsonResponse({ submitted: true });
  }

  // ---------- close ----------
  if (action === 'close') {
    if (ctx.profile.role !== 'admin' && ctx.profile.role !== 'teacher') return errorResponse('staff only', 403);
    const surveyId = body?.survey_id ? String(body.survey_id) : null;
    if (!surveyId) return errorResponse('survey_id required');
    const { data: s } = await ctx.admin.from('surveys').select('id, status')
      .eq('id', surveyId).eq('institution_id', inst).maybeSingle();
    if (!s) return errorResponse('survey not found', 404);
    if (s.status !== 'published') return errorResponse('only published surveys can be closed');
    await ctx.admin.from('surveys').update({ status: 'closed' }).eq('id', surveyId);
    return jsonResponse({ closed: true });
  }

  return errorResponse('unknown action');
});
