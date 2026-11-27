import { useEffect, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Eye,
  KeyRound,
  Mail,
  Send,
  Shield,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  UserX,
} from 'lucide-react';
import { useRbac } from '../../context/RbacContext';
import type { CrmUser, UserPermissions, UserRole } from '../../types/crm';
import { ALLOWED_AUTH_DOMAINS, PERMISSION_LABELS, ROLE_PRESETS } from '../../data/seedData';

interface AdminRbacViewProps {
  crmUsers: CrmUser[];
  currentUser: CrmUser;
  onInviteUser: (payload: {
    email: string;
    full_name: string;
    sender_display_name: string;
    role: UserRole;
    permissions: UserPermissions;
  }) => void;
  onResendInvite?: (user: CrmUser) => void;
  onDeleteUser?: (user: CrmUser) => void;
  onRemoveUserFromState?: (email: string) => void;
  onKeepOnlyVarun?: () => void;
  onUpdateUserRole: (userId: string, role: UserRole) => void;
  onTogglePermission: (userId: string, permKey: keyof UserPermissions) => void;
  onToggleUserActive: (userId: string) => void;
  onSwitchPreviewUser: (user: CrmUser) => void;
}

const LEGACY_MOCK_EMAILS = new Set([
  'mike@fortifai.io',
  'dave@fortifai.io',
  'arun@fortifai.io',
  'chandra@fortifai.io',
  'alex@fortifai.io',
  'sarah@fortifai.io',
]);

function getPermLabelText(key: keyof UserPermissions): string {
  const raw = (PERMISSION_LABELS as Record<string, unknown>)[key];
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object' && 'label' in raw) {
    return String((raw as { label: unknown }).label);
  }
  return key.replace(/^can_/, '').replace(/_/g, ' ');
}

