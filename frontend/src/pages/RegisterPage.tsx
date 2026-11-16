import { FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Alert, Button, Field, Input, PasswordInput } from '@/components/ui';
import AuthShell from '@/components/AuthShell';
import { useAuthStore } from '@/store/authStore';
import { registerRequest } from '@/services/authApi';
import { parseApiError } from '@/services/errorHelpers';
import { toast } from '@/store/toastStore';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  if (user) return <Navigate to="/dashboard" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const local: Record<string, string> = {};
    if (!name.trim()) local.name = 'Enter your name.';
    if (!email.trim()) local.email = 'Enter your email address.';
    if (password.length < 8) local.password = 'Use at least 8 characters.';
    setFieldErrors(local);
    if (Object.keys(local).length > 0) return;

    setIsSubmitting(true);
    try {
      await registerRequest({ name: name.trim(), email: email.trim(), password });
      toast.success('Account created. You can sign in now.');
      navigate('/login', { replace: true });
    } catch (err) {
      const parsed = parseApiError(err, 'Could not create your account. Please try again.');
      setFieldErrors(parsed.status === 422 ? parsed.fieldErrors : {});
      setError(parsed.status === 422 ? 'Please check the highlighted fields.' : parsed.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="New accounts start with standard employee access."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand-700 hover:text-brand-800">
            Sign in
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
        <Field label="Full name" error={fieldErrors.name}>
          {(c) => <Input {...c} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace" />}
        </Field>
        <Field label="Email" error={fieldErrors.email}>
          {(c) => <Input {...c} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@studio.com" />}
        </Field>
        <Field label="Password" error={fieldErrors.password} hint="At least 8 characters.">
          {(c) => <PasswordInput {...c} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <Button type="submit" variant="primary" isLoading={isSubmitting} className="w-full">
          Create account
        </Button>
      </form>
    </AuthShell>
  );
}
