import { STAGE_2_PLUS_SET, daysBetweenIso } from "./utils/crmHelpers";
import { getStageDefaultProbability } from "./utils/crmHelpers";
import { loadPipelineRules, savePipelineRules, type PipelineHealthRules } from "./types/pipelineRules";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BarChart3,
  Briefcase,
  Building2,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Moon,
  Plus,
  Sun,
  Send,
  Settings,
  Shield,
  Sparkles,
  Target,
  Upload,
} from 'lucide-react';
import { RbacProvider, useRbac } from './context/RbacContext';
import { LiveCmsProvider } from './context/LiveCmsContext';
import type {
  AccountDossier,
  ActiveTab,
  AskMeChatMessage,
  AskMeStructuredPayload,
  Contact,
  ContactType,
  CrmUser,
  CustomerAnalytics,
  CustomFieldDefinition,
  EntityScope,
  InvestorAnalytics,
  PipelineAnalytics,
  PortalLinkMode,
  Quarter,
  Region,
  TelemetryEvent,
  UserPermissions,
  UserRole,
} from './types/crm';
import {
  CUSTOMER_STAGES,
  INITIAL_CONTACTS,
  INITIAL_CRM_USERS,
  INITIAL_CUSTOM_FIELDS,
  INITIAL_TELEMETRY,
  QUARTERS,
  ROLE_PRESETS,
  STAGE_WIN_PROBABILITIES,
} from './data/seedData';
import { formatCurrency } from './utils/crmHelpers';
import {
  buildSupabaseClient,
  getSavedConfig,
  loadLocalState,
  pullStateFromSupabase,
  saveConfig,
  saveLocalState,
  subscribeToCrmChanges,
  syncStateToSupabase,
  testSupabaseConnection,
  upsertCrmUserToSupabase,
  deleteContactFromSupabase,
  upsertSingleContactToSupabase,
} from './lib/supabase';
import { AuthGate } from './components/AuthGate';
import { PipelineHealthView } from './components/views/PipelineHealthView';
import { PipelineTimelineView } from './components/views/PipelineTimelineView';
import { CustomerAnalyticsView } from './components/views/CustomerAnalyticsView';
import { CustomersView, type CustomerPresetFilter } from './components/views/CustomersView';
import { InvestorFunnelView } from './components/views/InvestorFunnelView';
import { InvestorsView } from './components/views/InvestorsView';
import { ComposerView } from './components/views/ComposerView';
import { TelemetryView } from './components/views/TelemetryView';
import { AdminRbacView } from './components/views/AdminRbacView';
import { SettingsView } from './components/views/SettingsView';
import { ContactDrawer } from './components/ContactDrawer';
import { AskMeDrawer } from './components/AskMeDrawer';
import { AccountDossierDrawer } from './components/AccountDossierDrawer';
import { GlobalSearchBar } from './components/GlobalSearchBar';
import { CmsText } from './components/CmsText';
import { LiveCmsHeaderButton, LiveCmsOverlay } from './components/LiveCmsOverlay';
import { AddContactModal } from './components/modals/AddContactModal';
import { CsvImportModal } from './components/modals/CsvImportModal';

function formatUserSenderIdentity(user: CrmUser): string {
  const displayName = user.sender_display_name?.trim() || user.full_name;
  return `${displayName} <${user.email}>`;
}

function normalizeCrmUsers(rawUsers: CrmUser[]): CrmUser[] {
  const byEmail = new Map<string, CrmUser>();

  rawUsers.forEach((u) => {
    const preset = ROLE_PRESETS[u.role] || ROLE_PRESETS.analyst_viewer;
    const canSendAsMarketing =
      u.permissions?.can_send_as_marketing ??
      (['super_admin', 'admin', 'marketing'].includes(u.role) ||
        preset.permissions.can_send_as_marketing);

    byEmail.set(u.email.toLowerCase(), {
      ...u,
      sender_display_name: u.sender_display_name?.trim() || u.full_name,
      permissions: {
        ...preset.permissions,
        ...u.permissions,
        can_send_as_marketing: canSendAsMarketing,
      },
    });
  });

  // Backfill newly added seed team members (e.g. Marketing role) if absent in older localStorage
  INITIAL_CRM_USERS.forEach((seedUser) => {
    if (!byEmail.has(seedUser.email.toLowerCase())) {
      byEmail.set(seedUser.email.toLowerCase(), seedUser);
    }
  });

  return Array.from(byEmail.values());
}

function normalizeContacts(rawContacts: Contact[], users: CrmUser[]): Contact[] {
  const fallbackUser = users.find((u) => u.is_active) || users[0] || INITIAL_CRM_USERS[0];
  return rawContacts.map((c) => {
    const matched =
      (c.owner_id ? users.find((u) => u.id === c.owner_id) : undefined) ||
      (c.owner_email
        ? users.find((u) => u.email.toLowerCase() === c.owner_email.toLowerCase())
        : undefined) ||
      (c.owner
        ? users.find(
            (u) =>
              u.full_name.toLowerCase() === c.owner.toLowerCase() ||
              u.full_name.toLowerCase().startsWith(c.owner.toLowerCase())
          )
        : undefined) ||
      fallbackUser;

    return {
      ...c,
      owner_id: matched.id,
      owner_email: matched.email,
      owner: matched.full_name.split(' ')[0] || matched.full_name,
    };
  });
}

const CUSTOMER_TABS = new Set<ActiveTab>([
  'pipeline_health',
  'pipeline_timeline',
  'customer_analytics',
  'customers',
  'customer_outreach',
  'customer_telemetry',
]);

const INVESTOR_TABS = new Set<ActiveTab>([
  'investor_funnel',
  'investors',
  'investor_outreach',
  'investor_telemetry',
]);

const VALID_TABS = new Set<ActiveTab>([
  'pipeline_health',
  'pipeline_timeline',
  'customer_analytics',
  'customers',
  'customer_outreach',
  'customer_telemetry',
  'investor_funnel',
  'investors',
  'investor_outreach',
  'investor_telemetry',
  'admin',
  'settings',
]);

function canAccessTab(tab: ActiveTab, perms: UserPermissions, role?: UserRole): boolean {
  if (tab === 'customer_outreach') {
    return perms.can_view_customers && perms.can_send_campaigns;
  }
  if (tab === 'investor_outreach') {
    return perms.can_view_investors && perms.can_send_campaigns;
  }
  if (CUSTOMER_TABS.has(tab)) return perms.can_view_customers;
  if (INVESTOR_TABS.has(tab)) return perms.can_view_investors;
  if (tab === 'admin') return perms.can_manage_users;
  if (tab === 'settings') return role === 'super_admin';
  return false;
}

function getDefaultTabForPermissions(perms: UserPermissions, role?: UserRole): ActiveTab {
  if (perms.can_view_customers) return 'customers';
  if (perms.can_view_investors) return 'investors';
  if (role === 'super_admin') return 'settings';
  return 'customers';
}

function parseTabFromLocation(): ActiveTab | null {
  if (typeof window === 'undefined') return null;
  const rawHash = window.location.hash.replace(/^#\/?/, '').trim();
  const queryTab = new URLSearchParams(window.location.search).get('tab')?.trim() || '';
  const rawCandidate = (rawHash || queryTab) === "pipeline_timeline" ? "pipeline_health" : (rawHash || queryTab);
  const candidate = rawCandidate as ActiveTab;
  return VALID_TABS.has(candidate) ? candidate : null;
}

export default function App() {
  const [crmUsers, setCrmUsers] = useState<CrmUser[]>(() =>
    normalizeCrmUsers(loadLocalState('USERS', INITIAL_CRM_USERS))
  );
  const [authenticatedUserId, setAuthenticatedUserId] = useState<string>(() => {
    const users = normalizeCrmUsers(loadLocalState<CrmUser[]>('USERS', INITIAL_CRM_USERS));
    const active = users.find((u) => u.is_active) || INITIAL_CRM_USERS[0];
    return active.id;
  });
  const [simulatedRole, setSimulatedRole] = useState<UserRole | null>(null);
  const [simulatedUserId, setSimulatedUserId] = useState<string | null>(null);

  const authenticatedUser = useMemo(() => {
    return (
      crmUsers.find((u) => u.id === authenticatedUserId) ||
      crmUsers.find((u) => u.is_active) ||
      crmUsers[0] ||
      INITIAL_CRM_USERS[0]
    );
  }, [crmUsers, authenticatedUserId]);

  const handleSimulateRole = useCallback((role: UserRole | null) => {
    setSimulatedUserId(null);
    setSimulatedRole(role);
  }, []);

  const handleSimulateUser = useCallback((user: CrmUser | null) => {
    setSimulatedRole(null);
    setSimulatedUserId(user ? user.id : null);
  }, []);

  const handleExitSimulation = useCallback(() => {
    setSimulatedRole(null);
    setSimulatedUserId(null);
  }, []);

  return (
    <RbacProvider
      authenticatedUser={authenticatedUser}
      crmUsers={crmUsers}
      simulatedRole={simulatedRole}
      simulatedUserId={simulatedUserId}
      onSimulateRole={handleSimulateRole}
      onSimulateUser={handleSimulateUser}
      onExitSimulation={handleExitSimulation}
    >
      <ScaleWorkspace
        crmUsers={crmUsers}
        setCrmUsers={setCrmUsers}
        setAuthenticatedUserId={setAuthenticatedUserId}
      />
    </RbacProvider>
  );
}

interface ScaleWorkspaceProps {
  crmUsers: CrmUser[];
  setCrmUsers: React.Dispatch<React.SetStateAction<CrmUser[]>>;
  setAuthenticatedUserId: React.Dispatch<React.SetStateAction<string>>;
}


function getExplicitCloseQtrMap(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem("fortifai_explicit_close_qtrs_v1") || "{}");
  } catch {
    return {};
  }
}
function setExplicitCloseQtr(id: string, qtr: string) {
  try {
    const map = getExplicitCloseQtrMap();
    if (qtr) map[id] = qtr;
    else delete map[id];
    localStorage.setItem("fortifai_explicit_close_qtrs_v1", JSON.stringify(map));
  } catch {}
}
function applyExplicitCloseQtrs(list: Contact[]): Contact[] {
  const map = getExplicitCloseQtrMap();
  return list.map((c) =>
    c.contact_type === "customer" ? { ...c, expected_close: map[c.id] || "" } : c
  );
}

