// Pure helpers for the campus-improvement upgrade.
// Scores, permissions, and status changes stay outside the model.

export type MemoryOutcome = 'successful' | 'partial' | 'unsuccessful' | 'inconclusive';
export type CriterionState = 'proposed' | 'confirmed' | 'completed' | 'waived';

export interface CriterionDraft {
  label: string;
  evidence_required: string;
  source: 'rule' | 'gemini' | 'staff';
}

const OUTCOMES = new Set<MemoryOutcome>(['successful', 'partial', 'unsuccessful', 'inconclusive']);

export function memoryOutcome(value: unknown): MemoryOutcome | null {
  const text = String(value ?? '');
  return OUTCOMES.has(text as MemoryOutcome) ? (text as MemoryOutcome) : null;
}

export function defaultCriteria(category: string, safetyFlagged: boolean): CriterionDraft[] {
  const shared: CriterionDraft[] = [
    { label: 'The reported place has been checked by authorized staff.', evidence_required: 'A short note of what was inspected.', source: 'rule' },
    { label: 'The action that was actually taken is written down.', evidence_required: 'Resolution or work note on this ticket.', source: 'rule' },
    { label: 'The student who reported it can say whether the result holds.', evidence_required: 'Existing verification or survey, if the student responds.', source: 'rule' },
  ];
  const specific: Record<string, CriterionDraft> = {
    internet: { label: 'Connectivity in the reported area has been checked, not assumed.', evidence_required: 'What was tested and what the result was.', source: 'rule' },
    electricity: { label: 'The area is left safe for other people. Students are not asked to handle wiring.', evidence_required: 'Who attended and what made the area safe.', source: 'rule' },
    plumbing: { label: 'The reported leak or blockage has been located as far as the visit allows.', evidence_required: 'Where it was found and what was done.', source: 'rule' },
    cleanliness: { label: 'The reported condition in that place has been addressed or scheduled with a named owner.', evidence_required: 'Inspection note.', source: 'rule' },
  };
  const items = [specific[category] ?? shared[0]!, ...shared.slice(1)];
  if (safetyFlagged) {
    items.unshift({
      label: 'Configured safety escalation stays in force. This checklist does not replace it.',
      evidence_required: 'Escalation record or a staff note that the safety rule was followed.',
      source: 'rule',
    });
  }
  return items.slice(0, 6);
}

export function normalizeCriteria(raw: unknown, fallback: CriterionDraft[]): CriterionDraft[] {
  const rows = Array.isArray(raw) ? raw : [];
  const cleaned = rows.map((row) => {
    const item = row as { label?: unknown; evidence_required?: unknown };
    const label = String(item?.label ?? '').trim().slice(0, 240);
    const evidence = String(item?.evidence_required ?? '').trim().slice(0, 240);
    if (label.length < 8 || evidence.length < 4) return null;
    return { label, evidence_required: evidence, source: 'gemini' as const };
  }).filter((row): row is CriterionDraft => Boolean(row));
  return (cleaned.length >= 3 ? cleaned : fallback).slice(0, 6);
}

export function recurrenceReason(hours: number): string {
  const elapsed = Number.isFinite(hours) ? `${Math.max(0, Math.round(hours))} hours after the earlier resolution` : 'after an earlier resolution';
  return `A resolved report in a similar place and category was found ${elapsed}. Review whether this is the same problem. This flag is not evidence that the earlier repair failed.`;
}

export function hoursBetween(laterIso: string, earlierIso: string | null): number | null {
  if (!earlierIso) return null;
  const later = new Date(laterIso).getTime();
  const earlier = new Date(earlierIso).getTime();
  if (Number.isNaN(later) || Number.isNaN(earlier)) return null;
  return (later - earlier) / 3_600_000;
}

export interface DossierSection {
  verified_facts: string[];
  historical_records: string[];
  staff_notes: string[];
  ai_hypotheses: string[];
  next_steps: string[];
  policy_excerpts: { title: string; excerpt: string }[];
}

const STUDENT_HIDDEN = new Set(['staff_notes', 'ai_hypotheses']);

export function dossierForAudience(body: DossierSection, audience: 'staff' | 'student'): DossierSection {
  if (audience === 'staff') return body;
  return {
    verified_facts: body.verified_facts,
    historical_records: body.historical_records.filter((line) => !/internal|staff note/i.test(line)),
    staff_notes: [],
    ai_hypotheses: [],
    next_steps: body.next_steps,
    policy_excerpts: body.policy_excerpts,
  };
}

export function hiddenDossierKeys(audience: 'staff' | 'student'): string[] {
  return audience === 'student' ? [...STUDENT_HIDDEN] : [];
}

export function keywordOverlap(query: string, document: string): boolean {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3);
  const hay = document.toLowerCase();
  return words.some((word) => hay.includes(word));
}
