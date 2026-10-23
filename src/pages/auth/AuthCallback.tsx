import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Spinner } from '../../components/ui';

/**
 * Landing target for Supabase Auth email links (signup verification,
 * magic links). Waits for the session to materialize, then routes by state.
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const route = async () => {
      for (let i = 0; i < 20 && !cancelled; i++) {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', data.session.user.id)
            .maybeSingle();
          if (!profile) {
            navigate('/auth/complete-setup', { replace: true });
          } else {
            navigate(profile.role === 'admin' ? '/admin' : profile.role === 'teacher' ? '/staff' : '/student', {
              replace: true,
            });
          }
          return;
        }
        await new Promise((r) => setTimeout(r, 300));
      }
      if (!cancelled) setFailed(true);
    };
    void route();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50">
      {failed ? (
        <p className="max-w-sm text-center text-sm text-slate-600">
          We couldn't complete sign-in from that link — it may have expired.{' '}
          <a href="/signin" className="text-brand-700 underline">Sign in</a> or request a new email.
        </p>
      ) : (
        <>
          <Spinner className="h-8 w-8 text-brand-600" />
          <p className="text-sm text-slate-500">Verifying your account…</p>
        </>
      )}
    </div>
  );
}
