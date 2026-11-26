import { useEffect, useMemo, useState } from 'react';
import { Trash2, ChevronLeft, ChevronRight, Mail, RotateCcw, Search, ShieldAlert } from "lucide-react";
import type { Contact, CrmUser, DeliveryStatus } from '../../types/crm';
import { INVESTOR_STAGES } from '../../data/seedData';
import { formatCurrency, getRegionBadgeStyle, getStageBadgeStyle } from '../../utils/crmHelpers';
import {
  ColumnFilterHeader,
  type CategoricalOption,
  type ColumnSortState,
  type NumericFilterRange,
} from '../ColumnFilterHeader';
import { DeliveryStatusBadge } from '../DeliveryStatusBadge';
import { KeyMetricsStrip } from '../KeyMetricsStrip';
import { CmsText } from '../CmsText';
import {
  TABLE_DENSITY_CLASSES,
  TableDensityToggle,
  useTableDensity,
} from '../TableDensityToggle';

interface InvestorsViewProps {
  canEdit: boolean;
  canSendCampaigns: boolean;
  investors: Contact[];
  activeUsers: CrmUser[];
  onSelectContact: (id: string) => void;
  onUpdateContact: (id: string, patch: Partial<Contact>) => void;
  onDeleteContact?: (id: string) => void;
  onComposeEmail: (contact: Contact) => void;
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

function getHookStateKey(inv: Contact): string {
  if (inv.custom_hook?.trim()) return 'custom_hook';
  if (inv.thesis_fit?.trim()) return 'thesis_fit';
  return 'none';
}

function getHookStateLabel(key: string): string {
  if (key === 'custom_hook') return 'Has Custom Opening Hook';
  if (key === 'thesis_fit') return 'Thesis Fit Fallback';
  return 'No Hook Recorded';
}

export function InvestorsView({
  canEdit,
  canSendCampaigns,
  investors,
  activeUsers,
  onSelectContact,
  onUpdateContact,
  onDeleteContact,
  onComposeEmail,
}: InvestorsViewProps) {
  const [density, setDensity] = useTableDensity('fortifai_investors_density_v1');
  const densityCls = TABLE_DENSITY_CLASSES[density];
  const [pageSize, setPageSize] = useState<25 | 50 | 100>(25);
  const [currentPage, setCurrentPage] = useState(1);

  const [search, setSearch] = useState('');
  const [sortState, setSortState] = useState<ColumnSortState | null>(null);

  // Per-column header filters (null = all values / inactive)
  const [fundFilter, setFundFilter] = useState<string[] | null>(null);
  const [regionFilter, setRegionFilter] = useState<string[] | null>(null);
  const [cityFilter, setCityFilter] = useState<string[] | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<string[] | null>(null);
  const [waveFilter, setWaveFilter] = useState<string[] | null>(null);
  const [stageFilter, setStageFilter] = useState<string[] | null>(null);
  const [ownerFilter, setOwnerFilter] = useState<string[] | null>(null);
  const [deliveryFilter, setDeliveryFilter] = useState<string[] | null>(null);
  const [checkRange, setCheckRange] = useState<NumericFilterRange | null>(null);
  const [hookStatusFilter, setHookStatusFilter] = useState<string[] | null>(null);
  const [hookTextFilter, setHookTextFilter] = useState<string[] | null>(null);

  const clearAllFilters = () => {
    setSearch('');
    setSortState(null);
    setFundFilter(null);
    setRegionFilter(null);
    setCityFilter(null);
    setPriorityFilter(null);
    setWaveFilter(null);
    setStageFilter(null);
    setOwnerFilter(null);
    setDeliveryFilter(null);
    setCheckRange(null);
    setHookStatusFilter(null);
    setHookTextFilter(null);
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [
    search,
    sortState,
    fundFilter,
    regionFilter,
    cityFilter,
    priorityFilter,
    waveFilter,
    stageFilter,
    ownerFilter,
    deliveryFilter,
    checkRange,
    hookStatusFilter,
    hookTextFilter,
    pageSize,
  ]);

  const columnOptions = useMemo(() => {
    return {
      funds: buildOptions(investors.map((inv) => inv.organization || 'Unnamed Fund')),
      regions: buildOptions(investors.map((inv) => inv.region || 'Other')),
      cities: buildOptions(investors.map((inv) => inv.location || 'Unspecified')),
      priorities: buildOptions(investors.map((inv) => inv.priority_tier || 'P4')),
      waves: buildOptions(investors.map((inv) => inv.execution_wave || 'Unassigned')),
      stages: buildOptions(investors.map((inv) => inv.stage || 'Target')),
      owners: buildOptions(investors.map((inv) => inv.owner || 'Unassigned')),
      deliveries: buildOptions(
        investors.map((inv) => getDeliveryFilterKey(inv)),
        getDeliveryFilterLabel
      ),
      hookStatuses: buildOptions(
        investors.map((inv) => getHookStateKey(inv)),
        getHookStateLabel
      ),
      hookTexts: buildOptions(
        investors.map((inv) => inv.custom_hook || inv.thesis_fit || '—')
      ),
    };
  }, [investors]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (search.trim()) count++;
    if (fundFilter !== null) count++;
    if (regionFilter !== null) count++;
    if (cityFilter !== null) count++;
    if (priorityFilter !== null) count++;
    if (waveFilter !== null) count++;
    if (stageFilter !== null) count++;
    if (ownerFilter !== null) count++;
    if (deliveryFilter !== null) count++;
    if (checkRange && (checkRange.min !== undefined || checkRange.max !== undefined)) count++;
    if (hookStatusFilter !== null) count++;
    if (hookTextFilter !== null) count++;
    return count;
  }, [
    search,
    fundFilter,
    regionFilter,
    cityFilter,
    priorityFilter,
    waveFilter,
    stageFilter,
    ownerFilter,
    deliveryFilter,
    checkRange,
    hookStatusFilter,
    hookTextFilter,
  ]);

