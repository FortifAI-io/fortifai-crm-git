import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { CrmUser, UserPermissions, UserRole } from '../types/crm';
import { ROLE_PRESETS } from '../data/seedData';

export function intersectPermissions(
  base: UserPermissions,
  target: UserPermissions
): UserPermissions {
  return {
    can_view_customers: Boolean(base.can_view_customers && target.can_view_customers),
    can_edit_customers: Boolean(base.can_edit_customers && target.can_edit_customers),
    can_view_investors: Boolean(base.can_view_investors && target.can_view_investors),
    can_edit_investors: Boolean(base.can_edit_investors && target.can_edit_investors),
    can_send_campaigns: Boolean(base.can_send_campaigns && target.can_send_campaigns),
    can_send_as_marketing: Boolean(base.can_send_as_marketing && target.can_send_as_marketing),
    can_manage_schema: Boolean(base.can_manage_schema && target.can_manage_schema),
    can_manage_users: Boolean(base.can_manage_users && target.can_manage_users),
  };
}

export interface RbacContextValue {
  authenticatedUser: CrmUser;
  currentUser: CrmUser;
  role: UserRole;
  permissions: UserPermissions;
  isSimulating: boolean;
  simulatedRole: UserRole | null;
  simulatedUser: CrmUser | null;
  canSimulate: boolean;
  simulateRole: (role: UserRole | null) => void;
  simulateUser: (user: CrmUser | null) => void;
  exitSimulation: () => void;
}

const RbacContext = createContext<RbacContextValue | null>(null);

interface RbacProviderProps {
  authenticatedUser: CrmUser;
  crmUsers: CrmUser[];
  simulatedRole: UserRole | null;
  simulatedUserId: string | null;
  onSimulateRole: (role: UserRole | null) => void;
  onSimulateUser: (user: CrmUser | null) => void;
  onExitSimulation: () => void;
  children: ReactNode;
}

export function RbacProvider({
  authenticatedUser,
  crmUsers,
  simulatedRole,
  simulatedUserId,
  onSimulateRole,
  onSimulateUser,
  onExitSimulation,
  children,
}: RbacProviderProps) {
  const canSimulate = Boolean(authenticatedUser.permissions.can_manage_users);

  const simulatedUser = useMemo(() => {
    if (!canSimulate || !simulatedUserId) return null;
    return crmUsers.find((u) => u.id === simulatedUserId && u.is_active) || null;
  }, [canSimulate, simulatedUserId, crmUsers]);

  const effectiveUser = useMemo<CrmUser>(() => {
    if (canSimulate && simulatedUser) {
      return {
        ...simulatedUser,
        permissions: intersectPermissions(
          authenticatedUser.permissions,
          simulatedUser.permissions
        ),
      };
    }

    if (canSimulate && simulatedRole && ROLE_PRESETS[simulatedRole]) {
      const preset = ROLE_PRESETS[simulatedRole].permissions;
      return {
        ...authenticatedUser,
        role: simulatedRole,
        permissions: intersectPermissions(authenticatedUser.permissions, preset),
      };
    }

    return authenticatedUser;
  }, [canSimulate, simulatedUser, simulatedRole, authenticatedUser]);

  const isSimulating = Boolean(
    canSimulate &&
      ((simulatedUser && simulatedUser.id !== authenticatedUser.id) ||
        (simulatedRole && simulatedRole !== authenticatedUser.role) ||
        (simulatedRole && simulatedUserId === null && simulatedRole === authenticatedUser.role
          ? false
          : Boolean(simulatedRole)))
  );

  const value = useMemo<RbacContextValue>(
    () => ({
      authenticatedUser,
      currentUser: effectiveUser,
      role: effectiveUser.role,
      permissions: effectiveUser.permissions,
      isSimulating: Boolean(
        canSimulate &&
          ((simulatedUser && simulatedUser.id !== authenticatedUser.id) || Boolean(simulatedRole))
      ),
      simulatedRole: canSimulate ? simulatedRole : null,
      simulatedUser,
      canSimulate,
      simulateRole: onSimulateRole,
      simulateUser: onSimulateUser,
      exitSimulation: onExitSimulation,
    }),
    [
      authenticatedUser,
      effectiveUser,
      canSimulate,
      simulatedUser,
      simulatedRole,
      onSimulateRole,
      onSimulateUser,
      onExitSimulation,
    ]
  );

  return <RbacContext.Provider value={value}>{children}</RbacContext.Provider>;
}

export function useRbac(): RbacContextValue {
  const ctx = useContext(RbacContext);
  if (!ctx) {
    throw new Error('useRbac must be used inside an RbacProvider');
  }
  return ctx;
}
