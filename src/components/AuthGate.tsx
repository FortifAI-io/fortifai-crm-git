import { useEffect, useState, type FormEvent } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff, KeyRound, Lock, Mail, ShieldCheck } from 'lucide-react';
import type { CrmUser } from '../types/crm';
import { ALLOWED_AUTH_DOMAINS } from '../data/seedData';

interface AuthGateProps {
  crmUsers: CrmUser[];
  supabaseUrl: string;
  supabaseAnonKey: string;
  onAuthenticated: (user: CrmUser, token?: string) => Promise<{ ok: boolean; error?: string }>;
}

export function AuthGate({ onAuthenticated }: AuthGateProps) {
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [email, setEmail] = useState('varun@fortifai.io');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const tok = params.get('inviteToken');
    const invitedEmail = params.get('email');
    if (tok) {
      setInviteToken(tok);
      if (invitedEmail) setEmail(invitedEmail.trim().toLowerCase());
    }
  }, []);

  const handleAcceptInviteSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!inviteToken) return;
    if (password.length < 8) {
      setError('Please choose a password with at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const resp = await fetch('/api/auth/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteToken, newPassword: password }),
      });
      const data = (await resp.json()) as {
        ok?: boolean;
        token?: string;
        user?: CrmUser;
        error?: string;
      };
      if (!resp.ok || !data.ok || !data.user) {
        setError(data.error || 'Unable to set password from invite link.');
        return;
      }
      // Clean invite query params from URL bar
      try {
        window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
      } catch {}
      const sessionRes = await onAuthenticated(data.user, data.token);
      if (!sessionRes.ok) {
        setError(sessionRes.error || 'Unable to establish authenticated session.');
      }
    } catch {
      setError('Unable to reach authentication server.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const normalized = email.trim().toLowerCase();

    if (!normalized) {
      setError('Enter your Fortifai workspace email.');
      return;
    }

    const domainAllowed = ALLOWED_AUTH_DOMAINS.some((d) => normalized.endsWith(d));
    if (!domainAllowed) {
      setError('Access restricted to @fortifai.io or @tryfortifai.us accounts.');
      return;
    }

    if (!password) {
      setError('Enter your workspace password.');
      return;
    }

    setSubmitting(true);
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalized, password }),
        signal: ctrl.signal,
      }).finally(() => clearTimeout(timer));

      const data = (await resp.json()) as {
        ok?: boolean;
        token?: string;
        user?: CrmUser;
        error?: string;
      };

      if (!resp.ok || !data.ok || !data.user) {
        setError(data.error || 'Invalid email or password.');
        return;
      }

      const sessionRes = await onAuthenticated(data.user, data.token);
      if (!sessionRes.ok) {
        setError(sessionRes.error || 'Unable to establish authenticated session.');
      }
    } catch {
      setError('Unable to reach authentication server. Check network or Vercel deployment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#090F17] flex items-center justify-center p-6 text-slate-100">
      <div className="w-full max-w-md bg-[#0F1724] rounded-xl border border-[#1E2D42] shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-[#1E2D42] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-sky-500 text-slate-950 flex items-center justify-center font-bold text-sm">
              F
            </div>
            <div>
              <h1 className="text-base font-semibold text-slate-100">Fortifai Scale</h1>
              <p className="text-[11px] text-slate-400">
                {inviteToken ? 'Complete Workspace Invitation' : 'Revenue & Pipeline OS · Restricted Access'}
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[11px] font-medium">
            <ShieldCheck size={12} />
            {inviteToken ? 'Invite Verified' : 'Password + RBAC'}
          </span>
        </div>

        {inviteToken ? (
          <form onSubmit={handleAcceptInviteSubmit} className="p-6 space-y-4 text-xs">
            <div className="p-3 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-200 flex items-start gap-2">
              <CheckCircle2 size={15} className="shrink-0 mt-0.5 text-sky-400" />
              <div>
                Welcome <strong>{email}</strong>. Create your personal password below to activate your Fortifai Scale account.
              </div>
            </div>

            <div>
              <label className="block font-medium text-slate-300 mb-1.5">
                New Workspace Password (min 8 chars)
              </label>
              <div className="relative">
                <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  placeholder="Create a strong password"
                  className="w-full pl-9 pr-10 py-2.5 bg-[#141F30] border border-[#1E2D42] rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block font-medium text-slate-300 mb-1.5">
                Confirm New Password
              </label>
              <div className="relative">
                <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setError(null);
                  }}
                  placeholder="Re-enter your password"
                  className="w-full pl-9 pr-3 py-2.5 bg-[#141F30] border border-[#1E2D42] rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-400"
                />
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-start gap-2">
                <AlertCircle size={15} className="shrink-0 mt-0.5 text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-sky-500 text-slate-950 font-semibold hover:bg-sky-400 disabled:opacity-50 transition-colors"
            >
              <Lock size={14} />
              {submitting ? 'Activating Account...' : 'Set Password & Enter Fortifai Scale'}
            </button>

            <button
              type="button"
              onClick={() => {
                setInviteToken(null);
                setError(null);
              }}
              className="w-full text-center text-[11px] text-slate-400 hover:text-slate-200"
            >
              Already have a password? Back to standard sign-in
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
            <div>
              <label className="block font-medium text-slate-300 mb-1.5">
                Workspace Email
              </label>
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError(null);
                  }}
                  placeholder="name@fortifai.io"
                  className="w-full pl-9 pr-3 py-2.5 bg-[#141F30] border border-[#1E2D42] rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-400"
                />
              </div>
            </div>

            <div>
              <label className="block font-medium text-slate-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  placeholder="Enter your password"
                  className="w-full pl-9 pr-10 py-2.5 bg-[#141F30] border border-[#1E2D42] rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-start gap-2">
                <AlertCircle size={15} className="shrink-0 mt-0.5 text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-sky-500 text-slate-950 font-semibold hover:bg-sky-400 disabled:opacity-50 transition-colors"
            >
              <Lock size={14} />
              {submitting ? 'Authenticating...' : 'Sign In to Fortifai Scale'}
            </button>

            <p className="text-[11px] text-slate-500 text-center pt-1">
              Authorized @fortifai.io &amp; @tryfortifai.us personnel only. Managed via Admin &amp; RBAC.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
