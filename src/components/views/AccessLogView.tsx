import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  Clock,
  Copy,
  Database,
  Download,
  LogIn,
  LogOut,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { CrmUser } from '../../types/crm';

export interface UserAccessLogEntry {
  id: string;
  user_id?: string | null;
  user_email: string;
  user_name?: string | null;
  user_role?: string | null;
  login_at: string;
  logout_at?: string | null;
  logout_reason?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
}

interface AccessLogViewProps {
  currentUser: CrmUser;
  sessionToken: string | null;
}

const SETUP_SQL = `CREATE TABLE IF NOT EXISTS public.user_access_logs (
  id text PRIMARY KEY,
  user_id text,
  user_email text NOT NULL,
  user_name text,
  user_role text,
  login_at timestamptz NOT NULL DEFAULT now(),
  logout_at timestamptz,
  logout_reason text,
  ip_address text,
  user_agent text
);

CREATE INDEX IF NOT EXISTS idx_user_access_logs_login_at
  ON public.user_access_logs (login_at DESC);

ALTER TABLE public.user_access_logs ENABLE ROW LEVEL SECURITY;`;

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

function formatDuration(loginIso: string, logoutIso?: string | null): string {
  const start = new Date(loginIso).getTime();
  if (Number.isNaN(start)) return '—';
  const end = logoutIso ? new Date(logoutIso).getTime() : Date.now();
  if (Number.isNaN(end) || end < start) return '—';
  const totalMins = Math.floor((end - start) / 60000);
  if (totalMins < 1) return '< 1m';
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
}

