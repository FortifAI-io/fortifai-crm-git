import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Link2,
  Lock,
  Mail,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import type {
  Contact,
  ContactType,
  CrmUser,
  CustomFieldDefinition,
  PortalLinkMode,
} from '../../types/crm';
import { formatCurrency, getRegionBadgeStyle, getStageBadgeStyle } from '../../utils/crmHelpers';
import {
  ColumnFilterHeader,
  type CategoricalOption,
  type ColumnSortState,
  type NumericFilterRange,
} from '../ColumnFilterHeader';

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

const MARKETING_SENDER_IDENTITY = 'Fortifai <contact@fortifai.io>';

function formatUserSender(user: CrmUser): string {
  const displayName = user.sender_display_name?.trim() || user.full_name;
  return `${displayName} <${user.email}>`;
}

function buildOptions(values: string[], labelMap?: (v: string) => string): CategoricalOption[] {
  const counts = new Map<string, number>();
  values.forEach((v) => {
    counts.set(v, (counts.get(v) || 0) + 1);
  });
  return Array.from(counts.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([value, count]) => ({
      value,
      label: labelMap ? labelMap(value) : value,
      count,
    }));
}

function matchesNumeric(val: number, range: NumericFilterRange | null): boolean {
  if (!range) return true;
  if (range.min !== undefined && val < range.min) return false;
  if (range.max !== undefined && val > range.max) return false;
  return true;
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
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  const domainRecipients = useMemo(
    () => eligibleRecipients.filter((c) => c.contact_type === domainScope),
    [eligibleRecipients, domainScope]
  );

  // Audience table search, view toggle & per-column filters
  const [recipientSearch, setRecipientSearch] = useState('');
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [sortState, setSortState] = useState<ColumnSortState | null>(null);

  // Shared & Customer column filters
  const [nameFilter, setNameFilter] = useState<string[] | null>(null);
  const [companyFilter, setCompanyFilter] = useState<string[] | null>(null);
  const [tierFilter, setTierFilter] = useState<string[] | null>(null);
  const [industryFilter, setIndustryFilter] = useState<string[] | null>(null);
  const [personaFilter, setPersonaFilter] = useState<string[] | null>(null);
  const [regionFilterCol, setRegionFilterCol] = useState<string[] | null>(null);
  const [locationFilter, setLocationFilter] = useState<string[] | null>(null);
  const [stageFilterCol, setStageFilterCol] = useState<string[] | null>(null);
  const [ownerFilter, setOwnerFilter] = useState<string[] | null>(null);
  const [icpRange, setIcpRange] = useState<NumericFilterRange | null>(null);
  const [amountRange, setAmountRange] = useState<NumericFilterRange | null>(null);
  const [closeQtrFilter, setCloseQtrFilter] = useState<string[] | null>(null);
  const [sendStatusFilter, setSendStatusFilter] = useState<string[] | null>(null);

  // Investor-specific column filters
  const [priorityFilter, setPriorityFilter] = useState<string[] | null>(null);
  const [waveFilter, setWaveFilter] = useState<string[] | null>(null);

  const clearRecipientFilters = () => {
    setRecipientSearch('');
    setShowSelectedOnly(false);
    setSortState(null);
    setNameFilter(null);
    setCompanyFilter(null);
    setTierFilter(null);
    setIndustryFilter(null);
    setPersonaFilter(null);
    setRegionFilterCol(null);
    setLocationFilter(null);
    setStageFilterCol(null);
    setOwnerFilter(null);
    setIcpRange(null);
    setAmountRange(null);
    setCloseQtrFilter(null);
    setSendStatusFilter(null);
    setPriorityFilter(null);
    setWaveFilter(null);
  };

  useEffect(() => {
    clearRecipientFilters();
  }, [domainScope, filterResetSeq]);

  const isExternalVerifiedLive = (c: Contact): boolean =>
    c.email.trim().toLowerCase().endsWith('@fortifai.io') || c.is_demo === false;

  const getSendStatusKey = (c: Contact): string =>
    isExternalVerifiedLive(c) ? 'live_verified' : 'safe_mode_blocked';

  const getSendStatusLabel = (key: string): string =>
    key === 'live_verified' ? 'Live Verified' : 'Safe Mode Blocked';

  const columnOptions = useMemo(() => {
    return {
      names: buildOptions(domainRecipients.map((c) => c.full_name || 'Unnamed')),
      companies: buildOptions(domainRecipients.map((c) => c.organization || 'Unnamed')),
      tiers: buildOptions(domainRecipients.map((c) => c.tier || 'Tier I')),
      industries: buildOptions(domainRecipients.map((c) => c.industry || 'Unspecified')),
      personas: buildOptions(domainRecipients.map((c) => c.buyer_persona || 'Other')),
      regions: buildOptions(domainRecipients.map((c) => c.region || 'Other')),
      locations: buildOptions(domainRecipients.map((c) => c.location || 'Unspecified')),
      stages: buildOptions(domainRecipients.map((c) => c.stage || '1 Lead')),
      owners: buildOptions(domainRecipients.map((c) => c.owner || 'Unassigned')),
      closeQtrs: buildOptions(domainRecipients.map((c) => c.expected_close || 'Q2 2027')),
      sendStatuses: buildOptions(
        domainRecipients.map((c) => getSendStatusKey(c)),
        getSendStatusLabel
      ),
      priorities: buildOptions(domainRecipients.map((c) => c.priority_tier || 'P4')),
      waves: buildOptions(domainRecipients.map((c) => c.execution_wave || 'Unassigned')),
    };
  }, [domainRecipients]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (recipientSearch.trim()) count++;
    if (showSelectedOnly) count++;
    if (nameFilter !== null) count++;
    if (companyFilter !== null) count++;
    if (tierFilter !== null) count++;
    if (industryFilter !== null) count++;
    if (personaFilter !== null) count++;
    if (regionFilterCol !== null) count++;
    if (locationFilter !== null) count++;
    if (stageFilterCol !== null) count++;
    if (ownerFilter !== null) count++;
    if (icpRange && (icpRange.min !== undefined || icpRange.max !== undefined)) count++;
    if (amountRange && (amountRange.min !== undefined || amountRange.max !== undefined)) count++;
    if (closeQtrFilter !== null) count++;
    if (sendStatusFilter !== null) count++;
    if (priorityFilter !== null) count++;
    if (waveFilter !== null) count++;
    return count;
  }, [
    recipientSearch,
    showSelectedOnly,
    nameFilter,
    companyFilter,
    tierFilter,
    industryFilter,
    personaFilter,
    regionFilterCol,
    locationFilter,
    stageFilterCol,
    ownerFilter,
    icpRange,
    amountRange,
    closeQtrFilter,
    sendStatusFilter,
    priorityFilter,
    waveFilter,
  ]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const filteredRecipients = useMemo(() => {
    const q = recipientSearch.trim().toLowerCase();
    const list = domainRecipients.filter((c) => {
      if (showSelectedOnly && !selectedSet.has(c.id)) return false;
      if (q) {
        const match =
          c.full_name.toLowerCase().includes(q) ||
          c.organization.toLowerCase().includes(q) ||
          c.title.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          (c.industry || '').toLowerCase().includes(q) ||
          (c.buyer_persona || '').toLowerCase().includes(q) ||
          (c.location || '').toLowerCase().includes(q) ||
          (c.owner || '').toLowerCase().includes(q) ||
          (c.execution_wave || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      if (nameFilter !== null && !nameFilter.includes(c.full_name || 'Unnamed')) return false;
      if (companyFilter !== null && !companyFilter.includes(c.organization || 'Unnamed')) {
        return false;
      }
      if (domainScope === 'customer') {
        if (tierFilter !== null && !tierFilter.includes(c.tier || 'Tier I')) return false;
        if (industryFilter !== null && !industryFilter.includes(c.industry || 'Unspecified')) {
          return false;
        }
        if (personaFilter !== null && !personaFilter.includes(c.buyer_persona || 'Other')) {
          return false;
        }
        if (!matchesNumeric(c.icp_score ?? 0, icpRange)) return false;
        if (closeQtrFilter !== null && !closeQtrFilter.includes(c.expected_close || 'Q2 2027')) {
          return false;
        }
      } else {
        if (priorityFilter !== null && !priorityFilter.includes(c.priority_tier || 'P4')) {
          return false;
        }
        if (waveFilter !== null && !waveFilter.includes(c.execution_wave || 'Unassigned')) {
          return false;
        }
      }
      if (regionFilterCol !== null && !regionFilterCol.includes(c.region || 'Other')) return false;
      if (locationFilter !== null && !locationFilter.includes(c.location || 'Unspecified')) {
        return false;
      }
      if (stageFilterCol !== null && !stageFilterCol.includes(c.stage || '1 Lead')) return false;
      if (ownerFilter !== null && !ownerFilter.includes(c.owner || 'Unassigned')) return false;
      if (!matchesNumeric(c.amount_usd || 0, amountRange)) return false;
      if (sendStatusFilter !== null && !sendStatusFilter.includes(getSendStatusKey(c))) {
        return false;
      }
      return true;
    });

    if (!sortState) return list;

    const dir = sortState.direction === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      switch (sortState.key) {
        case 'name':
          return a.full_name.localeCompare(b.full_name) * dir;
        case 'company':
          return a.organization.localeCompare(b.organization) * dir;
        case 'industry':
          return (a.industry || '').localeCompare(b.industry || '') * dir;
        case 'persona':
          return (a.buyer_persona || '').localeCompare(b.buyer_persona || '') * dir;
        case 'location':
          return a.location.localeCompare(b.location) * dir;
        case 'region':
          return a.region.localeCompare(b.region) * dir;
        case 'stage':
          return a.stage.localeCompare(b.stage) * dir;
        case 'owner':
          return (a.owner || '').localeCompare(b.owner || '') * dir;
        case 'icp_score':
          return ((a.icp_score ?? 0) - (b.icp_score ?? 0)) * dir;
        case 'amount_usd':
          return ((a.amount_usd || 0) - (b.amount_usd || 0)) * dir;
        case 'expected_close':
          return (a.expected_close || 'Q2 2027').localeCompare(b.expected_close || 'Q2 2027') * dir;
        case 'priority_track': {
          const prio = (a.priority_tier || 'P4').localeCompare(b.priority_tier || 'P4');
          if (prio !== 0) return prio * dir;
          return (a.execution_wave || '').localeCompare(b.execution_wave || '') * dir;
        }
        case 'send_status':
          return (
            getSendStatusLabel(getSendStatusKey(a)).localeCompare(
              getSendStatusLabel(getSendStatusKey(b))
            ) * dir
          );
        default:
          return 0;
      }
    });
  }, [
    domainRecipients,
    domainScope,
    recipientSearch,
    showSelectedOnly,
    selectedSet,
    nameFilter,
    companyFilter,
    tierFilter,
    industryFilter,
    personaFilter,
    regionFilterCol,
    locationFilter,
    stageFilterCol,
    ownerFilter,
    icpRange,
    amountRange,
    closeQtrFilter,
    sendStatusFilter,
    priorityFilter,
    waveFilter,
    sortState,
  ]);

  const filteredIds = useMemo(
    () => filteredRecipients.map((r) => r.id),
    [filteredRecipients]
  );
  const selectedInFilteredCount = useMemo(
    () => filteredIds.filter((id) => selectedSet.has(id)).length,
    [filteredIds, selectedSet]
  );
  const allFilteredSelected =
    filteredIds.length > 0 && selectedInFilteredCount === filteredIds.length;
  const someFilteredSelected =
    selectedInFilteredCount > 0 && selectedInFilteredCount < filteredIds.length;

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someFilteredSelected;
    }
  }, [someFilteredSelected]);

  const toggleAllVisible = () => {
    if (filteredIds.length === 0) return;
    if (allFilteredSelected) {
      const visibleSet = new Set(filteredIds);
      onChangeSelectedIds(selectedIds.filter((id) => !visibleSet.has(id)));
    } else {
      const merged = new Set(selectedIds);
      filteredIds.forEach((id) => merged.add(id));
      onChangeSelectedIds(Array.from(merged));
    }
  };

  const selectOnlyFiltered = () => {
    onChangeSelectedIds(filteredIds);
  };

  const activeRecipients = domainRecipients.filter((c) => selectedSet.has(c.id));
  const scopedCustomFields = customFields.filter(
    (cf) => cf.entity_scope === domainScope || cf.entity_scope === 'both'
  );

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
    const needsLeadingSpace =
      before.length > 0 && !/[\s\n]$/.test(before) ? ' ' : '';
    const nextValue = `${before}${needsLeadingSpace}${token}${after}`;
    onChangeBody(nextValue);
    const nextCaret = start + needsLeadingSpace.length + token.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const renderFinalPreviewBody = (rawTemplate: string, sample: Contact): string => {
    const text = renderTemplate(rawTemplate, sample);
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

  const testTargetEmail = currentUser.email.trim().toLowerCase().endsWith('@fortifai.io')
    ? currentUser.email.trim().toLowerCase()
    : 'varun@fortifai.io';

  const verifiedSelectedCount = activeRecipients.filter(isExternalVerifiedLive).length;
  const blockedSelectedCount = activeRecipients.length - verifiedSelectedCount;

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

  const ownerBreakdown = Array.from(
    activeRecipients.reduce((acc, rec) => {
      const resolved = resolveSenderForContact(rec);
      acc.set(resolved, (acc.get(resolved) || 0) + 1);
      return acc;
    }, new Map<string, number>())
  );

  const isFilteredSubset = filteredRecipients.length < domainRecipients.length;

  return (
    <div className="p-6 max-w-[1600px] w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Column: Audience & Editor */}
      <div className="lg:col-span-7 space-y-5">
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-5 space-y-3.5">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-sm font-semibold text-slate-900">
                1. Select Warm Audience Segment
              </h2>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-[#E2E8F0]">
                {domainScope === 'investor' ? 'Investors ($3M Seed)' : 'Enterprise Customers'}
              </span>
            </div>
            {suppressedCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-medium">
                <ShieldAlert size={12} />
                {suppressedCount} Passed / Unsubscribed excluded
              </span>
            )}
          </div>

          {/* Search & Selection Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="relative w-full sm:w-72">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={recipientSearch}
                onChange={(e) => setRecipientSearch(e.target.value)}
                placeholder={
                  domainScope === 'customer'
                    ? 'Search name, company, industry, persona...'
                    : 'Search partner, fund, track, region...'
                }
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-[#E2E8F0] rounded-md focus:outline-none focus:bg-white focus:border-slate-400"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => setShowSelectedOnly((prev) => !prev)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded border font-medium transition-colors whitespace-nowrap ${
                  showSelectedOnly
                    ? 'bg-[#0D1520] text-white border-[#0D1520]'
                    : 'bg-white text-slate-700 border-[#E2E8F0] hover:bg-slate-50'
                }`}
              >
                <CheckSquare size={12} />
                Selected ({activeRecipients.length})
              </button>

              {(activeFilterCount > 0 || sortState !== null) && (
                <button
                  type="button"
                  onClick={clearRecipientFilters}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-medium whitespace-nowrap"
                >
                  <RotateCcw size={11} />
                  Reset Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                </button>
              )}
            </div>
          </div>

          {/* Selection Status & Bulk Actions Strip */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 bg-slate-50/70 border border-slate-200/70 rounded-md px-3 py-2">
            <div className="tabular-nums">
              <strong className="text-slate-900">{activeRecipients.length}</strong> of{' '}
              {domainRecipients.length} eligible selected
              {isFilteredSubset && (
                <span className="text-slate-400">
                  {' '}
                  · Showing <strong className="text-slate-700">{filteredRecipients.length}</strong>{' '}
                  matching filter
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {isFilteredSubset && filteredRecipients.length > 0 && (
                <button
                  type="button"
                  onClick={selectOnlyFiltered}
                  className="px-2 py-0.5 rounded bg-indigo-600 text-white hover:bg-indigo-700 font-medium transition-colors whitespace-nowrap"
                >
                  Select Only Matching ({filteredRecipients.length})
                </button>
              )}
              <button
                type="button"
                onClick={() => onChangeSelectedIds(domainRecipients.map((r) => r.id))}
                className="text-indigo-600 hover:underline font-medium whitespace-nowrap"
              >
                Select All ({domainRecipients.length})
              </button>
              <button
                type="button"
                onClick={() => onChangeSelectedIds([])}
                className="text-slate-500 hover:text-slate-800 hover:underline whitespace-nowrap"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Filterable Column-Header Recipient Table */}
          <div className="border border-[#E2E8F0] rounded-md overflow-hidden">
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50 border-b border-[#E2E8F0] text-[11px] font-semibold tracking-wider text-slate-500">
                  <tr>
                    <th className="py-2 px-2.5 w-8">
                      <input
                        ref={headerCheckboxRef}
                        type="checkbox"
                        checked={allFilteredSelected}
                        onChange={toggleAllVisible}
                        disabled={filteredRecipients.length === 0}
                        aria-label="Toggle all visible recipients"
                        className="rounded border-slate-300 text-[#0D1520] cursor-pointer"
                      />
                    </th>

                    {domainScope === 'customer' ? (
                      <>
                        <ColumnFilterHeader
                          columnKey="name"
                          label="Name"
                          thClassName="py-2 px-2.5 whitespace-nowrap"
                          mode="categorical"
                          sortState={sortState}
                          onChangeSort={setSortState}
                          options={columnOptions.names}
                          selectedValues={nameFilter}
                          onChangeSelectedValues={setNameFilter}
                        />
                        <ColumnFilterHeader
                          columnKey="company"
                          label="Company"
                          thClassName="py-2 px-2.5 whitespace-nowrap"
                          mode="categorical"
                          sortState={sortState}
                          onChangeSort={setSortState}
                          options={columnOptions.companies}
                          selectedValues={companyFilter}
                          onChangeSelectedValues={setCompanyFilter}
                          subFacets={[
                            {
                              id: 'tier',
                              label: 'Tier',
                              options: columnOptions.tiers,
                              selectedValues: tierFilter,
                              onChange: setTierFilter,
                            },
                          ]}
                        />
                        <ColumnFilterHeader
                          columnKey="industry"
                          label="Industry"
                          thClassName="py-2 px-2.5 whitespace-nowrap"
                          mode="categorical"
                          sortState={sortState}
                          onChangeSort={setSortState}
                          options={columnOptions.industries}
                          selectedValues={industryFilter}
                          onChangeSelectedValues={setIndustryFilter}
                        />
                        <ColumnFilterHeader
                          columnKey="persona"
                          label="Buyer Persona"
                          thClassName="py-2 px-2.5 whitespace-nowrap"
                          mode="categorical"
                          sortState={sortState}
                          onChangeSort={setSortState}
                          options={columnOptions.personas}
                          selectedValues={personaFilter}
                          onChangeSelectedValues={setPersonaFilter}
                        />
                        <ColumnFilterHeader
                          columnKey="location"
                          label="Location"
                          thClassName="py-2 px-2.5 whitespace-nowrap"
                          mode="categorical"
                          sortState={sortState}
                          onChangeSort={setSortState}
                          options={columnOptions.locations}
                          selectedValues={locationFilter}
                          onChangeSelectedValues={setLocationFilter}
                          subFacets={[
                            {
                              id: 'region',
                              label: 'Region',
                              options: columnOptions.regions,
                              selectedValues: regionFilterCol,
                              onChange: setRegionFilterCol,
                            },
                          ]}
                        />
                        <ColumnFilterHeader
                          columnKey="stage"
                          label="Stage"
                          thClassName="py-2 px-2.5 whitespace-nowrap"
                          mode="categorical"
                          sortState={sortState}
                          onChangeSort={setSortState}
                          options={columnOptions.stages}
                          selectedValues={stageFilterCol}
                          onChangeSelectedValues={setStageFilterCol}
                        />
                        <ColumnFilterHeader
                          columnKey="owner"
                          label="Owner"
                          thClassName="py-2 px-2.5 whitespace-nowrap"
                          mode="categorical"
                          sortState={sortState}
                          onChangeSort={setSortState}
                          options={columnOptions.owners}
                          selectedValues={ownerFilter}
                          onChangeSelectedValues={setOwnerFilter}
                        />
                        <ColumnFilterHeader
                          columnKey="icp_score"
                          label="ICP"
                          thClassName="py-2 px-2.5 whitespace-nowrap"
                          mode="numeric"
                          sortState={sortState}
                          onChangeSort={setSortState}
                          numericRange={icpRange}
                          onChangeNumericRange={setIcpRange}
                          numericPlaceholder={{ min: '0', max: '100' }}
                          numericPresets={[
                            { label: '≥ 80', min: 80 },
                            { label: '60–79', min: 60, max: 79 },
                            { label: '< 60', max: 59 },
                          ]}
                        />
                        <ColumnFilterHeader
                          columnKey="amount_usd"
                          label="Target ARR"
                          thClassName="py-2 px-2.5 whitespace-nowrap"
                          mode="numeric"
                          sortState={sortState}
                          onChangeSort={setSortState}
                          numericRange={amountRange}
                          onChangeNumericRange={setAmountRange}
                          numericPlaceholder={{ min: '0', max: 'Max' }}
                          numericPresets={[
                            { label: '$100K+', min: 100000 },
                            { label: '$250K+', min: 250000 },
                            { label: '$500K+', min: 500000 },
                          ]}
                        />
                        <ColumnFilterHeader
                          columnKey="expected_close"
                          label="Close Qtr"
                          thClassName="py-2 px-2.5 whitespace-nowrap"
                          mode="categorical"
                          sortState={sortState}
                          onChangeSort={setSortState}
                          options={columnOptions.closeQtrs}
                          selectedValues={closeQtrFilter}
                          onChangeSelectedValues={setCloseQtrFilter}
                        />
                        <ColumnFilterHeader
                          columnKey="send_status"
                          label="Send Guard"
                          thClassName="py-2 px-2.5 whitespace-nowrap"
                          mode="categorical"
                          sortState={sortState}
                          onChangeSort={setSortState}
                          options={columnOptions.sendStatuses}
                          selectedValues={sendStatusFilter}
                          onChangeSelectedValues={setSendStatusFilter}
                        />
                      </>
                    ) : (
                      <>
                        <ColumnFilterHeader
                          columnKey="name"
                          label="Partner"
                          thClassName="py-2 px-2.5 whitespace-nowrap"
                          mode="categorical"
                          sortState={sortState}
                          onChangeSort={setSortState}
                          options={columnOptions.names}
                          selectedValues={nameFilter}
                          onChangeSelectedValues={setNameFilter}
                        />
                        <ColumnFilterHeader
                          columnKey="company"
                          label="Fund"
                          thClassName="py-2 px-2.5 whitespace-nowrap"
                          mode="categorical"
                          sortState={sortState}
                          onChangeSort={setSortState}
                          options={columnOptions.companies}
                          selectedValues={companyFilter}
                          onChangeSelectedValues={setCompanyFilter}
                        />
                        <ColumnFilterHeader
                          columnKey="priority_track"
                          label="Priority / Track"
                          thClassName="py-2 px-2.5 whitespace-nowrap"
                          mode="categorical"
                          sortState={sortState}
                          onChangeSort={setSortState}
                          options={columnOptions.waves}
                          selectedValues={waveFilter}
                          onChangeSelectedValues={setWaveFilter}
                          subFacets={[
                            {
                              id: 'priority',
                              label: 'Priority',
                              options: columnOptions.priorities,
                              selectedValues: priorityFilter,
                              onChange: setPriorityFilter,
                            },
                          ]}
                        />
                        <ColumnFilterHeader
                          columnKey="region"
                          label="Region"
                          thClassName="py-2 px-2.5 whitespace-nowrap"
                          mode="categorical"
                          sortState={sortState}
                          onChangeSort={setSortState}
                          options={columnOptions.regions}
                          selectedValues={regionFilterCol}
                          onChangeSelectedValues={setRegionFilterCol}
                          subFacets={[
                            {
                              id: 'city',
                              label: 'Hub / City',
                              options: columnOptions.locations.slice(0, 12),
                              selectedValues: locationFilter,
                              onChange: setLocationFilter,
                            },
                          ]}
                        />
                        <ColumnFilterHeader
                          columnKey="stage"
                          label="Status"
                          thClassName="py-2 px-2.5 whitespace-nowrap"
                          mode="categorical"
                          sortState={sortState}
                          onChangeSort={setSortState}
                          options={columnOptions.stages}
                          selectedValues={stageFilterCol}
                          onChangeSelectedValues={setStageFilterCol}
                        />
                        <ColumnFilterHeader
                          columnKey="owner"
                          label="Owner"
                          thClassName="py-2 px-2.5 whitespace-nowrap"
                          mode="categorical"
                          sortState={sortState}
                          onChangeSort={setSortState}
                          options={columnOptions.owners}
                          selectedValues={ownerFilter}
                          onChangeSelectedValues={setOwnerFilter}
                        />
                        <ColumnFilterHeader
                          columnKey="amount_usd"
                          label="Check ($)"
                          thClassName="py-2 px-2.5 whitespace-nowrap"
                          mode="numeric"
                          sortState={sortState}
                          onChangeSort={setSortState}
                          numericRange={amountRange}
                          onChangeNumericRange={setAmountRange}
                          numericPlaceholder={{ min: '0', max: 'Max' }}
                          numericPresets={[
                            { label: '$500K+', min: 500000 },
                            { label: '$1.0M+', min: 1000000 },
                            { label: '$2.0M+', min: 2000000 },
                          ]}
                        />
                        <ColumnFilterHeader
                          columnKey="send_status"
                          label="Send Guard"
                          thClassName="py-2 px-2.5 whitespace-nowrap"
                          mode="categorical"
                          sortState={sortState}
                          onChangeSort={setSortState}
                          options={columnOptions.sendStatuses}
                          selectedValues={sendStatusFilter}
                          onChangeSelectedValues={setSendStatusFilter}
                        />
                      </>
                    )}
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 tabular-nums">
                  {filteredRecipients.length === 0 ? (
                    <tr>
                      <td
                        colSpan={domainScope === 'customer' ? 12 : 9}
                        className="p-6 text-center text-xs text-slate-400 space-y-2"
                      >
                        <div>No active {domainScope} recipients match these column filters.</div>
                        {(activeFilterCount > 0 || sortState !== null) && (
                          <button
                            type="button"
                            onClick={clearRecipientFilters}
                            className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium"
                          >
                            Reset Column Filters
                          </button>
                        )}
                      </td>
                    </tr>
                  ) : (
                    filteredRecipients.map((rec) => {
                      const checked = selectedSet.has(rec.id);
                      const toggleRow = () => {
                        if (checked) {
                          onChangeSelectedIds(selectedIds.filter((id) => id !== rec.id));
                        } else {
                          onChangeSelectedIds([...selectedIds, rec.id]);
                        }
                      };

                      return (
                        <tr
                          key={rec.id}
                          onClick={toggleRow}
                          className={`cursor-pointer transition-colors ${
                            checked ? 'bg-indigo-50/35 hover:bg-indigo-50/60' : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="py-2 px-2.5" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={toggleRow}
                              aria-label={`Select ${rec.full_name} (${rec.organization})`}
                              className="rounded border-slate-300 text-[#0D1520] cursor-pointer"
                            />
                          </td>

                          {domainScope === 'customer' ? (
                            <>
                              <td className="py-2 px-2.5 whitespace-nowrap">
                                <div className="font-medium text-slate-900">{rec.full_name}</div>
                                <div className="text-[10px] text-slate-400 truncate max-w-[160px]">
                                  {rec.title}
                                </div>
                              </td>
                              <td className="py-2 px-2.5 whitespace-nowrap">
                                <div className="font-medium text-slate-800 flex items-center gap-1">
                                  <span>{rec.organization}</span>
                                  {rec.fortune_500 && (
                                    <span className="text-[9px] px-1 py-0.2 bg-amber-50 text-amber-700 border border-amber-200 rounded font-medium">
                                      F500
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  {rec.tier || 'Tier I'}
                                </div>
                              </td>
                              <td className="py-2 px-2.5 whitespace-nowrap text-slate-700">
                                {rec.industry || 'Unspecified'}
                              </td>
                              <td className="py-2 px-2.5 whitespace-nowrap">
                                <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-medium">
                                  {rec.buyer_persona || 'Other'}
                                </span>
                              </td>
                              <td className="py-2 px-2.5 whitespace-nowrap">
                                <span
                                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${getRegionBadgeStyle(
                                    rec.region
                                  )}`}
                                >
                                  {rec.region}
                                </span>
                                <span className="text-[10px] text-slate-400 ml-1.5">
                                  {rec.location}
                                </span>
                              </td>
                              <td className="py-2 px-2.5 whitespace-nowrap">
                                <span
                                  className={`inline-block text-[10px] px-2 py-0.5 rounded-full border font-medium ${getStageBadgeStyle(
                                    rec.stage
                                  )}`}
                                >
                                  {rec.stage}
                                </span>
                              </td>
                              <td className="py-2 px-2.5 whitespace-nowrap text-slate-600">
                                {rec.owner}
                              </td>
                              <td className="py-2 px-2.5 whitespace-nowrap font-semibold text-emerald-700">
                                {rec.icp_score ?? 0}
                              </td>
                              <td className="py-2 px-2.5 whitespace-nowrap font-medium text-slate-800">
                                {formatCurrency(rec.amount_usd || 0)}
                              </td>
                              <td className="py-2 px-2.5 whitespace-nowrap text-slate-600">
                                {rec.expected_close || 'Q2 2027'}
                              </td>
                              <td className="py-2 px-2.5 whitespace-nowrap">
                                {isExternalVerifiedLive(rec) ? (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                                    Live Verified
                                  </span>
                                ) : (
                                  <span
                                    title="Safe Mode Guard blocks external Resend calls unless contact exists in live Supabase with is_demo = false"
                                    className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-medium"
                                  >
                                    Safe Mode Blocked
                                  </span>
                                )}
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="py-2 px-2.5 whitespace-nowrap">
                                <div className="font-medium text-slate-900">{rec.full_name}</div>
                                <div className="text-[10px] text-slate-400 truncate max-w-[160px]">
                                  {rec.title}
                                </div>
                              </td>
                              <td className="py-2 px-2.5 whitespace-nowrap font-medium text-slate-800">
                                {rec.organization}
                              </td>
                              <td className="py-2 px-2.5 whitespace-nowrap">
                                <span className="font-semibold text-slate-800">
                                  {rec.priority_tier || 'P4'}
                                </span>
                                <span className="text-[10px] text-slate-400 ml-1.5 truncate max-w-[150px] inline-block align-bottom">
                                  {rec.execution_wave}
                                </span>
                              </td>
                              <td className="py-2 px-2.5 whitespace-nowrap">
                                <span
                                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${getRegionBadgeStyle(
                                    rec.region
                                  )}`}
                                >
                                  {rec.region}
                                </span>
                                <span className="text-[10px] text-slate-400 ml-1.5">
                                  {rec.location}
                                </span>
                              </td>
                              <td className="py-2 px-2.5 whitespace-nowrap">
                                <span
                                  className={`inline-block text-[10px] px-2 py-0.5 rounded-full border font-medium ${getStageBadgeStyle(
                                    rec.stage
                                  )}`}
                                >
                                  {rec.stage}
                                </span>
                              </td>
                              <td className="py-2 px-2.5 whitespace-nowrap text-slate-600">
                                {rec.owner}
                              </td>
                              <td className="py-2 px-2.5 whitespace-nowrap font-medium text-slate-800">
                                {formatCurrency(rec.amount_usd || 0)}
                              </td>
                              <td className="py-2 px-2.5 whitespace-nowrap">
                                {isExternalVerifiedLive(rec) ? (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                                    Live Verified
                                  </span>
                                ) : (
                                  <span
                                    title="Safe Mode Guard blocks external Resend calls unless contact exists in live Supabase with is_demo = false"
                                    className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-medium"
                                  >
                                    Safe Mode Blocked
                                  </span>
                                )}
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Email Editor & Role-Based Sender Identity */}
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">
              2. Sender Identity &amp; Personalized Message (Resend API)
            </h2>
            <span className="text-[11px] text-slate-400 font-mono">
              Role: {currentUser.role}
            </span>
          </div>

          {/* Role-Based Send From Selector + Deal Owner Batch Toggle */}
          <div className="p-3.5 rounded-md bg-slate-50 border border-[#E2E8F0] space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end text-xs">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Send From Identity
                </label>
                <select
                  value={sendFrom}
                  disabled={useAssignedOwnerSender}
                  onChange={(e) => onChangeSendFrom(e.target.value)}
                  className="w-full px-2.5 py-2 bg-white border border-[#E2E8F0] rounded-md text-xs text-slate-900 font-medium disabled:opacity-50"
                >
                  {senderOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                {!canSendAsMarketing && (
                  <p className="text-[10px] text-slate-400 mt-1">
                    Marketing alias (contact@fortifai.io) requires Marketing, Admin, or Super Admin access.
                  </p>
                )}
              </div>

              <label className="flex items-start gap-2.5 p-2.5 rounded-md bg-white border border-[#E2E8F0] cursor-pointer hover:bg-slate-50 transition-colors">
                <input
                  type="checkbox"
                  checked={useAssignedOwnerSender}
                  onChange={(e) => onChangeUseAssignedOwnerSender(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-[#0D1520]"
                />
                <div className="text-xs">
                  <div className="font-medium text-slate-800 flex items-center gap-1.5">
                    <UserCheck size={13} className="text-indigo-600 shrink-0" />
                    Send from assigned Deal Owner&apos;s email
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Dispatches each contact from their assigned owner in <span className="font-mono">crm_users</span>.
                  </p>
                </div>
              </label>
            </div>

            {useAssignedOwnerSender && ownerBreakdown.length > 0 && (
              <div className="pt-2 border-t border-slate-200/80 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600">
                <span className="font-medium text-slate-700">Batch Owner Routing:</span>
                {ownerBreakdown.map(([sender, count]) => (
                  <span
                    key={sender}
                    className="px-2 py-0.5 rounded bg-white border border-slate-200 font-mono text-[10px] text-slate-700"
                  >
                    {sender} ({count})
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Optional Tracked Portal Link Selector */}
          <div className="p-3.5 rounded-md bg-slate-50 border border-[#E2E8F0] space-y-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label
                htmlFor={`portal-link-select-${domainScope}`}
                className="text-[11px] font-semibold text-slate-700 flex items-center gap-1.5"
              >
                <Link2 size={13} className="text-slate-500" />
                Include Portal Link
              </label>
              <select
                id={`portal-link-select-${domainScope}`}
                value={effectivePortalMode}
                onChange={(e) => onChangePortalLinkMode(e.target.value as PortalLinkMode)}
                className="bg-white border border-[#E2E8F0] rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:outline-none focus:border-slate-400"
              >
                <option value="none">None (Plain 1-to-1 Email)</option>
                <option value={portalAttachValue}>
                  {domainScope === 'investor'
                    ? 'Attach Investor Portal (investor.fortifai.io)'
                    : 'Attach Product Overview (overview.fortifai.io)'}
                </option>
              </select>
            </div>
            <p className="text-[11px] text-slate-500">
              {effectivePortalMode === 'none'
                ? 'Sends the exact message body as written with zero portal URLs or ?ref= tracking injected.'
                : body.includes('{{portal_link}}')
                ? `Replaces {{portal_link}} inline with https://${portalHost}/?ref={{contact_id}}.`
                : `Automatically appends a clean tracked ${portalHost} CTA line at the bottom, or place {{portal_link}} anywhere in the body.`}
            </p>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">Subject Line</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => onChangeSubject(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-white border border-[#E2E8F0] rounded-md focus:outline-none focus:border-slate-400 font-medium text-slate-900"
            />
          </div>

          <div>
            <div className="text-[11px] text-slate-400 mb-1.5">
              Insert Dynamic Variable or Optional Tracked Portal Link:
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                '{{first_name}}',
                '{{organization}}',
                '{{title}}',
                '{{region}}',
                ...(domainScope === 'investor' ? ['{{custom_hook}}'] : []),
                ...scopedCustomFields.map((cf) => `{{custom.${cf.field_key}}}`),
              ].map((token) => (
                <button
                  key={token}
                  type="button"
                  onClick={() => insertTokenAtCursor(token)}
                  className="px-2 py-1 text-[11px] font-mono bg-slate-100 hover:bg-slate-200 text-slate-700 rounded border border-slate-200 transition-colors"
                >
                  {token}
                </button>
              ))}
              <button
                type="button"
                disabled={effectivePortalMode === 'none'}
                onClick={() => insertTokenAtCursor('{{portal_link}}')}
                title={
                  effectivePortalMode === 'none'
                    ? `Select "Attach ${
                        domainScope === 'investor' ? 'Investor Portal' : 'Product Overview'
                      }" above to insert {{portal_link}}`
                    : `Insert {{portal_link}} at cursor (${portalHost}/?ref={{contact_id}})`
                }
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded border border-indigo-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
              >
                <Link2 size={11} />
                Insert Tracked Portal Link
              </button>
            </div>
          </div>

          <div>
            <textarea
              ref={textareaRef}
              rows={10}
              value={body}
              onChange={(e) => onChangeBody(e.target.value)}
              className="w-full p-3 text-xs leading-relaxed bg-white border border-[#E2E8F0] rounded-md focus:outline-none focus:border-slate-400 font-sans text-slate-800"
            />
          </div>

          {/* Superhuman / Gmail Sent-Folder Sync Option */}
          <label className="flex items-start gap-2.5 p-3 rounded-md bg-slate-50 border border-[#E2E8F0] cursor-pointer hover:bg-slate-100/70 transition-colors">
            <input
              type="checkbox"
              checked={bccEnabled}
              onChange={(e) => onChangeBccEnabled(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-[#0D1520]"
            />
            <div className="text-xs">
              <div className="font-medium text-slate-800 flex items-center gap-1.5">
                <Mail size={13} className="text-indigo-600 shrink-0" />
                BCC my inbox ({currentUser.email}) so sent emails appear in Superhuman
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Automatically sends a blind carbon copy via <span className="font-mono">/api/send-batch</span> so every Resend outreach thread is indexed in Gmail &amp; Superhuman.
              </p>
            </div>
          </label>

          {!canSendCampaigns && (
            <div className="p-3 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
              <Lock size={14} className="shrink-0" />
              <span>
                Your role does not include <span className="font-mono">can_send_campaigns</span>. Ask a Super Admin to enable campaign sending in Admin &amp; Access.
              </span>
            </div>
          )}

          {/* Safe Mode / Test Send Guard Status */}
          <div className="p-3 rounded-md bg-slate-50 border border-[#E2E8F0] text-xs flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-start gap-2 min-w-0">
              <ShieldCheck size={14} className="text-emerald-700 shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-slate-800">
                  Safe Mode Guard Active
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  External domains (e.g. <span className="font-mono">@honeywell.com</span>,{' '}
                  <span className="font-mono">@nokia.com</span>) are blocked on{' '}
                  <span className="font-mono">/api/send-batch</span> unless verified in live
                  Supabase <span className="font-mono">contacts</span> with{' '}
                  <span className="font-mono">is_demo = false</span>. Test sends only deliver to{' '}
                  <span className="font-mono">@fortifai.io</span>.
                </p>
              </div>
            </div>
            {activeRecipients.length > 0 && (
              <div className="flex items-center gap-1.5 text-[11px] shrink-0 tabular-nums">
                <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                  {verifiedSelectedCount} live
                </span>
                {blockedSelectedCount > 0 && (
                  <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-medium">
                    {blockedSelectedCount} guarded
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between pt-2 gap-3">
            <div className="text-xs text-slate-500">
              Ready to send to{' '}
              <strong className="text-slate-900">{activeRecipients.length} recipients</strong>{' '}
              (staggered 1.5s/email)
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!canSendCampaigns || sendingTest || sendingBatch}
                onClick={onSendTestToMe}
                title={
                  !canSendCampaigns
                    ? 'Requires can_send_campaigns permission'
                    : `Send test preview only to ${testTargetEmail}`
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-800 bg-white border border-[#E2E8F0] rounded-md hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
              >
                <Mail size={13} />
                {sendingTest
                  ? 'Sending Test...'
                  : `Send Test to Me (${testTargetEmail})`}
              </button>

              <button
                type="button"
                disabled={!canSendCampaigns || sendingBatch || sendingTest || activeRecipients.length === 0}
                onClick={onSendBatch}
                title={!canSendCampaigns ? 'Requires can_send_campaigns permission' : undefined}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#0D1520] rounded-md hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
              >
                <Send size={14} />
                {sendingBatch
                  ? 'Dispatching via Resend...'
                  : `Send Campaign (${activeRecipients.length})`}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Live Recipient Preview Pane */}
      <div className="lg:col-span-5">
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-5 sticky top-20 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Live Rendered Preview</h3>
              <p className="text-[11px] text-slate-400">
                Inspect sender identity, variables &amp; tracking URL before sending
              </p>
            </div>
            {activeRecipients.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() =>
                    onChangePreviewIdx(
                      previewIdx > 0 ? previewIdx - 1 : activeRecipients.length - 1
                    )
                  }
                  className="p-1 rounded border border-slate-200 hover:bg-slate-50"
                  aria-label="Previous recipient preview"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-slate-600 font-medium px-1 tabular-nums">
                  {Math.min(previewIdx + 1, activeRecipients.length)} / {activeRecipients.length}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onChangePreviewIdx(
                      previewIdx + 1 < activeRecipients.length ? previewIdx + 1 : 0
                    )
                  }
                  className="p-1 rounded border border-slate-200 hover:bg-slate-50"
                  aria-label="Next recipient preview"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>

          {activeRecipients.length === 0 ? (
            <div className="py-16 text-center text-xs text-slate-400">
              Select at least one recipient on the left to preview personalized copy.
            </div>
          ) : (
            (() => {
              const sample =
                activeRecipients[Math.min(previewIdx, activeRecipients.length - 1)];
              const resolvedFrom = resolveSenderForContact(sample);
              return (
                <div className="space-y-3 text-xs">
                  <div className="bg-slate-50 border border-slate-200/80 rounded-md p-3 space-y-1">
                    <div>
                      <span className="text-slate-400">From:</span>{' '}
                      <span className="font-mono text-slate-800">{resolvedFrom}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">To:</span>{' '}
                      <span className="font-medium text-slate-800">
                        {sample.full_name} &lt;{sample.email}&gt;
                      </span>
                    </div>
                    {bccEnabled && (
                      <div>
                        <span className="text-slate-400">BCC (Superhuman Sync):</span>{' '}
                        <span className="font-mono text-indigo-700">{currentUser.email}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-slate-400">Subject:</span>{' '}
                      <span className="font-medium text-slate-900">
                        {renderTemplate(subject, sample)}
                      </span>
                    </div>
                  </div>

                  <div className="border border-[#E2E8F0] rounded-md p-4 bg-white whitespace-pre-wrap leading-relaxed text-slate-800 min-h-[260px]">
                    {renderFinalPreviewBody(body, sample)}
                    <div className="mt-6 pt-3 border-t border-slate-100 text-[11px] text-slate-400">
                      If you&apos;d prefer not to receive these updates,{' '}
                      <span className="underline">unsubscribe here</span>.
                    </div>
                  </div>
                </div>
              );
            })()
          )}
        </div>
      </div>
    </div>
  );
}
