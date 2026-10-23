import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { callFunction } from '../../lib/api';
import type { Complaint, SurveyQuestionType } from '../../lib/types';
import { Badge, Button, Card, CardBody, CardHeader, Field, Input, PageHeader, Select, Textarea } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { cx, errorMessage } from '../../lib/utils';

interface DraftQ {
  question_type: SurveyQuestionType;
  text: string;
  options: string[];
  required: boolean;
}

const RESOLUTION_TEMPLATE: DraftQ[] = [
  { question_type: 'single', text: 'Has this issue been resolved for you?', options: ['Yes, completely', 'Partially resolved', 'No, the issue remains'], required: true },
  { question_type: 'rating', text: 'How satisfied are you with the solution?', options: [], required: true },
  { question_type: 'yesno', text: 'Is the problem still occurring at your location?', options: ['yes', 'no', 'not_sure'], required: true },
  { question_type: 'text', text: 'What could be improved?', options: [], required: false },
];

const Q_TYPES: { value: SurveyQuestionType; label: string }[] = [
  { value: 'single', label: 'Single choice' },
  { value: 'multi', label: 'Multiple choice' },
  { value: 'rating', label: 'Rating (1–5)' },
  { value: 'yesno', label: 'Yes / no / not sure' },
  { value: 'text', label: 'Written feedback' },
];

