import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { supabase } from '../../lib/supabase';
import { callFunction } from '../../lib/api';
import { Badge, Button, Card, CardBody, CardHeader, Input, PageHeader, TableSkeleton } from '../../components/ui';
import { errorMessage, formatDateTime } from '../../lib/utils';
import type { RequestCategory } from '../../lib/types';

interface Delivery {
  id: string;
  recipient_email: string;
  subject: string;
  status: string;
  error: string | null;
  attempts: number;
  created_at: string;
  sent_at: string | null;
}

export default function AdminSettings() {
  const { institution } = useAuth();
  const { toast } = useToast();
  const [deliveries, setDeliveries] = useState<Delivery[] | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reqCats, setReqCats] = useState<RequestCategory[]>([]);
  const [newCat, setNewCat] = useState('');
  const [catBusy, setCatBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('email_deliveries')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30);
    setDeliveries(data ?? []);
    const { data: rc } = await supabase.from('request_categories').select('*').order('name');
    setReqCats((rc ?? []) as RequestCategory[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const addCategory = async () => {
    if (newCat.trim().length < 2 || catBusy) return;
    setCatBusy(true);
    const { error } = await supabase.from('request_categories')
      .insert({ institution_id: institution!.id, name: newCat.trim() });
    if (error) toast(errorMessage(error), 'error');
    else { setNewCat(''); await load(); }
    setCatBusy(false);
  };

  const toggleCategory = async (rc: RequestCategory) => {
    const { error } = await supabase.from('request_categories')
      .update({ is_active: !rc.is_active }).eq('id', rc.id);
    if (error) toast(errorMessage(error), 'error');
    await load();
  };

  const retry = async () => {
    setRetrying(true);
    try {
      const res = await callFunction<{ retried: number; attempted: number }>('retry-email-deliveries');
      toast(`Retried ${res.attempted} deliveries (${res.retried} sent)`, res.attempted ? 'success' : 'info');
      await load();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setRetrying(false);
    }
  };

  const copyCode = () => {
    if (institution?.institution_code) {
      navigator.clipboard.writeText(institution.institution_code).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Institution settings" />

      <Card>
        <CardHeader title="Institution" />
        <CardBody>
          {!institution ? <TableSkeleton rows={3} /> : (
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-xs text-slate-400">Name</dt>
                <dd className="font-medium text-slate-800">{institution.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Type</dt>
                <dd className="capitalize text-slate-800">{institution.institution_type}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Official email</dt>
                <dd className="text-slate-800">{institution.official_email}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Status</dt>
                <dd>
                  <Badge className={institution.status === 'active'
                    ? 'bg-emerald-100 text-emerald-700 ring-emerald-200'
                    : 'bg-amber-100 text-amber-700 ring-amber-200'}>
                    {institution.status}
                  </Badge>
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-slate-400">Address</dt>
                <dd className="text-slate-800">{institution.address}</dd>
              </div>
              <div className="col-span-2 flex items-center gap-3 rounded-lg bg-slate-50 px-4 py-3">
                <div className="flex-1">
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Institution code</dt>
                  <dd className="font-mono text-lg font-bold text-brand-800">{institution.institution_code}</dd>
                </div>
                <Button size="sm" variant="secondary" onClick={copyCode}>{copied ? 'Copied ✓' : 'Copy'}</Button>
              </div>
              <p className="col-span-2 text-xs text-slate-400">
                People with this code can request to join — requests require admin approval, so the code alone
                never grants access.
              </p>
            </dl>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Request categories"
          subtitle="Extra categories students can tag on requests — the four complaint categories are fixed." />
        <CardBody className="space-y-3">
          {reqCats.length === 0 && <p className="text-sm text-slate-400">No request categories yet — add some so students can classify proposals (e.g. Facilities, Amenities, Policies).</p>}
          {reqCats.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2.5">
              <span className="text-sm font-semibold text-slate-700">{r.name}</span>
              <div className="flex items-center gap-2">
                <Badge className={r.is_active ? 'bg-emerald-100 text-emerald-700 ring-emerald-200' : 'bg-slate-100 text-slate-400 ring-slate-200'}>
                  {r.is_active ? 'active' : 'disabled'}
                </Badge>
                <button className="text-xs font-semibold text-slate-400 hover:text-slate-700" onClick={() => toggleCategory(r)}>
                  {r.is_active ? 'Disable' : 'Enable'}
                </button>
              </div>
            </div>
          ))}
          <div className="flex gap-2">
            <Input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="New category name…"
              onKeyDown={(e) => { if (e.key === 'Enter') void addCategory(); }} />
            <Button variant="secondary" loading={catBusy} disabled={newCat.trim().length < 2} onClick={addCategory}>Add</Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Email delivery log"
          subtitle="Recent transactional emails sent for this institution."
          action={<Button size="sm" variant="secondary" loading={retrying} onClick={retry}>Retry failed</Button>}
        />
        <CardBody>
          {!deliveries ? <TableSkeleton rows={3} /> : deliveries.length === 0 ? (
            <p className="text-sm text-slate-500">
              No emails sent yet. If notifications show <em>skipped</em>, configure{' '}
              <code className="rounded bg-slate-100 px-1">RESEND_API_KEY</code> as an edge-function secret (see README).
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-left uppercase tracking-wide text-slate-400">
                    <th className="pb-2 pr-3 font-medium">To</th>
                    <th className="pb-2 pr-3 font-medium">Subject</th>
                    <th className="pb-2 pr-3 font-medium">Status</th>
                    <th className="pb-2 font-medium">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {deliveries.map((d) => (
                    <tr key={d.id}>
                      <td className="py-2 pr-3 text-slate-600">{d.recipient_email}</td>
                      <td className="max-w-48 truncate py-2 pr-3 text-slate-600" title={d.subject}>{d.subject}</td>
                      <td className="py-2 pr-3">
                        <Badge className={
                          d.status === 'sent' ? 'bg-emerald-100 text-emerald-700 ring-emerald-200'
                          : d.status === 'failed' ? 'bg-red-100 text-red-700 ring-red-200'
                          : 'bg-slate-100 text-slate-500 ring-slate-200'
                        }>
                          {d.status}{d.error ? ` · ${d.error.slice(0, 40)}` : ''}
                        </Badge>
                      </td>
                      <td className="py-2 text-slate-400">{formatDateTime(d.sent_at ?? d.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
