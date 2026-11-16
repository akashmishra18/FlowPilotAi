import { FormEvent, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Alert, Button, Field, Input, PasswordInput } from '@/components/ui';
import AuthShell from '@/components/AuthShell';
import { useAuthStore } from '@/store/authStore';
import { loginRequest } from '@/services/authApi';
import { parseApiError } from '@/services/errorHelpers';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const user = useAuthStore((s) => s.user);
  const setSession = useAuthStore((s) => s.setSession);
  const navigate = useNavigate();
  const location = useLocation();
  const fromState = (location.state as { from?: { pathname?: string; search?: string } } | null)?.from;
  const from = fromState?.pathname ? `${fromState.pathname}${fromState.search ?? ''}` : '/dashboard';

  if (user) return <Navigate to={from} replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const local: Record<string, string> = {};
    if (!email.trim()) local.email = 'Enter your email address.';
    if (!password) local.password = 'Enter your password.';
    setFieldErrors(local);
    if (Object.keys(local).length > 0) return;

    setIsSubmitting(true);
    try {
      const { user: signedIn, accessToken } = await loginRequest({ email: email.trim(), password });
      setSession(signedIn, accessToken);
      navigate(from, { replace: true });
    } catch (err) {
      // Only ever a safe, user-facing message — never a raw error object or stack trace.
      const parsed = parseApiError(err, 'Could not sign in. Please try again.');
      setFieldErrors(parsed.status === 422 ? parsed.fieldErrors : {});
      setError(parsed.status === 422 ? 'Please check the highlighted fields.' : parsed.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Welcome back — enter your details to continue."
      footer={
        <>
          Don&apos;t have an account?{' '}
          <Link to="/register" className="font-medium text-brand-700 hover:text-brand-800">
            Create one
          </Link>
        </>
      }
    >
      {error && (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      )}
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <Field label="Email" error={fieldErrors.email}>
          {(c) => <Input {...c} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@studio.com" />}
        </Field>
        <Field label="Password" error={fieldErrors.password}>
          {(c) => <PasswordInput {...c} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <Button type="submit" variant="primary" isLoading={isSubmitting} className="w-full">
          Sign in
        </Button>
      </form>
    </AuthShell>
  );
}