export function AccessLogView({ currentUser, sessionToken }: AccessLogViewProps) {
  const [logs, setLogs] = useState<UserAccessLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tableMissing, setTableMissing] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'signed_out'>('all');
  const [dateFilter, setDateFilter] = useState('');

  const isSuperAdmin = currentUser.role === 'super_admin';

  const fetchLogs = useCallback(async () => {
    if (!isSuperAdmin) return;
    setLoading(true);
    setError(null);

    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 8000);

    try {
      let effectiveToken = sessionToken;
      if (!effectiveToken) {
        try {
          effectiveToken = localStorage.getItem('fortifai_scale_session_token_v1');
        } catch {
          effectiveToken = null;
        }
      }
      if (!effectiveToken) {
        const sRes = await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: currentUser.email,
            role: currentUser.role,
            permissions: currentUser.permissions,
            is_active: currentUser.is_active,
          }),
          signal: ctrl.signal,
        });
        const sJson = (await sRes.json()) as { ok?: boolean; token?: string };
        if (sJson.ok && sJson.token) {
          effectiveToken = sJson.token;
          try {
            localStorage.setItem('fortifai_scale_session_token_v1', sJson.token);
          } catch {}
        }
      }

      if (!effectiveToken) {
        setError('Unable to verify super_admin session token. Please sign out and sign back in.');
        return;
      }

      const res = await fetch('/api/admin/access-logs', {
        headers: {
          Authorization: `Bearer ${effectiveToken}`,
        },
        signal: ctrl.signal,
      });

      const rawText = await res.text();
      let data: {
        ok?: boolean;
        logs?: UserAccessLogEntry[];
        tableMissing?: boolean;
        error?: string;
      } = {};
      try {
        data = JSON.parse(rawText);
      } catch {
        setError(`Server returned HTTP ${res.status}. Please retry.`);
        return;
      }

      if (!res.ok || !data.ok) {
        setError(data.error || `Unable to fetch user access logs (HTTP ${res.status}).`);
        return;
      }

      setTableMissing(Boolean(data.tableMissing));
      setLogs(Array.isArray(data.logs) ? data.logs : []);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('Request timed out after 8 seconds. Click Refresh to retry.');
      } else {
        setError('Network error while loading user access logs.');
      }
    } finally {
      window.clearTimeout(timer);
      setLoading(false);
    }
  }, [isSuperAdmin, sessionToken, currentUser]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return logs.filter((row) => {
      if (statusFilter === 'active' && row.logout_at) return false;
      if (statusFilter === 'signed_out' && !row.logout_at) return false;
      if (dateFilter) {
        const localDay = new Date(row.login_at).toLocaleDateString('en-CA');
        if (localDay !== dateFilter) return false;
      }
      if (!q) return true;
      return (
        row.user_email.toLowerCase().includes(q) ||
        (row.user_name || '').toLowerCase().includes(q) ||
        (row.user_role || '').toLowerCase().includes(q) ||
        (row.ip_address || '').toLowerCase().includes(q)
      );
    });
  }, [logs, searchQuery, statusFilter, dateFilter]);

  const metrics = useMemo(() => {
    const todayKey = new Date().toLocaleDateString('en-CA');
    const todayLogins = logs.filter(
      (l) => new Date(l.login_at).toLocaleDateString('en-CA') === todayKey
    ).length;
    const activeSessions = logs.filter((l) => !l.logout_at).length;
    const uniqueUsers = new Set(logs.map((l) => l.user_email.toLowerCase())).size;
    return {
      totalEvents: logs.length,
      todayLogins,
      activeSessions,
      uniqueUsers,
    };
  }, [logs]);

  const handleExportCsv = () => {
    const header = [
      'Date',
      'User Name',
      'Email',
      'Role',
      'Login Time',
      'Log-Off Time',
      'Duration',
      'Exit Type',
      'IP Address',
    ];
    const rows = filteredLogs.map((r) => [
      formatDate(r.login_at),
      r.user_name || '',
      r.user_email,
      r.user_role || '',
      formatTime(r.login_at),
      r.logout_at ? formatTime(r.logout_at) : 'Active Session',
      formatDuration(r.login_at, r.logout_at),
      r.logout_reason || (r.logout_at ? 'signed_out' : 'active'),
      r.ip_address || '',
    ]);
    const csv = [header, ...rows]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fortifai-scale-access-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopySql = async () => {
    try {
      await navigator.clipboard.writeText(SETUP_SQL);
      setCopiedSql(true);
      window.setTimeout(() => setCopiedSql(false), 2200);
    } catch {}
  };

  if (!isSuperAdmin) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="p-5 rounded-xl border border-rose-500/30 bg-rose-500/10 flex items-start gap-3">
          <ShieldAlert size={18} className="text-rose-400 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold text-[var(--tx-primary)]">
              Super Admin Access Required
            </h2>
            <p className="text-xs text-[var(--tx-secondary)] mt-1">
              Workspace access logs are restricted strictly to users with the{' '}
              <code className="font-mono">super_admin</code> role.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 w-full min-w-0 max-w-full space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-[var(--tx-primary)]">
              Workspace User Access Log
            </h2>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
              <ShieldCheck size={11} /> Super Admin Only
            </span>
          </div>
          <p className="text-xs text-[var(--tx-secondary)] mt-0.5">
            Immutable sign-in and sign-off audit trail for authenticated @fortifai.io and @tryfortifai.us workspace sessions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void fetchLogs()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--tx-primary)] hover:border-sky-400/50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin text-sky-400' : 'text-sky-400'} />
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredLogs.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-[#2E5A8A] text-white hover:bg-[#244870] disabled:opacity-40 transition-colors"
          >
            <Download size={13} />
            Export CSV
          </button>
        </div>
      </div>

      {tableMissing && (
        <div className="p-4 rounded-xl border border-sky-500/35 bg-sky-500/10 space-y-2.5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-semibold text-sky-300">
              <Database size={14} />
              One-Time Setup: Run this SQL in your Supabase SQL Editor to create <code className="font-mono">public.user_access_logs</code>
            </div>
            <button
              type="button"
              onClick={() => void handleCopySql()}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--tx-primary)] hover:border-sky-400"
            >
              {copiedSql ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
              {copiedSql ? 'Copied SQL' : 'Copy SQL'}
            </button>
          </div>
          <pre className="p-3 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] font-mono text-[11px] text-[var(--tx-secondary)] overflow-x-auto">
            {SETUP_SQL}
          </pre>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
          <div className="flex items-center justify-between text-[11px] text-[var(--tx-muted)]">
            <span>Total Recorded Logins</span>
            <LogIn size={13} className="text-sky-400" />
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-[var(--tx-primary)]">
            {metrics.totalEvents}
          </div>
          <div className="mt-0.5 text-[11px] text-[var(--tx-secondary)]">
            Last 500 workspace sessions
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
          <div className="flex items-center justify-between text-[11px] text-[var(--tx-muted)]">
            <span>Logins Today</span>
            <Clock size={13} className="text-emerald-400" />
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-400">
            {metrics.todayLogins}
          </div>
          <div className="mt-0.5 text-[11px] text-[var(--tx-secondary)]">
            Authenticated entries today
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
          <div className="flex items-center justify-between text-[11px] text-[var(--tx-muted)]">
            <span>Open / Active Sessions</span>
            <LogOut size={13} className="text-amber-400" />
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-amber-400">
            {metrics.activeSessions}
          </div>
          <div className="mt-0.5 text-[11px] text-[var(--tx-secondary)]">
            Sessions without recorded log-off
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
          <div className="flex items-center justify-between text-[11px] text-[var(--tx-muted)]">
            <span>Unique Team Members</span>
            <Users size={13} className="text-indigo-400" />
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-[var(--tx-primary)]">
            {metrics.uniqueUsers}
          </div>
          <div className="mt-0.5 text-[11px] text-[var(--tx-secondary)]">
            Distinct @fortifai.io accounts
          </div>
        </div>
      </div>

      <div className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search
            size={13}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--tx-muted)]"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by user name, email, role, or IP..."
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--tx-primary)] placeholder:text-[var(--tx-muted)] focus:outline-none focus:border-sky-400"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            aria-label="Filter by login date"
            className="px-2.5 py-1.5 text-xs rounded-md bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--tx-primary)] focus:outline-none focus:border-sky-400"
          />
          {dateFilter && (
            <button
              type="button"
              onClick={() => setDateFilter('')}
              className="text-[11px] text-sky-400 hover:underline px-1"
            >
              Clear date
            </button>
          )}

          <div className="inline-flex rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-0.5 text-[11px]">
            {(['all', 'active', 'signed_out'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setStatusFilter(mode)}
                className={`px-2.5 py-1 rounded font-medium transition-colors ${
                  statusFilter === mode
                    ? 'bg-sky-500/20 text-sky-400'
                    : 'text-[var(--tx-secondary)] hover:text-[var(--tx-primary)]'
                }`}
              >
                {mode === 'all' ? 'All' : mode === 'active' ? 'Active' : 'Signed Off'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-300">
          {error}
        </div>
      )}

      <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)]/60 text-[11px] font-semibold uppercase tracking-wider text-[var(--tx-muted)]">
                <th className="py-2.5 px-4">Date</th>
                <th className="py-2.5 px-4">User</th>
                <th className="py-2.5 px-4">Role</th>
                <th className="py-2.5 px-4">Login Time</th>
                <th className="py-2.5 px-4">Log-Off Time</th>
                <th className="py-2.5 px-4">Duration</th>
                <th className="py-2.5 px-4">Status / IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] text-xs">
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-[var(--tx-muted)]">
                    Loading access logs...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-[var(--tx-muted)]">
                    {tableMissing
                      ? 'Create public.user_access_logs using the SQL snippet above, then click Refresh.'
                      : 'No access log entries recorded yet. Sign out and sign back in once to record your first session.'}
                  </td>
                </tr>
              ) : (
                filteredLogs.map((row) => (
                  <tr
                    key={row.id}
                    className="hover:bg-[var(--bg-canvas)]/40 transition-colors"
                  >
                    <td className="py-2.5 px-4 font-mono text-[11.5px] text-[var(--tx-primary)] whitespace-nowrap">
                      {formatDate(row.login_at)}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-[var(--tx-primary)]">
                        {row.user_name || row.user_email.split('@')[0]}
                      </div>
                      <div className="text-[11px] font-mono text-[var(--tx-muted)]">
                        {row.user_email}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded text-[10.5px] font-mono bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--tx-secondary)]">
                        {row.user_role || 'member'}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[11.5px] text-emerald-400 whitespace-nowrap">
                      {formatTime(row.login_at)}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[11.5px] whitespace-nowrap">
                      {row.logout_at ? (
                        <span className="text-[var(--tx-primary)]">{formatTime(row.logout_at)}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          Active Session
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[11.5px] text-[var(--tx-secondary)] whitespace-nowrap">
                      {formatDuration(row.login_at, row.logout_at)}
                    </td>
                    <td className="py-2.5 px-4 text-[11px] text-[var(--tx-muted)] whitespace-nowrap">
                      <div>
                        {row.logout_at
                          ? row.logout_reason === 'tab_closed'
                            ? 'Tab / Browser Closed'
                            : 'Signed Out'
                          : 'Online'}
                      </div>
                      {row.ip_address && (
                        <div className="font-mono text-[10px] opacity-75">{row.ip_address}</div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
