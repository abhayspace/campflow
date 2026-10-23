import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cx } from '../lib/utils';

export function weekBuckets(dates: string[]) {
  const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const now = new Date();
  const buckets = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(now.getDate() - (6 - i));
    return { label: labels[day.getDay()]!, start: day.getTime(), value: 0 };
  });
  for (const iso of dates) {
    const time = new Date(iso).getTime();
    const index = buckets.findIndex((bucket, i) => {
      const end = i === buckets.length - 1 ? Number.POSITIVE_INFINITY : buckets[i + 1]!.start;
      return time >= bucket.start && time < end;
    });
    if (index >= 0) buckets[index]!.value += 1;
  }
  const peak = buckets.reduce((best, bucket, i) => (bucket.value > buckets[best]!.value ? i : best), 0);
  return buckets.map((bucket, i) => ({
    label: bucket.label,
    value: bucket.value,
    active: bucket.value > 0 && i === peak,
  }));
}

export function SoftBars({
  items,
  caption,
}: {
  items: { label: string; value: number; active?: boolean }[];
  caption?: string;
}) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <div>
      <div className="flex h-36 items-end gap-2.5 sm:gap-3">
        {items.map((item) => (
          <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div className="flex h-28 w-full items-end justify-center">
              <div
                className={cx(
                  'w-full max-w-10 rounded-2xl transition-all',
                  item.active ? 'bg-[#6d4aff]' : 'bg-[#e6e1fb]',
                )}
                style={{ height: `${Math.max(item.value === 0 ? 10 : 18, (item.value / max) * 100)}%` }}
                title={`${item.label}: ${item.value}`}
              />
            </div>
            <span className="text-[11px] font-semibold text-slate-400">{item.label}</span>
          </div>
        ))}
      </div>
      {caption && <p className="mt-3 text-xs text-slate-400">{caption}</p>}
    </div>
  );
}

export function SegmentBar({
  parts,
}: {
  parts: { label: string; value: number; color: string }[];
}) {
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100">
        {total === 0 ? (
          <div className="h-full w-full bg-candy-lavender" />
        ) : (
          parts.map((part) => (
            <div
              key={part.label}
              className="h-full"
              style={{ width: `${(part.value / total) * 100}%`, background: part.color }}
              title={`${part.label}: ${part.value}`}
            />
          ))
        )}
      </div>
      <div className="mt-2 flex justify-between gap-2 text-[11px] font-semibold text-slate-400">
        {parts.map((part) => (
          <span key={part.label}>{total ? `${Math.round((part.value / total) * 100)}%` : '0%'}</span>
        ))}
      </div>
    </div>
  );
}

const TONES = {
  purple: 'bg-brand-600 text-white',
  mint: 'bg-accent-500 text-white',
  peach: 'bg-candy-peach text-white',
  yellow: 'bg-candy-yellow text-slate-900',
} as const;

export function RingStat({
  tone,
  value,
  label,
  icon,
}: {
  tone: keyof typeof TONES;
  value: ReactNode;
  label: string;
  icon: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-2 rounded-2xl bg-slate-50 px-2 py-4 text-center">
      <span className={cx('flex h-11 w-11 items-center justify-center rounded-full', TONES[tone])}>{icon}</span>
      <p className="text-2xl font-extrabold leading-none tracking-tight text-slate-900">{value}</p>
      <p className="text-[11px] font-semibold leading-tight text-slate-400">{label}</p>
    </div>
  );
}

export function FeatureCard({
  eyebrow,
  pill,
  title,
  body,
  progress,
  progressLabel,
  action,
}: {
  eyebrow: string;
  pill?: string;
  title: string;
  body: string;
  progress?: number;
  progressLabel?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col rounded-[26px] bg-white p-6 shadow-[0_8px_28px_rgba(36,25,85,0.05)]">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-emerald-600">{eyebrow}</span>
        {pill && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">{pill}</span>}
      </div>
      <h2 className="mt-4 text-[26px] font-extrabold leading-tight tracking-tight text-slate-900">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-500">{body}</p>
      {progress != null && (
        <div className="mt-5">
          <div className="mb-1.5 flex justify-between text-xs font-semibold text-slate-400">
            <span>{progressLabel ?? 'Progress'}</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-[#ffe56a]" style={{ width: `${Math.max(progress, progress > 0 ? 8 : 0)}%` }} />
          </div>
        </div>
      )}
      {action && <div className="mt-auto pt-5">{action}</div>}
    </div>
  );
}

export function NowCard({
  when,
  title,
  meta,
  href,
}: {
  when: string;
  title: string;
  meta: string;
  href: string;
}) {
  return (
    <Link to={href} className="flex min-h-44 flex-col justify-between rounded-[22px] bg-[#6d4aff] p-4 text-white">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-white/80">{when}</p>
        <span className="rounded-full bg-[#ffb020] px-2 py-0.5 text-[11px] font-bold text-slate-900">Now</span>
      </div>
      <div>
        <p className="text-lg font-extrabold leading-snug">{title}</p>
        <p className="mt-2 text-xs font-semibold text-white/80">{meta}</p>
      </div>
    </Link>
  );
}

export function QuietCard({
  when,
  title,
  meta,
  href,
}: {
  when: string;
  title: string;
  meta: string;
  href: string;
}) {
  return (
    <Link to={href} className="flex min-h-44 flex-col justify-between rounded-[22px] bg-slate-50 p-4 ring-1 ring-slate-100">
      <p className="text-sm font-semibold text-slate-400">{when}</p>
      <div>
        <p className="text-lg font-extrabold leading-snug text-slate-900">{title}</p>
        <p className="mt-2 text-xs font-semibold text-slate-400">{meta}</p>
      </div>
    </Link>
  );
}

export function Meter({
  label,
  value,
  max,
  hint,
}: {
  label: string;
  value: number;
  max: number;
  hint?: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="truncate text-sm font-semibold text-slate-700">{label}</span>
        <span className="shrink-0 text-xs font-bold text-slate-400">{value}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.max(pct, value > 0 ? 8 : 0)}%` }} />
      </div>
      {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}
