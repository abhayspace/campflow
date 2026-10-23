import { useEffect, useState } from 'react';
import { callFunction } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { Button, Card, EmptyState, PageHeader, Textarea } from '../../components/ui';

export default function Policies() {
  const [rows, setRows] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState('draft');
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from('policy_documents').select('id, title, body, status, version, effective_on, review_on').order('updated_at', { ascending: false });
    setRows(data ?? []);
  }

  useEffect(() => { void load(); }, []);

  async function save() {
    setMessage(null);
    try {
      await callFunction('campus-upgrade', { action: 'policy_save', id: editing, title, body, status });
      setTitle('');
      setBody('');
      setEditing(null);
      setStatus('draft');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save');
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Institutional procedures" subtitle="Active documents can be cited by Gemini. Drafts stay with administrators. Document text cannot change permissions." />
      <Card className="space-y-3 p-4">
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Document title" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        <Textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Procedure, safety guidance, or FAQ text" />
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <Button size="sm" onClick={() => void save()}>{editing ? 'Update document' : 'Save document'}</Button>
        {message && <p className="text-xs text-red-600">{message}</p>}
      </Card>
      {rows.length === 0 && <EmptyState title="No procedures yet" />}
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.id}>
            <button type="button" className="w-full rounded-2xl bg-white px-4 py-3 text-left ring-1 ring-slate-100" onClick={() => { setEditing(row.id); setTitle(row.title); setBody(row.body); setStatus(row.status); }}>
              <span className="text-sm font-semibold">{row.title}</span>
              <span className="ml-2 text-xs text-slate-400">v{row.version} · {row.status}</span>
              <p className="mt-1 line-clamp-2 text-xs text-slate-500">{row.body}</p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
