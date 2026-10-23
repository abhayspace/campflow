import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AuthLayout from '../../components/AuthLayout';
import { Button, Card, CardBody, Field, Input, Select } from '../../components/ui';
import { callFunction } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { cx, errorMessage } from '../../lib/utils';

const TYPES = [
  { value: 'school', label: 'School' },
  { value: 'college', label: 'College' },
  { value: 'university', label: 'University' },
  { value: 'institute', label: 'Institute' },
  { value: 'other', label: 'Other' },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Form {
  institution_name: string;
  institution_type: string;
  official_email: string;
  address: string;
  admin_full_name: string;
  admin_email: string;
  password: string;
  confirm: string;
  terms: boolean;
}

export default function RegisterInstitution() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>({
    institution_name: '', institution_type: '', official_email: '', address: '',
    admin_full_name: '', admin_email: '', password: '', confirm: '', terms: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<{ code: string; channel: string } | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const set = (k: keyof Form, v: string | boolean) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  const validate = (s: number): boolean => {
    const e: Record<string, string> = {};
    if (s === 0) {
      if (form.institution_name.trim().length < 3) e.institution_name = 'At least 3 characters.';
      if (!form.institution_type) e.institution_type = 'Select a type.';
      if (!EMAIL_RE.test(form.official_email)) e.official_email = 'Enter a valid official email.';
      if (form.address.trim().length < 5) e.address = 'Enter the institution address.';
    } else {
      if (form.admin_full_name.trim().length < 2) e.admin_full_name = 'Enter the administrator name.';
      if (!EMAIL_RE.test(form.admin_email)) e.admin_email = 'Enter a valid email.';
      if (form.password.length < 8) e.password = 'At least 8 characters.';
      if (form.confirm !== form.password) e.confirm = 'Passwords do not match.';
      if (!form.terms) e.terms = 'You must accept the terms.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    if (!validate(1)) return;
    setLoading(true);
    setServerError(null);
    try {
      const res = await callFunction<{
        institution: { code: string };
        verification_channel: string;
      }>('register-institution', {
        institution_name: form.institution_name.trim(),
        institution_type: form.institution_type,
        official_email: form.official_email.trim().toLowerCase(),
        address: form.address.trim(),
        admin_full_name: form.admin_full_name.trim(),
        admin_email: form.admin_email.trim().toLowerCase(),
        password: form.password,
        terms_accepted: form.terms,
      });

      // If the function fell back to Supabase's own mailer, trigger the
      // confirmation email for the freshly-created unconfirmed account.
      if (res.verification_channel === 'supabase') {
        await supabase.auth.resend({ type: 'signup', email: form.admin_email.trim().toLowerCase() }).catch(() => {});
      }
      setDone({ code: res.institution.code, channel: res.verification_channel });
    } catch (err) {
      setServerError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const steps = useMemo(() => ['Institution', 'Administrator', 'Done'], []);

  if (done) {
    return (
      <AuthLayout title="Check your inbox" subtitle="Your institution is registered — one last step.">
        <Card>
          <CardBody className="space-y-4">
            <p className="text-sm text-slate-600">
              We sent a verification link to <strong>{form.admin_email}</strong>. Click it to activate{' '}
              <strong>{form.institution_name}</strong>, then sign in to finish setting up your campus.
            </p>
            <div className="rounded-lg bg-brand-50 px-4 py-3 text-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-brand-700">Institution code</p>
              <p className="mt-1 font-mono text-lg font-bold text-brand-900">{done.code}</p>
              <p className="mt-1 text-xs text-slate-500">
                Share this code only with people you intend to invite — it identifies your institution but never
                grants access by itself.
              </p>
            </div>
            <Link to="/signin"><Button className="w-full">Go to sign in</Button></Link>
          </CardBody>
        </Card>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Register your institution"
      subtitle="Create a private workspace for your campus."
      footer={
        <>Already registered? <Link to="/signin" className="font-medium text-brand-700 hover:underline">Sign in</Link></>
      }
    >
      {/* Stepper */}
      <ol className="mb-7 flex items-center gap-2">
        {steps.map((label, i) => (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={cx(
                'flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold',
                i < step ? 'bg-accent-500 text-white' : i === step ? 'bg-brand-700 text-white' : 'bg-slate-200 text-slate-500',
              )}
            >
              {i + 1}
            </span>
            <span className={cx('text-xs font-medium', i === step ? 'text-slate-800' : 'text-slate-400')}>{label}</span>
            {i < steps.length - 1 && <span className="h-px flex-1 bg-slate-200" />}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="space-y-4">
          <Field label="Institution name" htmlFor="iname" required error={errors.institution_name}>
            <Input id="iname" invalid={!!errors.institution_name} value={form.institution_name}
              onChange={(e) => set('institution_name', e.target.value)} placeholder="Northwood University" />
          </Field>
          <Field label="Institution type" htmlFor="itype" required error={errors.institution_type}>
            <Select id="itype" invalid={!!errors.institution_type} value={form.institution_type}
              onChange={(e) => set('institution_type', e.target.value)}>
              <option value="">Select…</option>
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </Field>
          <Field label="Official institution email" htmlFor="oemail" required error={errors.official_email}>
            <Input id="oemail" type="email" invalid={!!errors.official_email} value={form.official_email}
              onChange={(e) => set('official_email', e.target.value)} placeholder="office@institution.edu" />
          </Field>
          <Field label="Address" htmlFor="addr" required error={errors.address}>
            <Input id="addr" invalid={!!errors.address} value={form.address}
              onChange={(e) => set('address', e.target.value)} placeholder="12 Campus Road, Springfield" />
          </Field>
          <Button className="w-full" onClick={() => validate(0) && setStep(1)}>Continue</Button>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <Field label="Administrator full name" htmlFor="aname" required error={errors.admin_full_name}>
            <Input id="aname" invalid={!!errors.admin_full_name} value={form.admin_full_name}
              onChange={(e) => set('admin_full_name', e.target.value)} placeholder="Dr. Priya Nair" />
          </Field>
          <Field label="Administrator email" htmlFor="aemail" required error={errors.admin_email}>
            <Input id="aemail" type="email" invalid={!!errors.admin_email} value={form.admin_email}
              onChange={(e) => set('admin_email', e.target.value)} placeholder="admin@institution.edu" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Password" htmlFor="pw" required error={errors.password} hint="Min. 8 characters">
              <Input id="pw" type="password" autoComplete="new-password" invalid={!!errors.password}
                value={form.password} onChange={(e) => set('password', e.target.value)} />
            </Field>
            <Field label="Confirm password" htmlFor="pw2" required error={errors.confirm}>
              <Input id="pw2" type="password" autoComplete="new-password" invalid={!!errors.confirm}
                value={form.confirm} onChange={(e) => set('confirm', e.target.value)} />
            </Field>
          </div>
          <label className="flex items-start gap-2 text-sm text-slate-600">
            <input
              type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              checked={form.terms} onChange={(e) => set('terms', e.target.checked)}
            />
            <span>I agree to the terms of service and privacy policy.</span>
          </label>
          {errors.terms && <p className="text-xs text-red-600">{errors.terms}</p>}
          {serverError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {serverError}
            </p>
          )}
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setStep(0)}>Back</Button>
            <Button className="flex-1" loading={loading} onClick={submit}>Create institution</Button>
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