export function AdminRbacView({
  crmUsers,
  currentUser,
  onInviteUser,
  onDeleteUser,
  onRemoveUserFromState,
  onKeepOnlyVarun,
  onUpdateUserRole,
  onTogglePermission,
  onToggleUserActive,
  onSwitchPreviewUser,
}: AdminRbacViewProps) {
  const { isSimulating, simulatedRole, simulateRole, exitSimulation } = useRbac();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('sales_lead');
  const [invitePerms, setInvitePerms] = useState<UserPermissions>({
    ...ROLE_PRESETS.sales_lead.permissions,
  });
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<{ ok: boolean; text: string } | null>(null);
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  const fetchAdminToken = async (): Promise<string> => {
    const sr = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: currentUser.email }),
    });
    const sj = (await sr.json().catch(() => ({}))) as { token?: string };
    return sj.token || '';
  };

  // Auto-purge legacy seeded mock accounts from Supabase & local state on mount
  useEffect(() => {
    const hasLegacy = crmUsers.some((u) => {
      const em = u.email.toLowerCase();
      return (
        LEGACY_MOCK_EMAILS.has(em) &&
        !window.localStorage.getItem('fortifai_reinvited_' + em)
      );
    });
    if (!hasLegacy) return;

    crmUsers.forEach((u) => {
      const em = u.email.toLowerCase();
      if (LEGACY_MOCK_EMAILS.has(em) && !window.localStorage.getItem('fortifai_reinvited_' + em)) {
        onRemoveUserFromState?.(em);
      }
    });

    if (currentUser.role === 'super_admin') {
      void (async () => {
        try {
          const token = await fetchAdminToken();
          await fetch('/api/admin/purge-stale-users', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ keepOnlyVarun: false }),
          });
        } catch {}
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crmUsers.length]);

  const handleInviteRoleChange = (role: UserRole) => {
    setInviteRole(role);
    setInvitePerms({ ...ROLE_PRESETS[role].permissions });
  };

  const handleSubmitInvite = (e: FormEvent) => {
    e.preventDefault();
    setInviteError(null);
    setStatusBanner(null);
    const email = inviteEmail.trim().toLowerCase();
    const fullName = inviteName.trim();

    if (!fullName) {
      setInviteError('Enter the team member’s full name.');
      return;
    }
    if (!ALLOWED_AUTH_DOMAINS.some((d) => email.endsWith(d))) {
      setInviteError('Only @fortifai.io or @tryfortifai.us email addresses can be invited.');
      return;
    }
    if (crmUsers.some((u) => u.email.toLowerCase() === email)) {
      setInviteError(`${email} is already in the user list below. Click "Resend Invite" on their row.`);
      return;
    }

    try {
      window.localStorage.setItem('fortifai_reinvited_' + email, '1');
    } catch {}

    onInviteUser({
      email,
      full_name: fullName,
      sender_display_name: fullName,
      role: inviteRole,
      permissions: { ...invitePerms },
    });

    setStatusBanner({
      ok: true,
      text: `Provisioned ${email} and dispatched invitation email from support@fortifai.io with a 7-day Set Password link.`,
    });
    setInviteEmail('');
    setInviteName('');
    setInviteRole('sales_lead');
    setInvitePerms({ ...ROLE_PRESETS.sales_lead.permissions });
  };

  const handleDirectResendInvite = async (u: CrmUser, copyLinkToo = false) => {
    setBusyEmail(u.email);
    setStatusBanner(null);
    try {
      const token = await fetchAdminToken();
      const resp = await fetch('/api/admin/send-invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          email: u.email,
          full_name: u.full_name,
          role: u.role,
          permissions: u.permissions,
        }),
      });
      const out = (await resp.json().catch(() => ({}))) as {
        ok?: boolean;
        setupLink?: string;
        error?: string;
      };
      if (!resp.ok || !out.ok) {
        setStatusBanner({
          ok: false,
          text: out.error || `Failed to send invite to ${u.email}.`,
        });
        return;
      }
      if (copyLinkToo && out.setupLink) {
        await navigator.clipboard.writeText(out.setupLink);
        setStatusBanner({
          ok: true,
          text: `Copied 7-day Set Password link for ${u.email} to clipboard (and emailed via support@fortifai.io).`,
        });
      } else {
        setStatusBanner({
          ok: true,
          text: `Invitation email resent to ${u.email} from Fortifai Support <support@fortifai.io>.`,
        });
      }
    } catch {
      setStatusBanner({ ok: false, text: `Network error sending invite to ${u.email}.` });
    } finally {
      setBusyEmail(null);
    }
  };

  const handleDirectRemoveUser = async (u: CrmUser) => {
    const em = u.email.toLowerCase();
    if (em === 'varun@fortifai.io') return;
    if (!window.confirm(`Permanently remove ${u.email} from Fortifai Scale?`)) return;

    setBusyEmail(u.email);
    try {
      window.localStorage.removeItem('fortifai_reinvited_' + em);
    } catch {}
    onRemoveUserFromState?.(em);
    onDeleteUser?.(u);

    try {
      const token = await fetchAdminToken();
      await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ email: em }),
      });
      setStatusBanner({ ok: true, text: `Removed ${u.email} from Fortifai Scale and Supabase.` });
    } catch {
      setStatusBanner({ ok: false, text: `Removed ${u.email} locally, but server delete failed.` });
    } finally {
      setBusyEmail(null);
    }
  };

  const handleKeepOnlyVarunClick = async () => {
    if (
      !window.confirm(
        'Remove all users except varun@fortifai.io from Fortifai Scale and Supabase?'
      )
    ) {
      return;
    }
    setBusyEmail('__purge__');
    onKeepOnlyVarun?.();
    try {
      const token = await fetchAdminToken();
      await fetch('/api/admin/purge-stale-users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ keepOnlyVarun: true }),
      });
      setStatusBanner({
        ok: true,
        text: 'Purged all non-admin/stale accounts. Only varun@fortifai.io remains.',
      });
    } catch {
      setStatusBanner({ ok: false, text: 'Purged locally; check server connection for Supabase.' });
    } finally {
      setBusyEmail(null);
    }
  };

  const visibleUsers = crmUsers.filter((u) => {
    const em = u.email.toLowerCase();
    if (LEGACY_MOCK_EMAILS.has(em) && !window.localStorage.getItem('fortifai_reinvited_' + em)) {
      return false;
    }
    return true;
  });

  const roleKeys = Object.keys(ROLE_PRESETS) as UserRole[];
  const permKeys = Object.keys(ROLE_PRESETS.super_admin.permissions) as Array<keyof UserPermissions>;

  return (
    <div className="p-6 max-w-[1280px] mx-auto space-y-5 text-xs">
      {/* Header & Purge Controls */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-400 flex items-center justify-center">
            <ShieldCheck size={18} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-[var(--tx-primary)]">
              Users, Invitations &amp; Role-Based Access Control
            </h2>
            <p className="text-[11px] text-[var(--tx-muted)]">
              Provision @fortifai.io &amp; @tryfortifai.us accounts · Invites dispatch from{' '}
              <span className="font-mono">support@fortifai.io</span> with a self-service Set Password link
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isSimulating && (
            <button
              type="button"
              onClick={exitSimulation}
              className="px-3 py-1.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300 font-medium hover:bg-amber-500/25"
            >
              Exit Role Preview ({simulatedRole})
            </button>
          )}
          {currentUser.role === 'super_admin' && visibleUsers.length > 1 && (
            <button
              type="button"
              disabled={busyEmail === '__purge__'}
              onClick={handleKeepOnlyVarunClick}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 font-medium transition-colors"
            >
              <Trash2 size={13} />
              Keep Only varun@fortifai.io
            </button>
          )}
        </div>
      </div>

      {statusBanner && (
        <div
          className={`p-3 rounded-lg border flex items-center justify-between gap-2 ${
            statusBanner.ok
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          <span className="inline-flex items-center gap-2">
            {statusBanner.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            {statusBanner.text}
          </span>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="text-[11px] underline opacity-80 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Invite New Team Member */}
      <form
        onSubmit={handleSubmitInvite}
        className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg p-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <div className="font-semibold text-sm text-[var(--tx-primary)] flex items-center gap-2">
            <UserPlus size={15} className="text-sky-400" />
            Invite Workspace Team Member
          </div>
          <span className="text-[11px] text-[var(--tx-muted)]">
            Sends 7-day password setup link via <span className="font-mono">support@fortifai.io</span>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <input
            type="text"
            value={inviteName}
            onChange={(e) => setInviteName(e.target.value)}
            placeholder="Full name (e.g. Fortifai Marketing)"
            className="md:col-span-4 px-3 py-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--tx-primary)] focus:outline-none focus:border-sky-400"
          />
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="name@fortifai.io"
            className="md:col-span-4 px-3 py-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--tx-primary)] focus:outline-none focus:border-sky-400"
          />
          <select
            value={inviteRole}
            onChange={(e) => handleInviteRoleChange(e.target.value as UserRole)}
            className="md:col-span-2 px-3 py-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--tx-primary)]"
          >
            {roleKeys.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="md:col-span-2 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-md bg-sky-500 text-slate-950 font-semibold hover:bg-sky-400 transition-colors"
          >
            <Send size={13} />
            Send Invite
          </button>
        </div>

        {inviteError && (
          <div className="p-2.5 rounded-md bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center gap-2">
            <AlertCircle size={14} />
            <span>{inviteError}</span>
          </div>
        )}
      </form>

      {/* Active Workspace Users Table */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <div className="font-semibold text-sm text-[var(--tx-primary)] flex items-center gap-2">
            <Shield size={15} className="text-sky-400" />
            Provisioned Workspace Accounts ({visibleUsers.length})
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[var(--tx-muted)]">Simulate Role:</span>
            {roleKeys.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => simulateRole(r)}
                className={`px-2 py-0.5 rounded border text-[10.5px] font-mono transition-colors ${
                  isSimulating && simulatedRole === r
                    ? 'bg-sky-500 text-slate-950 border-sky-400 font-semibold'
                    : 'border-[var(--border-subtle)] text-[var(--tx-secondary)] hover:bg-[var(--bg-subtle)]'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead className="bg-[var(--bg-subtle)] border-b border-[var(--border-subtle)] text-[11px] uppercase tracking-wider text-[var(--tx-muted)]">
              <tr>
                <th className="py-2.5 px-4">Team Member</th>
                <th className="py-2.5 px-4">Email</th>
                <th className="py-2.5 px-4">Role</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4">Permissions</th>
                <th className="py-2.5 px-4 text-right">Invitation &amp; Access Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {visibleUsers.map((u) => {
                const isPrimaryOwner = u.email.toLowerCase() === 'varun@fortifai.io';
                const isExpanded = expandedUserId === u.id;
                const enabledCount = permKeys.filter((k) => Boolean(u.permissions?.[k])).length;

                return (
                  <>
                    <tr key={u.id} className="hover:bg-[var(--bg-subtle)]/60 transition-colors">
                      <td className="py-2.5 px-4 font-semibold text-[var(--tx-primary)]">
                        {u.full_name}
                        {isPrimaryOwner && (
                          <span className="ml-2 px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400 border border-sky-500/30 text-[10px]">
                            Owner
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-[var(--tx-secondary)]">
                        {u.email}
                      </td>
                      <td className="py-2.5 px-4">
                        <select
                          value={u.role}
                          disabled={isPrimaryOwner}
                          onChange={(e) => onUpdateUserRole(u.id, e.target.value as UserRole)}
                          className="px-2.5 py-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--tx-primary)] disabled:opacity-60"
                        >
                          {roleKeys.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2.5 px-4">
                        {u.is_active ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[11px]">
                            <UserCheck size={11} />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30 text-[11px]">
                            <UserX size={11} />
                            Revoked
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4">
                        <button
                          type="button"
                          onClick={() => setExpandedUserId(isExpanded ? null : u.id)}
                          className="px-2.5 py-1 rounded border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-[var(--tx-secondary)] tabular-nums"
                        >
                          {enabledCount}/{permKeys.length} enabled · {isExpanded ? 'Hide' : 'Edit'}
                        </button>
                      </td>
                      <td className="py-2.5 px-4 text-right space-x-1.5">
                        {!isPrimaryOwner && (
                          <>
                            <button
                              type="button"
                              disabled={busyEmail === u.email}
                              onClick={() => handleDirectResendInvite(u, false)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-sky-500/40 bg-sky-500/15 text-sky-300 hover:bg-sky-500/25 font-medium transition-colors disabled:opacity-50"
                              title="Resend invite email from support@fortifai.io with 7-day Set Password link"
                            >
                              <Mail size={12} />
                              {busyEmail === u.email ? 'Sending...' : 'Resend Invite'}
                            </button>

                            <button
                              type="button"
                              disabled={busyEmail === u.email}
                              onClick={() => handleDirectResendInvite(u, true)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 font-medium transition-colors disabled:opacity-50"
                              title="Copy 7-day Set Password link directly to clipboard"
                            >
                              <Copy size={12} />
                              Copy Setup Link
                            </button>
                          </>
                        )}

                        <button
                          type="button"
                          onClick={() => onSwitchPreviewUser(u)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-[var(--border-subtle)] text-[var(--tx-secondary)] hover:bg-[var(--bg-subtle)]"
                          title="Preview workspace as this user"
                        >
                          <Eye size={12} />
                          Preview
                        </button>

                        {!isPrimaryOwner && (
                          <>
                            <button
                              type="button"
                              onClick={() => onToggleUserActive(u.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                            >
                              {u.is_active ? 'Deactivate' : 'Activate'}
                            </button>

                            <button
                              type="button"
                              disabled={busyEmail === u.email}
                              onClick={() => handleDirectRemoveUser(u)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20"
                              title="Permanently remove user"
                            >
                              <Trash2 size={12} />
                              Remove
                            </button>
                          </>
                        )}
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr key={`${u.id}_perms`} className="bg-[var(--bg-subtle)]/40">
                        <td colSpan={6} className="px-6 py-3">
                          <div className="flex flex-wrap gap-2">
                            {permKeys.map((pk) => {
                              const active = Boolean(u.permissions?.[pk]);
                              return (
                                <label
                                  key={pk}
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border cursor-pointer ${
                                    active
                                      ? 'border-sky-500/40 bg-sky-500/10 text-[var(--tx-primary)]'
                                      : 'border-[var(--border-subtle)] text-[var(--tx-muted)]'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={active}
                                    disabled={isPrimaryOwner}
                                    onChange={() => onTogglePermission(u.id, pk)}
                                    className="rounded"
                                  />
                                  <span>{getPermLabelText(pk)}</span>
                                </label>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Direct Password Override Panel */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg p-5 space-y-3">
        <div className="flex items-center gap-2 font-semibold text-sm text-[var(--tx-primary)]">
          <KeyRound size={15} className="text-sky-400" />
          Direct Password Set / Reset
        </div>
        <p className="text-[11px] text-[var(--tx-muted)]">
          Invited users automatically receive a link to set their own password. You can also set or rotate any account&apos;s password directly below.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const targetEmail = String(fd.get('targetEmail') || currentUser.email)
              .trim()
              .toLowerCase();
            const newPassword = String(fd.get('newPassword') || '');
            if (newPassword.length < 8) {
              setStatusBanner({ ok: false, text: 'Password must be at least 8 characters.' });
              return;
            }
            const token = await fetchAdminToken();
            const resp = await fetch('/api/auth/set-password', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify({ targetEmail, newPassword }),
            });
            const out = (await resp.json().catch(() => ({}))) as { ok?: boolean; error?: string };
            if (!resp.ok || !out.ok) {
              setStatusBanner({ ok: false, text: out.error || 'Unable to update password.' });
            } else {
              setStatusBanner({ ok: true, text: `Password updated for ${targetEmail}.` });
              e.currentTarget.reset();
            }
          }}
          className="grid grid-cols-1 sm:grid-cols-12 gap-2.5"
        >
          <select
            name="targetEmail"
            defaultValue={currentUser.email}
            disabled={currentUser.role !== 'super_admin'}
            className="sm:col-span-5 px-3 py-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--tx-primary)]"
          >
            {(currentUser.role === 'super_admin' ? visibleUsers : [currentUser]).map((u) => (
              <option key={u.id} value={u.email}>
                {u.full_name} ({u.email})
              </option>
            ))}
          </select>
          <input
            type="password"
            name="newPassword"
            required
            minLength={8}
            placeholder="New password (min 8 characters)"
            className="sm:col-span-4 px-3 py-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--tx-primary)]"
          />
          <button
            type="submit"
            className="sm:col-span-3 px-4 py-2 rounded bg-sky-500 text-slate-950 font-semibold hover:bg-sky-400 transition-colors"
          >
            Update Password
          </button>
        </form>
      </div>
    </div>
  );
}
