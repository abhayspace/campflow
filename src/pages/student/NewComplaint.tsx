import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { supabase } from '../../lib/supabase';
import { callFunction } from '../../lib/api';
import { CATEGORIES } from '../../lib/types';
import type { Complaint, ComplaintCategory, Department, RequestCategory, SubmissionType, SubmissionVisibility } from '../../lib/types';
import { Button, Card, CardBody, Field, Input, PageHeader, Select, Spinner, Textarea } from '../../components/ui';
import VoiceCapture from '../../components/VoiceCapture';
import { cx, errorMessage, readFileAsBase64 } from '../../lib/utils';

interface Intake {
  ai_available: boolean;
  summary?: string;
  suggested_category?: ComplaintCategory;
  confidence?: number;
  missing_information?: string[];
  follow_up_questions?: string[];
  extracted_location?: string;
  category_reasoning?: string;
  suggested_department?: { id: string; name: string } | null;
  department_reasoning?: string;
  error?: string;
}

type Phase = 'type' | 'visibility' | 'describe' | 'analyzing' | 'review' | 'submitting' | 'done';

const STEPS = ['Type', 'Visibility', 'Details', 'Review'];

function Stepper({ phase }: { phase: Phase }) {
  const idx = phase === 'type' ? 0 : phase === 'visibility' ? 1 : phase === 'describe' || phase === 'analyzing' ? 2 : 3;
  return (
    <ol className="flex items-center gap-1.5" aria-label="Progress">
      {STEPS.map((s, i) => (
        <li key={s} className="flex items-center gap-1.5">
          <span className={cx(
            'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors',
            i < idx ? 'bg-accent-500 text-white' : i === idx ? 'bg-brand-600 text-white' : 'bg-candy-lavender text-brand-800',
          )}>{i < idx ? '✓' : i + 1}</span>
          <span className={cx('hidden text-xs font-semibold sm:block', i === idx ? 'text-slate-900' : 'text-slate-400')}>{s}</span>
          {i < STEPS.length - 1 && <span className="mx-1 h-px w-5 bg-slate-200" />}
        </li>
      ))}
    </ol>
  );
}

function ChoiceCard({ title, desc, examples, selected, onClick }: {
  title: string; desc: string; examples: string[]; selected: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cx(
        'rounded-2xl border-2 p-5 text-left transition-all',
        selected ? 'border-brand-600 bg-brand-50 shadow-md ring-2 ring-brand-200' : 'border-transparent bg-white shadow-sm ring-1 ring-slate-200 hover:ring-brand-200',
      )}
    >
      <p className="text-base font-bold text-slate-900">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{desc}</p>
      <ul className="mt-3 space-y-1">
        {examples.map((e) => <li key={e} className="text-xs text-slate-400">· {e}</li>)}
      </ul>
    </button>
  );
}

