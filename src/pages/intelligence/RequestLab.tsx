import { useEffect, useState } from 'react';
import { callFunction } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Button, Card, EmptyState, PageHeader, Textarea } from '../../components/ui';

export default function RequestLab() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<any[]>([]);
  const [plans, setPlans] = useState<Map<string, any>>(new Map());
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({ approach: 'pilot', status: 'proposed', objective: '', scope: '', starts_on: '', ends_on: '', success_criteria: '', evaluation_questions: '' });

  async function load() {
    const { data } = await supabase.from('complaints').select('id, ticket_number, title, status, location').eq('submission_type', 'request').order('created_at', { ascending: false }).limit(40);
    setRequests(data ?? []);
    const { data: saved } = await supabase.from('request_plans').select('*');
    setPlans(new Map((saved ?? []).map((plan) => [plan.complaint_id, plan])));
  }

  useEffect(() => { void load(); }, []);
  const plan = selected ? plans.get(selected) : null;

  async function draft() {
    if (!selected) return;
    setMessage(null);
    try {
      await callFunction('campus-upgrade', { action: 'pilot_draft', complaint_id: selected });
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not structure this request');
    }
  }

  async function save() {
    if (!plan) return;
    setMessage(null);
    try {
      await callFunction('campus-upgrade', {
        action: 'pilot_save',
        plan_id: plan.id,
        ...plan,
        ...form,
      });
      setMessage('Plan saved. Approving a resource decision still requires an administrator.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save');
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Request Lab" subtitle="Improvement requests only. Effort is qualitative. Costs, savings, and dates are not invented." />
      {requests.length === 0 && <EmptyState title="No improvement requests" />}
      <div className="grid gap-4 lg:grid-cols-2">
        <ul className="space-y-2">
          {requests.map((request) => (
            <li key={request.id}>
              <button type="button" onClick={() => setSelected(request.id)} className="w-full rounded-2xl bg-white px-4 py-3 text-left ring-1 ring-slate-100">
                <span className="font-mono text-xs font-bold">{request.ticket_number}</span>
                <p className="text-sm font-semibold">{request.title}</p>
                <p className="text-xs text-slate-400">{plans.get(request.id)?.status ?? 'no plan yet'}</p>
              </button>
            </li>
          ))}
        </ul>
        {selected && (
          <Card className="space-y-3 p-4">
            <Button size="sm" onClick={() => void draft()}>Structure this request</Button>
            {plan && (
              <>
                <p className="text-sm text-slate-700">{plan.problem}</p>
                <p className="text-xs text-slate-500">Beneficiaries: {plan.beneficiaries}</p>
                <p className="text-xs text-slate-500">Effort: {plan.effort_note}. Missing: {plan.missing_info}</p>
                <p className="text-xs text-slate-500">Risks: {plan.risks}</p>
                <label className="block text-xs font-semibold">Approach
                  <select className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={form.approach} onChange={(event) => setForm({ ...form, approach: event.target.value })}>
                    <option value="quick_win">Quick win</option>
                    <option value="pilot">Pilot</option>
                    <option value="full">Full implementation</option>
                  </select>
                </label>
                <label className="block text-xs font-semibold">Status
                  <select className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                    {['proposed', 'approved', 'running', 'evaluated', 'deferred', 'declined'].map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </label>
                <Textarea value={form.objective} onChange={(event) => setForm({ ...form, objective: event.target.value })} placeholder="Pilot objective" />
                <Textarea value={form.scope} onChange={(event) => setForm({ ...form, scope: event.target.value })} placeholder="Scope" />
                <div className="flex gap-2">
                  <input type="date" value={form.starts_on} onChange={(event) => setForm({ ...form, starts_on: event.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  <input type="date" value={form.ends_on} onChange={(event) => setForm({ ...form, ends_on: event.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                </div>
                <Textarea value={form.success_criteria} onChange={(event) => setForm({ ...form, success_criteria: event.target.value })} placeholder="Success criteria" />
                <Textarea value={form.evaluation_questions} onChange={(event) => setForm({ ...form, evaluation_questions: event.target.value })} placeholder="Evaluation questions" />
                <Button size="sm" onClick={() => void save()}>{profile?.role === 'admin' ? 'Save decision' : 'Save draft'}</Button>
              </>
            )}
            {message && <p className="text-xs text-slate-600">{message}</p>}
          </Card>
        )}
      </div>
    </div>
  );
}