function ScaleWorkspace({
  crmUsers,
  setCrmUsers,
  setAuthenticatedUserId,
}: ScaleWorkspaceProps) {
  const {
    authenticatedUser,
    currentUser,
    permissions: perms,
    isSimulating,
    simulatedRole,
    simulateUser,
    exitSimulation,
  } = useRbac();

  const [contacts, setContacts] = useState<Contact[]>(() => {
    try { localStorage.removeItem("fortifai_crm_contacts_v2"); } catch {}
    const users = normalizeCrmUsers(loadLocalState("USERS", INITIAL_CRM_USERS));
    const loaded = loadLocalState("CONTACTS", INITIAL_CONTACTS);
    let migrated = loaded;
    try {
      if (!localStorage.getItem("fortifai_cleared_qtr_v1")) {
        migrated = loaded.map((c) => c.contact_type === "customer" ? { ...c, expected_close: "" } : c);
        localStorage.setItem("fortifai_cleared_qtr_v1", "1");
      }
    } catch {}
    const cleaned = migrated.filter(
      (c) => !["alice@honeywell.com", "bob@nokia.com"].includes((c.email || "").toLowerCase())
    );
    return applyExplicitCloseQtrs(normalizeContacts(cleaned.length > 50 ? cleaned : INITIAL_CONTACTS, users)).map((c) =>
      c.contact_type === "customer"
        ? {
            ...c,
            probability: getStageDefaultProbability(c.stage),
            created_at:
              c.created_at ||
              new Date(Date.now() - Math.max(1, c.aging_days || 14) * 86400000)
                .toISOString()
                .slice(0, 10),
            stage_entered_at:
              c.stage_entered_at ||
              new Date(Date.now() - Math.max(0, c.aging_days || 0) * 86400000).toISOString(),
            stage2_entered_at:
              c.stage2_entered_at ||
              (STAGE_2_PLUS_SET.has(c.stage)
                ? new Date(Date.now() - Math.max(0, c.aging_days || 0) * 86400000).toISOString()
                : undefined),
          }
        : c
    );
  });
  const [customFields, setCustomFields] = useState<CustomFieldDefinition[]>(() =>
    loadLocalState('CUSTOM_FIELDS', INITIAL_CUSTOM_FIELDS)
  );
  const [telemetry, setTelemetry] = useState<TelemetryEvent[]>(() =>
    loadLocalState('TELEMETRY', INITIAL_TELEMETRY)
  );

  const activeUsers = useMemo(() => crmUsers.filter((u) => u.is_active), [crmUsers]);

  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    const requested = parseTabFromLocation();
    if (requested && canAccessTab(requested, perms, currentUser.role)) {
      return requested;
    }
    return getDefaultTabForPermissions(perms, currentUser.role);
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [hoveredRailItem, setHoveredRailItem] = useState<{ label: string; top: number } | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    return localStorage.getItem("fortifai_scale_theme") === "light" ? "light" : "dark";
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    try {
      localStorage.setItem("fortifai_scale_theme", theme);
    } catch {}
  }, [theme]);
  const [customerSectionOpen, setCustomerSectionOpen] = useState(true);
  const [investorSectionOpen, setInvestorSectionOpen] = useState(true);

  const [isSignedOut, setIsSignedOut] = useState(() => {
    if (typeof window === 'undefined') return true;
    return !window.sessionStorage.getItem('fortifai_scale_authed_email');
  });
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [resendConfigured, setResendConfigured] = useState(false);
  const [geminiConfigured, setGeminiConfigured] = useState(false);

  // Ask Scale Copilot State
  const [isAskMeOpen, setIsAskMeOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.location.hash.replace(/^#\/?/, '').trim() === 'ask_scale';
  });
  const [askMeMessages, setAskMeMessages] = useState<AskMeChatMessage[]>([]);
  const [askMeLoading, setAskMeLoading] = useState(false);
  const pendingComposerDraftRef = useRef<{
    contactIds: string[];
    subject?: string;
    bodyTemplate?: string;
  } | null>(null);

  // Editable Targets
  const [pipelineRules, setPipelineRules] = useState<PipelineHealthRules>(() => loadPipelineRules());
  const handleUpdatePipelineRules = useCallback((next: PipelineHealthRules) => {
    setPipelineRules(next);
    savePipelineRules(next);
    setArrTarget2027(next.arrTarget2027);
    setAvgAcvAssumption(next.avgAcvAssumption);
    setCoverageMultiple(next.requiredCoverageMultiple);
  }, []);
  const [arrTarget2027, setArrTarget2027] = useState<number>(() => loadPipelineRules().arrTarget2027);
  const [avgAcvAssumption, setAvgAcvAssumption] = useState<number>(() => loadPipelineRules().avgAcvAssumption);
  const [coverageMultiple, setCoverageMultiple] = useState<number>(() => loadPipelineRules().requiredCoverageMultiple);
  const seedRoundTarget = 3000000;

  // Slide-Over Contact Detail Drawer
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);

  // Customer Intelligence Dossier Drawer State
  const [dossierTarget, setDossierTarget] = useState<{
    contactId: string;
    organization: string;
    industry?: string;
    region?: string;
    icpScore?: number;
    targetArr?: number;
  } | null>(null);
  const [dossiersByOrg, setDossiersByOrg] = useState<Record<string, AccountDossier>>(() => {
    const cached = loadLocalState<AccountDossier[]>('DOSSIERS', []);
    const map: Record<string, AccountDossier> = {};
    cached.forEach((d) => {
      if (d.organization) map[d.organization.toLowerCase()] = d;
    });
    return map;
  });
  const [dossierLoading, setDossierLoading] = useState(false);
  const [dossierCached, setDossierCached] = useState(false);
  const [dossierError, setDossierError] = useState<string | null>(null);

  // Modals State
  const [isAddContactOpen, setIsAddContactOpen] = useState(false);
  const [addContactType, setAddContactType] = useState<ContactType>('customer');
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);

  // Analytics Deep-Link Filter Preset for Customers Table
  const [custPresetFilter, setCustPresetFilter] = useState<CustomerPresetFilter | null>(null);

  // Composer State
  const [compAudience, setCompAudience] = useState<ContactType>('investor');
  const [compFilterResetSeq, setCompFilterResetSeq] = useState<number>(0);
  const [compSelectedIds, setCompSelectedIds] = useState<string[]>([]);
  const [compSendFrom, setCompSendFrom] = useState<string>(() =>
    formatUserSenderIdentity(currentUser)
  );
  const [compUseAssignedOwnerSender, setCompUseAssignedOwnerSender] = useState<boolean>(false);
  const [compBccEnabled, setCompBccEnabled] = useState<boolean>(true);
  const [compPortalLink, setCompPortalLink] = useState<PortalLinkMode>('none');
  const [compSubject, setCompSubject] = useState(
    'Fortifai — Autonomous Audit & Compliance for Fortune 500 ($3M Seed)'
  );
  const [compBody, setCompBody] = useState(
    `Hi {{first_name}},\n\n{{custom_hook}}\n\nWe are closing out our $3M Seed ($15M cap post-money SAFE) with active enterprise deployments across Honeywell, Nokia, and Brookfield Properties.\n\nWould you have 20 minutes next week to connect?\n\nBest,\nVarun Mowar\nCo-Founder & CEO, Fortifai`
  );
  const [previewIdx, setPreviewIdx] = useState(0);
  const [sendingBatch, setSendingBatch] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Supabase Connection State
  const savedCfg = useMemo(() => getSavedConfig(), []);
  const [supabaseUrl, setSupabaseUrl] = useState(savedCfg.supabaseUrl);
  const [supabaseAnonKey, setSupabaseAnonKey] = useState(savedCfg.supabaseAnonKey);
  const [isLiveConnected, setIsLiveConnected] = useState(
    Boolean(savedCfg.supabaseUrl && savedCfg.supabaseAnonKey)
  );
  const [isSyncing, setIsSyncing] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4500);
  }, []);

  const navigateToTab = useCallback(
    (nextTab: ActiveTab) => {
      if (!canAccessTab(nextTab, perms, currentUser.role)) {
        const msg = INVESTOR_TABS.has(nextTab)
          ? 'Access denied: requires can_view_investors.'
          : CUSTOMER_TABS.has(nextTab)
          ? 'Access denied: requires can_view_customers.'
          : nextTab === 'admin'
          ? 'Access denied: requires can_manage_users.'
          : nextTab === 'settings'
          ? 'Access denied: Connections & Sync is restricted to Super Admin.'
          : 'Access denied for your active RBAC role.';
        showToast(msg);
        return;
      }
      setActiveTab(nextTab);
    },
    [perms, showToast]
  );

  // Sync URL hash to activeTab & block direct URL/hash navigation to unauthorized domains
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const expectedHash = `#${activeTab}`;
    if (window.location.hash !== expectedHash) {
      window.history.replaceState(null, '', expectedHash);
    }
  }, [activeTab]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleRouteCheck = () => {
      const requested = parseTabFromLocation();
      if (!requested) return;
      if (!canAccessTab(requested, perms, currentUser.role)) {
        const fallback = canAccessTab(activeTab, perms, currentUser.role)
          ? activeTab
          : getDefaultTabForPermissions(perms, currentUser.role);
        window.history.replaceState(null, '', `#${fallback}`);
        setActiveTab(fallback);
        showToast(
          INVESTOR_TABS.has(requested)
            ? 'Blocked direct URL navigation: requires can_view_investors.'
            : CUSTOMER_TABS.has(requested)
            ? 'Blocked direct URL navigation: requires can_view_customers.'
            : 'Blocked direct URL navigation: insufficient RBAC permissions.'
        );
        return;
      }
      setActiveTab(requested);
    };
    window.addEventListener('hashchange', handleRouteCheck);
    window.addEventListener('popstate', handleRouteCheck);
    return () => {
      window.removeEventListener('hashchange', handleRouteCheck);
      window.removeEventListener('popstate', handleRouteCheck);
    };
  }, [perms, activeTab, showToast]);

  // Issue / Refresh Bearer session token from Express server
  const issueServerSession = useCallback(
    async (
      baseUser: CrmUser,
      simOptions?: { simulateRole?: UserRole | null; simulatePermissions?: UserPermissions }
    ): Promise<{ ok: boolean; token?: string; error?: string }> => {
      try {
        const res = await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: baseUser.email,
            role: baseUser.role,
            permissions: baseUser.permissions,
            is_active: baseUser.is_active,
            ...(simOptions?.simulateRole
              ? {
                  simulateRole: simOptions.simulateRole,
                  simulatePermissions: simOptions.simulatePermissions,
                }
              : {}),
          }),
        });
        const data = (await res.json()) as { ok: boolean; token?: string; error?: string };
        if (!res.ok || !data.ok || !data.token) {
          return { ok: false, error: data.error || 'Session authorization failed.' };
        }
        setSessionToken(data.token);
        return { ok: true, token: data.token };
      } catch {
        return { ok: false, error: 'Unable to reach auth server.' };
      }
    },
    []
  );

  // Sync server config status & session token on boot / user change
  useEffect(() => {
    fetch('/api/config-status')
      .then((r) => r.json())
      .then((d: { ok?: boolean; resendConfigured?: boolean; geminiConfigured?: boolean }) => {
        if (d.ok) {
          setResendConfigured(Boolean(d.resendConfigured));
          setGeminiConfigured(Boolean(d.geminiConfigured));
        }
      })
      .catch(() => {});
  }, []);

  // Global Cmd+K / Ctrl+K shortcut for Ask Scale copilot drawer
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsAskMeOpen((prev) => !prev);
      } else if (e.key === 'Escape' && isAskMeOpen && !selectedContactId) {
        setIsAskMeOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isAskMeOpen, selectedContactId]);

  useEffect(() => {
    if (!isSignedOut && authenticatedUser.is_active) {
      const simRole = isSimulating ? simulatedRole || currentUser.role : null;
      void issueServerSession(authenticatedUser, {
        simulateRole: simRole,
        simulatePermissions: simRole ? perms : undefined,
      });
    }
  }, [isSignedOut, authenticatedUser, isSimulating, simulatedRole, currentUser.role, perms, issueServerSession]);

  // Persist local CRM state
  useEffect(() => {
    try {
      if (!window.localStorage.getItem('fortifai_scale_purged_mock_users_v2')) {
        window.localStorage.setItem('fortifai_scale_purged_mock_users_v2', '1');
        setCrmUsers((prev) => {
          const cleaned = prev.filter((u) => u.email.toLowerCase() === 'varun@fortifai.io');
          return cleaned.length > 0 ? cleaned : INITIAL_CRM_USERS;
        });
      }
    } catch {}
  }, []);

  useEffect(() => {
    saveLocalState('USERS', crmUsers);
  }, [crmUsers]);

  useEffect(() => {
    saveLocalState('CONTACTS', contacts);
  }, [contacts]);

  useEffect(() => {
    saveLocalState('CUSTOM_FIELDS', customFields);
  }, [customFields]);

  useEffect(() => {
    saveLocalState('TELEMETRY', telemetry);
  }, [telemetry]);

  useEffect(() => {
    saveLocalState('DOSSIERS', Object.values(dossiersByOrg));
  }, [dossiersByOrg]);

  // Live Supabase Boot Pull & Realtime Postgres Subscriptions
  useEffect(() => {
    const client = buildSupabaseClient(supabaseUrl, supabaseAnonKey);
    if (!client) return;

    let cancelled = false;
    const syncFromRemote = async () => {
      const res = await pullStateFromSupabase(client);
      if (cancelled || !res.ok) return;
      const normalizedUsers =
        res.users && res.users.length > 0 ? normalizeCrmUsers(res.users) : null;
      if (normalizedUsers) setCrmUsers(normalizedUsers);
      if (res.contacts && res.contacts.length > 0) {
        setContacts(applyExplicitCloseQtrs(normalizeContacts(res.contacts, normalizedUsers || crmUsers)));
      }
      if (res.customFields && res.customFields.length > 0) setCustomFields(res.customFields);
      if (res.telemetry && res.telemetry.length > 0) setTelemetry(res.telemetry);
      if (res.dossiers && res.dossiers.length > 0) {
        setDossiersByOrg((prev) => {
          const next = { ...prev };
          res.dossiers!.forEach((d) => {
            if (d.organization) next[d.organization.toLowerCase()] = d;
          });
          return next;
        });
      }
      setIsLiveConnected(true);
    };

    void syncFromRemote();
    const unsubscribe = subscribeToCrmChanges(client, () => {
      void syncFromRemote();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabaseUrl, supabaseAnonKey]);

  // Keep Composer Send From aligned with logged-in user and RBAC
  useEffect(() => {
    const personal = formatUserSenderIdentity(currentUser);
    const canSendAsMarketing =
      ['super_admin', 'admin', 'marketing'].includes(currentUser.role) ||
      Boolean(currentUser.permissions.can_send_as_marketing);

    if (compSendFrom === 'Fortifai <contact@fortifai.io>' && canSendAsMarketing) {
      return;
    }
    setCompSendFrom(personal);
  }, [currentUser, compSendFrom]);

  // Keep Composer audience strictly locked to active domain route & RBAC visibility
  useEffect(() => {
    if (activeTab === 'customer_outreach' && compAudience !== 'customer') {
      setCompAudience('customer');
    } else if (activeTab === 'investor_outreach' && compAudience !== 'investor') {
      setCompAudience('investor');
    } else if (compAudience === 'investor' && !perms.can_view_investors && perms.can_view_customers) {
      setCompAudience('customer');
    } else if (compAudience === 'customer' && !perms.can_view_customers && perms.can_view_investors) {
      setCompAudience('investor');
    }
  }, [activeTab, compAudience, perms.can_view_customers, perms.can_view_investors]);

  // Update default email template when switching Composer audience (unless overridden by Ask Me draft)
  useEffect(() => {
    const pending = pendingComposerDraftRef.current;
    if (!pending?.subject && !pending?.bodyTemplate) {
      setCompPortalLink('none');
      if (compAudience === 'customer') {
        setCompSubject('Continuous Audit & Counterpart Risk Automation — Fortifai');
        setCompBody(
          `Hi {{first_name}},\n\nFollowing up on how {{organization}} approaches continuous controls testing and third-party compliance across {{region}}.\n\nFortifai deploys autonomous AI assurance agents directly over SAP, Oracle, and Workday to test 100% of transactions rather than manual quarterly samples.\n\nOpen to a brief 15-minute walkthrough next Tuesday or Thursday?\n\nBest,\nVarun Mowar\nCo-Founder & CEO, Fortifai`
        );
      } else {
        setCompSubject('Fortifai — Autonomous Audit & Compliance for Fortune 500 ($3M Seed)');
        setCompBody(
          `Hi {{first_name}},\n\n{{custom_hook}}\n\nWe are raising a $3M Seed ($15M cap post-money SAFE) with enterprise traction across Honeywell, Nokia, and Brookfield Properties.\n\nWould you be open to a 20-minute conversation next week?\n\nBest,\nVarun Mowar\nCo-Founder & CEO, Fortifai`
        );
      }
    }
    setPreviewIdx(0);
  }, [compAudience]);

  // ============================================================================
  // LIVE AUTO-COMPUTED ANALYTICS
  // ============================================================================

  const customerContacts = useMemo(
    () => contacts.filter((c) => c.contact_type === 'customer'),
    [contacts]
  );

  const investorContacts = useMemo(
    () => contacts.filter((c) => c.contact_type === 'investor'),
    [contacts]
  );

  const customerCustomFields = useMemo(
    () => customFields.filter((f) => f.entity_scope === 'customer' || f.entity_scope === 'both'),
    [customFields]
  );

  const investorCustomFields = useMemo(
    () => customFields.filter((f) => f.entity_scope === 'investor' || f.entity_scope === 'both'),
    [customFields]
  );

  const accessibleCustomFields = useMemo(
    () =>
      customFields.filter((f) => {
        if (f.entity_scope === 'investor') return perms.can_view_investors;
        if (f.entity_scope === 'customer') return perms.can_view_customers;
        return perms.can_view_customers || perms.can_view_investors;
      }),
    [customFields, perms.can_view_customers, perms.can_view_investors]
  );

  const accessibleContacts = useMemo(
    () =>
      contacts.filter((c) =>
        c.contact_type === 'investor' ? perms.can_view_investors : perms.can_view_customers
      ),
    [contacts, perms.can_view_customers, perms.can_view_investors]
  );

  const accessibleTelemetry = useMemo(
    () =>
      telemetry.filter((t) => {
        if (t.contact_type === 'investor' || t.source === 'investor.fortifai.io') {
          return perms.can_view_investors;
        }
        if (t.contact_type === 'customer' || t.source === 'overview.fortifai.io') {
          return perms.can_view_customers;
        }
        return true;
      }),
    [telemetry, perms.can_view_customers, perms.can_view_investors]
  );

  const customerOpenRatePct = useMemo(() => {
    const contacted = customerContacts.filter(
      (c) => c.delivery_status && c.delivery_status !== 'not_sent'
    );
    if (contacted.length === 0) return 0;
    const opened = contacted.filter(
      (c) =>
        (c.email_opened && (c.opened_duration_sec === undefined || c.opened_duration_sec >= 10)) ||
        ['opened', 'portal_visited', 'replied'].includes(c.delivery_status || '')
    );
    return Math.round((opened.length / contacted.length) * 100);
  }, [customerContacts]);

  const customerAnalytics: CustomerAnalytics = useMemo(() => {
    const totalAccounts = customerContacts.length;
    const totalArr = customerContacts.reduce((s, c) => s + (c.amount_usd || 0), 0);
    const weightedArr = customerContacts.reduce(
      (s, c) => s + ((c.amount_usd || 0) * (c.probability || 0)) / 100,
      0
    );
    const avgAcv = totalAccounts > 0 ? Math.round(totalArr / totalAccounts) : 0;

    const scoredAccounts = customerContacts.filter((c) => (c.icp_score ?? 0) > 0);
    const avgIcpScore =
      scoredAccounts.length > 0
        ? Math.round(
            scoredAccounts.reduce((s, c) => s + (c.icp_score || 0), 0) / scoredAccounts.length
          )
        : 0;

    const f500 = customerContacts.filter((c) => c.fortune_500);
    const fortune500Count = f500.length;
    const fortune500Arr = f500.reduce((s, c) => s + (c.amount_usd || 0), 0);

    const calcTierStats = (tierName: 'Tier I' | 'Tier II') => {
      const group = customerContacts.filter((c) => (c.tier || 'Tier I') === tierName);
      const count = group.length;
      const arr = group.reduce((s, c) => s + (c.amount_usd || 0), 0);
      const avgScore =
        count > 0
          ? Math.round(group.reduce((s, c) => s + (c.icp_score || 0), 0) / count)
          : 0;
      const avgAging =
        count > 0
          ? Math.round(group.reduce((s, c) => s + (c.aging_days || 0), 0) / count)
          : 0;
      return { count, arr, avgScore, avgAging };
    };

    const tierIStats = calcTierStats('Tier I');
    const tierIIStats = calcTierStats('Tier II');

    const sectorMap = new Map<string, Contact[]>();
    customerContacts.forEach((c) => {
      const sec = c.industry?.trim() || 'Unspecified';
      const list = sectorMap.get(sec) || [];
      list.push(c);
      sectorMap.set(sec, list);
    });

    const bySector = Array.from(sectorMap.entries())
      .map(([sector, group]) => {
        const arr = group.reduce((s, c) => s + (c.amount_usd || 0), 0);
        const wtd = group.reduce(
          (s, c) => s + ((c.amount_usd || 0) * (c.probability || 0)) / 100,
          0
        );
        const avgScore =
          group.length > 0
            ? Math.round(group.reduce((s, c) => s + (c.icp_score || 0), 0) / group.length)
            : 0;
        return {
          sector,
          count: group.length,
          arr,
          weightedArr: wtd,
          avgScore,
          sharePct: totalArr > 0 ? Math.round((arr / totalArr) * 100) : 0,
        };
      })
      .sort((a, b) => b.arr - a.arr);

    const regionMap = new Map<Region, Contact[]>();
    customerContacts.forEach((c) => {
      const list = regionMap.get(c.region) || [];
      list.push(c);
      regionMap.set(c.region, list);
    });

    const byRegion = Array.from(regionMap.entries())
      .map(([region, group]) => {
        const arr = group.reduce((s, c) => s + (c.amount_usd || 0), 0);
        const avgScore =
          group.length > 0
            ? Math.round(group.reduce((s, c) => s + (c.icp_score || 0), 0) / group.length)
            : 0;
        return {
          region,
          count: group.length,
          arr,
          avgScore,
          sharePct: totalArr > 0 ? Math.round((arr / totalArr) * 100) : 0,
        };
      })
      .sort((a, b) => b.arr - a.arr);

    const locMap = new Map<string, { region: Region; list: Contact[] }>();
    customerContacts.forEach((c) => {
      const loc = c.location?.trim() || c.region;
      const existing = locMap.get(loc);
      if (existing) {
        existing.list.push(c);
      } else {
        locMap.set(loc, { region: c.region, list: [c] });
      }
    });

    const byLocation = Array.from(locMap.entries())
      .map(([location, info]) => ({
        location,
        region: info.region,
        count: info.list.length,
        arr: info.list.reduce((s, c) => s + (c.amount_usd || 0), 0),
      }))
      .sort((a, b) => b.arr - a.arr);

    const scoreBandDefs = [
      { label: 'Elite ICP', range: '95–100', min: 95, max: 100, color: 'bg-emerald-500' },
      { label: 'High Fit', range: '90–94', min: 90, max: 94, color: 'bg-blue-500' },
      { label: 'Core Fit', range: '80–89', min: 80, max: 89, color: 'bg-indigo-500' },
      { label: 'Emerging', range: '< 80', min: 0, max: 79, color: 'bg-amber-500' },
    ];

    const byScoreBand = scoreBandDefs.map((band) => {
      const matching = customerContacts.filter((c) => {
        const sc = c.icp_score ?? 0;
        return sc >= band.min && sc <= band.max;
      });
      return {
        label: band.label,
        range: band.range,
        count: matching.length,
        arr: matching.reduce((s, c) => s + (c.amount_usd || 0), 0),
        color: band.color,
      };
    });

    const ownerMap = new Map<string, Contact[]>();
    customerContacts.forEach((c) => {
      const ow = c.owner?.trim() || 'Unassigned';
      const list = ownerMap.get(ow) || [];
      list.push(c);
      ownerMap.set(ow, list);
    });

    const byOwner = Array.from(ownerMap.entries())
      .map(([owner, group]) => ({
        owner,
        count: group.length,
        arr: group.reduce((s, c) => s + (c.amount_usd || 0), 0),
        avgScore:
          group.length > 0
            ? Math.round(group.reduce((s, c) => s + (c.icp_score || 0), 0) / group.length)
            : 0,
      }))
      .sort((a, b) => b.arr - a.arr);

    const topAccounts = [...customerContacts]
      .sort(
        (a, b) =>
          (b.icp_score || 0) - (a.icp_score || 0) || (b.amount_usd || 0) - (a.amount_usd || 0)
      )
      .slice(0, 8);

    const customColumnInsights = customerCustomFields.map((field) => {
      const valueMap = new Map<string, { count: number; arr: number }>();
      let populatedCount = 0;

      customerContacts.forEach((c) => {
        const raw = c.custom_fields?.[field.field_key];
        if (raw === undefined || raw === null || raw === '') return;
        populatedCount += 1;
        const label = typeof raw === 'boolean' ? (raw ? 'Yes' : 'No') : String(raw);
        const curr = valueMap.get(label) || { count: 0, arr: 0 };
        curr.count += 1;
        curr.arr += c.amount_usd || 0;
        valueMap.set(label, curr);
      });

      const breakdown = Array.from(valueMap.entries())
        .map(([label, stats]) => ({ label, ...stats }))
        .sort((a, b) => b.count - a.count || b.arr - a.arr);

      return { field, populatedCount, breakdown };
    });

    return {
      totalAccounts,
      totalArr,
      weightedArr,
      avgAcv,
      avgIcpScore,
      fortune500Count,
      fortune500Arr,
      tierIStats,
      tierIIStats,
      bySector,
      byRegion,
      byLocation,
      byScoreBand,
      byOwner,
      topAccounts,
      customColumnInsights,
    };
  }, [customerContacts, customerCustomFields]);

  const pipelineAnalytics: PipelineAnalytics = useMemo(() => {
    const activeDeals = customerContacts.filter(
      (c) => !c.omit_from_pipeline && c.stage !== '9 No response'
    );
    const qualifiedDeals = activeDeals.filter((c) => !c.stage.startsWith('1 Lead'));
    const leadOnlyDeals = activeDeals.filter((c) => c.stage.startsWith('1 Lead'));

    const actualPipelineArr = activeDeals.reduce((sum, d) => sum + (d.amount_usd || 0), 0);
    const qualifiedPipelineArr = qualifiedDeals.reduce((sum, d) => sum + (d.amount_usd || 0), 0);
    const leadOnlyPipelineArr = leadOnlyDeals.reduce((sum, d) => sum + (d.amount_usd || 0), 0);
    const qualifiedSharePct =
      actualPipelineArr > 0 ? Math.round((qualifiedPipelineArr / actualPipelineArr) * 100) : 0;

    const weightedPipelineArr = activeDeals.reduce(
      (sum, d) => sum + ((d.amount_usd || 0) * (d.probability || 0)) / 100,
      0
    );

    const closedDealsRequired = Math.max(1, Math.round(arrTarget2027 / avgAcvAssumption));
    const recommendedCoverageArr = Math.round(arrTarget2027 * coverageMultiple);
    const coverageGapArr = Math.max(0, recommendedCoverageArr - actualPipelineArr);
    const coverageVsTargetPct =
      recommendedCoverageArr > 0
        ? Math.round((actualPipelineArr / recommendedCoverageArr) * 100)
        : 0;
    const pipelineCoverageMultipleActual =
      arrTarget2027 > 0 ? Number((actualPipelineArr / arrTarget2027).toFixed(2)) : 0;
    const requiredWinRatePct =
      actualPipelineArr > 0 ? Math.round((arrTarget2027 / actualPipelineArr) * 1000) / 10 : 0;

    const avgDealSizeArr =
      activeDeals.length > 0 ? Math.round(actualPipelineArr / activeDeals.length) : 0;
    const weightedWinProbPct =
      actualPipelineArr > 0 ? Math.round((weightedPipelineArr / actualPipelineArr) * 1000) / 10 : 0;
    const weightedAttainmentPct =
      arrTarget2027 > 0 ? Math.round((weightedPipelineArr / arrTarget2027) * 1000) / 10 : 0;
    const weightedArrGap = Math.max(0, arrTarget2027 - weightedPipelineArr);
    const netNewDealsNeeded =
      avgAcvAssumption > 0 ? Math.ceil(coverageGapArr / avgAcvAssumption) : 0;

    const avgAgingDays =
      activeDeals.length > 0
        ? Math.round(activeDeals.reduce((s, d) => s + (d.aging_days || 0), 0) / activeDeals.length)
        : 0;

    const staleDeals = activeDeals
      .filter((d) => (d.aging_days || 0) > 90)
      .sort((a, b) => (b.aging_days || 0) - (a.aging_days || 0));

    const stalePipelineArr = staleDeals.reduce((s, d) => s + (d.amount_usd || 0), 0);
    const stalePipelineSharePct =
      actualPipelineArr > 0 ? Math.round((stalePipelineArr / actualPipelineArr) * 100) : 0;
    const staleWeightedArr = staleDeals.reduce(
      (s, d) => s + ((d.amount_usd || 0) * (d.probability || 0)) / 100,
      0
    );
    const healthyPipelineArr = activeDeals
      .filter((d) => (d.aging_days || 0) <= 60)
      .reduce((s, d) => s + (d.amount_usd || 0), 0);

    const quarterWeights: Record<Quarter, number> = {
      'Q1 2027': 1 / 12,
      'Q2 2027': 2 / 12,
      'Q3 2027': 4 / 12,
      'Q4 2027': 5 / 12,
    };

    let runningTargetArr = 0;
    const quarterly = QUARTERS.map((q) => {
      const weight = quarterWeights[q];
      const weightPct = Math.round(weight * 1000) / 10;
      const qTargetArr = Math.round(arrTarget2027 * weight);
      runningTargetArr += qTargetArr;
      const qClosedRequired = Math.max(1, Math.round(closedDealsRequired * weight));
      const qDeals = activeDeals.filter((d) => (d.expected_close || 'Q2 2027') === q);
      const qQualifiedDeals = qDeals.filter((d) => !d.stage.startsWith('1 Lead'));
      const qActiveQualifiedCount = qQualifiedDeals.length;
      const qQualifiedArr = qQualifiedDeals.reduce((sum, d) => sum + (d.amount_usd || 0), 0);
      const qRequiredPipeline = Math.round(qTargetArr * coverageMultiple);
      const qActualCoverage = qDeals.reduce((sum, d) => sum + (d.amount_usd || 0), 0);
      const qWeightedArr = qDeals.reduce(
        (sum, d) => sum + ((d.amount_usd || 0) * (d.probability || 0)) / 100,
        0
      );
      const qPipelineGapArr = Math.max(0, qRequiredPipeline - qActualCoverage);
      const qNewDealsRequired =
        avgAcvAssumption > 0 ? Math.ceil(qPipelineGapArr / avgAcvAssumption) : 0;
      const qCoverageMultipleActual =
        qTargetArr > 0 ? Number((qActualCoverage / qTargetArr).toFixed(2)) : 0;
      const qCoveragePct =
        qRequiredPipeline > 0 ? Math.round((qActualCoverage / qRequiredPipeline) * 100) : 0;
      const qWeightedAttainmentPct =
        qTargetArr > 0 ? Math.round((qWeightedArr / qTargetArr) * 1000) / 10 : 0;
      const qReqWinRate =
        qActualCoverage > 0 ? Math.round((qTargetArr / qActualCoverage) * 1000) / 10 : 0;

      return {
        quarter: q,
        weightPct,
        targetArr: qTargetArr,
        cumulativeTargetArr: runningTargetArr,
        closedRequired: qClosedRequired,
        activeQualifiedCount: qActiveQualifiedCount,
        qualifiedArr: qQualifiedArr,
        requiredPipeline: qRequiredPipeline,
        actualCoverage: qActualCoverage,
        weightedArr: qWeightedArr,
        pipelineGapArr: qPipelineGapArr,
        newDealsRequired: qNewDealsRequired,
        coverageMultipleActual: qCoverageMultipleActual,
        coveragePct: qCoveragePct,
        weightedAttainmentPct: qWeightedAttainmentPct,
        reqWinRate: qReqWinRate,
      };
    });

    const stageList = CUSTOMER_STAGES.filter((s) => s !== 'All');
    const byStage = stageList.map((st) => {
      const matching = customerContacts.filter((c) => c.stage === st);
      const arr = matching.reduce((s, d) => s + (d.amount_usd || 0), 0);
      const weighted = matching.reduce(
        (s, d) => s + ((d.amount_usd || 0) * (d.probability || 0)) / 100,
        0
      );
      const avgAcv = matching.length > 0 ? Math.round(arr / matching.length) : 0;
      const avgStageAging =
        matching.length > 0
          ? Math.round(matching.reduce((s, d) => s + (d.aging_days || 0), 0) / matching.length)
          : 0;
      return {
        stage: st,
        stageProbPct: STAGE_WIN_PROBABILITIES[st] ?? 0,
        count: matching.length,
        arr,
        sharePct: actualPipelineArr > 0 ? Math.round((arr / actualPipelineArr) * 1000) / 10 : 0,
        weighted,
        avgAcv,
        avgAgingDays: avgStageAging,
      };
    });

    const personas: ('CCO/GC' | 'CAE' | 'CFO' | 'CPO')[] = ['CCO/GC', 'CAE', 'CFO', 'CPO'];
    const byPersona = personas.map((p) => {
      const matching = activeDeals.filter((c) => c.buyer_persona === p);
      const arr = matching.reduce((s, d) => s + (d.amount_usd || 0), 0);
      const weighted = matching.reduce(
        (s, d) => s + ((d.amount_usd || 0) * (d.probability || 0)) / 100,
        0
      );
      const pAvgAging =
        matching.length > 0
          ? Math.round(matching.reduce((s, d) => s + (d.aging_days || 0), 0) / matching.length)
          : 0;
      return {
        persona: p,
        count: matching.length,
        arr,
        weighted,
        sharePct: actualPipelineArr > 0 ? Math.round((arr / actualPipelineArr) * 1000) / 10 : 0,
        avgAgingDays: pAvgAging,
      };
    });

    const activeRegions: Region[] = ['US', 'India', 'UAE', 'Singapore', 'UK/Europe'];
    const byRegion = activeRegions.map((reg) => {
      const matching = activeDeals.filter((c) => c.region === reg);
      const arr = matching.reduce((s, d) => s + (d.amount_usd || 0), 0);
      const weighted = matching.reduce(
        (s, d) => s + ((d.amount_usd || 0) * (d.probability || 0)) / 100,
        0
      );
      return {
        region: reg,
        count: matching.length,
        arr,
        weighted,
        sharePct: actualPipelineArr > 0 ? Math.round((arr / actualPipelineArr) * 1000) / 10 : 0,
      };
    });

    const agingBuckets = [
      {
        label: '0–30 Days (Fresh)',
        deals: activeDeals.filter((d) => (d.aging_days || 0) <= 30),
        color: 'bg-emerald-500',
      },
      {
        label: '31–60 Days (Active)',
        deals: activeDeals.filter((d) => (d.aging_days || 0) > 30 && (d.aging_days || 0) <= 60),
        color: 'bg-blue-500',
      },
      {
        label: '61–90 Days (Watch)',
        deals: activeDeals.filter((d) => (d.aging_days || 0) > 60 && (d.aging_days || 0) <= 90),
        color: 'bg-amber-500',
      },
      {
        label: '90+ Days (Stale Alert)',
        deals: activeDeals.filter((d) => (d.aging_days || 0) > 90),
        color: 'bg-rose-500',
      },
    ];

    const velocityCheckpoints = [90, 75, 60, 45, 30, 15, 0];
    const velocityTrend90d = velocityCheckpoints.map((daysAgo) => {
      const dealsAtPoint = activeDeals.filter((d) => (d.aging_days || 0) >= daysAgo);
      const activeArr = dealsAtPoint.reduce((s, d) => s + (d.amount_usd || 0), 0);
      const weightedArr = dealsAtPoint.reduce(
        (s, d) => s + ((d.amount_usd || 0) * (d.probability || 0)) / 100,
        0
      );
      const staleLeakageArr = dealsAtPoint
        .filter((d) => Math.max(1, (d.aging_days || 0) - daysAgo) > 90)
        .reduce((s, d) => s + (d.amount_usd || 0), 0);
      const avgAge =
        dealsAtPoint.length > 0
          ? Math.round(
              dealsAtPoint.reduce(
                (s, d) => s + Math.max(1, (d.aging_days || 0) - daysAgo),
                0
              ) / dealsAtPoint.length
            )
          : 0;
      const velocityMonthlyUsd =
        dealsAtPoint.length > 0 ? (weightedArr / Math.max(30, avgAge)) * 30 : 0;

      return {
        label: daysAgo === 0 ? 'Today' : `-${daysAgo}d`,
        daysAgo,
        activeDealsCount: dealsAtPoint.length,
        activeArrM: Number((activeArr / 1_000_000).toFixed(2)),
        weightedArrM: Number((weightedArr / 1_000_000).toFixed(2)),
        staleLeakageArrM: Number((staleLeakageArr / 1_000_000).toFixed(2)),
        velocityPerMonthM: Number((velocityMonthlyUsd / 1_000_000).toFixed(2)),
        avgAgeDays: avgAge,
      };
    });

    const funnelStages: {
      stageKey: string;
      stageLabel: string;
      rank: number;
      benchmarkPct: number;
    }[] = [
      { stageKey: '1 Lead', stageLabel: '1 Lead', rank: 1, benchmarkPct: 100 },
      { stageKey: '2 Qualified', stageLabel: '2 Qualified', rank: 2, benchmarkPct: 80 },
      {
        stageKey: '4 Decisionmaker buy in',
        stageLabel: '4 Decisionmaker',
        rank: 3,
        benchmarkPct: 55,
      },
      {
        stageKey: '5 Internal Review Pending',
        stageLabel: '5 Internal Review',
        rank: 4,
        benchmarkPct: 35,
      },
      {
        stageKey: '6 Commercial / Contracting',
        stageLabel: '6 Contracting',
        rank: 5,
        benchmarkPct: 22,
      },
      { stageKey: '7 Closed Won', stageLabel: '7 Closed Won', rank: 6, benchmarkPct: 18 },
    ];

    const getStageRank = (st: string) => {
      if (st === '9 No response') return 0;
      const found = funnelStages.find((f) => f.stageKey === st);
      return found ? found.rank : 1;
    };

    const funnelCohort = customerContacts.filter((c) => !c.omit_from_pipeline);
    const cohortCount = funnelCohort.length;

    let prevConvPct = 100;
    const stageConversion90d = funnelStages.map((fs, idx) => {
      const reachedDeals =
        fs.rank === 1
          ? funnelCohort
          : funnelCohort.filter((c) => getStageRank(c.stage) >= fs.rank);
      const reachedCount = reachedDeals.length;
      const reachedArrM = Number(
        (reachedDeals.reduce((s, d) => s + (d.amount_usd || 0), 0) / 1_000_000).toFixed(2)
      );
      const conversionPct =
        cohortCount > 0 ? Math.round((reachedCount / cohortCount) * 1000) / 10 : 0;
      const healthyDeals = reachedDeals.filter(
        (c) => c.stage !== '9 No response' && (c.aging_days || 0) <= 90
      );
      const healthyConversionPct =
        cohortCount > 0 ? Math.round((healthyDeals.length / cohortCount) * 1000) / 10 : 0;
      const leakagePct = Math.round((100 - healthyConversionPct) * 10) / 10;
      const dropOffFromPrevPct =
        idx === 0 ? 0 : Math.max(0, Math.round((prevConvPct - conversionPct) * 10) / 10);
      prevConvPct = conversionPct;

      const stalledOver90dCount = funnelCohort.filter(
        (c) => c.stage === fs.stageKey && (c.aging_days || 0) > 90
      ).length;

      return {
        stageKey: fs.stageKey,
        stageLabel: fs.stageLabel,
        reachedCount,
        reachedArrM,
        conversionPct,
        healthyConversionPct,
        leakagePct,
        dropOffFromPrevPct,
        benchmarkPct: fs.benchmarkPct,
        stalledOver90dCount,
      };
    });

    return {
      activeDealsCount: activeDeals.length,
      qualifiedDealsCount: qualifiedDeals.length,
      actualPipelineArr,
      qualifiedPipelineArr,
      qualifiedSharePct,
      leadOnlyPipelineArr,
      weightedPipelineArr,
      closedDealsRequired,
      coverageMultiple,
      recommendedCoverageArr,
      coverageGapArr,
      coverageVsTargetPct,
      pipelineCoverageMultipleActual,
      requiredWinRatePct,
      avgDealSizeArr,
      weightedWinProbPct,
      weightedAttainmentPct,
      weightedArrGap,
      netNewDealsNeeded,
      avgAgingDays,
      stalePipelineArr,
      stalePipelineSharePct,
      staleWeightedArr,
      healthyPipelineArr,
      quarterly,
      byStage,
      byPersona,
      byRegion,
      agingBuckets,
      staleDeals,
      velocityTrend90d,
      stageConversion90d,
    };
  }, [customerContacts, arrTarget2027, avgAcvAssumption, coverageMultiple]);

  const investorAnalytics: InvestorAnalytics = useMemo(() => {
    const total = investorContacts.length;
    const usInstSeedContacts = investorContacts.filter((c) => c.us_inst_seed_track);
    const usInstSeedCount = usInstSeedContacts.length;

    const isInvestorSent = (c: Contact) =>
      Boolean(c.sent_at) ||
      [
        'Sent',
        'Reminder Sent',
        'Reminder Sched',
        'Portal Visited',
        'Replied',
        'Meeting',
        'Diligence',
        'SAFE Signed',
      ].includes(c.stage);

    const isInvestorScheduled = (c: Contact) => c.stage === 'Scheduled';

    const sentCount = investorContacts.filter(isInvestorSent).length;
    const scheduledCount = investorContacts.filter(isInvestorScheduled).length;
    const contactedCount = sentCount + scheduledCount;
    const activeOutreachCount = contactedCount;

    const openedCount = investorContacts.filter(
      (c) =>
        (c.email_opened && (c.opened_duration_sec === undefined || c.opened_duration_sec >= 10)) ||
        ['Portal Visited', 'Replied', 'Meeting', 'Diligence', 'SAFE Signed'].includes(c.stage)
    ).length;
    const openRatePct =
      sentCount > 0 ? Math.round((openedCount / sentCount) * 100) : 0;

    const portalVisitsCount = investorContacts.filter(
      (c) =>
        c.portal_visited ||
        ['Portal Visited', 'Meeting', 'Diligence', 'SAFE Signed'].includes(c.stage)
    ).length;

    const meetingsOrDiligenceCount = investorContacts.filter((c) =>
      ['Meeting', 'Diligence', 'SAFE Signed'].includes(c.stage)
    ).length;

    const passedCount = investorContacts.filter(
      (c) => c.stage === 'Passed' || c.outcome === 'Pass' || c.unsubscribed
    ).length;

    const activeExclPassesCount = Math.max(0, activeOutreachCount - passedCount);

    const committedSafeUsd = investorContacts
      .filter((c) => c.stage === 'SAFE Signed')
      .reduce((s, c) => s + (c.amount_usd || 0), 0);

    const softCircledDiligenceUsd = investorContacts
      .filter(
        (c) =>
          c.stage !== 'SAFE Signed' &&
          !c.unsubscribed &&
          (c.outcome === 'Soft Circle' || ['Meeting', 'Diligence'].includes(c.stage))
      )
      .reduce((s, c) => s + (c.amount_usd || 0), 0);

    const remainingToCloseUsd = Math.max(
      0,
      seedRoundTarget - (committedSafeUsd + softCircledDiligenceUsd)
    );

    const usSeedDenom = Math.max(1, usInstSeedCount);
    const catASentCount = usInstSeedContacts.filter(
      (c) => c.execution_wave === 'Cat A: Reminder Sent'
    ).length;
    const catBSchedCount = usInstSeedContacts.filter(
      (c) => c.execution_wave === 'Cat B: Reminder Scheduled'
    ).length;
    const wave1SchedCount = usInstSeedContacts.filter(
      (c) => c.execution_wave === 'Wave 1 Lead' && c.stage === 'Scheduled'
    ).length;
    const wave1QueueCount = usInstSeedContacts.filter(
      (c) => c.execution_wave === 'Wave 1 Lead' && c.stage === 'Not sent'
    ).length;
    const wave2QueueCount = usInstSeedContacts.filter(
      (c) => c.execution_wave === 'Wave 2 Co-Investors' && c.stage === 'Not sent'
    ).length;
    const usPortalCount = usInstSeedContacts.filter(
      (c) =>
        c.portal_visited ||
        ['Portal Visited', 'Meeting', 'Diligence', 'SAFE Signed'].includes(c.stage)
    ).length;
    const usMeetingsCount = usInstSeedContacts.filter((c) =>
      ['Meeting', 'Diligence', 'SAFE Signed'].includes(c.stage)
    ).length;

    const pct1 = (n: number, denom: number) => Math.round((n / denom) * 1000) / 10;

    const usSeedBreakdown = [
      { label: 'Cat A: Reminder Sent (10 Nov)', count: catASentCount, sharePct: pct1(catASentCount, usSeedDenom) },
      { label: 'Cat B: Reminder Scheduled (Tonight)', count: catBSchedCount, sharePct: pct1(catBSchedCount, usSeedDenom) },
      { label: 'Wave 1 Leads: Scheduled for 11 Nov', count: wave1SchedCount, sharePct: pct1(wave1SchedCount, usSeedDenom) },
      { label: 'Wave 1 Leads: Remaining Queue', count: wave1QueueCount, sharePct: pct1(wave1QueueCount, usSeedDenom) },
      { label: 'Wave 2 Co-Investors: Remaining Queue', count: wave2QueueCount, sharePct: pct1(wave2QueueCount, usSeedDenom) },
      { label: 'Portal Visits Logged', count: usPortalCount, sharePct: pct1(usPortalCount, usSeedDenom) },
      { label: 'Meetings Booked', count: usMeetingsCount, sharePct: pct1(usMeetingsCount, usSeedDenom) },
      { label: 'Total Active US Institutional Seed Funds', count: usInstSeedCount, sharePct: 100.0, isHighlight: true },
    ];

    const trackNames = [
      'Cat A: Reminder Sent',
      'Cat B: Reminder Scheduled',
      'Wave 1 Lead',
      'Wave 2 Co-Investors',
      'India / UAE / Singapore Strategic & Family Offices',
      'Closed: Passed',
    ];

    const byTrack = trackNames.map((track) => {
      const group = investorContacts.filter((c) => c.execution_wave === track);
      return {
        track,
        count: group.length,
        sharePct: total > 0 ? Math.round((group.length / total) * 1000) / 10 : 0,
        opened: group.filter((c) => c.email_opened).length,
        portalVisited: group.filter((c) => c.portal_visited).length,
        meetings: group.filter((c) =>
          ['Replied', 'Meeting', 'Diligence', 'SAFE Signed'].includes(c.stage)
        ).length,
      };
    });

    const priorities: ('P1' | 'P2' | 'P3' | 'P4')[] = ['P1', 'P2', 'P3', 'P4'];
    const byPriority = priorities.map((p) => {
      const group = investorContacts.filter((c) => c.priority_tier === p);
      return {
        priority: p,
        targets: group.length,
        sent: group.filter(isInvestorSent).length,
        scheduled: group.filter(isInvestorScheduled).length,
        opened: group.filter(
          (c) =>
            (c.email_opened && (c.opened_duration_sec === undefined || c.opened_duration_sec >= 10)) ||
            ['Portal Visited', 'Replied', 'Meeting', 'Diligence', 'SAFE Signed'].includes(c.stage)
        ).length,
        portalVisits: group.filter(
          (c) =>
            c.portal_visited ||
            ['Portal Visited', 'Meeting', 'Diligence', 'SAFE Signed'].includes(c.stage)
        ).length,
        meetings: group.filter((c) => ['Meeting', 'Diligence', 'SAFE Signed'].includes(c.stage))
          .length,
        passed: group.filter((c) => c.stage === 'Passed' || c.outcome === 'Pass' || c.unsubscribed).length,
      };
    });

    const priorityTotals = byPriority.reduce(
      (acc, r) => ({
        targets: acc.targets + r.targets,
        sent: acc.sent + r.sent,
        scheduled: acc.scheduled + r.scheduled,
        opened: acc.opened + r.opened,
        portalVisits: acc.portalVisits + r.portalVisits,
        meetings: acc.meetings + r.meetings,
        passed: acc.passed + r.passed,
      }),
      { targets: 0, sent: 0, scheduled: 0, opened: 0, portalVisits: 0, meetings: 0, passed: 0 }
    );

    const hotSignals = investorContacts.filter(
      (c) =>
        !c.unsubscribed &&
        c.stage !== 'Passed' &&
        (c.portal_visited || c.email_opened) &&
        !['Meeting', 'Diligence', 'SAFE Signed'].includes(c.stage)
    );

    return {
      total,
      usInstSeedCount,
      contactedCount,
      sentCount,
      scheduledCount,
      activeOutreachCount,
      activeExclPassesCount,
      openedCount,
      openRatePct,
      portalVisitsCount,
      meetingsOrDiligenceCount,
      passedCount,
      committedSafeUsd,
      softCircledDiligenceUsd,
      remainingToCloseUsd,
      usSeedBreakdown,
      byTrack,
      byPriority,
      priorityTotals,
      hotSignals,
    };
  }, [investorContacts]);

  // ============================================================================
  // COMPOSER RECIPIENT POOL
  // ============================================================================

  const composerPool = useMemo(() => {
    const base = compAudience === 'customer' ? customerContacts : investorContacts;
    const suppressedCount = base.filter(
      (c) => c.unsubscribed || c.stage === 'Passed'
    ).length;
    const eligible = base.filter((c) => !c.unsubscribed && c.stage !== 'Passed');
    return { eligible, suppressedCount };
  }, [compAudience, customerContacts, investorContacts]);

  useEffect(() => {
    const pending = pendingComposerDraftRef.current;
    if (pending) {
      pendingComposerDraftRef.current = null;
      const eligibleSet = new Set(composerPool.eligible.map((c) => c.id));
      const matched = pending.contactIds.filter((id) => eligibleSet.has(id));
      setCompSelectedIds(matched.length > 0 ? matched : composerPool.eligible.map((c) => c.id));
      if (pending.subject) setCompSubject(pending.subject);
      if (pending.bodyTemplate) setCompBody(pending.bodyTemplate);
      setPreviewIdx(0);
      return;
    }
    setCompSelectedIds(composerPool.eligible.map((c) => c.id));
    setPreviewIdx(0);
  }, [composerPool.eligible]);

  const activeComposerRecipients = useMemo(
    () => composerPool.eligible.filter((c) => compSelectedIds.includes(c.id)),
    [composerPool.eligible, compSelectedIds]
  );

  const selectedContact = useMemo(
    () => accessibleContacts.find((c) => c.id === selectedContactId) || null,
    [accessibleContacts, selectedContactId]
  );

  useEffect(() => {
    if (selectedContactId && !accessibleContacts.some((c) => c.id === selectedContactId)) {
      setSelectedContactId(null);
    }
    if (!perms.can_view_customers && dossierTarget) {
      setDossierTarget(null);
    }
  }, [selectedContactId, accessibleContacts, perms.can_view_customers, dossierTarget]);

  // ============================================================================
  // MUTATION HANDLERS
  // ============================================================================

  const deleteContact = (id: string) => {
    const target = contacts.find((c) => c.id === id);
    if (!target) return;
    const canDelete =
      target.contact_type === "investor" ? perms.can_edit_investors : perms.can_edit_customers;
    if (!canDelete) {
      showToast("Permission denied: cannot delete contacts in this domain.");
      return;
    }
    setContacts((prev) => prev.filter((c) => c.id !== id));
    setCompSelectedIds((prev) => prev.filter((cid) => cid !== id));
    if (selectedContactId === id) setSelectedContactId(null);
    if (isLiveConnected) {
      const client = buildSupabaseClient(supabaseUrl, supabaseAnonKey);
      if (client) void deleteContactFromSupabase(client, id);
    }
    showToast(`Deleted ${target.full_name} (${target.organization}) from database`);
  };

  const updateContact = (id: string, patch: Partial<Contact>) => {
    setContacts((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const updated = { ...c, ...patch };
        if (isLiveConnected) {
          const client = buildSupabaseClient(supabaseUrl, supabaseAnonKey);
          if (client) void upsertSingleContactToSupabase(client, updated);
        }
        return updated;
      })
    );
  };

  const updateCustomFieldValue = (
    contactId: string,
    fieldKey: string,
    value: string | number | boolean
  ) => {
    setContacts((prev) =>
      prev.map((c) => {
        if (c.id !== contactId) return c;
        const updated = { ...c, custom_fields: { ...c.custom_fields, [fieldKey]: value } };
        if (isLiveConnected) {
          const client = buildSupabaseClient(supabaseUrl, supabaseAnonKey);
          if (client) void upsertSingleContactToSupabase(client, updated);
        }
        return updated;
      })
    );
  };

  const handleAddContact = (newContact: Omit<Contact, 'id'>) => {
    const canAdd =
      newContact.contact_type === 'investor' ? perms.can_edit_investors : perms.can_edit_customers;
    if (!canAdd) {
      showToast('Permission denied for creating contacts in this segment.');
      return;
    }
    const created: Contact = {
      ...newContact,
      delivery_status: 'not_sent',
      id: `${newContact.contact_type === 'customer' ? 'cust' : 'inv'}_${Date.now()}`,
    };
    setContacts((prev) => [created, ...prev]);
    if (isLiveConnected) {
      const client = buildSupabaseClient(supabaseUrl, supabaseAnonKey);
      if (client) void upsertSingleContactToSupabase(client, created);
    }
    setIsAddContactOpen(false);
    showToast(`Added ${created.full_name} (${created.organization}) — Live dashboards updated`);
  };

  const handleSheetBulkImport = (
    imported: Contact[],
    newCustomFields: CustomFieldDefinition[]
  ) => {
    const existingKeys = new Set(customFields.map((f) => f.field_key));
    const uniqueNewFields =
      newCustomFields.length > 0 && perms.can_manage_schema
        ? newCustomFields.filter((f) => !existingKeys.has(f.field_key))
        : [];
    if (uniqueNewFields.length > 0) {
      setCustomFields((prev) => [...prev, ...uniqueNewFields]);
    }

    const byEmail = new Map(contacts.map((c) => [c.email.toLowerCase(), c]));
    const fresh: Contact[] = [];
    const touchedContacts: Contact[] = [];

    imported.forEach((imp) => {
      const existing = byEmail.get(imp.email.toLowerCase());
      if (existing) {
        const merged: Contact = {
          ...existing,
          ...imp,
          id: existing.id,
          custom_fields: { ...existing.custom_fields, ...imp.custom_fields },
        };
        byEmail.set(imp.email.toLowerCase(), merged);
        touchedContacts.push(merged);
      } else {
        const created: Contact = { ...imp, delivery_status: imp.delivery_status || 'not_sent' };
        fresh.push(created);
        touchedContacts.push(created);
      }
    });

    setContacts([...fresh, ...Array.from(byEmail.values())]);

    if (isLiveConnected) {
      const client = buildSupabaseClient(supabaseUrl, supabaseAnonKey);
      if (client) {
        void syncStateToSupabase(client, touchedContacts, uniqueNewFields, telemetry);
      }
    }

    setIsCsvModalOpen(false);
    const colMsg =
      uniqueNewFields.length > 0
        ? ` and auto-created ${uniqueNewFields.length} new data column${
            uniqueNewFields.length === 1 ? '' : 's'
          }`
        : '';
    showToast(`Imported ${imported.length} rows${colMsg} — Customer Insights updated`);
  };

  const jumpToComposerForContact = (
    contact: Contact,
    customSubject?: string,
    customDraft?: string
  ) => {
    if (!perms.can_send_campaigns) {
      showToast('Permission denied: requires can_send_campaigns.');
      return;
    }
    const canViewDomain =
      contact.contact_type === 'investor' ? perms.can_view_investors : perms.can_view_customers;
    if (!canViewDomain) {
      showToast(
        contact.contact_type === 'investor'
          ? 'Access denied: requires can_view_investors.'
          : 'Access denied: requires can_view_customers.'
      );
      return;
    }
    pendingComposerDraftRef.current = {
      contactIds: [contact.id],
      subject: customSubject,
      bodyTemplate: customDraft,
    };
    setCompAudience(contact.contact_type);
    setCompPortalLink(
      customDraft &&
        (customDraft.includes('overview.fortifai.io') ||
          customDraft.includes('investor.fortifai.io') ||
          customDraft.includes('{{portal_link}}'))
        ? contact.contact_type === 'investor'
          ? 'investor'
          : 'overview'
        : 'none'
    );
    setCompFilterResetSeq((prev) => prev + 1);
    setCompSelectedIds([contact.id]);
    if (customSubject) setCompSubject(customSubject);
    if (customDraft) setCompBody(customDraft);
    setPreviewIdx(0);
    setActiveTab(contact.contact_type === 'investor' ? 'investor_outreach' : 'customer_outreach');
  };

  const handleDraftFromAskMe = (
    contactIds: string[],
    audienceType: ContactType,
    subject?: string,
    bodyTemplate?: string
  ) => {
    if (!perms.can_send_campaigns) {
      showToast('Permission denied: requires can_send_campaigns.');
      return;
    }
    const canViewDomain =
      audienceType === 'investor' ? perms.can_view_investors : perms.can_view_customers;
    if (!canViewDomain) {
      showToast(
        audienceType === 'investor'
          ? 'Access denied: requires can_view_investors.'
          : 'Access denied: requires can_view_customers.'
      );
      return;
    }
    pendingComposerDraftRef.current = {
      contactIds,
      subject,
      bodyTemplate,
    };
    setCompAudience(audienceType);
    setCompPortalLink(
      bodyTemplate &&
        (bodyTemplate.includes('overview.fortifai.io') ||
          bodyTemplate.includes('investor.fortifai.io') ||
          bodyTemplate.includes('{{portal_link}}'))
        ? audienceType === 'investor'
          ? 'investor'
          : 'overview'
        : 'none'
    );
    setCompFilterResetSeq((prev) => prev + 1);
    setCompSelectedIds(contactIds);
    if (subject) setCompSubject(subject);
    if (bodyTemplate) setCompBody(bodyTemplate);
    setPreviewIdx(0);
    setIsAskMeOpen(false);
    setActiveTab(audienceType === 'investor' ? 'investor_outreach' : 'customer_outreach');
    showToast(
      `Loaded ${contactIds.length} contacts into ${
        audienceType === 'investor' ? 'Investor Outreach' : 'Customer Outreach'
      } for review`
    );
  };

  const handleSendAskMeMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || askMeLoading) return;

    const userMsg: AskMeChatMessage = {
      id: `ask_u_${Date.now()}`,
      role: 'user',
      text: trimmed,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const nextHistory = [...askMeMessages, userMsg];
    setAskMeMessages(nextHistory);
    setAskMeLoading(true);

    try {
      let token = sessionToken;
      if (!token) {
        const simRole = isSimulating ? simulatedRole || currentUser.role : null;
        const sessionRes = await issueServerSession(authenticatedUser, {
          simulateRole: simRole,
          simulatePermissions: simRole ? perms : undefined,
        });
        token = sessionRes.token || null;
      }

      const resp = await fetch('/api/ask-me', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          messages: nextHistory.map((m) => ({
            role: m.role,
            text: m.role === 'assistant' && m.structured ? m.structured.summary : m.text,
          })),
          crmState: {
            contacts: accessibleContacts,
            customFields: accessibleCustomFields,
            telemetry: accessibleTelemetry,
            arrTarget2027: perms.can_view_customers ? arrTarget2027 : undefined,
            supabaseUrl,
            supabaseAnonKey,
          },
        }),
      });

      const data = (await resp.json()) as {
        ok?: boolean;
        message?: AskMeStructuredPayload;
        error?: string;
      };

      if (!resp.ok || !data.ok || !data.message) {
        setAskMeMessages((prev) => [
          ...prev,
          {
            id: `ask_a_${Date.now()}`,
            role: 'assistant',
            text: data.error || 'Unable to process query.',
            error: data.error || 'Unable to process query.',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
        return;
      }

      setAskMeMessages((prev) => [
        ...prev,
        {
          id: `ask_a_${Date.now()}`,
          role: 'assistant',
          text: data.message!.summary,
          structured: data.message,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch {
      setAskMeMessages((prev) => [
        ...prev,
        {
          id: `ask_a_${Date.now()}`,
          role: 'assistant',
          text: 'Network error communicating with /api/ask-me.',
          error: 'Network error communicating with /api/ask-me.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setAskMeLoading(false);
    }
  };

  const handleFetchAccountDossier = async (
    target: {
      contactId: string;
      organization: string;
      industry?: string;
      region?: string;
      icpScore?: number;
      targetArr?: number;
    },
    forceRefresh = false
  ) => {
    if (!perms.can_view_customers) {
      showToast('Permission denied: requires can_view_customers.');
      return;
    }
    const orgKey = target.organization.toLowerCase();
    const existing = dossiersByOrg[orgKey];
    if (!forceRefresh && existing) {
      setDossierCached(true);
      setDossierError(null);
      return;
    }

    setDossierLoading(true);
    setDossierError(null);
    try {
      let token = sessionToken;
      if (!token) {
        const simRole = isSimulating ? simulatedRole || currentUser.role : null;
        const sessionRes = await issueServerSession(authenticatedUser, {
          simulateRole: simRole,
          simulatePermissions: simRole ? perms : undefined,
        });
        token = sessionRes.token || null;
      }

      const orgContacts = contacts.filter(
        (c) =>
          c.contact_type === 'customer' &&
          c.organization.toLowerCase() === orgKey
      );
      const orgContactIds = new Set(orgContacts.map((c) => c.id));
      const orgTelemetry = telemetry.filter((t) => orgContactIds.has(t.contact_id));

      const resp = await fetch('/api/generate-dossier', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          contactId: target.contactId,
          organization: target.organization,
          industry: target.industry,
          region: target.region,
          icpScore: target.icpScore,
          targetArr: target.targetArr,
          forceRefresh,
          contactsInOrg: orgContacts,
          telemetryEvents: orgTelemetry,
        }),
      });

      const data = (await resp.json()) as {
        ok?: boolean;
        cached?: boolean;
        dossier?: AccountDossier;
        error?: string;
      };

      if (!resp.ok || !data.ok || !data.dossier) {
        setDossierError(data.error || 'Failed to generate Account Intelligence Dossier.');
        return;
      }

      setDossierCached(Boolean(data.cached));
      setDossiersByOrg((prev) => ({
        ...prev,
        [orgKey]: data.dossier!,
      }));
    } catch {
      setDossierError('Network error communicating with /api/generate-dossier.');
    } finally {
      setDossierLoading(false);
    }
  };

  const handleOpenAccountIntelligence = (contact: Contact) => {
    const target = {
      contactId: contact.id,
      organization: contact.organization,
      industry: contact.industry,
      region: contact.region,
      icpScore: contact.icp_score,
      targetArr: contact.amount_usd,
    };
    setDossierTarget(target);
    void handleFetchAccountDossier(target, false);
  };

  const renderEmailTemplate = (template: string, contact?: Contact): string => {
    if (!contact) return template;
    let output = template
      .replace(/\{\{first_name\}\}/g, contact.first_name || 'there')
      .replace(/\{\{last_name\}\}/g, contact.last_name || '')
      .replace(/\{\{organization\}\}/g, contact.organization || 'your team')
      .replace(/\{\{title\}\}/g, contact.title || 'Leader')
      .replace(/\{\{region\}\}/g, contact.region || 'your region')
      .replace(/\{\{contact_id\}\}/g, contact.id)
      .replace(
        /\{\{custom_hook\}\}/g,
        contact.custom_hook ||
          `Given ${contact.organization}'s focus on enterprise resilience, I wanted to share a brief update on Fortifai.`
      );

    accessibleCustomFields.forEach((cf) => {
      const regex = new RegExp(`\\{\\{custom\\.${cf.field_key}\\}\\}`, 'g');
      const val = contact.custom_fields?.[cf.field_key];
      output = output.replace(regex, val !== undefined && val !== '' ? String(val) : '—');
    });

    return output;
  };

  const handleSendBatch = async () => {
    if (!perms.can_send_campaigns) {
      showToast('Permission denied: requires can_send_campaigns.');
      return;
    }
    if (activeComposerRecipients.length === 0) return;

    setSendingBatch(true);
    try {
      let token = sessionToken;
      if (!token) {
        const simRole = isSimulating ? simulatedRole || currentUser.role : null;
        const sessionRes = await issueServerSession(authenticatedUser, {
          simulateRole: simRole,
          simulatePermissions: simRole ? perms : undefined,
        });
        if (!sessionRes.ok || !sessionRes.token) {
          showToast(sessionRes.error || 'Authentication required to send campaigns.');
          setSendingBatch(false);
          return;
        }
        token = sessionRes.token;
      }

      const bccAddress = compBccEnabled ? currentUser.email : undefined;
      const resolveContactSender = (contact: Contact): string => {
        if (!compUseAssignedOwnerSender) return compSendFrom;
        const ownerUser =
          activeUsers.find((u) => u.id === contact.owner_id) ||
          activeUsers.find(
            (u) => u.email.toLowerCase() === (contact.owner_email || '').toLowerCase()
          );
        return ownerUser ? formatUserSenderIdentity(ownerUser) : formatUserSenderIdentity(currentUser);
      };

      const payloadRecipients = activeComposerRecipients.map((r) => ({
        id: r.id,
        email: r.email,
        name: r.full_name,
        subject: renderEmailTemplate(compSubject, r),
        text: renderEmailTemplate(compBody, r),
        ...(compUseAssignedOwnerSender ? { from: resolveContactSender(r) } : {}),
      }));

      const effectiveAudience: ContactType =
        activeTab === 'investor_outreach'
          ? 'investor'
          : activeTab === 'customer_outreach'
          ? 'customer'
          : compAudience;

      const effectivePortalLinkMode: PortalLinkMode =
        effectiveAudience === 'investor'
          ? compPortalLink === 'investor'
            ? 'investor'
            : 'none'
          : compPortalLink === 'overview'
          ? 'overview'
          : 'none';

      const resp = await fetch('/api/send-batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          audienceType: effectiveAudience,
          senderMode: compUseAssignedOwnerSender ? 'deal_owner' : 'selected',
          portalLinkMode: effectivePortalLinkMode,
          from: compSendFrom,
          ...(bccAddress ? { bcc: bccAddress } : {}),
          recipients: payloadRecipients,
        }),
      });

      const data = (await resp.json()) as {
        ok: boolean;
        mode?: 'resend' | 'sandbox';
        safeModeBlocked?: boolean;
        blockedCount?: number;
        bcc?: string | null;
        error?: string;
        results?: {
          contact_id: string;
          email: string;
          from?: string;
          status: 'delivered' | 'bounced' | 'blocked';
          resend_id?: string;
          error?: string;
        }[];
      };

      if (!resp.ok || !data.ok || !data.results) {
        showToast(data.error || 'Failed to dispatch batch via /api/send-batch');
        setSendingBatch(false);
        return;
      }

      const nowIso = new Date().toISOString();
      const resultMap = new Map(data.results.map((r) => [r.contact_id, r]));

      setContacts((prev) =>
        prev.map((c) => {
          const res = resultMap.get(c.id);
          if (!res || res.status === 'blocked') return c;
          const isBounced = res.status === 'bounced';
          return {
            ...c,
            last_contacted_at: nowIso,
            delivery_status: isBounced ? 'bounced' : 'delivered',
            sent_at: nowIso,
            ...(isBounced
              ? { bounced_at: 'Just now', bounced_reason: res.error || 'Delivery bounced' }
              : { delivered_at: 'Just now' }),
            stage:
              c.stage === 'Not sent' || c.stage === 'Scheduled'
                ? 'Sent'
                : c.stage === 'Reminder Sched'
                ? 'Reminder Sent'
                : c.stage,
          };
        })
      );

      const newEvents: TelemetryEvent[] = activeComposerRecipients
        .filter((r) => resultMap.get(r.id)?.status !== 'blocked')
        .map((r, i) => {
          const res = resultMap.get(r.id);
          const isBounced = res?.status === 'bounced';
          const resolvedFrom = res?.from || resolveContactSender(r);
          return {
            id: `evt_${Date.now()}_${i}`,
            contact_id: r.id,
            contact_name: r.full_name,
            organization: r.organization,
            contact_type: r.contact_type,
            source: 'resend',
            event_type: isBounced ? 'email_bounced' : 'email_delivered',
            detail: isBounced
              ? `Bounce: ${res?.error || 'Delivery error'}`
              : `Delivered "${renderEmailTemplate(compSubject, r).slice(0, 44)}..." (${
                  data.mode === 'resend' ? 'Resend Live' : 'Sandbox Relay'
                })`,
            timestamp: 'Just now',
            sender_from: resolvedFrom,
            ...(bccAddress ? { bcc_inbox: bccAddress } : {}),
          };
        });

      if (newEvents.length > 0) {
        setTelemetry((prev) => [...newEvents, ...prev]);
      }
      const deliveredCount = data.results.filter((r) => r.status === 'delivered').length;
      const blockedCount = data.results.filter((r) => r.status === 'blocked').length;
      showToast(
        `Dispatched ${deliveredCount}/${activeComposerRecipients.length} emails via /api/send-batch${
          blockedCount > 0 ? ` (${blockedCount} blocked by Safe Mode Guard)` : ''
        }${
          compUseAssignedOwnerSender ? ' (Deal Owner routing)' : ''
        }${bccAddress ? ` · BCC synced to ${bccAddress}` : ''}`
      );
      setActiveTab(
        activeTab === 'investor_outreach' || compAudience === 'investor'
          ? 'investor_telemetry'
          : 'customer_telemetry'
      );
    } catch {
      showToast('Network error calling /api/send-batch.');
    } finally {
      setSendingBatch(false);
    }
  };

  const handleSendTestToMe = async () => {
    if (!perms.can_send_campaigns) {
      showToast('Permission denied: requires can_send_campaigns.');
      return;
    }

    const cleanOwnerEmail = currentUser.email.trim().toLowerCase();
    const testTargetEmail = cleanOwnerEmail.includes('@') ? cleanOwnerEmail : 'varun@fortifai.io';

    const sample =
      activeComposerRecipients[
        Math.min(previewIdx, Math.max(0, activeComposerRecipients.length - 1))
      ] ||
      activeComposerRecipients[0] ||
      composerPool.eligible[0];

    const effectiveAudience: ContactType =
      activeTab === 'investor_outreach'
        ? 'investor'
        : activeTab === 'customer_outreach'
        ? 'customer'
        : compAudience;

    const renderedSubject = renderEmailTemplate(compSubject || 'Fortifai Outreach Preview', sample);
    const renderedBody = renderEmailTemplate(
      compBody || 'Test preview from Fortifai Scale.',
      sample
    );
    const resolvedFrom = compUseAssignedOwnerSender
      ? formatUserSenderIdentity(currentUser)
      : compSendFrom;

    setSendingTest(true);
    try {
      let token = sessionToken;
      if (!token) {
        const simRole = isSimulating ? simulatedRole || currentUser.role : null;
        const sessionRes = await issueServerSession(authenticatedUser, {
          simulateRole: simRole,
          simulatePermissions: simRole ? perms : undefined,
        });
        if (!sessionRes.ok || !sessionRes.token) {
          showToast(sessionRes.error || 'Authentication required to send test emails.');
          setSendingTest(false);
          return;
        }
        token = sessionRes.token;
      }

      const effectivePortalLinkMode: PortalLinkMode =
        effectiveAudience === 'investor'
          ? compPortalLink === 'investor'
            ? 'investor'
            : 'none'
          : compPortalLink === 'overview'
          ? 'overview'
          : 'none';

      const resp = await fetch('/api/send-batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          audienceType: effectiveAudience,
          senderMode: 'selected',
          portalLinkMode: effectivePortalLinkMode,
          testMode: true,
          from: resolvedFrom,
          recipients: [
            {
              id: sample?.id || 'test_self_preview',
              email: testTargetEmail,
              name: currentUser.full_name,
              subject: renderedSubject,
              text: renderedBody,
            },
          ],
        }),
      });

      const data = (await resp.json()) as {
        ok: boolean;
        mode?: 'resend' | 'sandbox';
        error?: string;
        results?: { status: string; resend_id?: string; error?: string }[];
      };

      if (!resp.ok || !data.ok) {
        showToast(data.error || 'Failed to dispatch test email.');
        return;
      }

      const firstRes = data.results?.[0];
      if (firstRes?.status === 'bounced') {
        showToast(`Test send bounced: ${firstRes.error || 'Delivery error'}`);
        return;
      }

      showToast(
        `Sent [TEST] preview to ${testTargetEmail} via ${
          data.mode === 'resend' ? 'Resend Live' : 'Sandbox Simulation'
        }.`
      );
    } catch {
      showToast('Network error while sending test email.');
    } finally {
      setSendingTest(false);
    }
  };

  const handleLogInboundReply = async (
    contact: Contact,
    payload: { subject: string; snippet: string }
  ) => {
    try {
      let token = sessionToken;
      if (!token) {
        const simRole = isSimulating ? simulatedRole || currentUser.role : null;
        const sessionRes = await issueServerSession(authenticatedUser, {
          simulateRole: simRole,
          simulatePermissions: simRole ? perms : undefined,
        });
        token = sessionRes.token || null;
      }

      const resp = await fetch('/api/inbound-reply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          contactId: contact.id,
          fromEmail: contact.email,
          subject: payload.subject,
          snippet: payload.snippet,
        }),
      });

      const data = (await resp.json()) as {
        ok?: boolean;
        error?: string;
        reply?: { subject: string; snippet: string; receivedAt: string };
      };

      if (!resp.ok || !data.ok) {
        showToast(data.error || 'Failed to record inbound reply.');
        return;
      }

      const nowIso = new Date().toISOString();
      const nextInvestorStage =
        contact.contact_type === 'investor' &&
        ['Not sent', 'Scheduled', 'Sent', 'Reminder Sched', 'Reminder Sent', 'Portal Visited'].includes(
          contact.stage
        )
          ? 'Replied'
          : contact.stage;

      updateContact(contact.id, {
        delivery_status: 'replied',
        email_opened: true,
        replied_at: 'Just now',
        last_reply_subject: payload.subject,
        last_reply_snippet: payload.snippet,
        last_reply_from: contact.email,
        last_contacted_at: nowIso,
        stage: nextInvestorStage,
      });

      setTelemetry((prev) => [
        {
          id: `evt_${Date.now()}`,
          contact_id: contact.id,
          contact_name: contact.full_name,
          organization: contact.organization,
          contact_type: contact.contact_type,
          source: 'resend',
          event_type: 'email_replied',
          detail: `Inbound reply received from ${contact.email}`,
          reply_subject: payload.subject,
          reply_snippet: payload.snippet,
          timestamp: 'Just now',
        },
        ...prev,
      ]);

      showToast(`Logged inbound reply from ${contact.full_name} (${contact.organization})`);
    } catch {
      showToast('Network error logging inbound reply.');
    }
  };

  const handleSimulateWebhook = (
    mode: 'portal' | 'human_open' | 'bot_scan' | 'replied' | 'bounced' = 'portal',
    domainScope?: ContactType
  ) => {
    const candidates = accessibleContacts.filter(
      (c) => !c.unsubscribed && (!domainScope || c.contact_type === domainScope)
    );
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    if (!pick) return;

    if (mode === 'replied') {
      const sampleSubject =
        pick.contact_type === 'investor'
          ? `Re: Fortifai ($3M Seed) — ${pick.organization}`
          : `Re: Continuous Controls Automation — ${pick.organization}`;
      const sampleSnippet =
        pick.contact_type === 'investor'
          ? 'Reviewed the deck and financial model — let us set up a partner deep-dive early next week.'
          : 'Relevant timing ahead of our Q2 audit cycle. Please send calendar slots for our VP Audit & Risk.';
      void handleLogInboundReply(pick, {
        subject: sampleSubject,
        snippet: sampleSnippet,
      });
      return;
    }

    if (mode === 'bounced') {
      updateContact(pick.id, {
        delivery_status: 'bounced',
        bounced_at: 'Just now',
        bounced_reason: '550 5.1.1 Mailbox unavailable',
      });
      setTelemetry((prev) => [
        {
          id: `evt_${Date.now()}`,
          contact_id: pick.id,
          contact_name: pick.full_name,
          organization: pick.organization,
          contact_type: pick.contact_type,
          source: 'resend',
          event_type: 'email_bounced',
          detail: 'Hard bounce: 550 5.1.1 Mailbox unavailable',
          timestamp: 'Just now',
        },
        ...prev,
      ]);
      showToast(`Simulated hard bounce for ${pick.full_name}`);
      return;
    }

    if (mode === 'human_open') {
      updateContact(pick.id, {
        delivery_status: 'opened',
        email_opened: true,
        opened_at: 'Just now',
        opened_duration_sec: 46,
        last_contacted_at: new Date().toISOString(),
      });
      setTelemetry((prev) => [
        {
          id: `evt_${Date.now()}`,
          contact_id: pick.id,
          contact_name: pick.full_name,
          organization: pick.organization,
          contact_type: pick.contact_type,
          source: 'resend',
          event_type: 'email_opened',
          detail: 'Verified human email open (46s dwell time >= 10s threshold)',
          timestamp: 'Just now',
          duration_sec: 46,
          is_bot_scan: false,
        },
        ...prev,
      ]);
      showToast(`Verified Human Open: ${pick.full_name} (46s)`);
      return;
    }

    if (mode === 'bot_scan') {
      setTelemetry((prev) => [
        {
          id: `evt_${Date.now()}`,
          contact_id: pick.id,
          contact_name: pick.full_name,
          organization: pick.organization,
          contact_type: pick.contact_type,
          source: 'resend',
          event_type: 'email_opened',
          detail: 'Automated security gateway prefetch (2s < 10s threshold — filtered)',
          timestamp: 'Just now',
          duration_sec: 2,
          is_bot_scan: true,
        },
        ...prev,
      ]);
      showToast(`Filtered <10s Bot Scan for ${pick.full_name} — open metrics protected`);
      return;
    }

    if (pick.contact_type === 'investor') {
      const actions: {
        type: TelemetryEvent['event_type'];
        detail: string;
        patch: Partial<Contact>;
      }[] = [
        {
          type: 'deck_opened',
          detail: 'Opened 25-Slide Deck on investor.fortifai.io (20 slides viewed)',
          patch: {
            stage: 'Portal Visited',
            delivery_status: 'portal_visited',
            portal_visited: true,
            email_opened: true,
            opened_duration_sec: 140,
          },
        },
        {
          type: 'financials_viewed',
          detail: 'Reviewed 2027–2031 ARR & Unit Economics model on investor.fortifai.io',
          patch: {
            stage: 'Portal Visited',
            delivery_status: 'portal_visited',
            portal_visited: true,
            email_opened: true,
            opened_duration_sec: 195,
          },
        },
        {
          type: 'safe_generated',
          detail: 'Generated $500K Post-Money SAFE ($15M Cap) on investor.fortifai.io',
          patch: {
            stage: 'SAFE Signed',
            outcome: 'Committed',
            delivery_status: 'replied',
            amount_usd: pick.amount_usd || 500000,
            portal_visited: true,
            email_opened: true,
          },
        },
      ];
      const action = actions[Math.floor(Math.random() * actions.length)];

      updateContact(pick.id, {
        ...action.patch,
        last_contacted_at: new Date().toISOString(),
      });

      setTelemetry((prev) => [
        {
          id: `evt_${Date.now()}`,
          contact_id: pick.id,
          contact_name: pick.full_name,
          organization: pick.organization,
          contact_type: 'investor',
          source: 'investor.fortifai.io',
          event_type: action.type,
          detail: action.detail,
          timestamp: 'Just now',
          duration_sec: 140,
        },
        ...prev,
      ]);

      showToast(
        `Portal Webhook: ${pick.full_name} (${pick.organization}) → ${action.patch.stage}`
      );
    } else {
      const nextStage = pick.stage === '1 Lead' ? '2 Qualified' : pick.stage;
      updateContact(pick.id, {
        last_contacted_at: new Date().toISOString(),
        stage: nextStage,
        delivery_status: 'portal_visited',
        portal_visited: true,
        probability: nextStage === '2 Qualified' ? 20 : pick.probability,
        aging_days: 1,
      });

      setTelemetry((prev) => [
        {
          id: `evt_${Date.now()}`,
          contact_id: pick.id,
          contact_name: pick.full_name,
          organization: pick.organization,
          contact_type: 'customer',
          source: 'overview.fortifai.io',
          event_type: 'agent_explored',
          detail: 'Explored Continuous Audit & SAP Controls Agent on overview.fortifai.io',
          timestamp: 'Just now',
          duration_sec: 85,
        },
        ...prev,
      ]);

      showToast(
        `Portal Webhook: ${pick.full_name} (${pick.organization}) visited overview.fortifai.io`
      );
    }
  };

  // ============================================================================
  // RBAC / ADMIN HANDLERS
  // ============================================================================

  const handleInviteUser = (payload: {
    email: string;
    full_name: string;
    sender_display_name: string;
    role: UserRole;
    permissions: UserPermissions;
  }) => {
    const newUser: CrmUser = {
      id: `usr_${Date.now()}`,
      email: payload.email.toLowerCase(),
      full_name: payload.full_name,
      sender_display_name: payload.sender_display_name.trim() || payload.full_name,
      role: payload.role,
      permissions: payload.permissions,
      is_active: true,
      invited_by: currentUser.email,
      created_at: new Date().toISOString(),
    };
    setCrmUsers((prev) => [...prev, newUser]);
    if (isLiveConnected) {
      const client = buildSupabaseClient(supabaseUrl, supabaseAnonKey);
      if (client) void upsertCrmUserToSupabase(client, newUser);
    }
    showToast(`Provisioned ${newUser.email} (${newUser.role}) — sending invite email...`);
    void (async () => {
      try {
        let token = sessionToken || "";
        if (!token) {
          const sr = await fetch("/api/auth/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: authenticatedUser.email }),
          });
          const sj = (await sr.json().catch(() => ({}))) as { token?: string };
          token = sj.token || "";
        }
        const resp = await fetch("/api/admin/send-invite", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            email: newUser.email,
            full_name: newUser.full_name,
            role: newUser.role,
          }),
        });
        const out = (await resp.json()) as { ok?: boolean; error?: string };
        if (resp.ok && out.ok) {
          showToast(`Invite email delivered to ${newUser.email} from support@fortifai.io`);
        } else {
          showToast(out.error || `Saved ${newUser.email}, but invite email failed to send.`);
        }
      } catch {
        showToast(`Saved ${newUser.email} locally (network error sending invite email).`);
      }
    })();
  };

  


  const handleUpdateUserRole = (userId: string, role: UserRole) => {
    setCrmUsers((prev) =>
      prev.map((u) => {
        if (u.id !== userId) return u;
        const updated = { ...u, role, permissions: { ...ROLE_PRESETS[role].permissions } };
        if (isLiveConnected) {
          const client = buildSupabaseClient(supabaseUrl, supabaseAnonKey);
          if (client) void upsertCrmUserToSupabase(client, updated);
        }
        return updated;
      })
    );
    showToast(`Updated role preset to ${role}`);
  };

  const handleToggleUserPermission = (userId: string, permKey: keyof UserPermissions) => {
    setCrmUsers((prev) =>
      prev.map((u) => {
        if (u.id !== userId) return u;
        const updated = {
          ...u,
          permissions: {
            ...u.permissions,
            [permKey]: !u.permissions[permKey],
          },
        };
        if (isLiveConnected) {
          const client = buildSupabaseClient(supabaseUrl, supabaseAnonKey);
          if (client) void upsertCrmUserToSupabase(client, updated);
        }
        return updated;
      })
    );
  };

  const handleToggleUserActive = (userId: string) => {
    setCrmUsers((prev) =>
      prev.map((u) => {
        if (u.id !== userId) return u;
        const updated = { ...u, is_active: !u.is_active };
        if (isLiveConnected) {
          const client = buildSupabaseClient(supabaseUrl, supabaseAnonKey);
          if (client) void upsertCrmUserToSupabase(client, updated);
        }
        return updated;
      })
    );
  };

  const handleSwitchPreviewUser = async (user: CrmUser) => {
    simulateUser(user);
    setAskMeMessages([]);
    showToast(`Simulating RBAC view as ${user.full_name} (${user.role})`);
  };

  // ============================================================================
  // SUPABASE HANDLERS (@supabase/supabase-js)
  // ============================================================================

  const handleSaveConnection = () => {
    saveConfig({ supabaseUrl, supabaseAnonKey });
    setIsLiveConnected(Boolean(supabaseUrl.trim() && supabaseAnonKey.trim()));
    showToast('Saved Supabase connection settings');
  };

  const handleTestSupabase = async () => {
    setIsSyncing(true);
    const res = await testSupabaseConnection(supabaseUrl, supabaseAnonKey);
    setIsSyncing(false);
    if (res.ok) {
      setIsLiveConnected(true);
      saveConfig({ supabaseUrl, supabaseAnonKey });
    }
    showToast(res.message);
  };

  const handlePushToSupabase = async () => {
    const client = buildSupabaseClient(supabaseUrl, supabaseAnonKey);
    if (!client) {
      showToast('Enter a valid Supabase URL and Anon Key first.');
      return;
    }
    setIsSyncing(true);
    const res = await syncStateToSupabase(client, contacts, customFields, telemetry, crmUsers);
    setIsSyncing(false);
    if (res.ok) setIsLiveConnected(true);
    showToast(res.message);
  };

  const handlePullFromSupabase = async () => {
    const client = buildSupabaseClient(supabaseUrl, supabaseAnonKey);
    if (!client) {
      showToast('Enter a valid Supabase URL and Anon Key first.');
      return;
    }
    setIsSyncing(true);
    const res = await pullStateFromSupabase(client);
    setIsSyncing(false);
    if (res.ok) {
      const normalizedUsers =
        res.users && res.users.length > 0 ? normalizeCrmUsers(res.users) : crmUsers;
      if (res.users && res.users.length > 0) setCrmUsers(normalizedUsers);
      if (res.contacts && res.contacts.length > 0) {
        setContacts(applyExplicitCloseQtrs(normalizeContacts(res.contacts, normalizedUsers)));
      }
      if (res.customFields && res.customFields.length > 0) setCustomFields(res.customFields);
      if (res.telemetry && res.telemetry.length > 0) setTelemetry(res.telemetry);
      setIsLiveConnected(true);
    }
    showToast(res.message);
  };

  const customerNavItems = useMemo(
    () =>
      perms.can_view_customers
        ? [
            {
              id: 'pipeline_health' as ActiveTab,
              label: 'Pipeline Health',
              icon: BarChart3,
            },
            {
              id: 'customers' as ActiveTab,
              label: 'Accounts & Targets',
              icon: Building2,
            },
            ...(perms.can_send_campaigns
              ? [
                  {
                    id: 'customer_outreach' as ActiveTab,
                    label: 'Customer Outreach',
                    icon: Send,
                  },
                ]
              : []),
            {
              id: 'customer_telemetry' as ActiveTab,
              label: 'Customer Telemetry',
              icon: Activity,
            },
          ]
        : [],
    [perms.can_view_customers, perms.can_send_campaigns]
  );

  const investorNavItems = useMemo(
    () =>
      perms.can_view_investors
        ? [
            {
              id: 'investor_funnel' as ActiveTab,
              label: 'Seed Funnel',
              icon: Target,
            },
            {
              id: 'investors' as ActiveTab,
              label: 'Investor Pipeline',
              icon: Briefcase,
            },
            ...(perms.can_send_campaigns
              ? [
                  {
                    id: 'investor_outreach' as ActiveTab,
                    label: 'Investor Outreach',
                    icon: Send,
                  },
                ]
              : []),
            {
              id: 'investor_telemetry' as ActiveTab,
              label: 'Investor Telemetry',
              icon: Activity,
            },
          ]
        : [],
    [perms.can_view_investors, perms.can_send_campaigns]
  );

  // Redirect active tab if RBAC revokes access
  useEffect(() => {
    if (!canAccessTab(activeTab, perms, currentUser.role)) {
      setActiveTab(getDefaultTabForPermissions(perms, currentUser.role));
    }
  }, [perms, activeTab]);

  // Clear Ask Scale conversation when switching roles/simulation to prevent cross-domain leakage
  useEffect(() => {
    setAskMeMessages([]);
  }, [perms.can_view_customers, perms.can_view_investors, currentUser.role]);

  const refreshCmsSession = useCallback(async (): Promise<string | null> => {
    const simRole = isSimulating ? simulatedRole || currentUser.role : null;
    const res = await issueServerSession(authenticatedUser, {
      simulateRole: simRole,
      simulatePermissions: simRole ? perms : undefined,
    });
    return res.ok && res.token ? res.token : null;
  }, [authenticatedUser, currentUser.role, isSimulating, issueServerSession, perms, simulatedRole]);




  const handleResendInvite = useCallback(
    async (user: CrmUser) => {
      showToast(`Resending invitation email to ${user.email}...`);
      try {
        const token = sessionToken || (await refreshCmsSession()) || '';
        const resp = await fetch('/api/admin/send-invite', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            email: user.email,
            full_name: user.full_name,
            role: user.role,
            permissions: user.permissions,
          }),
        });
        const out = (await resp.json()) as { ok?: boolean; error?: string };
        if (resp.ok && out.ok) {
          showToast(`Invitation email resent to ${user.email} from support@fortifai.io`);
        } else {
          showToast(out.error || `Failed to resend invite to ${user.email}`);
        }
      } catch {
        showToast(`Network error resending invite to ${user.email}`);
      }
    },
    [refreshCmsSession, sessionToken, showToast]
  );

  const handleDeleteUser = useCallback(
    async (user: CrmUser) => {
      if (user.email.toLowerCase() === 'varun@fortifai.io') return;
      setCrmUsers((prev) =>
        prev.filter((u) => u.id !== user.id && u.email.toLowerCase() !== user.email.toLowerCase())
      );
      showToast(`Removed ${user.email} from Fortifai Scale`);
      try {
        const token = sessionToken || (await refreshCmsSession()) || '';
        await fetch('/api/admin/delete-user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ email: user.email }),
        });
      } catch {}
    },
    [refreshCmsSession, sessionToken, showToast]
  );

  // Render AuthGate when signed out or active account is deactivated
  if (isSignedOut || !authenticatedUser.is_active) {
    return (
      <AuthGate
        crmUsers={crmUsers}
        supabaseUrl={supabaseUrl}
        supabaseAnonKey={supabaseAnonKey}
        onAuthenticated={async (user, directToken) => {
          if (directToken) {
            setSessionToken(directToken);
          } else {
            const res = await issueServerSession(user);
            if (!res.ok) return res;
          }
          setCrmUsers((prev) => {
            const exists = prev.some((u) => u.email.toLowerCase() === user.email.toLowerCase());
            const updated = exists
              ? prev.map((u) =>
                  u.email.toLowerCase() === user.email.toLowerCase()
                    ? { ...u, last_login_at: new Date().toISOString() }
                    : u
                )
              : [...prev, { ...user, last_login_at: new Date().toISOString() }];
            return updated;
          });
          setAuthenticatedUserId(user.id);
          exitSimulation();
          try { window.sessionStorage.setItem('fortifai_scale_authed_email', user.email.toLowerCase()); } catch {}
          setIsSignedOut(false);
          return { ok: true };
        }}
      />
    );
  }

  const isInvestorTab = INVESTOR_TABS.has(activeTab);
  const canAddInActiveContext = isInvestorTab
    ? perms.can_edit_investors
    : perms.can_edit_customers;
  const canImportAny = perms.can_edit_customers || perms.can_edit_investors;

  return (
    <LiveCmsProvider
      sessionToken={sessionToken}
      onRefreshSession={refreshCmsSession}
      onNotify={showToast}
    >
      <div className="min-h-screen flex bg-[var(--bg-canvas)] text-[var(--tx-primary)] antialiased">
        {/* Deep Navy 52px Icon Rail (#0D1520) with Unclipped Fixed Hover Tooltips */}
        <aside
          className={`${
            sidebarCollapsed ? "w-[52px]" : "w-[206px]"
          } bg-[#0D1520] text-slate-300 flex flex-col transition-all duration-200 border-r border-slate-800 shrink-0 min-h-screen sticky top-0 h-screen z-30 select-none`}
        >
          {/* Floating Unclipped Hover Tooltip for 52px Icon Rail */}
          {sidebarCollapsed && hoveredRailItem && (
            <div
              style={{ top: hoveredRailItem.top }}
              className="pointer-events-none fixed left-[60px] -translate-y-1/2 px-2.5 py-1 rounded-md bg-[#0F172A] text-white text-[11.5px] font-medium whitespace-nowrap shadow-xl border border-slate-700/90 z-[9999]"
            >
              {hoveredRailItem.label}
            </div>
          )}

          {/* Top Brand + Expand/Collapse Rail Button */}
          <div className="h-[46px] px-2.5 flex items-center justify-between border-b border-[#1E2D42] shrink-0">
            <button
              type="button"
              onClick={() => {
                setHoveredRailItem(null);
                setSidebarCollapsed((prev) => !prev);
              }}
              onMouseEnter={(e) => {
                if (!sidebarCollapsed) return;
                const r = e.currentTarget.getBoundingClientRect();
                setHoveredRailItem({ label: "Expand Sidebar", top: r.top + r.height / 2 });
              }}
              onMouseLeave={() => setHoveredRailItem(null)}
              className="flex items-center gap-2.5 min-w-0 p-1.5 rounded-md hover:bg-white/5 transition-colors"
              aria-label={sidebarCollapsed ? "Expand navigation rail" : "Collapse to icon rail"}
            >
              <span
                className="inline-block w-[12px] h-[15px] bg-[#6699CC] shrink-0"
                style={{ clipPath: "polygon(0% 22%, 100% 0%, 100% 100%, 0% 100%)" }}
              />
              {!sidebarCollapsed && (
                <div className="min-w-0 text-left">
                  <div className="text-white font-semibold text-[13px] tracking-tight leading-none truncate">
                    <CmsText id="shell.brand_name" defaultValue="Fortifai Scale" section="Header & Sidebar" />
                  </div>
                </div>
              )}
            </button>
            {!sidebarCollapsed && (
              <button
                type="button"
                onClick={() => setSidebarCollapsed(true)}
                className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
                title="Collapse to 52px icon rail"
              >
                <ChevronLeft size={15} />
              </button>
            )}
          </div>

          {/* Icon-First Navigation Rail */}
          <nav className="flex-1 overflow-y-auto py-2.5 px-2 flex flex-col gap-1">
            {perms.can_view_customers && (
              <div className="space-y-1">
                {!sidebarCollapsed && (
                  <button
                    type="button"
                    onClick={() => setCustomerSectionOpen((prev) => !prev)}
                    className="w-full flex items-center justify-between px-2 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400 hover:text-white transition-colors"
                  >
                    <CmsText id="sidebar.section.customer" defaultValue="Customer" section="Header & Sidebar" />
                    {customerSectionOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </button>
                )}
                {(sidebarCollapsed || customerSectionOpen) &&
                  customerNavItems.map((item) => {
                    const Icon = item.icon;
                    const isActive =
                      activeTab === item.id ||
                      (item.id === "customers" && activeTab === "customer_analytics");
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => navigateToTab(item.id)}
                        onMouseEnter={(e) => {
                          if (!sidebarCollapsed) return;
                          const r = e.currentTarget.getBoundingClientRect();
                          setHoveredRailItem({ label: item.label, top: r.top + r.height / 2 });
                        }}
                        onMouseLeave={() => setHoveredRailItem(null)}
                        className={`w-full flex items-center ${
                          sidebarCollapsed ? "justify-center px-0 py-2" : "gap-2.5 px-2.5 py-1.5"
                        } rounded-[6px] text-left transition-colors ${
                          isActive
                            ? "bg-[#1B2B44] text-white font-medium shadow-inner"
                            : "text-slate-400 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        <Icon size={16} className={isActive ? "text-sky-400 shrink-0" : "shrink-0"} />
                        {!sidebarCollapsed && (
                          <span className="text-[12.5px] truncate">
                            <CmsText id={`sidebar.nav.${item.id}`} defaultValue={item.label} section="Header & Sidebar" />
                          </span>
                        )}
                      </button>
                    );
                  })}
              </div>
            )}

            {perms.can_view_customers && perms.can_view_investors && (
              <div className="my-1.5 border-t border-slate-800/80 mx-1" />
            )}

            {perms.can_view_investors && (
              <div className="space-y-1">
                {!sidebarCollapsed && (
                  <button
                    type="button"
                    onClick={() => setInvestorSectionOpen((prev) => !prev)}
                    className="w-full flex items-center justify-between px-2 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400 hover:text-white transition-colors"
                  >
                    <CmsText id="sidebar.section.investor" defaultValue="Investor" section="Header & Sidebar" />
                    {investorSectionOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </button>
                )}
                {(sidebarCollapsed || investorSectionOpen) &&
                  investorNavItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => navigateToTab(item.id)}
                        onMouseEnter={(e) => {
                          if (!sidebarCollapsed) return;
                          const r = e.currentTarget.getBoundingClientRect();
                          setHoveredRailItem({ label: item.label, top: r.top + r.height / 2 });
                        }}
                        onMouseLeave={() => setHoveredRailItem(null)}
                        className={`w-full flex items-center ${
                          sidebarCollapsed ? "justify-center px-0 py-2" : "gap-2.5 px-2.5 py-1.5"
                        } rounded-[6px] text-left transition-colors ${
                          isActive
                            ? "bg-[#1B2B44] text-white font-medium shadow-inner"
                            : "text-slate-400 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        <Icon size={16} className={isActive ? "text-sky-400 shrink-0" : "shrink-0"} />
                        {!sidebarCollapsed && (
                          <span className="text-[12.5px] truncate">
                            <CmsText id={`sidebar.nav.${item.id}`} defaultValue={item.label} section="Header & Sidebar" />
                          </span>
                        )}
                      </button>
                    );
                  })}
              </div>
            )}

            {/* Unified Settings & Admin Governance Icon (Combines Admin & RBAC + Connections & Sync) */}
            {(perms.can_manage_users || currentUser.role === "super_admin") && (
              <div className="mt-auto pt-2 border-t border-slate-800/80">
                <button
                  type="button"
                  onClick={() => navigateToTab(perms.can_manage_users ? "admin" : "settings")}
                  onMouseEnter={(e) => {
                    if (!sidebarCollapsed) return;
                    const r = e.currentTarget.getBoundingClientRect();
                    setHoveredRailItem({
                      label: currentUser.role === "super_admin" ? "Settings & Admin" : "Admin & RBAC",
                      top: r.top + r.height / 2,
                    });
                  }}
                  onMouseLeave={() => setHoveredRailItem(null)}
                  className={`w-full flex items-center ${
                    sidebarCollapsed ? "justify-center px-0 py-2" : "gap-2.5 px-2.5 py-1.5"
                  } rounded-[6px] text-left transition-colors ${
                    activeTab === "admin" || activeTab === "settings"
                      ? "bg-[#1B2B44] text-white font-medium"
                      : "text-slate-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <Settings
                    size={16}
                    className={activeTab === "admin" || activeTab === "settings" ? "text-sky-400 shrink-0" : "shrink-0"}
                  />
                  {!sidebarCollapsed && (
                    <span className="text-[12.5px] truncate">
                      {currentUser.role === "super_admin" ? "Settings & Admin" : "Admin & RBAC"}
                    </span>
                  )}
                </button>
              </div>
            )}
          </nav>

          {/* Bottom User Avatar + Popover Menu */}
          <div className="relative p-2 border-t border-slate-800/80 shrink-0">
            <button
              type="button"
              onClick={() => {
                setHoveredRailItem(null);
                setAccountMenuOpen((prev) => !prev);
              }}
              onMouseEnter={(e) => {
                if (!sidebarCollapsed || accountMenuOpen) return;
                const r = e.currentTarget.getBoundingClientRect();
                setHoveredRailItem({ label: `${currentUser.full_name} · Account`, top: r.top + r.height / 2 });
              }}
              onMouseLeave={() => setHoveredRailItem(null)}
              className={`w-full flex items-center ${
                sidebarCollapsed ? "justify-center py-1" : "gap-2.5 px-2 py-1.5"
              } rounded-md hover:bg-white/5 transition-colors`}
            >
              <div className="h-7 w-7 rounded-full bg-[#1E3A5F] border border-sky-400/30 text-sky-200 flex items-center justify-center text-[11px] font-semibold shrink-0">
                {(currentUser.full_name || "U")
                  .split(" ")
                  .map((p) => p[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()}
              </div>
              {!sidebarCollapsed && (
                <div className="min-w-0 flex-1 text-left">
                  <div className="text-[12px] text-white font-medium truncate">{currentUser.full_name}</div>
                  <div className="text-[10px] text-slate-400 font-mono truncate">{currentUser.role}</div>
                </div>
              )}
            </button>

            {accountMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setAccountMenuOpen(false)} />
                <div className="absolute bottom-12 left-2 w-64 bg-[#0F172A] border border-slate-700/90 rounded-lg shadow-2xl p-3 space-y-2.5 text-xs z-50 text-slate-200">
                  <div className="pb-2 border-b border-slate-800">
                    <div className="font-semibold text-white truncate">{currentUser.full_name}</div>
                    <div className="text-[11px] text-slate-400 font-mono truncate">{currentUser.email}</div>
                    <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 text-[10px] font-mono">
                      {currentUser.role}
                    </span>
                  </div>

                  {/* Connected Portals Status */}
                  <div className="space-y-1 text-[11px]">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                      Connected Portals
                    </div>
                    {perms.can_view_customers && (
                      <div className="flex items-center justify-between text-slate-300">
                        <span className="truncate">overview.fortifai.io</span>
                        <span className="text-emerald-400 text-[10px]">● Live</span>
                      </div>
                    )}
                    {perms.can_view_investors && (
                      <div className="flex items-center justify-between text-slate-300">
                        <span className="truncate">investor.fortifai.io</span>
                        <span className="text-emerald-400 text-[10px]">● Live</span>
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        try { window.sessionStorage.removeItem('fortifai_scale_authed_email'); } catch {}
    setIsSignedOut(true);
                      }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-rose-300 hover:bg-rose-500/10 hover:text-rose-200 transition-colors text-[12px] font-medium"
                    >
                      <LogOut size={13} />
                      Sign out / Switch account
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 flex flex-col">
        {/* Top Header Bar */}
        <header className="h-[46px] bg-[#0D1520] text-white border-b border-[#1E2D42] px-4 flex items-center justify-between gap-3 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-[13.5px] font-semibold text-white tracking-tight truncate">
              {activeTab === 'customer_analytics' && (
                <CmsText
                  id="header.title.customer_analytics"
                  defaultValue="Customer Insights & Analytics (Sectors, Locations, Tiers, Scores)"
                  section="Header & Sidebar"
                />
              )}
              {activeTab === 'pipeline_health' && (
                <CmsText
                  id="header.title.pipeline_health"
                  defaultValue="Pipeline Health & 2027 Coverage Model"
                  section="Header & Sidebar"
                />
              )}
              {activeTab === 'pipeline_timeline' && (
                <CmsText
                  id="header.title.pipeline_timeline"
                  defaultValue="Pipeline Timeline · 2027 Close Gantt"
                  section="Header & Sidebar"
                />
              )}
              {activeTab === 'customers' && (
                <CmsText
                  id="header.title.customers"
                  defaultValue="Accounts & Targets (Enterprise Pipeline & Dossiers)"
                  section="Header & Sidebar"
                />
              )}
              {activeTab === 'customer_outreach' && (
                <CmsText
                  id="header.title.customer_outreach"
                  defaultValue="Customer Outreach (Resend + Superhuman Sync)"
                  section="Header & Sidebar"
                />
              )}
              {activeTab === 'customer_telemetry' && (
                <CmsText
                  id="header.title.customer_telemetry"
                  defaultValue="Customer Telemetry (Resend + overview.fortifai.io)"
                  section="Header & Sidebar"
                />
              )}
              {activeTab === 'investor_funnel' && (
                <CmsText
                  id="header.title.investor_funnel"
                  defaultValue="Seed Funnel ($3M / $15M Cap SAFE)"
                  section="Header & Sidebar"
                />
              )}
              {activeTab === 'investors' && (
                <CmsText
                  id="header.title.investors"
                  defaultValue="Investor Pipeline (US, India, UAE, Singapore Tracker)"
                  section="Header & Sidebar"
                />
              )}
              {activeTab === 'investor_outreach' && (
                <CmsText
                  id="header.title.investor_outreach"
                  defaultValue="Investor Outreach (Resend + Superhuman Sync)"
                  section="Header & Sidebar"
                />
              )}
              {activeTab === 'investor_telemetry' && (
                <CmsText
                  id="header.title.investor_telemetry"
                  defaultValue="Investor Telemetry (Resend + investor.fortifai.io)"
                  section="Header & Sidebar"
                />
              )}
              {activeTab === 'admin' && (
                <CmsText
                  id="header.title.admin"
                  defaultValue="Admin & RBAC (crm_users)"
                  section="Header & Sidebar"
                />
              )}
              {activeTab === 'settings' && currentUser.role === 'super_admin' && (
                <CmsText
                  id="header.title.settings"
                  defaultValue="Supabase, Resend & Portal Integration"
                  section="Header & Sidebar"
                />
              )}
            </h1>
          </div>

          <GlobalSearchBar
            contacts={accessibleContacts}
            customFields={accessibleCustomFields}
            canViewCustomers={perms.can_view_customers}
            canViewInvestors={perms.can_view_investors}
            onSelectContact={(contactId) => setSelectedContactId(contactId)}
          />

          <div className="flex items-center gap-2.5 shrink-0">
            {isSimulating && (
              <button
                type="button"
                onClick={exitSimulation}
                className="px-2.5 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md hover:bg-indigo-100 whitespace-nowrap"
              >
                Viewing as {ROLE_PRESETS[currentUser.role]?.label || currentUser.role} · Exit Simulation
              </button>
            )}
            <LiveCmsHeaderButton />
            <button
              type="button"
              onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-200 bg-[#152033] border border-[#263852] rounded-md hover:bg-[#1E2D42] hover:text-white transition-colors whitespace-nowrap shrink-0"
              title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
              aria-label={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {theme === "dark" ? <Sun size={13} className="text-amber-400" /> : <Moon size={13} className="text-sky-300" />}
              <span className="hidden md:inline">{theme === "dark" ? "Light" : "Dark"}</span>
            </button>
            <button
              type="button"
              onClick={() => setIsAskMeOpen((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-md transition-colors whitespace-nowrap shrink-0 ${
                isAskMeOpen
                  ? 'bg-[#2E5A8A] text-white border-[#6699CC]'
                  : 'text-slate-200 bg-[#152033] border-[#263852] hover:bg-[#1E2D42] hover:text-white'
              }`}
              title="Open Ask Scale Copilot (⌘K)"
            >
              <span
                className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                  geminiConfigured ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
              <Sparkles size={13} className={isAskMeOpen ? 'text-sky-300' : 'text-[#0D1520]'} />
              <CmsText id="header.btn.ask_scale" defaultValue="Ask Scale" section="Header & Sidebar" />
              <kbd
                className={`hidden sm:inline px-1 py-0.2 text-[10px] font-mono border rounded ${
                  isAskMeOpen
                    ? 'bg-white/10 text-slate-200 border-white/20'
                    : 'bg-white text-slate-500 border-[#E2E8F0]'
                }`}
              >
                ⌘K
              </kbd>
            </button>
            <button
              type="button"
              disabled={!canImportAny}
              onClick={() => setIsCsvModalOpen(true)}
              title={!canImportAny ? 'Requires customer or investor edit permission' : undefined}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11.5px] font-medium text-slate-200 bg-[#152033] border border-[#263852] rounded-[4px] hover:bg-[#1E2D42] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0"
            >
              <Upload size={14} />
              <span className="hidden sm:inline">
                <CmsText
                  id="header.btn.import_sheet"
                  defaultValue="Import Sheet / Excel"
                  section="Header & Sidebar"
                />
              </span>
            </button>
            <button
              type="button"
              disabled={!canAddInActiveContext}
              onClick={() => {
                setAddContactType(isInvestorTab ? 'investor' : 'customer');
                setIsAddContactOpen(true);
              }}
              title={
                !canAddInActiveContext
                  ? `Read-only mode: requires ${
                      isInvestorTab ? 'can_edit_investors' : 'can_edit_customers'
                    }`
                  : undefined
              }
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11.5px] font-medium text-white bg-[#2E5A8A] border border-[#6699CC]/60 rounded-[4px] hover:bg-[#23476E] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0"
            >
              <Plus size={14} />
              <CmsText
                id={isInvestorTab ? 'header.btn.add_investor' : 'header.btn.add_contact'}
                defaultValue={isInvestorTab ? 'Add Investor' : 'Add Contact'}
                section="Header & Sidebar"
              />
            </button>
          </div>
        </header>

        {/* Toast Notification */}
        {toastMessage && (
          <div className="fixed bottom-5 right-5 z-50 bg-[#0D1520] text-white text-xs px-4 py-3 rounded-lg shadow-lg border border-slate-700 flex items-center gap-2.5">
            <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Views */}

        {activeTab === 'customer_analytics' && perms.can_view_customers && (
          <CustomerAnalyticsView
            analytics={customerAnalytics}
            canEditCustomers={perms.can_edit_customers}
            onNavigateToCustomers={(filters) => {
              if (filters) {
                setCustPresetFilter({ ...filters, seq: Date.now() });
              } else {
                setCustPresetFilter(null);
              }
              setActiveTab('customers');
            }}
            onSelectContact={setSelectedContactId}
            onOpenImport={() => setIsCsvModalOpen(true)}
          />
        )}

        {activeTab === 'pipeline_health' && perms.can_view_customers && (
          <PipelineHealthView
              contacts={contacts}
              rules={pipelineRules}
              onOpenSettingsRules={() => navigateToTab("settings")}
              onUpdateContact={updateContact}
              onSelectContact={(id) => setSelectedContactId(id)}
            pipelineAnalytics={pipelineAnalytics}
            arrTarget2027={arrTarget2027}
            onChangeArrTarget={setArrTarget2027}
            avgAcvAssumption={avgAcvAssumption}
            onChangeAvgAcv={setAvgAcvAssumption}
            coverageMultiple={coverageMultiple}
            onChangeCoverageMultiple={setCoverageMultiple}
            onNavigateToCustomers={() => setActiveTab('customers')}
            onDraftFollowUp={jumpToComposerForContact}
          />
        )}

        {activeTab === 'pipeline_timeline' && perms.can_view_customers && (
          <PipelineTimelineView
            customers={customerContacts}
            activeUsers={activeUsers}
            onSelectContact={setSelectedContactId}
            onUpdateContact={updateContact}
            onMoveQuarterToast={(org, fromQtr, toQtr) =>
              showToast(`Moved ${org} expected close: ${fromQtr} → ${toQtr}`)
            }
          />
        )}

        {activeTab === 'customers' && perms.can_view_customers && (
          <CustomersView
            canEdit={perms.can_edit_customers}
            canSendCampaigns={perms.can_send_campaigns}
            customers={customerContacts}
            activeUsers={activeUsers}
            presetFilter={custPresetFilter}
            onNavigateToAnalytics={() => setActiveTab('customer_analytics')}
            onSelectContact={setSelectedContactId}
            onUpdateContact={updateContact}
            onDeleteContact={deleteContact}
            onComposeEmail={(c) => jumpToComposerForContact(c)}
            onOpenAccountIntelligence={handleOpenAccountIntelligence}
          />
        )}

        {activeTab === 'investor_funnel' && perms.can_view_investors && (
          <InvestorFunnelView
            investorAnalytics={investorAnalytics}
            seedRoundTarget={seedRoundTarget}
            onNavigateToInvestors={() => setActiveTab('investors')}
            onLogMeeting={(inv) => {
              if (!perms.can_edit_investors) {
                showToast('Permission denied: requires can_edit_investors.');
                return;
              }
              updateContact(inv.id, { stage: 'Meeting', outcome: 'Soft Circle' });
              showToast(`Updated ${inv.organization} to Meeting / Soft Circle`);
            }}
            onSendNudge={jumpToComposerForContact}
          />
        )}

        {activeTab === 'investors' && perms.can_view_investors && (
          <InvestorsView
            canEdit={perms.can_edit_investors}
            canSendCampaigns={perms.can_send_campaigns}
            investors={investorContacts}
            activeUsers={activeUsers}
            onSelectContact={setSelectedContactId}
            onUpdateContact={updateContact}
            onDeleteContact={deleteContact}
            onComposeEmail={(inv) => jumpToComposerForContact(inv)}
          />
        )}

        {activeTab === 'customer_outreach' &&
          perms.can_view_customers &&
          perms.can_send_campaigns && (
          <ComposerView
            currentUser={currentUser}
            activeUsers={activeUsers}
            canSendCampaigns={perms.can_send_campaigns}
            sendFrom={compSendFrom}
            onChangeSendFrom={setCompSendFrom}
            useAssignedOwnerSender={compUseAssignedOwnerSender}
            onChangeUseAssignedOwnerSender={setCompUseAssignedOwnerSender}
            bccEnabled={compBccEnabled}
            onChangeBccEnabled={setCompBccEnabled}
            portalLinkMode={compPortalLink === 'overview' ? 'overview' : 'none'}
            onChangePortalLinkMode={setCompPortalLink}
            domainScope="customer"
            eligibleRecipients={composerPool.eligible}
            suppressedCount={composerPool.suppressedCount}
            selectedIds={compSelectedIds}
            onChangeSelectedIds={setCompSelectedIds}
            subject={compSubject}
            onChangeSubject={setCompSubject}
            body={compBody}
            onChangeBody={setCompBody}
            customFields={customerCustomFields}
            previewIdx={previewIdx}
            onChangePreviewIdx={setPreviewIdx}
            sendingBatch={sendingBatch}
            sendingTest={sendingTest}
            onSendBatch={handleSendBatch}
            onSendTestToMe={handleSendTestToMe}
            renderTemplate={renderEmailTemplate}
            filterResetSeq={compFilterResetSeq}
            telemetry={accessibleTelemetry}
            onCancelSequence={() => {
              setCompSelectedIds([]);
              setPreviewIdx(0);
              setCompPortalLink('none');
              if (activeTab === 'investor_outreach') {
                setCompSubject('Fortifai — Autonomous Audit & Compliance for Fortune 500 ($3M Seed)');
                setCompBody('Hi {{first_name}},\n\n{{custom_hook}}\n\nWe are raising a $3M Seed ($15M cap post-money SAFE) with enterprise deployments across Honeywell, Nokia, and Brookfield Properties—monitoring 100% of ERP transactions inside the customer\'s VPC with zero data egress.\n\nWould you have 20 minutes next week to connect?\n\nBest,\nVarun Mowar\nCo-Founder & CEO, Fortifai');
                navigateToTab('investors');
              } else {
                setCompSubject('Continuous compliance & third-party oversight at {{organization}}');
                setCompBody('Hi {{first_name}},\n\n{{custom_hook}}\n\nMost compliance teams still rely on periodic sample testing across siloed ERPs—leaving blind spots around FCPA, third-party onboarding, and post-clearance trade exposure.\n\nLed in the Americas by former DOJ Fraud Section Trial Attorney David Maria, Fortifai deploys inside your private VPC (zero data egress) to continuously monitor 100% of SAP/Oracle transactions and surface defensible audit trails.\n\nOpen to a brief 15-minute exchange next Tuesday or Thursday?\n\nBest,\nVarun Mowar\nFounder & CEO, Fortifai');
                navigateToTab('customers');
              }
              showToast('Outreach sequence cancelled and draft cleared.');
            }}
          />
        )}

        {activeTab === 'investor_outreach' &&
          perms.can_view_investors &&
          perms.can_send_campaigns && (
          <ComposerView
            currentUser={currentUser}
            activeUsers={activeUsers}
            canSendCampaigns={perms.can_send_campaigns}
            sendFrom={compSendFrom}
            onChangeSendFrom={setCompSendFrom}
            useAssignedOwnerSender={compUseAssignedOwnerSender}
            onChangeUseAssignedOwnerSender={setCompUseAssignedOwnerSender}
            bccEnabled={compBccEnabled}
            onChangeBccEnabled={setCompBccEnabled}
            portalLinkMode={compPortalLink === 'investor' ? 'investor' : 'none'}
            onChangePortalLinkMode={setCompPortalLink}
            domainScope="investor"
            eligibleRecipients={composerPool.eligible}
            suppressedCount={composerPool.suppressedCount}
            selectedIds={compSelectedIds}
            onChangeSelectedIds={setCompSelectedIds}
            subject={compSubject}
            onChangeSubject={setCompSubject}
            body={compBody}
            onChangeBody={setCompBody}
            customFields={investorCustomFields}
            previewIdx={previewIdx}
            onChangePreviewIdx={setPreviewIdx}
            sendingBatch={sendingBatch}
            sendingTest={sendingTest}
            onSendBatch={handleSendBatch}
            onSendTestToMe={handleSendTestToMe}
            renderTemplate={renderEmailTemplate}
            filterResetSeq={compFilterResetSeq}
            telemetry={accessibleTelemetry}
            onCancelSequence={() => {
              setCompSelectedIds([]);
              setPreviewIdx(0);
              setCompPortalLink('none');
              if (activeTab === 'investor_outreach') {
                setCompSubject('Fortifai — Autonomous Audit & Compliance for Fortune 500 ($3M Seed)');
                setCompBody('Hi {{first_name}},\n\n{{custom_hook}}\n\nWe are raising a $3M Seed ($15M cap post-money SAFE) with enterprise deployments across Honeywell, Nokia, and Brookfield Properties—monitoring 100% of ERP transactions inside the customer\'s VPC with zero data egress.\n\nWould you have 20 minutes next week to connect?\n\nBest,\nVarun Mowar\nCo-Founder & CEO, Fortifai');
                navigateToTab('investors');
              } else {
                setCompSubject('Continuous compliance & third-party oversight at {{organization}}');
                setCompBody('Hi {{first_name}},\n\n{{custom_hook}}\n\nMost compliance teams still rely on periodic sample testing across siloed ERPs—leaving blind spots around FCPA, third-party onboarding, and post-clearance trade exposure.\n\nLed in the Americas by former DOJ Fraud Section Trial Attorney David Maria, Fortifai deploys inside your private VPC (zero data egress) to continuously monitor 100% of SAP/Oracle transactions and surface defensible audit trails.\n\nOpen to a brief 15-minute exchange next Tuesday or Thursday?\n\nBest,\nVarun Mowar\nFounder & CEO, Fortifai');
                navigateToTab('customers');
              }
              showToast('Outreach sequence cancelled and draft cleared.');
            }}
          />
        )}

        {activeTab === 'customer_telemetry' && perms.can_view_customers && (
          <TelemetryView
            domainScope="customer"
            telemetry={accessibleTelemetry}
            contacts={customerContacts}
            openRatePct={customerOpenRatePct}
            onSimulateWebhook={handleSimulateWebhook}
            onLogInboundReply={handleLogInboundReply}
            onSelectContact={setSelectedContactId}
          />
        )}

        {activeTab === 'investor_telemetry' && perms.can_view_investors && (
          <TelemetryView
            domainScope="investor"
            telemetry={accessibleTelemetry}
            contacts={investorContacts}
            openRatePct={investorAnalytics.openRatePct}
            onSimulateWebhook={handleSimulateWebhook}
            onLogInboundReply={handleLogInboundReply}
            onSelectContact={setSelectedContactId}
          />
        )}

        {activeTab === 'admin' && perms.can_manage_users && (
          <AdminRbacView
            crmUsers={crmUsers}
            currentUser={currentUser}
            onInviteUser={handleInviteUser}
            onResendInvite={handleResendInvite}
            onDeleteUser={handleDeleteUser}
            onUpdateUserRole={handleUpdateUserRole}
            onTogglePermission={handleToggleUserPermission}
            onToggleUserActive={handleToggleUserActive}
            onSwitchPreviewUser={handleSwitchPreviewUser}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            pipelineRules={pipelineRules}
            onUpdatePipelineRules={handleUpdatePipelineRules}
            supabaseUrl={supabaseUrl}
            onChangeSupabaseUrl={setSupabaseUrl}
            supabaseAnonKey={supabaseAnonKey}
            onChangeSupabaseAnonKey={setSupabaseAnonKey}
            resendConfigured={resendConfigured}
            isLiveConnected={isLiveConnected}
            isSyncing={isSyncing}
            onSaveConnection={handleSaveConnection}
            onTestConnection={handleTestSupabase}
            onPushToSupabase={handlePushToSupabase}
            onPullFromSupabase={handlePullFromSupabase}
          />
        )}
      </main>

      {/* Permanent 460px Slide-Over Ask Scale Copilot Drawer */}
      <AskMeDrawer
        isOpen={isAskMeOpen}
        messages={askMeMessages}
        isLoading={askMeLoading}
        geminiConfigured={geminiConfigured}
        contacts={accessibleContacts}
        onClose={() => setIsAskMeOpen(false)}
        onClearConversation={() => setAskMeMessages([])}
        onSendMessage={handleSendAskMeMessage}
        onOpenContact={(contactId) => setSelectedContactId(contactId)}
        onDraftInComposer={handleDraftFromAskMe}
      />

      {/* Slide-Over Customer Intelligence Dossier Drawer */}
      <AccountDossierDrawer
        organization={dossierTarget?.organization || null}
        industry={dossierTarget?.industry}
        region={dossierTarget?.region}
        dossier={
          dossierTarget
            ? dossiersByOrg[dossierTarget.organization.toLowerCase()] || null
            : null
        }
        isLoading={dossierLoading}
        isCached={dossierCached}
        error={dossierError}
        onClose={() => {
          setDossierTarget(null);
          setDossierError(null);
        }}
        onRefresh={() => {
          if (dossierTarget) {
            void handleFetchAccountDossier(dossierTarget, true);
          }
        }}
      />

      {/* Slide-Over Contact Detail Drawer */}
      {selectedContact && (
        <ContactDrawer
          key={selectedContact.id}
          contact={selectedContact}
          currentUser={currentUser}
          activeUsers={activeUsers}
          customFields={accessibleCustomFields}
          telemetry={accessibleTelemetry}
          canEdit={
            selectedContact.contact_type === 'investor'
              ? perms.can_edit_investors
              : perms.can_edit_customers
          }
          canSendCampaigns={perms.can_send_campaigns}
          composerAudience={compAudience}
          composerSubject={compSubject}
          composerBody={compBody}
          composerSendFrom={compSendFrom}
          useAssignedOwnerSender={compUseAssignedOwnerSender}
          bccEnabled={compBccEnabled}
          renderTemplate={renderEmailTemplate}
          onClose={() => setSelectedContactId(null)}
          onUpdateContact={updateContact}
          onDeleteContact={deleteContact}
          onUpdateCustomFieldValue={updateCustomFieldValue}
          onComposeEmail={(target, customSubject, customBody) => {
            setSelectedContactId(null);
            jumpToComposerForContact(target, customSubject, customBody);
          }}
          onLogInboundReply={handleLogInboundReply}
          onOpenAccountIntelligence={handleOpenAccountIntelligence}
        />
      )}

      {/* Modals */}

      {isAddContactOpen && (
        <AddContactModal
          initialType={addContactType}
          canEditCustomers={perms.can_edit_customers}
          canEditInvestors={perms.can_edit_investors}
          activeUsers={activeUsers}
          defaultOwnerId={currentUser.id}
          customFields={accessibleCustomFields}
          onClose={() => setIsAddContactOpen(false)}
          onSave={handleAddContact}
        />
      )}

      {isCsvModalOpen && (
        <CsvImportModal
          existingCustomFields={accessibleCustomFields}
          canEditCustomers={perms.can_edit_customers}
          canEditInvestors={perms.can_edit_investors}
          activeUsers={activeUsers}
          defaultOwnerId={currentUser.id}
          onClose={() => setIsCsvModalOpen(false)}
          onImport={handleSheetBulkImport}
        />
      )}

      <LiveCmsOverlay onNotify={showToast} />
      </div>
    </LiveCmsProvider>
  );
}
