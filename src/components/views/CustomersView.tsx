import { useEffect, useMemo, useState } from 'react';
import { Trash2, BarChart3, Mail, RotateCcw, Search, Sparkles, ChevronDown, ChevronUp, Layers, Target, Users } from "lucide-react";
import type { Contact, CrmUser, DeliveryStatus, Quarter, Region } from '../../types/crm';
import { CUSTOMER_STAGES, QUARTERS } from '../../data/seedData';
import { formatCurrency, getRegionBadgeStyle, getStageBadgeStyle } from '../../utils/crmHelpers';
import {
  ColumnFilterHeader,
  type CategoricalOption,
  type ColumnSortState,
  type NumericFilterRange,
} from '../ColumnFilterHeader';
import { DeliveryStatusBadge } from '../DeliveryStatusBadge';
import { CmsText } from '../CmsText';
import {
  TABLE_DENSITY_CLASSES,
  TableDensityToggle,
  useTableDensity,
} from '../TableDensityToggle';

export interface CustomerPresetFilter {
  region?: 'All' | Region;
  tier?: 'All' | 'Tier I' | 'Tier II';
  sector?: string;
  seq: number;
}

interface CustomersViewProps {
  canEdit: boolean;
  canSendCampaigns: boolean;
  customers: Contact[];
  activeUsers: CrmUser[];
  presetFilter?: CustomerPresetFilter | null;
  onNavigateToAnalytics: () => void;
  onSelectContact: (id: string) => void;
  onUpdateContact: (id: string, patch: Partial<Contact>) => void;
  onDeleteContact?: (id: string) => void;
  onComposeEmail: (contact: Contact) => void;
  onOpenAccountIntelligence: (contact: Contact) => void;
}

const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  not_sent: 'Not sent',
  sent: 'Sent',
  delivered: 'Delivered / Received',
  opened: 'Opened',
  portal_visited: 'Portal Visited',
  replied: 'Replied',
  bounced: 'Bounced',
};

function getDeliveryFilterKey(c: Contact): string {
  if (
    c.delivery_status === 'opened' &&
    c.opened_duration_sec !== undefined &&
    c.opened_duration_sec < 10
  ) {
    return 'bot_scan';
  }
  return c.delivery_status || 'not_sent';
}

