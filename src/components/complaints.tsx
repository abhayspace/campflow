import { Link } from 'react-router-dom';
import type { Complaint, ComplaintCategory, ComplaintEvent, ComplaintPriority, ComplaintStatus } from '../lib/types';
import { PRIORITY_LABELS, REQUEST_STATUS_LABELS, REQUEST_STATUS_STYLES, STATUS_LABELS } from '../lib/types';
import {
  CATEGORY_STYLES, META_CHIP, PRIORITY_STYLES, STATUS_STYLES,
  cx, formatDateTime, timeAgo,
} from '../lib/utils';
import { Badge, Card } from './ui';

export function StatusBadge({ status }: { status: ComplaintStatus }) {
  return <Badge className={STATUS_STYLES[status]}>{STATUS_LABELS[status]}</Badge>;
}

export function CategoryBadge({ category }: { category: ComplaintCategory }) {
  const label = category.charAt(0).toUpperCase() + category.slice(1);
  return <Badge className={CATEGORY_STYLES[category]}>{label}</Badge>;
}

export function PriorityBadge({ priority }: { priority: ComplaintPriority }) {
  return <Badge className={PRIORITY_STYLES[priority]}>{PRIORITY_LABELS[priority]}</Badge>;
}

export function ComplaintRow({ c, to }: { c: Complaint; to: string }) {
  return (
    <Link
      to={to}
      className="block rounded-[22px] bg-slate-50 p-4 ring-1 ring-slate-100 transition-colors hover:bg-white hover:ring-slate-300"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs font-bold text-slate-400">{c.ticket_number}</p>
          <p className="mt-1 text-[15px] font-bold leading-snug text-slate-900">{c.title}</p>
          <p className="mt-1 line-clamp-2 text-sm text-slate-500">{c.location}</p>
        </div>
        <span className="shrink-0 pt-0.5 text-xs font-medium text-slate-400">{timeAgo(c.created_at)}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {c.submission_type === 'request' ? (
          <Badge className={REQUEST_STATUS_STYLES[c.request_status ?? 'submitted']}>
            {REQUEST_STATUS_LABELS[c.request_status ?? 'submitted']}
          </Badge>
        ) : (
          <StatusBadge status={c.status} />
        )}
        {c.submission_type === 'request' && (
          <Badge className={META_CHIP}>Request</Badge>
        )}
        {c.visibility === 'campus' && (
          <Badge className={META_CHIP}>Campus</Badge>
        )}
        <CategoryBadge category={c.category} />
        <PriorityBadge priority={c.priority} />
      </div>
    </Link>
  );
}

const EVENT_LABELS: Record<string, string> = {
  created: 'Complaint submitted',
  status_changed: 'Status changed',
  assigned: 'Assignee changed',
  department_assigned: 'Department changed',
  note: 'Note',
  ai_analysis: 'AI analysis',
  linked: 'Linked as related',
  unlinked: 'Link dismissed',
  resolved: 'Resolved',
  reopened: 'Reopened',
  closed: 'Confirmed resolved',
  info_requested: 'More info requested',
  priority_changed: 'Priority changed',
  escalated: 'Escalated',
  verification: 'Verification update',
  linked_incident: 'Linked to incident',
  deferred: 'Link deferred',
  vote: 'Community vote',
  moderated: 'Moderation',
  request_status: 'Request status',
  solution_chosen: 'Solution decision',
  survey_sent: 'Survey sent',
};

export function ComplaintTimeline({ events }: { events: ComplaintEvent[] }) {
  if (!events.length) return <p className="text-sm text-slate-400">No activity yet.</p>;
  return (
    <ol className="relative space-y-5 border-l border-slate-200 pl-6">
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span
            className={cx(
              'absolute -left-[31px] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-white',
              e.event_type === 'resolved' || e.event_type === 'closed'
                ? 'bg-emerald-500'
                : e.event_type === 'reopened'
                  ? 'bg-orange-500'
                  : 'bg-brand-500',
            )}
          />
          <div className="flex flex-wrap items-baseline gap-2">
            <p className="text-sm font-medium text-slate-800">{EVENT_LABELS[e.event_type] ?? e.event_type}</p>
            {e.previous_value && e.new_value && (
              <span className="text-xs text-slate-500">
                {STATUS_LABELS[e.previous_value as ComplaintStatus] ?? e.previous_value} →{' '}
                {STATUS_LABELS[e.new_value as ComplaintStatus] ?? e.new_value}
              </span>
            )}
            {e.is_internal && <Badge className="bg-slate-100 text-slate-500 ring-slate-200">internal</Badge>}
          </div>
          {e.note && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{e.note}</p>}
          <p className="mt-1 text-xs text-slate-400">
            {e.actor?.full_name ?? 'System'} · {formatDateTime(e.created_at)}
          </p>
        </li>
      ))}
    </ol>
  );
}

export function ComplaintMetaCard({ c }: { c: Complaint }) {
  return (
    <Card className="p-4">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div>
          <dt className="text-xs text-slate-400">Ticket</dt>
          <dd className="font-mono font-semibold text-brand-800">{c.ticket_number}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">Status</dt>
          <dd><StatusBadge status={c.status} /></dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">Category</dt>
          <dd><CategoryBadge category={c.category} /></dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">Priority</dt>
          <dd><PriorityBadge priority={c.priority} /></dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs text-slate-400">Location</dt>
          <dd className="text-slate-800">📍 {c.location}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">Reported</dt>
          <dd className="text-slate-800">{formatDateTime(c.created_at)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">Resolved</dt>
          <dd className="text-slate-800">{c.resolved_at ? formatDateTime(c.resolved_at) : '—'}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">Department</dt>
          <dd className="text-slate-800">{c.department?.name ?? 'Awaiting triage'}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">Assignee</dt>
          <dd className="text-slate-800">{c.assignee?.full_name ?? 'Unassigned'}</dd>
        </div>
      </dl>
    </Card>
  );
}