export default function NewComplaint() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const idempotencyKey = useRef(crypto.randomUUID());
  const submittedRef = useRef(false);

  const [phase, setPhase] = useState<Phase>('type');
  const [subType, setSubType] = useState<SubmissionType | null>(null);
  const [visibility, setVisibility] = useState<SubmissionVisibility | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [extraInfo, setExtraInfo] = useState('');
  const [category, setCategory] = useState<ComplaintCategory | ''>('');
  const [priority, setPriority] = useState('medium');
  const [reqCategoryId, setReqCategoryId] = useState('');
  const [preferredOutcome, setPreferredOutcome] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [ai, setAi] = useState<Intake | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Complaint | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [reqCategories, setReqCategories] = useState<RequestCategory[]>([]);
  const [deptId, setDeptId] = useState('');

  const isRequest = subType === 'request';

  useEffect(() => {
    supabase.from('departments').select('id, name').eq('is_active', true).order('name')
      .then(({ data }) => setDepartments((data ?? []) as Department[]));
    supabase.from('request_categories').select('*').eq('is_active', true).order('name')
      .then(({ data }) => setReqCategories((data ?? []) as RequestCategory[]));
  }, []);

  const valid = title.trim().length >= 4 && description.trim().length >= 10 && (isRequest || location.trim().length >= 2);

  const analyze = async () => {
    if (!valid) {
      return setError(isRequest
        ? 'Add a title and a description (10+ characters) first.'
        : 'Add a title, a description (10+ characters), and a location first.');
    }
    setError(null);
    setPhase('analyzing');
    try {
      let imageBase64: string | null = null;
      let imageMime: string | null = null;
      if (photo) {
        imageBase64 = await readFileAsBase64(photo);
        imageMime = photo.type;
      }
      const res = await callFunction<Intake>('ai-intake', {
        title: title.trim(),
        description: (isRequest && preferredOutcome.trim()
          ? `${description.trim()}\n\nThis is a request. Preferred outcome: ${preferredOutcome.trim()}`
          : description.trim()),
        location: location.trim() || 'Not specified',
        image_base64: imageBase64,
        image_mime: imageMime,
      });
      setAi(res);
      if (res.suggested_category) setCategory(res.suggested_category);
      if (!deptId && res.suggested_department?.id) setDeptId(res.suggested_department.id);
      setPhase('review');
    } catch (e) {
      // AI failure must never block manual submission.
      setAi({ ai_available: false, error: errorMessage(e) });
      setPhase('review');
    }
  };

  const submit = async () => {
    if (!category) return setError('Choose a category before submitting.');
    if (submittedRef.current) return;
    submittedRef.current = true;
    setError(null);
    setPhase('submitting');
    try {
      const fullDescription =
        extraInfo.trim().length > 0
          ? `${description.trim()}\n\nAdditional details: ${extraInfo.trim()}`
          : description.trim();

      // Upload the photo to private storage first (draft path).
      const attachments: { storage_path: string; content_type: string }[] = [];
      if (photo && profile) {
        const ext = photo.name.split('.').pop() ?? 'jpg';
        const path = `${profile.institution_id}/drafts/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('complaint-attachments')
          .upload(path, photo, { contentType: photo.type, upsert: false });
        if (upErr) throw new Error(`photo upload failed: ${upErr.message}`);
        attachments.push({ storage_path: path, content_type: photo.type });
      }

      const res = await callFunction<{ complaint: Complaint; similar_complaints: unknown[] }>(
        'submit-complaint',
        {
          idempotency_key: idempotencyKey.current,
          title: title.trim(),
          description: fullDescription,
          location: location.trim() || (isRequest ? 'Campus-wide' : ''),
          category,
          priority,
          preferred_department_id: deptId || null,
          submission_type: subType,
          visibility,
          request_category_id: reqCategoryId || null,
          preferred_outcome: preferredOutcome.trim() || null,
          ai_summary: ai?.ai_available ? ai.summary : null,
          ai_reasoning: ai?.ai_available ? ai.category_reasoning : null,
          attachments,
        },
      );
      setResult(res.complaint);
      setPhase('done');
    } catch (e) {
      submittedRef.current = false;
      setError(errorMessage(e));
      setPhase('review');
    }
  };

  if (phase === 'done' && result) {
    const noun = result.submission_type === 'request' ? 'Request' : 'Complaint';
    return (
      <div className="mx-auto max-w-lg">
        <Card>
          <CardBody className="space-y-5 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl">✓</div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{noun} submitted</h2>
              <p className="mt-1 text-sm text-slate-500">
                {result.submission_type === 'request'
                  ? 'Your request is in the review queue — you\'ll get updates as it moves through approval.'
                  : 'Your ticket has been created and routed.'}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">Reference number</p>
              <p className="mt-1 font-mono text-xl font-bold text-brand-800">{result.ticket_number}</p>
            </div>
            {result.visibility === 'campus' && (
              <p className="text-sm text-slate-500">It's visible on the community feed — other students can support it or confirm it affects them.</p>
            )}
            {result.assigned_department_id && (
              <p className="text-sm text-slate-500">It was routed to the responsible department.</p>
            )}
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => navigate('/student/tickets')}>
                My tickets
              </Button>
              <Link to={`/student/tickets/${result.id}`} className="flex-1">
                <Button className="w-full">Track it</Button>
              </Link>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Report or request" subtitle="A few quick steps — AI helps with the details." />
        <Stepper phase={phase} />
      </div>

      {/* ---- Step 1: submission type ---- */}
      {phase === 'type' && (
        <div className="space-y-4">
          <p className="text-sm font-semibold text-slate-700">What would you like to do?</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <ChoiceCard
              title="Report a complaint"
              desc="Something is broken, unsafe, or not working and needs a fix."
              examples={['Wi-Fi not working in the library', 'Water leaking in a classroom', 'Broken classroom light']}
              selected={subType === 'complaint'}
              onClick={() => { setSubType('complaint'); setPhase('visibility'); }}
            />
            <ChoiceCard
              title="Make a request"
              desc="Propose a new facility, service, or improvement for the campus."
              examples={['Additional drinking-water stations', 'Extended library hours', 'More seating in a common area']}
              selected={subType === 'request'}
              onClick={() => { setSubType('request'); setPhase('visibility'); }}
            />
          </div>
        </div>
      )}

      {/* ---- Step 2: visibility ---- */}
      {phase === 'visibility' && (
        <div className="space-y-4">
          <p className="text-sm font-semibold text-slate-700">Who is this for?</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <ChoiceCard
              title="Personal"
              desc="Private to you and the staff handling it — never appears in the community feed."
              examples={['An access or account problem', 'An individual service request', 'A sensitive or private issue']}
              selected={visibility === 'personal'}
              onClick={() => { setVisibility('personal'); setPhase('describe'); }}
            />
            <ChoiceCard
              title="Campus-wide"
              desc="Posted to the community feed — other students can support it or confirm it affects them."
              examples={['A shared facility problem', 'A proposal many students would use', 'An issue affecting a whole building']}
              selected={visibility === 'campus'}
              onClick={() => { setVisibility('campus'); setPhase('describe'); }}
            />
          </div>
          <Button variant="ghost" onClick={() => setPhase('type')}>← Back</Button>
        </div>
      )}

      {(phase === 'describe' || phase === 'analyzing') && (
        <>
          <VoiceCapture
            disabled={phase !== 'describe'}
            onUseTranscript={(text) => {
              setDescription(text);
              if (!title.trim()) {
                // First sentence as a title draft — student can edit freely.
                const first = text.split(/[.!?\n]/)[0]!.trim().slice(0, 80);
                setTitle(first.length >= 4 ? first : 'Campus issue report');
              }
            }}
          />

          <Card>
            <CardBody className="space-y-5">
              <Field label={isRequest ? 'What are you requesting?' : 'What is wrong?'} htmlFor="title" required
                hint={isRequest ? "A short headline, e.g. 'More seating in the study hall'" : "A short headline, e.g. 'Leaking pipe in washroom'"}>
                <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160}
                  placeholder={isRequest ? 'Extended library hours on weekends' : 'Broken ceiling fan'}
                  disabled={phase !== 'describe'} />
              </Field>

              <Field label={isRequest ? 'Describe the request' : 'Describe the problem'} htmlFor="desc" required
                hint={isRequest ? 'What you want, why it matters, who it helps.' : 'What happened, since when, how severe.'}>
                <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)}
                  maxLength={4000} rows={4} disabled={phase !== 'describe'}
                  placeholder={isRequest ? 'The library closes at 6pm, but many students prepare for exams in the evenings…' : 'Water is leaking steadily from the pipe under the sink…'} />
              </Field>

              <Field label={isRequest ? 'Where would it apply? (optional)' : 'Where is it?'} htmlFor="loc"
                required={!isRequest} hint="Building, floor, room, or a nearby landmark.">
                <Input id="loc" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200}
                  placeholder="Block B, 2nd floor, washroom near Room 204" disabled={phase !== 'describe'} />
              </Field>

              {isRequest && (
                <>
                  {reqCategories.length > 0 && (
                    <Field label="Request category" htmlFor="rcat" hint="Categories set by your institution.">
                      <Select id="rcat" value={reqCategoryId} onChange={(e) => setReqCategoryId(e.target.value)} disabled={phase !== 'describe'}>
                        <option value="">None / general</option>
                        {reqCategories.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </Select>
                    </Field>
                  )}
                  <Field label="Preferred outcome" htmlFor="outcome" hint="What would a successful result look like? (optional)">
                    <Textarea id="outcome" value={preferredOutcome} onChange={(e) => setPreferredOutcome(e.target.value)}
                      maxLength={1000} rows={2} disabled={phase !== 'describe'}
                      placeholder="Library open until 10pm on weekdays…" />
                  </Field>
                </>
              )}

              <Field label="Photo (optional)" htmlFor="photo" hint="A photo helps staff, but cannot by itself prove a fault. Max 4 MB.">
                <input
                  id="photo" type="file" accept="image/jpeg,image/png,image/webp,image/heic"
                  disabled={phase !== 'describe'}
                  className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    if (f && f.size > 4 * 1024 * 1024) {
                      toast('Photo must be under 4 MB', 'error');
                      return;
                    }
                    setPhoto(f);
                    setPhotoPreview(f ? URL.createObjectURL(f) : null);
                  }}
                />
                {photoPreview && (
                  <img src={photoPreview} alt="Submission preview" className="mt-3 max-h-48 rounded-lg border border-slate-200 object-cover" />
                )}
              </Field>

              {error && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>
              )}

              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => setPhase('visibility')} disabled={phase !== 'describe'}>← Back</Button>
                {phase === 'describe' && (
                  <Button onClick={analyze} disabled={!valid} className="flex-1">Analyze with AI</Button>
                )}
              </div>
              {phase === 'analyzing' && (
                <div className="flex items-center justify-center gap-3 py-4 text-sm text-slate-500">
                  <Spinner className="h-5 w-5 text-brand-600" /> AI is reading your {isRequest ? 'request' : 'report'}…
                </div>
              )}
            </CardBody>
          </Card>
        </>
      )}

      {(phase === 'review' || phase === 'submitting') && (
        <Card>
          <CardBody className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-slate-900">Review & confirm</h3>
              <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-[11px] font-bold text-white capitalize">{subType}</span>
              <span className={cx(
                'rounded-full px-2.5 py-0.5 text-[11px] font-bold',
                visibility === 'campus' ? 'bg-brand-100 text-brand-800' : 'bg-slate-100 text-slate-600',
              )}>{visibility === 'campus' ? 'Campus-wide · public feed' : 'Personal · private'}</span>
            </div>

            {ai?.ai_available ? (
              <div className="space-y-4 rounded-lg border border-accent-200 bg-accent-50/50 p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent-700">
                  <span>✦</span> AI assistant
                </div>
                {ai.summary && <p className="text-sm text-slate-700"><span className="font-medium">Summary:</span> {ai.summary}</p>}
                {ai.category_reasoning && (
                  <p className="text-sm text-slate-600"><span className="font-medium">Why this category:</span> {ai.category_reasoning}</p>
                )}
                {ai.suggested_department && (
                  <p className="text-sm text-slate-600">
                    <span className="font-medium">Routing:</span> {ai.department_reasoning}
                  </p>
                )}

                {(ai.follow_up_questions?.length || ai.missing_information?.length) ? (
                  <div className="rounded-lg bg-white/70 p-3">
                    <p className="text-sm font-medium text-slate-800">The AI suggests adding:</p>
                    <ul className="mt-1 list-inside list-disc text-sm text-slate-600">
                      {ai.follow_up_questions?.map((q, i) => <li key={i}>{q}</li>)}
                      {!ai.follow_up_questions?.length && ai.missing_information?.map((m, i) => <li key={i}>{m}</li>)}
                    </ul>
                    <Textarea
                      className="mt-3" rows={2} value={extraInfo} onChange={(e) => setExtraInfo(e.target.value)}
                      placeholder="Add any missing details here (optional)…"
                    />
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                AI analysis is unavailable right now{ai?.error ? ` (${ai.error})` : ''}. You can still submit —
                just pick the category yourself.
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={isRequest ? 'Closest operational category' : 'Category'} htmlFor="cat" required
                hint={isRequest ? 'Used for routing — your request category stays attached.' : undefined}>
                <Select id="cat" value={category} onChange={(e) => setCategory(e.target.value as ComplaintCategory)}>
                  <option value="">Select…</option>
                  {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </Select>
              </Field>
              <Field label={isRequest ? 'Importance' : 'Priority'} htmlFor="pri">
                <Select id="pri" value={priority} onChange={(e) => setPriority(e.target.value)}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </Select>
              </Field>
            </div>

            {departments.length > 0 && (
              <Field label="Send to a department" htmlFor="dept"
                hint="Optional — leave on auto and we'll route by category, or pick the team that should handle it.">
                <Select id="dept" value={deptId} onChange={(e) => setDeptId(e.target.value)}>
                  <option value="">Auto-route by category</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </Select>
              </Field>
            )}

            {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setPhase('describe')} disabled={phase === 'submitting'}>
                Edit {isRequest ? 'request' : 'report'}
              </Button>
              <Button className="flex-1" onClick={submit} loading={phase === 'submitting'} disabled={!category}>
                Submit {isRequest ? 'request' : 'complaint'}
              </Button>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
