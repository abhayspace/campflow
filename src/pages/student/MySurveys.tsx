import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { supabase } from '../../lib/supabase';
import { callFunction } from '../../lib/api';
import type { Survey, SurveyQuestion } from '../../lib/types';
import { Badge, Button, Card, CardBody, EmptyState, PageHeader, Spinner, Textarea } from '../../components/ui';
import { cx, errorMessage, formatDateTime, timeAgo } from '../../lib/utils';

export function MySurveys() {
  const { profile } = useAuth();
  const [pending, setPending] = useState<Survey[]>([]);
  const [done, setDone] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const { data: mine } = await supabase
        .from('survey_recipients').select('survey_id').eq('profile_id', profile.id);
      const ids = (mine ?? []).map((r) => r.survey_id);
      if (!ids.length) { setLoading(false); return; }
      const { data: surveys } = await supabase
        .from('surveys').select('*, complaint:complaint_id(ticket_number, title)')
        .in('id', ids).order('created_at', { ascending: false });
      const { data: responded } = await supabase
        .from('survey_responses').select('survey_id').eq('respondent_id', profile.id);
      const doneIds = new Set((responded ?? []).map((r) => r.survey_id));
      const all = (surveys ?? []) as Survey[];
      setPending(all.filter((s) => s.status === 'published' && !doneIds.has(s.id)));
      setDone(all.filter((s) => doneIds.has(s.id) || s.status === 'closed'));
      setLoading(false);
    })();
  }, [profile]);

  if (loading) return <div className="flex justify-center py-20"><Spinner className="h-8 w-8 text-brand-600" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Surveys" subtitle="When staff resolve something, they may ask if the fix actually worked for you." />
      <h3 className="text-sm font-bold text-slate-700">To complete ({pending.length})</h3>
      {pending.length === 0 && <EmptyState title="Nothing waiting on you" message="When a survey is published for you, it'll show up here." />}
      {pending.map((s) => (
        <Link key={s.id} to={`/student/surveys/${s.id}`}>
          <Card className="transition-shadow hover:shadow-md">
            <CardBody className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold text-slate-900">{s.title}</p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {s.complaint ? `About ${s.complaint.ticket_number} — ${s.complaint.title}` : 'General survey'}
                  {s.deadline ? ` · due ${formatDateTime(s.deadline)}` : ''}
                  {' · '}{s.anonymous ? 'anonymous' : 'identifiable'}
                </p>
              </div>
              <Badge className="bg-brand-100 text-brand-800 ring-brand-200">Answer →</Badge>
            </CardBody>
          </Card>
        </Link>
      ))}
      {done.length > 0 && (
        <>
          <h3 className="pt-2 text-sm font-bold text-slate-700">Completed ({done.length})</h3>
          {done.map((s) => (
            <Card key={s.id}><CardBody className="flex items-center justify-between gap-3 opacity-70">
              <div className="min-w-0">
                <p className="font-semibold text-slate-700">{s.title}</p>
                <p className="text-xs text-slate-400">{timeAgo(s.created_at)} · {s.anonymous ? 'anonymous' : 'identifiable'}</p>
              </div>
              <Badge className="bg-slate-100 text-slate-500 ring-slate-200">{s.status === 'closed' ? 'closed' : 'answered'}</Badge>
            </CardBody></Card>
          ))}
        </>
      )}
    </div>
  );
}

