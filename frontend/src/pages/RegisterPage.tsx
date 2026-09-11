import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sparkles, LoaderCircle, CheckCircle2 } from 'lucide-react';
import { registerRequest } from '@/services/authApi';
import { getFriendlyErrorMessage } from '@/services/errorHelpers';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await registerRequest({ name, email, password });
      setSuccess(true);
      setTimeout(() => navigate('/login'), 1200);
    } catch (err) {
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
          <h1 className="text-lg font-semibold text-gray-900 mb-1">Create your account</h1>
          <p className="text-sm text-gray-500 mb-6">
            New accounts start with standard employee access.
          </p>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 text-red-700 text-sm px-4 py-2.5">{error}</div>
          )}

          {success ? (
            <div className="flex items-center gap-2 text-green-700 bg-green-50 rounded-lg px-4 py-3 text-sm">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              Account created — redirecting you to sign in...
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="Ada Lovelace"
                />
              </div>
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
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="At least 8 characters"
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
              >
                {isSubmitting && <LoaderCircle className="w-4 h-4 animate-spin" />}
                Create account
              </button>
            </form>
          )}

          <p className="text-sm text-gray-500 text-center mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-brand-600 font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
