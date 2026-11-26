import { useState } from 'react';
import { AlertTriangle, ArrowUpRight, Calculator, Pencil, Send, Sparkles, TrendingUp } from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useRbac } from '../../context/RbacContext';
import { CmsText } from '../CmsText';
import type { Contact, PipelineAnalytics } from '../../types/crm';
import { QUARTERS } from '../../data/seedData';
import {
  formatMillions,
  getRegionBadgeStyle,
  getStageBadgeStyle,
} from '../../utils/crmHelpers';

interface PipelineHealthViewProps {
  pipelineAnalytics: PipelineAnalytics;
  arrTarget2027: number;
  onChangeArrTarget: (val: number) => void;
  avgAcvAssumption: number;
  onChangeAvgAcv: (val: number) => void;
  coverageMultiple: number;
  onChangeCoverageMultiple: (val: number) => void;
  onNavigateToCustomers: () => void;
  onDraftFollowUp: (deal: Contact, subject: string, body: string) => void;
}

export function PipelineHealthView({
  pipelineAnalytics,
  arrTarget2027,
  onChangeArrTarget,
  avgAcvAssumption,
  onChangeAvgAcv,
  coverageMultiple,
  onChangeCoverageMultiple,
  onNavigateToCustomers,
  onDraftFollowUp,
}: PipelineHealthViewProps) {
  const { permissions } = useRbac();
  const canEditCustomers = permissions.can_edit_customers;
  const canSendCampaigns = permissions.can_send_campaigns;

  const [editingTarget, setEditingTarget] = useState(false);
  const [targetMillionsDraft, setTargetMillionsDraft] = useState<string>(
    (arrTarget2027 / 1_000_000).toFixed(2)
  );

  const commitArrTarget = () => {
    const parsedM = Number(targetMillionsDraft);
    if (Number.isFinite(parsedM) && parsedM > 0) {
      onChangeArrTarget(Math.max(250000, Math.round(parsedM * 1_000_000)));
    }
    setEditingTarget(false);
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] w-full mx-auto">
      {/* Top KPI Strip ($x.xxM) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">
              <CmsText
                id="pipeline_health.kpi.arr_target"
                defaultValue="2027 ARR Target"
                section="Pipeline Health"
              />
            </span>
            {canEditCustomers ? (
              <button
                type="button"
                onClick={() => {
                  setTargetMillionsDraft((arrTarget2027 / 1_000_000).toFixed(2));
                  setEditingTarget((prev) => !prev);
                }}
                className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:underline font-medium"
              >
                <Pencil size={10} />
                {editingTarget ? 'Done' : 'Edit ($M)'}
              </button>
            ) : (
              <span className="text-[11px] text-slate-400 font-medium">Read-only</span>
            )}
          </div>
          {editingTarget && canEditCustomers ? (
            <div className="mt-1 flex items-center gap-1">
              <span className="text-lg font-semibold text-slate-400">$</span>
              <input
                type="number"
                step={0.25}
                min={0.25}
                autoFocus
                aria-label="2027 ARR Target in Millions"
                value={targetMillionsDraft}
                onChange={(e) => setTargetMillionsDraft(e.target.value)}
                onBlur={commitArrTarget}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitArrTarget();
                  if (e.key === 'Escape') setEditingTarget(false);
                }}
                className="w-28 text-2xl font-semibold text-slate-900 tabular-nums bg-transparent border-b border-dashed border-slate-400 focus:border-slate-900 focus:outline-none"
              />
              <span className="text-lg font-semibold text-slate-500">M</span>
            </div>
          ) : (
            <div
              onClick={() => {
                if (!canEditCustomers) return;
                setTargetMillionsDraft((arrTarget2027 / 1_000_000).toFixed(2));
                setEditingTarget(true);
              }}
              className={`text-2xl font-semibold text-slate-900 mt-1 tabular-nums ${
                canEditCustomers ? 'cursor-pointer hover:text-indigo-700' : ''
              }`}
              title={canEditCustomers ? 'Click to edit 2027 ARR Target ($M)' : undefined}
            >
              {formatMillions(arrTarget2027)}
            </div>
          )}
          <div className="text-[11px] text-slate-500 mt-1.5 tabular-nums">
            <strong>{pipelineAnalytics.closedDealsRequired}</strong> Closed Deals Req (@{' '}
            {formatMillions(avgAcvAssumption)} ACV)
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
          <div className="text-xs text-slate-500 font-medium">
            <CmsText
              id="pipeline_health.kpi.actual_coverage"
              defaultValue="Actual Pipeline Coverage"
              section="Pipeline Health"
            />
          </div>
          <div className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
            {formatMillions(pipelineAnalytics.actualPipelineArr)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1.5 tabular-nums">
            Across <strong>{pipelineAnalytics.activeDealsCount}</strong> active deals (
            {pipelineAnalytics.qualifiedDealsCount} qualified)
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
          <div className="text-xs text-slate-500 font-medium">
            <CmsText
              id="pipeline_health.kpi.weighted_arr"
              defaultValue="Weighted Pipeline ARR"
              section="Pipeline Health"
            />
          </div>
          <div className="text-2xl font-semibold text-blue-600 mt-1 tabular-nums">
            {formatMillions(pipelineAnalytics.weightedPipelineArr)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1.5 tabular-nums">
            Avg stage win prob: <strong>{pipelineAnalytics.weightedWinProbPct}%</strong>
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
          <div className="text-xs text-slate-500 font-medium">
            <CmsText
              id="pipeline_health.kpi.recommended_coverage"
              defaultValue="Recommended Coverage"
              section="Pipeline Health"
            />{' '}
            ({coverageMultiple}x)
          </div>
          <div className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
            {formatMillions(pipelineAnalytics.recommendedCoverageArr)}
          </div>
          <div className="text-[11px] text-amber-700 mt-1.5 tabular-nums font-medium">
            Gap: {formatMillions(pipelineAnalytics.coverageGapArr)} (
            {pipelineAnalytics.coverageVsTargetPct}% covered)
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
          <div className="text-xs text-slate-500 font-medium">
            <CmsText
              id="pipeline_health.kpi.required_win_rate"
              defaultValue="Required Win Rate"
              section="Pipeline Health"
            />
          </div>
          <div
            className={`text-2xl font-semibold mt-1 tabular-nums ${
              pipelineAnalytics.requiredWinRatePct > 100 ? 'text-rose-600' : 'text-slate-900'
            }`}
          >
            {pipelineAnalytics.requiredWinRatePct}%
          </div>
          <div className="text-[11px] text-slate-500 mt-1.5 tabular-nums">
            Target {formatMillions(arrTarget2027)} ÷ Pipeline{' '}
            {formatMillions(pipelineAnalytics.actualPipelineArr)}
          </div>
        </div>
      </div>

      {/* Formula-Driven Health Diagnostics Strip */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Calculator size={14} className="text-indigo-600" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
              <CmsText
                id="pipeline_health.diagnostics.title"
                defaultValue="Formula-Driven Sales Pipeline Diagnostics"
                section="Pipeline Health"
              />
            </h2>
          </div>
          <span className="text-[11px] text-slate-400 tabular-nums">
            <CmsText
              id="pipeline_health.diagnostics.subtitle"
              defaultValue="Live spreadsheet formulas derived from active deals, stage weights & aging"
              section="Pipeline Health"
            />
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 tabular-nums">
          <div className="p-3 rounded-md bg-slate-50 border border-slate-200/70">
            <div className="text-[11px] text-slate-500 font-medium">
              Qualified Pipeline (Stage 2+)
            </div>
            <div className="text-lg font-semibold text-indigo-700 mt-0.5">
              {formatMillions(pipelineAnalytics.qualifiedPipelineArr)}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {pipelineAnalytics.qualifiedSharePct}% of active ·{' '}
              {formatMillions(pipelineAnalytics.leadOnlyPipelineArr)} Stage 1 Lead
            </div>
          </div>

          <div className="p-3 rounded-md bg-slate-50 border border-slate-200/70">
            <div className="text-[11px] text-slate-500 font-medium">
              Weighted Attainment vs. Goal
            </div>
            <div className="text-lg font-semibold text-slate-900 mt-0.5">
              {pipelineAnalytics.weightedAttainmentPct}%
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              Weighted shortfall: {formatMillions(pipelineAnalytics.weightedArrGap)}
            </div>
          </div>

          <div className="p-3 rounded-md bg-slate-50 border border-slate-200/70">
            <div className="text-[11px] text-slate-500 font-medium">
              Actual Coverage Multiple
            </div>
            <div className="text-lg font-semibold text-slate-900 mt-0.5">
              {pipelineAnalytics.pipelineCoverageMultipleActual.toFixed(2)}x
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              Target {coverageMultiple.toFixed(1)}x ·{' '}
              <strong>{pipelineAnalytics.netNewDealsNeeded}</strong> net-new deals needed
            </div>
          </div>

          <div className="p-3 rounded-md bg-slate-50 border border-slate-200/70">
            <div className="text-[11px] text-slate-500 font-medium">
              Average Deal Size &amp; Age
            </div>
            <div className="text-lg font-semibold text-slate-900 mt-0.5">
              {formatMillions(pipelineAnalytics.avgDealSizeArr)}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              Mean funnel age: <strong>{pipelineAnalytics.avgAgingDays}d</strong> (Healthy{' '}
              {formatMillions(pipelineAnalytics.healthyPipelineArr)})
            </div>
          </div>

          <div className="p-3 rounded-md bg-rose-50/60 border border-rose-200/70">
            <div className="text-[11px] text-rose-700 font-medium">
              Stale Exposure (&gt;90d in Stage)
            </div>
            <div className="text-lg font-semibold text-rose-700 mt-0.5">
              {formatMillions(pipelineAnalytics.stalePipelineArr)}
            </div>
            <div className="text-[10px] text-rose-600 mt-0.5">
              {pipelineAnalytics.stalePipelineSharePct}% of pipeline ·{' '}
              {formatMillions(pipelineAnalytics.staleWeightedArr)} weighted
            </div>
          </div>
        </div>
      </div>

      {/* 90-Day Pipeline Velocity & Conversion by Stage (Recharts) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pipeline Velocity Line Chart */}
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-5 min-w-0">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <TrendingUp size={15} className="text-blue-600 shrink-0" />
                <h3 className="text-sm font-semibold text-slate-900">
                  <CmsText
                    id="pipeline_health.chart_velocity.title"
                    defaultValue="Pipeline Velocity (Last 90 Days)"
                    section="Pipeline Health"
                  />
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                <CmsText
                  id="pipeline_health.chart_velocity.subtitle"
                  defaultValue="Active ARR vs. >90d stale leakage & 30-day weighted velocity ($M)"
                  section="Pipeline Health"
                />
              </p>
            </div>
            <div className="text-right tabular-nums shrink-0">
              <div className="text-xs font-semibold text-blue-700">
                {formatMillions(
                  (pipelineAnalytics.velocityTrend90d[
                    pipelineAnalytics.velocityTrend90d.length - 1
                  ]?.velocityPerMonthM || 0) * 1_000_000
                )}
                /mo
              </div>
              <div className="text-[11px] text-slate-400">
                Avg age {pipelineAnalytics.avgAgingDays}d
              </div>
            </div>
          </div>

          {pipelineAnalytics.activeDealsCount === 0 ? (
            <div className="h-[260px] flex flex-col items-center justify-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-md gap-2">
              <span>No active deals available to plot 90-day velocity.</span>
              <button
                type="button"
                onClick={onNavigateToCustomers}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md"
              >
                Open Accounts &amp; Targets
              </button>
            </div>
          ) : (
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={pipelineAnalytics.velocityTrend90d}
                  margin={{ top: 8, right: 14, left: 0, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={{ stroke: '#E2E8F0' }}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v: number) => `$${v.toFixed(2)}M`}
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                    width={60}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const pt = payload[0]?.payload as
                        | PipelineAnalytics['velocityTrend90d'][number]
                        | undefined;
                      if (!pt) return null;
                      return (
                        <div className="bg-white border border-[#E2E8F0] rounded-md px-3 py-2.5 shadow-sm text-xs tabular-nums space-y-1">
                          <div className="font-semibold text-slate-900 border-b border-slate-100 pb-1">
                            {label} · {pt.activeDealsCount} deals · Avg {pt.avgAgeDays}d
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-slate-600">Active Pipeline:</span>
                            <span className="font-semibold text-slate-900">
                              ${pt.activeArrM.toFixed(2)}M
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-blue-700">Velocity (30d rate):</span>
                            <span className="font-semibold text-blue-700">
                              ${pt.velocityPerMonthM.toFixed(2)}M/mo
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-slate-500">Weighted ARR:</span>
                            <span className="font-medium text-slate-700">
                              ${pt.weightedArrM.toFixed(2)}M
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-rose-600">Stale Leakage (&gt;90d):</span>
                            <span className="font-semibold text-rose-600">
                              ${pt.staleLeakageArrM.toFixed(2)}M
                            </span>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }} iconType="plainline" />
                  <Line
                    type="monotone"
                    dataKey="activeArrM"
                    name="Active Pipeline ($M)"
                    stroke="#0F172A"
                    strokeWidth={2.25}
                    dot={{ r: 3, fill: '#0F172A', strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="staleLeakageArrM"
                    name="Stale Leakage >90d ($M)"
                    stroke="#DC2626"
                    strokeWidth={2}
                    strokeDasharray="4 3"
                    dot={{ r: 3, fill: '#DC2626', strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="velocityPerMonthM"
                    name="Velocity ($M / 30d)"
                    stroke="#2563EB"
                    strokeWidth={2.25}
                    dot={{ r: 3, fill: '#2563EB', strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Conversion by Stage & Funnel Leakage Line Chart */}
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-5 min-w-0">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-900">
                <CmsText
                  id="pipeline_health.chart_conversion.title"
                  defaultValue="Conversion by Stage & Funnel Leakage"
                  section="Pipeline Health"
                />
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                <CmsText
                  id="pipeline_health.chart_conversion.subtitle"
                  defaultValue="90-day cohort stage progression vs. cumulative drop-off & stagnation (%)"
                  section="Pipeline Health"
                />
              </p>
            </div>
            <div className="text-right tabular-nums shrink-0">
              <div className="text-xs font-semibold text-rose-600">
                {pipelineAnalytics.stageConversion90d[2]?.leakagePct ?? 0}% leaked by Decisionmaker
              </div>
              <div className="text-[11px] text-slate-400">
                {pipelineAnalytics.qualifiedSharePct}% Stage 2+ ARR share
              </div>
            </div>
          </div>

          {pipelineAnalytics.activeDealsCount === 0 ? (
            <div className="h-[260px] flex flex-col items-center justify-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-md gap-2">
              <span>No pipeline cohort data available to visualize stage conversion.</span>
            </div>
          ) : (
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={pipelineAnalytics.stageConversion90d}
                  margin={{ top: 8, right: 14, left: 0, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis
                    dataKey="stageLabel"
                    tick={{ fontSize: 10.5, fill: '#64748B' }}
                    axisLine={{ stroke: '#E2E8F0' }}
                    tickLine={false}
                    interval={0}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tickFormatter={(v: number) => `${v}%`}
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                    width={42}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const pt = payload[0]?.payload as
                        | PipelineAnalytics['stageConversion90d'][number]
                        | undefined;
                      if (!pt) return null;
                      return (
                        <div className="bg-white border border-[#E2E8F0] rounded-md px-3 py-2.5 shadow-sm text-xs tabular-nums space-y-1">
                          <div className="font-semibold text-slate-900 border-b border-slate-100 pb-1">
                            {pt.stageKey}
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-slate-600">Cohort Reached:</span>
                            <span className="font-semibold text-slate-900">
                              {pt.conversionPct}% ({pt.reachedCount} deals · $
                              {pt.reachedArrM.toFixed(2)}M)
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-blue-700">Healthy Retention (≤90d):</span>
                            <span className="font-semibold text-blue-700">
                              {pt.healthyConversionPct}%
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-rose-600">Cumulative Leakage:</span>
                            <span className="font-semibold text-rose-600">{pt.leakagePct}%</span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-slate-500">Enterprise Benchmark:</span>
                            <span className="font-medium text-slate-700">{pt.benchmarkPct}%</span>
                          </div>
                          {(pt.dropOffFromPrevPct > 0 || pt.stalledOver90dCount > 0) && (
                            <div className="pt-1 border-t border-slate-100 text-[11px] text-amber-700">
                              Step drop: -{pt.dropOffFromPrevPct} pts · Stalled &gt;90d here:{' '}
                              {pt.stalledOver90dCount}
                            </div>
                          )}
                        </div>
                      );
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }} iconType="plainline" />
                  <Line
                    type="monotone"
                    dataKey="conversionPct"
                    name="Cohort Conversion (%)"
                    stroke="#0F172A"
                    strokeWidth={2.25}
                    dot={{ r: 3, fill: '#0F172A', strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="leakagePct"
                    name="Cumulative Leakage (%)"
                    stroke="#DC2626"
                    strokeWidth={2.25}
                    dot={{ r: 3, fill: '#DC2626', strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="benchmarkPct"
                    name="Target Benchmark (%)"
                    stroke="#94A3B8"
                    strokeWidth={1.75}
                    strokeDasharray="5 4"
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Quarterly Breakdown Matrix */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              <CmsText
                id="pipeline_health.matrix.title"
                defaultValue="2027 Quarterly Pipeline Coverage & Win-Rate Matrix"
                section="Pipeline Health"
              />
            </h2>
            <p className="text-xs text-slate-500">
              <CmsText
                id="pipeline_health.matrix.subtitle"
                defaultValue="Auto-recalculates whenever deals or coverage model assumptions are updated"
                section="Pipeline Health"
              />
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Coverage Multiple:</span>
              <select
                value={coverageMultiple}
                disabled={!canEditCustomers}
                onChange={(e) => onChangeCoverageMultiple(Number(e.target.value))}
                className="bg-slate-50 border border-[#E2E8F0] rounded px-2 py-1 font-medium text-slate-700 tabular-nums disabled:opacity-70"
              >
                <option value={4.0}>4.0x</option>
                <option value={5.0}>5.0x</option>
                <option value={5.7}>5.7x (Recommended)</option>
                <option value={6.0}>6.0x</option>
                <option value={7.0}>7.0x</option>
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Avg ACV Assumption:</span>
              <select
                value={avgAcvAssumption}
                disabled={!canEditCustomers}
                onChange={(e) => onChangeAvgAcv(Number(e.target.value))}
                className="bg-slate-50 border border-[#E2E8F0] rounded px-2 py-1 font-medium text-slate-700 tabular-nums disabled:opacity-70"
              >
                <option value={150000}>$0.15M ACV</option>
                <option value={200000}>$0.20M ACV</option>
                <option value={250000}>$0.25M ACV</option>
                <option value={300000}>$0.30M ACV</option>
                <option value={500000}>$0.50M ACV</option>
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs tabular-nums">
            <thead>
              <tr className="bg-slate-50/90 border-b border-[#E2E8F0] text-[11px] font-semibold tracking-wider text-slate-500">
                <th className="py-3 px-5">Pipeline Health Metric (Formula)</th>
                <th className="py-3 px-4 text-right bg-slate-100/70 text-slate-800">
                  2027 Full Year
                </th>
                {QUARTERS.map((q) => (
                  <th key={q} className="py-3 px-4 text-right">
                    {q}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="py-2.5 px-5 font-medium text-slate-600">Quarterly Weight (%)</td>
                <td className="py-2.5 px-4 text-right font-semibold bg-slate-50/70 text-slate-700">
                  100.0%
                </td>
                {pipelineAnalytics.quarterly.map((q) => (
                  <td key={q.quarter} className="py-2.5 px-4 text-right text-slate-500">
                    {q.weightPct}%
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-3 px-5 font-medium text-slate-800">ARR Target ($M)</td>
                <td className="py-3 px-4 text-right font-semibold bg-slate-50/70 text-slate-900">
                  {formatMillions(arrTarget2027)}
                </td>
                {pipelineAnalytics.quarterly.map((q) => (
                  <td key={q.quarter} className="py-3 px-4 text-right text-slate-700">
                    {formatMillions(q.targetArr)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-2.5 px-5 font-medium text-slate-600">
                  Cumulative ARR Target ($M)
                </td>
                <td className="py-2.5 px-4 text-right font-semibold bg-slate-50/70 text-slate-700">
                  {formatMillions(arrTarget2027)}
                </td>
                {pipelineAnalytics.quarterly.map((q) => (
                  <td key={q.quarter} className="py-2.5 px-4 text-right text-slate-500">
                    {formatMillions(q.cumulativeTargetArr)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-3 px-5 font-medium text-slate-800">Closed Deals Required</td>
                <td className="py-3 px-4 text-right font-semibold bg-slate-50/70 text-slate-900">
                  {pipelineAnalytics.closedDealsRequired}
                </td>
                {pipelineAnalytics.quarterly.map((q) => (
                  <td key={q.quarter} className="py-3 px-4 text-right text-slate-700">
                    {q.closedRequired}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-3 px-5 font-medium text-slate-800">
                  Active Qualified Deals (Stage 2+)
                </td>
                <td className="py-3 px-4 text-right font-semibold bg-slate-50/70 text-indigo-700">
                  {pipelineAnalytics.qualifiedDealsCount}
                </td>
                {pipelineAnalytics.quarterly.map((q) => (
                  <td
                    key={q.quarter}
                    className="py-3 px-4 text-right font-medium text-indigo-700"
                  >
                    {q.activeQualifiedCount}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-2.5 px-5 font-medium text-slate-800">
                  Qualified Pipeline (Stage 2+) ($M)
                </td>
                <td className="py-2.5 px-4 text-right font-semibold bg-slate-50/70 text-indigo-700">
                  {formatMillions(pipelineAnalytics.qualifiedPipelineArr)}
                </td>
                {pipelineAnalytics.quarterly.map((q) => (
                  <td key={q.quarter} className="py-2.5 px-4 text-right text-indigo-700">
                    {formatMillions(q.qualifiedArr)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-3 px-5 font-medium text-slate-800">
                  Required Deal Pipeline ({coverageMultiple}x Coverage)
                </td>
                <td className="py-3 px-4 text-right font-semibold bg-slate-50/70 text-slate-900">
                  {formatMillions(pipelineAnalytics.recommendedCoverageArr)}
                </td>
                {pipelineAnalytics.quarterly.map((q) => (
                  <td key={q.quarter} className="py-3 px-4 text-right text-slate-600">
                    {formatMillions(q.requiredPipeline)}
                  </td>
                ))}
              </tr>
              <tr className="bg-blue-50/30">
                <td className="py-3 px-5 font-semibold text-slate-900">
                  Actual Pipeline Coverage ($M)
                </td>
                <td className="py-3 px-4 text-right font-bold bg-blue-50/60 text-slate-900">
                  {formatMillions(pipelineAnalytics.actualPipelineArr)}
                </td>
                {pipelineAnalytics.quarterly.map((q) => (
                  <td
                    key={q.quarter}
                    className="py-3 px-4 text-right font-semibold text-slate-900"
                  >
                    {formatMillions(q.actualCoverage)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-3 px-5 font-medium text-slate-800">
                  Weighted Pipeline ARR ($M)
                </td>
                <td className="py-3 px-4 text-right font-semibold bg-slate-50/70 text-blue-700">
                  {formatMillions(pipelineAnalytics.weightedPipelineArr)}
                </td>
                {pipelineAnalytics.quarterly.map((q) => (
                  <td
                    key={q.quarter}
                    className="py-3 px-4 text-right font-medium text-blue-700"
                  >
                    {formatMillions(q.weightedArr)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-2.5 px-5 font-medium text-slate-800">
                  Pipeline Coverage Gap ($M)
                </td>
                <td className="py-2.5 px-4 text-right font-semibold bg-slate-50/70 text-amber-700">
                  {formatMillions(pipelineAnalytics.coverageGapArr)}
                </td>
                {pipelineAnalytics.quarterly.map((q) => (
                  <td key={q.quarter} className="py-2.5 px-4 text-right text-amber-700">
                    {formatMillions(q.pipelineGapArr)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-2.5 px-5 font-medium text-slate-800">
                  Net-New Deals Needed (@ Avg ACV)
                </td>
                <td className="py-2.5 px-4 text-right font-semibold bg-slate-50/70 text-slate-800">
                  {pipelineAnalytics.netNewDealsNeeded}
                </td>
                {pipelineAnalytics.quarterly.map((q) => (
                  <td key={q.quarter} className="py-2.5 px-4 text-right text-slate-700">
                    {q.newDealsRequired}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-2.5 px-5 font-medium text-slate-800">
                  Actual Coverage Multiple (Pipeline ÷ Target)
                </td>
                <td className="py-2.5 px-4 text-right font-semibold bg-slate-50/70 text-slate-800">
                  {pipelineAnalytics.pipelineCoverageMultipleActual.toFixed(2)}x
                </td>
                {pipelineAnalytics.quarterly.map((q) => (
                  <td key={q.quarter} className="py-2.5 px-4 text-right text-slate-700">
                    {q.coverageMultipleActual.toFixed(2)}x
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-3 px-5 font-medium text-slate-800">
                  Coverage vs. {coverageMultiple}x Target (%)
                </td>
                <td className="py-3 px-4 text-right font-semibold bg-slate-50/70">
                  <span
                    className={`px-2 py-0.5 rounded ${
                      pipelineAnalytics.coverageVsTargetPct >= 50
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {pipelineAnalytics.coverageVsTargetPct}%
                  </span>
                </td>
                {pipelineAnalytics.quarterly.map((q) => (
                  <td key={q.quarter} className="py-3 px-4 text-right">
                    <span
                      className={`px-2 py-0.5 rounded font-medium ${
                        q.coveragePct >= 40
                          ? 'bg-emerald-50 text-emerald-700'
                          : q.coveragePct >= 15
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-rose-50 text-rose-700'
                      }`}
                    >
                      {q.coveragePct}%
                    </span>
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-2.5 px-5 font-medium text-slate-800">
                  Weighted Attainment vs. ARR Target (%)
                </td>
                <td className="py-2.5 px-4 text-right font-semibold bg-slate-50/70 text-blue-700">
                  {pipelineAnalytics.weightedAttainmentPct}%
                </td>
                {pipelineAnalytics.quarterly.map((q) => (
                  <td key={q.quarter} className="py-2.5 px-4 text-right text-blue-700">
                    {q.weightedAttainmentPct}%
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-3 px-5 font-medium text-slate-800">
                  Required Win Rate (Target ÷ Pipeline %)
                </td>
                <td
                  className={`py-3 px-4 text-right font-semibold bg-slate-50/70 ${
                    pipelineAnalytics.requiredWinRatePct > 100
                      ? 'text-rose-600'
                      : 'text-slate-700'
                  }`}
                >
                  {pipelineAnalytics.requiredWinRatePct}%
                </td>
                {pipelineAnalytics.quarterly.map((q) => (
                  <td
                    key={q.quarter}
                    className={`py-3 px-4 text-right ${
                      q.reqWinRate > 100 ? 'text-rose-600 font-medium' : 'text-slate-600'
                    }`}
                  >
                    {q.reqWinRate}%
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Middle Row: Pipeline by Stage + Persona & Region */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                <CmsText
                  id="pipeline_health.stage_table.title"
                  defaultValue="Pipeline Distribution & Formula Weights by Stage"
                  section="Pipeline Health"
                />
              </h3>
              <p className="text-xs text-slate-400">
                <CmsText
                  id="pipeline_health.stage_table.subtitle"
                  defaultValue="Unweighted vs. probability-weighted ARR ($M), share, avg ACV, and stage aging"
                  section="Pipeline Health"
                />
              </p>
            </div>
            <button
              type="button"
              onClick={onNavigateToCustomers}
              className="text-xs font-medium text-indigo-600 hover:underline inline-flex items-center gap-1 whitespace-nowrap"
            >
              Edit Deals <ArrowUpRight size={13} />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs tabular-nums">
              <thead>
                <tr className="bg-slate-50/80 border-b border-[#E2E8F0] text-[11px] font-semibold tracking-wider text-slate-500">
                  <th className="py-2.5 px-4">Sales Stage</th>
                  <th className="py-2.5 px-2.5 text-right">Prob</th>
                  <th className="py-2.5 px-2.5 text-right">Deals</th>
                  <th className="py-2.5 px-2.5 text-right">Pipeline</th>
                  <th className="py-2.5 px-2.5 text-right">Share</th>
                  <th className="py-2.5 px-2.5 text-right">Weighted</th>
                  <th className="py-2.5 px-2.5 text-right">Avg ACV</th>
                  <th className="py-2.5 px-4 text-right">Avg Age</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pipelineAnalytics.byStage.map((row) => (
                  <tr key={row.stage} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${getStageBadgeStyle(
                          row.stage
                        )}`}
                      >
                        {row.stage}
                      </span>
                    </td>
                    <td className="py-2.5 px-2.5 text-right text-slate-500">
                      {row.stageProbPct}%
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-medium text-slate-700">
                      {row.count}
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-semibold text-slate-900">
                      {formatMillions(row.arr)}
                    </td>
                    <td className="py-2.5 px-2.5 text-right text-slate-500">{row.sharePct}%</td>
                    <td className="py-2.5 px-2.5 text-right font-medium text-blue-700">
                      {formatMillions(row.weighted)}
                    </td>
                    <td className="py-2.5 px-2.5 text-right text-slate-600">
                      {formatMillions(row.avgAcv)}
                    </td>
                    <td className="py-2.5 px-4 text-right text-slate-500">
                      {row.count > 0 ? `${row.avgAgingDays}d` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-[#E2E8F0] rounded-lg p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Pipeline by Buyer Persona</h3>
            <div className="grid grid-cols-2 gap-3">
              {pipelineAnalytics.byPersona.map((p) => (
                <div
                  key={p.persona}
                  className="p-3 rounded-md bg-slate-50 border border-slate-200/70"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-slate-500">{p.persona}</span>
                    <span className="text-slate-400 tabular-nums">{p.sharePct}%</span>
                  </div>
                  <div className="text-lg font-semibold text-slate-900 mt-0.5 tabular-nums">
                    {formatMillions(p.arr)}
                  </div>
                  <div className="text-[11px] text-slate-400 tabular-nums">
                    {p.count} accts · {formatMillions(p.weighted)} wtd
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-[#E2E8F0] rounded-lg p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Pipeline by Geography</h3>
            <div className="space-y-2 text-xs">
              {pipelineAnalytics.byRegion.map((r) => (
                <div
                  key={r.region}
                  className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-medium border ${getRegionBadgeStyle(
                        r.region
                      )}`}
                    >
                      {r.region}
                    </span>
                    <span className="text-slate-400 tabular-nums">
                      {r.count} deals · {r.sharePct}%
                    </span>
                  </div>
                  <div className="text-right tabular-nums">
                    <span className="font-semibold text-slate-900">{formatMillions(r.arr)}</span>
                    <span className="text-slate-400 text-[11px] ml-1.5">
                      ({formatMillions(r.weighted)} wtd)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row: Deal Aging Buckets + Autonomous Agent Next Best Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-white border border-[#E2E8F0] rounded-lg p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              <CmsText
                id="pipeline_health.aging.title"
                defaultValue="Deal Velocity & Aging"
                section="Pipeline Health"
              />
            </h3>
            <p className="text-xs text-slate-400">
              <CmsText
                id="pipeline_health.aging.subtitle"
                defaultValue="Flags deals exceeding 90 days in current stage"
                section="Pipeline Health"
              />
            </p>
          </div>

          <div className="space-y-3">
            {pipelineAnalytics.agingBuckets.map((b) => {
              const bucketArr = b.deals.reduce((s, d) => s + (d.amount_usd || 0), 0);
              return (
                <div
                  key={b.label}
                  className="p-3 rounded-md border border-[#E2E8F0] flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${b.color}`} />
                    <div className="min-w-0">
                      <div className="font-medium text-slate-800">{b.label}</div>
                      <div className="text-[11px] text-slate-400 truncate">
                        {b.deals.map((d) => d.organization).join(', ') || 'None'}
                      </div>
                    </div>
                  </div>
                  <div className="text-right tabular-nums shrink-0 ml-2">
                    <div className="font-semibold text-slate-900">
                      {formatMillions(bucketArr)}
                    </div>
                    <div className="text-[11px] text-slate-400">{b.deals.length} deals</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-7 bg-white border border-[#E2E8F0] rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-[#0D1520] text-sky-400 flex items-center justify-center shrink-0">
              <Sparkles size={15} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                <CmsText
                  id="pipeline_health.agent.title"
                  defaultValue="Pipeline Intelligence Agent — Priority Actions"
                  section="Pipeline Health"
                />
              </h3>
              <p className="text-xs text-slate-400">
                <CmsText
                  id="pipeline_health.agent.subtitle"
                  defaultValue="Auto-detected stale deals (>90d) & high-weighted Q1 closers"
                  section="Pipeline Health"
                />
              </p>
            </div>
          </div>

          {pipelineAnalytics.staleDeals.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-md">
              No active deals exceed the 90-day aging threshold.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 border border-[#E2E8F0] rounded-md">
              {pipelineAnalytics.staleDeals.map((deal) => (
                <div
                  key={deal.id}
                  className="p-3.5 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 text-xs hover:bg-slate-50/70"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900">{deal.organization}</span>
                      <span className="text-slate-400">· {deal.full_name}</span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-semibold tabular-nums">
                        <AlertTriangle size={10} />
                        {deal.aging_days}d in funnel
                      </span>
                      <span className="font-semibold text-slate-700 tabular-nums">
                        {formatMillions(deal.amount_usd)}
                      </span>
                    </div>
                    <div className="text-slate-600">{deal.next_step}</div>
                  </div>

                  <button
                    type="button"
                    disabled={!canSendCampaigns}
                    title={!canSendCampaigns ? 'Requires can_send_campaigns permission' : undefined}
                    onClick={() =>
                      onDraftFollowUp(
                        deal,
                        `Quick check-in on ${deal.organization} — Fortifai Q1 Roadmap`,
                        `Hi ${deal.first_name},\n\nWanted to circle back on ${deal.next_step?.toLowerCase() || 'our continuous assurance review'} for ${deal.organization}.\n\nWe've just published an updated executive walkthrough for ${deal.buyer_persona} leaders and would love to walk through what's new.\n\nDo you have 15 minutes this week to align on next steps?\n\nBest,\nVarun Mowar\nCo-Founder & CEO, Fortifai`
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#0D1520] rounded-md hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed shrink-0 whitespace-nowrap"
                  >
                    <Send size={12} />
                    Draft Follow-Up in Composer
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
