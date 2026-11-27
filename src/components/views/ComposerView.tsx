import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit3,
  History,
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
  telemetry?: TelemetryEvent[];
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
  telemetry = [],
}: ComposerViewProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const domainRecipients = useMemo(
    () => eligibleRecipients.filter((c) => c.contact_type === domainScope),
    [eligibleRecipients, domainScope]
  );

  // 3-Step Wizard Navigation + Sent Logs Tab
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [viewMode, setViewMode] = useState<'wizard' | 'logs'>('wizard');

  // Step 1: Audience & Filters
  const [outreachMode, setOutreachMode] = useState<'dm' | 'segment'>('dm');
  const [searchQuery, setSearchQuery] = useState('');
  const [regionFilter, setRegionFilter] = useState<string>('All');
  const [sectorFilter, setSectorFilter] = useState<string>('All');
  const [personaFilter, setPersonaFilter] = useState<string>('All');
  const [tierFilter, setTierFilter] = useState<string>('All');
  const [stageFilter, setStageFilter] = useState<string>('All');
  const [ownerFilter, setOwnerFilter] = useState<string>('All');
  const [f500Only, setF500Only] = useState(false);
  const [cooldownDays, setCooldownDays] = useState<number>(0);

  // Step 2 & 3: AI Hooks + Per-Recipient VIP Overrides
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
    setViewMode('wizard');
    if (selectedIds.length === 1) {
      setOutreachMode('dm');
      setStep(2);
    } else if (selectedIds.length > 1) {
      setOutreachMode('segment');
      setStep(2);
    } else {
      setStep(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domainScope, filterResetSeq]);

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

  // Sent Logs derived from telemetry + contacts with sent_at / delivery_status
  const sentLogs = useMemo(() => {
    const fromTelemetry = telemetry
      .filter((t) => {
        const c = domainRecipients.find((r) => r.id === t.contact_id);
        return Boolean(c) && ['email_sent', 'email_delivered', 'email_opened', 'email_bounced'].includes(t.event_type);
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
      !window.confirm("Cancel the current outreach sequence? This will clear selected recipients, AI hooks, and reset the draft.")
    ) {
      return;
    }
    onChangeSelectedIds([]);
    onChangePreviewIdx(0);
    setActivePlaybookId("");
    setAiHooksById({});
    setAiStatusBanner(null);
    setVipBodyOverrides({});
    setEditingVipId(null);
    setSearchQuery("");
    setRegionFilter("All");
    setSectorFilter("All");
    setPersonaFilter("All");
    setTierFilter("All");
    setStageFilter("All");
    setOwnerFilter("All");
    setF500Only(false);
    setCooldownDays(0);
    setViewMode("wizard");
    setStep(1);
  };

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
  const scopedCustomFields = customFields.filter(
    (cf) => cf.entity_scope === domainScope || cf.entity_scope === 'both'
  );

  return (
    <div className="p-6 max-w-[1160px] w-full mx-auto space-y-5">
      {/* ===================================================================== */}
      {/* TOP BAR: 3-STEP WIZARD STEPPER + SENT LOGS SWITCHER                   */}
      {/* ===================================================================== */}
      <div className="bg-white border border-[#E2E8F0] rounded-[6px] p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { num: 1 as const, label: 'Step 1 · Select Audience', sub: `${activeRecipients.length} selected` },
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

          {/* Sent Logs Toggle Button */}
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
      {/* STEP 1 SCREEN: SELECT AUDIENCE                                        */}
      {/* ===================================================================== */}
      {viewMode === 'wizard' && step === 1 && (
        <div className="bg-white border border-[#E2E8F0] rounded-[6px] p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] pb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Step 1: Choose Your Target Audience
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Pick a single executive for a 1-to-1 message, or build a filtered cohort.
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
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  outreachMode === 'dm'
                    ? 'Search by executive name, company, title, or email...'
                    : 'Filter matching cohort by name, company, or industry...'
                }
                className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-[#E2E8F0] rounded-[5px] focus:outline-none focus:border-slate-400"
              />
            </div>
          </div>

          {/* Segment Cohort Filters (only visible when Segment Cohort is selected) */}
          {outreachMode === 'segment' && (
            <div className="p-4 rounded-[5px] bg-slate-50 border border-[#E2E8F0] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-mono uppercase text-slate-500 mr-1">
                    Quick Cohorts:
                  </span>
                  {domainScope === 'customer' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => applyQuickCohort('active_pipeline')}
                        className="px-2.5 py-1 text-[11px] font-medium rounded-[4px] bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100"
                      >
                        Engaged Pipeline (Stage 2+)
                      </button>
                      <button
                        type="button"
                        onClick={() => applyQuickCohort('tier1_legal_audit')}
                        className="px-2.5 py-1 text-[11px] font-medium rounded-[4px] bg-white text-slate-700 border border-[#E2E8F0] hover:bg-slate-100"
                      >
                        Tier I · CCO/GC &amp; CAE
                      </button>
                      <button
                        type="button"
                        onClick={() => applyQuickCohort('tier1_finance_proc')}
                        className="px-2.5 py-1 text-[11px] font-medium rounded-[4px] bg-white text-slate-700 border border-[#E2E8F0] hover:bg-slate-100"
                      >
                        Tier I · CFO &amp; CPO
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => applyQuickCohort('hot_signals')}
                        className="px-2.5 py-1 text-[11px] font-medium rounded-[4px] bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100"
                      >
                        Hot Signals (Opened / Portal)
                      </button>
                      <button
                        type="button"
                        onClick={() => applyQuickCohort('uncontacted')}
                        className="px-2.5 py-1 text-[11px] font-medium rounded-[4px] bg-white text-slate-700 border border-[#E2E8F0] hover:bg-slate-100"
                      >
                        Uncontacted Queue
                      </button>
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
                      Select All Matching ({filteredRecipients.length})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onChangeSelectedIds([])}
                    className="text-slate-500 hover:text-slate-800 hover:underline inline-flex items-center gap-1"
                  >
                    <RotateCcw size={11} />
                    Clear
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
                <select
                  value={regionFilter}
                  onChange={(e) => setRegionFilter(e.target.value)}
                  className="px-2.5 py-1.5 bg-white border border-[#E2E8F0] rounded-[4px] text-slate-700"
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
                  className="px-2.5 py-1.5 bg-white border border-[#E2E8F0] rounded-[4px] text-slate-700"
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
                      className="px-2.5 py-1.5 bg-white border border-[#E2E8F0] rounded-[4px] text-slate-700"
                    >
                      {facetOptions.sectors.map((s) => (
                        <option key={s} value={s}>
                          {s === 'All' ? 'Sector: All' : s}
                        </option>
                      ))}
                    </select>

                    <select
                      value={tierFilter}
                      onChange={(e) => setTierFilter(e.target.value)}
                      className="px-2.5 py-1.5 bg-white border border-[#E2E8F0] rounded-[4px] text-slate-700"
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
                  className="px-2.5 py-1.5 bg-white border border-[#E2E8F0] rounded-[4px] text-slate-700"
                >
                  {facetOptions.stages.map((st) => (
                    <option key={st} value={st}>
                      {st === 'All' ? 'Stage: All' : st}
                    </option>
                  ))}
                </select>

                <select
                  value={cooldownDays}
                  onChange={(e) => setCooldownDays(Number(e.target.value))}
                  className="px-2.5 py-1.5 bg-white border border-[#E2E8F0] rounded-[4px] text-slate-700"
                >
                  <option value={0}>Cooldown: Off</option>
                  <option value={4}>Skip &lt;4d</option>
                  <option value={7}>Skip &lt;7d</option>
                  <option value={14}>Skip &lt;14d</option>
                </select>
              </div>
            </div>
          )}

          {/* Clean Recipient Table */}
          <div className="border border-[#E2E8F0] rounded-[5px] overflow-hidden">
            <div className="max-h-[420px] overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-slate-50 border-b border-[#E2E8F0] text-[10.5px] font-mono uppercase text-slate-500">
                  <tr>
                    <th className="py-2.5 px-3.5 w-10">Select</th>
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
                  {filteredRecipients.slice(0, 150).map((rec) => {
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
                          {rec.organization}
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
                  })}
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
              Showing {Math.min(150, filteredRecipients.length)} of {filteredRecipients.length} matching contacts
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
      {/* STEP 2 SCREEN: CRAFT AI MESSAGE                                       */}
      {/* ===================================================================== */}
      {viewMode === 'wizard' && step === 2 && (
        <div className="bg-white border border-[#E2E8F0] rounded-[6px] p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] pb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Step 2: Craft Personalized Message
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Pick a Fortifai GTM angle, synthesize dossier-grounded AI opening hooks, and refine copy.
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

          {/* Merge Variables */}
          <div>
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">
              Click to Insert Dynamic Merge Variable
            </div>
            <div className="flex flex-wrap gap-1.5">
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
                  className="px-2.5 py-1 text-[11px] font-mono bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-[4px] border border-[#E2E8F0]"
                >
                  {token}
                </button>
              ))}
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
                Back to Step 1 · Audience
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

              {/* Send Preview to Logged-In Writer / Owner Box */}
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
                  No recipients selected. Go back to Step 1 to pick a contact or cohort.
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
            <div className="flex items-center gap-3">
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

              <span className="text-xs text-slate-500 flex items-center gap-1.5">
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
