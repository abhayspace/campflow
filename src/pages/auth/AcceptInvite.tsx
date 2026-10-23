import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../../components/AuthLayout';
import { Button, Card, CardBody, Field, Input, Spinner } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { callFunction } from '../../lib/api';
import { errorMessage } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';

type Phase = 'loading' | 'set-password' | 'no-session' | 'no-invite' | 'done';

/**
 * Handles two flows:
 *  - /auth/accept-invite: landed from a Supabase invite email (session exists)
 *  - /auth/complete-setup: signed-in user with no profile yet
 * In both cases we try accept-invitation; when no invitation exists we send
 * the user to the institution-code join flow.
 */
export default function AcceptInvite() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [phase, setPhase] = useState<Phase>('loading');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const run = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setPhase('no-session');
        return;
      }
      try {
        const res = await callFunction<{ status: string; role: string; profile_created?: boolean }>(
          'accept-invitation',
        );
        if (res.status === 'active' && res.profile_created === false) {
          // Profile already exists — go straight to the dashboard.
          const dest = res.role === 'admin' ? '/admin' : res.role === 'teacher' ? '/staff' : '/student';
          navigate(dest, { replace: true });
          return;
        }
        if (res.status === 'active') {
          setPhase('set-password');
        }
      } catch (e) {
        const msg = errorMessage(e);
        if (msg.includes('no pending invitation')) setPhase('no-invite');
        else {
          setError(msg);
          setPhase('no-invite');
        }
      }
    };
    void run();
  }, []);

  const finish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirm) return setError('Passwords do not match.');
    setLoading(true);
    setError(null);
    try {
      await supabase.auth.updateUser({ password });
      await refresh();
      setPhase('done');
      setTimeout(() => {
        supabase.auth.getSession().then(async ({ data }) => {
          const { data: p } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', data.session?.user.id ?? '')
            .maybeSingle();
          navigate(p?.role === 'teacher' ? '/staff' : p?.role === 'admin' ? '/admin' : '/student', {
            replace: true,
          });
        });
      }, 800);
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Set up your account" subtitle="Finish activating your campus account.">
      {phase === 'loading' && (
        <div className="flex justify-center py-10"><Spinner className="h-8 w-8 text-brand-600" /></div>
      )}

      {phase === 'no-session' && (
        <Card>
          <CardBody className="space-y-3">
            <p className="text-sm text-slate-600">
              This invitation link has expired or was already used. Sign in with the email that was invited, or ask
              your administrator to resend the invitation.
            </p>
            <Link to="/signin"><Button className="w-full">Sign in</Button></Link>
          </CardBody>
        </Card>
      )}

      {phase === 'no-invite' && (
        <Card>
          <CardBody className="space-y-3">
            {error && <p className="text-sm text-red-600">{error}</p>}
            <p className="text-sm text-slate-600">
              No pending invitation was found for this account. If your administrator gave you an institution code,
              you can request to join instead.
            </p>
            <Link to="/join"><Button className="w-full" variant="secondary">Join with institution code</Button></Link>
          </CardBody>
        </Card>
      )}

      {phase === 'set-password' && (
        <form onSubmit={finish} className="space-y-4">
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Invitation accepted. Choose a password to finish setting up your account.
          </p>
          <Field label="Password" htmlFor="pw" required hint="At least 8 characters">
            <Input id="pw" type="password" autoComplete="new-password" value={password}
              onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label="Confirm password" htmlFor="pw2" required>
            <Input id="pw2" type="password" autoComplete="new-password" value={confirm}
              onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          <Button type="submit" loading={loading} className="w-full">Activate account</Button>
        </form>
      )}

      {phase === 'done' && (
        <p className="text-sm text-slate-600">All set — redirecting you to your dashboard…</p>
      )}
    </AuthLayout>
  );
}