// ============ Respond ============
export function SurveyRespond() {
  const { id } = useParams();
  const { profile } = useAuth();
  const { toast } = useToast();
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string | string[] | number>>({});
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id || !profile) return;
    (async () => {
      const { data: s } = await supabase.from('surveys')
        .select('*, complaint:complaint_id(ticket_number, title)').eq('id', id).maybeSingle();
      if (!s || s.status !== 'published') { setNotFound(true); setLoading(false); return; }
      const { data: existing } = await supabase.from('survey_responses').select('id')
        .eq('survey_id', id).eq('respondent_id', profile.id).maybeSingle();
      if (existing) { setDone(true); }
      const { data: q } = await supabase.from('survey_questions').select('*').eq('survey_id', id).order('ord');
      setSurvey(s as Survey);
      setQuestions((q ?? []) as SurveyQuestion[]);
      setLoading(false);
    })();
  }, [id, profile]);

  const setAnswer = (qid: string, v: string | string[] | number) =>
    setAnswers((a) => ({ ...a, [qid]: v }));

  const toggleMulti = (qid: string, opt: string) => {
    const cur = (answers[qid] as string[] | undefined) ?? [];
    setAnswer(qid, cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt]);
  };

  const submit = async () => {
    setBusy(true);
    try {
      await callFunction('surveys', {
        action: 'respond', survey_id: id,
        answers: Object.entries(answers).map(([question_id, value]) => ({ question_id, value })),
      });
      setDone(true);
      toast('Thanks — your response was recorded', 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner className="h-8 w-8 text-brand-600" /></div>;
  if (notFound || !survey) return <EmptyState title="Survey unavailable" message="It may be closed, or you're not an eligible respondent." />;
  if (done) return (
    <div className="mx-auto max-w-lg">
      <Card><CardBody className="space-y-4 py-10 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl">✓</div>
        <h2 className="text-lg font-semibold">Response recorded</h2>
        <p className="text-sm text-slate-500">Your feedback helps staff know whether fixes actually worked.</p>
        <Link to="/student/surveys"><Button variant="secondary">Back to surveys</Button></Link>
      </CardBody></Card>
    </div>
  );

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link to="/student/surveys" className="text-sm font-semibold text-slate-400 hover:text-slate-700">← Surveys</Link>
      <Card>
        <CardBody className="space-y-2">
          <h1 className="text-xl font-bold text-slate-900">{survey.title}</h1>
          {survey.description && <p className="text-sm text-slate-500">{survey.description}</p>}
          <p className={cx('text-xs font-semibold', survey.anonymous ? 'text-emerald-600' : 'text-amber-600')}>
            {survey.anonymous
              ? 'This survey is anonymous — staff see your answers but not your name.'
              : 'This survey is identifiable — staff can see who answered.'}
          </p>
          {survey.deadline && <p className="text-xs text-slate-400">Due {formatDateTime(survey.deadline)}</p>}
        </CardBody>
      </Card>

      {questions.map((q, i) => (
        <Card key={q.id}>
          <CardBody className="space-y-3">
            <p className="text-sm font-semibold text-slate-900">
              {i + 1}. {q.text} {q.required && <span className="text-red-400">*</span>}
            </p>
            {q.question_type === 'single' && (
              <div className="space-y-1.5">
                {q.options.map((o) => (
                  <label key={o} className={cx('flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition-colors',
                    answers[q.id] === o ? 'border-slate-900 bg-slate-50 font-semibold' : 'border-slate-200 hover:border-slate-300')}>
                    <input type="radio" name={q.id} checked={answers[q.id] === o} onChange={() => setAnswer(q.id, o)} className="accent-slate-900" />
                    {o}
                  </label>
                ))}
              </div>
            )}
            {q.question_type === 'multi' && (
              <div className="space-y-1.5">
                {q.options.map((o) => {
                  const cur = (answers[q.id] as string[] | undefined) ?? [];
                  return (
                    <label key={o} className={cx('flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition-colors',
                      cur.includes(o) ? 'border-slate-900 bg-slate-50 font-semibold' : 'border-slate-200 hover:border-slate-300')}>
                      <input type="checkbox" checked={cur.includes(o)} onChange={() => toggleMulti(q.id, o)} className="accent-slate-900" />
                      {o}
                    </label>
                  );
                })}
              </div>
            )}
            {q.question_type === 'yesno' && (
              <div className="flex gap-2">
                {q.options.map((o) => (
                  <button key={o} type="button" onClick={() => setAnswer(q.id, o)}
                    className={cx('flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold capitalize transition-colors',
                      answers[q.id] === o ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600 hover:border-slate-300')}>
                    {o === 'not_sure' ? 'Not sure' : o}
                  </button>
                ))}
              </div>
            )}
            {q.question_type === 'rating' && (
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => setAnswer(q.id, n)}
                    className={cx('flex-1 rounded-xl border px-3 py-2.5 text-sm font-bold transition-colors',
                      answers[q.id] === n ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600 hover:border-slate-300')}>
                    {n} ★
                  </button>
                ))}
              </div>
            )}
            {q.question_type === 'text' && (
              <Textarea rows={3} value={(answers[q.id] as string) ?? ''} onChange={(e) => setAnswer(q.id, e.target.value)}
                placeholder="Your feedback (optional unless marked required)…" maxLength={2000} />
            )}
          </CardBody>
        </Card>
      ))}

      <Button className="w-full" loading={busy} onClick={submit}>Submit responses</Button>
    </div>
  );
}
