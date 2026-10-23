// manage-incident — privileged incident workflow: create incidents from
// confirmed link suggestions or manually, add/remove member complaints,
// change status, record investigation notes, and broadcast updates to
// affected students. Staff only; everything scoped to the caller's
// institution and audited.
import { errorResponse, handleOptions, jsonResponse } from '../_shared/cors.ts';
import { getCallerContext, requireActive } from '../_shared/supabase.ts';
import { notify } from '../_shared/notify.ts';

const INCIDENT_STATUSES = ['suspected', 'confirmed', 'investigating', 'resolved', 'dismissed'];

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
  const action = String(body?.action ?? '');

  const recordComplaintEvent = async (complaintId: string, type: string, note: string | null) => {
    await ctx.admin.from('complaint_events').insert({
      institution_id: inst,
      complaint_id: complaintId,
      actor_id: me.id,
      event_type: type,
      note,
    });
  };

  const loadIncident = async (id: string) => {
    const { data } = await ctx.admin.from('incidents').select('*').eq('id', id).eq('institution_id', inst).maybeSingle();
    return data;
  };

  // ---- create an incident ----
  if (action === 'create') {
    const title = String(body?.title ?? '').trim();
    const complaintIds: string[] = Array.isArray(body?.complaint_ids) ? body.complaint_ids.map(String) : [];
    if (title.length < 3 || title.length > 200) return errorResponse('title must be 3–200 characters');
    if (complaintIds.length === 0) return errorResponse('at least one complaint is required');

    const { data: complaints } = await ctx.admin
      .from('complaints')
      .select('id, category, location, assigned_department_id')
      .eq('institution_id', inst)
      .in('id', complaintIds);
    if ((complaints ?? []).length !== complaintIds.length) return errorResponse('some complaints were not found', 404);

    const { data: incident, error } = await ctx.admin
      .from('incidents')
      .insert({
        institution_id: inst,
        title,
        summary: body?.summary ? String(body.summary).slice(0, 1000) : null,
        category: body?.category ?? complaints![0]!.category,
        location: body?.location ?? complaints![0]!.location,
        department_id: complaints!.find((c) => c.assigned_department_id)?.assigned_department_id ?? null,
        status: 'confirmed',
        created_by: me.id,
        confirmed_by: me.id,
        confirmed_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error || !incident) return errorResponse(error?.message ?? 'create failed', 500);

    for (const c of complaints!) {
      await ctx.admin.from('incident_complaints').insert({
        institution_id: inst,
        incident_id: incident.id,
        complaint_id: c.id,
        added_by: me.id,
        link_source: 'manual',
      });
      await recordComplaintEvent(c.id, 'linked_incident', `Linked to incident "${title}"`);
    }
    // Consume any pending suggestions between members.
    await ctx.admin.from('complaint_links')
      .update({ review_status: 'confirmed', reviewed_by: me.id })
      .eq('institution_id', inst).eq('review_status', 'pending')
      .in('source_complaint_id', complaintIds).in('related_complaint_id', complaintIds);
    return jsonResponse({ incident });
  }

  // ---- all remaining actions need an existing incident ----
  const incidentId = String(body?.incident_id ?? '');
  const incident = await loadIncident(incidentId);
  if (!incident) return errorResponse('incident not found', 404);

  // ---- add/remove member complaints ----
  if (action === 'add_complaint' || action === 'remove_complaint') {
    const complaintId = String(body?.complaint_id ?? '');
    const { data: c } = await ctx.admin.from('complaints').select('id, title').eq('id', complaintId).eq('institution_id', inst).maybeSingle();
    if (!c) return errorResponse('complaint not found', 404);
    if (action === 'add_complaint') {
      const { error } = await ctx.admin.from('incident_complaints').insert({
        institution_id: inst, incident_id: incidentId, complaint_id: complaintId, added_by: me.id, link_source: 'manual',
      });
      if (error && error.code !== '23505') return errorResponse(error.message, 500);
      await recordComplaintEvent(complaintId, 'linked_incident', `Linked to incident "${incident.title}"`);
    } else {
      await ctx.admin.from('incident_complaints').delete().eq('incident_id', incidentId).eq('complaint_id', complaintId);
      await recordComplaintEvent(complaintId, 'unlinked', `Removed from incident "${incident.title}"`);
    }
    return jsonResponse({ status: 'ok' });
  }

  // ---- review a suggested link (pending complaint_links row) ----
  if (action === 'review_suggestion') {
    const linkId = String(body?.link_id ?? '');
    const decision = String(body?.decision ?? '');
    if (!['confirm', 'dismiss', 'defer'].includes(decision)) return errorResponse('invalid decision');
    const { data: link } = await ctx.admin.from('complaint_links').select('*').eq('id', linkId).eq('institution_id', inst).maybeSingle();
    if (!link) return errorResponse('suggestion not found', 404);

    if (decision === 'dismiss' || decision === 'defer') {
      await ctx.admin.from('complaint_links')
        .update({ review_status: decision === 'dismiss' ? 'dismissed' : 'pending', reviewed_by: me.id })
        .eq('id', linkId);
      await recordComplaintEvent(link.source_complaint_id, decision === 'dismiss' ? 'unlinked' : 'deferred',
        `Link suggestion ${decision === 'dismiss' ? 'dismissed' : 'deferred'} by staff`);
      return jsonResponse({ status: 'ok' });
    }

    // confirm → attach both complaints to the chosen incident
    const { error: lerr } = await ctx.admin.from('complaint_links')
      .update({ review_status: 'confirmed', reviewed_by: me.id }).eq('id', linkId);
    if (lerr) return errorResponse(lerr.message, 500);
    for (const cid of [link.source_complaint_id, link.related_complaint_id]) {
      await ctx.admin.from('incident_complaints').upsert({
        institution_id: inst, incident_id: incidentId, complaint_id: cid, added_by: me.id, link_source: 'suggestion',
      }, { onConflict: 'incident_id,complaint_id' });
      await recordComplaintEvent(cid, 'linked_incident', `Confirmed as part of incident "${incident.title}"`);
    }
    return jsonResponse({ status: 'ok' });
  }

  // ---- status change ----
  if (action === 'set_status') {
    const status = String(body?.status ?? '');
    if (!INCIDENT_STATUSES.includes(status)) return errorResponse('invalid status');
    const patch: Record<string, unknown> = { status };
    if (status === 'confirmed' && !incident.confirmed_at) {
      patch.confirmed_by = me.id;
      patch.confirmed_at = new Date().toISOString();
    }
    if (status === 'resolved') patch.resolved_at = new Date().toISOString();
    const { data: updated, error } = await ctx.admin.from('incidents').update(patch).eq('id', incidentId).select().single();
    if (error) return errorResponse(error.message, 500);

    // Notify reporters of member complaints on meaningful changes.
    if (['investigating', 'resolved', 'confirmed'].includes(status)) {
      const { data: members } = await ctx.admin
        .from('incident_complaints')
        .select('complaint_id, complaints!inner(created_by, title, ticket_number)')
        .eq('incident_id', incidentId);
      for (const m of members ?? []) {
        const comp = m.complaints as unknown as { created_by: string; title: string; ticket_number: string };
        await notify(ctx.admin, {
          institutionId: inst,
          recipientId: comp.created_by,
          complaintId: m.complaint_id,
          type: 'incident_update',
          title: `Update on an issue affecting your report`,
          message: `"${incident.title}" is now ${status === 'investigating' ? 'under investigation' : status}. Your ticket ${comp.ticket_number} is linked to it.`,
          emailPath: `/student/tickets/${m.complaint_id}`,
          dedupKey: `incident:${incidentId}:${status}:${m.complaint_id}`,
        });
      }
    }
    return jsonResponse({ incident: updated });
  }

  // ---- investigation notes / hypotheses ----
  if (action === 'add_note') {
    const noteType = String(body?.note_type ?? 'note');
    const content = String(body?.content ?? '').trim();
    if (!['note', 'hypothesis', 'step', 'outcome'].includes(noteType)) return errorResponse('invalid note type');
    if (content.length < 3 || content.length > 2000) return errorResponse('content must be 3–2000 characters');
    const { data: note, error } = await ctx.admin.from('incident_notes').insert({
      institution_id: inst, incident_id: incidentId, author_id: me.id, note_type: noteType, content,
    }).select().single();
    if (error) return errorResponse(error.message, 500);
    return jsonResponse({ note });
  }

  if (action === 'review_note') {
    const noteId = String(body?.note_id ?? '');
    const state = String(body?.state ?? '');
    if (!['confirmed', 'rejected', null, ''].includes(state)) return errorResponse('invalid state');
    const { data: note, error } = await ctx.admin.from('incident_notes')
      .update({ review_state: state || null, reviewed_by: me.id })
      .eq('id', noteId).eq('incident_id', incidentId).select().single();
    if (error) return errorResponse(error.message, 500);
    return jsonResponse({ note });
  }

  // ---- broadcast to affected students ----
  if (action === 'broadcast') {
    const message = String(body?.message ?? '').trim();
    if (message.length < 10 || message.length > 2000) return errorResponse('message must be 10–2000 characters');

    const { data: members } = await ctx.admin
      .from('incident_complaints')
      .select('complaint_id, complaints!inner(created_by, ticket_number)')
      .eq('incident_id', incidentId);
    const recipients = [...new Set((members ?? []).map((m) => (m.complaints as unknown as { created_by: string }).created_by))];
    if (recipients.length === 0) return errorResponse('no affected students to notify');

    const { data: broadcast, error } = await ctx.admin.from('incident_broadcasts').insert({
      institution_id: inst, incident_id: incidentId, sent_by: me.id, message, recipient_count: recipients.length,
    }).select().single();
    if (error || !broadcast) return errorResponse(error?.message ?? 'broadcast failed', 500);

    // Each recipient gets one notification (deduped by broadcast id) + email.
    for (const rid of recipients) {
      const complaint = (members ?? []).find((m) => (m.complaints as unknown as { created_by: string }).created_by === rid);
      await notify(ctx.admin, {
        institutionId: inst,
        recipientId: rid,
        complaintId: complaint?.complaint_id ?? null,
        type: 'incident_broadcast',
        title: `Campus update: ${incident.title}`,
        message,
        emailSubject: `Campflow update — ${incident.title}`,
        emailPath: complaint?.complaint_id ? `/student/tickets/${complaint.complaint_id}` : '/student',
        dedupKey: `broadcast:${broadcast.id}:${rid}`,
      });
    }
    return jsonResponse({ broadcast });
  }

  // ---- suggested links for this incident's members (read helper) ----
  if (action === 'preview_recipients') {
    const { data: members } = await ctx.admin
      .from('incident_complaints')
      .select('complaints!inner(created_by)')
      .eq('incident_id', incidentId);
    const count = new Set((members ?? []).map((m) => (m.complaints as unknown as { created_by: string }).created_by)).size;
    return jsonResponse({ recipient_count: count });
  }

  return errorResponse('unknown action');
});
