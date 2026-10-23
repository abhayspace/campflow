import type { ReactNode } from 'react';

export function Arrow() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
export function Brand({ compact = false }: { compact?: boolean }) {
  return <span className={`marketing-brand ${compact ? 'compact' : ''}`}><span>camp<span className="brand-light">flow</span></span></span>;
}
export function IssueIcon({ kind }: { kind: string }) {
  const paths: Record<string, ReactNode> = {
    water: <path d="M12 3s-6 7-6 11a6 6 0 0 0 12 0c0-4-6-11-6-11ZM9 15a3 3 0 0 0 3 3" />,
    wifi: <><path d="M3 8a15 15 0 0 1 18 0M6 12a10 10 0 0 1 12 0M9 16a5 5 0 0 1 6 0" /><circle cx="12" cy="20" r=".7" fill="currentColor" /></>,
    bolt: <path d="m14 2-9 12h6l-1 8 9-12h-6l1-8Z" />,
    check: <path d="m5 12 4 4L19 6" />,
    route: <><path d="M5 19v-5a5 5 0 0 1 5-5h9m-4-4 4 4-4 4" /><circle cx="5" cy="19" r="2" /></>,
    campus: <path d="m3 9 9-6 9 6H3Zm2 2v7m7-7v7m7-7v7M3 21h18" />,
    spark: <path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z" />,
    lock: <><rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 2" /></>,
    pin: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z" /><circle cx="12" cy="10" r="2" /></>,
    message: <path d="M20 11a8 8 0 0 1-8 8H4l1.6-4A8 8 0 1 1 20 11ZM8 10h8m-8 4h5" />,
    bell: <><path d="M6 9a6 6 0 0 1 12 0c0 6 3 7 3 7H3s3-1 3-7Zm4 11h4" /></>,
  };
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind] ?? paths.spark}</svg>;
}