  const filteredAndSortedInvestors = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = investors.filter((inv) => {
      if (q) {
        const matchesSearch =
          inv.full_name.toLowerCase().includes(q) ||
          inv.organization.toLowerCase().includes(q) ||
          inv.title.toLowerCase().includes(q) ||
          inv.email.toLowerCase().includes(q) ||
          inv.location.toLowerCase().includes(q) ||
          (inv.thesis_fit || '').toLowerCase().includes(q) ||
          (inv.custom_hook || '').toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }
      if (fundFilter !== null && !fundFilter.includes(inv.organization || 'Unnamed Fund')) {
        return false;
      }
      if (regionFilter !== null && !regionFilter.includes(inv.region || 'Other')) {
        return false;
      }
      if (cityFilter !== null && !cityFilter.includes(inv.location || 'Unspecified')) {
        return false;
      }
      if (priorityFilter !== null && !priorityFilter.includes(inv.priority_tier || 'P4')) {
        return false;
      }
      if (waveFilter !== null && !waveFilter.includes(inv.execution_wave || 'Unassigned')) {
        return false;
      }
      if (stageFilter !== null && !stageFilter.includes(inv.stage || 'Target')) {
        return false;
      }
      if (ownerFilter !== null && !ownerFilter.includes(inv.owner || 'Unassigned')) {
        return false;
      }
      if (deliveryFilter !== null && !deliveryFilter.includes(getDeliveryFilterKey(inv))) {
        return false;
      }
      if (!matchesNumeric(inv.amount_usd || 0, checkRange)) {
        return false;
      }
      if (hookStatusFilter !== null && !hookStatusFilter.includes(getHookStateKey(inv))) {
        return false;
      }
      if (
        hookTextFilter !== null &&
        !hookTextFilter.includes(inv.custom_hook || inv.thesis_fit || '—')
      ) {
        return false;
      }
      return true;
    });

    if (!sortState) return list;

