import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { supabase } from '../../lib/supabase';
import { Button, Card, CardBody, CardHeader, Field, Input, PageHeader } from '../../components/ui';
import { errorMessage } from '../../lib/utils';

export default function ProfilePage() {
  const { profile, institution, refresh } = useAuth();
  const { toast } = useToast();
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [busy, setBusy] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);

  const save = async () => {
    if (!profile || fullName.trim().length < 2) return;
    setBusy(true);
    const { error } = await supabase.from('profiles').update({ full_name: fullName.trim() }).eq('id', profile.id);
    setBusy(false);
    if (error) toast(errorMessage(error), 'error');
    else {
      toast('Profile updated', 'success');
      await refresh();
    }
  };

  const sendReset = async () => {
    if (!profile) return;
    setPwBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(profile.email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    setPwBusy(false);
    if (error) toast(error.message, 'error');
    else toast('Password reset email sent', 'success');
  };

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader title="Profile settings" />
      <Card>
        <CardHeader title="Your details" />
        <CardBody className="space-y-4">
          <Field label="Full name">
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </Field>
          <Field label="Email">
            <Input value={profile?.email ?? ''} disabled />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Role"><Input value={profile?.role ?? ''} disabled className="capitalize" /></Field>
            <Field label={profile?.role === 'student' ? 'Student ID' : 'Staff ID'}>
              <Input value={profile?.identifier ?? '—'} disabled />
            </Field>
          </div>
          <Field label="Institution">
            <Input value={institution?.name ?? ''} disabled />
          </Field>
          <Button onClick={save} loading={busy} disabled={fullName.trim() === profile?.full_name}>Save changes</Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Password" subtitle="Change your password via a secure email link." />
        <CardBody>
          <Button variant="secondary" onClick={sendReset} loading={pwBusy}>Email me a reset link</Button>
        </CardBody>
      </Card>
    </div>
  );
}
