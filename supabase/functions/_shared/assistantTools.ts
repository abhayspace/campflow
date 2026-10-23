import { validateDraft, type SubmissionDraft } from './draft.ts';

type Row = Record<string, unknown>;

export interface AssistantUser {
  id: string;
  institution_id: string;
  full_name: string;
  role: 'admin' | 'teacher' | 'student';
}

export interface ToolContext {
  admin: {
    from: (table: string) => any;
  };
  me: AssistantUser;
  deptIds: string[];
  headDeptIds: string[];
  institutionName: string;
}

const OPEN = ['new', 'assigned', 'in_progress', 'reopened'];

function clip(value: unknown, max = 280) {
  const text = value == null ? '' : String(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function hrefFor(me: AssistantUser, row: Row) {
  const id = String(row.id);
  if (row.created_by === me.id && me.role === 'student') return `/student/tickets/${id}`;
  if (me.role === 'student') return `/community/${id}`;
  return `/staff/complaints/${id}`;
}

function publicTicket(me: AssistantUser, row: Row, detailed: boolean) {
  const base = {
    ticket_number: row.ticket_number,
    title: row.title,
    status: row.status,
    request_status: row.request_status ?? null,
    location: row.location,
    category: row.category,
    priority: row.priority,
    submission_type: row.submission_type ?? 'complaint',
    visibility: row.visibility ?? 'personal',
    created_at: row.created_at,
    href: hrefFor(me, row),
    source: 'verified_database_record',
  };
  if (!detailed) return base;
  return {
    ...base,
    description: clip(row.description, 500),
    resolution_notes: row.resolution_notes ? clip(row.resolution_notes, 400) : null,
    due_at: row.due_at ?? null,
  };
}

function canSeeDetail(ctx: ToolContext, row: Row) {
  if (ctx.me.role === 'admin') return true;
  if (row.created_by === ctx.me.id) return true;
  if (ctx.me.role === 'teacher') {
    if (row.assigned_to === ctx.me.id) return true;
    if (row.assigned_department_id && ctx.deptIds.includes(String(row.assigned_department_id))) return true;
  }
  return false;
}

function canSeeAtAll(ctx: ToolContext, row: Row) {
  if (canSeeDetail(ctx, row)) return true;
  return row.visibility === 'campus' && row.moderated !== true;
}

export async function listMyComplaints(ctx: ToolContext) {
  const { data, error } = await ctx.admin
    .from('complaints')
    .select('id, ticket_number, title, description, location, category, priority, status, submission_type, visibility, request_status, created_by, resolution_notes, due_at, created_at')
    .eq('institution_id', ctx.me.institution_id)
    .eq('created_by', ctx.me.id)
    .order('created_at', { ascending: false })
    .limit(12);
  if (error) return { error: 'Could not read your complaints.' };
  const rows = (data ?? []) as Row[];
  return {
    verified: true,
    count: rows.length,
    complaints: rows.map((row) => publicTicket(ctx.me, row, true)),
  };
}

export async function listMyNotifications(ctx: ToolContext) {
  const { data, error } = await ctx.admin
    .from('notifications')
    .select('title, message, read_at, created_at')
    .eq('recipient_id', ctx.me.id)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) return { error: 'Could not read your notifications.' };
  return {
    verified: true,
    notifications: ((data ?? []) as Row[]).map((row) => ({
      title: clip(row.title, 120),
      message: clip(row.message, 180),
      read: Boolean(row.read_at),
      created_at: row.created_at,
    })),
  };
}

export async function lookupTicket(ctx: ToolContext, ticketNumber: string) {
  const ref = ticketNumber.trim();
  if (ref.length < 3) return { error: 'Provide a ticket reference such as CC-12345.' };
  const { data, error } = await ctx.admin
    .from('complaints')
    .select('id, ticket_number, title, description, location, category, priority, status, submission_type, visibility, request_status, created_by, assigned_to, assigned_department_id, resolution_notes, due_at, moderated, created_at')
    .eq('institution_id', ctx.me.institution_id)
    .ilike('ticket_number', ref)
    .maybeSingle();
  if (error) return { error: 'Could not look up that ticket.' };
  if (!data) return { error: 'No ticket with that reference was found in your institution.' };
  const row = data as Row;
  if (!canSeeAtAll(ctx, row)) return { error: 'That ticket is not available to your account.' };
  const detailed = canSeeDetail(ctx, row);
  const ticket = publicTicket(ctx.me, row, detailed);
  let events: { event_type: unknown; note: string; created_at: unknown }[] = [];
  if (detailed) {
    let query = ctx.admin
      .from('complaint_events')
      .select('event_type, note, created_at, is_internal')
      .eq('complaint_id', row.id)
      .order('created_at', { ascending: false })
      .limit(8);
    if (ctx.me.role === 'student') query = query.eq('is_internal', false);
    const { data: history } = await query;
    events = ((history ?? []) as Row[])
      .filter((event) => ctx.me.role !== 'student' || event.is_internal !== true)
      .map((event) => ({
        event_type: event.event_type,
        note: clip(event.note, 180),
        created_at: event.created_at,
      }));
  }
  return {
    verified: true,
    ticket,
    recent_events: events,
    note: detailed
      ? 'Verified record. Do not add facts that are not in this result. Internal notes are omitted for students.'
      : 'This is a campus-visible summary. Private details are hidden.',
  };
}

export async function listCampusIssues(ctx: ToolContext) {
  const { data, error } = await ctx.admin
    .from('complaints')
    .select('id, ticket_number, title, location, category, status, submission_type, request_status, visibility, created_by, moderated, created_at')
    .eq('institution_id', ctx.me.institution_id)
    .eq('visibility', 'campus')
    .eq('moderated', false)
    .order('created_at', { ascending: false })
    .limit(12);
  if (error) return { error: 'Could not read the community feed.' };
  return {
    verified: true,
    issues: ((data ?? []) as Row[]).map((row) => publicTicket(ctx.me, row, false)),
    note: 'Support and affected votes are separate actions. Do not claim a vote was cast.',
  };
}

export async function departmentQueue(ctx: ToolContext) {
  if (ctx.me.role === 'student') return { error: 'Department queues are not available to student accounts.' };
  let query = ctx.admin
    .from('complaints')
    .select('id, ticket_number, title, location, category, priority, status, submission_type, assigned_to, assigned_department_id, due_at, created_by, created_at')
    .eq('institution_id', ctx.me.institution_id)
    .in('status', OPEN)
    .order('created_at', { ascending: false })
    .limit(20);
  if (ctx.me.role === 'teacher') {
    if (!ctx.deptIds.length) query = query.eq('assigned_to', ctx.me.id);
    else query = query.or(`assigned_to.eq.${ctx.me.id},assigned_department_id.in.(${ctx.deptIds.join(',')})`);
  }
  const { data, error } = await query;
  if (error) return { error: 'Could not read the queue you are allowed to see.' };
  const rows = (data ?? []) as Row[];
  return {
    verified: true,
    open_count: rows.length,
    complaints: rows.map((row) => ({
      ...publicTicket(ctx.me, row, false),
      assigned_to_you: row.assigned_to === ctx.me.id,
      due_at: row.due_at ?? null,
      overdue: Boolean(row.due_at && new Date(String(row.due_at)).getTime() < Date.now()),
    })),
    note: 'Names and private descriptions are omitted. These are open tickets in your authorized scope.',
  };
}

export async function workload(ctx: ToolContext) {
  const head = ctx.headDeptIds.length > 0;
  if (ctx.me.role === 'student') return { error: 'Workload summaries are not available to student accounts.' };
  if (ctx.me.role === 'teacher' && !head) return { error: 'Department workload is available to department heads and administrators.' };
  const ids = ctx.me.role === 'admin' ? null : ctx.headDeptIds;
  let query = ctx.admin
    .from('complaints')
    .select('status, priority, category, assigned_department_id, due_at, location')
    .eq('institution_id', ctx.me.institution_id)
    .limit(500);
  if (ids) query = query.in('assigned_department_id', ids);
  const { data, error } = await query;
  if (error) return { error: 'Could not summarize workload.' };
  const rows = (data ?? []) as Row[];
  const open = rows.filter((row) => OPEN.includes(String(row.status)));
  const byPriority: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  let overdue = 0;
  for (const row of open) {
    const priority = String(row.priority ?? 'medium');
    const category = String(row.category ?? 'other');
    byPriority[priority] = (byPriority[priority] ?? 0) + 1;
    byCategory[category] = (byCategory[category] ?? 0) + 1;
    if (row.due_at && new Date(String(row.due_at)).getTime() < Date.now()) overdue += 1;
  }
  return {
    verified: true,
    scope: ctx.me.role === 'admin' ? 'institution' : 'your departments',
    open: open.length,
    overdue,
    by_priority: byPriority,
    by_category: byCategory,
    note: 'Counts only. Do not invent ticket details that are not listed.',
  };
}

export async function institutionOverview(ctx: ToolContext) {
  if (ctx.me.role !== 'admin') return { error: 'Institution analytics are limited to administrators.' };
  const { data, error } = await ctx.admin
    .from('complaints')
    .select('status, category, submission_type, visibility, assigned_department_id, location, due_at')
    .eq('institution_id', ctx.me.institution_id)
    .limit(800);
  if (error) return { error: 'Could not read institution analytics.' };
  const rows = (data ?? []) as Row[];
  const byStatus: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const byDept: Record<string, number> = {};
  const locations: Record<string, number> = {};
  let open = 0;
  let overdue = 0;
  let requests = 0;
  for (const row of rows) {
    const status = String(row.status ?? 'unknown');
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    const category = String(row.category ?? 'other');
    byCategory[category] = (byCategory[category] ?? 0) + 1;
    if (row.submission_type === 'request') requests += 1;
    if (OPEN.includes(status)) {
      open += 1;
      const dept = String(row.assigned_department_id ?? 'unassigned');
      byDept[dept] = (byDept[dept] ?? 0) + 1;
      if (row.due_at && new Date(String(row.due_at)).getTime() < Date.now()) overdue += 1;
    }
    const location = String(row.location ?? '').trim().toLowerCase();
    if (location) locations[location] = (locations[location] ?? 0) + 1;
  }
  const { data: departments } = await ctx.admin
    .from('departments')
    .select('id, name')
    .eq('institution_id', ctx.me.institution_id);
  const names = new Map(((departments ?? []) as Row[]).map((dept) => [String(dept.id), String(dept.name)]));
  const repeats = Object.entries(locations)
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([location, count]) => ({ location, count }));
  return {
    verified: true,
    institution: ctx.institutionName,
    total: rows.length,
    open,
    overdue,
    requests,
    by_status: byStatus,
    by_category: byCategory,
    open_by_department: Object.entries(byDept).map(([id, count]) => ({
      department: names.get(id) ?? (id === 'unassigned' ? 'Unassigned' : 'Department'),
      open: count,
    })),
    repeat_locations: repeats,
    note: 'Aggregate counts from your institution. Personal descriptions are not included.',
  };
}

