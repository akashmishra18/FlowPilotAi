import { FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Sparkles, LoaderCircle } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { loginRequest } from '@/services/authApi';
import { getFriendlyErrorMessage } from '@/services/errorHelpers';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const setSession = useAuthStore((s) => s.setSession);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: Location })?.from?.pathname ?? '/dashboard';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const { user, accessToken } = await loginRequest({ email, password });
      setSession(user, accessToken);
      navigate(from, { replace: true });
    } catch (err) {
      // Always show a clean, user-friendly message — never a raw error
      // object or backend stack trace.
      setError(getFriendlyErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-sm w-full">
        <div className="flex items-center gap-2 justify-center mb-8">
          <Sparkles className="w-6 h-6 text-brand-500" />
          <span className="font-semibold text-gray-900 text-lg">FlowPilot AI</span>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-8">
          <h1 className="text-lg font-semibold text-gray-900 mb-1">Sign in</h1>
          <p className="text-sm text-gray-500 mb-6">Welcome back — enter your details below.</p>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 text-red-700 text-sm px-4 py-2.5">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="you@studio.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
            >
              {isSubmitting && <LoaderCircle className="w-4 h-4 animate-spin" />}
              Sign in
            </button>
          </form>

          <p className="text-sm text-gray-500 text-center mt-6">
            Don&apos;t have an account?{' '}
            <Link to="/register" className="text-brand-600 font-medium hover:underline">
              Register
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
