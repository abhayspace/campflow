import { useEffect, useState } from 'react';
import { callFunction } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { Button, Card, EmptyState, PageHeader } from '../../components/ui';

export default function QuietSignals() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from('quiet_signals').select('*').order('created_at', { ascending: false }).limit(40);
    setRows(data ?? []);
  }

  useEffect(() => { void load(); }, []);

  async function refresh() {
    const { data, error } = await supabase.rpc('refresh_quiet_signals');
    setMessage(error ? error.message : `Scan updated ${data ?? 0} pattern row(s). An increase is not a confirmed fault.`);
    await load();
  }

  async function review(id: string, reviewStatus: string) {
    await callFunction('campus-upgrade', { action: 'signal_review', id, review: reviewStatus });
    await load();
  }

  if (!rows) return null;
  return (
    <div className="space-y-5">
      <PageHeader title="Quiet Signals" subtitle="Places where reports rose against the previous 14 days. This does not predict an emergency or confirm a cause. Safety tickets still escalate on their own." />
      <Button size="sm" onClick={() => void refresh()}>Scan the last 14 days</Button>
      {message && <p className="text-sm text-slate-600">{message}</p>}
      {rows.length === 0 && <EmptyState title="No patterns stored" message="Run a scan. A pattern is saved only when the count rule is met." />}
      <ul className="space-y-2">
        {rows.map((row) => (
          <Card key={row.id} className="px-4 py-3">
            <p className="text-sm font-semibold">{row.location_key} · {row.category}</p>
            <p className="text-xs text-slate-500">{row.report_count} reports in this window, {row.baseline_count} in the previous 14 days. {row.window_start} to {row.window_end}.</p>
            <p className="mt-1 text-xs text-slate-600">{row.reason}</p>
            <p className="text-xs text-slate-400">Review: {row.review_status}</p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => void review(row.id, 'confirmed')}>Worth investigating</Button>
              <Button size="sm" variant="ghost" onClick={() => void review(row.id, 'dismissed')}>Dismiss</Button>
            </div>
          </Card>
        ))}
      </ul>
    </div>
  );
}
