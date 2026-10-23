export const DRAFT_CATEGORIES = ['plumbing', 'electricity', 'cleanliness', 'internet'] as const;
export const DRAFT_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

export interface SubmissionDraft {
  submission_type: 'complaint' | 'request';
  visibility: 'personal' | 'campus';
  title: string;
  description: string;
  location: string;
  category: (typeof DRAFT_CATEGORIES)[number];
  priority: (typeof DRAFT_PRIORITIES)[number];
  preferred_outcome: string | null;
}

export function validateDraft(raw: unknown): { ok: true; draft: SubmissionDraft } | { ok: false; error: string } {
  const body = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const title = String(body.title ?? '').trim();
  const description = String(body.description ?? '').trim();
  const location = String(body.location ?? '').trim();
  const category = String(body.category ?? '').trim().toLowerCase();
  const priorityRaw = String(body.priority ?? 'medium').trim().toLowerCase();
  const submissionType = body.submission_type === 'request' ? 'request' : body.submission_type === 'complaint' || body.submission_type == null ? 'complaint' : '';
  const visibility = body.visibility === 'campus' ? 'campus' : body.visibility === 'personal' || body.visibility == null ? 'personal' : '';
  const preferred = body.preferred_outcome == null ? '' : String(body.preferred_outcome).trim();

  if (!submissionType) return { ok: false, error: 'submission_type must be complaint or request' };
  if (!visibility) return { ok: false, error: 'visibility must be personal or campus' };
  if (title.length < 4 || title.length > 160) return { ok: false, error: 'title must be 4–160 characters' };
  if (description.length < 10 || description.length > 4000) return { ok: false, error: 'description must be 10–4000 characters' };
  if (location.length < 2 || location.length > 200) return { ok: false, error: 'location is required' };
  if (!(DRAFT_CATEGORIES as readonly string[]).includes(category)) {
    return { ok: false, error: 'category must be plumbing, electricity, cleanliness, or internet' };
  }
  if (!(DRAFT_PRIORITIES as readonly string[]).includes(priorityRaw)) {
    return { ok: false, error: 'priority must be low, medium, high, or urgent' };
  }
  if (preferred.length > 1000) return { ok: false, error: 'preferred outcome is too long' };

  return {
    ok: true,
    draft: {
      submission_type: submissionType,
      visibility,
      title,
      description,
      location,
      category: category as SubmissionDraft['category'],
      priority: priorityRaw as SubmissionDraft['priority'],
      preferred_outcome: preferred || null,
    },
  };
}
