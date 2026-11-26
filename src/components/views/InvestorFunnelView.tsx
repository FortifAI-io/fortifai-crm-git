import { ArrowUpRight, Flame, Send } from 'lucide-react';
import { useRbac } from '../../context/RbacContext';
import { CmsText } from '../CmsText';
import type { Contact, InvestorAnalytics } from '../../types/crm';
import { formatCurrency } from '../../utils/crmHelpers';

interface InvestorFunnelViewProps {
  investorAnalytics: InvestorAnalytics;
  seedRoundTarget: number;
  onNavigateToInvestors: () => void;
  onLogMeeting: (inv: Contact) => void;
  onSendNudge: (inv: Contact, subject: string, body: string) => void;
}

export function InvestorFunnelView({
  investorAnalytics,
  seedRoundTarget,
  onNavigateToInvestors,
  onLogMeeting,
  onSendNudge,
}: InvestorFunnelViewProps) {
  const { permissions } = useRbac();
  const canEditInvestors = permissions.can_edit_investors;
  const canSendCampaigns = permissions.can_send_campaigns;

  return (
    <div className="p-6 space-y-6 max-w-[1600px] w-full mx-auto">
      {/* $3M Seed Round Capital Progress */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-semibold text-slate-900">
                <CmsText
                  id="investor_funnel.hero.title"
                  defaultValue="$3,000,000 Seed Round Progress ($15M Post-Money Valuation Cap SAFE)"
                  section="Seed Funnel"
                />
              </h2>
              <span className="text-[11px] text-indigo-700 font-medium">
                · Live Auto-Computed
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              <CmsText
                id="investor_funnel.hero.subtitle"
                defaultValue="Synced with Investor Tracker DB & investor.fortifai.io SAFE / Portal webhooks"
                section="Seed Funnel"
              />
            </p>
          </div>

          <div className="flex items-center gap-6 text-xs tabular-nums">
            <div>
              <div className="text-slate-400">SAFE Signed / Committed</div>
              <div className="text-base font-semibold text-emerald-600">
                {formatCurrency(investorAnalytics.committedSafeUsd, false)}
              </div>
            </div>
            <div>
              <div className="text-slate-400">Soft Circle / Active Diligence</div>
              <div className="text-base font-semibold text-indigo-600">
                {formatCurrency(investorAnalytics.softCircledDiligenceUsd, false)}
              </div>
            </div>
            <div>
              <div className="text-slate-400">Remaining to Close</div>
              <div className="text-base font-semibold text-slate-900">
                {formatCurrency(investorAnalytics.remainingToCloseUsd, false)}
              </div>
            </div>
          </div>
        </div>

        {/* Stacked Progress Bar */}
        <div className="space-y-1.5">
          <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex">
            <div
              className="bg-emerald-500 h-full transition-all duration-300"
              style={{
                width: `${Math.min(
                  100,
                  (investorAnalytics.committedSafeUsd / seedRoundTarget) * 100
                )}%`,
              }}
              title="Committed / SAFE Signed"
            />
            <div
              className="bg-indigo-500 h-full transition-all duration-300"
              style={{
                width: `${Math.min(
                  100,
                  (investorAnalytics.softCircledDiligenceUsd / seedRoundTarget) * 100
                )}%`,
              }}
              title="Soft Circled / Active Diligence"
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 tabular-nums">
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Committed ({formatCurrency(investorAnalytics.committedSafeUsd)})
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-indigo-500" />
                Soft Circle &amp; Diligence (
                {formatCurrency(investorAnalytics.softCircledDiligenceUsd)})
              </span>
            </div>
            <span>Target: $3,000,000</span>
          </div>
        </div>
      </div>

      {/* Funnel Conversion KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 tabular-nums">
        {[
          {
            label: 'Total Tracked',
            value: investorAnalytics.total,
            sub: 'All global targets',
            accent: 'text-slate-900',
          },
          {
            label: 'US Inst. Seed',
            value: investorAnalytics.usInstSeedCount,
            sub: 'Core US Seed track',
            accent: 'text-slate-900',
          },
          {
            label: 'Active Outreach',
            value: investorAnalytics.activeOutreachCount,
            sub: `${investorAnalytics.sentCount} sent · ${investorAnalytics.scheduledCount} sched`,
            accent: 'text-slate-900',
          },
          {
            label: 'Email Open Rate',
            value: `${investorAnalytics.openRatePct}%`,
            sub: `${investorAnalytics.openedCount} opened`,
            accent: 'text-blue-600',
          },
          {
            label: 'Portal Visits',
            value: investorAnalytics.portalVisitsCount,
            sub: 'investor.fortifai.io',
            accent: 'text-indigo-600',
          },
          {
            label: 'Meetings Booked',
            value: investorAnalytics.meetingsOrDiligenceCount,
            sub: 'Active partner calls',
            accent: 'text-emerald-600',
          },
          {
            label: 'Passed (Suppressed)',
            value: investorAnalytics.passedCount,
            sub: `${investorAnalytics.activeExclPassesCount} active excl. passes`,
            accent: 'text-rose-600',
          },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white border border-[#E2E8F0] rounded-lg p-3.5">
            <div className="text-[11px] text-slate-500 font-medium">{kpi.label}</div>
            <div className={`text-xl font-semibold mt-1 ${kpi.accent}`}>{kpi.value}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* US Institutional Seed Execution (n = 47) + All Targets Priority Tier Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                US Institutional Seed Execution (n = {investorAnalytics.usInstSeedCount})
              </h3>
              <p className="text-xs text-slate-400">
                <CmsText
                  id="investor_funnel.us_seed.subtitle"
                  defaultValue="Live funnel across Cat A, Cat B, Wave 1 & Wave 2 US institutional seed tracks"
                  section="Seed Funnel"
                />
              </p>
            </div>
            <button
              type="button"
              onClick={onNavigateToInvestors}
              className="text-xs font-medium text-indigo-600 hover:underline inline-flex items-center gap-1 whitespace-nowrap"
            >
              Open Investor DB <ArrowUpRight size={13} />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs tabular-nums">
              <thead>
                <tr className="bg-slate-50/80 border-b border-[#E2E8F0] text-[11px] font-semibold tracking-wider text-slate-500">
                  <th className="py-2.5 px-4">Pipeline Stage / Track</th>
                  <th className="py-2.5 px-4 text-right">Funds</th>
                  <th className="py-2.5 px-4 text-right">% of US Seed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {investorAnalytics.usSeedBreakdown.map((row) => (
                  <tr
                    key={row.label}
                    className={
                      row.isHighlight ? 'bg-slate-50 font-semibold text-slate-900' : 'hover:bg-slate-50/70'
                    }
                  >
                    <td className="py-2.5 px-4 text-slate-800">{row.label}</td>
                    <td className="py-2.5 px-4 text-right font-semibold text-slate-900">
                      {row.count}
                    </td>
                    <td className="py-2.5 px-4 text-right text-slate-600">
                      {row.sharePct.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-6 bg-white border border-[#E2E8F0] rounded-lg overflow-hidden flex flex-col justify-between">
          <div>
            <div className="px-5 py-4 border-b border-[#E2E8F0]">
              <h3 className="text-sm font-semibold text-slate-900">
                All {investorAnalytics.total} Targets by Priority Tier
              </h3>
              <p className="text-xs text-slate-400">
                <CmsText
                  id="investor_funnel.priority.subtitle"
                  defaultValue="Conversion funnel across P1–P4 institutional, strategic & co-investor tiers"
                  section="Seed Funnel"
                />
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs tabular-nums">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-[#E2E8F0] text-[11px] font-semibold tracking-wider text-slate-500">
                    <th className="py-2.5 px-4">Tier</th>
                    <th className="py-2.5 px-2.5 text-right">Targets</th>
                    <th className="py-2.5 px-2.5 text-right">Sent</th>
                    <th className="py-2.5 px-2.5 text-right">Sched</th>
                    <th className="py-2.5 px-2.5 text-right">Opened</th>
                    <th className="py-2.5 px-2.5 text-right">Portal</th>
                    <th className="py-2.5 px-2.5 text-right">Mtgs</th>
                    <th className="py-2.5 px-4 text-right">Passed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {investorAnalytics.byPriority.map((row) => (
                    <tr key={row.priority} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-4 font-semibold text-slate-900">{row.priority}</td>
                      <td className="py-2.5 px-2.5 text-right font-medium text-slate-800">
                        {row.targets}
                      </td>
                      <td className="py-2.5 px-2.5 text-right text-slate-700">{row.sent}</td>
                      <td className="py-2.5 px-2.5 text-right text-amber-700">{row.scheduled}</td>
                      <td className="py-2.5 px-2.5 text-right text-blue-600 font-medium">
                        {row.opened}
                      </td>
                      <td className="py-2.5 px-2.5 text-right text-indigo-600 font-medium">
                        {row.portalVisits}
                      </td>
                      <td className="py-2.5 px-2.5 text-right text-emerald-600 font-semibold">
                        {row.meetings}
                      </td>
                      <td className="py-2.5 px-4 text-right text-rose-600">{row.passed}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 font-semibold text-slate-900 border-t border-[#E2E8F0]">
                    <td className="py-2.5 px-4">TOTAL</td>
                    <td className="py-2.5 px-2.5 text-right">
                      {investorAnalytics.priorityTotals.targets}
                    </td>
                    <td className="py-2.5 px-2.5 text-right">
                      {investorAnalytics.priorityTotals.sent}
                    </td>
                    <td className="py-2.5 px-2.5 text-right text-amber-700">
                      {investorAnalytics.priorityTotals.scheduled}
                    </td>
                    <td className="py-2.5 px-2.5 text-right text-blue-600">
                      {investorAnalytics.priorityTotals.opened}
                    </td>
                    <td className="py-2.5 px-2.5 text-right text-indigo-600">
                      {investorAnalytics.priorityTotals.portalVisits}
                    </td>
                    <td className="py-2.5 px-2.5 text-right text-emerald-600">
                      {investorAnalytics.priorityTotals.meetings}
                    </td>
                    <td className="py-2.5 px-4 text-right text-rose-600">
                      {investorAnalytics.priorityTotals.passed}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="px-5 py-3 bg-slate-50/70 border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-4 text-xs tabular-nums">
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Active Outreach (Sent + Sched):</span>
              <strong className="text-slate-900">{investorAnalytics.activeOutreachCount}</strong>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Active Excl. Passes:</span>
              <strong className="text-emerald-700">{investorAnalytics.activeExclPassesCount}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Hot Signals Queue */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-md bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center shrink-0">
              <Flame size={15} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                <CmsText
                  id="investor_funnel.hot_signals.title"
                  defaultValue="Investor Intelligence Agent — Hot Signals Queue"
                  section="Seed Funnel"
                />
              </h3>
              <p className="text-xs text-slate-400">
                <CmsText
                  id="investor_funnel.hot_signals.subtitle"
                  defaultValue="Investors who opened emails or visited investor.fortifai.io without a booked partner meeting yet"
                  section="Seed Funnel"
                />
              </p>
            </div>
          </div>
          <span className="text-xs font-medium text-slate-500 tabular-nums">
            {investorAnalytics.hotSignals.length} high-intent signals
          </span>
        </div>

        {investorAnalytics.hotSignals.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-md">
            All engaged investors are currently in Meeting, Diligence, or SAFE Signed stages.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 border border-[#E2E8F0] rounded-md">
            {investorAnalytics.hotSignals.map((inv) => (
              <div
                key={inv.id}
                className="p-3.5 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 text-xs hover:bg-slate-50/70"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-900">{inv.organization}</span>
                    <span className="text-slate-500">
                      · {inv.full_name} ({inv.region})
                    </span>
                    {inv.portal_visited && (
                      <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-semibold">
                        Visited investor.fortifai.io
                      </span>
                    )}
                    {inv.email_opened && !inv.portal_visited && (
                      <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-semibold">
                        Opened Email
                      </span>
                    )}
                    <span className="text-slate-500 font-medium tabular-nums">
                      {inv.check_size_label}
                    </span>
                  </div>
                  <div className="text-slate-600">{inv.next_step}</div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={!canEditInvestors}
                    title={!canEditInvestors ? 'Requires can_edit_investors permission' : undefined}
                    onClick={() => onLogMeeting(inv)}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-[#E2E8F0] rounded-md hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    Log Meeting / Soft Circle
                  </button>
                  <button
                    type="button"
                    disabled={!canSendCampaigns}
                    title={!canSendCampaigns ? 'Requires can_send_campaigns permission' : undefined}
                    onClick={() =>
                      onSendNudge(
                        inv,
                        'Re: Fortifai ($3M Seed) — Quick follow-up',
                        `Hi ${inv.first_name},\n\nSharing a quick note with our latest enterprise customer metrics from Honeywell and Brookfield Properties.\n\nWould you have 20 minutes this week to connect?\n\nBest,\nVarun Mowar\nCo-Founder & CEO, Fortifai`
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#0D1520] rounded-md hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    <Send size={12} />
                    Send In-Thread Nudge
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