export async function surveySummary(ctx: ToolContext) {
  if (ctx.me.role === 'student') {
    const { data: recips } = await ctx.admin
      .from('survey_recipients')
      .select('survey_id')
      .eq('profile_id', ctx.me.id);
    const ids = ((recips ?? []) as Row[]).map((row) => String(row.survey_id));
    if (!ids.length) return { verified: true, surveys: [], note: 'No surveys are waiting for you.' };
    const [{ data: surveys }, { data: answered }] = await Promise.all([
      ctx.admin.from('surveys').select('id, title, status, deadline').in('id', ids).eq('status', 'published'),
      ctx.admin.from('survey_responses').select('survey_id').eq('respondent_id', ctx.me.id),
    ]);
    const done = new Set(((answered ?? []) as Row[]).map((row) => String(row.survey_id)));
    return {
      verified: true,
      surveys: ((surveys ?? []) as Row[]).map((survey) => ({
        title: survey.title,
        status: done.has(String(survey.id)) ? 'answered' : 'waiting',
        deadline: survey.deadline ?? null,
        href: '/student/surveys',
      })),
    };
  }
  const { data: surveys, error } = await ctx.admin
    .from('surveys')
    .select('id, title, status, created_at')
    .eq('institution_id', ctx.me.institution_id)
    .order('created_at', { ascending: false })
    .limit(8);
  if (error) return { error: 'Could not read surveys.' };
  const ids = ((surveys ?? []) as Row[]).map((survey) => String(survey.id));
  const { data: responses } = ids.length
    ? await ctx.admin.from('survey_responses').select('survey_id').in('survey_id', ids)
    : { data: [] };
  const counts: Record<string, number> = {};
  for (const row of (responses ?? []) as Row[]) {
    const id = String(row.survey_id);
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return {
    verified: true,
    surveys: ((surveys ?? []) as Row[]).map((survey) => ({
      title: survey.title,
      status: survey.status,
      responses: counts[String(survey.id)] ?? 0,
    })),
    note: 'Response counts only. Individual answers are not included.',
  };
}

export function proposeSubmission(raw: unknown): {
  forModel: Record<string, unknown>;
  card?: { type: 'submission_preview'; idempotency_key: string; draft: SubmissionDraft };
} {
  const checked = validateDraft(raw);
  if (!checked.ok) {
    return { forModel: { submitted: false, error: checked.error } };
  }
  const idempotency_key = crypto.randomUUID();
  return {
    forModel: {
      submitted: false,
      status: 'awaiting_user_confirmation',
      draft: checked.draft,
      instruction: 'Tell the user to review the preview and confirm. Do not say the ticket was created.',
    },
    card: { type: 'submission_preview', idempotency_key, draft: checked.draft },
  };
}

export async function runTool(ctx: ToolContext, name: string, args: Record<string, unknown>) {
  switch (name) {
    case 'list_my_complaints':
      return { forModel: await listMyComplaints(ctx) };
    case 'list_my_notifications':
      return { forModel: await listMyNotifications(ctx) };
    case 'lookup_ticket':
      return { forModel: await lookupTicket(ctx, String(args.ticket_number ?? '')) };
    case 'list_campus_issues':
      return { forModel: await listCampusIssues(ctx) };
    case 'department_queue':
      return { forModel: await departmentQueue(ctx) };
    case 'department_workload':
      return { forModel: await workload(ctx) };
    case 'institution_overview':
      return { forModel: await institutionOverview(ctx) };
    case 'survey_summary':
      return { forModel: await surveySummary(ctx) };
    case 'propose_submission':
      return proposeSubmission(args);
    default:
      return { forModel: { error: 'That action is not available.' } };
  }
}

export const TOOL_DECLARATIONS = [
  {
    name: 'list_my_complaints',
    description: 'Verified list of complaints and requests created by the signed-in user.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'list_my_notifications',
    description: 'The signed-in user\'s recent notifications.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'lookup_ticket',
    description: 'Look up one ticket by its reference, such as CC-ABC-00012. Access is checked on the server.',
    parameters: {
      type: 'object',
      properties: { ticket_number: { type: 'string' } },
      required: ['ticket_number'],
    },
  },
  {
    name: 'list_campus_issues',
    description: 'Recent campus-visible issues and requests. Does not include personal submissions.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'department_queue',
    description: 'Open tickets a teacher, department head, or administrator is allowed to see.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'department_workload',
    description: 'Open, overdue, and priority counts for a department head or administrator.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'institution_overview',
    description: 'Institution-wide aggregate counts for an administrator.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'survey_summary',
    description: 'Surveys the user can see: waiting surveys for a student, or response counts for staff.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'propose_submission',
    description: 'Prepare a complaint or request preview. This does not create a ticket. Call it only when the title, description, location, and category are known.',
    parameters: {
      type: 'object',
      properties: {
        submission_type: { type: 'string', enum: ['complaint', 'request'] },
        visibility: { type: 'string', enum: ['personal', 'campus'] },
        title: { type: 'string' },
        description: { type: 'string' },
        location: { type: 'string' },
        category: { type: 'string', enum: ['plumbing', 'electricity', 'cleanliness', 'internet'] },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
        preferred_outcome: { type: 'string' },
      },
      required: ['title', 'description', 'location', 'category'],
    },
  },
];
