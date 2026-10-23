import { Link, useSearchParams } from 'react-router-dom';
import AuthLayout from '../../components/AuthLayout';
import { Button, Card, CardBody } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useState } from 'react';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const email = params.get('email') ?? '';
  const [resent, setResent] = useState(false);

  const resend = async () => {
    if (!email) return;
    await supabase.auth.resend({ type: 'signup', email }).catch(() => {});
    setResent(true);
  };

  return (
    <AuthLayout title="Verify your email" subtitle="We sent you a confirmation link.">
      <Card>
        <CardBody className="space-y-4">
          <p className="text-sm text-slate-600">
            {email ? (
              <>A verification link was sent to <strong>{email}</strong>. </>
            ) : (
              'A verification link was sent to your email. '
            )}
            Open it to activate your account, then sign in.
          </p>
          <div className="flex gap-3">
            <Link to="/signin" className="flex-1"><Button className="w-full">Go to sign in</Button></Link>
            {email && (
              <Button variant="secondary" onClick={resend} disabled={resent}>
                {resent ? 'Sent ✓' : 'Resend'}
              </Button>
            )}
          </div>
        </CardBody>
      </Card>
    </AuthLayout>
  );
}
