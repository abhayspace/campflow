import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { supabase } from '../../lib/supabase';
import type { Department, RoutingRule } from '../../lib/types';
import { CATEGORIES } from '../../lib/types';
import { Badge, Card, CardBody, PageHeader, Select, TableSkeleton } from '../../components/ui';
import { errorMessage } from '../../lib/utils';

export default function AdminRouting() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [rules, setRules] = useState<RoutingRule[] | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data: r }, { data: d }] = await Promise.all([
      supabase.from('department_routing_rules').select('*, department:departments(name, is_active)'),
      supabase.from('departments').select('*').eq('is_active', true).order('name'),
    ]);
    setRules((r ?? []) as unknown as RoutingRule[]);
    setDepartments(d ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setRule = async (category: string, departmentId: string) => {
    if (!profile) return;
    setBusy(true);
    try {
      const existing = (rules ?? []).find((r) => r.category === category);
      if (!departmentId) {
        if (existing) {
          const { error } = await supabase.from('department_routing_rules').delete().eq('id', existing.id);
          if (error) throw error;
        }
      } else if (existing) {
        const { error } = await supabase
          .from('department_routing_rules')
          .update({ department_id: departmentId, is_active: true })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('department_routing_rules').insert({
          institution_id: profile.institution_id,
          category,
          department_id: departmentId,
        });
        if (error) throw error;
      }
      toast('Routing updated', 'success');
      await load();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!rules) return <TableSkeleton />;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Routing rules"
        subtitle="Choose which department receives each complaint category. New complaints are routed automatically."
      />
      <Card>
        <CardBody className="divide-y divide-slate-100">
          {CATEGORIES.map((c) => {
            const rule = rules.find((r) => r.category === c.value);
            return (
              <div key={c.value} className="flex flex-wrap items-center gap-4 py-4">
                <div className="min-w-40 flex-1">
                  <p className="font-medium text-slate-800">{c.label}</p>
                </div>
                {rule && !rule.is_active && <Badge className="bg-slate-100 text-slate-500 ring-slate-200">disabled</Badge>}
                <Select
                  className="w-64" disabled={busy}
                  value={rule?.department_id ?? ''}
                  onChange={(e) => setRule(c.value, e.target.value)}
                  aria-label={`Route ${c.label} to`}
                >
                  <option value="">No routing — manual triage</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </Select>
              </div>
            );
          })}
          {departments.length === 0 && (
            <p className="py-4 text-sm text-amber-600">
              Create at least one active department before configuring routing.
            </p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
