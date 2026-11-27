import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit3,
  FolderPlus,
  History,
  Layers,
  Lock,
  Mail,
  Plus,
  RotateCcw,
  Save,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  User,
  UserCheck,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import type {
  Contact,
  ContactType,
  CrmUser,
  CustomFieldDefinition,
  PortalLinkMode,
  TelemetryEvent,
} from '../../types/crm';
import { getRegionBadgeStyle, getStageBadgeStyle } from '../../utils/crmHelpers';

interface ComposerViewProps {
  currentUser: CrmUser;
  activeUsers: CrmUser[];
  canSendCampaigns: boolean;
  sendFrom: string;
  onChangeSendFrom: (from: string) => void;
  useAssignedOwnerSender: boolean;
  onChangeUseAssignedOwnerSender: (v: boolean) => void;
  bccEnabled: boolean;
  onChangeBccEnabled: (v: boolean) => void;
  portalLinkMode: PortalLinkMode;
  onChangePortalLinkMode: (mode: PortalLinkMode) => void;
  domainScope: ContactType;
  eligibleRecipients: Contact[];
  suppressedCount: number;
  selectedIds: string[];
  onChangeSelectedIds: (ids: string[]) => void;
  subject: string;
  onChangeSubject: (s: string) => void;
  body: string;
  onChangeBody: (b: string) => void;
  customFields: CustomFieldDefinition[];
  previewIdx: number;
  onChangePreviewIdx: (idx: number) => void;
  sendingBatch: boolean;
  sendingTest: boolean;
  onSendBatch: () => void;
  onSendTestToMe: () => void;
  renderTemplate: (tpl: string, contact?: Contact) => string;
  filterResetSeq?: number;
  telemetry?: TelemetryEvent[];
  onCancelSequence?: () => void;
}

export interface SavedSegmentFilters {
  searchQuery?: string;
  regions?: string[];
  sectors?: string[];
  industryKeywords?: string[];
  personas?: string[];
  tiers?: string[];
  stages?: string[];
  owners?: string[];
  f500Only?: boolean;
  cooldownDays?: number;
}

export interface SavedOutreachSegment {
  id: string;
  name: string;
  domain_scope: ContactType;
  mode: 'dynamic' | 'static';
  filters: SavedSegmentFilters;
  static_contact_ids: string[];
  created_by?: string;
  updated_at?: string;
}

const SEGMENTS_STORAGE_KEY = 'fortifai_outreach_segments_v1';

const DEFAULT_SAVED_SEGMENTS: SavedOutreachSegment[] = [
  {
    id: 'seg_pharma_customers',
    name: 'Targeting Pharma Customers',
    domain_scope: 'customer',
    mode: 'dynamic',
    filters: {
      industryKeywords: ['pharma', 'life science', 'biotech', 'healthcare', 'medical', 'health'],
    },
    static_contact_ids: [],
  },
  {
    id: 'seg_trade_diversion',
    name: 'Trade Diversion Target',
    domain_scope: 'customer',
    mode: 'dynamic',
    filters: {
      industryKeywords: [
        'aero',
        'aviation',
        'defense',
        'semiconductor',
        'electronics',
        'industrial',
        'manufactur',
        'distribution',
        'logistics',
        'chemical',
        'technology',
        'telecom',
      ],
      personas: ['CCO/GC', 'CPO', 'CAE'],
    },
    static_contact_ids: [],
  },
  {
    id: 'seg_tier1_f500_execs',
    name: 'Fortune 500 · Tier I Execs',
    domain_scope: 'customer',
    mode: 'dynamic',
    filters: {
      tiers: ['Tier I'],
      f500Only: true,
    },
    static_contact_ids: [],
  },
  {
    id: 'seg_inv_p1_seed',
    name: 'Priority P1 Seed Leads',
    domain_scope: 'investor',
    mode: 'dynamic',
    filters: {
      personas: ['P1'],
    },
    static_contact_ids: [],
  },
];

function isRecentlyContacted(c: Contact, days: number): boolean {
  if (days <= 0 || !c.last_contacted_at) return false;
  const ts = Date.parse(c.last_contacted_at);
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts < days * 86_400_000;
}