    const dir = sortState.direction === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      switch (sortState.key) {
        case 'fund':
          return a.organization.localeCompare(b.organization) * dir;
        case 'region':
          return a.region.localeCompare(b.region) * dir;
        case 'priority_track': {
          const prioCmp = (a.priority_tier || 'P4').localeCompare(b.priority_tier || 'P4');
          if (prioCmp !== 0) return prioCmp * dir;
          return (a.execution_wave || '').localeCompare(b.execution_wave || '') * dir;
        }
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
        case 'custom_hook':
          return (
            (a.custom_hook || a.thesis_fit || '').localeCompare(
              b.custom_hook || b.thesis_fit || ''
            ) * dir
          );
        default:
          return 0;
      }
    });
  }, [
    investors,
    search,
    fundFilter,
    regionFilter,
    cityFilter,
    priorityFilter,
    waveFilter,
    stageFilter,
    ownerFilter,
    deliveryFilter,
    checkRange,
    hookStatusFilter,
    hookTextFilter,
    sortState,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedInvestors.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedInvestors = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredAndSortedInvestors.slice(start, start + pageSize);
  }, [filteredAndSortedInvestors, safePage, pageSize]);
  const startRow = filteredAndSortedInvestors.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endRow = Math.min(safePage * pageSize, filteredAndSortedInvestors.length);

  const totalCapitalUsd = filteredAndSortedInvestors.reduce(
    (sum, inv) => sum + (inv.amount_usd || 0),
    0
  );
  const weightedCapitalUsd = filteredAndSortedInvestors.reduce(
    (sum, inv) => sum + ((inv.amount_usd || 0) * (inv.probability || 0)) / 100,
    0
  );
  const committedUsd = filteredAndSortedInvestors
    .filter((inv) => inv.stage === 'SAFE Signed' || inv.outcome === 'Committed')
    .reduce((sum, inv) => sum + (inv.amount_usd || 0), 0);
  const activeCount = filteredAndSortedInvestors.filter(
    (inv) => inv.stage !== 'Passed' && !inv.unsubscribed
  ).length;
  const signedCount = filteredAndSortedInvestors.filter(
    (inv) => inv.stage === 'SAFE Signed' || inv.outcome === 'Committed'
  ).length;
  const passedCount = filteredAndSortedInvestors.filter(
    (inv) => inv.stage === 'Passed' || inv.outcome === 'Pass' || inv.unsubscribed
  ).length;
  const decidedCount = signedCount + passedCount;
  const weightedWinProbPct =
    totalCapitalUsd > 0 ? Math.round((weightedCapitalUsd / totalCapitalUsd) * 100) : 0;
  const decidedWinRatePct =
    decidedCount > 0 ? Math.round((signedCount / decidedCount) * 100) : null;
  const winRateDisplayPct = decidedWinRatePct !== null ? decidedWinRatePct : weightedWinProbPct;
  const avgCheckUsd =
    filteredAndSortedInvestors.length > 0
      ? Math.round(totalCapitalUsd / filteredAndSortedInvestors.length)
      : 0;
  const portalVisitedCount = filteredAndSortedInvestors.filter(
    (inv) =>
      inv.portal_visited ||
      ['Portal Visited', 'Meeting', 'Diligence', 'SAFE Signed'].includes(inv.stage)
  ).length;

  return (
    <div className="p-6 space-y-5 max-w-[1600px] w-full mx-auto">
      {/* Persistent Key Metrics Summary Strip */}
      <KeyMetricsStrip
        title="Key Metrics"
        cmsSection="Investor Pipeline"
        cmsKeyPrefix="investors.kpi"
        scopeSummary={`Live filtered view · ${filteredAndSortedInvestors.length} of ${investors.length} investors`}
        metrics={[
          {
            label: 'Total Target Capital',
            value: formatCurrency(totalCapitalUsd),
            detail: `Weighted ${formatCurrency(weightedCapitalUsd)} · Committed ${formatCurrency(committedUsd)}`,
          },
          {
            label: 'Active Count',
            value: String(activeCount),
            detail: `${filteredAndSortedInvestors.length} filtered · ${investors.length} total investors`,
          },
          {
            label: 'Win Rate',
            value: `${winRateDisplayPct}%`,
            detail:
              decidedWinRatePct !== null
                ? `${signedCount} signed of ${decidedCount} decided · ${weightedWinProbPct}% weighted`
                : `Weighted conversion probability · ${signedCount} signed`,
          },
          {
            label: 'Avg Check Size',
            value: formatCurrency(avgCheckUsd),
            detail: `${portalVisitedCount} visited investor.fortifai.io`,
          },
        ]}
      />

      {/* Compact Utility Bar (No filter stripe, no add column button) */}
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
            placeholder="Search fund, partner, thesis, city..."
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
            Showing <strong className="text-slate-700">{filteredAndSortedInvestors.length}</strong>{' '}
            of {investors.length} investors
          </span>
        </div>
      </div>

      {/* Data Table (Fixed Columns with Filterable Headers) */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[#E2E8F0] bg-slate-50/50 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-slate-900">
              <CmsText
                id="investors.table.title"
                defaultValue="Investor Pipeline"
                section="Investor Pipeline"
              />
            </span>
            <span className="text-slate-400 tabular-nums">
              {filteredAndSortedInvestors.length} of {investors.length} shown
            </span>
          </div>
          <TableDensityToggle value={density} onChange={setDensity} />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-[#E2E8F0] text-[11px] font-semibold tracking-wider text-slate-500">
                <ColumnFilterHeader
                  columnKey="fund"
                  label="Fund & Partner"
                  thClassName={densityCls.headerCell}
                  mode="categorical"
                  sortState={sortState}
                  onChangeSort={setSortState}
                  options={columnOptions.funds}
                  selectedValues={fundFilter}
                  onChangeSelectedValues={setFundFilter}
                />
                <ColumnFilterHeader
                  columnKey="region"
                  label="Region"
                  thClassName={densityCls.headerCell}
                  mode="categorical"
                  sortState={sortState}
                  onChangeSort={setSortState}
                  options={columnOptions.regions}
                  selectedValues={regionFilter}
                  onChangeSelectedValues={setRegionFilter}
                  subFacets={[
                    {
                      id: 'city',
                      label: 'Hub / City',
                      options: columnOptions.cities.slice(0, 12),
                      selectedValues: cityFilter,
                      onChange: setCityFilter,
                    },
                  ]}
                />
                <ColumnFilterHeader
                  columnKey="priority_track"
                  label="Priority / Track"
                  thClassName={densityCls.headerCell}
                  mode="categorical"
                  sortState={sortState}
                  onChangeSort={setSortState}
                  options={columnOptions.waves}
                  selectedValues={waveFilter}
                  onChangeSelectedValues={setWaveFilter}
                  subFacets={[
                    {
                      id: 'priority',
                      label: 'Priority Tier',
                      options: columnOptions.priorities,
                      selectedValues: priorityFilter,
                      onChange: setPriorityFilter,
                    },
                  ]}
                />
                <ColumnFilterHeader
                  columnKey="stage"
                  label="Status (Inline)"
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
                  label="Owner"
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
                  label="Delivery & Read"
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
                  label="Target / Check ($)"
                  thClassName={densityCls.headerCell}
                  mode="numeric"
                  sortState={sortState}
                  onChangeSort={setSortState}
                  numericRange={checkRange}
                  onChangeNumericRange={setCheckRange}
                  numericPlaceholder={{ min: '0', max: 'Max' }}
                  numericPresets={[
                    { label: '$250K+', min: 250000 },
                    { label: '$500K+', min: 500000 },
                    { label: '$1.0M+', min: 1000000 },
                    { label: '$2.0M+', min: 2000000 },
                  ]}
                />
                <ColumnFilterHeader
                  columnKey="custom_hook"
                  label="Custom Opening Hook"
                  thClassName={`${densityCls.headerCell} max-w-xs`}
                  mode="categorical"
                  sortState={sortState}
                  onChangeSort={setSortState}
                  options={columnOptions.hookTexts}
                  selectedValues={hookTextFilter}
                  onChangeSelectedValues={setHookTextFilter}
                  subFacets={[
                    {
                      id: 'hook_status',
                      label: 'Hook Coverage',
                      options: columnOptions.hookStatuses,
                      selectedValues: hookStatusFilter,
                      onChange: setHookStatusFilter,
                    },
                  ]}
                />
                <th className={`${densityCls.headerCell} text-right`}>Outreach</th>
              </tr>
            </thead>
            {filteredAndSortedInvestors.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={9} className="p-10 text-center space-y-2.5 text-xs">
                    <div className="font-medium text-slate-700">
                      No investors match the active column filters.
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
                {paginatedInvestors.map((inv) => (
                  <tr
                    key={inv.id}
                    onClick={() => onSelectContact(inv.id)}
                    className={`hover:bg-slate-50/90 cursor-pointer transition-colors ${
                      inv.unsubscribed ? 'opacity-60 bg-slate-50/50' : ''
                    }`}
                  >
                    <td className={densityCls.bodyCell}>
                      <div className="font-medium text-slate-900 flex items-center gap-1.5">
                        {inv.organization}
                        {inv.match_score && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded font-medium">
                            {inv.match_score}% fit
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {inv.full_name} · {inv.title}
                      </div>
                    </td>
                    <td className={densityCls.bodyCell}>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${getRegionBadgeStyle(
                          inv.region
                        )}`}
                      >
                        {inv.region}
                      </span>
                      <div className="text-[10px] text-slate-400 mt-0.5">{inv.location}</div>
                    </td>
                    <td className={densityCls.bodyCell}>
                      <span className="font-semibold text-slate-800">{inv.priority_tier}</span>
                      <span className="text-slate-400 ml-1.5">({inv.check_size_label})</span>
                      <div className="text-[11px] text-slate-400 truncate max-w-[180px]">
                        {inv.execution_wave}
                      </div>
                    </td>
                    <td className={densityCls.bodyCell} onClick={(e) => e.stopPropagation()}>
                      <select
                        value={inv.stage}
                        disabled={!canEdit}
                        onChange={(e) => {
                          const nextStage = e.target.value;
                          const isPass = nextStage === 'Passed';
                          onUpdateContact(inv.id, {
                            stage: nextStage,
                            outcome: isPass
                              ? 'Pass'
                              : nextStage === 'SAFE Signed'
                              ? 'Committed'
                              : ['Meeting', 'Diligence'].includes(nextStage)
                              ? 'Soft Circle'
                              : inv.outcome,
                            unsubscribed: isPass ? true : false,
                            portal_visited:
                              ['Portal Visited', 'Meeting', 'Diligence', 'SAFE Signed'].includes(
                                nextStage
                              ) || inv.portal_visited,
                          });
                        }}
                        className={`text-[11px] font-medium rounded-full px-2.5 py-1 border cursor-pointer focus:outline-none disabled:opacity-70 disabled:cursor-not-allowed ${getStageBadgeStyle(
                          inv.stage
                        )}`}
                      >
                        {INVESTOR_STAGES.filter((s) => s !== 'All').map((st) => (
                          <option key={st} value={st} className="bg-white text-slate-800">
                            {st}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className={densityCls.bodyCell} onClick={(e) => e.stopPropagation()}>
                      <select
                        value={inv.owner_id || ''}
                        disabled={!canEdit}
                        aria-label={`Owner for ${inv.organization}`}
                        onChange={(e) => {
                          const selected = activeUsers.find((u) => u.id === e.target.value);
                          if (!selected) return;
                          onUpdateContact(inv.id, {
                            owner_id: selected.id,
                            owner_email: selected.email,
                            owner: selected.full_name,
                          });
                        }}
                        className="text-xs bg-slate-50 border border-[#E2E8F0] hover:border-slate-300 focus:border-slate-500 rounded px-2 py-1 text-slate-800 focus:outline-none disabled:opacity-70"
                      >
                        {!activeUsers.some((u) => u.id === inv.owner_id) && (
                          <option value={inv.owner_id || ''}>
                            {inv.owner ? `${inv.owner} (Reassign)` : 'Assign Active Owner'}
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
                        status={inv.delivery_status}
                        openedAt={inv.opened_at}
                        openedDurationSec={inv.opened_duration_sec}
                        bouncedReason={inv.bounced_reason}
                      />
                    </td>
                    <td className={densityCls.bodyCell} onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-0.5 font-medium text-slate-900">
                        <span className="text-slate-400">$</span>
                        <input
                          type="number"
                          step={50000}
                          disabled={!canEdit}
                          aria-label={`Check size for ${inv.organization}`}
                          value={inv.amount_usd || 0}
                          onChange={(e) =>
                            onUpdateContact(inv.id, { amount_usd: Number(e.target.value) })
                          }
                          className="w-24 bg-transparent border border-transparent hover:border-slate-200 focus:border-slate-400 focus:bg-white rounded px-1 py-0.5 focus:outline-none disabled:opacity-70"
                        />
                      </div>
                    </td>
                    <td className={`${densityCls.bodyCell} max-w-xs`}>
                      <p className="text-[11px] text-slate-600 line-clamp-2">
                        {inv.custom_hook || inv.thesis_fit || '—'}
                      </p>
                    </td>
                    <td className={`${densityCls.bodyCell} text-right`}>
                      {inv.unsubscribed || inv.stage === 'Passed' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-medium">
                          <ShieldAlert size={11} />
                          Suppressed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <button
                          type="button"
                          disabled={!canSendCampaigns}
                          onClick={(e) => {
                            e.stopPropagation();
                            onComposeEmail(inv);
                          }}
                          title={!canSendCampaigns ? 'Requires can_send_campaigns permission' : undefined}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                          <Mail size={12} />
                          Outreach
                        </button>
                          {canEdit && onDeleteContact && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (window.confirm(`Delete ${inv.full_name} (${inv.organization})?`)) {
                                  onDeleteContact(inv.id);
                                }
                              }}
                              title="Delete account"
                              className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
          {filteredAndSortedInvestors.length > 0 && (
            <div className="px-4 py-2.5 border-t border-[#E2E8F0] bg-slate-50/50 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
              <div className="tabular-nums">
                Showing <strong className="text-slate-900">{startRow}–{endRow}</strong> of{' '}
                <strong className="text-slate-900">{filteredAndSortedInvestors.length}</strong>{' '}
                filtered investors
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400">Rows:</span>
                  {([25, 50, 100] as const).map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => setPageSize(sz)}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                        pageSize === sz
                          ? 'bg-[#0D1520] text-white'
                          : 'bg-white border border-[#E2E8F0] text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {sz === 100 ? 'All (100)' : sz}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    aria-label="Previous page"
                    className="p-1 rounded border border-[#E2E8F0] bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="px-2 tabular-nums text-[11px] font-medium text-slate-700">
                    Page {safePage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    aria-label="Next page"
                    className="p-1 rounded border border-[#E2E8F0] bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
