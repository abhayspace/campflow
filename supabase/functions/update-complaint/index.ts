// update-complaint — the single authorized path for complaint mutations:
// status transitions, assignment, notes, resolution, reopen/confirm, and
// duplicate-link review. Every change writes a complaint_events row and
// notifies the affected users.
import { errorResponse, handleOptions, jsonResponse } from '../_shared/cors.ts';
import { getCallerContext, requireActive } from '../_shared/supabase.ts';
import { notify } from '../_shared/notify.ts';

const TRANSITIONS: Record<string, string[]> = {
  new: ['assigned', 'in_progress', 'closed'],
  assigned: ['in_progress', 'resolved', 'new', 'closed'],
  in_progress: ['resolved', 'assigned'],
  resolved: ['closed', 'reopened'],
  reopened: ['assigned', 'in_progress', 'resolved', 'closed'],
  closed: ['reopened'],
};

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== 'POST') return errorResponse('method not allowed', 405);

  const ctx = await getCallerContext(req);
  if ('error' in ctx) return errorResponse(ctx.error, ctx.status);
  if (!requireActive(ctx)) return errorResponse('active profile required', 403);
  const me = ctx.profile;
  const inst = me.institution_id;
  const isAdmin = me.role === 'admin';

  const body = await req.json().catch(() => null);
  const action = String(body?.action ?? '');
  const complaintId = String(body?.complaint_id ?? '');

  const { data: c } = await ctx.admin
    .from('complaints')
    .select('*')
    .eq('id', complaintId)
    .eq('institution_id', inst)
    .maybeSingle();
  if (!c) return errorResponse('complaint not found', 404);

  const isCreator = c.created_by === me.id;
  const isAssignee = c.assigned_to === me.id;
  const { data: deptMembership } = c.assigned_department_id
    ? await ctx.admin
        .from('department_members')
        .select('membership_type')
        .eq('department_id', c.assigned_department_id)
        .eq('profile_id', me.id)
        .in('membership_type', ['head', 'teacher'])
        .maybeSingle()
    : { data: null };
  const isDeptStaff = !!deptMembership;
  const { data: dept } = c.assigned_department_id
    ? await ctx.admin.from('departments').select('department_head_id').eq('id', c.assigned_department_id).single()
    : { data: null };
  const isHead = dept?.department_head_id === me.id;
  const isStaff = isAdmin || isAssignee || isDeptStaff;

  const recordEvent = async (
    eventType: string,
    previous: string | null,
    next: string | null,
    note: string | null = null,
    isInternal = false,
  ) => {
    await ctx.admin.from('complaint_events').insert({
      institution_id: inst,
      complaint_id: c.id,
      actor_id: me.id,
      event_type: eventType,
      previous_value: previous,
      new_value: next,
      note,
      is_internal: isInternal,
    });
  };

  // ---- duplicate-link review (staff only) ----
  if (action === 'review_link') {
    if (!isStaff) return errorResponse('staff only', 403);
    const linkId = String(body?.link_id ?? '');
    const review = String(body?.review ?? '');
    if (!['confirmed', 'dismissed'].includes(review)) return errorResponse('invalid review');
    const { data: link, error } = await ctx.admin
      .from('complaint_links')
      .update({ review_status: review, reviewed_by: me.id })
      .eq('id', linkId)
      .eq('institution_id', inst)
      .select()
      .single();
    if (error || !link) return errorResponse('link not found', 404);
    await recordEvent(review === 'confirmed' ? 'linked' : 'unlinked', 'pending', review, `Ticket link ${review}`);
    return jsonResponse({ link });
  }

  // ---- priority override (staff only, reason required) ----
  if (action === 'set_priority') {
    if (!isStaff) return errorResponse('staff only', 403);
    const next = String(body?.priority ?? '');
    if (!['low', 'medium', 'high', 'urgent'].includes(next)) return errorResponse('invalid priority');
    const reason = String(body?.reason ?? '').trim();
    if (reason.length < 5) return errorResponse('a reason is required for priority changes');
    if (next === c.priority) return errorResponse('priority is already ' + next);
    const { data: updated, error } = await ctx.admin
      .from('complaints')
      .update({ priority: next })
      .eq('id', c.id)
      .select()
      .single();
    if (error) return errorResponse(error.message, 500);
    await recordEvent('priority_changed', c.priority, next, `Override reason: ${reason}`, true);
    return jsonResponse({ complaint: updated });
  }

  // ---- note ----
  if (action === 'add_note') {
    const note = String(body?.note ?? '').trim();
    const internal = body?.is_internal === true;
    if (note.length < 2 || note.length > 2000) return errorResponse('note must be 2–2000 characters');
    if (internal && !isStaff) return errorResponse('internal notes are staff-only', 403);
    if (!isStaff && !isCreator) return errorResponse('not authorized', 403);
    await recordEvent('note', null, null, note, internal);
    if (!internal && !isCreator) {
      await notify(ctx.admin, {
        institutionId: inst,
        recipientId: c.created_by,
        complaintId: c.id,
        type: 'staff_note',
        title: `Update on ${c.ticket_number}`,
        message: `Staff added a note to your complaint "${c.title}".`,
        emailPath: `/student/tickets/${c.id}`,
      });
    }
    return jsonResponse({ status: 'ok' });
  }

  // ---- assignment (admin or department head) ----
  if (action === 'assign') {
    const assignee = body?.assigned_to ? String(body.assigned_to) : null;
    const deptId = body?.department_id !== undefined ? (body.department_id ? String(body.department_id) : null) : c.assigned_department_id;
    if (!isAdmin && !isHead) {
      return errorResponse('only admins or department heads can assign', 403);
    }
    if (deptId) {
      const { data: d } = await ctx.admin
        .from('departments')
        .select('id, is_active')
        .eq('id', deptId)
        .eq('institution_id', inst)
        .single();
      if (!d) return errorResponse('department not found', 404);
      if (!d.is_active) return errorResponse('cannot assign to an inactive department');
    }
    if (assignee) {
      const { data: p } = await ctx.admin
        .from('profiles')
        .select('id, role, account_status')
        .eq('id', assignee)
        .eq('institution_id', inst)
        .single();
      if (!p || p.role !== 'teacher') return errorResponse('assignee must be a staff member');
      if (p.account_status !== 'active') return errorResponse('cannot assign to an inactive account');
      if (deptId && !isAdmin) {
        const { data: m } = await ctx.admin
          .from('department_members')
          .select('id')
          .eq('department_id', deptId)
          .eq('profile_id', assignee)
          .in('membership_type', ['head', 'teacher'])
          .maybeSingle();
        if (!m) return errorResponse('assignee is not a staff member of that department');
      }
    }

    const patch: Record<string, unknown> = {
      assigned_to: assignee,
      assigned_department_id: deptId,
    };
    if ((assignee || deptId) && c.status === 'new') patch.status = 'assigned';
    if ((assignee || deptId) && !c.first_response_at) patch.first_response_at = new Date().toISOString();
    const { data: updated, error } = await ctx.admin
      .from('complaints')
      .update(patch)
      .eq('id', c.id)
      .select()
      .single();
    if (error) return errorResponse(error.message, 500);

    if (deptId !== c.assigned_department_id) {
      await recordEvent('department_assigned', c.assigned_department_id, deptId);
    }
    if (assignee !== c.assigned_to) {
      await recordEvent('assigned', c.assigned_to, assignee);
      if (assignee) {
        await notify(ctx.admin, {
          institutionId: inst,
          recipientId: assignee,
          complaintId: c.id,
          type: 'assigned_to_you',
          title: `Complaint ${c.ticket_number} assigned to you`,
          message: `You were assigned "${c.title}" at ${c.location}.`,
          emailPath: `/staff/complaints/${c.id}`,
        });
      }
    }
    return jsonResponse({ complaint: updated });
  }

  // ---- status transitions ----
  if (action === 'set_status' || action === 'confirm_resolved' || action === 'request_reopen') {
    let next = String(body?.status ?? '');
    let resolutionNotes = body?.resolution_notes ? String(body.resolution_notes).slice(0, 2000) : null;

    if (action === 'confirm_resolved') {
      if (!isCreator) return errorResponse('only the reporter can confirm resolution', 403);
      next = 'closed';
    }
    // Affected students may also reopen campus-wide submissions (institution
    // policy): must have an active "this affects me" vote on it.
    let isAffectedVoter = false;
    if (action === 'request_reopen' && !isCreator && !isStaff) {
      const { data: v } = await ctx.admin
        .from('community_votes')
        .select('id')
        .eq('complaint_id', c.id)
        .eq('voter_id', me.id)
        .eq('vote_type', 'affected')
        .maybeSingle();
      if (!v || c.visibility !== 'campus') return errorResponse('not authorized', 403);
      isAffectedVoter = true;
      next = 'reopened';
    } else if (action === 'request_reopen') {
      if (!isCreator && !isStaff) return errorResponse('not authorized', 403);
      next = 'reopened';
    }

    if (!TRANSITIONS[c.status]?.includes(next)) {
      return errorResponse(`cannot move from ${c.status} to ${next}`);
    }

    // Who may perform which transition.
    if (next === 'closed' && c.status === 'resolved' && isCreator) {
      // student confirmation — allowed
    } else if (next === 'reopened' && (isCreator || isStaff || isAffectedVoter)) {
      // reopen — allowed
    } else if (!isStaff) {
      return errorResponse('staff only', 403);
    }
    if (next === 'resolved' && !isStaff) return errorResponse('staff only', 403);

    const patch: Record<string, unknown> = { status: next };
    if (next === 'resolved') {
      patch.resolved_at = new Date().toISOString();
      patch.verification = 'awaiting_verification';
      if (resolutionNotes) patch.resolution_notes = resolutionNotes;

      // Optional proof-of-resolution photo — validated like submission uploads.
      const photo = body?.resolution_photo;
      if (photo?.storage_path && typeof photo.storage_path === 'string') {
        if (!photo.storage_path.startsWith(`${inst}/`) || photo.storage_path.includes('..')) {
          return errorResponse('invalid attachment path');
        }
        const { data: att } = await ctx.admin.from('complaint_attachments').insert({
          institution_id: inst,
          complaint_id: c.id,
          uploaded_by: me.id,
          storage_path: photo.storage_path,
          content_type: photo.content_type || 'image/jpeg',
        }).select('id').single();
        if (att) patch.resolution_attachment_id = att.id;
      }
    }
    if (next === 'closed' && c.status === 'resolved') patch.verification = 'confirmed';
    if (next === 'reopened') {
      patch.resolved_at = null;
      patch.verification = 'reopen_requested';
      patch.reopen_count = (c.reopen_count ?? 0) + 1;
    }
    // First staff touch on an unresolved ticket = first response (SLA clock).
    if (['assigned', 'in_progress'].includes(next) && !c.first_response_at) {
      patch.first_response_at = new Date().toISOString();
    }

    const { data: updated, error } = await ctx.admin
      .from('complaints')
      .update(patch)
      .eq('id', c.id)
      .select()
      .single();
    if (error) return errorResponse(error.message, 500);

    const eventType =
      next === 'resolved' ? 'resolved' : next === 'reopened' ? 'reopened' : next === 'closed' ? 'closed' : 'status_changed';
    await recordEvent(eventType, c.status, next, resolutionNotes);

    // Notify the reporter about meaningful changes (don't echo their own action).
    if (!isCreator || next === 'resolved') {
      const label = next === 'closed' ? 'confirmed resolved' : next;
      await notify(ctx.admin, {
        institutionId: inst,
        recipientId: c.created_by,
        complaintId: c.id,
        type: 'status_changed',
        title: `${c.ticket_number} is now ${label}`,
        message: `Your complaint "${c.title}" moved to status: ${label}.`,
        emailPath: `/student/tickets/${c.id}`,
        dedupKey: `status:${c.id}:${next}`,
      });
    }
    // Reporter-driven confirm/reopen → let the assignee know.
    if ((isCreator || isAffectedVoter) && (next === 'closed' || next === 'reopened') && c.assigned_to) {
      await notify(ctx.admin, {
        institutionId: inst,
        recipientId: c.assigned_to,
        complaintId: c.id,
        type: next === 'closed' ? 'confirmed_resolved' : 'reopen_requested',
        title: `${c.ticket_number} ${next === 'closed' ? 'confirmed resolved' : 'reopen requested'}`,
        message: `The reporter ${next === 'closed' ? 'confirmed the fix' : 'says the issue persists'} on "${c.title}".`,
        emailPath: `/staff/complaints/${c.id}`,
        dedupKey: `reporter:${c.id}:${next}`,
      });
    }

    // Followers of a campus-wide submission get status updates.
    if (c.visibility === 'campus') {
      const { data: followers } = await ctx.admin
        .from('submission_follows')
        .select('follower_id')
        .eq('complaint_id', c.id);
      for (const f of followers ?? []) {
        if (f.follower_id === c.created_by || f.follower_id === me.id) continue;
        await notify(ctx.admin, {
          institutionId: inst,
          recipientId: f.follower_id,
          complaintId: c.id,
          type: 'followed_update',
          title: `Update on an issue you follow`,
          message: `"${c.title}" moved to status: ${next === 'closed' ? 'confirmed resolved' : next}.`,
          emailPath: '/community',
          dedupKey: `followed:${c.id}:${next}:${f.follower_id}`,
        });
      }
    }
    return jsonResponse({ complaint: updated });
  }

  // ---- staff solution decisions ----
  if (action === 'decide_solution') {
    if (!isStaff) return errorResponse('staff only', 403);
    const solutionId = String(body?.solution_id ?? '');
    const decision = String(body?.decision ?? '');
    if (!['accepted', 'rejected'].includes(decision)) return errorResponse('invalid decision');
    const why = String(body?.reason ?? '').trim();
    if (decision === 'accepted' && why.length < 5) return errorResponse('record why this solution was chosen');
    const { data: sol, error } = await ctx.admin
      .from('solutions')
      .update({ status: decision, decided_by: me.id, decided_reason: why || null, updated_at: new Date().toISOString() })
      .eq('id', solutionId)
      .eq('institution_id', inst)
      .eq('complaint_id', c.id)
      .select()
      .single();
    if (error || !sol) return errorResponse('solution not found', 404);
    await recordEvent('solution_chosen', sol.status, decision, why || null);
    return jsonResponse({ solution: sol });
  }

  if (action === 'add_solution') {
    if (!isStaff) return errorResponse('staff only', 403);
    const text = String(body?.solution ?? '').trim();
    if (text.length < 5 || text.length > 1000) return errorResponse('solution must be 5–1000 characters');
    const { data: sol } = await ctx.admin
      .from('solutions')
      .insert({
        institution_id: inst, complaint_id: c.id, source: 'staff',
        content: text, status: 'suggested', created_by: me.id,
      })
      .select()
      .single();
    return jsonResponse({ solution: sol });
  }

  // ---- request more information from the reporter ----
  if (action === 'request_info') {
    if (!isStaff) return errorResponse('staff only', 403);
    const question = String(body?.question ?? '').trim();
    if (question.length < 5) return errorResponse('question is required');
    await recordEvent('info_requested', null, null, question);
    await notify(ctx.admin, {
      institutionId: inst,
      recipientId: c.created_by,
      complaintId: c.id,
      type: 'info_requested',
      title: `More details needed for ${c.ticket_number}`,
      message: `Staff asked: "${question}"`,
      emailPath: `/student/tickets/${c.id}`,
    });
    return jsonResponse({ status: 'ok' });
  }

  return errorResponse('unknown action');
});
