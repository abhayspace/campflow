import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../../components/AuthLayout';
import { Button, Field, Input } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { cx, errorMessage } from '../../lib/utils';
import { useToast } from '../../context/ToastContext';

type Tab = 'student' | 'staff' | 'admin';
const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: 'student', label: 'Student', hint: 'Use the email your institution invited.' },
  { id: 'staff', label: 'Teacher / Staff', hint: 'For teachers and department staff.' },
  { id: 'admin', label: 'Administrator', hint: 'For institution administrators.' },
];

export default function SignIn() {
  const [tab, setTab] = useState<Tab>('student');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (signInErr) {
        setError(
          signInErr.message.toLowerCase().includes('email not confirmed')
            ? 'Please verify your email first — check your inbox for the verification link.'
            : 'Invalid email or password.',
        );
        return;
      }
      // The role tab is cosmetic: routing below is driven by the real profile.
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, account_status')
        .eq('id', (await supabase.auth.getUser()).data.user?.id ?? '')
        .maybeSingle();
      if (!profile) {
        navigate('/auth/complete-setup');
        return;
      }
      if (profile.account_status === 'deactivated') {
        await supabase.auth.signOut();
        setError('This account has been deactivated. Contact your administrator.');
        return;
      }
      const dest = profile.role === 'admin' ? '/admin' : profile.role === 'teacher' ? '/staff' : '/student';
      if (tab !== 'admin' && ((tab === 'student') !== (profile.role === 'student'))) {
        toast(`Signed in — redirected to your ${profile.role} dashboard.`, 'info');
      }
      navigate(dest);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to your campus workspace."
      footer={
        <>
          New institution?{' '}
          <Link to="/register" className="font-medium text-brand-700 hover:underline">Register here</Link>
          {' · '}Joining a campus?{' '}
          <Link to="/join" className="font-medium text-brand-700 hover:underline">Use a code</Link>
        </>
      }
    >
      <div className="mb-6 grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Sign in as">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cx(
              'rounded-md px-2 py-2 text-xs font-semibold transition-colors',
              tab === t.id ? 'bg-white text-brand-800 shadow-sm' : 'text-slate-500 hover:text-slate-700',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="mb-4 text-xs text-slate-400">{TABS.find((t) => t.id === tab)?.hint}</p>

      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Email" htmlFor="email" required>
          <Input
            id="email" type="email" autoComplete="email" required
            value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="you@institution.edu"
          />
        </Field>
        <Field label="Password" htmlFor="password" required>
          <Input
            id="password" type="password" autoComplete="current-password" required
            value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </Field>
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" loading={loading} className="w-full">Sign in</Button>
        <div className="text-center">
          <Link to="/forgot-password" className="text-sm text-brand-700 hover:underline">
            Forgot your password?
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
}
