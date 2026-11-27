import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Filter,
  Link2,
  Lock,
  Mail,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  User,
  UserCheck,
  Users,
} from 'lucide-react';
import type {
  Contact,
  ContactType,
  CrmUser,
  CustomFieldDefinition,
  PortalLinkMode,
} from '../../types/crm';
import { formatCurrency, getRegionBadgeStyle, getStageBadgeStyle } from '../../utils/crmHelpers';

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
}

interface PlaybookPreset {
  id: string;
  label: string;
  personaBadge: string;
  portalMode: PortalLinkMode;
  subject: string;
  body: string;
}

const CUSTOMER_PLAYBOOKS: PlaybookPreset[] = [
  {
    id: 'cco_doj',
    label: 'CCO / GC · DOJ ECCP & 3rd-Party Risk',
    personaBadge: 'CCO/GC',
    portalMode: 'none',
    subject: 'Continuous compliance & third-party oversight at {{organization}}',
    body: `Hi {{first_name}},

{{custom_hook}}

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
    personaBadge: 'CAE',
    portalMode: 'none',
    subject: '100% transaction surveillance for {{organization}} Internal Audit',
    body: `Hi {{first_name}},

{{custom_hook}}

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
    personaBadge: 'CFO',
    portalMode: 'none',
    subject: 'Preventing P2P & margin leakage at {{organization}}',
    body: `Hi {{first_name}},

{{custom_hook}}

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
    personaBadge: 'CPO',
    portalMode: 'none',
    subject: 'Vendor price variance & middleman visibility — {{organization}}',
    body: `Hi {{first_name}},

{{custom_hook}}

Fortifai connects read-only to your ERP and procurement tables inside your VPC to benchmark every PO against contract terms, commodity indices, and external counterparty substance—exposing pass-through markups before cash leaves.

Would you have 15 minutes next week to compare notes?

Best,
Varun Mowar
Founder & CEO, Fortifai`,
  },
  {
    id: 'warm_control_tower',
    label: 'Warm Follow-Up · Multi-Agent Control Tower',
    personaBadge: 'All Engaged',
    portalMode: 'overview',
    subject: 'Fortifai Multi-Agent Control Tower — architecture update for {{organization}}',
    body: `Hi {{first_name}},

{{custom_hook}}

Following up on our earlier conversation—wanted to share how we have unified our Audit, Compliance, Finance, and Procurement agents into a single in-VPC Control Tower running 100% inside {{organization}}'s security boundary with zero data egress.

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
    personaBadge: 'Wave 1 Lead',
    portalMode: 'investor',
    subject: 'Fortifai — Autonomous Audit & Compliance for Fortune 500 ($3M Seed)',
    body: `Hi {{first_name}},

{{custom_hook}}

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
    personaBadge: 'Follow-Up',
    portalMode: 'investor',
    subject: 'Re: Fortifai ($3M Seed) — {{organization}}',
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
  customFields,
  previewIdx,
  onChangePreviewIdx,
  sendingBatch,
  sendingTest,
  onSendBatch,
  onSendTestToMe,
  renderTemplate,
  filterResetSeq = 0,
}: ComposerViewProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const domainRecipients = useMemo(
    () => eligibleRecipients.filter((c) => c.contact_type === domainScope),
    [eligibleRecipients, domainScope]
  );

  // Pane 1: Outreach Mode (1-to-1 Direct DM vs Segment Cohort Builder) & Faceted Filters
  const [outreachMode, setOutreachMode] = useState<'dm' | 'segment'>('segment');
  const [searchQuery, setSearchQuery] = useState('');
  const [regionFilter, setRegionFilter] = useState<string>('All');
  const [sectorFilter, setSectorFilter] = useState<string>('All');
  const [personaFilter, setPersonaFilter] = useState<string>('All');
  const [tierFilter, setTierFilter] = useState<string>('All');
  const [stageFilter, setStageFilter] = useState<string>('All');
  const [ownerFilter, setOwnerFilter] = useState<string>('All');
  const [f500Only, setF500Only] = useState(false);
  const [cooldownDays, setCooldownDays] = useState<number>(0);

  // Pane 2 & 3: AI Personalized Hooks + Per-Recipient VIP Overrides
  const [activePlaybookId, setActivePlaybookId] = useState<string>('');
  const [aiHooksById, setAiHooksById] = useState<Record<string, string>>({});
  const [generatingAiHooks, setGeneratingAiHooks] = useState(false);
  const [aiStatusBanner, setAiStatusBanner] = useState<string | null>(null);
  const [vipBodyOverrides, setVipBodyOverrides] = useState<Record<string, string>>({});
  const [editingVipId, setEditingVipId] = useState<string | null>(null);

  useEffect(() => {
    setSearchQuery('');
    setRegionFilter('All');
    setSectorFilter('All');
    setPersonaFilter('All');
    setTierFilter('All');
    setStageFilter('All');
    setOwnerFilter('All');
    setF500Only(false);
    setCooldownDays(0);
    setEditingVipId(null);
    if (selectedIds.length === 1) {
      setOutreachMode('dm');
    } else {
      setOutreachMode('segment');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domainScope, filterResetSeq]);

  // Extract distinct facet values from real database
  const facetOptions = useMemo(() => {
    const regions = new Set<string>();
    const sectors = new Set<string>();
    const personas = new Set<string>();
    const stages = new Set<string>();
    const owners = new Set<string>();

    domainRecipients.forEach((c) => {
      if (c.region) regions.add(c.region);
      if (c.industry) sectors.add(c.industry);
      if (domainScope === 'customer' && c.buyer_persona) personas.add(c.buyer_persona);
      if (domainScope === 'investor' && c.priority_tier) personas.add(c.priority_tier);
      if (c.stage) stages.add(c.stage);
      if (c.owner) owners.add(c.owner);
    });

    return {
      regions: ['All', ...Array.from(regions).sort()],
      sectors: ['All', ...Array.from(sectors).sort()],
      personas: ['All', ...Array.from(personas).sort()],
      stages: ['All', ...Array.from(stages).sort()],
      owners: ['All', ...Array.from(owners).sort()],
    };
  }, [domainRecipients, domainScope]);

  const isRecentlyContacted = (c: Contact, days: number): boolean => {
    if (days <= 0 || !c.last_contacted_at) return false;
    const ts = Date.parse(c.last_contacted_at);
    if (Number.isNaN(ts)) return false;
    return Date.now() - ts < days * 86_400_000;
  };

  const filteredRecipients = useMemo(() => {
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

      if (regionFilter !== 'All' && c.region !== regionFilter) return false;
      if (sectorFilter !== 'All' && (c.industry || '') !== sectorFilter) return false;
      if (personaFilter !== 'All') {
        const key = domainScope === 'customer' ? c.buyer_persona : c.priority_tier;
        if (key !== personaFilter) return false;
      }
      if (domainScope === 'customer') {
        if (tierFilter !== 'All' && (c.tier || 'Tier I') !== tierFilter) return false;
        if (f500Only && !c.fortune_500) return false;
      }
      if (stageFilter !== 'All' && c.stage !== stageFilter) return false;
      if (ownerFilter !== 'All' && (c.owner || '') !== ownerFilter) return false;
      return true;
    });
  }, [
    domainRecipients,
    domainScope,
    outreachMode,
    searchQuery,
    regionFilter,
    sectorFilter,
    personaFilter,
    tierFilter,
    stageFilter,
    ownerFilter,
    f500Only,
    cooldownDays,
  ]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const activeRecipients = useMemo(
    () => domainRecipients.filter((c) => selectedSet.has(c.id)),
    [domainRecipients, selectedSet]
  );

  // Smart Quick-Cohort Selectors
  const applyQuickCohort = (
    type: 'hot_signals' | 'active_pipeline' | 'tier1_legal_audit' | 'tier1_finance_proc' | 'uncontacted'
  ) => {
    setOutreachMode('segment');
    setSearchQuery('');
    setRegionFilter('All');
    setSectorFilter('All');
    setPersonaFilter('All');
    setTierFilter('All');
    setStageFilter('All');
    setOwnerFilter('All');
    setF500Only(false);

    let matched: Contact[] = [];
    if (type === 'hot_signals') {
      matched = domainRecipients.filter((c) => c.portal_visited || c.email_opened);
    } else if (type === 'active_pipeline') {
      matched = domainRecipients.filter((c) => !c.omit_from_pipeline && c.stage !== '1 Lead');
    } else if (type === 'tier1_legal_audit') {
      setTierFilter('Tier I');
      matched = domainRecipients.filter(
        (c) => (c.tier || 'Tier I') === 'Tier I' && ['CCO/GC', 'CAE'].includes(c.buyer_persona || '')
      );
    } else if (type === 'tier1_finance_proc') {
      setTierFilter('Tier I');
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

  // Generate AI Dossier-Grounded Hooks via /api/personalize-outreach
  const handleGenerateAiHooks = async () => {
    if (activeRecipients.length === 0 || generatingAiHooks) return;
    setGeneratingAiHooks(true);
    setAiStatusBanner(null);
    try {
      const authRes = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: currentUser.email,
          role: currentUser.role,
          permissions: currentUser.permissions,
          is_active: currentUser.is_active,
        }),
      });
      const authJson = (await authRes.json()) as { ok?: boolean; token?: string };
      const token = authJson.token || '';

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
      if (!body.includes('{{custom_hook}}')) {
        onChangeBody(`Hi {{first_name}},\n\n{{custom_hook}}\n\n${body.replace(/^Hi \{\{first_name\}\},?\s*/i, '')}`);
      }
      const generatedCount = Object.keys(data.hooks).length;
      setAiStatusBanner(
        `Generated ${generatedCount} persona-tailored hooks (${data.dossiersUsed || 0} grounded in Account Intelligence Dossiers).`
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
    const enrichedContact: Contact = aiHooksById[sample.id]
      ? { ...sample, custom_hook: aiHooksById[sample.id] }
      : sample;

    const text = renderTemplate(body, enrichedContact);
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

  // Live Deliverability Linter
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

  const testTargetEmail = currentUser.email.trim().toLowerCase().endsWith('@fortifai.io')
    ? currentUser.email.trim().toLowerCase()
    : 'varun@fortifai.io';

  const playbooks = domainScope === 'investor' ? INVESTOR_PLAYBOOKS : CUSTOMER_PLAYBOOKS;
  const scopedCustomFields = customFields.filter(
    (cf) => cf.entity_scope === domainScope || cf.entity_scope === 'both'
  );

  return (
    <div className="p-4 max-w-[1680px] w-full mx-auto grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
      {/* ===================================================================== */}
      {/* PANE 1 (LEFT · 4 COLS): DYNAMIC AUDIENCE & SEGMENT BUILDER            */}
      {/* ===================================================================== */}
      <div className="xl:col-span-4 bg-white border border-[#E2E8F0] rounded-[6px] flex flex-col overflow-hidden">
        <div className="p-3.5 border-b border-[#E2E8F0] space-y-2.5 bg-slate-50/60">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500">
                01 · Target Audience
              </span>
              <span className="px-1.5 py-0.5 text-[10px] font-mono bg-white border border-[#E2E8F0] rounded text-slate-800">
                {activeRecipients.length} selected
              </span>
            </div>
            {suppressedCount > 0 && (
              <span
                title="Passed / Unsubscribed contacts automatically excluded"
                className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200"
              >
                <ShieldAlert size={11} />
                {suppressedCount} suppressed
              </span>
            )}
          </div>

          {/* 1-to-1 DM vs Segment Cohort Toggle */}
          <div className="grid grid-cols-2 gap-1 p-0.5 bg-slate-100 border border-[#E2E8F0] rounded-[5px]">
            <button
              type="button"
              onClick={() => setOutreachMode('dm')}
              className={`flex items-center justify-center gap-1.5 py-1.5 text-[11.5px] font-medium rounded-[4px] transition-colors ${
                outreachMode === 'dm'
                  ? 'bg-[#0D1520] text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <User size={12} />
              1-to-1 Direct DM
            </button>
            <button
              type="button"
              onClick={() => setOutreachMode('segment')}
              className={`flex items-center justify-center gap-1.5 py-1.5 text-[11.5px] font-medium rounded-[4px] transition-colors ${
                outreachMode === 'segment'
                  ? 'bg-[#0D1520] text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users size={12} />
              Segment Cohort
            </button>
          </div>

          {/* Instant Search Input */}
          <div className="relative">
            <Search
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                outreachMode === 'dm'
                  ? 'Type executive name, company, or email...'
                  : 'Filter matching contacts by name, firm, or title...'
              }
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-[#E2E8F0] rounded-[4px] focus:outline-none focus:border-slate-400"
            />
          </div>

          {/* Smart AI Quick-Cohorts (Segment Mode) */}
          {outreachMode === 'segment' && (
            <div className="space-y-2 pt-1">
              <div className="flex flex-wrap gap-1">
                {domainScope === 'customer' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => applyQuickCohort('active_pipeline')}
                      className="px-2 py-0.5 text-[10.5px] font-medium rounded-[4px] bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100"
                    >
                      Engaged Pipeline (Stage 2+)
                    </button>
                    <button
                      type="button"
                      onClick={() => applyQuickCohort('tier1_legal_audit')}
                      className="px-2 py-0.5 text-[10.5px] font-medium rounded-[4px] bg-white text-slate-700 border border-[#E2E8F0] hover:bg-slate-50"
                    >
                      Tier I · CCO/GC &amp; CAE
                    </button>
                    <button
                      type="button"
                      onClick={() => applyQuickCohort('tier1_finance_proc')}
                      className="px-2 py-0.5 text-[10.5px] font-medium rounded-[4px] bg-white text-slate-700 border border-[#E2E8F0] hover:bg-slate-50"
                    >
                      Tier I · CFO &amp; CPO
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => applyQuickCohort('hot_signals')}
                      className="px-2 py-0.5 text-[10.5px] font-medium rounded-[4px] bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100"
                    >
                      Hot Signals (Opened / Portal)
                    </button>
                    <button
                      type="button"
                      onClick={() => applyQuickCohort('uncontacted')}
                      className="px-2 py-0.5 text-[10.5px] font-medium rounded-[4px] bg-white text-slate-700 border border-[#E2E8F0] hover:bg-slate-50"
                    >
                      Uncontacted Queue
                    </button>
                  </>
                )}
              </div>

              {/* Faceted Segment Dropdown Grid */}
              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                <select
                  value={regionFilter}
                  onChange={(e) => setRegionFilter(e.target.value)}
                  className="px-2 py-1 bg-white border border-[#E2E8F0] rounded-[4px] text-slate-700"
                  aria-label="Filter by Region"
                >
                  {facetOptions.regions.map((r) => (
                    <option key={r} value={r}>
                      {r === 'All' ? 'Region: All' : r}
                    </option>
                  ))}
                </select>

                <select
                  value={personaFilter}
                  onChange={(e) => setPersonaFilter(e.target.value)}
                  className="px-2 py-1 bg-white border border-[#E2E8F0] rounded-[4px] text-slate-700"
                  aria-label="Filter by Buyer Persona"
                >
                  {facetOptions.personas.map((p) => (
                    <option key={p} value={p}>
                      {p === 'All'
                        ? domainScope === 'customer'
                          ? 'Persona: All'
                          : 'Priority: All'
                        : p}
                    </option>
                  ))}
                </select>

                {domainScope === 'customer' && (
                  <>
                    <select
                      value={sectorFilter}
                      onChange={(e) => setSectorFilter(e.target.value)}
                      className="px-2 py-1 bg-white border border-[#E2E8F0] rounded-[4px] text-slate-700 truncate"
                      aria-label="Filter by Industry Sector"
                    >
                      {facetOptions.sectors.map((s) => (
                        <option key={s} value={s}>
                          {s === 'All' ? 'Sector: All Industries' : s}
                        </option>
                      ))}
                    </select>

                    <select
                      value={tierFilter}
                      onChange={(e) => setTierFilter(e.target.value)}
                      className="px-2 py-1 bg-white border border-[#E2E8F0] rounded-[4px] text-slate-700"
                      aria-label="Filter by Tier"
                    >
                      <option value="All">Tier: All</option>
                      <option value="Tier I">Tier I</option>
                      <option value="Tier II">Tier II</option>
                    </select>
                  </>
                )}

                <select
                  value={stageFilter}
                  onChange={(e) => setStageFilter(e.target.value)}
                  className="px-2 py-1 bg-white border border-[#E2E8F0] rounded-[4px] text-slate-700 truncate"
                  aria-label="Filter by Stage"
                >
                  {facetOptions.stages.map((st) => (
                    <option key={st} value={st}>
                      {st === 'All' ? 'Stage: All' : st}
                    </option>
                  ))}
                </select>

                <select
                  value={ownerFilter}
                  onChange={(e) => setOwnerFilter(e.target.value)}
                  className="px-2 py-1 bg-white border border-[#E2E8F0] rounded-[4px] text-slate-700"
                  aria-label="Filter by Owner"
                >
                  {facetOptions.owners.map((ow) => (
                    <option key={ow} value={ow}>
                      {ow === 'All' ? 'Owner: All' : ow}
                    </option>
                  ))}
                </select>
              </div>

              {/* Fortune 500 + Cooldown Guard Row */}
              <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600 pt-0.5">
                {domainScope === 'customer' ? (
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={f500Only}
                      onChange={(e) => setF500Only(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    <span>Fortune 500 only</span>
                  </label>
                ) : (
                  <span className="text-slate-400">Cooldown guard:</span>
                )}
                <select
                  value={cooldownDays}
                  onChange={(e) => setCooldownDays(Number(e.target.value))}
                  className="px-2 py-0.5 bg-white border border-[#E2E8F0] rounded-[4px] text-[10.5px] text-slate-700"
                >
                  <option value={0}>Cooldown: Off</option>
                  <option value={4}>Skip contacted &lt;4d</option>
                  <option value={7}>Skip contacted &lt;7d</option>
                  <option value={14}>Skip contacted &lt;14d</option>
                </select>
              </div>
            </div>
          )}

          {/* Cohort Bulk Action Bar */}
          <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-200/80">
            <span className="text-slate-500 font-mono">
              Showing {filteredRecipients.length} of {domainRecipients.length}
            </span>
            <div className="flex items-center gap-2">
              {outreachMode === 'segment' && filteredRecipients.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    onChangeSelectedIds(filteredRecipients.map((r) => r.id));
                    onChangePreviewIdx(0);
                  }}
                  className="text-indigo-600 hover:underline font-medium"
                >
                  Select Matching ({filteredRecipients.length})
                </button>
              )}
              <button
                type="button"
                onClick={() => onChangeSelectedIds([])}
                className="text-slate-500 hover:text-slate-800 hover:underline inline-flex items-center gap-0.5"
              >
                <RotateCcw size={10} />
                Clear
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Recipient Cards */}
        <div className="divide-y divide-slate-100 max-h-[560px] overflow-y-auto">
          {filteredRecipients.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No active contacts match these filters.
            </div>
          ) : (
            filteredRecipients.slice(0, 150).map((rec) => {
              const isSelected = selectedSet.has(rec.id);
              const handleSelect = () => {
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
                <div
                  key={rec.id}
                  onClick={handleSelect}
                  className={`px-3.5 py-2.5 cursor-pointer transition-colors flex items-start gap-2.5 ${
                    isSelected
                      ? 'bg-indigo-50/40 hover:bg-indigo-50/70'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <input
                    type={outreachMode === 'dm' ? 'radio' : 'checkbox'}
                    checked={isSelected}
                    onChange={handleSelect}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1 rounded border-slate-300 text-[#0D1520] cursor-pointer"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="text-[12.5px] font-semibold text-slate-900 truncate">
                        {rec.full_name}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded border shrink-0 ${getStageBadgeStyle(
                          rec.stage
                        )}`}
                      >
                        {rec.stage}
                      </span>
                    </div>
                    <div className="text-[11.5px] text-slate-600 truncate">
                      {rec.organization}
                      {rec.title ? ` · ${rec.title}` : ''}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded border ${getRegionBadgeStyle(
                          rec.region
                        )}`}
                      >
                        {rec.region}
                      </span>
                      {domainScope === 'customer' ? (
                        <>
                          {rec.buyer_persona && (
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200">
                              {rec.buyer_persona}
                            </span>
                          )}
                          {rec.industry && (
                            <span className="text-[10px] text-slate-400 truncate max-w-[130px]">
                              {rec.industry}
                            </span>
                          )}
                          {(rec.amount_usd || 0) > 0 && (
                            <span className="text-[10px] font-mono text-emerald-700 ml-auto">
                              {formatCurrency(rec.amount_usd || 0)}
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          {rec.priority_tier && (
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200">
                              {rec.priority_tier}
                            </span>
                          )}
                          {rec.check_size_label && (
                            <span className="text-[10px] font-mono text-slate-500">
                              {rec.check_size_label}
                            </span>
                          )}
                        </>
                      )}
                      {aiHooksById[rec.id] && (
                        <span className="text-[9.5px] font-mono px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                          AI Hook Ready
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          {filteredRecipients.length > 150 && (
            <div className="p-2.5 text-center text-[11px] text-slate-400 bg-slate-50">
              Showing first 150 matching rows · Use filters or &quot;Select Matching ({filteredRecipients.length})&quot; above
            </div>
          )}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* PANE 2 (CENTER · 4 COLS): AI PLAYBOOKS & MESSAGE STUDIO               */}
      {/* ===================================================================== */}
      <div className="xl:col-span-4 bg-white border border-[#E2E8F0] rounded-[6px] p-4 space-y-3.5">
        <div className="flex items-center justify-between gap-2 border-b border-[#E2E8F0] pb-2.5">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-500">
              02 · AI Playbook &amp; Message Studio
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              Select a persona angle &amp; synthesize dossier-grounded hooks
            </div>
          </div>
          <button
            type="button"
            disabled={activeRecipients.length === 0 || generatingAiHooks}
            onClick={handleGenerateAiHooks}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11.5px] font-medium text-white bg-[#2E5A8A] rounded-[4px] hover:bg-[#23476E] disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
            title="Use Gemini + cached Account Intelligence Dossiers to write tailored 1-sentence openers"
          >
            <Sparkles size={12} />
            {generatingAiHooks
              ? 'Synthesizing...'
              : `AI Hooks (${Math.min(activeRecipients.length, 35)})`}
          </button>
        </div>

        {aiStatusBanner && (
          <div className="p-2.5 rounded-[4px] bg-indigo-50 border border-indigo-200 text-indigo-800 text-[11px] flex items-center justify-between gap-2">
            <span>{aiStatusBanner}</span>
            <button
              type="button"
              onClick={() => setAiStatusBanner(null)}
              className="text-[10px] underline shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Persona Playbook Selector */}
        <div>
          <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-500 mb-1">
            GTM Playbook Angle
          </label>
          <div className="flex flex-wrap gap-1.5">
            {playbooks.map((pb) => (
              <button
                key={pb.id}
                type="button"
                onClick={() => applyPlaybook(pb)}
                className={`px-2 py-1 text-[11px] font-medium rounded-[4px] border text-left transition-colors ${
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
          <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-500 mb-1">
            Subject Line
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => onChangeSubject(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#E2E8F0] rounded-[4px] focus:outline-none focus:border-slate-400 font-medium text-slate-900"
          />
        </div>

        {/* Dynamic Variable Tokens */}
        <div>
          <div className="text-[10.5px] font-mono uppercase tracking-wider text-slate-400 mb-1">
            Dynamic Merge Tokens
          </div>
          <div className="flex flex-wrap gap-1">
            {[
              '{{first_name}}',
              '{{organization}}',
              '{{title}}',
              '{{region}}',
              '{{custom_hook}}',
              ...scopedCustomFields.map((cf) => `{{custom.${cf.field_key}}}`),
            ].map((token) => (
              <button
                key={token}
                type="button"
                onClick={() => insertTokenAtCursor(token)}
                className="px-1.5 py-0.5 text-[10.5px] font-mono bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-[4px] border border-[#E2E8F0]"
              >
                {token}
              </button>
            ))}
          </div>
        </div>

        {/* Message Body */}
        <div>
          <textarea
            ref={textareaRef}
            rows={12}
            value={body}
            onChange={(e) => onChangeBody(e.target.value)}
            className="w-full p-3 text-xs leading-relaxed bg-white border border-[#E2E8F0] rounded-[4px] focus:outline-none focus:border-slate-400 text-slate-800"
          />
        </div>

        {/* Live Deliverability & Executive Scannability Linter */}
        <div className="p-2.5 rounded-[5px] bg-slate-50 border border-[#E2E8F0] space-y-1.5 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="font-mono text-slate-500">DELIVERABILITY &amp; LENGTH GUARD</span>
            <span
              className={`font-mono px-1.5 py-0.5 rounded text-[10.5px] border ${
                wordCount <= 135
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border-amber-200'
              }`}
            >
              {wordCount} words {wordCount <= 135 ? '· Crisp Mobile Fit' : '· Consider Trimming'}
            </span>
          </div>
          {coldLinkWarning && (
            <div className="flex items-start gap-1.5 text-amber-800 text-[11px]">
              <AlertTriangle size={13} className="shrink-0 mt-0.5 text-amber-600" />
              <span>
                Cold <span className="font-mono">1 Lead</span> prospects are selected with a portal URL attached. Switch Portal Link to <strong>None</strong> on the right for highest Fortune 500 inbox placement.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* PANE 3 (RIGHT · 4 COLS): RECIPIENT INSPECTOR, SENDER & DISPATCH       */}
      {/* ===================================================================== */}
      <div className="xl:col-span-4 bg-white border border-[#E2E8F0] rounded-[6px] p-4 space-y-3.5 sticky top-14">
        <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-2.5">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-500">
              03 · Recipient Inspector &amp; Dispatch
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              Verify rendered copy &amp; sender identity per recipient
            </div>
          </div>

          {activeRecipients.length > 0 && (
            <div className="flex items-center gap-1 text-xs">
              <button
                type="button"
                onClick={() =>
                  onChangePreviewIdx(
                    previewIdx > 0 ? previewIdx - 1 : activeRecipients.length - 1
                  )
                }
                className="p-1 rounded-[4px] border border-[#E2E8F0] hover:bg-slate-50"
                aria-label="Previous recipient"
              >
                <ChevronLeft size={13} />
              </button>
              <span className="font-mono text-[11px] text-slate-700 px-1.5 tabular-nums">
                {Math.min(previewIdx + 1, activeRecipients.length)} / {activeRecipients.length}
              </span>
              <button
                type="button"
                onClick={() =>
                  onChangePreviewIdx(
                    previewIdx + 1 < activeRecipients.length ? previewIdx + 1 : 0
                  )
                }
                className="p-1 rounded-[4px] border border-[#E2E8F0] hover:bg-slate-50"
                aria-label="Next recipient"
              >
                <ChevronRight size={13} />
              </button>
            </div>
          )}
        </div>

        {/* Sender Identity, Deal Owner Routing, BCC & Portal Link Controls */}
        <div className="p-3 rounded-[5px] bg-slate-50 border border-[#E2E8F0] space-y-2.5 text-xs">
          <div>
            <label className="block text-[10.5px] font-mono uppercase tracking-wider text-slate-500 mb-1">
              Send From Identity
            </label>
            <select
              value={sendFrom}
              disabled={useAssignedOwnerSender}
              onChange={(e) => onChangeSendFrom(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-white border border-[#E2E8F0] rounded-[4px] text-xs font-medium text-slate-900 disabled:opacity-50"
            >
              {senderOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="flex items-center gap-2 p-2 rounded-[4px] bg-white border border-[#E2E8F0] cursor-pointer text-[11px]">
              <input
                type="checkbox"
                checked={useAssignedOwnerSender}
                onChange={(e) => onChangeUseAssignedOwnerSender(e.target.checked)}
                className="rounded border-slate-300"
              />
              <span className="font-medium text-slate-700 flex items-center gap-1">
                <UserCheck size={12} className="text-indigo-600 shrink-0" />
                Route via Deal Owner
              </span>
            </label>

            <label className="flex items-center gap-2 p-2 rounded-[4px] bg-white border border-[#E2E8F0] cursor-pointer text-[11px]">
              <input
                type="checkbox"
                checked={bccEnabled}
                onChange={(e) => onChangeBccEnabled(e.target.checked)}
                className="rounded border-slate-300"
              />
              <span className="font-medium text-slate-700 flex items-center gap-1">
                <Mail size={12} className="text-indigo-600 shrink-0" />
                BCC Superhuman
              </span>
            </label>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/70">
            <span className="text-[11px] font-medium text-slate-700 flex items-center gap-1">
              <Link2 size={12} className="text-slate-500" />
              Portal Link:
            </span>
            <select
              value={effectivePortalMode}
              onChange={(e) => onChangePortalLinkMode(e.target.value as PortalLinkMode)}
              className="bg-white border border-[#E2E8F0] rounded-[4px] px-2 py-1 text-[11px] font-medium text-slate-800"
            >
              <option value="none">None (Plain 1-to-1 Email)</option>
              <option value={portalAttachValue}>
                {domainScope === 'investor'
                  ? 'Attach investor.fortifai.io'
                  : 'Attach overview.fortifai.io'}
              </option>
            </select>
          </div>
        </div>

        {/* Live Rendered Email Preview + Inline Per-VIP Override */}
        {activeRecipients.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400 border border-dashed border-[#E2E8F0] rounded-[5px]">
            Select a contact or segment in Pane 1 to inspect rendered email copy.
          </div>
        ) : (
          (() => {
            const sample =
              activeRecipients[Math.min(previewIdx, activeRecipients.length - 1)];
            const resolvedFrom = resolveSenderForContact(sample);
            const renderedBody = renderFinalPreviewBody(sample);
            const isEditingThisVip = editingVipId === sample.id;

            return (
              <div className="space-y-2.5 text-xs">
                <div className="bg-slate-50 border border-[#E2E8F0] rounded-[5px] p-2.5 space-y-1 text-[11.5px]">
                  <div className="truncate">
                    <span className="text-slate-400 font-mono">FROM:</span>{' '}
                    <span className="font-mono text-slate-800">{resolvedFrom}</span>
                  </div>
                  <div className="truncate">
                    <span className="text-slate-400 font-mono">TO:</span>{' '}
                    <span className="font-medium text-slate-900">
                      {sample.full_name} &lt;{sample.email}&gt;
                    </span>
                  </div>
                  {bccEnabled && (
                    <div className="truncate">
                      <span className="text-slate-400 font-mono">BCC:</span>{' '}
                      <span className="font-mono text-indigo-700">{currentUser.email}</span>
                    </div>
                  )}
                  <div className="truncate">
                    <span className="text-slate-400 font-mono">SUBJ:</span>{' '}
                    <span className="font-medium text-slate-900">
                      {renderTemplate(subject, sample)}
                    </span>
                  </div>
                </div>

                {/* Per-Recipient VIP Override Bar */}
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">
                    {vipBodyOverrides[sample.id] !== undefined
                      ? 'Custom VIP override active for this contact'
                      : aiHooksById[sample.id]
                      ? 'AI hook injected for ' + sample.organization
                      : 'Standard template preview'}
                  </span>
                  <div className="flex items-center gap-2">
                    {vipBodyOverrides[sample.id] !== undefined && (
                      <button
                        type="button"
                        onClick={() => {
                          setVipBodyOverrides((prev) => {
                            const next = { ...prev };
                            delete next[sample.id];
                            return next;
                          });
                          setEditingVipId(null);
                        }}
                        className="text-slate-500 hover:underline"
                      >
                        Reset
                      </button>
                    )}
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
                      className="inline-flex items-center gap-1 text-indigo-600 hover:underline font-medium"
                    >
                      <Edit3 size={11} />
                      {isEditingThisVip ? 'Done Editing' : 'Customize VIP'}
                    </button>
                  </div>
                </div>

                {isEditingThisVip ? (
                  <textarea
                    rows={10}
                    value={vipBodyOverrides[sample.id] ?? renderedBody}
                    onChange={(e) =>
                      setVipBodyOverrides((prev) => ({
                        ...prev,
                        [sample.id]: e.target.value,
                      }))
                    }
                    className="w-full p-3 text-xs leading-relaxed bg-white border border-indigo-300 rounded-[5px] focus:outline-none text-slate-800"
                  />
                ) : (
                  <div className="border border-[#E2E8F0] rounded-[5px] p-3.5 bg-white whitespace-pre-wrap leading-relaxed text-slate-800 max-h-[260px] overflow-y-auto">
                    {renderedBody}
                  </div>
                )}
              </div>
            );
          })()
        )}

        {/* Safe Mode Guard Status & Dispatch Buttons */}
        <div className="pt-2 border-t border-[#E2E8F0] space-y-2.5">
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
              <ShieldCheck size={13} />
              Safe Mode Guard Active
            </span>
            <span className="font-mono">
              {verifiedSelectedCount} live · {blockedSelectedCount} guarded
            </span>
          </div>

          {!canSendCampaigns && (
            <div className="p-2 rounded-[4px] bg-amber-50 border border-amber-200 text-amber-800 text-[11px] flex items-center gap-1.5">
              <Lock size={12} className="shrink-0" />
              <span>Campaign sending requires can_send_campaigns.</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!canSendCampaigns || sendingTest || sendingBatch}
              onClick={onSendTestToMe}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[11.5px] font-medium text-slate-800 bg-white border border-[#E2E8F0] rounded-[4px] hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              <Mail size={13} />
              {sendingTest ? 'Sending...' : `Test (${testTargetEmail.split('@')[0]})`}
            </button>

            <button
              type="button"
              disabled={!canSendCampaigns || sendingBatch || sendingTest || activeRecipients.length === 0}
              onClick={onSendBatch}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[11.5px] font-medium text-white bg-[#0D1520] rounded-[4px] hover:bg-slate-800 disabled:opacity-40 transition-colors"
            >
              <Send size={13} />
              {sendingBatch
                ? 'Dispatching...'
                : `Send (${activeRecipients.length})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