function evaluateSegmentContacts(
  segment: SavedOutreachSegment,
  pool: Contact[],
  domainScope: ContactType
): Contact[] {
  if (segment.mode === 'static' && segment.static_contact_ids.length > 0) {
    const idSet = new Set(segment.static_contact_ids);
    return pool.filter((c) => idSet.has(c.id));
  }

  const f = segment.filters || {};
  const q = (f.searchQuery || '').trim().toLowerCase();
  const kwList = (f.industryKeywords || []).map((k) => k.toLowerCase());

  return pool.filter((c) => {
    if (f.cooldownDays && f.cooldownDays > 0 && isRecentlyContacted(c, f.cooldownDays)) {
      return false;
    }
    if (f.f500Only && !c.fortune_500) return false;
    if (q) {
      const hay = `${c.full_name} ${c.organization} ${c.email} ${c.title || ''} ${c.industry || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (f.regions && f.regions.length > 0 && !f.regions.includes(c.region)) return false;
    if (f.sectors && f.sectors.length > 0 && !f.sectors.includes(c.industry || '')) return false;
    if (kwList.length > 0) {
      const indHay = `${c.industry || ''} ${c.organization || ''} ${c.notes || ''}`.toLowerCase();
      if (!kwList.some((kw) => indHay.includes(kw))) return false;
    }
    if (f.personas && f.personas.length > 0) {
      const pKey = domainScope === 'customer' ? c.buyer_persona || '' : c.priority_tier || '';
      if (!f.personas.includes(pKey)) return false;
    }
    if (domainScope === 'customer' && f.tiers && f.tiers.length > 0) {
      if (!f.tiers.includes(c.tier || 'Tier I')) return false;
    }
    if (f.stages && f.stages.length > 0 && !f.stages.includes(c.stage)) return false;
    if (f.owners && f.owners.length > 0 && !f.owners.includes(c.owner || 'Unassigned')) {
      return false;
    }
    return true;
  });
}

interface PlaybookPreset {
  id: string;
  label: string;
  portalMode: PortalLinkMode;
  subject: string;
  body: string;
}

const CUSTOMER_PLAYBOOKS: PlaybookPreset[] = [
  {
    id: 'cco_doj',
    label: 'CCO / GC · DOJ ECCP & 3rd-Party Risk',
    portalMode: 'none',
    subject: 'Continuous compliance & third-party oversight',
    body: `Hi {{first_name}},

Most compliance teams still rely on periodic sample testing across siloed ERPs—leaving blind spots around FCPA, third-party onboarding, and post-clearance trade exposure.

Led in the Americas by former DOJ Fraud Section Trial Attorney David Maria, Fortifai deploys inside your private VPC (zero data egress) to continuously monitor 100% of SAP/Oracle transactions and surface defensible audit trails.

Open to a brief 15-minute exchange next Tuesday or Thursday?

Best,
Varun Mowar
Founder & CEO, Fortifai`,
  },
  {
    id: 'cae_audit',
    label: 'Chief Audit Exec · 100% ERP Population',
    portalMode: 'none',
    subject: '100% transaction surveillance for Internal Audit',
    body: `Hi {{first_name}},

Traditional internal audit teams inspect under 5% of ERP transactions via quarterly samples—missing control overrides and duplicate leakage until months after close.

Fortifai runs 100% inside your cloud or on-prem boundary (zero data egress) to test every P2P, O2C, and GL entry continuously, auto-assembling COSO / PCAOB AS 1105 evidence packs and cutting investigation effort by 50%+.

Worth a quick 15-minute walkthrough of how peers run continuous audit on SAP/Oracle?

Best,
Varun Mowar
Founder & CEO, Fortifai`,
  },
  {
    id: 'cfo_margin',
    label: 'CFO / CAO · 2–5% Margin & P2P Recovery',
    portalMode: 'none',
    subject: 'Preventing P2P & margin leakage',
    body: `Hi {{first_name}},

Across $1B+ enterprises, 2% to 5% of spend quietly leaks through off-contract pricing, duplicate disbursements, and unapplied vendor credits that clean sample audits miss.

Fortifai deploys inside your private VPC with deterministic SQL math—flagging overpayments pre-payment run and surfacing up to $24.4M in stoppable exposure in a single deployment.

Open to a 15-minute look at the numbers next week?

Best,
Varun Mowar
Founder & CEO, Fortifai`,
  },
  {
    id: 'cpo_supply',
    label: 'CPO · Pass-Through Vendor & Price Guard',
    portalMode: 'none',
    subject: 'Vendor price variance & middleman visibility',
    body: `Hi {{first_name}},

Fortifai connects read-only to your ERP and procurement tables inside your VPC to benchmark every PO against contract terms, commodity indices, and external counterparty substance—exposing pass-through markups before cash leaves.

Would you have 15 minutes next week to compare notes?

Best,
Varun Mowar
Founder & CEO, Fortifai`,
  },
  {
    id: 'warm_control_tower',
    label: 'Warm Follow-Up · Multi-Agent Control Tower',
    portalMode: 'overview',
    subject: 'Fortifai Multi-Agent Control Tower — architecture update',
    body: `Hi {{first_name}},

Following up on our earlier conversation—wanted to share how we have unified our Audit, Compliance, Finance, and Procurement agents into a single in-VPC Control Tower running 100% inside your security boundary with zero data egress.

You can explore the interactive agent suite and ROI simulator here: {{portal_link}}

Open to a brief 15-minute catch-up next week?

Best,
Varun Mowar
Founder & CEO, Fortifai`,
  },
];

const INVESTOR_PLAYBOOKS: PlaybookPreset[] = [
  {
    id: 'inv_wave1',
    label: 'US Institutional Seed · Wave 1 Intro ($3M / $15M Cap)',
    portalMode: 'investor',
    subject: 'Fortifai — Autonomous Audit & Compliance for Fortune 500 ($3M Seed)',
    body: `Hi {{first_name}},

We are raising a $3M Seed ($15M cap post-money SAFE) with enterprise deployments across Honeywell, Nokia, and Brookfield Properties—monitoring 100% of ERP transactions inside the customer's VPC with zero data egress.

Deck, 2027–2031 financial model, and live SAFE portal: {{portal_link}}

Would you have 20 minutes next week to connect?

Best,
Varun Mowar
Co-Founder & CEO, Fortifai`,
  },
  {
    id: 'inv_nudge',
    label: 'In-Thread Reminder · Traction & Portal Update',
    portalMode: 'investor',
    subject: 'Re: Fortifai ($3M Seed)',
    body: `Hi {{first_name}},

Wanted to share a quick update as we finalize our $3M Seed ($15M cap post-money SAFE)—we just expanded our Fortune 500 enterprise pipeline across US Aero & Defense, Pharma, and Industrial accounts with former DOJ Fraud Section Trial Attorney David Maria leading the Americas.

Updated deck & model are live here: {{portal_link}}

Open to a quick 15-minute conversation next week?

Best,
Varun Mowar
Co-Founder & CEO, Fortifai`,
  },
];

const MARKETING_SENDER_IDENTITY = 'Fortifai <contact@fortifai.io>';

function formatUserSender(user: CrmUser): string {
  const displayName = user.sender_display_name?.trim() || user.full_name;
  return `${displayName} <${user.email}>`;
}

interface MultiSelectDropdownProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  searchable?: boolean;
}

function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
  searchable = false,
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const [filterText, setFilterText] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  const visibleOptions = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, filterText]);

  const toggleItem = (item: string) => {
    if (selected.includes(item)) {
      onChange(selected.filter((s) => s !== item));
    } else {
      onChange([...selected, item]);
    }
  };

  const summaryText =
    selected.length === 0
      ? `${label}: All`
      : selected.length === 1
      ? `${label}: ${selected[0]}`
      : `${label} (${selected.length})`;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`w-full px-2.5 py-1.5 rounded-[4px] border text-xs flex items-center justify-between gap-1.5 transition-colors ${
          selected.length > 0
            ? 'bg-indigo-50/70 border-indigo-300 text-indigo-900 font-medium'
            : 'bg-white border-[#E2E8F0] text-slate-700 hover:bg-slate-50'
        }`}
      >
        <span className="truncate">{summaryText}</span>
        <ChevronDown size={13} className="shrink-0 text-slate-400" />
      </button>

      {open && (
        <div className="absolute left-0 mt-1 w-64 max-w-[85vw] bg-white border border-[#E2E8F0] rounded-[6px] shadow-lg z-30 p-2 space-y-1.5">
          {searchable && (
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder={`Search ${label.toLowerCase()}...`}
              className="w-full px-2 py-1 text-xs bg-slate-50 border border-[#E2E8F0] rounded-[4px] focus:outline-none focus:bg-white"
            />
          )}

          <div className="flex items-center justify-between text-[11px] px-1 py-0.5 border-b border-slate-100">
            <button
              type="button"
              onClick={() => onChange([...options])}
              className="text-indigo-600 hover:underline font-medium"
            >
              Select All
            </button>
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-slate-500 hover:text-slate-800 hover:underline"
            >
              Clear ({selected.length})
            </button>
          </div>

          <div className="max-h-52 overflow-y-auto divide-y divide-slate-50">
            {visibleOptions.length === 0 ? (
              <div className="py-3 text-center text-[11px] text-slate-400">No matches</div>
            ) : (
              visibleOptions.map((opt) => {
                const checked = selected.includes(opt);
                return (
                  <label
                    key={opt}
                    className="flex items-center gap-2 px-1.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 rounded cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleItem(opt)}
                      className="rounded border-slate-300 text-[#0D1520]"
                    />
                    <span className="truncate">{opt}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function ComposerView({
  currentUser,
  activeUsers,
  canSendCampaigns,
  sendFrom,
  onChangeSendFrom,
  useAssignedOwnerSender,
  onChangeUseAssignedOwnerSender,
  bccEnabled,
  onChangeBccEnabled,
  portalLinkMode,
  onChangePortalLinkMode,
  domainScope,
  eligibleRecipients,
  suppressedCount,
  selectedIds,
  onChangeSelectedIds,
  subject,
  onChangeSubject,
  body,
  onChangeBody,
  previewIdx,
  onChangePreviewIdx,
  sendingBatch,
  sendingTest,
  onSendBatch,
  onSendTestToMe,
  renderTemplate,
  filterResetSeq = 0,
  telemetry = [],
  onCancelSequence,
}: ComposerViewProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const domainRecipients = useMemo(
    () => eligibleRecipients.filter((c) => c.contact_type === domainScope),
    [eligibleRecipients, domainScope]
  );

  // 3-Step Wizard Navigation + Sent Logs Tab
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [viewMode, setViewMode] = useState<'wizard' | 'logs'>('wizard');

  // Step 1: Audience & Multi-Select Filters (Defaults to 'segment' so Saved Views & Filters are front and center)
  const [outreachMode, setOutreachMode] = useState<'dm' | 'segment'>('segment');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeQuickCohort, setActiveQuickCohort] = useState<string | null>(null);
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
  const [activeIndustryKeywords, setActiveIndustryKeywords] = useState<string[]>([]);
  const [selectedPersonas, setSelectedPersonas] = useState<string[]>([]);
  const [selectedTiers, setSelectedTiers] = useState<string[]>([]);
  const [selectedStages, setSelectedStages] = useState<string[]>([]);
  const [selectedOwners, setSelectedOwners] = useState<string[]>([]);
  const [f500Only, setF500Only] = useState<boolean>(false);
  const [cooldownDays, setCooldownDays] = useState<number>(0);

  // Saved Views / Target Segments State
  const [savedSegments, setSavedSegments] = useState<SavedOutreachSegment[]>(() => {
    try {
      const raw = localStorage.getItem(SEGMENTS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SavedOutreachSegment[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return DEFAULT_SAVED_SEGMENTS;
  });
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [pinnedSegmentIds, setPinnedSegmentIds] = useState<string[] | null>(null);
  const [isSavePanelOpen, setIsSavePanelOpen] = useState(false);
  const [newSegmentName, setNewSegmentName] = useState('');
  const [newSegmentMode, setNewSegmentMode] = useState<'dynamic' | 'static'>('dynamic');
  const [segmentBanner, setSegmentBanner] = useState<string | null>(null);
  const [composerSegmentMenuOpen, setComposerSegmentMenuOpen] = useState(false);

  // Step 2 & 3: AI Hooks + Per-Recipient VIP Overrides
  const [activePlaybookId, setActivePlaybookId] = useState<string>('');
  const [aiHooksById, setAiHooksById] = useState<Record<string, string>>({});
  const [generatingAiHooks, setGeneratingAiHooks] = useState(false);
  const [aiStatusBanner, setAiStatusBanner] = useState<string | null>(null);
  const [vipBodyOverrides, setVipBodyOverrides] = useState<Record<string, string>>({});
  const [editingVipId, setEditingVipId] = useState<string | null>(null);

  const flashSegmentBanner = (msg: string) => {
    setSegmentBanner(msg);
    window.setTimeout(() => {
      setSegmentBanner((prev) => (prev === msg ? null : prev));
    }, 3200);
  };

  const persistSegmentsLocally = (next: SavedOutreachSegment[]) => {
    setSavedSegments(next);
    try {
      localStorage.setItem(SEGMENTS_STORAGE_KEY, JSON.stringify(next));
    } catch {}
  };

  const getAuthToken = useCallback(async (): Promise<string> => {
    try {
      const cached = localStorage.getItem('fortifai_scale_session_token_v1');
      if (cached) return cached;
    } catch {}
    try {
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: currentUser.email,
          role: currentUser.role,
          permissions: currentUser.permissions,
          is_active: currentUser.is_active,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; token?: string };
      return data.token || '';
    } catch {
      return '';
    }
  }, [currentUser]);

  // Hydrate cloud-saved segments from Supabase (/api/crm/segments) and merge with local segments
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const token = await getAuthToken();
        if (!token) return;
        const res = await fetch('/api/crm/segments', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await res.json()) as {
          ok?: boolean;
          segments?: SavedOutreachSegment[];
        };
        if (cancelled || !data.ok || !Array.isArray(data.segments) || data.segments.length === 0) {
          return;
        }
        setSavedSegments((prev) => {
          const byId = new Map<string, SavedOutreachSegment>();
          prev.forEach((s) => byId.set(s.id, s));
          data.segments!.forEach((s) => byId.set(s.id, s));
          const merged = Array.from(byId.values());
          try {
            localStorage.setItem(SEGMENTS_STORAGE_KEY, JSON.stringify(merged));
          } catch {}
          return merged;
        });
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [getAuthToken]);

  useEffect(() => {
    setSearchQuery('');
    setActiveQuickCohort(null);
    setActiveSegmentId(null);
    setPinnedSegmentIds(null);
    setSelectedRegions([]);
    setSelectedSectors([]);
    setActiveIndustryKeywords([]);
    setSelectedPersonas([]);
    setSelectedTiers([]);
    setSelectedStages([]);
    setSelectedOwners([]);
    setF500Only(false);
    setCooldownDays(0);
    setEditingVipId(null);
    setViewMode('wizard');
    // Jump directly to Step 2 only when explicitly triggered from a 1-to-1 contact action (filterResetSeq > 0)
    if (filterResetSeq > 0 && selectedIds.length === 1) {
      setOutreachMode('dm');
      setStep(2);
    } else if (filterResetSeq > 0 && selectedIds.length > 1) {
      setOutreachMode('segment');
      setStep(2);
    } else {
      setOutreachMode('segment');
      setStep(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domainScope, filterResetSeq]);

  const domainSavedSegments = useMemo(
    () => savedSegments.filter((s) => s.domain_scope === domainScope),
    [savedSegments, domainScope]
  );

  const segmentCountsById = useMemo(() => {
    const map = new Map<string, Contact[]>();
    domainSavedSegments.forEach((seg) => {
      map.set(seg.id, evaluateSegmentContacts(seg, domainRecipients, domainScope));
    });
    return map;
  }, [domainSavedSegments, domainRecipients, domainScope]);

  const facetOptions = useMemo(() => {
    const regions = new Set<string>();
    const sectors = new Set<string>();
    const personas = new Set<string>();
    const stages = new Set<string>();
    const owners = new Set<string>();

    domainRecipients.forEach((c) => {
      if (c.region) regions.add(c.region);
      if (c.industry && !c.industry.startsWith('%') && c.industry !== '0') {
        sectors.add(c.industry);
      }
      if (domainScope === 'customer' && c.buyer_persona) personas.add(c.buyer_persona);
      if (domainScope === 'investor' && c.priority_tier) personas.add(c.priority_tier);
      if (c.stage) stages.add(c.stage);
      owners.add(c.owner || 'Unassigned');
    });

    return {
      regions: Array.from(regions).sort(),
      sectors: Array.from(sectors).sort(),
      personas: Array.from(personas).sort(),
      stages: Array.from(stages).sort(),
      owners: Array.from(owners).sort(),
    };
  }, [domainRecipients, domainScope]);

  const filteredRecipients = useMemo(() => {
    if (pinnedSegmentIds !== null) {
      const idSet = new Set(pinnedSegmentIds);
      const q = searchQuery.trim().toLowerCase();
      return domainRecipients.filter((c) => {
        if (!idSet.has(c.id)) return false;
        if (q) {
          const hay = `${c.full_name} ${c.organization} ${c.email} ${c.title || ''} ${c.industry || ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
    }

    const q = searchQuery.trim().toLowerCase();
    return domainRecipients.filter((c) => {
      if (cooldownDays > 0 && isRecentlyContacted(c, cooldownDays)) return false;
      if (q) {
        const match =
          c.full_name.toLowerCase().includes(q) ||
          c.organization.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          (c.title || '').toLowerCase().includes(q) ||
          (c.industry || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      if (outreachMode === 'dm') return true;

      if (f500Only && !c.fortune_500) return false;
      if (selectedRegions.length > 0 && !selectedRegions.includes(c.region)) return false;
      if (selectedSectors.length > 0 && !selectedSectors.includes(c.industry || '')) return false;
      if (activeIndustryKeywords.length > 0) {
        const indHay = `${c.industry || ''} ${c.organization || ''} ${c.notes || ''}`.toLowerCase();
        if (!activeIndustryKeywords.some((kw) => indHay.includes(kw.toLowerCase()))) {
          return false;
        }
      }
      if (selectedPersonas.length > 0) {
        const key = domainScope === 'customer' ? c.buyer_persona || '' : c.priority_tier || '';
        if (!selectedPersonas.includes(key)) return false;
      }
      if (domainScope === 'customer' && selectedTiers.length > 0) {
        if (!selectedTiers.includes(c.tier || 'Tier I')) return false;
      }
      if (selectedStages.length > 0 && !selectedStages.includes(c.stage)) return false;
      if (selectedOwners.length > 0 && !selectedOwners.includes(c.owner || 'Unassigned')) {
        return false;
      }
      return true;
    });
  }, [
    domainRecipients,
    domainScope,
    outreachMode,
    pinnedSegmentIds,
    searchQuery,
    f500Only,
    selectedRegions,
    selectedSectors,
    activeIndustryKeywords,
    selectedPersonas,
    selectedTiers,
    selectedStages,
    selectedOwners,
    cooldownDays,
  ]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const activeRecipients = useMemo(
    () => domainRecipients.filter((c) => selectedSet.has(c.id)),
    [domainRecipients, selectedSet]
  );

  const visibleSlice = useMemo(() => filteredRecipients.slice(0, 200), [filteredRecipients]);
  const allFilteredSelected =
    filteredRecipients.length > 0 && filteredRecipients.every((r) => selectedSet.has(r.id));

  const toggleSelectAllMatching = () => {
    if (allFilteredSelected) {
      const filteredSet = new Set(filteredRecipients.map((r) => r.id));
      onChangeSelectedIds(selectedIds.filter((id) => !filteredSet.has(id)));
    } else {
      const merged = Array.from(new Set([...selectedIds, ...filteredRecipients.map((r) => r.id)]));
      onChangeSelectedIds(merged);
    }
    onChangePreviewIdx(0);
  };

  const resetAllFiltersToAllEligible = (selectAll = false) => {
    setActiveSegmentId(null);
    setPinnedSegmentIds(null);
    setActiveQuickCohort(null);
    setSearchQuery('');
    setSelectedRegions([]);
    setSelectedSectors([]);
    setActiveIndustryKeywords([]);
    setSelectedPersonas([]);
    setSelectedTiers([]);
    setSelectedStages([]);
    setSelectedOwners([]);
    setF500Only(false);
    setCooldownDays(0);
    if (selectAll) {
      onChangeSelectedIds(domainRecipients.map((c) => c.id));
      onChangePreviewIdx(0);
    }
  };

  // Load a Saved Segment Tab (applies filters AND selects those contacts for outreach)
  const handleSelectSavedSegment = (seg: SavedOutreachSegment) => {
    setOutreachMode('segment');
    setActiveSegmentId(seg.id);
    setActiveQuickCohort(null);

    const f = seg.filters || {};
    setSearchQuery(f.searchQuery || '');
    setSelectedRegions(f.regions || []);
    setSelectedSectors(f.sectors || []);
    setActiveIndustryKeywords(f.industryKeywords || []);
    setSelectedPersonas(f.personas || []);
    setSelectedTiers(f.tiers || []);
    setSelectedStages(f.stages || []);
    setSelectedOwners(f.owners || []);
    setF500Only(Boolean(f.f500Only));
    setCooldownDays(f.cooldownDays || 0);

    if (seg.mode === 'static' && seg.static_contact_ids.length > 0) {
      setPinnedSegmentIds(seg.static_contact_ids);
    } else {
      setPinnedSegmentIds(null);
    }

    const matched = evaluateSegmentContacts(seg, domainRecipients, domainScope);
    onChangeSelectedIds(matched.map((c) => c.id));
    onChangePreviewIdx(0);
    flashSegmentBanner(`Loaded "${seg.name}" · ${matched.length} contacts selected for outreach`);
  };

  // Append a Saved Segment's contacts to current campaign recipients without losing existing selections
  const handleAppendSegmentToRecipients = (seg: SavedOutreachSegment) => {
    const matched = evaluateSegmentContacts(seg, domainRecipients, domainScope);
    const merged = Array.from(new Set([...selectedIds, ...matched.map((c) => c.id)]));
    const addedCount = merged.length - selectedIds.length;
    onChangeSelectedIds(merged);
    onChangePreviewIdx(0);
    flashSegmentBanner(
      addedCount > 0
        ? `Added +${addedCount} contacts from "${seg.name}" (${merged.length} total recipients)`
        : `All ${matched.length} contacts in "${seg.name}" are already in your recipient list`
    );
  };

  const buildCurrentFilterSnapshot = (): SavedSegmentFilters => ({
    ...(searchQuery.trim() ? { searchQuery: searchQuery.trim() } : {}),
    ...(selectedRegions.length > 0 ? { regions: selectedRegions } : {}),
    ...(selectedSectors.length > 0 ? { sectors: selectedSectors } : {}),
    ...(activeIndustryKeywords.length > 0 ? { industryKeywords: activeIndustryKeywords } : {}),
    ...(selectedPersonas.length > 0 ? { personas: selectedPersonas } : {}),
    ...(selectedTiers.length > 0 ? { tiers: selectedTiers } : {}),
    ...(selectedStages.length > 0 ? { stages: selectedStages } : {}),
    ...(selectedOwners.length > 0 ? { owners: selectedOwners } : {}),
    ...(f500Only ? { f500Only: true } : {}),
    ...(cooldownDays > 0 ? { cooldownDays } : {}),
  });

  const syncSegmentToBackend = async (segment: SavedOutreachSegment) => {
    try {
      const token = await getAuthToken();
      if (!token) return;
      await fetch('/api/crm/segments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ segment }),
      });
    } catch {}
  };

  const handleCreateSavedSegment = () => {
    const trimmed = newSegmentName.trim();
    if (!trimmed) return;

    const targetIds =
      newSegmentMode === 'static'
        ? activeRecipients.length > 0
          ? activeRecipients.map((r) => r.id)
          : filteredRecipients.map((r) => r.id)
        : [];

    const created: SavedOutreachSegment = {
      id: `seg_${Date.now()}`,
      name: trimmed,
      domain_scope: domainScope,
      mode: newSegmentMode,
      filters: buildCurrentFilterSnapshot(),
      static_contact_ids: targetIds,
      created_by: currentUser.email,
      updated_at: new Date().toISOString(),
    };

    const nextList = [...savedSegments, created];
    persistSegmentsLocally(nextList);
    void syncSegmentToBackend(created);

    setActiveSegmentId(created.id);
    setPinnedSegmentIds(newSegmentMode === 'static' ? targetIds : null);
    const matched = evaluateSegmentContacts(created, domainRecipients, domainScope);
    onChangeSelectedIds(matched.map((c) => c.id));
    onChangePreviewIdx(0);

    setNewSegmentName('');
    setIsSavePanelOpen(false);
    flashSegmentBanner(`Saved Target Segment "${created.name}" (${matched.length} contacts)`);
  };

  const handleUpdateActiveSegment = () => {
    if (!activeSegmentId) return;
    const existing = savedSegments.find((s) => s.id === activeSegmentId);
    if (!existing) return;

    const updated: SavedOutreachSegment = {
      ...existing,
      filters: buildCurrentFilterSnapshot(),
      static_contact_ids:
        existing.mode === 'static' ? activeRecipients.map((r) => r.id) : [],
      updated_at: new Date().toISOString(),
    };

    const nextList = savedSegments.map((s) => (s.id === updated.id ? updated : s));
    persistSegmentsLocally(nextList);
    void syncSegmentToBackend(updated);
    flashSegmentBanner(`Updated Target Segment "${updated.name}"`);
  };

  const handleDeleteSegment = async (seg: SavedOutreachSegment) => {
    if (!window.confirm(`Remove saved segment "${seg.name}"?`)) return;
    const nextList = savedSegments.filter((s) => s.id !== seg.id);
    persistSegmentsLocally(nextList);
    if (activeSegmentId === seg.id) {
      resetAllFiltersToAllEligible(false);
    }
    try {
      const token = await getAuthToken();
      if (token) {
        await fetch(`/api/crm/segments/${encodeURIComponent(seg.id)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {}
  };

  // Sent Logs derived from telemetry + contacts with sent_at / delivery_status
  const sentLogs = useMemo(() => {
    const fromTelemetry = telemetry
      .filter((t) => {
        const c = domainRecipients.find((r) => r.id === t.contact_id);
        return (
          Boolean(c) &&
          ['email_sent', 'email_delivered', 'email_opened', 'email_bounced'].includes(t.event_type)
        );
      })
      .map((t) => ({
        id: t.id,
        contactName: t.contact_name,
        organization: t.organization,
        detail: t.detail,
        status: t.event_type === 'email_bounced' ? 'Bounced' : 'Sent',
        sender: t.sender_from || sendFrom,
        bcc: t.bcc_inbox || '',
        timestamp: t.timestamp,
      }));

    const teleContactIds = new Set(telemetry.map((t) => t.contact_id));
    const fromContacts = domainRecipients
      .filter(
        (c) =>
          !teleContactIds.has(c.id) &&
          (c.sent_at ||
            ['sent', 'delivered', 'opened', 'portal_visited', 'replied'].includes(
              c.delivery_status || ''
            ))
      )
      .map((c) => ({
        id: `log_${c.id}`,
        contactName: c.full_name,
        organization: c.organization,
        detail: `Status: ${c.delivery_status || 'sent'} (${c.email})`,
        status:
          c.delivery_status === 'replied'
            ? 'Replied'
            : c.delivery_status === 'opened' || c.email_opened
            ? 'Opened'
            : 'Sent',
        sender: c.owner_email || sendFrom,
        bcc: '',
        timestamp: c.sent_at || 'Logged in CRM',
      }));

    return [...fromTelemetry, ...fromContacts];
  }, [telemetry, domainRecipients, sendFrom]);

  const handleCancelSequence = () => {
    const hasProgress =
      selectedIds.length > 0 ||
      Object.keys(aiHooksById).length > 0 ||
      Object.keys(vipBodyOverrides).length > 0 ||
      step > 1;
    if (
      hasProgress &&
      !window.confirm(
        'Cancel the current outreach sequence? This will clear selected recipients, AI hooks, and reset the draft.'
      )
    ) {
      return;
    }
    onChangeSelectedIds([]);
    onChangePreviewIdx(0);
    resetAllFiltersToAllEligible(false);
    setActivePlaybookId('');
    setAiHooksById({});
    setAiStatusBanner(null);
    setVipBodyOverrides({});
    setEditingVipId(null);
    setViewMode('wizard');
    setStep(1);
    if (onCancelSequence) onCancelSequence();
  };

  const applyQuickCohort = (
    type: 'hot_signals' | 'active_pipeline' | 'tier1_legal_audit' | 'tier1_finance_proc' | 'uncontacted'
  ) => {
    setOutreachMode('segment');
    setActiveSegmentId(null);
    setPinnedSegmentIds(null);
    setActiveQuickCohort(type);
    setSearchQuery('');
    setSelectedRegions([]);
    setSelectedSectors([]);
    setActiveIndustryKeywords([]);
    setSelectedPersonas([]);
    setSelectedTiers([]);
    setSelectedStages([]);
    setSelectedOwners([]);
    setF500Only(false);

    let matched: Contact[] = [];
    if (type === 'hot_signals') {
      matched = domainRecipients.filter((c) => c.portal_visited || c.email_opened);
    } else if (type === 'active_pipeline') {
      matched = domainRecipients.filter((c) => !c.omit_from_pipeline && c.stage !== '1 Lead');
    } else if (type === 'tier1_legal_audit') {
      setSelectedTiers(['Tier I']);
      setSelectedPersonas(['CCO/GC', 'CAE']);
      matched = domainRecipients.filter(
        (c) => (c.tier || 'Tier I') === 'Tier I' && ['CCO/GC', 'CAE'].includes(c.buyer_persona || '')
      );
    } else if (type === 'tier1_finance_proc') {
      setSelectedTiers(['Tier I']);
      setSelectedPersonas(['CFO', 'CPO']);
      matched = domainRecipients.filter(
        (c) => (c.tier || 'Tier I') === 'Tier I' && ['CFO', 'CPO'].includes(c.buyer_persona || '')
      );
    } else {
      matched = domainRecipients.filter((c) => !c.delivery_status || c.delivery_status === 'not_sent');
    }
    onChangeSelectedIds(matched.map((c) => c.id));
    onChangePreviewIdx(0);
  };

  const applyPlaybook = (preset: PlaybookPreset) => {
    setActivePlaybookId(preset.id);
    onChangeSubject(preset.subject);
    onChangeBody(preset.body);
    onChangePortalLinkMode(preset.portalMode);
    setVipBodyOverrides({});
  };

  const handleGenerateAiHooks = async () => {
    if (activeRecipients.length === 0 || generatingAiHooks) return;
    setGeneratingAiHooks(true);
    setAiStatusBanner(null);
    try {
      const token = await getAuthToken();
      const targetBatch = activeRecipients.slice(0, 35);
      const resp = await fetch('/api/personalize-outreach', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          audienceType: domainScope,
          playbookAngle: subject,
          recipients: targetBatch.map((r) => ({
            id: r.id,
            full_name: r.full_name,
            title: r.title,
            organization: r.organization,
            industry: r.industry,
            buyer_persona: r.buyer_persona,
            priority_tier: r.priority_tier,
            stage: r.stage,
            fortune_500: r.fortune_500,
            notes: r.notes,
          })),
        }),
      });
      const data = (await resp.json()) as {
        ok?: boolean;
        hooks?: Record<string, string>;
        dossiersUsed?: number;
        error?: string;
      };
      if (!resp.ok || !data.ok || !data.hooks) {
        setAiStatusBanner(data.error || 'Unable to generate AI hooks.');
        return;
      }
      setAiHooksById((prev) => ({ ...prev, ...data.hooks }));
      const generatedCount = Object.keys(data.hooks).length;
      setAiStatusBanner(
        `Generated ${generatedCount} account-tailored opening lines (${data.dossiersUsed || 0} grounded in Account Intelligence Dossiers) — visible in Step 3 preview.`
      );
    } catch {
      setAiStatusBanner('Network error calling /api/personalize-outreach.');
    } finally {
      setGeneratingAiHooks(false);
    }
  };

  const portalAttachValue: PortalLinkMode =
    domainScope === 'investor' ? 'investor' : 'overview';
  const portalHost =
    domainScope === 'investor' ? 'investor.fortifai.io' : 'overview.fortifai.io';
  const effectivePortalMode: PortalLinkMode =
    portalLinkMode === portalAttachValue ? portalAttachValue : 'none';

  const insertTokenAtCursor = (token: string) => {
    const el = textareaRef.current;
    if (!el) {
      onChangeBody(body ? `${body} ${token}` : token);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const before = body.slice(0, start);
    const after = body.slice(end);
    const pad = before.length > 0 && !/[\s\n]$/.test(before) ? ' ' : '';
    const nextValue = `${before}${pad}${token}${after}`;
    onChangeBody(nextValue);
    const nextCaret = start + pad.length + token.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const renderFinalPreviewBody = (sample: Contact): string => {
    if (vipBodyOverrides[sample.id] !== undefined) {
      return vipBodyOverrides[sample.id];
    }
    let text = renderTemplate(body, sample);
    if (aiHooksById[sample.id]) {
      text = text.replace(/^(Hi [^\n]+,\n\n)/i, `$1${aiHooksById[sample.id]}\n\n`);
    }
    if (effectivePortalMode === 'none') {
      return text.replace(/\n?\s*\{\{portal_link\}\}\s*/g, '').trimEnd();
    }
    const trackedUrl = `https://${portalHost}/?ref=${encodeURIComponent(sample.id)}`;
    if (text.includes('{{portal_link}}')) {
      return text.replace(/\{\{portal_link\}\}/g, trackedUrl);
    }
    if (!text.includes(`${portalHost}/?ref=`)) {
      const ctaLabel =
        effectivePortalMode === 'investor'
          ? 'Investor portal & deck'
          : 'Interactive product overview';
      return `${text.trimEnd()}\n\n${ctaLabel}: ${trackedUrl}`;
    }
    return text;
  };

  const sampleForLint =
    activeRecipients[Math.min(previewIdx, Math.max(0, activeRecipients.length - 1))] ||
    filteredRecipients[0];
  const renderedSampleText = sampleForLint ? renderFinalPreviewBody(sampleForLint) : body;
  const wordCount = renderedSampleText.trim().split(/\s+/).filter(Boolean).length;
  const hasColdStageProspects = activeRecipients.some((c) => c.stage === '1 Lead');
  const coldLinkWarning =
    domainScope === 'customer' && hasColdStageProspects && effectivePortalMode !== 'none';

  const personalSender = formatUserSender(currentUser);
  const canSendAsMarketing =
    ['super_admin', 'admin', 'marketing'].includes(currentUser.role) ||
    Boolean(currentUser.permissions.can_send_as_marketing);
  const senderOptions = canSendAsMarketing
    ? [personalSender, MARKETING_SENDER_IDENTITY]
    : [personalSender];

  const resolveSenderForContact = (contact?: Contact): string => {
    if (!useAssignedOwnerSender || !contact) return sendFrom;
    const ownerUser =
      activeUsers.find((u) => u.id === contact.owner_id) ||
      activeUsers.find((u) => u.email.toLowerCase() === (contact.owner_email || '').toLowerCase());
    return ownerUser ? formatUserSender(ownerUser) : personalSender;
  };

  const isExternalVerifiedLive = (c: Contact): boolean =>
    c.email.trim().toLowerCase().endsWith('@fortifai.io') || c.is_demo === false;
  const verifiedSelectedCount = activeRecipients.filter(isExternalVerifiedLive).length;
  const blockedSelectedCount = activeRecipients.length - verifiedSelectedCount;

  const ownerPreviewEmail = currentUser.email.trim().toLowerCase();
  const playbooks = domainScope === 'investor' ? INVESTOR_PLAYBOOKS : CUSTOMER_PLAYBOOKS;
  const activeSegmentObj = domainSavedSegments.find((s) => s.id === activeSegmentId) || null;

  // Reusable Target Segment Injector Strip for Step 2 & Step 3 so users can add a saved segment right from the email editor
  const renderTargetSegmentPickerBar = () => (
    <div className="p-3 rounded-[5px] bg-slate-50 border border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2 text-xs">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800">
          <Layers size={13} className="text-sky-600" />
          Campaign Recipients:
        </span>
        <span className="px-2 py-0.5 rounded bg-white border border-[#E2E8F0] font-mono text-[11px] text-slate-800">
          {activeRecipients.length} selected
        </span>
        {activeSegmentObj && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-500/10 text-sky-700 border border-sky-300/60 text-[11px] font-medium">
            <BookmarkCheck size={11} />
            Segment: {activeSegmentObj.name}
          </span>
        )}
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={() => setComposerSegmentMenuOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[4px] bg-white border border-[#E2E8F0] text-slate-700 hover:bg-slate-100 font-medium text-[11.5px]"
        >
          <Plus size={12} className="text-sky-600" />
          Add Target Segment
          <ChevronDown size={12} className="text-slate-400" />
        </button>

        {composerSegmentMenuOpen && (
          <div className="absolute right-0 mt-1 w-72 bg-white border border-[#E2E8F0] rounded-[6px] shadow-xl z-40 p-2 space-y-1">
            <div className="px-2 py-1 text-[10.5px] font-mono uppercase text-slate-400 border-b border-slate-100">
              Saved Target Segments ({domainSavedSegments.length})
            </div>
            {domainSavedSegments.map((seg) => {
              const count = (segmentCountsById.get(seg.id) || []).length;
              return (
                <div
                  key={seg.id}
                  className="flex items-center justify-between gap-1.5 px-2 py-1.5 rounded hover:bg-slate-50"
                >
                  <button
                    type="button"
                    onClick={() => {
                      handleSelectSavedSegment(seg);
                      setComposerSegmentMenuOpen(false);
                    }}
                    className="text-left flex-1 min-w-0"
                    title="Replace recipients with this segment"
                  >
                    <div className="text-xs font-medium text-slate-800 truncate">{seg.name}</div>
                    <div className="text-[10.5px] text-slate-400 font-mono">
                      Use segment ({count} contacts)
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleAppendSegmentToRecipients(seg);
                      setComposerSegmentMenuOpen(false);
                    }}
                    className="px-2 py-1 rounded bg-sky-500/10 text-sky-700 border border-sky-300/60 hover:bg-sky-500/20 text-[10.5px] font-semibold shrink-0"
                    title="Append this segment to current recipients"
                  >
                    + Add ({count})
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="p-6 max-w-[1220px] w-full mx-auto space-y-5">
      {/* ===================================================================== */}
      {/* TOP BAR: 3-STEP WIZARD STEPPER + CANCEL SEQUENCE + SENT LOGS          */}
      {/* ===================================================================== */}
      <div className="bg-white border border-[#E2E8F0] rounded-[6px] p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {[
            {
              num: 1 as const,
              label: 'Step 1 · Audience & Saved Segments',
              sub: `${activeRecipients.length} selected`,
            },
            { num: 2 as const, label: 'Step 2 · Craft AI Message', sub: `${wordCount} words` },
            { num: 3 as const, label: 'Step 3 · Preview & Dispatch', sub: 'Owner preview + Resend' },
          ].map((s, idx) => {
            const isActive = viewMode === 'wizard' && step === s.num;
            const isDone = viewMode === 'wizard' && step > s.num;
            return (
              <div key={s.num} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('wizard');
                    setStep(s.num);
                  }}
                  className={`flex items-center gap-2.5 px-3.5 py-2 rounded-[5px] border text-left transition-colors ${
                    isActive
                      ? 'bg-[#0D1520] text-white border-[#0D1520]'
                      : isDone
                      ? 'bg-emerald-50/70 text-slate-900 border-emerald-200 hover:bg-emerald-50'
                      : 'bg-slate-50 text-slate-600 border-[#E2E8F0] hover:bg-slate-100'
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-mono font-semibold ${
                      isActive
                        ? 'bg-white text-[#0D1520]'
                        : isDone
                        ? 'bg-emerald-600 text-white'
                        : 'bg-white text-slate-600 border border-[#E2E8F0]'
                    }`}
                  >
                    {isDone ? <Check size={11} /> : s.num}
                  </span>
                  <div>
                    <div className="text-xs font-semibold leading-tight">{s.label}</div>
                    <div
                      className={`text-[10.5px] font-mono ${
                        isActive ? 'text-slate-300' : 'text-slate-400'
                      }`}
                    >
                      {s.sub}
                    </div>
                  </div>
                </button>
                {idx < 2 && <ChevronRight size={14} className="text-slate-300 hidden sm:block" />}
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCancelSequence}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[5px] border border-rose-200 bg-rose-50/70 text-rose-700 hover:bg-rose-100 text-xs font-medium transition-colors"
            title="Cancel and reset the current outreach sequence"
          >
            <XCircle size={14} />
            Cancel Sequence
          </button>

          <button
            type="button"
            onClick={() => setViewMode((prev) => (prev === 'logs' ? 'wizard' : 'logs'))}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-[5px] border text-xs font-medium transition-colors ${
              viewMode === 'logs'
                ? 'bg-[#0D1520] text-white border-[#0D1520]'
                : 'bg-white text-slate-700 border-[#E2E8F0] hover:bg-slate-50'
            }`}
          >
            <History size={14} />
            Sent Logs ({sentLogs.length})
          </button>
        </div>
      </div>

      {segmentBanner && (
        <div className="px-4 py-2.5 rounded-[6px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 text-xs font-medium flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5">
            <BookmarkCheck size={14} />
            {segmentBanner}
          </span>
          <button
            type="button"
            onClick={() => setSegmentBanner(null)}
            className="text-[11px] opacity-75 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ===================================================================== */}
      {/* VIEW A: SENT LOGS LEDGER                                              */}
      {/* ===================================================================== */}
      {viewMode === 'logs' && (
        <div className="bg-white border border-[#E2E8F0] rounded-[6px] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Outreach Sent History &amp; Delivery Ledger
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Every dispatched email, owner preview, and Resend delivery status logged in real time.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setViewMode('wizard')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#0D1520] rounded-[4px] hover:bg-slate-800"
            >
              <ArrowLeft size={13} />
              Back to Outreach Wizard
            </button>
          </div>

          {sentLogs.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-400 space-y-2">
              <Mail size={22} className="mx-auto text-slate-300" />
              <div>No outreach emails logged in this domain yet.</div>
              <div>Complete Steps 1–3 to send a preview email to yourself or dispatch to recipients.</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 border-b border-[#E2E8F0] text-[10.5px] font-mono uppercase text-slate-500">
                  <tr>
                    <th className="py-2.5 px-4">When</th>
                    <th className="py-2.5 px-4">Recipient</th>
                    <th className="py-2.5 px-4">Account / Fund</th>
                    <th className="py-2.5 px-4">Sender</th>
                    <th className="py-2.5 px-4">Subject / Detail</th>
                    <th className="py-2.5 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sentLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          <Clock size={11} />
                          {log.timestamp}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-medium text-slate-900 whitespace-nowrap">
                        {log.contactName}
                      </td>
                      <td className="py-2.5 px-4 text-slate-700 whitespace-nowrap">
                        {log.organization}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                        {log.sender}
                      </td>
                      <td className="py-2.5 px-4 text-slate-700 max-w-md truncate">
                        {log.detail}
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10.5px] font-mono border ${
                            log.status === 'Bounced'
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}
                        >
                          {log.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* STEP 1 SCREEN: SAVED VIEWS TAB BAR + MULTI-FILTER BUILDER + CONTACTS  */}
      {/* ===================================================================== */}
      {viewMode === 'wizard' && step === 1 && (
        <div className="bg-white border border-[#E2E8F0] rounded-[6px] p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] pb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Step 1: Select Target Segment or Filter Contacts
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Click any Saved View tab to load &amp; select that segment immediately, click <code className="font-mono">+</code> on a tab to combine multiple segments, or filter below and save a new Target Segment.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {suppressedCount > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2.5 py-1 rounded bg-amber-50 text-amber-800 border border-amber-200">
                  <ShieldAlert size={12} />
                  {suppressedCount} Passed / Unsubscribed excluded
                </span>
              )}
              <button
                type="button"
                disabled={activeRecipients.length === 0}
                onClick={() => setStep(2)}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#0D1520] rounded-[5px] hover:bg-slate-800 disabled:opacity-40 transition-colors"
              >
                Continue to Step 2 ({activeRecipients.length} selected)
                <ArrowRight size={14} />
              </button>
            </div>
          </div>

          {/* ================================================================= */}
          {/* QUICK-ACCESS SAVED VIEWS / TARGET SEGMENTS TAB STRIP              */}
          {/* ================================================================= */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
                {/* All Eligible Tab */}
                <button
                  type="button"
                  onClick={() => resetAllFiltersToAllEligible(true)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[5px] border text-xs font-medium whitespace-nowrap transition-colors ${
                    activeSegmentId === null && !activeQuickCohort
                      ? 'bg-[#0D1520] text-white border-[#0D1520]'
                      : 'bg-slate-50 text-slate-700 border-[#E2E8F0] hover:bg-slate-100'
                  }`}
                >
                  <Users size={12} />
                  <span>All Eligible</span>
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10.5px] font-mono ${
                      activeSegmentId === null && !activeQuickCohort
                        ? 'bg-white/20 text-white'
                        : 'bg-white text-slate-500 border border-[#E2E8F0]'
                    }`}
                  >
                    {domainRecipients.length}
                  </span>
                </button>

                {/* Saved Segment Tabs */}
                {domainSavedSegments.map((seg) => {
                  const isActive = activeSegmentId === seg.id;
                  const count = (segmentCountsById.get(seg.id) || []).length;
                  return (
                    <div
                      key={seg.id}
                      className={`inline-flex items-center rounded-[5px] border text-xs whitespace-nowrap transition-colors ${
                        isActive
                          ? 'bg-[#0D1520] text-white border-[#0D1520]'
                          : 'bg-slate-50 text-slate-700 border-[#E2E8F0] hover:bg-slate-100'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelectSavedSegment(seg)}
                        className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 font-medium"
                        title={`Load "${seg.name}" and select its ${count} contacts`}
                      >
                        <Bookmark size={11} className={isActive ? 'text-sky-300' : 'text-sky-600'} />
                        <span>{seg.name}</span>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10.5px] font-mono ${
                            isActive
                              ? 'bg-white/20 text-white'
                              : 'bg-white text-slate-600 border border-[#E2E8F0]'
                          }`}
                        >
                          {count}
                        </span>
                      </button>

                      {/* + Append Segment Contacts to Current Selection */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAppendSegmentToRecipients(seg);
                        }}
                        title={`Add "${seg.name}" contacts (+${count}) to current recipient selection`}
                        className={`px-1.5 py-1.5 border-l transition-colors ${
                          isActive
                            ? 'border-white/20 text-sky-300 hover:bg-white/10'
                            : 'border-[#E2E8F0] text-sky-600 hover:bg-sky-50'
                        }`}
                      >
                        <Plus size={12} />
                      </button>

                      {/* Delete Segment */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDeleteSegment(seg);
                        }}
                        title={`Delete saved segment "${seg.name}"`}
                        className={`px-1.5 py-1.5 border-l transition-colors ${
                          isActive
                            ? 'border-white/20 text-slate-300 hover:text-rose-300'
                            : 'border-[#E2E8F0] text-slate-400 hover:text-rose-600'
                        }`}
                      >
                        <X size={11} />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Save as Target Segment / Update Active Segment Actions */}
              <div className="flex items-center gap-2 shrink-0">
                {activeSegmentObj && (
                  <button
                    type="button"
                    onClick={handleUpdateActiveSegment}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[5px] text-xs font-medium bg-slate-100 text-slate-800 border border-[#E2E8F0] hover:bg-slate-200 transition-colors"
                    title="Update this saved segment with your current filters / selection"
                  >
                    <Save size={12} />
                    Update &ldquo;{activeSegmentObj.name}&rdquo;
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsSavePanelOpen((v) => !v)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[5px] text-xs font-semibold bg-[#2E5A8A] text-white hover:bg-[#23476E] transition-colors"
                >
                  <FolderPlus size={13} />
                  {isSavePanelOpen ? 'Close' : '+ Save as Target Segment'}
                </button>
              </div>
            </div>

            {/* Inline Save Target Segment Drawer */}
            {isSavePanelOpen && (
              <div className="p-3.5 rounded-[6px] bg-sky-500/10 border border-sky-400/40 flex flex-wrap items-end justify-between gap-3 text-xs">
                <div className="flex-1 min-w-[220px] space-y-1">
                  <label className="block text-[11px] font-semibold text-slate-800">
                    Target Segment Name
                  </label>
                  <input
                    type="text"
                    value={newSegmentName}
                    onChange={(e) => setNewSegmentName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCreateSavedSegment();
                      }
                    }}
                    placeholder="e.g., Targeting Pharma Customers, Trade Diversion Target, US CFOs..."
                    className="w-full px-3 py-1.5 rounded-[4px] bg-white border border-[#E2E8F0] text-slate-900 focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div className="space-y-1">
                  <span className="block text-[11px] font-semibold text-slate-800">
                    Segment Type
                  </span>
                  <div className="inline-flex rounded-[4px] bg-white border border-[#E2E8F0] p-0.5">
                    <button
                      type="button"
                      onClick={() => setNewSegmentMode('dynamic')}
                      className={`px-2.5 py-1 rounded-[3px] text-[11px] font-medium transition-colors ${
                        newSegmentMode === 'dynamic'
                          ? 'bg-[#0D1520] text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Dynamic Filter Rules ({filteredRecipients.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewSegmentMode('static')}
                      className={`px-2.5 py-1 rounded-[3px] text-[11px] font-medium transition-colors ${
                        newSegmentMode === 'static'
                          ? 'bg-[#0D1520] text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Pinned Selection ({activeRecipients.length > 0 ? activeRecipients.length : filteredRecipients.length})
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={!newSegmentName.trim()}
                  onClick={handleCreateSavedSegment}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-[4px] bg-[#0D1520] text-white font-semibold hover:bg-slate-800 disabled:opacity-40 transition-colors"
                >
                  <BookmarkCheck size={13} />
                  Save Segment Tab
                </button>
              </div>
            )}
          </div>

          {/* Mode Toggle + Search */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
            <div className="md:col-span-4 grid grid-cols-2 gap-1 p-1 bg-slate-100 border border-[#E2E8F0] rounded-[5px]">
              <button
                type="button"
                onClick={() => setOutreachMode('dm')}
                className={`flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-[4px] transition-colors ${
                  outreachMode === 'dm'
                    ? 'bg-[#0D1520] text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <User size={13} />
                1-to-1 Direct DM
              </button>
              <button
                type="button"
                onClick={() => setOutreachMode('segment')}
                className={`flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-[4px] transition-colors ${
                  outreachMode === 'segment'
                    ? 'bg-[#0D1520] text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Users size={13} />
                Segment Cohort
              </button>
            </div>

            <div className="md:col-span-8 relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setPinnedSegmentIds(null);
                  setSearchQuery(e.target.value);
                }}
                placeholder={
                  outreachMode === 'dm'
                    ? 'Search by executive name, company, title, or email...'
                    : 'Filter by name, company, industry keyword (e.g. Pharma, Aerospace)...'
                }
                className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-[#E2E8F0] rounded-[5px] focus:outline-none focus:border-slate-400"
              />
            </div>
          </div>

          {/* Segment Cohort Multi-Select Checkbox Filters */}
          {outreachMode === 'segment' && (
            <div className="p-4 rounded-[5px] bg-slate-50 border border-[#E2E8F0] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-mono uppercase text-slate-500 mr-1">
                    Quick Cohorts:
                  </span>
                  {domainScope === 'customer' ? (
                    <>
                      {[
                        { id: 'active_pipeline', label: 'Engaged Pipeline (Stage 2+)' },
                        { id: 'tier1_legal_audit', label: 'Tier I · CCO/GC & CAE' },
                        { id: 'tier1_finance_proc', label: 'Tier I · CFO & CPO' },
                      ].map((qc) => (
                        <button
                          key={qc.id}
                          type="button"
                          onClick={() =>
                            applyQuickCohort(
                              qc.id as 'active_pipeline' | 'tier1_legal_audit' | 'tier1_finance_proc'
                            )
                          }
                          className={`px-2.5 py-1 text-[11px] font-medium rounded-[4px] border transition-colors ${
                            activeQuickCohort === qc.id
                              ? 'bg-[#0D1520] text-white border-[#0D1520]'
                              : 'bg-white text-slate-700 border-[#E2E8F0] hover:bg-slate-100'
                          }`}
                        >
                          {qc.label}
                        </button>
                      ))}

                      <button
                        type="button"
                        onClick={() => {
                          setPinnedSegmentIds(null);
                          setF500Only((v) => !v);
                        }}
                        className={`px-2.5 py-1 text-[11px] font-medium rounded-[4px] border transition-colors ${
                          f500Only
                            ? 'bg-amber-500/20 text-amber-800 border-amber-400'
                            : 'bg-white text-slate-700 border-[#E2E8F0] hover:bg-slate-100'
                        }`}
                      >
                        Fortune 500 Only
                      </button>
                    </>
                  ) : (
                    <>
                      {[
                        { id: 'hot_signals', label: 'Hot Signals (Opened / Portal)' },
                        { id: 'uncontacted', label: 'Uncontacted Queue' },
                      ].map((qc) => (
                        <button
                          key={qc.id}
                          type="button"
                          onClick={() => applyQuickCohort(qc.id as 'hot_signals' | 'uncontacted')}
                          className={`px-2.5 py-1 text-[11px] font-medium rounded-[4px] border transition-colors ${
                            activeQuickCohort === qc.id
                              ? 'bg-[#0D1520] text-white border-[#0D1520]'
                              : 'bg-white text-slate-700 border-[#E2E8F0] hover:bg-slate-100'
                          }`}
                        >
                          {qc.label}
                        </button>
                      ))}
                    </>
                  )}
                </div>

                <div className="flex items-center gap-3 text-xs">
                  {filteredRecipients.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        onChangeSelectedIds(filteredRecipients.map((r) => r.id));
                        onChangePreviewIdx(0);
                      }}
                      className="text-indigo-600 hover:underline font-medium"
                    >
                      Select Only Matching ({filteredRecipients.length})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      resetAllFiltersToAllEligible(false);
                      onChangeSelectedIds([]);
                    }}
                    className="text-slate-500 hover:text-slate-800 hover:underline inline-flex items-center gap-1"
                  >
                    <RotateCcw size={11} />
                    Reset Filters &amp; Clear
                  </button>
                </div>
              </div>

              {activeIndustryKeywords.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="text-slate-500 font-mono">Sector Keywords:</span>
                  {activeIndustryKeywords.map((kw) => (
                    <span
                      key={kw}
                      className="px-2 py-0.5 rounded bg-sky-500/10 text-sky-700 border border-sky-300/60 font-mono"
                    >
                      {kw}
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() => setActiveIndustryKeywords([])}
                    className="text-slate-500 hover:underline ml-1"
                  >
                    Clear keywords
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2 text-xs">
                <MultiSelectDropdown
                  label="Region"
                  options={facetOptions.regions}
                  selected={selectedRegions}
                  onChange={(next) => {
                    setPinnedSegmentIds(null);
                    setActiveQuickCohort(null);
                    setSelectedRegions(next);
                  }}
                />

                <MultiSelectDropdown
                  label={domainScope === 'customer' ? 'Persona' : 'Priority'}
                  options={facetOptions.personas}
                  selected={selectedPersonas}
                  onChange={(next) => {
                    setPinnedSegmentIds(null);
                    setActiveQuickCohort(null);
                    setSelectedPersonas(next);
                  }}
                />

                {domainScope === 'customer' && (
                  <>
                    <MultiSelectDropdown
                      label="Sector"
                      options={facetOptions.sectors}
                      selected={selectedSectors}
                      searchable
                      onChange={(next) => {
                        setPinnedSegmentIds(null);
                        setActiveQuickCohort(null);
                        setActiveIndustryKeywords([]);
                        setSelectedSectors(next);
                      }}
                    />

                    <MultiSelectDropdown
                      label="Tier"
                      options={['Tier I', 'Tier II', 'Tier III']}
                      selected={selectedTiers}
                      onChange={(next) => {
                        setPinnedSegmentIds(null);
                        setActiveQuickCohort(null);
                        setSelectedTiers(next);
                      }}
                    />
                  </>
                )}

                <MultiSelectDropdown
                  label="Stage"
                  options={facetOptions.stages}
                  selected={selectedStages}
                  searchable
                  onChange={(next) => {
                    setPinnedSegmentIds(null);
                    setActiveQuickCohort(null);
                    setSelectedStages(next);
                  }}
                />

                <MultiSelectDropdown
                  label="Owner"
                  options={facetOptions.owners}
                  selected={selectedOwners}
                  onChange={(next) => {
                    setPinnedSegmentIds(null);
                    setActiveQuickCohort(null);
                    setSelectedOwners(next);
                  }}
                />

                <select
                  value={cooldownDays}
                  onChange={(e) => {
                    setPinnedSegmentIds(null);
                    setCooldownDays(Number(e.target.value));
                  }}
                  title="Skip contacts already emailed within the selected number of days"
                  className="px-2.5 py-1.5 bg-white border border-[#E2E8F0] rounded-[4px] text-slate-700"
                >
                  <option value={0}>Cooldown: Off</option>
                  <option value={4}>Skip emailed &lt;4d</option>
                  <option value={7}>Skip emailed &lt;7d</option>
                  <option value={14}>Skip emailed &lt;14d</option>
                </select>
              </div>
            </div>
          )}

          {/* Clean Recipient Table with Select-All Header Checkbox */}
          <div className="border border-[#E2E8F0] rounded-[5px] overflow-hidden">
            <div className="max-h-[420px] overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-slate-50 border-b border-[#E2E8F0] text-[10.5px] font-mono uppercase text-slate-500">
                  <tr>
                    <th className="py-2.5 px-3.5 w-10">
                      {outreachMode === 'segment' ? (
                        <input
                          type="checkbox"
                          checked={allFilteredSelected}
                          onChange={toggleSelectAllMatching}
                          disabled={filteredRecipients.length === 0}
                          title="Select or unselect all matching contacts"
                          className="rounded border-slate-300 text-[#0D1520] cursor-pointer"
                        />
                      ) : (
                        'Select'
                      )}
                    </th>
                    <th className="py-2.5 px-3.5">Executive</th>
                    <th className="py-2.5 px-3.5">Organization</th>
                    <th className="py-2.5 px-3.5">
                      {domainScope === 'customer' ? 'Persona & Sector' : 'Priority & Track'}
                    </th>
                    <th className="py-2.5 px-3.5">Region</th>
                    <th className="py-2.5 px-3.5">Stage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleSlice.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-xs text-slate-400">
                        No contacts match the current filters. Adjust filters above or click <strong>All Eligible</strong>.
                      </td>
                    </tr>
                  ) : (
                    visibleSlice.map((rec) => {
                      const isSelected = selectedSet.has(rec.id);
                      const handleRowClick = () => {
                        if (outreachMode === 'dm') {
                          onChangeSelectedIds([rec.id]);
                          onChangePreviewIdx(0);
                        } else if (isSelected) {
                          onChangeSelectedIds(selectedIds.filter((id) => id !== rec.id));
                        } else {
                          onChangeSelectedIds([...selectedIds, rec.id]);
                        }
                      };

                      return (
                        <tr
                          key={rec.id}
                          onClick={handleRowClick}
                          className={`cursor-pointer transition-colors ${
                            isSelected ? 'bg-indigo-50/45 hover:bg-indigo-50/75' : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="py-2.5 px-3.5" onClick={(e) => e.stopPropagation()}>
                            <input
                              type={outreachMode === 'dm' ? 'radio' : 'checkbox'}
                              checked={isSelected}
                              onChange={handleRowClick}
                              className="rounded border-slate-300 text-[#0D1520] cursor-pointer"
                            />
                          </td>
                          <td className="py-2.5 px-3.5">
                            <div className="font-semibold text-slate-900">{rec.full_name}</div>
                            <div className="text-[11px] text-slate-500 truncate max-w-[240px]">
                              {rec.title} · <span className="font-mono">{rec.email}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3.5 font-medium text-slate-800">
                            <div className="flex items-center gap-1.5">
                              <span>{rec.organization}</span>
                              {rec.fortune_500 && (
                                <span className="text-[9.5px] font-mono px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 border border-amber-200">
                                  F500
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3.5">
                            {domainScope === 'customer' ? (
                              <div className="flex items-center gap-1.5">
                                <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-[#E2E8F0] font-mono text-[10.5px]">
                                  {rec.buyer_persona || 'Executive'}
                                </span>
                                <span className="text-slate-500 truncate max-w-[160px]">
                                  {rec.industry}
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-[#E2E8F0] font-mono text-[10.5px]">
                                  {rec.priority_tier}
                                </span>
                                <span className="text-slate-500 truncate max-w-[160px]">
                                  {rec.execution_wave}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3.5">
                            <span
                              className={`text-[10.5px] px-1.5 py-0.5 rounded border ${getRegionBadgeStyle(
                                rec.region
                              )}`}
                            >
                              {rec.region}
                            </span>
                          </td>
                          <td className="py-2.5 px-3.5">
                            <span
                              className={`text-[10.5px] px-2 py-0.5 rounded-full border font-medium ${getStageBadgeStyle(
                                rec.stage
                              )}`}
                            >
                              {rec.stage}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleCancelSequence}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-rose-700 bg-rose-50/70 border border-rose-200 rounded-[5px] hover:bg-rose-100"
              >
                <XCircle size={13} />
                Cancel Sequence
              </button>
              <span className="text-xs text-slate-500 font-mono">
                Showing {Math.min(200, filteredRecipients.length)} of {filteredRecipients.length} matching ·{' '}
                <strong>{activeRecipients.length}</strong> selected for campaign
              </span>
            </div>
            <button
              type="button"
              disabled={activeRecipients.length === 0}
              onClick={() => setStep(2)}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-[#0D1520] rounded-[5px] hover:bg-slate-800 disabled:opacity-40 transition-colors"
            >
              Next: Craft AI Message ({activeRecipients.length} selected)
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* STEP 2 SCREEN: CRAFT AI MESSAGE + 1-CLICK TARGET SEGMENT PICKER       */}
      {/* ===================================================================== */}
      {viewMode === 'wizard' && step === 2 && (
        <div className="bg-white border border-[#E2E8F0] rounded-[6px] p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] pb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Step 2: Craft Personalized Message
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Pick a Fortifai GTM angle, add or switch Target Segments in 1 click, and refine copy.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={activeRecipients.length === 0 || generatingAiHooks}
                onClick={handleGenerateAiHooks}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#2E5A8A] rounded-[5px] hover:bg-[#23476E] disabled:opacity-40 transition-colors"
              >
                <Sparkles size={13} />
                {generatingAiHooks
                  ? 'Synthesizing Dossier Hooks...'
                  : `Generate AI Hooks (${Math.min(activeRecipients.length, 35)})`}
              </button>
            </div>
          </div>

          {renderTargetSegmentPickerBar()}

          {aiStatusBanner && (
            <div className="p-3 rounded-[5px] bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs flex items-center justify-between gap-2">
              <span>{aiStatusBanner}</span>
              <button
                type="button"
                onClick={() => setAiStatusBanner(null)}
                className="text-[11px] underline shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Persona Playbook Presets */}
          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-500 mb-2">
              Select GTM Playbook Preset
            </label>
            <div className="flex flex-wrap gap-2">
              {playbooks.map((pb) => (
                <button
                  key={pb.id}
                  type="button"
                  onClick={() => applyPlaybook(pb)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-[5px] border transition-colors ${
                    activePlaybookId === pb.id
                      ? 'bg-[#0D1520] text-white border-[#0D1520]'
                      : 'bg-slate-50 text-slate-700 border-[#E2E8F0] hover:bg-slate-100'
                  }`}
                >
                  {pb.label}
                </button>
              ))}
            </div>
          </div>

          {/* Subject Line */}
          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-500 mb-1.5">
              Email Subject Line
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => onChangeSubject(e.target.value)}
              className="w-full px-3.5 py-2.5 text-xs bg-white border border-[#E2E8F0] rounded-[5px] focus:outline-none focus:border-slate-400 font-medium text-slate-900"
            />
          </div>

          {/* Single Dynamic Merge Variable: First Name */}
          <div>
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">
              Dynamic Merge Variable
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => insertTokenAtCursor('{{first_name}}')}
                className="px-2.5 py-1 text-[11px] font-mono bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-[4px] border border-[#E2E8F0]"
              >
                {'{{first_name}}'} · First Name
              </button>
            </div>
          </div>

          {/* Spacious Body Editor */}
          <div>
            <textarea
              ref={textareaRef}
              rows={13}
              value={body}
              onChange={(e) => onChangeBody(e.target.value)}
              className="w-full p-4 text-xs leading-relaxed bg-white border border-[#E2E8F0] rounded-[5px] focus:outline-none focus:border-slate-400 text-slate-800"
            />
          </div>

          {/* Deliverability & Length Check */}
          <div className="p-3 rounded-[5px] bg-slate-50 border border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-mono text-slate-500">DELIVERABILITY &amp; LENGTH GUARD</span>
            <span
              className={`font-mono px-2 py-0.5 rounded text-[11px] border ${
                wordCount <= 135
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border-amber-200'
              }`}
            >
              {wordCount} words {wordCount <= 135 ? '· Crisp Mobile Fit' : '· Consider Trimming'}
            </span>
          </div>

          {/* Step Navigation Footer */}
          <div className="flex items-center justify-between pt-3 border-t border-[#E2E8F0]">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-[#E2E8F0] rounded-[5px] hover:bg-slate-50"
              >
                <ArrowLeft size={14} />
                Back to Step 1 · Segments
              </button>
              <button
                type="button"
                onClick={handleCancelSequence}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-rose-700 bg-rose-50/70 border border-rose-200 rounded-[5px] hover:bg-rose-100"
              >
                <XCircle size={13} />
                Cancel Sequence
              </button>
            </div>

            <button
              type="button"
              onClick={() => setStep(3)}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-[#0D1520] rounded-[5px] hover:bg-slate-800"
            >
              Next: Review, Send Preview &amp; Dispatch
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* STEP 3 SCREEN: REVIEW, PREVIEW TO OWNER & DISPATCH                    */}
      {/* ===================================================================== */}
      {viewMode === 'wizard' && step === 3 && (
        <div className="bg-white border border-[#E2E8F0] rounded-[6px] p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] pb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Step 3: Review Rendered Email, Send Owner Preview &amp; Dispatch
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Inspect the exact email per recipient, send a live preview to your own inbox ({ownerPreviewEmail}), or launch the campaign.
              </p>
            </div>

            {activeRecipients.length > 0 && (
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() =>
                    onChangePreviewIdx(
                      previewIdx > 0 ? previewIdx - 1 : activeRecipients.length - 1
                    )
                  }
                  className="p-1.5 rounded-[4px] border border-[#E2E8F0] hover:bg-slate-50"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="font-mono text-xs text-slate-700 px-2 tabular-nums">
                  Recipient {Math.min(previewIdx + 1, activeRecipients.length)} of {activeRecipients.length}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onChangePreviewIdx(
                      previewIdx + 1 < activeRecipients.length ? previewIdx + 1 : 0
                    )
                  }
                  className="p-1.5 rounded-[4px] border border-[#E2E8F0] hover:bg-slate-50"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>

          {renderTargetSegmentPickerBar()}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left 5 Cols: Sender Settings + Owner Preview Card */}
            <div className="lg:col-span-5 space-y-4">
              <div className="p-4 rounded-[5px] bg-slate-50 border border-[#E2E8F0] space-y-3 text-xs">
                <div>
                  <label className="block text-[10.5px] font-mono uppercase tracking-wider text-slate-500 mb-1">
                    Send From Identity
                  </label>
                  <select
                    value={sendFrom}
                    disabled={useAssignedOwnerSender}
                    onChange={(e) => onChangeSendFrom(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#E2E8F0] rounded-[4px] text-xs font-medium text-slate-900 disabled:opacity-50"
                  >
                    {senderOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                <label className="flex items-center gap-2.5 p-2.5 rounded-[4px] bg-white border border-[#E2E8F0] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useAssignedOwnerSender}
                    onChange={(e) => onChangeUseAssignedOwnerSender(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span className="font-medium text-slate-800 flex items-center gap-1.5">
                    <UserCheck size={13} className="text-indigo-600" />
                    Send from each contact&apos;s assigned Deal Owner
                  </span>
                </label>

                <label className="flex items-center gap-2.5 p-2.5 rounded-[4px] bg-white border border-[#E2E8F0] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bccEnabled}
                    onChange={(e) => onChangeBccEnabled(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span className="font-medium text-slate-800 flex items-center gap-1.5">
                    <Mail size={13} className="text-indigo-600" />
                    BCC my inbox ({currentUser.email}) for Superhuman
                  </span>
                </label>

                <div className="pt-1">
                  <label className="block text-[10.5px] font-mono uppercase tracking-wider text-slate-500 mb-1">
                    Tracked Portal Link
                  </label>
                  <select
                    value={effectivePortalMode}
                    onChange={(e) => onChangePortalLinkMode(e.target.value as PortalLinkMode)}
                    className="w-full bg-white border border-[#E2E8F0] rounded-[4px] px-3 py-2 text-xs font-medium text-slate-800"
                  >
                    <option value="none">None (Plain 1-to-1 Email)</option>
                    <option value={portalAttachValue}>
                      {domainScope === 'investor'
                        ? 'Attach Investor Portal (investor.fortifai.io)'
                        : 'Attach Product Overview (overview.fortifai.io)'}
                    </option>
                  </select>
                </div>

                {coldLinkWarning && (
                  <div className="p-2.5 rounded-[4px] bg-amber-50 border border-amber-200 text-amber-800 text-[11px] flex items-start gap-1.5">
                    <AlertTriangle size={13} className="shrink-0 mt-0.5 text-amber-600" />
                    <span>
                      Cold <span className="font-mono">1 Lead</span> prospects selected with a portal link attached. Select <strong>None</strong> above for best inbox placement.
                    </span>
                  </div>
                )}
              </div>

              <div className="p-4 rounded-[5px] bg-indigo-50/60 border border-indigo-200 space-y-2.5 text-xs">
                <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                  <Mail size={14} className="text-indigo-600" />
                  Send Preview Email to Yourself ({currentUser.full_name})
                </div>
                <p className="text-[11.5px] text-slate-600 leading-snug">
                  Sends the exact rendered email shown on the right straight to{' '}
                  <span className="font-mono font-medium text-slate-900">{ownerPreviewEmail}</span>{' '}
                  so you can check formatting in Superhuman before dispatching to external accounts.
                </p>
                <button
                  type="button"
                  disabled={!canSendCampaigns || sendingTest || sendingBatch}
                  onClick={onSendTestToMe}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-indigo-900 bg-white border border-indigo-300 rounded-[5px] hover:bg-indigo-50 disabled:opacity-40 transition-colors"
                >
                  <Mail size={13} />
                  {sendingTest
                    ? 'Sending Preview to Your Inbox...'
                    : `Send Preview Email to ${ownerPreviewEmail}`}
                </button>
              </div>
            </div>

            {/* Right 7 Cols: Spacious Rendered Email Preview */}
            <div className="lg:col-span-7">
              {activeRecipients.length === 0 ? (
                <div className="py-16 text-center text-xs text-slate-400 border border-dashed border-[#E2E8F0] rounded-[5px]">
                  No recipients selected. Click <strong>+ Add Target Segment</strong> above or return to Step 1.
                </div>
              ) : (
                (() => {
                  const sample =
                    activeRecipients[Math.min(previewIdx, activeRecipients.length - 1)];
                  const resolvedFrom = resolveSenderForContact(sample);
                  const renderedBody = renderFinalPreviewBody(sample);
                  const isEditingThisVip = editingVipId === sample.id;

                  return (
                    <div className="border border-[#E2E8F0] rounded-[5px] overflow-hidden">
                      <div className="bg-slate-50 border-b border-[#E2E8F0] p-3.5 space-y-1.5 text-xs">
                        <div>
                          <span className="text-slate-400 font-mono mr-2">FROM:</span>
                          <span className="font-mono text-slate-800">{resolvedFrom}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 font-mono mr-2">TO:</span>
                          <span className="font-semibold text-slate-900">
                            {sample.full_name} &lt;{sample.email}&gt;
                          </span>
                        </div>
                        {bccEnabled && (
                          <div>
                            <span className="text-slate-400 font-mono mr-2">BCC:</span>
                            <span className="font-mono text-indigo-700">{currentUser.email}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/70">
                          <div>
                            <span className="text-slate-400 font-mono mr-2">SUBJECT:</span>
                            <span className="font-semibold text-slate-900">
                              {renderTemplate(subject, sample)}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (isEditingThisVip) {
                                setEditingVipId(null);
                              } else {
                                if (vipBodyOverrides[sample.id] === undefined) {
                                  setVipBodyOverrides((prev) => ({
                                    ...prev,
                                    [sample.id]: renderedBody,
                                  }));
                                }
                                setEditingVipId(sample.id);
                              }
                            }}
                            className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:underline font-medium shrink-0"
                          >
                            <Edit3 size={11} />
                            {isEditingThisVip ? 'Save VIP Edit' : 'Customize for this recipient'}
                          </button>
                        </div>
                      </div>

                      {isEditingThisVip ? (
                        <textarea
                          rows={13}
                          value={vipBodyOverrides[sample.id] ?? renderedBody}
                          onChange={(e) =>
                            setVipBodyOverrides((prev) => ({
                              ...prev,
                              [sample.id]: e.target.value,
                            }))
                          }
                          className="w-full p-4 text-xs leading-relaxed bg-white focus:outline-none text-slate-800"
                        />
                      ) : (
                        <div className="p-5 bg-white whitespace-pre-wrap text-xs leading-relaxed text-slate-800 min-h-[290px]">
                          {renderedBody}
                        </div>
                      )}
                    </div>
                  );
                })()
              )}
            </div>
          </div>

          {/* Safe Mode & Final Dispatch Footer */}
          <div className="pt-4 border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-[#E2E8F0] rounded-[5px] hover:bg-slate-50"
              >
                <ArrowLeft size={14} />
                Back to Step 2 · Message
              </button>
              <button
                type="button"
                onClick={handleCancelSequence}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-rose-700 bg-rose-50/70 border border-rose-200 rounded-[5px] hover:bg-rose-100"
              >
                <XCircle size={13} />
                Cancel Sequence
              </button>

              <span className="text-xs text-slate-500 flex items-center gap-1.5 ml-2">
                <ShieldCheck size={14} className="text-emerald-700" />
                <span>
                  <strong>{verifiedSelectedCount}</strong> live verified ·{' '}
                  <strong>{blockedSelectedCount}</strong> Safe Mode guarded
                </span>
              </span>
            </div>

            {!canSendCampaigns ? (
              <span className="text-xs text-amber-800 inline-flex items-center gap-1">
                <Lock size={13} />
                Requires can_send_campaigns permission
              </span>
            ) : (
              <button
                type="button"
                disabled={sendingBatch || sendingTest || activeRecipients.length === 0}
                onClick={onSendBatch}
                className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-semibold text-white bg-[#0D1520] rounded-[5px] hover:bg-slate-800 disabled:opacity-40 transition-colors"
              >
                <Send size={14} />
                {sendingBatch
                  ? 'Dispatching & Logging...'
                  : `Send Campaign (${activeRecipients.length} Recipients)`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
