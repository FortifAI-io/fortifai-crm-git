import { useState, type FormEvent } from 'react';
import { AlertCircle, CheckCircle2, Lock, Mail, ShieldCheck } from 'lucide-react';
import type { CrmUser } from '../types/crm';
import { ALLOWED_AUTH_DOMAINS } from '../data/seedData';
import { buildSupabaseClient, verifyUserInSupabaseCrmUsers } from '../lib/supabase';

interface AuthGateProps {
  crmUsers: CrmUser[];
  supabaseUrl: string;
  supabaseAnonKey: string;
  onAuthenticated: (user: CrmUser) => Promise<{ ok: boolean; error?: string }>;
}

export function AuthGate({
  crmUsers,
  supabaseUrl,
  supabaseAnonKey,
  onAuthenticated,
}: AuthGateProps) {
  const [email, setEmail] = useState('varun@fortifai.io');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
      setError(
        'Access restricted to authenticated @fortifai.io or @tryfortifai.us workspace accounts.'
      );
      return;
    }

    setSubmitting(true);
    try {
      let matchedUser = crmUsers.find((u) => u.email.toLowerCase() === normalized);

      // If Supabase Live is configured, verify against remote crm_users table as well
      const client = buildSupabaseClient(supabaseUrl, supabaseAnonKey);
      if (client) {
        const remote = await verifyUserInSupabaseCrmUsers(client, normalized);
        if (remote.ok && remote.user) {
          matchedUser = remote.user;
        }
      }

      if (!matchedUser) {
        setError(
          `Account "${normalized}" was not found in the crm_users access table. Ask a super_admin (varun@fortifai.io) to invite you first.`
        );
        setSubmitting(false);
        return;
      }

      if (!matchedUser.is_active) {
        setError(
          `Access revoked: "${matchedUser.email}" is currently deactivated in crm_users.`
        );
        setSubmitting(false);
        return;
      }

      const sessionRes = await onAuthenticated(matchedUser);
      if (!sessionRes.ok) {
        setError(sessionRes.error || 'Unable to create authenticated session.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0D1520] flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-xl border border-[#E2E8F0] shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-slate-100 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-md bg-[#0D1520] text-white flex items-center justify-center font-semibold text-sm">
                F
              </div>
              <div>
                <h1 className="text-base font-semibold text-slate-900">Fortifai Scale</h1>
                <p className="text-[11px] text-slate-500">
                  Restricted Workspace Access · @fortifai.io &amp; @tryfortifai.us
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-medium">
              <ShieldCheck size={12} />
              RBAC Enforced
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div>
            <label className="block font-medium text-slate-700 mb-1.5">
              Workspace Email Address
            </label>
            <div className="relative">
              <Mail
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                placeholder="name@fortifai.io or name@tryfortifai.us"
                className="w-full pl-9 pr-3 py-2.5 border border-[#E2E8F0] rounded-md text-slate-900 focus:outline-none focus:border-slate-500"
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">
              Verified against <span className="font-mono text-slate-600">crm_users</span> in
              Supabase. External domains are automatically denied.
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-md bg-rose-50 border border-rose-200 text-rose-700 flex items-start gap-2">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-md bg-[#0D1520] text-white font-medium hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            <Lock size={14} />
            {submitting ? 'Verifying crm_users...' : 'Sign In to Fortifai Scale'}
          </button>

          <div className="pt-3 border-t border-slate-100 space-y-2">
            <div className="text-[11px] font-medium text-slate-500">
              Quick-Select Provisioned Team Member (crm_users):
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              {crmUsers.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => {
                    setEmail(u.email);
                    setError(null);
                  }}
                  className="flex items-center justify-between px-3 py-2 rounded-md border border-slate-200 hover:bg-slate-50 text-left transition-colors"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-slate-800 truncate">
                      {u.full_name}{' '}
                      <span className="text-slate-400 font-normal">({u.email})</span>
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Role: <span className="font-mono">{u.role}</span>
                    </div>
                  </div>
                  {u.is_active ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded shrink-0">
                      <CheckCircle2 size={10} />
                      Active
                    </span>
                  ) : (
                    <span className="text-[10px] font-medium text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded shrink-0">
                      Deactivated
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
