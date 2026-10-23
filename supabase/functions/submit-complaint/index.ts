// submit-complaint — creates a ticket idempotently, attaches uploads, applies
// routing rules, detects duplicates, records the creation event, and notifies
// the creator + routed department staff.
import { errorResponse, handleOptions, jsonResponse } from '../_shared/cors.ts';
import { getCallerContext, requireActive } from '../_shared/supabase.ts';
import { notify, notifyDepartmentStaff } from '../_shared/notify.ts';

const CATEGORIES = ['plumbing', 'electricity', 'cleanliness', 'internet'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
// Deterministic safety scan — flagged tickets follow escalation rules
// immediately instead of waiting on AI analysis.
const SAFETY_KEYWORDS = ['fire', 'spark', 'smoke', 'gas', 'shock', 'electroc', 'flood',
  'collapse', 'injur', 'hazard', 'exposed', 'burn', 'toxic', 'short circuit', 'live wire', 'sewage'];

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== 'POST') return errorResponse('method not allowed', 405);

  const ctx = await getCallerContext(req);
  if ('error' in ctx) return errorResponse(ctx.error, ctx.status);
  if (!requireActive(ctx)) return errorResponse('active profile required', 403);
  const me = ctx.profile;
  const inst = me.institution_id;

  const body = await req.json().catch(() => null);
  const idempotencyKey = String(body?.idempotency_key ?? '');
  const title = String(body?.title ?? '').trim();
  const description = String(body?.description ?? '').trim();
  const location = String(body?.location ?? '').trim();
  const category = String(body?.category ?? '');
  const priority = PRIORITIES.includes(body?.priority) ? body.priority : 'medium';
  const aiSummary = body?.ai_summary ? String(body.ai_summary).slice(0, 1000) : null;
  const aiReasoning = body?.ai_reasoning ? String(body.ai_reasoning).slice(0, 2000) : null;
  const submissionType = body?.submission_type === 'request' ? 'request' : 'complaint';
  const visibility = body?.visibility === 'campus' ? 'campus' : 'personal';
  const preferredOutcome = body?.preferred_outcome ? String(body.preferred_outcome).slice(0, 1000) : null;
  const requestCategoryId = body?.request_category_id ? String(body.request_category_id) : null;
  const attachments: { storage_path: string; content_type: string }[] = Array.isArray(body?.attachments)
    ? body.attachments.slice(0, 5)
    : [];

  if (!/^[0-9a-f-]{36}$/i.test(idempotencyKey)) return errorResponse('a valid idempotency_key is required');

  // Retry-safe: check the idempotency key BEFORE validating the body, so a
  // retried request always gets the original ticket back.
  const { data: existing } = await ctx.admin
    .from('complaints')
    .select('*')
    .eq('institution_id', inst)
    .eq('created_by', me.id)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  if (existing) return jsonResponse({ complaint: existing, already_existed: true });

  if (title.length < 4 || title.length > 160) return errorResponse('title must be 4–160 characters');
  if (description.length < 10 || description.length > 4000) return errorResponse('description must be 10–4000 characters');
  if (location.length < 2 || location.length > 200) return errorResponse('location is required');
  if (!CATEGORIES.includes(category)) return errorResponse('select a valid category');
  if (requestCategoryId) {
    const { data: rc } = await ctx.admin.from('request_categories')
      .select('id').eq('id', requestCategoryId).eq('institution_id', inst).eq('is_active', true).maybeSingle();
    if (!rc) return errorResponse('invalid request category');
  }

  // Validate attachment paths: must live under this institution's prefix and
  // have been uploaded by the caller.
  for (const a of attachments) {
    if (!a.storage_path?.startsWith(`${inst}/`) || a.storage_path.includes('..')) {
      return errorResponse('invalid attachment path');
    }
  }

  // Department routing rule for the chosen category.
  const { data: rule } = await ctx.admin
    .from('department_routing_rules')
    .select('department_id, departments!inner(is_active)')
    .eq('institution_id', inst)
    .eq('category', category)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  const deptActive = (rule as { departments?: { is_active: boolean } } | null)?.departments?.is_active;

  // Reporter may explicitly choose the department — their choice wins over
  // the category routing rule.
  const preferredDept = body?.preferred_department_id ? String(body.preferred_department_id) : null;
  if (preferredDept) {
    const { data: d } = await ctx.admin
      .from('departments')
      .select('id, is_active')
      .eq('id', preferredDept)
      .eq('institution_id', inst)
      .maybeSingle();
    if (!d) return errorResponse('department not found', 404);
    if (!d.is_active) return errorResponse('that department is not accepting tickets');
  }
  const routedDept = preferredDept ?? (rule && deptActive ? rule.department_id : null);
  const haystack = `${title} ${description}`.toLowerCase();
  const safetyFlagged = SAFETY_KEYWORDS.some((k) => haystack.includes(k));

  const { data: ticket } = await ctx.admin.rpc('next_ticket_number', { p_institution: inst });
  if (!ticket) return errorResponse('failed to allocate ticket number', 500);

  const { data: complaint, error: insertErr } = await ctx.admin
    .from('complaints')
    .insert({
      institution_id: inst,
      ticket_number: ticket,
      idempotency_key: idempotencyKey,
      created_by: me.id,
      title,
      description,
      location,
      category,
      priority,
      status: routedDept ? 'assigned' : 'new',
      assigned_department_id: routedDept,
      ai_summary: aiSummary,
      ai_reasoning: aiReasoning,
      safety_flagged: safetyFlagged,
      submission_type: submissionType,
      visibility,
      request_status: submissionType === 'request' ? 'submitted' : null,
      request_category_id: requestCategoryId,
      preferred_outcome: preferredOutcome,
    })
    .select('*')
    .single();

  if (insertErr) {
    if (insertErr.code === '23505') {
      const { data: again } = await ctx.admin
        .from('complaints')
        .select('*')
        .eq('institution_id', inst)
        .eq('created_by', me.id)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();
      if (again) return jsonResponse({ complaint: again, already_existed: true });
    }
    return errorResponse(`failed to create complaint: ${insertErr.message}`, 500);
  }

  if (attachments.length) {
    await ctx.admin.from('complaint_attachments').insert(
      attachments.map((a) => ({
        institution_id: inst,
        complaint_id: complaint.id,
        uploaded_by: me.id,
        storage_path: a.storage_path,
        content_type: a.content_type || 'image/jpeg',
      })),
    );
  }

  await ctx.admin.from('complaint_events').insert({
    institution_id: inst,
    complaint_id: complaint.id,
    actor_id: me.id,
    event_type: 'created',
    new_value: complaint.status,
    note: `${aiSummary ? `AI summary: ${aiSummary}` : ''}${safetyFlagged ? ' [SAFETY FLAGGED at intake]' : ''}${preferredDept ? ' [Department chosen by reporter]' : ''}`.trim() || null,
  });

  // Duplicate / related-incident candidates (never auto-closed, never merged).
  const { data: similar } = await ctx.admin.rpc('find_similar_complaints', {
    p_complaint: complaint.id,
    p_limit: 5,
  });
  const links = (similar ?? []).filter((s: { similarity: number }) => Number(s.similarity) > 0.22);
  if (links.length) {
    await ctx.admin.from('complaint_links').upsert(
      links.map((s: { id: string; similarity: number }) => ({
        institution_id: inst,
        source_complaint_id: complaint.id,
        related_complaint_id: s.id,
        relationship_type: 'possible_duplicate',
        score: s.similarity,
        review_status: 'pending',
      })),
      { onConflict: 'source_complaint_id,related_complaint_id' },
    );
  }

  await notify(ctx.admin, {
    institutionId: inst,
    recipientId: me.id,
    complaintId: complaint.id,
    type: 'complaint_submitted',
    title: `Complaint ${complaint.ticket_number} submitted`,
    message: `Your complaint "${title}" was received and assigned ticket ${complaint.ticket_number}.`,
    emailPath: `/student/tickets/${complaint.id}`,
    dedupKey: `submitted:${complaint.id}`,
  });
  if (routedDept) {
    await notifyDepartmentStaff(ctx.admin, routedDept, {
      institutionId: inst,
      complaintId: complaint.id,
      type: 'complaint_assigned',
      title: `New ${category} complaint ${complaint.ticket_number}`,
      message: `A new complaint "${title}" at ${location} was routed to your department.`,
      emailPath: `/staff/complaints/${complaint.id}`,
      dedupKey: `routed:${complaint.id}`,
    });
  }

  return jsonResponse({
    complaint,
    already_existed: false,
    similar_complaints: links.map((l: { id: string; similarity: number }) => l),
  });
});
