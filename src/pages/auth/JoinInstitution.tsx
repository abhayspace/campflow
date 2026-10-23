import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AuthLayout from '../../components/AuthLayout';
import { Button, Card, CardBody, Field, Input, Select } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { callFunction } from '../../lib/api';
import { errorMessage } from '../../lib/utils';

/**
 * Join with an institution code:
 *  1. Create an account (email + password) — verification email sent.
 *  2. After verifying, enter the institution code → creates a join request.
 *  3. An institution admin approves → membership granted.
 * The code alone never grants access.
 */
export default function JoinInstitution() {
  const [stage, setStage] = useState<'account' | 'code' | 'pending'>('account');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [code, setCode] = useState('');
  const [role, setRole] = useState<'student' | 'teacher'>('student');
  const [identifier, setIdentifier] = useState('');
  const [institutionName, setInstitutionName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [needsVerify, setNeedsVerify] = useState(false);

  // If already signed in without a profile, jump to the code step.
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        const { data: p } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', data.session.user.id)
          .maybeSingle();
        if (!p) setStage('code');
      }
    });
  }, []);

  const createAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (fullName.trim().length < 2) return setError('Enter your full name.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    setLoading(true);
    try {
      const { data, error: err } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (err) return setError(err.message);
      if (!data.session) {
        setNeedsVerify(true);
      } else {
        setStage('code');
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await callFunction<{ institution: { name: string } }>('join-institution', {
        institution_code: code.trim(),
        requested_role: role,
        full_name: fullName.trim() || 'Member',
        identifier: identifier.trim() || null,
      });
      setInstitutionName(res.institution.name);
      setStage('pending');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (needsVerify) {
    return (
      <AuthLayout title="Verify your email" subtitle="One more step before you can join.">
        <Card>
          <CardBody className="space-y-3">
            <p className="text-sm text-slate-600">
              We sent a verification link to <strong>{email}</strong>. After verifying, come back here and enter
              your institution code.
            </p>
            <Button variant="secondary" className="w-full" onClick={() => { setNeedsVerify(false); setStage('code'); }}>
              I've verified — continue
            </Button>
          </CardBody>
        </Card>
      </AuthLayout>
    );
  }

  if (stage === 'pending') {
    return (
      <AuthLayout title="Request sent" subtitle="Your join request is awaiting approval.">
        <Card>
          <CardBody className="space-y-3">
            <p className="text-sm text-slate-600">
              Your request to join <strong>{institutionName}</strong> has been sent to the institution's
              administrator. You'll be able to sign in to your dashboard once it's approved.
            </p>
            <Link to="/signin"><Button className="w-full">Back to sign in</Button></Link>
          </CardBody>
        </Card>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Join an institution"
      subtitle="Create your account, then join with the code your administrator shared."
      footer={<>Already have an account? <Link to="/signin" className="font-medium text-brand-700 hover:underline">Sign in</Link></>}
    >
      {stage === 'account' ? (
        <form onSubmit={createAccount} className="space-y-4">
          <Field label="Full name" htmlFor="fn" required>
            <Input id="fn" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Asha Verma" />
          </Field>
          <Field label="Email" htmlFor="em" required>
            <Input id="em" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Password" htmlFor="pw" required hint="At least 8 characters">
            <Input id="pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          <Button type="submit" loading={loading} className="w-full">Create account</Button>
        </form>
      ) : (
        <form onSubmit={submitCode} className="space-y-4">
          <Field label="Institution code" htmlFor="code" required hint="e.g. NOR4821 — from your administrator">
            <Input id="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="font-mono uppercase" placeholder="ABC1234" />
          </Field>
          <Field label="I am joining as" htmlFor="role" required>
            <Select id="role" value={role} onChange={(e) => setRole(e.target.value as 'student' | 'teacher')}>
              <option value="student">Student</option>
              <option value="teacher">Teacher / Staff</option>
            </Select>
          </Field>
          <Field label={role === 'student' ? 'Student ID (optional)' : 'Staff ID (optional)'} htmlFor="idn">
            <Input id="idn" value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
          </Field>
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          <Button type="submit" loading={loading} className="w-full">Request to join</Button>
        </form>
      )}
    </AuthLayout>
  );
}
