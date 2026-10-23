import type { ComplaintStatus, ComplaintCategory, ComplaintPriority } from './types';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

export function hoursSinceLabel(iso: string): string {
  const h = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m ago`;
  if (h < 24) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** Status is the one filled chip. Category, priority, and type share one outline. */
export const STATUS_CHIP = 'bg-[#171716] text-white ring-[#171716]';
export const META_CHIP = 'bg-white text-slate-600 ring-slate-200';

export const STATUS_STYLES: Record<ComplaintStatus, string> = {
  new: STATUS_CHIP,
  assigned: STATUS_CHIP,
  in_progress: STATUS_CHIP,
  resolved: STATUS_CHIP,
  reopened: STATUS_CHIP,
  closed: STATUS_CHIP,
};

export const CATEGORY_STYLES: Record<ComplaintCategory, string> = {
  plumbing: META_CHIP,
  electricity: META_CHIP,
  cleanliness: META_CHIP,
  internet: META_CHIP,
};

export const PRIORITY_STYLES: Record<ComplaintPriority, string> = {
  low: META_CHIP,
  medium: META_CHIP,
  high: META_CHIP,
  urgent: META_CHIP,
};

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return 'Something went wrong';
}

export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
