import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Mail, CheckCircle2 } from 'lucide-react';
import { authApi } from '../../api/auth.api';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

export const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await authApi.forgotPassword(email);
      setIsSubmitted(true);
    } catch {
      // Show submitted anyway for security
      setIsSubmitted(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4 py-12">
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl backdrop-blur-xl">
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-white shadow-lg shadow-indigo-500/30">
            <Sparkles className="h-8 w-8" />
          </div>
          <h2 className="mt-6 text-3xl font-extrabold tracking-tight text-white">
            Reset Password
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Enter your email to receive reset instructions
          </p>
        </div>

        {isSubmitted ? (
          <div className="space-y-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <p className="text-sm text-slate-300">
              If an account with <span className="font-semibold text-white">{email}</span> exists, password reset instructions have been sent.
            </p>
            <Link to="/login" className="inline-block font-medium text-indigo-400 hover:text-indigo-300 text-sm">
              Return to Login
            </Link>
          </div>
        ) : (
          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Email Address
              </label>
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                icon={<Mail className="h-4 w-4 text-slate-400" />}
              />
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 py-3 font-semibold text-white shadow-lg shadow-indigo-600/30 hover:from-indigo-500 hover:to-violet-500"
            >
              {isLoading ? 'Sending...' : 'Send Reset Link'}
            </Button>

            <p className="text-center text-sm text-slate-400">
              Remember your password?{' '}
              <Link to="/login" className="font-semibold text-indigo-400 hover:text-indigo-300">
                Sign In
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
};
