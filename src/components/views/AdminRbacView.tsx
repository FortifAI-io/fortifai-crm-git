import { useState, type FormEvent } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  Shield,
  ShieldCheck,
  UserCheck,
  UserPlus,
  UserX,
} from 'lucide-react';
import { useRbac } from '../../context/RbacContext';
import { CmsText } from '../CmsText';
import type { CrmUser, UserPermissions, UserRole } from '../../types/crm';
import { ALLOWED_AUTH_DOMAINS, PERMISSION_LABELS, ROLE_PRESETS } from '../../data/seedData';

interface AdminRbacViewProps {
  crmUsers: CrmUser[];
  currentUser: CrmUser;
  onResendInvite?: (user: CrmUser) => void;
  onDeleteUser?: (user: CrmUser) => void;
  onInviteUser: (payload: {
    email: string;
    full_name: string;
    sender_display_name: string;
    role: UserRole;
    permissions: UserPermissions;
  }) => void;
  onUpdateUserRole: (userId: string, role: UserRole) => void;
  onTogglePermission: (userId: string, permKey: keyof UserPermissions) => void;
  onToggleUserActive: (userId: string) => void;
  onSwitchPreviewUser: (user: CrmUser) => void;
}

export function AdminRbacView({
  crmUsers,
  currentUser,
  onInviteUser,
  onResendInvite,
  onDeleteUser,
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

  const handleInviteRoleChange = (role: UserRole) => {
    setInviteRole(role);
    setInvitePerms({ ...ROLE_PRESETS[role].permissions });
  };

  const handleSubmitInvite = (e: FormEvent) => {
    e.preventDefault();
    setInviteError(null);
    const email = inviteEmail.trim().toLowerCase();
    const fullName = inviteName.trim();

    if (!fullName) {
      setInviteError('Please enter the team member’s full name.');
      return;
    }

    if (!ALLOWED_AUTH_DOMAINS.some((d) => email.endsWith(d))) {
      setInviteError(
        'Only @fortifai.io or @tryfortifai.us email addresses can be invited to Fortifai Scale.'
      );
      return;
    }

    if (crmUsers.some((u) => u.email.toLowerCase() === email)) {
      setInviteError(`${email} is already provisioned in crm_users.`);
      return;
    }

    onInviteUser({
      email,
      full_name: fullName,
      sender_display_name: fullName,
      role: inviteRole,
      permissions: { ...invitePerms },
    });

    setInviteEmail('');
    setInviteName('');
    setInviteRole('sales_lead');
    setInvitePerms({ ...ROLE_PRESETS.sales_lead.permissions });
  };

  const activeCount = crmUsers.filter((u) => u.is_active).length;

  return (
    <div className="p-6 space-y-6 max-w-[1600px] w-full mx-auto">
      {/* Header Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 tabular-nums">
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
          <div className="text-xs text-slate-500 font-medium">Provisioned Team Members</div>
          <div className="text-2xl font-semibold text-slate-900 mt-1">{crmUsers.length}</div>
          <div className="text-[11px] text-emerald-600 mt-1">
            {activeCount} Active · {crmUsers.length - activeCount} Deactivated
          </div>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
          <div className="text-xs text-slate-500 font-medium">Allowed Auth Domains</div>
          <div className="text-sm font-semibold text-slate-900 mt-2 font-mono">
            @fortifai.io · @tryfortifai.us
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Matched against Supabase <span className="font-mono">crm_users</span>
          </div>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
          <div className="text-xs text-slate-500 font-medium">Active Session Principal</div>
          <div className="text-sm font-semibold text-slate-900 mt-2 truncate">
            {currentUser.email}
          </div>
          <div className="text-[11px] text-indigo-600 mt-1 font-mono">{currentUser.role}</div>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
          <div className="text-xs text-slate-500 font-medium">Role-Based Access Rules</div>
          <div className="text-sm font-semibold text-slate-900 mt-2">
            8 Granular Capabilities
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Dynamically hides tabs, enforces sender IDs &amp; actions
          </div>
        </div>
      </div>

      {/* Quick Role Switcher Preview ("Simulate View As") */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Eye size={16} className="text-indigo-600 shrink-0" />
          <div>
            <div className="text-xs font-semibold text-slate-900">
              Simulate View As (Test Exact UI for Any Role)
            </div>
            <div className="text-[11px] text-slate-500">
              Toggle any role preset to preview sidebar visibility, read-only fields, hidden schema/composer controls, and Ask Scale scope.
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(ROLE_PRESETS) as UserRole[]).map((roleKey) => {
            const isSelected = isSimulating
              ? simulatedRole === roleKey
              : currentUser.role === roleKey;
            return (
              <button
                key={roleKey}
                type="button"
                onClick={() => {
                  if (isSelected && isSimulating) {
                    exitSimulation();
                  } else {
                    simulateRole(roleKey);
                  }
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap ${
                  isSelected
                    ? 'bg-[#0D1520] text-white border-[#0D1520]'
                    : 'bg-slate-50 text-slate-700 border-[#E2E8F0] hover:bg-slate-100'
                }`}
                title={ROLE_PRESETS[roleKey].description}
              >
                <Eye size={12} />
                {ROLE_PRESETS[roleKey].label}
              </button>
            );
          })}
          {isSimulating && (
            <button
              type="button"
              onClick={exitSimulation}
              className="px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md hover:bg-indigo-100 whitespace-nowrap"
            >
              Exit Simulation
            </button>
          )}
        </div>
      </div>

      {/* Invite New Team Member */}
      <form
        onSubmit={handleSubmitInvite}
        className="bg-white border border-[#E2E8F0] rounded-lg p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <UserPlus size={16} className="text-slate-700" />
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                <CmsText
                  id="admin.invite.title"
                  defaultValue="Invite Team Member (crm_users)"
                  section="Admin & Settings"
                />
              </h2>
              <p className="text-xs text-slate-400">
                <CmsText
                  id="admin.invite.subtitle"
                  defaultValue="Grant access to verified @fortifai.io or @tryfortifai.us team members with preset or custom permissions"
                  section="Admin & Settings"
                />
              </p>
            </div>
          </div>
          <span className="text-[11px] text-slate-500">
            Administered by <strong className="text-slate-800">{currentUser.email}</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="block text-slate-600 font-medium mb-1">Full Name</label>
            <input
              type="text"
              required
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              placeholder="e.g. Priya Sharma"
              className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md text-slate-900 focus:outline-none focus:border-slate-400"
            />
          </div>
          <div>
            <label className="block text-slate-600 font-medium mb-1">
              Fortifai Email (@fortifai.io / @tryfortifai.us)
            </label>
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => {
                setInviteEmail(e.target.value);
                setInviteError(null);
              }}
              placeholder="priya@fortifai.io"
              className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md text-slate-900 focus:outline-none focus:border-slate-400"
            />
          </div>
          <div>
            <label className="block text-slate-600 font-medium mb-1">Preset Role</label>
            <select
              value={inviteRole}
              onChange={(e) => handleInviteRoleChange(e.target.value as UserRole)}
              className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md bg-white text-slate-900 font-medium focus:outline-none focus:border-slate-400"
            >
              {(Object.keys(ROLE_PRESETS) as UserRole[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_PRESETS[r].label} ({r})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200/80 rounded-md p-3.5 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-700">Granular Permissions for Invite</span>
            <span className="text-[11px] text-slate-500">
              {ROLE_PRESETS[inviteRole].description}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 text-xs">
            {PERMISSION_LABELS.map((perm) => (
              <label
                key={perm.key}
                className="flex items-center gap-2 px-2.5 py-2 rounded bg-white border border-slate-200 cursor-pointer hover:border-slate-300"
              >
                <input
                  type="checkbox"
                  checked={invitePerms[perm.key]}
                  onChange={(e) =>
                    setInvitePerms((prev) => ({
                      ...prev,
                      [perm.key]: e.target.checked,
                    }))
                  }
                  className="rounded border-slate-300 text-[#0D1520]"
                />
                <span className="text-[11px] font-medium text-slate-700 truncate">
                  {perm.short}
                </span>
              </label>
            ))}
          </div>
        </div>

        {inviteError && (
          <div className="p-3 rounded-md bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle size={14} className="shrink-0" />
            <span>{inviteError}</span>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#0D1520] rounded-md hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <UserPlus size={14} />
            Invite &amp; Provision Access
          </button>
        </div>
      </form>

      {/* Team Access Matrix Table */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-slate-700" />
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Team RBAC Permissions Matrix
              </h2>
              <p className="text-xs text-slate-400">
                Toggle preset roles, individual capability checkboxes, or active status. Use
                &ldquo;Preview as User&rdquo; to test dynamic tab &amp; action restrictions.
              </p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-[#E2E8F0] text-[11px] font-semibold tracking-wider text-slate-500">
                <th className="py-3 px-4">Team Member</th>
                <th className="py-3 px-4">Preset Role</th>
                {PERMISSION_LABELS.map((perm) => (
                  <th
                    key={perm.key}
                    className="py-3 px-2.5 text-center whitespace-nowrap"
                    title={perm.label}
                  >
                    {perm.short}
                  </th>
                ))}
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {crmUsers.map((user) => {
                const isPrimaryOwner = user.email.toLowerCase() === 'varun@fortifai.io';
                const isCurrent = user.id === currentUser.id;
                return (
                  <tr
                    key={user.id}
                    className={`transition-colors ${
                      !user.is_active ? 'bg-slate-50/70 opacity-65' : 'hover:bg-slate-50/90'
                    }`}
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900">{user.full_name}</span>
                        {isCurrent && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-medium">
                            You
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">{user.email}</div>
                    </td>
                    <td className="py-3 px-4">
                      <select
                        value={user.role}
                        disabled={isPrimaryOwner}
                        onChange={(e) => onUpdateUserRole(user.id, e.target.value as UserRole)}
                        className="bg-white border border-[#E2E8F0] rounded px-2 py-1 text-xs font-medium text-slate-800 disabled:bg-slate-100 disabled:text-slate-500"
                      >
                        {(Object.keys(ROLE_PRESETS) as UserRole[]).map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </td>
                    {PERMISSION_LABELS.map((perm) => (
                      <td key={perm.key} className="py-3 px-2.5 text-center">
                        <input
                          type="checkbox"
                          aria-label={`${perm.label} for ${user.email}`}
                          checked={Boolean(user.permissions[perm.key])}
                          disabled={isPrimaryOwner && perm.key === 'can_manage_users'}
                          onChange={() => onTogglePermission(user.id, perm.key)}
                          className="h-4 w-4 rounded border-slate-300 text-[#0D1520] cursor-pointer disabled:opacity-50"
                        />
                      </td>
                    ))}
                    <td className="py-3 px-4 text-center">
                      {user.is_active ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                          <CheckCircle2 size={11} />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-50 text-rose-700 border border-rose-200 whitespace-nowrap">
                          <UserX size={11} />
                          Deactivated
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {!isCurrent && user.is_active && (
                          <button
                            type="button"
                            onClick={() => onSwitchPreviewUser(user)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 whitespace-nowrap"
                            title="Switch active session to test this user's RBAC permissions"
                          >
                            <Eye size={11} />
                            Preview as User
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={isPrimaryOwner}
                          onClick={() => onToggleUserActive(user.id)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium border whitespace-nowrap disabled:opacity-40 ${
                            user.is_active
                              ? 'text-rose-700 bg-white border-rose-200 hover:bg-rose-50'
                              : 'text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                          }`}
                        >
                          {user.is_active ? (
                            <>
                              <UserX size={11} />
                              Deactivate
                            </>
                          ) : (
                            <>
                              <UserCheck size={11} />
                              Activate
                            </>
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center gap-2 text-[11px] text-slate-500">
          <ShieldCheck size={14} className="text-emerald-600 shrink-0" />
          <span>
            Primary Super Admin (<span className="font-mono text-slate-700">varun@fortifai.io</span>
            ) retains permanent <span className="font-mono">can_manage_users</span> protection to
            prevent accidental lockout.
          </span>
        </div>
      </div>
    
      {/* Workspace Password Control (Self + Super Admin Reset) */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-[var(--tx-primary)]">
              Workspace Password Management
            </h3>
            <p className="text-xs text-[var(--tx-muted)] mt-0.5">
              Set or rotate salted scrypt password hashes in <span className="font-mono">crm_users</span>. Super Admins can reset any team member&apos;s password.
            </p>
          </div>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const targetEmail = String(fd.get("targetEmail") || currentUser.email).trim().toLowerCase();
            const newPassword = String(fd.get("newPassword") || "");
            if (newPassword.length < 8) {
              alert("Password must be at least 8 characters.");
              return;
            }
            const sessRes = await fetch("/api/auth/session", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: currentUser.email }),
            });
            const sessJson = (await sessRes.json()) as { token?: string };
            const resp = await fetch("/api/auth/set-password", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(sessJson.token ? { Authorization: `Bearer ${sessJson.token}` } : {}),
              },
              body: JSON.stringify({ targetEmail, newPassword }),
            });
            const out = (await resp.json()) as { ok?: boolean; error?: string };
            if (!resp.ok || !out.ok) {
              alert(out.error || "Unable to update password.");
            } else {
              alert(`Password updated for ${targetEmail}`);
              e.currentTarget.reset();
            }
          }}
          className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 text-xs"
        >
          <select
            name="targetEmail"
            defaultValue={currentUser.email}
            disabled={currentUser.role !== "super_admin"}
            className="sm:col-span-5 px-3 py-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--tx-primary)]"
          >
            {currentUser.role === "super_admin" ? (
              crmUsers.map((u) => (
                <option key={u.id} value={u.email}>
                  {u.full_name} ({u.email})
                </option>
              ))
            ) : (
              <option value={currentUser.email}>
                {currentUser.full_name} ({currentUser.email})
              </option>
            )}
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