export default function SurveyBuilder() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const prefillComplaint = params.get('complaint');

  const [title, setTitle] = useState('Resolution check-in');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [anonymous, setAnonymous] = useState(true);
  const [questions, setQuestions] = useState<DraftQ[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [complaintId, setComplaintId] = useState(prefillComplaint ?? '');
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from('complaints').select('id, ticket_number, title, status, submission_type, request_status, visibility')
      .order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => setComplaints((data ?? []) as Complaint[]));
  }, []);

  const applyTemplate = () => {
    setQuestions(RESOLUTION_TEMPLATE.map((q) => ({ ...q, options: [...q.options] })));
    if (!title || title === 'Resolution check-in') {
      const c = complaints.find((x) => x.id === complaintId);
      setTitle(`Resolution check — ${c?.title?.slice(0, 50) ?? 'issue'}`);
    }
  };

  const addQuestion = (type: SurveyQuestionType) => {
    setQuestions((q) => [...q, {
      question_type: type, text: '',
      options: type === 'single' || type === 'multi' ? ['Option 1', 'Option 2'] : type === 'yesno' ? ['yes', 'no', 'not_sure'] : [],
      required: type !== 'text',
    }]);
  };

  const update = (i: number, patch: Partial<DraftQ>) =>
    setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));

  const save = async (andPublish: boolean) => {
    if (title.trim().length < 3) return toast('Give the survey a title', 'error');
    if (!questions.length) return toast('Add at least one question', 'error');
    for (const q of questions) {
      if (!q.text.trim()) return toast('Every question needs text', 'error');
      if ((q.question_type === 'single' || q.question_type === 'multi') && q.options.filter((o) => o.trim()).length < 2) {
        return toast(`"${q.text || 'A question'}" needs at least 2 options`, 'error');
      }
    }
    setBusy(true);
    try {
      const { survey } = await callFunction<{ survey: { id: string } }>('surveys', {
        action: 'create',
        title: title.trim(),
        description: description.trim() || null,
        complaint_id: complaintId || null,
        anonymous,
        deadline: deadline ? new Date(deadline).toISOString() : null,
        questions: questions.map((q) => ({
          question_type: q.question_type, text: q.text.trim(),
          options: q.options.filter((o) => o.trim()), required: q.required,
        })),
      });
      if (andPublish) {
        await callFunction('surveys', { action: 'publish', survey_id: survey.id });
        toast('Survey published — eligible students notified', 'success');
      } else {
        toast('Survey saved as draft', 'success');
      }
      navigate(`/surveys/${survey.id}`);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="New survey" subtitle="Build questions, choose who answers, preview before publishing." />

      <Card>
        <CardBody className="space-y-4">
          <Field label="Survey title" required>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} />
          </Field>
          <Field label="Description">
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Why you're asking, and what happens with the answers…" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Related submission">
              <Select value={complaintId} onChange={(e) => setComplaintId(e.target.value)}>
                <option value="">None (standalone)</option>
                {complaints.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.ticket_number} — {c.title.slice(0, 50)}{c.submission_type === 'request' ? ' (request)' : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Response deadline">
              <Input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </Field>
          </div>
          <Field label="Responses">
            <div className="flex gap-2">
              {[true, false].map((v) => (
                <button key={String(v)} type="button" onClick={() => setAnonymous(v)}
                  className={cx('rounded-full px-4 py-2 text-xs font-semibold transition-colors',
                    anonymous === v ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:text-slate-800')}>
                  {v ? 'Anonymous' : 'Identifiable'}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-slate-400">
              {anonymous
                ? 'Respondents see "anonymous" — staff see answers but not who wrote them.'
                : 'Respondents see their name is attached — staff can follow up.'}
            </p>
          </Field>
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Recipients are automatic: the submitter always qualifies; for campus-wide items, students who marked
            "this affects me" are included. Staff can adjust on publish.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Questions" subtitle="Mix types freely — nothing is forced."
          action={<Button size="sm" variant="secondary" onClick={applyTemplate}>Resolution template</Button>} />
        <CardBody className="space-y-4">
          {questions.map((q, i) => (
            <div key={i} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-start gap-3">
                <span className="mt-1 text-xs font-bold text-slate-300">Q{i + 1}</span>
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge>{q.question_type}</Badge>
                    <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-500">
                      <input type="checkbox" className="h-3.5 w-3.5 rounded" checked={q.required}
                        onChange={(e) => update(i, { required: e.target.checked })} /> required
                    </label>
                    <button className="text-xs font-semibold text-red-500 hover:underline" onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))}>Remove</button>
                  </div>
                  <Input value={q.text} onChange={(e) => update(i, { text: e.target.value })} placeholder="Question text…" />
                  {(q.question_type === 'single' || q.question_type === 'multi') && (
                    <div className="space-y-1.5">
                      {q.options.map((o, j) => (
                        <div key={j} className="flex gap-2">
                          <Input value={o} placeholder={`Option ${j + 1}`}
                            onChange={(e) => update(i, { options: q.options.map((x, k) => (k === j ? e.target.value : x)) })} />
                          <button className="text-xs text-slate-300 hover:text-red-500"
                            onClick={() => update(i, { options: q.options.filter((_, k) => k !== j) })}>✕</button>
                        </div>
                      ))}
                      <button className="text-xs font-semibold text-brand-600" onClick={() => update(i, { options: [...q.options, ''] })}>+ option</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            {Q_TYPES.map((t) => (
              <Button key={t.value} size="sm" variant="secondary" onClick={() => addQuestion(t.value)}>+ {t.label}</Button>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* Preview */}
      <Card>
        <CardHeader title="Preview" subtitle="Exactly what respondents will see."
          action={<Button size="sm" variant="ghost" onClick={() => setPreview(!preview)}>{preview ? 'Hide' : 'Show'}</Button>} />
        {preview && (
          <CardBody className="space-y-4">
            <p className="text-base font-bold text-slate-900">{title || 'Untitled survey'}</p>
            <p className="text-xs text-slate-400">Responses are {anonymous ? 'anonymous' : 'identifiable to staff'}.</p>
            {questions.map((q, i) => (
              <div key={i} className="border-t border-slate-100 pt-3">
                <p className="text-sm font-semibold text-slate-800">{q.text || `Question ${i + 1}`} {q.required && <span className="text-red-400">*</span>}</p>
                {q.question_type === 'rating' && <p className="mt-1 text-slate-400">1 ★ — 5 ★</p>}
                {q.question_type === 'text' && <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-400">written answer…</div>}
                {q.options.length > 0 && q.question_type !== 'rating' && (
                  <ul className="mt-1.5 space-y-1">
                    {q.options.map((o, j) => <li key={j} className="text-sm text-slate-600">◦ {o}</li>)}
                  </ul>
                )}
              </div>
            ))}
          </CardBody>
        )}
      </Card>

      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" loading={busy} onClick={() => save(false)}>Save draft</Button>
        <Button className="flex-1" loading={busy} onClick={() => save(true)}>Publish & notify</Button>
      </div>
    </div>
  );
}
