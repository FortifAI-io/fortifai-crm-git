import { useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Search,
} from 'lucide-react';
import { useRbac } from '../../context/RbacContext';
import { CUSTOMER_STAGES, QUARTERS, REGIONS } from '../../data/seedData';
import type { Contact, CrmUser, Quarter, Region } from '../../types/crm';
import { formatCurrency } from '../../utils/crmHelpers';
import { KeyMetricsStrip } from '../KeyMetricsStrip';

interface PipelineTimelineViewProps {
  customers: Contact[];
  activeUsers: CrmUser[];
  onSelectContact: (id: string) => void;
  onUpdateContact: (id: string, patch: Partial<Contact>) => void;
  onMoveQuarterToast: (organization: string, fromQtr: Quarter, toQtr: Quarter) => void;
}

type SortKey = 'close_quarter' | 'arr_desc' | 'stage_desc' | 'aging_desc';

const QUARTER_MONTHS: Record<Quarter, string> = {
  'Q1 2027': 'Jan · Feb · Mar',
  'Q2 2027': 'Apr · May · Jun',
  'Q3 2027': 'Jul · Aug · Sep',
  'Q4 2027': 'Oct · Nov · Dec',
};

const STAGE_PROGRESS: Record<
  string,
  { pct: number; order: number; barColor: string; trackTint: string; labelShort: string }
> = {
  '1 Lead': {
    pct: 16,
    order: 1,
    barColor: 'bg-slate-400',
    trackTint: 'border-slate-300 bg-slate-50',
    labelShort: '1 Lead',
  },
  '2 Qualified': {
    pct: 32,
    order: 2,
    barColor: 'bg-sky-500',
    trackTint: 'border-sky-200 bg-sky-50/70',
    labelShort: '2 Qualified',
  },
  '4 Decisionmaker buy in': {
    pct: 52,
    order: 3,
    barColor: 'bg-indigo-500',
    trackTint: 'border-indigo-200 bg-indigo-50/70',
    labelShort: '4 Decisionmaker',
  },
  '5 Internal Review Pending': {
    pct: 70,
    order: 4,
    barColor: 'bg-amber-500',
    trackTint: 'border-amber-200 bg-amber-50/70',
    labelShort: '5 Internal Review',
  },
  '6 Commercial / Contracting': {
    pct: 86,
    order: 5,
    barColor: 'bg-blue-600',
    trackTint: 'border-blue-200 bg-blue-50/70',
    labelShort: '6 Contracting',
  },
  '7 Closed Won': {
    pct: 100,
    order: 6,
    barColor: 'bg-emerald-600',
    trackTint: 'border-emerald-200 bg-emerald-50/70',
    labelShort: '7 Closed Won',
  },
  '9 No response': {
    pct: 100,
    order: 0,
    barColor: 'bg-rose-400',
    trackTint: 'border-rose-200 bg-rose-50/60',
    labelShort: '9 No response',
  },
};

function getStageMeta(stage: string) {
  return (
    STAGE_PROGRESS[stage] || {
      pct: 25,
      order: 1,
      barColor: 'bg-slate-400',
      trackTint: 'border-slate-200 bg-slate-50',
      labelShort: stage,
    }
  );
}

