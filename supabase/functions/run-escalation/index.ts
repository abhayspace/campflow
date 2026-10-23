// run-escalation — evaluates the institution's SLA rules against open
// complaints. Marks overdue tickets, records escalation events, bumps
// escalation_level, and notifies department heads + admins.
// Idempotent: escalation_events has (complaint_id, level, reason) unique.
// Safe to call from dashboards, cron, or pg_cron via the service role.
import { errorResponse, handleOptions, jsonResponse } from '../_shared/cors.ts';
import { getCallerContext, requireActive } from '../_shared/supabase.ts';
import { notify, notifyDepartmentStaff } from '../_shared/notify.ts';

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
  const isAdmin = me.role === 'admin';
  const now = Date.now();

  const { data: rules } = await ctx.admin
    .from('sla_rules')
    .select('*')
    .eq('institution_id', inst)
    .eq('is_active', true);
  if (!rules || rules.length === 0) return jsonResponse({ evaluated: 0, escalated: 0, message: 'no active SLA rules' });

  const { data: open } = await ctx.admin
    .from('complaints')
    .select('id, ticket_number, title, category, priority, status, created_by, assigned_to, assigned_department_id, created_at, first_response_at, escalation_level, due_at, safety_flagged')
    .eq('institution_id', inst)
    .not('status', 'in', '(resolved,closed)');

  let evaluated = 0;
  let escalated = 0;

  const ruleFor = (c: { category: string; priority: string }) =>
    rules
      .filter((r) => (!r.category || r.category === c.category) && (!r.priority || r.priority === c.priority))
      .sort((a, b) => (b.priority ? 1 : 0) + (b.category ? 1 : 0) - ((a.priority ? 1 : 0) + (a.category ? 1 : 0)))[0];

  for (const c of open ?? []) {
    const rule = ruleFor(c);
    if (!rule) continue;
    evaluated++;
    const ageH = (now - new Date(c.created_at).getTime()) / 3_600_000;
    const safety = c.safety_flagged || c.priority === 'urgent';
    // Safety-critical tickets escalate at half the configured threshold.
    const responseLimit = safety ? Math.min(rule.response_hours, 4) : rule.response_hours;
    const resolveLimit = safety ? Math.min(rule.resolve_hours, 24) : rule.resolve_hours;

    const dueAt = new Date(new Date(c.created_at).getTime() + resolveLimit * 3_600_000).toISOString();
    if (c.due_at !== dueAt) {
      await ctx.admin.from('complaints').update({ due_at: dueAt }).eq('id', c.id);
    }

    const responseOverdue = !c.first_response_at && ageH > responseLimit;
    const resolveOverdue = ageH > resolveLimit;
    const nextEscalationDue = c.escalation_level > 0 && resolveOverdue
      && ageH > resolveLimit + c.escalation_level * rule.escalate_after_hours;

    const reason = responseOverdue ? 'response_overdue' : resolveOverdue ? 'resolution_overdue' : null;
    if (!reason && !nextEscalationDue) continue;

    const level = c.escalation_level + 1;
    const why = nextEscalationDue ? 'repeat_escalation' : reason!;

    // Unique constraint makes this idempotent under concurrent runs.
    const { error: evErr } = await ctx.admin.from('escalation_events').insert({
      institution_id: inst,
      complaint_id: c.id,
      rule_id: rule.id,
      level,
      reason: `${why}:l${level}`,
      actor_id: null,
    });
    if (evErr) continue; // already escalated at this level

    await ctx.admin.from('complaints').update({ escalation_level: level }).eq('id', c.id);
    await ctx.admin.from('complaint_events').insert({
      institution_id: inst,
      complaint_id: c.id,
      actor_id: null,
      event_type: 'escalated',
      previous_value: String(c.escalation_level),
      new_value: String(level),
      note: why === 'response_overdue'
        ? `No staff response within ${responseLimit}h (SLA rule breached)`
        : `Unresolved beyond ${resolveLimit}h target (escalation level ${level})`,
    });

    const msg = why === 'response_overdue'
      ? `Ticket ${c.ticket_number} has had no staff response within ${responseLimit}h.`
      : `Ticket ${c.ticket_number} is unresolved past its ${resolveLimit}h target.`;

    // Notify department staff + every admin.
    if (c.assigned_department_id) {
      await notifyDepartmentStaff(ctx.admin, c.assigned_department_id, {
        institutionId: inst,
        complaintId: c.id,
        type: 'escalation',
        title: `Escalated (level ${level}): ${c.ticket_number}`,
        message: `${msg} "${c.title}" needs attention.`,
        emailPath: `/staff/complaints/${c.id}`,
        dedupKey: `esc:${c.id}:${level}:dept`,
      });
    }
    const { data: admins } = await ctx.admin
      .from('profiles')
      .select('id')
      .eq('institution_id', inst)
      .eq('role', 'admin')
      .eq('account_status', 'active');
    for (const a of admins ?? []) {
      await notify(ctx.admin, {
        institutionId: inst,
        recipientId: a.id,
        complaintId: c.id,
        type: 'escalation',
        title: `Escalated (level ${level}): ${c.ticket_number}`,
        message: msg,
        emailPath: `/staff/complaints/${c.id}`,
        dedupKey: `esc:${c.id}:${level}:${a.id}`,
      });
    }
    escalated++;
  }

  return jsonResponse({ evaluated, escalated, by: isAdmin ? 'admin' : 'staff' });
});
