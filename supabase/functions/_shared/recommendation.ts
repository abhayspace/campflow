export interface RecommendationDraft {
  problem_summary: string;
  recommended_solution: string;
  action_steps: string[];
  suggested_department: string | null;
  suggested_priority: 'low' | 'medium' | 'high' | 'urgent';
  priority_reason: string;
  effort_estimate: 'Low' | 'Medium' | 'High' | 'Not enough information';
  missing_information: string[];
  confidence_notes: string;
  hypotheses: { text: string; evidence: string }[];
  investigation_steps: string[];
  recurring_notes: string;
  escalation_notes: string;
}

const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
const EFFORTS = ['Low', 'Medium', 'High', 'Not enough information'] as const;

function text(value: unknown, max: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function list(value: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => text(item, maxLen))
    .filter((item) => item.length >= 3)
    .slice(0, maxItems);
}

export function normalizeRecommendation(
  raw: unknown,
  opts: { departments: string[]; safetyFlagged: boolean },
): { ok: true; draft: RecommendationDraft } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Gemini returned an unreadable recommendation.' };
  const body = raw as Record<string, unknown>;
  const problem = text(body.problem_summary, 600);
  const solution = text(body.recommended_solution, 800);
  const steps = list(body.action_steps, 5, 300);
  if (problem.length < 8 || solution.length < 8) {
    return { ok: false, error: 'Gemini did not return a usable problem summary and solution.' };
  }
  if (steps.length < 3) {
    return { ok: false, error: 'Gemini did not return enough action steps. Try again.' };
  }

  const wanted = text(body.suggested_department, 120).toLowerCase();
  const match = opts.departments.find((name) => name.toLowerCase() === wanted) ?? null;

  let priority = PRIORITIES.includes(body.suggested_priority as (typeof PRIORITIES)[number])
    ? (body.suggested_priority as RecommendationDraft['suggested_priority'])
    : 'medium';
  let reason = text(body.priority_reason, 400);
  if (opts.safetyFlagged && (priority === 'low' || priority === 'medium')) {
    priority = 'urgent';
    reason = `${reason ? `${reason} ` : ''}The complaint is already flagged for safety, so this is treated as urgent.`.trim();
  }
  if (!reason) reason = 'The suggestion follows the details in the report. It is not a confirmed diagnosis.';

  const effortRaw = text(body.effort_estimate, 40);
  const effort = EFFORTS.find((item) => item.toLowerCase() === effortRaw.toLowerCase()) ?? 'Not enough information';

  const hypotheses = Array.isArray(body.hypotheses)
    ? body.hypotheses.slice(0, 4).map((item) => {
        const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
        return { text: text(row.text, 240), evidence: text(row.evidence, 240) };
      }).filter((item) => item.text.length >= 3)
    : [];

  let confidence = text(body.confidence_notes, 500);
  if (!match && wanted) {
    confidence = `${confidence ? `${confidence} ` : ''}No configured department matched "${text(body.suggested_department, 80)}", so none is assigned.`.trim();
  }
  if (!confidence) confidence = 'This is a suggestion from the report text. A person still needs to inspect the situation.';

  return {
    ok: true,
    draft: {
      problem_summary: problem,
      recommended_solution: solution,
      action_steps: steps,
      suggested_department: match,
      suggested_priority: priority,
      priority_reason: reason,
      effort_estimate: effort,
      missing_information: list(body.missing_information, 6, 180),
      confidence_notes: confidence,
      hypotheses,
      investigation_steps: list(body.investigation_steps, 5, 240),
      recurring_notes: text(body.recurring_notes, 400),
      escalation_notes: text(body.escalation_notes, 400),
    },
  };
}
