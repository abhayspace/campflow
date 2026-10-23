import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { callFunction } from '../../lib/api';
import type { Survey, SurveyAnswer, SurveyQuestion, SurveyResponse } from '../../lib/types';
import { Badge, Button, Card, CardBody, EmptyState, PageHeader, Spinner } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { errorMessage, formatDateTime, timeAgo } from '../../lib/utils';

export function SurveysList() {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [counts, setCounts] = useState<Record<string, { recipients: number; responses: number }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('surveys')
        .select('*, complaint:complaint_id(ticket_number, title)')
        .order('created_at', { ascending: false });
      const list = (data ?? []) as Survey[];
      setSurveys(list);
      const out: Record<string, { recipients: number; responses: number }> = {};
      for (const s of list) {
        const [{ count: rc }, { count: rr }] = await Promise.all([
          supabase.from('survey_recipients').select('id', { count: 'exact', head: true }).eq('survey_id', s.id),
          supabase.from('survey_responses').select('id', { count: 'exact', head: true }).eq('survey_id', s.id),
        ]);
        out[s.id] = { recipients: rc ?? 0, responses: rr ?? 0 };
      }
      setCounts(out);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="flex justify-center py-20"><Spinner className="h-8 w-8 text-brand-600" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Surveys" subtitle="Resolution checks and feedback — real responses, honest denominators."
        actions={<Link to="/surveys/new"><Button>New survey</Button></Link>} />
      {surveys.length === 0 && (
        <EmptyState title="No surveys yet"
          message="Create a survey from scratch here, or launch a resolution survey from a resolved ticket's page." />
      )}
      <div className="space-y-3">
        {surveys.map((s) => {
          const c = counts[s.id] ?? { recipients: 0, responses: 0 };
          const rate = c.recipients ? Math.round((c.responses / c.recipients) * 100) : 0;
          return (
            <Link key={s.id} to={`/surveys/${s.id}`}>
              <Card className="transition-shadow hover:shadow-md">
                <CardBody className="flex flex-wrap items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-slate-900">{s.title}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {s.complaint ? `${s.complaint.ticket_number} · ${s.complaint.title}` : 'Standalone survey'}
                      {' · '}{s.anonymous ? 'anonymous' : 'identifiable'} · created {timeAgo(s.created_at)}
                    </p>
                  </div>
                  <Badge className={s.status === 'published' ? 'bg-emerald-100 text-emerald-800 ring-emerald-200' : s.status === 'closed' ? 'bg-slate-200 text-slate-500 ring-slate-300' : 'bg-amber-100 text-amber-800 ring-amber-200'}>
                    {s.status}
                  </Badge>
                  <p className="text-xs text-slate-500">{c.responses}/{c.recipients} responses · {rate}%</p>
                </CardBody>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ============ Results ============
export function SurveyResults() {
  const { id } = useParams();
  const { toast } = useToast();
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [responses, setResponses] = useState<SurveyResponse[]>([]);
  const [answers, setAnswers] = useState<SurveyAnswer[]>([]);
  const [recipients, setRecipients] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!id) return;
    const [{ data: s }, { data: q }, { data: r }, { count: rc }] = await Promise.all([
      supabase.from('surveys').select('*, complaint:complaint_id(ticket_number, title)').eq('id', id).single(),
      supabase.from('survey_questions').select('*').eq('survey_id', id).order('ord'),
      supabase.from('survey_responses').select('*').eq('survey_id', id),
      supabase.from('survey_recipients').select('id', { count: 'exact', head: true }).eq('survey_id', id),
    ]);
    setSurvey(s as Survey);
    setQuestions((q ?? []) as SurveyQuestion[]);
    setResponses((r ?? []) as SurveyResponse[]);
    setRecipients(rc ?? 0);
    const rIds = (r ?? []).map((x: { id: string }) => x.id);
    if (rIds.length) {
      const { data: a } = await supabase.from('survey_answers').select('*').in('response_id', rIds);
      setAnswers((a ?? []) as SurveyAnswer[]);
    } else setAnswers([]);
    setLoading(false);
  };
  useEffect(() => { void load(); }, [id]);

  const publish = async () => {
    setBusy(true);
    try {
      const res = await callFunction<{ recipients: number }>('surveys', { action: 'publish', survey_id: id });
      toast(`Published — ${res.recipients} eligible student${res.recipients === 1 ? '' : 's'} notified`, 'success');
      await load();
    } catch (e) { toast(errorMessage(e), 'error'); } finally { setBusy(false); }
  };
  const close = async () => {
    setBusy(true);
    try {
      await callFunction('surveys', { action: 'close', survey_id: id });
      toast('Survey closed', 'success');
      await load();
    } catch (e) { toast(errorMessage(e), 'error'); } finally { setBusy(false); }
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner className="h-8 w-8 text-brand-600" /></div>;
  if (!survey) return <EmptyState title="Survey not found" message="It may belong to another institution." />;

  const rate = recipients ? Math.round((responses.length / recipients) * 100) : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link to="/surveys" className="text-sm font-semibold text-slate-400 hover:text-slate-700">← Surveys</Link>

      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={survey.status === 'published' ? 'bg-emerald-100 text-emerald-800 ring-emerald-200' : survey.status === 'closed' ? 'bg-slate-200 text-slate-500 ring-slate-300' : 'bg-amber-100 text-amber-800 ring-amber-200'}>
              {survey.status}
            </Badge>
            <Badge>{survey.anonymous ? 'anonymous' : 'identifiable'}</Badge>
            {survey.complaint && <Badge className="bg-slate-100 text-slate-600 ring-slate-200">{survey.complaint.ticket_number}</Badge>}
          </div>
          <h1 className="text-xl font-bold text-slate-900">{survey.title}</h1>
          {survey.description && <p className="text-sm text-slate-500">{survey.description}</p>}
          {survey.deadline && <p className="text-xs text-slate-400">Deadline: {formatDateTime(survey.deadline)}</p>}
          <div className="flex gap-2">
            {survey.status === 'draft' && <Button loading={busy} onClick={publish}>Publish & notify recipients</Button>}
            {survey.status === 'published' && <Button variant="secondary" loading={busy} onClick={close}>Close survey</Button>}
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Eligible recipients', value: recipients },
          { label: 'Responses', value: responses.length },
          { label: 'Response rate', value: `${rate}%` },
        ].map((m) => (
          <Card key={m.label}><CardBody className="text-center">
            <p className="text-2xl font-bold text-slate-900">{m.value}</p>
            <p className="text-xs text-slate-400">{m.label}</p>
          </CardBody></Card>
        ))}
      </div>

      {survey.status !== 'draft' && responses.length === 0 && (
        <Card><CardBody className="py-6 text-center text-sm text-slate-500">
          No responses yet — a survey with no answers means <em>insufficient feedback</em>, not success or failure.
        </CardBody></Card>
      )}

      {questions.map((q) => {
        const qAnswers = answers.filter((a) => a.question_id === q.id);
        const values = qAnswers.map((a) => a.value);
        const dist: Record<string, number> = {};
        for (const v of values) {
          const list = Array.isArray(v) ? v : [v];
          for (const x of list) dist[String(x)] = (dist[String(x)] ?? 0) + 1;
        }
        const ratings = values.filter((v): v is number => typeof v === 'number');
        const avg = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length) : null;
        const texts = values.filter((v): v is string => typeof v === 'string' && v.length > 3 && !q.options.includes(v as string));
        return (
          <Card key={q.id}>
            <CardBody className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-slate-900">{q.text}</p>
                <span className="text-xs text-slate-400">{q.question_type} · {qAnswers.length} answer{qAnswers.length === 1 ? '' : 's'}</span>
              </div>
              {q.question_type === 'rating' && avg !== null && (
                <p className="text-sm"><span className="text-lg font-bold text-brand-700">{avg.toFixed(1)}</span> <span className="text-slate-400">/ 5 average</span></p>
              )}
              {Object.keys(dist).length > 0 && q.question_type !== 'text' && (
                <div className="space-y-1.5">
                  {Object.entries(dist).sort((a, b) => b[1] - a[1]).map(([opt, n]) => (
                    <div key={opt} className="flex items-center gap-3">
                      <span className="w-36 truncate text-xs text-slate-600">{opt}</span>
                      <div className="h-2.5 flex-1 rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-brand-500" style={{ width: `${(n / qAnswers.length) * 100}%` }} />
                      </div>
                      <span className="w-10 text-right text-xs font-semibold text-slate-600">{n}</span>
                    </div>
                  ))}
                </div>
              )}
              {q.question_type === 'text' && texts.length > 0 && (
                <ul className="space-y-1.5">
                  {texts.slice(0, 10).map((t, i) => (
                    <li key={i} className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                      "{t}" <span className="text-[11px] text-slate-400">— {survey.anonymous ? 'anonymous' : 'respondent'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}
