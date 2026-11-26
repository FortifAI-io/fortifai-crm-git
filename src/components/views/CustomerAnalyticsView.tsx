import {
  ArrowUpRight,
  Award,
  Building2,
  Globe,
  Layers,
  SlidersHorizontal,
  TrendingUp,
  Upload,
} from 'lucide-react';
import { US_SALES_PIPELINE_BENCHMARKS } from '../../data/seedData';
import type { Contact, CustomerAnalytics, Region } from '../../types/crm';
import { formatCurrency, getRegionBadgeStyle, getStageBadgeStyle } from '../../utils/crmHelpers';
import { CmsText } from '../CmsText';

interface CustomerAnalyticsViewProps {
  analytics: CustomerAnalytics;
  canEditCustomers: boolean;
  onNavigateToCustomers: (filters?: {
    region?: 'All' | Region;
    tier?: 'All' | 'Tier I' | 'Tier II';
    sector?: string;
  }) => void;
  onSelectContact: (id: string) => void;
  onOpenImport: () => void;
}

export function CustomerAnalyticsView({
  analytics,
  canEditCustomers,
  onNavigateToCustomers,
  onSelectContact,
  onOpenImport,
}: CustomerAnalyticsViewProps) {
  const maxSectorArr = Math.max(1, ...analytics.bySector.map((s) => s.arr));
  const maxRegionArr = Math.max(1, ...analytics.byRegion.map((r) => r.arr));
  const maxScoreCount = Math.max(1, ...analytics.byScoreBand.map((b) => b.count));

  return (
    <div className="p-6 space-y-6 max-w-[1600px] w-full mx-auto">
      {/* Top Action & Summary Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-[#E2E8F0] rounded-lg px-5 py-3.5">
        <div className="flex items-center gap-3 text-xs text-slate-600 flex-wrap">
          <span className="font-semibold text-slate-900">
            <CmsText
              id="customer_analytics.overview.title"
              defaultValue="Customer Intelligence Overview"
              section="Customer Intelligence"
            />
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <CmsText
              id="customer_analytics.overview.subtitle"
              defaultValue="Live breakdown across sectors, geographies, tiers, ICP fit scores, and custom sheet columns"
              section="Customer Intelligence"
            />
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={!canEditCustomers}
            onClick={onOpenImport}
            title={!canEditCustomers ? 'Requires can_edit_customers permission' : undefined}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md hover:bg-indigo-100 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
          >
            <Upload size={13} />
            Import Sheet / Excel
          </button>
        </div>
      </div>

      {/* 6-Card Customer KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 tabular-nums">
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
          <div className="text-xs text-slate-500 font-medium">
            <CmsText
              id="customer_analytics.kpi.total_customers"
              defaultValue="Total Customers"
              section="Customer Intelligence"
            />
          </div>
          <div className="text-2xl font-semibold text-slate-900 mt-1">
            {analytics.totalAccounts}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {analytics.bySector.length} sectors · {analytics.byRegion.length} regions
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
          <div className="text-xs text-slate-500 font-medium">
            <CmsText
              id="customer_analytics.kpi.total_arr"
              defaultValue="Total Customer ARR"
              section="Customer Intelligence"
            />
          </div>
          <div className="text-2xl font-semibold text-slate-900 mt-1">
            {formatCurrency(analytics.totalArr)}
          </div>
          <div className="text-[11px] text-blue-600 mt-1 font-medium">
            {formatCurrency(analytics.weightedArr)} weighted
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
          <div className="text-xs text-slate-500 font-medium">Average ACV</div>
          <div className="text-2xl font-semibold text-slate-900 mt-1">
            {formatCurrency(analytics.avgAcv)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Per tracked account</div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
          <div className="text-xs text-slate-500 font-medium">Average ICP Score</div>
          <div className="text-2xl font-semibold text-emerald-600 mt-1">
            {analytics.avgIcpScore}
            <span className="text-xs font-normal text-slate-400"> / 100</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Qualification fit index</div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
          <div className="text-xs text-slate-500 font-medium">Fortune 500 Accounts</div>
          <div className="text-2xl font-semibold text-slate-900 mt-1">
            {analytics.fortune500Count}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {formatCurrency(analytics.fortune500Arr)} ARR
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
          <div className="text-xs text-slate-500 font-medium">Tier I Share</div>
          <div className="text-2xl font-semibold text-indigo-600 mt-1">
            {analytics.totalAccounts > 0
              ? Math.round((analytics.tierIStats.count / analytics.totalAccounts) * 100)
              : 0}
            %
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {analytics.tierIStats.count} Tier I vs {analytics.tierIIStats.count} Tier II
          </div>
        </div>
      </div>

      {/* Row 1: Sector Breakdown + Location & Geography Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Sectors / Industry Breakdown */}
        <div className="lg:col-span-7 bg-white border border-[#E2E8F0] rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 size={16} className="text-slate-700" />
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Customers by Sector &amp; Industry
                </h2>
                <p className="text-xs text-slate-400">
                  Click any sector to filter accounts in Enterprise Customers
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigateToCustomers()}
              className="text-xs font-medium text-indigo-600 hover:underline inline-flex items-center gap-1 whitespace-nowrap"
            >
              View All Accounts <ArrowUpRight size={13} />
            </button>
          </div>

          {analytics.bySector.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-md">
              No customer sectors recorded yet. Import a sheet or add a customer.
            </div>
          ) : (
            <div className="space-y-3 pt-1">
              {analytics.bySector.map((row) => {
                const widthPct = Math.max(6, Math.round((row.arr / maxSectorArr) * 100));
                return (
                  <button
                    key={row.sector}
                    type="button"
                    onClick={() => onNavigateToCustomers({ sector: row.sector })}
                    className="w-full text-left group space-y-1.5 hover:bg-slate-50 p-1.5 -mx-1.5 rounded-md transition-colors"
                  >
                    <div className="flex items-center justify-between text-xs gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium text-slate-900 group-hover:text-indigo-600 truncate">
                          {row.sector}
                        </span>
                        <span className="text-slate-400 tabular-nums shrink-0">
                          {row.count} {row.count === 1 ? 'account' : 'accounts'} · Avg Score{' '}
                          {row.avgScore}
                        </span>
                      </div>
                      <div className="tabular-nums font-semibold text-slate-800 shrink-0">
                        {formatCurrency(row.arr)}{' '}
                        <span className="text-slate-400 font-normal">({row.sharePct}%)</span>
                      </div>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#0D1520] group-hover:bg-indigo-600 rounded-full transition-all duration-300"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Location & Regional Footprint */}
        <div className="lg:col-span-5 bg-white border border-[#E2E8F0] rounded-lg p-5 space-y-5">
          <div className="flex items-center gap-2">
            <Globe size={16} className="text-slate-700" />
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Geography &amp; Hub Locations
              </h2>
              <p className="text-xs text-slate-400">
                ARR concentration and average ICP score by region &amp; city
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {analytics.byRegion.map((reg) => {
              const widthPct = Math.max(6, Math.round((reg.arr / maxRegionArr) * 100));
              return (
                <button
                  key={reg.region}
                  type="button"
                  onClick={() => onNavigateToCustomers({ region: reg.region })}
                  className="w-full text-left space-y-1 hover:bg-slate-50 p-1.5 -mx-1.5 rounded-md transition-colors"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-medium border ${getRegionBadgeStyle(
                          reg.region
                        )}`}
                      >
                        {reg.region}
                      </span>
                      <span className="text-slate-400 tabular-nums">
                        {reg.count} accts · Score {reg.avgScore}
                      </span>
                    </div>
                    <span className="font-semibold text-slate-900 tabular-nums">
                      {formatCurrency(reg.arr)}{' '}
                      <span className="text-slate-400 font-normal">({reg.sharePct}%)</span>
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-sky-600 rounded-full"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>

          {/* Top Cities */}
          <div className="border-t border-slate-100 pt-4 space-y-2">
            <div className="text-[11px] font-semibold text-slate-500">Top Customer Hubs</div>
            <div className="grid grid-cols-2 gap-2 text-xs tabular-nums">
              {analytics.byLocation.slice(0, 6).map((loc) => (
                <div
                  key={loc.location}
                  className="p-2.5 rounded-md bg-slate-50 border border-slate-200/70 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-slate-800 truncate">{loc.location}</div>
                    <div className="text-[10px] text-slate-400">
                      {loc.count} {loc.count === 1 ? 'account' : 'accounts'}
                    </div>
                  </div>
                  <div className="font-semibold text-slate-900 shrink-0">
                    {formatCurrency(loc.arr)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Tier Comparison + ICP Score Distribution + Owner Attribution */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Tier Breakdown */}
        <div className="lg:col-span-4 bg-white border border-[#E2E8F0] rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Layers size={16} className="text-slate-700" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Breakdown by Tier</h3>
              <p className="text-xs text-slate-400">
                Enterprise Tier I vs Tier II deal metrics
              </p>
            </div>
          </div>

          <div className="space-y-3 tabular-nums">
            <button
              type="button"
              onClick={() => onNavigateToCustomers({ tier: 'Tier I' })}
              className="w-full text-left p-3.5 rounded-md bg-slate-50 border border-[#E2E8F0] hover:border-slate-300 transition-colors space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-900">Tier I (Enterprise)</span>
                <span className="text-xs font-semibold text-indigo-700">
                  {formatCurrency(analytics.tierIStats.arr)}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-[11px] text-slate-600">
                <div>
                  <span className="text-slate-400 block">Accounts</span>
                  <strong className="text-slate-900">{analytics.tierIStats.count}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Avg Score</span>
                  <strong className="text-emerald-700">{analytics.tierIStats.avgScore}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Avg Aging</span>
                  <strong className="text-slate-900">{analytics.tierIStats.avgAging}d</strong>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigateToCustomers({ tier: 'Tier II' })}
              className="w-full text-left p-3.5 rounded-md bg-slate-50 border border-[#E2E8F0] hover:border-slate-300 transition-colors space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-900">
                  Tier II (Mid-Enterprise)
                </span>
                <span className="text-xs font-semibold text-slate-700">
                  {formatCurrency(analytics.tierIIStats.arr)}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-[11px] text-slate-600">
                <div>
                  <span className="text-slate-400 block">Accounts</span>
                  <strong className="text-slate-900">{analytics.tierIIStats.count}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Avg Score</span>
                  <strong className="text-slate-900">{analytics.tierIIStats.avgScore}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Avg Aging</span>
                  <strong className="text-slate-900">{analytics.tierIIStats.avgAging}d</strong>
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* ICP Score Distribution */}
        <div className="lg:col-span-4 bg-white border border-[#E2E8F0] rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Award size={16} className="text-slate-700" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900">ICP Fit Score Bands</h3>
              <p className="text-xs text-slate-400">
                Account distribution across qualification scores
              </p>
            </div>
          </div>

          <div className="space-y-3 tabular-nums">
            {analytics.byScoreBand.map((band) => {
              const pct = Math.round((band.count / maxScoreCount) * 100);
              return (
                <div key={band.label} className="space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${band.color}`} />
                      <span className="font-medium text-slate-800">{band.label}</span>
                      <span className="text-[11px] text-slate-400">({band.range})</span>
                    </div>
                    <div className="font-semibold text-slate-900">
                      {band.count} · {formatCurrency(band.arr)}
                    </div>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${band.color}`}
                      style={{ width: `${Math.max(band.count > 0 ? 8 : 0, pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Owner Leaderboard */}
        <div className="lg:col-span-4 bg-white border border-[#E2E8F0] rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className="text-slate-700" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Pipeline by Account Owner</h3>
              <p className="text-xs text-slate-400">Territory ownership and avg fit score</p>
            </div>
          </div>

          <div className="divide-y divide-slate-100 text-xs tabular-nums">
            {analytics.byOwner.map((o) => (
              <div key={o.owner} className="py-2.5 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-900">{o.owner}</div>
                  <div className="text-[11px] text-slate-400">
                    {o.count} accounts · Avg ICP {o.avgScore}
                  </div>
                </div>
                <div className="text-right font-semibold text-slate-900">
                  {formatCurrency(o.arr)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 3: Dynamic Custom Data Column Insights (Auto-populated from Sheet/Custom Columns) */}
      {analytics.customColumnInsights.length > 0 && (
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <SlidersHorizontal size={16} className="text-indigo-600" />
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Custom Data Column Insights
                </h3>
                <p className="text-xs text-slate-400">
                  Automatically generated from your custom columns and imported spreadsheets
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {analytics.customColumnInsights.map((insight) => (
              <div
                key={insight.field.id}
                className="p-4 rounded-md bg-slate-50 border border-[#E2E8F0] space-y-2.5 text-xs tabular-nums"
              >
                <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                  <span className="font-semibold text-slate-900">
                    {insight.field.field_label}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {insight.populatedCount}/{analytics.totalAccounts} filled
                  </span>
                </div>

                {insight.breakdown.length === 0 ? (
                  <div className="text-[11px] text-slate-400 py-2">
                    No values populated yet for this column.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {insight.breakdown.slice(0, 5).map((item) => (
                      <div
                        key={item.label}
                        className="flex items-center justify-between text-[11px]"
                      >
                        <span className="text-slate-700 truncate max-w-[160px]">
                          {item.label}
                        </span>
                        <span className="font-medium text-slate-900 shrink-0">
                          {item.count} accts · {formatCurrency(item.arr)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Row 4: Top Scored Accounts Table */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Highest-Scoring Customer Accounts (ICP Score Leaderboard)
            </h3>
            <p className="text-xs text-slate-400">
              Click any row to inspect details, edit custom columns, or draft outreach
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs tabular-nums">
            <thead>
              <tr className="bg-slate-50/80 border-b border-[#E2E8F0] text-[11px] font-semibold tracking-wider text-slate-500">
                <th className="py-2.5 px-4">Account</th>
                <th className="py-2.5 px-4">Sector</th>
                <th className="py-2.5 px-4">Location</th>
                <th className="py-2.5 px-4">Tier</th>
                <th className="py-2.5 px-4 text-right">ICP Score</th>
                <th className="py-2.5 px-4">Stage</th>
                <th className="py-2.5 px-4 text-right">Target ARR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {analytics.topAccounts.map((acc) => (
                <tr
                  key={acc.id}
                  onClick={() => onSelectContact(acc.id)}
                  className="hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <td className="py-2.5 px-4 font-medium text-slate-900">
                    {acc.organization}
                    <span className="text-slate-400 font-normal ml-1.5">· {acc.full_name}</span>
                  </td>
                  <td className="py-2.5 px-4 text-slate-600">{acc.industry || '—'}</td>
                  <td className="py-2.5 px-4 text-slate-600">
                    {acc.region} · {acc.location}
                  </td>
                  <td className="py-2.5 px-4 text-slate-700 font-medium">{acc.tier || '—'}</td>
                  <td className="py-2.5 px-4 text-right font-semibold text-emerald-700">
                    {acc.icp_score ?? '—'}
                  </td>
                  <td className="py-2.5 px-4">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[11px] border font-medium ${getStageBadgeStyle(
                        acc.stage
                      )}`}
                    >
                      {acc.stage}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-right font-semibold text-slate-900">
                    {formatCurrency(acc.amount_usd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Row 5: US Addressable ICP Universe (1,669 Contacts) — From US Sales Pipeline DB */}
      <div className="space-y-6 pt-2">
        <div className="flex flex-wrap items-center justify-between gap-2 bg-white border border-[#E2E8F0] rounded-lg px-5 py-3.5">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              US Addressable Enterprise Universe ({US_SALES_PIPELINE_BENCHMARKS.totalAddressableContacts.toLocaleString()} Contacts)
            </h2>
            <p className="text-xs text-slate-400">
              Replicated from US Sales Pipeline workbook — {US_SALES_PIPELINE_BENCHMARKS.totalTierI.toLocaleString()} Tier I (
              {((US_SALES_PIPELINE_BENCHMARKS.totalTierI / US_SALES_PIPELINE_BENCHMARKS.totalAddressableContacts) * 100).toFixed(1)}
              %) · {US_SALES_PIPELINE_BENCHMARKS.totalTierII.toLocaleString()} Tier II · Avg Fit Score{' '}
              {US_SALES_PIPELINE_BENCHMARKS.avgFitScore}
            </p>
          </div>
          <span className="text-[11px] font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-2.5 py-1">
            GTM &amp; ICP Baseline Model
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Buyer Persona Breakdown */}
          <div className="lg:col-span-6 bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E2E8F0]">
              <h3 className="text-sm font-semibold text-slate-900">
                Buyer Persona Breakdown by Account Tier
              </h3>
              <p className="text-xs text-slate-400">
                Multi-threaded buying centers across CCO/GC, CAE, CFO/CAO &amp; CPO
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs tabular-nums">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-[#E2E8F0] text-[11px] font-semibold tracking-wider text-slate-500">
                    <th className="py-2.5 px-4">Buyer Persona &amp; Role</th>
                    <th className="py-2.5 px-3 text-right">Tier I</th>
                    <th className="py-2.5 px-3 text-right">Tier II</th>
                    <th className="py-2.5 px-3 text-right">Total</th>
                    <th className="py-2.5 px-4 text-right">Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {US_SALES_PIPELINE_BENCHMARKS.buyerPersonaBreakdown.map((row) => {
                    const rowTotal = row.tierI + row.tierII;
                    const sharePct = (
                      (rowTotal / US_SALES_PIPELINE_BENCHMARKS.totalAddressableContacts) *
                      100
                    ).toFixed(1);
                    return (
                      <tr key={row.personaCode} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-4">
                          <div className="font-medium text-slate-900">{row.roleLabel}</div>
                          <div className="text-[10px] text-slate-400 truncate max-w-[280px]">
                            {row.playbook}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-700">{row.tierI}</td>
                        <td className="py-2.5 px-3 text-right text-slate-700">{row.tierII}</td>
                        <td className="py-2.5 px-3 text-right font-semibold text-slate-900">
                          {rowTotal}
                        </td>
                        <td className="py-2.5 px-4 text-right text-slate-500">{sharePct}%</td>
                      </tr>
                    );
                  })}
                  <tr className="bg-slate-50 font-semibold text-slate-900 border-t border-[#E2E8F0]">
                    <td className="py-2.5 px-4">Total Addressable Contacts</td>
                    <td className="py-2.5 px-3 text-right">
                      {US_SALES_PIPELINE_BENCHMARKS.totalTierI}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {US_SALES_PIPELINE_BENCHMARKS.totalTierII}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {US_SALES_PIPELINE_BENCHMARKS.totalAddressableContacts.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-4 text-right">100.0%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Enterprise Profile Analysis + Fit Score Distribution */}
          <div className="lg:col-span-6 space-y-6">
            <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
              <div className="px-5 py-4 border-b border-[#E2E8F0]">
                <h3 className="text-sm font-semibold text-slate-900">
                  Enterprise Profile Analysis — F500 &amp; Listing Status
                </h3>
                <p className="text-xs text-slate-400">
                  Regulatory surface across Fortune 500, US Public &amp; Private enterprises
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs tabular-nums">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-[#E2E8F0] text-[11px] font-semibold tracking-wider text-slate-500">
                      <th className="py-2 px-4">Enterprise Segment</th>
                      <th className="py-2 px-3 text-right">Total</th>
                      <th className="py-2 px-3 text-right">Share</th>
                      <th className="py-2 px-3 text-right">Tier I</th>
                      <th className="py-2 px-4 text-right">Tier II</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {US_SALES_PIPELINE_BENCHMARKS.enterpriseProfileAnalysis.map((row) => (
                      <tr key={row.segment} className="hover:bg-slate-50/70">
                        <td className="py-2 px-4">
                          <div className="font-medium text-slate-900">{row.segment}</div>
                          <div className="text-[10px] text-slate-400 truncate max-w-[260px]">
                            {row.positioning}
                          </div>
                        </td>
                        <td className="py-2 px-3 text-right font-semibold text-slate-900">
                          {row.totalContacts}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-500">
                          {(
                            (row.totalContacts /
                              US_SALES_PIPELINE_BENCHMARKS.totalAddressableContacts) *
                            100
                          ).toFixed(1)}
                          %
                        </td>
                        <td className="py-2 px-3 text-right text-indigo-700 font-medium">
                          {row.tierI}
                        </td>
                        <td className="py-2 px-4 text-right text-slate-600">{row.tierII}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
              <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Account Fit Score Distribution
                  </h3>
                  <p className="text-xs text-slate-400">
                    Avg Composite Fit Score: {US_SALES_PIPELINE_BENCHMARKS.avgFitScore}
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs tabular-nums">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-[#E2E8F0] text-[11px] font-semibold tracking-wider text-slate-500">
                      <th className="py-2 px-4">Classification Band</th>
                      <th className="py-2 px-3">Range</th>
                      <th className="py-2 px-3 text-right">Contacts</th>
                      <th className="py-2 px-3 text-right">% Base</th>
                      <th className="py-2 px-4 text-right">Tier I Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {US_SALES_PIPELINE_BENCHMARKS.fitScoreDistribution.map((row) => (
                      <tr key={row.band} className="hover:bg-slate-50/70">
                        <td className="py-2 px-4 font-medium text-slate-900">{row.band}</td>
                        <td className="py-2 px-3 text-slate-500">{row.scoreRange}</td>
                        <td className="py-2 px-3 text-right font-semibold text-slate-900">
                          {row.totalContacts}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-500">
                          {(
                            (row.totalContacts /
                              US_SALES_PIPELINE_BENCHMARKS.totalAddressableContacts) *
                            100
                          ).toFixed(1)}
                          %
                        </td>
                        <td className="py-2 px-4 text-right font-medium text-emerald-700">
                          {row.tierISharePct.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Go-To-Market Strategy & ICP Matrix */}
        <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E2E8F0]">
            <h3 className="text-sm font-semibold text-slate-900">
              Go-To-Market Strategy &amp; ICP Matrix
            </h3>
            <p className="text-xs text-slate-400">
              Target enterprise specification, regulatory triggers, value proposition, and buyer
              stakeholders
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-[#E2E8F0] text-[11px] font-semibold tracking-wider text-slate-500">
                  <th className="py-2.5 px-4">Dimension</th>
                  <th className="py-2.5 px-4">Target Specification</th>
                  <th className="py-2.5 px-4">Key Criteria &amp; Focus Areas</th>
                  <th className="py-2.5 px-4">Primary Value Proposition</th>
                  <th className="py-2.5 px-4">Products</th>
                  <th className="py-2.5 px-4">Stakeholders</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {US_SALES_PIPELINE_BENCHMARKS.gtmStrategy.map((row) => (
                  <tr key={row.dimension} className="hover:bg-slate-50/70 align-top">
                    <td className="py-2.5 px-4 font-semibold text-slate-900 whitespace-nowrap">
                      {row.dimension}
                    </td>
                    <td className="py-2.5 px-4 text-slate-700">{row.targetSpecification}</td>
                    <td className="py-2.5 px-4 text-slate-600">{row.keyCriteria}</td>
                    <td className="py-2.5 px-4 text-slate-700">{row.primaryValueProp}</td>
                    <td className="py-2.5 px-4 font-medium text-indigo-700 whitespace-nowrap">
                      {row.primaryProducts}
                    </td>
                    <td className="py-2.5 px-4 text-slate-500">{row.keyStakeholders}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