function getDeliveryFilterLabel(key: string): string {
  if (key === 'bot_scan') return 'Bot Scan (<10s)';
  return DELIVERY_STATUS_LABELS[key as DeliveryStatus] || 'Not sent';
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

export function CustomersView({
  canEdit,
  canSendCampaigns,
  customers,
  activeUsers,
  presetFilter,
  onNavigateToAnalytics,
  onSelectContact,
  onUpdateContact,
  onDeleteContact,
  onComposeEmail,
  onOpenAccountIntelligence,
}: CustomersViewProps) {
  const [density, setDensity] = useTableDensity('fortifai_customers_density_v1');
  const densityCls = TABLE_DENSITY_CLASSES[density];

  const [search, setSearch] = useState('');
  const [sortState, setSortState] = useState<ColumnSortState | null>(null);

  // Per-column header filters (null = all values / inactive)
  const [accountFilter, setAccountFilter] = useState<string[] | null>(null);
  const [tierFilter, setTierFilter] = useState<string[] | null>(null);
  const [personaFilter, setPersonaFilter] = useState<string[] | null>(null);
  const [sectorFilter, setSectorFilter] = useState<string[] | null>(null);
  const [contactFilter, setContactFilter] = useState<string[] | null>(null);
  const [regionFilter, setRegionFilter] = useState<string[] | null>(null);
  const [locationFilter, setLocationFilter] = useState<string[] | null>(null);
  const [icpRange, setIcpRange] = useState<NumericFilterRange | null>(null);
  const [stageFilter, setStageFilter] = useState<string[] | null>(null);
  const [ownerFilter, setOwnerFilter] = useState<string[] | null>(null);
  const [deliveryFilter, setDeliveryFilter] = useState<string[] | null>(null);
  const [arrRange, setArrRange] = useState<NumericFilterRange | null>(null);
  const [probRange, setProbRange] = useState<NumericFilterRange | null>(null);
  const [closeQtrFilter, setCloseQtrFilter] = useState<string[] | null>(null);

  const clearAllFilters = () => {
    setSearch('');
    setSortState(null);
    setAccountFilter(null);
    setTierFilter(null);
    setPersonaFilter(null);
    setSectorFilter(null);
    setContactFilter(null);
    setRegionFilter(null);
    setLocationFilter(null);
    setIcpRange(null);
    setStageFilter(null);
    setOwnerFilter(null);
    setDeliveryFilter(null);
    setArrRange(null);
    setProbRange(null);
    setCloseQtrFilter(null);
  };

  // Apply deep-link filter presets when arriving from Customer Analytics
  useEffect(() => {
    if (!presetFilter) return;
    setSearch('');
    setSortState(null);
    setAccountFilter(null);
    setPersonaFilter(null);
    setContactFilter(null);
    setLocationFilter(null);
    setIcpRange(null);
    setStageFilter(null);
    setOwnerFilter(null);
    setDeliveryFilter(null);
    setArrRange(null);
    setProbRange(null);
    setCloseQtrFilter(null);

    setRegionFilter(
      presetFilter.region && presetFilter.region !== 'All' ? [presetFilter.region] : null
    );
    setTierFilter(
      presetFilter.tier && presetFilter.tier !== 'All' ? [presetFilter.tier] : null
    );
    setSectorFilter(
      presetFilter.sector && presetFilter.sector !== 'All' ? [presetFilter.sector] : null
    );
  }, [presetFilter]);

  // Build distinct options from the full unfiltered customers list
  const columnOptions = useMemo(() => {
    return {
      accounts: buildOptions(customers.map((c) => c.organization || 'Unnamed Account')),
      tiers: buildOptions(customers.map((c) => c.tier || 'Tier I')),
      personas: buildOptions(customers.map((c) => c.buyer_persona || 'Other')),
      sectors: buildOptions(customers.map((c) => c.industry || 'Unspecified')),
      contacts: buildOptions(customers.map((c) => c.full_name || 'Unnamed Contact')),
      regions: buildOptions(customers.map((c) => c.region || 'Other')),
      locations: buildOptions(customers.map((c) => c.location || 'Unspecified')),
      stages: buildOptions(customers.map((c) => c.stage || '1 Lead')),
      owners: buildOptions(customers.map((c) => c.owner || 'Unassigned')),
      deliveries: buildOptions(
        customers.map((c) => getDeliveryFilterKey(c)),
        getDeliveryFilterLabel
      ),
      closeQtrs: buildOptions(customers.map((c) => c.expected_close || 'Q2 2027')),
    };
  }, [customers]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (search.trim()) count++;
    if (accountFilter !== null) count++;
    if (tierFilter !== null) count++;
    if (personaFilter !== null) count++;
    if (sectorFilter !== null) count++;
    if (contactFilter !== null) count++;
    if (regionFilter !== null) count++;
    if (locationFilter !== null) count++;
    if (icpRange && (icpRange.min !== undefined || icpRange.max !== undefined)) count++;
    if (stageFilter !== null) count++;
    if (ownerFilter !== null) count++;
    if (deliveryFilter !== null) count++;
    if (arrRange && (arrRange.min !== undefined || arrRange.max !== undefined)) count++;
    if (probRange && (probRange.min !== undefined || probRange.max !== undefined)) count++;
    if (closeQtrFilter !== null) count++;
    return count;
  }, [
    search,
    accountFilter,
    tierFilter,
    personaFilter,
    sectorFilter,
    contactFilter,
    regionFilter,
    locationFilter,
    icpRange,
    stageFilter,
    ownerFilter,
    deliveryFilter,
    arrRange,
    probRange,
    closeQtrFilter,
  ]);

  const filteredAndSortedCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = customers.filter((c) => {
      if (q) {
        const matchesSearch =
          c.full_name.toLowerCase().includes(q) ||
          c.organization.toLowerCase().includes(q) ||
          c.title.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.location.toLowerCase().includes(q) ||
          (c.industry || '').toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }
      if (accountFilter !== null && !accountFilter.includes(c.organization || 'Unnamed Account')) {
        return false;
      }
      if (tierFilter !== null && !tierFilter.includes(c.tier || 'Tier I')) {
        return false;
      }
      if (personaFilter !== null && !personaFilter.includes(c.buyer_persona || 'Other')) {
        return false;
      }
      if (sectorFilter !== null && !sectorFilter.includes(c.industry || 'Unspecified')) {
        return false;
      }
      if (contactFilter !== null && !contactFilter.includes(c.full_name || 'Unnamed Contact')) {
        return false;
      }
      if (regionFilter !== null && !regionFilter.includes(c.region || 'Other')) {
        return false;
      }
      if (locationFilter !== null && !locationFilter.includes(c.location || 'Unspecified')) {
        return false;
      }
      if (!matchesNumeric(c.icp_score ?? 0, icpRange)) {
        return false;
      }
      if (stageFilter !== null && !stageFilter.includes(c.stage || '1 Lead')) {
        return false;
      }
      if (ownerFilter !== null && !ownerFilter.includes(c.owner || 'Unassigned')) {
        return false;
      }
      if (deliveryFilter !== null && !deliveryFilter.includes(getDeliveryFilterKey(c))) {
        return false;
      }
      if (!matchesNumeric(c.amount_usd || 0, arrRange)) {
        return false;
      }
      if (!matchesNumeric(c.probability ?? 0, probRange)) {
        return false;
      }
      if (closeQtrFilter !== null && !closeQtrFilter.includes(c.expected_close || 'Q2 2027')) {
        return false;
      }
      return true;
    });

    if (!sortState) return list;

    const dir = sortState.direction === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      switch (sortState.key) {
        case 'account':
          return a.organization.localeCompare(b.organization) * dir;
        case 'sector':
          return (a.industry || '').localeCompare(b.industry || '') * dir;
        case 'contact':
          return a.full_name.localeCompare(b.full_name) * dir;
        case 'location':
          return a.location.localeCompare(b.location) * dir;
        case 'icp_score':
          return ((a.icp_score ?? 0) - (b.icp_score ?? 0)) * dir;
        case 'stage':
          return a.stage.localeCompare(b.stage) * dir;
        case 'owner':
          return (a.owner || '').localeCompare(b.owner || '') * dir;
        case 'delivery_status':
          return (
            getDeliveryFilterLabel(getDeliveryFilterKey(a)).localeCompare(
              getDeliveryFilterLabel(getDeliveryFilterKey(b))
            ) * dir
          );
        case 'amount_usd':
          return ((a.amount_usd || 0) - (b.amount_usd || 0)) * dir;
        case 'probability':
          return ((a.probability ?? 0) - (b.probability ?? 0)) * dir;
        case 'expected_close':
          return (a.expected_close || 'Q2 2027').localeCompare(b.expected_close || 'Q2 2027') * dir;
        default:
          return 0;
      }
    });
  }, [
    customers,
    search,
    accountFilter,
    tierFilter,
    personaFilter,
    sectorFilter,
    contactFilter,
    regionFilter,
    locationFilter,
    icpRange,
    stageFilter,
    ownerFilter,
    deliveryFilter,
    arrRange,
    probRange,
    closeQtrFilter,
    sortState,
  ]);

  const totalArr = filteredAndSortedCustomers.reduce((sum, c) => sum + (c.amount_usd || 0), 0);
  const weightedArr = filteredAndSortedCustomers.reduce(
    (sum, c) => sum + ((c.amount_usd || 0) * (c.probability || 0)) / 100,
    0
  );
  const activeCount = filteredAndSortedCustomers.filter(
    (c) => !c.omit_from_pipeline && c.stage !== '9 No response'
  ).length;
  const closedWonCount = filteredAndSortedCustomers.filter(
    (c) => c.stage === '7 Closed Won'
  ).length;
  const closedLostCount = filteredAndSortedCustomers.filter(
    (c) => c.stage === '9 No response'
  ).length;
  const decidedCount = closedWonCount + closedLostCount;
  const weightedWinProbPct = totalArr > 0 ? Math.round((weightedArr / totalArr) * 100) : 0;
  const closedWinRatePct =
    decidedCount > 0 ? Math.round((closedWonCount / decidedCount) * 100) : null;
  const winRateDisplayPct = closedWinRatePct !== null ? closedWinRatePct : weightedWinProbPct;
  const avgAcv =
    filteredAndSortedCustomers.length > 0
      ? Math.round(totalArr / filteredAndSortedCustomers.length)
      : 0;
  const avgIcpScore =
    filteredAndSortedCustomers.length > 0
      ? Math.round(
          filteredAndSortedCustomers.reduce((sum, c) => sum + (c.icp_score || 0), 0) /
            filteredAndSortedCustomers.length
        )
      : 0;

  const [insightsOpen, setInsightsOpen] = useState(false);

  const dbMetrics = useMemo(() => {
    const scopeList = customers;
    const totalContacts = scopeList.length;
    const uniqueOrgs = new Set(scopeList.map((c) => (c.organization || "").trim().toLowerCase()).filter(Boolean)).size;
    const tier1Count = scopeList.filter((c) => (c.tier || "Tier I") === "Tier I").length;
    const tier1Pct = totalContacts > 0 ? Math.round((tier1Count / totalContacts) * 100) : 0;
    const f500Count = scopeList.filter((c) => c.fortune_500).length;

    const scored = scopeList.filter((c) => (c.icp_score ?? 0) > 0);
    const avgIcp = scored.length > 0
      ? Math.round(scored.reduce((s, c) => s + (c.icp_score || 0), 0) / scored.length)
      : 0;
    const eliteIcpCount = scopeList.filter((c) => (c.icp_score ?? 0) >= 85).length;

    const uncontactedCount = scopeList.filter((c) => !c.delivery_status || c.delivery_status === "not_sent").length;
    const uncontactedPct = totalContacts > 0 ? Math.round((uncontactedCount / totalContacts) * 100) : 0;
    const engagedCount = scopeList.filter((c) =>
      ["opened", "portal_visited", "replied"].includes(c.delivery_status || "") || c.email_opened || c.portal_visited
    ).length;

    // Persona breakdown (CFO, CCO/GC, CPO, CAE)
    const personas = ["CFO", "CCO/GC", "CPO", "CAE"];
    const byPersona = personas.map((p) => {
      const grp = scopeList.filter((c) => c.buyer_persona === p);
      const t1 = grp.filter((c) => (c.tier || "Tier I") === "Tier I").length;
      return { persona: p, count: grp.length, tier1: t1, pct: totalContacts > 0 ? Math.round((grp.length / totalContacts) * 100) : 0 };
    });

    // Top 6 Sectors
    const secMap = new Map<string, { count: number; tier1: number; avgScore: number }>();
    scopeList.forEach((c) => {
      const sec = c.industry?.trim() || "Unspecified";
      const cur = secMap.get(sec) || { count: 0, tier1: 0, avgScore: 0 };
      cur.count += 1;
      if ((c.tier || "Tier I") === "Tier I") cur.tier1 += 1;
      cur.avgScore += c.icp_score || 0;
      secMap.set(sec, cur);
    });
    const topSectors = Array.from(secMap.entries())
      .map(([sector, st]) => ({
        sector,
        count: st.count,
        tier1: st.tier1,
        avgScore: st.count > 0 ? Math.round(st.avgScore / st.count) : 0,
        pct: totalContacts > 0 ? Math.round((st.count / totalContacts) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    // Multi-threading depth (accounts with >=2 contacts vs single-threaded)
    const orgCounts = new Map<string, number>();
    scopeList.forEach((c) => {
      const k = (c.organization || "").trim().toLowerCase();
      if (k) orgCounts.set(k, (orgCounts.get(k) || 0) + 1);
    });
    const multiThreadedOrgs = Array.from(orgCounts.values()).filter((n) => n >= 2).length;

    return {
      totalContacts,
      uniqueOrgs,
      tier1Count,
      tier1Pct,
      f500Count,
      avgIcp,
      eliteIcpCount,
      uncontactedCount,
      uncontactedPct,
      engagedCount,
      byPersona,
      topSectors,
      multiThreadedOrgs,
    };
  }, [customers]);

  return (
    <div className="p-6 space-y-5 max-w-[1600px] w-full mx-auto">
      {/* Persistent Key Metrics Summary Strip */}
      {/* Enterprise Account Database KPI Strip (Zero Pipeline Overlap) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-[#E2E8F0] rounded-[6px] px-3.5 py-3">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-mono uppercase tracking-wider text-slate-500">
              Target Accounts &amp; Contacts
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-[#E2E8F0]">
              {dbMetrics.multiThreadedOrgs} multi-threaded
            </span>
          </div>
          <div className="text-2xl font-mono font-semibold text-slate-900 mt-1 tabular-nums">
            {dbMetrics.uniqueOrgs.toLocaleString()} <span className="text-xs font-sans font-normal text-slate-500">orgs</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
            {dbMetrics.totalContacts.toLocaleString()} buying committee contacts ({dbMetrics.uniqueOrgs > 0 ? (dbMetrics.totalContacts / dbMetrics.uniqueOrgs).toFixed(1) : "0"} / org)
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-[6px] px-3.5 py-3">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-mono uppercase tracking-wider text-slate-500">
              Tier I &amp; Fortune 500 Mix
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
              {dbMetrics.tier1Pct}% Tier I
            </span>
          </div>
          <div className="text-2xl font-mono font-semibold text-slate-900 mt-1 tabular-nums">
            {dbMetrics.tier1Count.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
            {dbMetrics.f500Count.toLocaleString()} Fortune 500 enterprise contacts
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-[6px] px-3.5 py-3">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-mono uppercase tracking-wider text-slate-500">
              ICP Fit &amp; High-Priority Cohort
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
              {dbMetrics.eliteIcpCount} score ≥85
            </span>
          </div>
          <div className="text-2xl font-mono font-semibold text-slate-900 mt-1 tabular-nums">
            {dbMetrics.avgIcp}<span className="text-sm text-slate-400">/100</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
            Mean ICP fit across filtered account database
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-[6px] px-3.5 py-3">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-mono uppercase tracking-wider text-slate-500">
              Outbound Whitespace
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
              {dbMetrics.uncontactedPct}% untouched
            </span>
          </div>
          <div className="text-2xl font-mono font-semibold text-slate-900 mt-1 tabular-nums">
            {dbMetrics.uncontactedCount.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
            Uncontacted targets · {dbMetrics.engagedCount} engaged signals
          </div>
        </div>
      </div>

      {/* Collapsible Database Insights Section (Collapsed by Default so Account List stays Hero) */}
      <div className="bg-white border border-[#E2E8F0] rounded-[6px] overflow-hidden">
        <button
          type="button"
          onClick={() => setInsightsOpen((prev) => !prev)}
          aria-expanded={insightsOpen}
          className="w-full px-4 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Layers size={14} className="text-[#2E5A8A] shrink-0" />
            <span className="text-[12.5px] font-semibold text-slate-900">
              Database Insights &amp; Buying Committee Analytics
            </span>
            <span className="hidden sm:inline text-[11px] font-mono text-slate-500 truncate">
              · {dbMetrics.byPersona.map((p) => `${p.persona} (${p.count})`).join(" · ")}
            </span>
          </div>
          <span className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-600 shrink-0">
            {insightsOpen ? "Collapse" : "Expand"}
            {insightsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        </button>

        {insightsOpen && (
          <div className="p-4 border-t border-[#E2E8F0] bg-slate-50/50 grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Column 1: Buying Committee Persona Distribution */}
            <div className="bg-white border border-[#E2E8F0] rounded-[6px] p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10.5px] font-mono uppercase tracking-wider text-slate-500">
                  Buying Committee Personas
                </span>
                <Users size={13} className="text-slate-400" />
              </div>
              <div className="space-y-2">
                {dbMetrics.byPersona.map((row) => (
                  <div key={row.persona} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-800">{row.persona}</span>
                      <span className="font-mono text-[11px] text-slate-600 tabular-nums">
                        {row.count} ({row.pct}%) · {row.tier1} Tier I
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#2E5A8A] rounded-full"
                        style={{ width: `${Math.max(4, row.pct)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Column 2: Top Industry Sectors */}
            <div className="bg-white border border-[#E2E8F0] rounded-[6px] p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10.5px] font-mono uppercase tracking-wider text-slate-500">
                  Top Industry Sectors
                </span>
                <Target size={13} className="text-slate-400" />
              </div>
              <div className="space-y-2">
                {dbMetrics.topSectors.map((sec) => (
                  <div key={sec.sector} className="space-y-1">
                    <div className="flex items-center justify-between text-xs gap-2">
                      <span className="font-medium text-slate-800 truncate">{sec.sector}</span>
                      <span className="font-mono text-[11px] text-slate-600 shrink-0 tabular-nums">
                        {sec.count} ({sec.pct}%) · ICP {sec.avgScore}
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-600 rounded-full"
                        style={{ width: `${Math.max(4, sec.pct)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Column 3: Enterprise GTM Wedge & Threading Readiness */}
            <div className="bg-white border border-[#E2E8F0] rounded-[6px] p-3.5 flex flex-col justify-between space-y-3">
              <div>
                <div className="text-[10.5px] font-mono uppercase tracking-wider text-slate-500 mb-2">
                  Enterprise Account Coverage
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 rounded-[5px] bg-slate-50 border border-[#E2E8F0]">
                    <div className="text-[10px] font-mono text-slate-500">MULTI-THREADED ORGS</div>
                    <div className="text-base font-mono font-semibold text-slate-900 mt-0.5 tabular-nums">
                      {dbMetrics.multiThreadedOrgs}
                    </div>
                    <div className="text-[10px] text-slate-500">≥2 executives mapped</div>
                  </div>
                  <div className="p-2.5 rounded-[5px] bg-slate-50 border border-[#E2E8F0]">
                    <div className="text-[10px] font-mono text-slate-500">SINGLE-THREADED</div>
                    <div className="text-base font-mono font-semibold text-slate-900 mt-0.5 tabular-nums">
                      {Math.max(0, dbMetrics.uniqueOrgs - dbMetrics.multiThreadedOrgs)}
                    </div>
                    <div className="text-[10px] text-slate-500">Expand buying committee</div>
                  </div>
                </div>
              </div>
              <div className="p-2.5 rounded-[5px] bg-indigo-50/70 border border-indigo-200/80 text-[11px] text-slate-700 leading-snug">
                <strong className="text-slate-900">Land-and-Expand Play:</strong> Lead with CFO/CAE on 100% ERP leakage recovery, then expand to CCO/GC &amp; CPO on the same zero-egress connector.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Compact Utility Bar (No filter stripe, no manage/add columns) */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search account, sector, contact, location..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-[#E2E8F0] rounded-md focus:outline-none focus:bg-white focus:border-slate-400"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          {(activeFilterCount > 0 || sortState !== null) && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md hover:bg-indigo-100 transition-colors whitespace-nowrap"
            >
              <RotateCcw size={12} />
              Clear Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </button>
          )}

          

          <span className="text-slate-400 tabular-nums whitespace-nowrap">
            Showing <strong className="text-slate-700">{filteredAndSortedCustomers.length}</strong>{' '}
            of {customers.length} accounts
          </span>
        </div>
      </div>

      {/* Data Table (Fixed Columns matching Customer Sheet) */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[#E2E8F0] bg-slate-50/50 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-slate-900">
              <CmsText
                id="customers.table.title"
                defaultValue="Enterprise Accounts"
                section="Accounts & Targets"
              />
            </span>
            <span className="text-slate-400 tabular-nums">
              {filteredAndSortedCustomers.length} of {customers.length} shown
            </span>
          </div>
          <TableDensityToggle value={density} onChange={setDensity} />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-[#E2E8F0] text-[11px] font-semibold tracking-wider text-slate-500">
                <ColumnFilterHeader
                  columnKey="account"
                  label="Account & Tier"
                  thClassName={densityCls.headerCell}
                  mode="categorical"
                  sortState={sortState}
                  onChangeSort={setSortState}
                  options={columnOptions.accounts}
                  selectedValues={accountFilter}
                  onChangeSelectedValues={setAccountFilter}
                  subFacets={[
                    {
                      id: 'tier',
                      label: 'Tier',
                      options: columnOptions.tiers,
                      selectedValues: tierFilter,
                      onChange: setTierFilter,
                    },
                    {
                      id: 'persona',
                      label: 'Buyer Persona',
                      options: columnOptions.personas,
                      selectedValues: personaFilter,
                      onChange: setPersonaFilter,
                    },
                  ]}
                />
                <ColumnFilterHeader
                  columnKey="sector"
                  label="Sector"
                  thClassName={densityCls.headerCell}
                  mode="categorical"
                  sortState={sortState}
                  onChangeSort={setSortState}
                  options={columnOptions.sectors}
                  selectedValues={sectorFilter}
                  onChangeSelectedValues={setSectorFilter}
                />
                <ColumnFilterHeader
                  columnKey="contact"
                  label="Executive Contact"
                  thClassName={densityCls.headerCell}
                  mode="categorical"
                  sortState={sortState}
                  onChangeSort={setSortState}
                  options={columnOptions.contacts}
                  selectedValues={contactFilter}
                  onChangeSelectedValues={setContactFilter}
                />
                <ColumnFilterHeader
                  columnKey="location"
                  label="Location"
                  thClassName={densityCls.headerCell}
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
                      selectedValues: regionFilter,
                      onChange: setRegionFilter,
                    },
                  ]}
                />
                <ColumnFilterHeader
                  columnKey="icp_score"
                  label="ICP Score"
                  thClassName={densityCls.headerCell}
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
                  columnKey="stage"
                  label="Stage (Inline)"
                  thClassName={densityCls.headerCell}
                  mode="categorical"
                  sortState={sortState}
                  onChangeSort={setSortState}
                  options={columnOptions.stages}
                  selectedValues={stageFilter}
                  onChangeSelectedValues={setStageFilter}
                />
                <ColumnFilterHeader
                  columnKey="owner"
                  label="Deal Owner"
                  thClassName={densityCls.headerCell}
                  mode="categorical"
                  sortState={sortState}
                  onChangeSort={setSortState}
                  options={columnOptions.owners}
                  selectedValues={ownerFilter}
                  onChangeSelectedValues={setOwnerFilter}
                />
                <ColumnFilterHeader
                  columnKey="delivery_status"
                  label="Delivery Status"
                  thClassName={densityCls.headerCell}
                  mode="categorical"
                  sortState={sortState}
                  onChangeSort={setSortState}
                  options={columnOptions.deliveries}
                  selectedValues={deliveryFilter}
                  onChangeSelectedValues={setDeliveryFilter}
                />
                <ColumnFilterHeader
                  columnKey="amount_usd"
                  label="Target ARR"
                  thClassName={densityCls.headerCell}
                  mode="numeric"
                  sortState={sortState}
                  onChangeSort={setSortState}
                  numericRange={arrRange}
                  onChangeNumericRange={setArrRange}
                  numericPlaceholder={{ min: '0', max: 'Max' }}
                  numericPresets={[
                    { label: '$100K+', min: 100000 },
                    { label: '$250K+', min: 250000 },
                    { label: '$500K+', min: 500000 },
                    { label: '$1M+', min: 1000000 },
                  ]}
                />
                <ColumnFilterHeader
                  columnKey="probability"
                  label="Prob %"
                  thClassName={densityCls.headerCell}
                  mode="numeric"
                  sortState={sortState}
                  onChangeSort={setSortState}
                  numericRange={probRange}
                  onChangeNumericRange={setProbRange}
                  numericPlaceholder={{ min: '0', max: '100' }}
                  numericPresets={[
                    { label: '≥ 75%', min: 75 },
                    { label: '50%+', min: 50 },
                    { label: '< 50%', max: 49 },
                  ]}
                />
                <ColumnFilterHeader
                  columnKey="expected_close"
                  label="Close Qtr"
                  thClassName={densityCls.headerCell}
                  mode="categorical"
                  sortState={sortState}
                  onChangeSort={setSortState}
                  options={columnOptions.closeQtrs}
                  selectedValues={closeQtrFilter}
                  onChangeSelectedValues={setCloseQtrFilter}
                />
                <th className={`${densityCls.headerCell} text-right`}>Actions</th>
              </tr>
            </thead>
            {filteredAndSortedCustomers.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={12} className="p-10 text-center space-y-2.5 text-xs">
                    <div className="font-medium text-slate-700">
                      No enterprise accounts match the active column filters.
                    </div>
                    <button
                      type="button"
                      onClick={clearAllFilters}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-medium"
                    >
                      Reset Column Filters
                    </button>
                  </td>
                </tr>
              </tbody>
            ) : (
              <tbody className={`divide-y divide-slate-100 tabular-nums ${densityCls.rowText}`}>
                {filteredAndSortedCustomers.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => onSelectContact(c.id)}
                    className="hover:bg-slate-50/90 cursor-pointer transition-colors"
                  >
                    <td className={densityCls.bodyCell}>
                      <div className="font-medium text-slate-900 flex items-center gap-1.5">
                        {c.organization}
                        {c.fortune_500 && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded font-medium">
                            F500
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {c.buyer_persona} · {c.tier || 'Tier I'}
                      </div>
                    </td>
                    <td className={densityCls.bodyCell} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        disabled={!canEdit}
                        aria-label={`Sector for ${c.organization}`}
                        value={c.industry || ''}
                        placeholder="Sector..."
                        onChange={(e) => onUpdateContact(c.id, { industry: e.target.value })}
                        className="w-32 text-xs bg-transparent border border-transparent hover:border-slate-200 focus:border-slate-400 focus:bg-white rounded px-1.5 py-1 text-slate-700 focus:outline-none disabled:opacity-70"
                      />
                    </td>
                    <td className={densityCls.bodyCell}>
                      <div className="font-medium text-slate-800">{c.full_name}</div>
                      <div className="text-[11px] text-slate-500">{c.title}</div>
                    </td>
                    <td className={densityCls.bodyCell}>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${getRegionBadgeStyle(
                          c.region
                        )}`}
                      >
                        {c.region}
                      </span>
                      <div className="text-[10px] text-slate-400 mt-0.5">{c.location}</div>
                    </td>
                    <td className={densityCls.bodyCell} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        disabled={!canEdit}
                        aria-label={`ICP Score for ${c.organization}`}
                        value={c.icp_score ?? 0}
                        onChange={(e) =>
                          onUpdateContact(c.id, {
                            icp_score: Math.min(100, Math.max(0, Number(e.target.value))),
                          })
                        }
                        className="w-14 text-xs font-semibold text-emerald-700 bg-transparent border border-transparent hover:border-slate-200 focus:border-slate-400 focus:bg-white rounded px-1.5 py-1 focus:outline-none disabled:opacity-70"
                      />
                    </td>
                    <td className={densityCls.bodyCell} onClick={(e) => e.stopPropagation()}>
                      <select
                        value={c.stage}
                        disabled={!canEdit}
                        onChange={(e) => {
                          const nextStage = e.target.value;
                          const defaultProb =
                            nextStage === '7 Closed Won'
                              ? 100
                              : nextStage === '6 Commercial / Contracting'
                              ? 75
                              : nextStage === '5 Internal Review Pending'
                              ? 50
                              : nextStage === '4 Decisionmaker buy in'
                              ? 30
                              : nextStage === '2 Qualified'
                              ? 20
                              : 0;
                          onUpdateContact(c.id, { stage: nextStage, probability: defaultProb });
                        }}
                        className={`text-[11px] font-medium rounded-full px-2.5 py-1 border cursor-pointer focus:outline-none disabled:opacity-70 disabled:cursor-not-allowed ${getStageBadgeStyle(
                          c.stage
                        )}`}
                      >
                        {CUSTOMER_STAGES.filter((s) => s !== 'All').map((st) => (
                          <option key={st} value={st} className="bg-white text-slate-800">
                            {st}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className={densityCls.bodyCell} onClick={(e) => e.stopPropagation()}>
                      <select
                        value={c.owner_id || ''}
                        disabled={!canEdit}
                        aria-label={`Deal owner for ${c.organization}`}
                        onChange={(e) => {
                          const selected = activeUsers.find((u) => u.id === e.target.value);
                          if (!selected) return;
                          onUpdateContact(c.id, {
                            owner_id: selected.id,
                            owner_email: selected.email,
                            owner: selected.full_name,
                          });
                        }}
                        className="text-xs bg-slate-50 border border-[#E2E8F0] hover:border-slate-300 focus:border-slate-500 rounded px-2 py-1 text-slate-800 focus:outline-none disabled:opacity-70"
                      >
                        {!activeUsers.some((u) => u.id === c.owner_id) && (
                          <option value={c.owner_id || ''}>
                            {c.owner ? `${c.owner} (Reassign)` : 'Assign Active Owner'}
                          </option>
                        )}
                        {activeUsers.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.full_name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className={densityCls.bodyCell}>
                      <DeliveryStatusBadge
                        status={c.delivery_status}
                        openedAt={c.opened_at}
                        openedDurationSec={c.opened_duration_sec}
                        bouncedReason={c.bounced_reason}
                      />
                    </td>
                    <td className={densityCls.bodyCell} onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-0.5 font-medium text-slate-900">
                        <span className="text-slate-400">$</span>
                        <input
                          type="number"
                          step={25000}
                          disabled={!canEdit}
                          aria-label={`Target ARR for ${c.organization}`}
                          value={c.amount_usd || 0}
                          onChange={(e) =>
                            onUpdateContact(c.id, { amount_usd: Number(e.target.value) })
                          }
                          className="w-20 bg-transparent border border-transparent hover:border-slate-200 focus:border-slate-400 focus:bg-white rounded px-1 py-0.5 focus:outline-none disabled:opacity-70"
                        />
                      </div>
                    </td>
                    <td className={densityCls.bodyCell} onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-0.5 text-slate-700">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={5}
                          disabled={!canEdit}
                          aria-label={`Probability for ${c.organization}`}
                          value={c.probability ?? 0}
                          onChange={(e) =>
                            onUpdateContact(c.id, {
                              probability: Math.min(100, Math.max(0, Number(e.target.value))),
                            })
                          }
                          className="w-12 bg-transparent border border-transparent hover:border-slate-200 focus:border-slate-400 focus:bg-white rounded px-1 py-0.5 focus:outline-none disabled:opacity-70"
                        />
                        <span className="text-slate-400">%</span>
                      </div>
                    </td>
                    <td className={densityCls.bodyCell} onClick={(e) => e.stopPropagation()}>
                      <select
                        value={c.expected_close || 'Q2 2027'}
                        disabled={!canEdit}
                        onChange={(e) =>
                          onUpdateContact(c.id, { expected_close: e.target.value as Quarter })
                        }
                        className="text-xs bg-transparent border border-transparent hover:border-slate-200 focus:border-slate-400 rounded px-1.5 py-1 text-slate-700 focus:outline-none disabled:opacity-70"
                      >
                        {QUARTERS.map((q) => (
                          <option key={q} value={q}>
                            {q}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className={`${densityCls.bodyCell} text-right`}>
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenAccountIntelligence(c);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded hover:bg-indigo-100 whitespace-nowrap"
                          title={`Open AI Customer Intelligence Dossier for ${c.organization}`}
                        >
                          <Sparkles size={11} />
                          Account Intelligence
                        </button>
                        <span className="inline-flex items-center gap-1">
                          <button
                          type="button"
                          disabled={!canSendCampaigns}
                          onClick={(e) => {
                            e.stopPropagation();
                            onComposeEmail(c);
                          }}
                          title={!canSendCampaigns ? 'Requires can_send_campaigns permission' : undefined}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                          <Mail size={12} />
                          Email
                        </button>
                          {canEdit && onDeleteContact && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (window.confirm(`Delete ${c.full_name} (${c.organization})?`)) {
                                  onDeleteContact(c.id);
                                }
                              }}
                              title="Delete account"
                              className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