export function PipelineTimelineView({
  customers,
  activeUsers,
  onSelectContact,
  onUpdateContact,
  onMoveQuarterToast,
}: PipelineTimelineViewProps) {
  const { permissions } = useRbac();
  const canEdit = permissions.can_edit_customers;

  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState<'All' | Region>('All');
  const [stageFilter, setStageFilter] = useState<string>('All');
  const [ownerFilter, setOwnerFilter] = useState<string>('All');
  const [hideLost, setHideLost] = useState(true);
  const [sortBy, setSortBy] = useState<SortKey>('close_quarter');

  const [draggingDealId, setDraggingDealId] = useState<string | null>(null);
  const [hoverDropTarget, setHoverDropTarget] = useState<{
    dealId: string;
    quarter: Quarter;
  } | null>(null);

  const filteredDeals = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = customers.filter((c) => {
      if (hideLost && c.stage === '9 No response') return false;
      if (regionFilter !== 'All' && c.region !== regionFilter) return false;
      if (stageFilter !== 'All' && c.stage !== stageFilter) return false;
      if (ownerFilter !== 'All' && c.owner_id !== ownerFilter) return false;
      if (!q) return true;
      return (
        c.organization.toLowerCase().includes(q) ||
        c.full_name.toLowerCase().includes(q) ||
        (c.industry || '').toLowerCase().includes(q) ||
        c.owner.toLowerCase().includes(q)
      );
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'arr_desc') {
        return (b.amount_usd || 0) - (a.amount_usd || 0);
      }
      if (sortBy === 'stage_desc') {
        return getStageMeta(b.stage).order - getStageMeta(a.stage).order;
      }
      if (sortBy === 'aging_desc') {
        return (b.aging_days || 0) - (a.aging_days || 0);
      }
      const qa = QUARTERS.indexOf((a.expected_close as Quarter) || 'Q2 2027');
      const qb = QUARTERS.indexOf((b.expected_close as Quarter) || 'Q2 2027');
      if (qa !== qb) return qa - qb;
      return (b.amount_usd || 0) - (a.amount_usd || 0);
    });
  }, [customers, hideLost, regionFilter, stageFilter, ownerFilter, search, sortBy]);

  const quarterlyTotals = useMemo(() => {
    return QUARTERS.map((quarter) => {
      const deals = filteredDeals.filter(
        (d) => ((d.expected_close as Quarter) || 'Q2 2027') === quarter
      );
      const arr = deals.reduce((sum, d) => sum + (d.amount_usd || 0), 0);
      const weightedArr = deals.reduce(
        (sum, d) => sum + ((d.amount_usd || 0) * (d.probability || 0)) / 100,
        0
      );
      return { quarter, count: deals.length, arr, weightedArr };
    });
  }, [filteredDeals]);

  const summaryMetrics = useMemo(() => {
    const totalArr = filteredDeals.reduce((sum, d) => sum + (d.amount_usd || 0), 0);
    const weightedArr = filteredDeals.reduce(
      (sum, d) => sum + ((d.amount_usd || 0) * (d.probability || 0)) / 100,
      0
    );
    const h1Deals = filteredDeals.filter(
      (d) => d.expected_close === 'Q1 2027' || d.expected_close === 'Q2 2027'
    );
    const h1Arr = h1Deals.reduce((sum, d) => sum + (d.amount_usd || 0), 0);
    const lateStageDeals = filteredDeals.filter((d) =>
      ['5 Internal Review Pending', '6 Commercial / Contracting', '7 Closed Won'].includes(
        d.stage
      )
    );
    const lateStageArr = lateStageDeals.reduce((sum, d) => sum + (d.amount_usd || 0), 0);
    const avgAging =
      filteredDeals.length > 0
        ? Math.round(
            filteredDeals.reduce((sum, d) => sum + (d.aging_days || 0), 0) /
              filteredDeals.length
          )
        : 0;

    return { totalArr, weightedArr, h1Deals: h1Deals.length, h1Arr, lateStageDeals: lateStageDeals.length, lateStageArr, avgAging };
  }, [filteredDeals]);

  const moveDealToQuarter = (deal: Contact, targetQuarter: Quarter) => {
    if (!canEdit) return;
    const currentQuarter = (deal.expected_close as Quarter) || 'Q2 2027';
    if (currentQuarter === targetQuarter) return;
    onUpdateContact(deal.id, { expected_close: targetQuarter });
    onMoveQuarterToast(deal.organization, currentQuarter, targetQuarter);
  };

  const resetFilters = () => {
    setSearch('');
    setRegionFilter('All');
    setStageFilter('All');
    setOwnerFilter('All');
    setHideLost(true);
  };

  return (
    <div className="p-6 space-y-5 max-w-[1600px] w-full mx-auto">
      {/* Summary Strip */}
      <KeyMetricsStrip
        title="2027 Close Horizon Summary"
        cmsSection="Pipeline Timeline"
        cmsKeyPrefix="pipeline_timeline.kpi"
        scopeSummary={`Showing ${filteredDeals.length} of ${customers.length} enterprise deals · ${
          canEdit ? 'Drag deals across quarters to reschedule' : 'Read-only timeline'
        }`}
        metrics={[
          {
            label: 'Scheduled Pipeline ARR',
            value: formatCurrency(summaryMetrics.totalArr),
            detail: `Weighted ${formatCurrency(summaryMetrics.weightedArr)}`,
          },
          {
            label: 'Active Timeline Deals',
            value: String(filteredDeals.length),
            detail: `Avg ${summaryMetrics.avgAging} days in funnel`,
          },
          {
            label: 'H1 2027 Close Load',
            value: formatCurrency(summaryMetrics.h1Arr),
            detail: `${summaryMetrics.h1Deals} deals targeted Q1–Q2 2027`,
          },
          {
            label: 'Late-Stage (Stage 5–7)',
            value: formatCurrency(summaryMetrics.lateStageArr),
            detail: `${summaryMetrics.lateStageDeals} deals in review, contracting, or won`,
          },
        ]}
      />

      {/* Filter & Legend Toolbar */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter deals, sector, or owner..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-[#E2E8F0] rounded-md focus:outline-none focus:bg-white focus:border-slate-400"
            />
          </div>

          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[11px] text-slate-400 mr-1 font-medium">Region:</span>
            {REGIONS.map((reg) => (
              <button
                key={reg}
                type="button"
                onClick={() => setRegionFilter(reg)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  regionFilter === reg
                    ? 'bg-[#0D1520] text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                {reg}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs shrink-0">
            <span className="text-slate-400">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              aria-label="Sort timeline deals"
              className="bg-white border border-[#E2E8F0] rounded px-2.5 py-1.5 text-slate-700 font-medium"
            >
              <option value="close_quarter">Close Quarter (Earliest)</option>
              <option value="arr_desc">Target ARR (High to Low)</option>
              <option value="stage_desc">Deal Stage (Furthest)</option>
              <option value="aging_desc">Aging Days (Oldest)</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-slate-100 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Stage:</span>
              <select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value)}
                aria-label="Filter by stage"
                className="bg-white border border-[#E2E8F0] rounded px-2 py-1 text-slate-700"
              >
                {CUSTOMER_STAGES.map((st) => (
                  <option key={st} value={st}>
                    {st === 'All' ? 'All Stages' : st}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-slate-400 mr-1">Owner:</span>
              <button
                type="button"
                onClick={() => setOwnerFilter('All')}
                className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap ${
                  ownerFilter === 'All'
                    ? 'bg-[#0D1520] text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                All
              </button>
              {activeUsers.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setOwnerFilter(u.id)}
                  className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap ${
                    ownerFilter === u.id
                      ? 'bg-[#0D1520] text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                  }`}
                >
                  {u.full_name.split(' ')[0]}
                </button>
              ))}
            </div>

            <label className="inline-flex items-center gap-1.5 text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={hideLost}
                onChange={(e) => setHideLost(e.target.checked)}
                className="rounded border-slate-300 text-[#0D1520]"
              />
              <span>Hide No Response</span>
            </label>
          </div>

          <div className="flex items-center gap-3 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2 rounded-xs bg-sky-500 inline-block" />
              Qualified
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2 rounded-xs bg-indigo-500 inline-block" />
              Buy-In
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2 rounded-xs bg-amber-500 inline-block" />
              Review
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2 rounded-xs bg-blue-600 inline-block" />
              Contracting
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2 rounded-xs bg-emerald-600 inline-block" />
              Won
            </span>
          </div>
        </div>
      </div>

      {/* Dynamic Gantt Chart */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[#E2E8F0] bg-slate-50/50 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-900">
              Enterprise Deal Close Timeline (2027)
            </span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-500 tabular-nums">
              {filteredDeals.length} {filteredDeals.length === 1 ? 'deal' : 'deals'} scheduled
            </span>
          </div>
          <div className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
            <ArrowLeftRight size={12} />
            <span>
              {canEdit
                ? 'Drag any deal bar across Q1–Q4 columns to update Expected Close'
                : 'Read-only mode · Edit permission required to reschedule quarters'}
            </span>
          </div>
        </div>

        {filteredDeals.length === 0 ? (
          <div className="p-12 text-center space-y-2.5 text-xs">
            <div className="font-medium text-slate-700">
              No enterprise deals match the current timeline filters.
            </div>
            <button
              type="button"
              onClick={resetFilters}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-medium"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[1040px]">
              {/* Gantt Header Grid */}
              <div className="grid grid-cols-[290px_repeat(4,minmax(180px,1fr))] border-b border-[#E2E8F0] bg-slate-50/80">
                <div className="px-4 py-3 border-r border-[#E2E8F0] flex flex-col justify-between">
                  <span className="text-[11px] font-semibold tracking-wider text-slate-500">
                    Account &amp; Deal Owner
                  </span>
                  <span className="text-[11px] text-slate-400 mt-1">
                    Click account to open dossier drawer
                  </span>
                </div>

                {quarterlyTotals.map((qt) => {
                  const isAnyHover = hoverDropTarget?.quarter === qt.quarter;
                  return (
                    <div
                      key={qt.quarter}
                      className={`px-3.5 py-3 border-r last:border-r-0 border-[#E2E8F0] transition-colors ${
                        isAnyHover ? 'bg-sky-50/70' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-900">
                          {qt.quarter}
                        </span>
                        <span className="text-[11px] text-slate-500 tabular-nums">
                          {qt.count} {qt.count === 1 ? 'deal' : 'deals'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {QUARTER_MONTHS[qt.quarter]}
                      </div>
                      <div className="mt-1.5 pt-1.5 border-t border-slate-200/70 flex items-center justify-between text-[11px] tabular-nums">
                        <span className="font-semibold text-slate-800">
                          {formatCurrency(qt.arr)}
                        </span>
                        <span className="text-slate-500">
                          {formatCurrency(qt.weightedArr)} wtd
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Gantt Rows */}
              <div className="divide-y divide-slate-100">
                {filteredDeals.map((deal) => {
                  const closeQuarter: Quarter = QUARTERS.includes(deal.expected_close as Quarter)
                    ? (deal.expected_close as Quarter)
                    : 'Q2 2027';
                  const closeIdx = QUARTERS.indexOf(closeQuarter);
                  const stageMeta = getStageMeta(deal.stage);
                  const leadSpanQuarters =
                    (deal.aging_days || 0) >= 90
                      ? 2
                      : (deal.aging_days || 0) >= 45 || stageMeta.order >= 3
                      ? 1
                      : 0;
                  const funnelStartIdx = Math.max(0, closeIdx - leadSpanQuarters);
                  const isDraggingThis = draggingDealId === deal.id;

                  return (
                    <div
                      key={deal.id}
                      className={`grid grid-cols-[290px_repeat(4,minmax(180px,1fr))] group transition-colors ${
                        isDraggingThis ? 'bg-slate-50/60' : 'hover:bg-slate-50/50'
                      }`}
                    >
                      {/* Left Account Column */}
                      <div className="px-4 py-3 border-r border-[#E2E8F0] flex flex-col justify-center min-w-0">
                        <button
                          type="button"
                          onClick={() => onSelectContact(deal.id)}
                          className="text-left text-xs font-semibold text-slate-900 hover:text-indigo-700 truncate transition-colors"
                        >
                          {deal.organization}
                        </button>
                        <div className="text-[11px] text-slate-500 mt-0.5 truncate tabular-nums">
                          <span>{deal.owner.split(' ')[0]}</span>
                          <span aria-hidden="true"> · </span>
                          <span>{deal.buyer_persona || 'Enterprise'}</span>
                          {deal.fortune_500 && (
                            <>
                              <span aria-hidden="true"> · </span>
                              <span className="text-amber-700 font-medium">F500</span>
                            </>
                          )}
                          {(deal.aging_days || 0) > 0 && (
                            <>
                              <span aria-hidden="true"> · </span>
                              <span
                                className={
                                  (deal.aging_days || 0) > 90
                                    ? 'text-rose-600 font-medium'
                                    : ''
                                }
                              >
                                {deal.aging_days}d
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* 4 Quarter Gantt Cells */}
                      {QUARTERS.map((quarter, qIdx) => {
                        const isTargetQuarter = qIdx === closeIdx;
                        const isLeadSpanCell = qIdx >= funnelStartIdx && qIdx < closeIdx;
                        const isHoverTarget =
                          hoverDropTarget?.dealId === deal.id &&
                          hoverDropTarget?.quarter === quarter;
                        const isRowDragging = draggingDealId === deal.id;

                        return (
                          <div
                            key={quarter}
                            data-testid={`gantt-cell-${deal.id}-${quarter.replace(/\s+/g, '-')}`}
                            onDragOver={(e) => {
                              if (!canEdit || !draggingDealId) return;
                              e.preventDefault();
                              e.dataTransfer.dropEffect = 'move';
                              if (
                                hoverDropTarget?.dealId !== draggingDealId ||
                                hoverDropTarget?.quarter !== quarter
                              ) {
                                setHoverDropTarget({ dealId: draggingDealId, quarter });
                              }
                            }}
                            onDragLeave={() => {
                              if (
                                hoverDropTarget?.dealId === deal.id &&
                                hoverDropTarget?.quarter === quarter
                              ) {
                                setHoverDropTarget(null);
                              }
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (!canEdit) return;
                              const droppedId =
                                e.dataTransfer.getData('text/plain') || draggingDealId;
                              setDraggingDealId(null);
                              setHoverDropTarget(null);
                              if (!droppedId) return;
                              const droppedDeal = customers.find((c) => c.id === droppedId);
                              if (droppedDeal) {
                                moveDealToQuarter(droppedDeal, quarter);
                              }
                            }}
                            className={`relative px-2.5 py-2.5 border-r last:border-r-0 border-[#E2E8F0] flex items-center transition-colors min-h-[64px] ${
                              isHoverTarget
                                ? 'bg-sky-50/80 ring-1 ring-inset ring-sky-400'
                                : isRowDragging && canEdit && !isTargetQuarter
                                ? 'bg-slate-50/40'
                                : ''
                            }`}
                          >
                            {/* Lead-in span track for multi-quarter Gantt context */}
                            {isLeadSpanCell && (
                              <div className="w-full flex items-center pointer-events-none">
                                <div className="w-full flex items-center">
                                  {qIdx === funnelStartIdx && (
                                    <span className="h-2 w-2 rounded-full bg-slate-300 shrink-0" />
                                  )}
                                  <div className="h-[2px] w-full bg-slate-200" />
                                </div>
                              </div>
                            )}

                            {/* Drop hint when hovering another quarter */}
                            {isHoverTarget && !isTargetQuarter && (
                              <div className="absolute inset-1.5 rounded-md border border-dashed border-sky-400 bg-sky-50/90 flex items-center justify-center text-[11px] font-medium text-sky-700 pointer-events-none">
                                Move to {quarter}
                              </div>
                            )}

                            {/* Draggable Gantt Milestone Bar */}
                            {isTargetQuarter && (
                              <div
                                draggable={canEdit}
                                onDragStart={(e) => {
                                  if (!canEdit) return;
                                  e.dataTransfer.effectAllowed = 'move';
                                  e.dataTransfer.setData('text/plain', deal.id);
                                  setDraggingDealId(deal.id);
                                }}
                                onDragEnd={() => {
                                  setDraggingDealId(null);
                                  setHoverDropTarget(null);
                                }}
                                onClick={() => onSelectContact(deal.id)}
                                title={
                                  canEdit
                                    ? `${deal.organization} · Drag to reschedule Expected Close quarter or click for details`
                                    : `${deal.organization} · Click for details`
                                }
                                className={`w-full rounded-md border px-2.5 py-2 transition-all select-none ${
                                  stageMeta.trackTint
                                } ${
                                  canEdit
                                    ? 'cursor-grab active:cursor-grabbing hover:border-slate-400'
                                    : 'cursor-pointer hover:border-slate-300'
                                } ${isDraggingThis ? 'opacity-45' : 'opacity-100'}`}
                              >
                                <div className="flex items-center justify-between gap-1.5">
                                  <div className="flex items-center gap-1 min-w-0">
                                    {canEdit && (
                                      <GripVertical
                                        size={12}
                                        className="text-slate-400 shrink-0"
                                      />
                                    )}
                                    <span className="text-[11px] font-semibold text-slate-900 truncate">
                                      {stageMeta.labelShort}
                                    </span>
                                  </div>

                                  {canEdit && (
                                    <div
                                      className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <button
                                        type="button"
                                        disabled={closeIdx === 0}
                                        onClick={() =>
                                          moveDealToQuarter(deal, QUARTERS[closeIdx - 1])
                                        }
                                        title={`Move to ${QUARTERS[closeIdx - 1] || ''}`}
                                        aria-label={`Move ${deal.organization} earlier`}
                                        className="p-0.5 rounded text-slate-500 hover:bg-white hover:text-slate-900 disabled:opacity-25 disabled:cursor-not-allowed"
                                      >
                                        <ChevronLeft size={12} />
                                      </button>
                                      <button
                                        type="button"
                                        disabled={closeIdx === QUARTERS.length - 1}
                                        onClick={() =>
                                          moveDealToQuarter(deal, QUARTERS[closeIdx + 1])
                                        }
                                        title={`Move to ${QUARTERS[closeIdx + 1] || ''}`}
                                        aria-label={`Move ${deal.organization} later`}
                                        className="p-0.5 rounded text-slate-500 hover:bg-white hover:text-slate-900 disabled:opacity-25 disabled:cursor-not-allowed"
                                      >
                                        <ChevronRight size={12} />
                                      </button>
                                    </div>
                                  )}
                                </div>

                                <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-600 tabular-nums">
                                  <span className="font-semibold text-slate-900">
                                    {formatCurrency(deal.amount_usd || 0)}
                                  </span>
                                  <span>{deal.probability ?? 0}% prob</span>
                                </div>

                                {/* Stage Progression Gantt Fill */}
                                <div className="mt-1.5 h-1.5 w-full bg-white/90 border border-slate-200/70 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all duration-200 ${stageMeta.barColor}`}
                                    style={{ width: `${stageMeta.pct}%` }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
