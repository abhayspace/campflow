import { Link } from 'react-router-dom';
import AuthLayout from '../../components/AuthLayout';
import { Button, Card, CardBody } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';

const COPY: Record<string, { icon: string; title: string; body: string }> = {
  pending: {
    icon: '⏳',
    title: 'Activation pending',
    body: 'Your institution is registered but not yet active. Verify the administrator email to activate it, then sign in again.',
  },
  unauthorized: {
    icon: '⛔',
    title: 'Not authorized',
    body: 'Your account does not have permission to view that page.',
  },
  deactivated: {
    icon: '🚫',
    title: 'Account deactivated',
    body: 'This account has been deactivated by your institution administrator. Contact them if you believe this is a mistake.',
  },
  notfound: {
    icon: '🧭',
    title: 'Page not found',
    body: 'The page you are looking for does not exist.',
  },
};

export default function StatusPage({ kind }: { kind: keyof typeof COPY }) {
  const c = COPY[kind] ?? COPY.notfound;
  const { signOut, session } = useAuth();
  return (
    <AuthLayout title={c.title}>
      <Card>
        <CardBody className="space-y-4 text-center">
          <div className="text-4xl">{c.icon}</div>
          <p className="text-sm text-slate-600">{c.body}</p>
          <div className="flex justify-center gap-3">
            {session ? (
              <Button variant="secondary" onClick={signOut}>Sign out</Button>
            ) : (
              <Link to="/signin"><Button>Sign in</Button></Link>
            )}
            <Link to="/"><Button variant="ghost">Home</Button></Link>
          </div>
        </CardBody>
      </Card>
    </AuthLayout>
  );
}
