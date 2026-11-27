import { useMemo, useState } from 'react';
import {
  AlertCircle,
  Award,
  CheckCircle2,
  Compass,
  DollarSign,
  Gauge,
  Layers,
  RotateCcw,
  Save,
  ShieldCheck,
  Sliders,
  Target,
  TrendingUp,
} from 'lucide-react';
import type { CrmUser } from '../../types/crm';
import {
  DEFAULT_PIPELINE_RULES,
  type PipelineHealthRules,
} from '../../types/pipelineRules';

interface BenchmarksSettingsViewProps {
  currentUser: CrmUser;
  pipelineRules: PipelineHealthRules;
  onUpdatePipelineRules: (next: PipelineHealthRules) => void;
}

const STAGE_GOVERNANCE_META: Record<
  string,
  { code: string; slaDays: number; exitGate: string; buyerFocus: string }
> = {
  '1 Lead': {
    code: 'STG-01',
    slaDays: 21,
    exitGate: 'ICP Tier & Fortune 500 / Enterprise Fit Verified',
    buyerFocus: 'Discovery / Initial Outreach',
  },
  '2 Qualified': {
    code: 'STG-02',
    slaDays: 30,
    exitGate: 'Pain Point, Compliance Trigger & Budget Window Confirmed',
    buyerFocus: 'VP / Functional Champion',
  },
  '4 Decisionmaker buy in': {
    code: 'STG-04',
    slaDays: 45,
    exitGate: 'Economic Buyer Sponsor & Business Case Endorsed',
    buyerFocus: 'CFO / CCO / GC / CAE',
  },
  '5 Internal Review Pending': {
    code: 'STG-05',
    slaDays: 30,
    exitGate: 'InfoSec, SOC2 Type II & Architecture Review Approved',
    buyerFocus: 'CISO / Enterprise Risk Committee',
  },
  '6 Commercial / Contracting': {
    code: 'STG-06',
    slaDays: 21,
    exitGate: 'MSA Redlines Finalized & Order Form in Signature',
    buyerFocus: 'Procurement / General Counsel',
  },
  '7 Closed Won': {
    code: 'STG-07',
    slaDays: 0,
    exitGate: 'Executed Order Form & Provisioning Kickoff',
    buyerFocus: 'Customer Success Handover',
  },
};

const GOVERNANCE_PRESETS: Array<{
  id: string;
  name: string;
  badge: string;
  description: string;
  patch: Partial<PipelineHealthRules>;
}> = [
  {
    id: 'conservative',
    name: 'Fortune 500 Conservative',
    badge: '5.0x Coverage',
    description: 'Board-grade buffer for long enterprise procurement & InfoSec cycles.',
    patch: {
      requiredCoverageMultiple: 5.0,
      healthyCoverageFloor: 4.0,
      minQualifiedSharePct: 70,
      minWeightedAttainmentPct: 35,
    },
  },
  {
    id: 'balanced',
    name: 'Balanced Enterprise SaaS',
    badge: '4.0x Coverage',
    description: 'Standard institutional RevOps benchmark for $250K+ ACV deals.',
    patch: {
      requiredCoverageMultiple: 4.0,
      healthyCoverageFloor: 3.2,
      minQualifiedSharePct: 60,
      minWeightedAttainmentPct: 25,
    },
  },
  {
    id: 'growth',
    name: 'High-Velocity Land & Expand',
    badge: '3.0x Coverage',
    description: 'Lean pipeline coverage suited for fast-converting expansion cohorts.',
    patch: {
      requiredCoverageMultiple: 3.0,
      healthyCoverageFloor: 2.5,
      minQualifiedSharePct: 50,
      minWeightedAttainmentPct: 20,
    },
  },
];

function fmtUsdCompact(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 1_000) return `$${Math.round(amount / 1_000)}K`;
  return `$${Math.round(amount)}`;
}

export function BenchmarksSettingsView({
  currentUser,
  pipelineRules,
  onUpdatePipelineRules,
}: BenchmarksSettingsViewProps) {
  const [savedBanner, setSavedBanner] = useState<string | null>(null);

  const isSuperAdmin = currentUser.role === 'super_admin';

  const triggerSavedToast = (msg: string) => {
    setSavedBanner(msg);
    window.setTimeout(() => {
      setSavedBanner((prev) => (prev === msg ? null : prev));
    }, 2400);
  };

  const updateRules = (next: PipelineHealthRules, label = 'Benchmarks synced to Pipeline Health') => {
    onUpdatePipelineRules(next);
    triggerSavedToast(label);
  };

  const derived = useMemo(() => {
    const requiredPipeline = Math.round(
      pipelineRules.arrTarget2027 * pipelineRules.requiredCoverageMultiple
    );
    const healthyFloorArr = Math.round(
      pipelineRules.arrTarget2027 * pipelineRules.healthyCoverageFloor
    );
    const targetClosedDeals = Math.max(
      1,
      Math.round(pipelineRules.arrTarget2027 / Math.max(1, pipelineRules.avgAcvAssumption))
    );
    const requiredQualifiedDeals = Math.max(
      1,
      Math.round(requiredPipeline / Math.max(1, pipelineRules.avgAcvAssumption))
    );

    const qWeights = pipelineRules.quarterWeights;
    const quarterSum = Number(
      (
        (qWeights['Q1 2027'] || 0) +
        (qWeights['Q2 2027'] || 0) +
        (qWeights['Q3 2027'] || 0) +
        (qWeights['Q4 2027'] || 0)
      ).toFixed(2)
    );

    const sWeights = pipelineRules.scoreWeights;
    const scoreWeightSum =
      (sWeights.coverage || 0) +
      (sWeights.velocityHygiene || 0) +
      (sWeights.qualificationDepth || 0) +
      (sWeights.weightedAttainment || 0);

    return {
      requiredPipeline,
      healthyFloorArr,
      targetClosedDeals,
      requiredQualifiedDeals,
      quarterSum,
      scoreWeightSum,
    };
  }, [pipelineRules]);

  if (!isSuperAdmin) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="p-5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs text-rose-300">
          Super Admin privileges are required to modify enterprise revenue targets and pipeline governance rules.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1440px] w-full mx-auto space-y-5">
      {/* Executive Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-[var(--tx-primary)]">
              Revenue Targets &amp; Pipeline Governance Benchmarks
            </h2>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-sky-500/10 text-sky-400 border border-sky-500/25">
              <ShieldCheck size={11} /> RevOps Policy Engine
            </span>
          </div>
          <p className="text-xs text-[var(--tx-secondary)] mt-0.5">
            Define FY27 ARR quotas, quarterly seasonality weights, coverage multiples, and stage-gate win probabilities governing Pipeline Health.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {savedBanner && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <CheckCircle2 size={12} />
              {savedBanner}
            </span>
          )}
          <button
            type="button"
            onClick={() =>
              updateRules(DEFAULT_PIPELINE_RULES, 'Restored default RevOps benchmarks')
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--tx-secondary)] hover:text-[var(--tx-primary)] hover:border-sky-400/50 transition-colors"
          >
            <RotateCcw size={12} />
            Reset Defaults
          </button>
        </div>
      </div>

      {/* Live Policy Impact Preview Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
          <div className="flex items-center justify-between text-[11px] text-[var(--tx-muted)]">
            <span>FY27 Annual Quota</span>
            <Target size={13} className="text-sky-400" />
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-[var(--tx-primary)]">
            {fmtUsdCompact(pipelineRules.arrTarget2027)}
          </div>
          <div className="mt-0.5 text-[11px] text-[var(--tx-secondary)] tabular-nums">
            {derived.targetClosedDeals} enterprise wins @ {fmtUsdCompact(pipelineRules.avgAcvAssumption)} ACV
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
          <div className="flex items-center justify-between text-[11px] text-[var(--tx-muted)]">
            <span>Required Open Pipeline</span>
            <TrendingUp size={13} className="text-indigo-400" />
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-indigo-400">
            {fmtUsdCompact(derived.requiredPipeline)}
          </div>
          <div className="mt-0.5 text-[11px] text-[var(--tx-secondary)] tabular-nums">
            {pipelineRules.requiredCoverageMultiple}x target ({derived.requiredQualifiedDeals} qualified deals)
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
          <div className="flex items-center justify-between text-[11px] text-[var(--tx-muted)]">
            <span>Healthy Coverage Floor</span>
            <Compass size={13} className="text-emerald-400" />
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-400">
            {pipelineRules.healthyCoverageFloor.toFixed(1)}x
          </div>
          <div className="mt-0.5 text-[11px] text-[var(--tx-secondary)] tabular-nums">
            {fmtUsdCompact(derived.healthyFloorArr)} minimum safe pipeline
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
          <div className="flex items-center justify-between text-[11px] text-[var(--tx-muted)]">
            <span>Weighted Attainment Floor</span>
            <Award size={13} className="text-amber-400" />
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-amber-400">
            {pipelineRules.minWeightedAttainmentPct}%
          </div>
          <div className="mt-0.5 text-[11px] text-[var(--tx-secondary)] tabular-nums">
            {fmtUsdCompact(
              Math.round(
                (pipelineRules.arrTarget2027 * pipelineRules.minWeightedAttainmentPct) / 100
              )
            )}{' '}
            weighted ARR threshold
          </div>
        </div>
      </div>

      {/* 1-Click Governance Presets */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-[var(--tx-primary)]">
            Executive Operating Model Presets
          </div>
          <span className="text-[11px] text-[var(--tx-muted)]">
            1-click calibration for Board &amp; RevOps planning
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {GOVERNANCE_PRESETS.map((preset) => {
            const isActive =
              pipelineRules.requiredCoverageMultiple === preset.patch.requiredCoverageMultiple &&
              pipelineRules.healthyCoverageFloor === preset.patch.healthyCoverageFloor;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() =>
                  updateRules(
                    { ...pipelineRules, ...preset.patch },
                    `Applied ${preset.name} policy`
                  )
                }
                className={`text-left p-3.5 rounded-lg border transition-all ${
                  isActive
                    ? 'bg-sky-500/10 border-sky-400/60'
                    : 'bg-[var(--bg-canvas)]/60 border-[var(--border-subtle)] hover:border-sky-400/40'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[var(--tx-primary)]">
                    {preset.name}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10.5px] font-mono bg-sky-500/15 text-sky-400 border border-sky-500/25">
                    {preset.badge}
                  </span>
                </div>
                <p className="mt-1.5 text-[11px] text-[var(--tx-secondary)] leading-relaxed">
                  {preset.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Section Grid: Quota & Coverage Parameters + Quarterly Seasonality */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Core Revenue & Coverage Benchmarks */}
        <div className="lg:col-span-6 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] pb-3">
            <DollarSign size={15} className="text-sky-400" />
            <div>
              <h3 className="text-sm font-semibold text-[var(--tx-primary)]">
                Annual Quota &amp; Coverage Multiples
              </h3>
              <p className="text-[11px] text-[var(--tx-muted)]">
                Core capacity and coverage ratios used across Pipeline Health and Ask Scale.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <label className="space-y-1.5">
              <span className="text-[11px] font-medium text-[var(--tx-secondary)]">
                FY27 ARR Quota Target ($ USD)
              </span>
              <input
                type="number"
                step={100000}
                value={pipelineRules.arrTarget2027}
                onChange={(e) =>
                  updateRules({
                    ...pipelineRules,
                    arrTarget2027: Math.max(250000, Number(e.target.value) || 0),
                  })
                }
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--tx-primary)] font-mono focus:outline-none focus:border-sky-400"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-[11px] font-medium text-[var(--tx-secondary)]">
                Avg Enterprise ACV ($ USD)
              </span>
              <input
                type="number"
                step={25000}
                value={pipelineRules.avgAcvAssumption}
                onChange={(e) =>
                  updateRules({
                    ...pipelineRules,
                    avgAcvAssumption: Math.max(50000, Number(e.target.value) || 250000),
                  })
                }
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--tx-primary)] font-mono focus:outline-none focus:border-sky-400"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-[11px] font-medium text-[var(--tx-secondary)]">
                Target Coverage Multiple (x)
              </span>
              <input
                type="number"
                step={0.1}
                value={pipelineRules.requiredCoverageMultiple}
                onChange={(e) =>
                  updateRules({
                    ...pipelineRules,
                    requiredCoverageMultiple: Math.max(1, Number(e.target.value) || 4),
                  })
                }
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--tx-primary)] font-mono focus:outline-none focus:border-sky-400"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-[11px] font-medium text-[var(--tx-secondary)]">
                Healthy Coverage Floor (x)
              </span>
              <input
                type="number"
                step={0.1}
                value={pipelineRules.healthyCoverageFloor}
                onChange={(e) =>
                  updateRules({
                    ...pipelineRules,
                    healthyCoverageFloor: Math.max(1, Number(e.target.value) || 3),
                  })
                }
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--tx-primary)] font-mono focus:outline-none focus:border-sky-400"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-[11px] font-medium text-[var(--tx-secondary)]">
                Min Stage 2+ Qualified Share (%)
              </span>
              <input
                type="number"
                step={5}
                value={pipelineRules.minQualifiedSharePct}
                onChange={(e) =>
                  updateRules({
                    ...pipelineRules,
                    minQualifiedSharePct: Math.max(10, Math.min(100, Number(e.target.value) || 60)),
                  })
                }
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--tx-primary)] font-mono focus:outline-none focus:border-sky-400"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-[11px] font-medium text-[var(--tx-secondary)]">
                Min Weighted Attainment (%)
              </span>
              <input
                type="number"
                step={5}
                value={pipelineRules.minWeightedAttainmentPct}
                onChange={(e) =>
                  updateRules({
                    ...pipelineRules,
                    minWeightedAttainmentPct: Math.max(
                      5,
                      Math.min(100, Number(e.target.value) || 25)
                    ),
                  })
                }
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--tx-primary)] font-mono focus:outline-none focus:border-sky-400"
              />
            </label>
          </div>
        </div>

        {/* Quarterly Seasonality & Quota Phasing */}
        <div className="lg:col-span-6 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
            <div className="flex items-center gap-2">
              <Layers size={15} className="text-indigo-400" />
              <div>
                <h3 className="text-sm font-semibold text-[var(--tx-primary)]">
                  FY27 Quarterly Quota Seasonality (%)
                </h3>
                <p className="text-[11px] text-[var(--tx-muted)]">
                  Distributes annual ARR target across Q1–Q4 Horizon cards.
                </p>
              </div>
            </div>
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-mono border ${
                Math.abs(derived.quarterSum - 100) <= 0.1
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/25'
              }`}
            >
              Total: {derived.quarterSum}%
            </span>
          </div>

          <div className="space-y-3">
            {(['Q1 2027', 'Q2 2027', 'Q3 2027', 'Q4 2027'] as const).map((qKey) => {
              const pct = pipelineRules.quarterWeights[qKey] ?? 25;
              const qQuotaUsd = Math.round((pipelineRules.arrTarget2027 * pct) / 100);
              const qReqPipeUsd = Math.round(
                qQuotaUsd * pipelineRules.requiredCoverageMultiple
              );
              return (
                <div
                  key={qKey}
                  className="p-3 rounded-lg bg-[var(--bg-canvas)]/60 border border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="min-w-[130px]">
                    <div className="text-xs font-semibold text-[var(--tx-primary)]">{qKey}</div>
                    <div className="text-[11px] font-mono text-[var(--tx-muted)]">
                      Quota: <span className="text-sky-400">{fmtUsdCompact(qQuotaUsd)}</span> · Req:{' '}
                      {fmtUsdCompact(qReqPipeUsd)}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step={0.5}
                      min={0}
                      max={100}
                      value={pct}
                      onChange={(e) =>
                        updateRules({
                          ...pipelineRules,
                          quarterWeights: {
                            ...pipelineRules.quarterWeights,
                            [qKey]: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                          },
                        })
                      }
                      className="w-24 px-2.5 py-1.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-right font-mono text-xs text-[var(--tx-primary)] focus:outline-none focus:border-sky-400"
                    />
                    <span className="text-xs font-mono text-[var(--tx-muted)]">%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Stage-Gate Win Probability & Exit Criteria Matrix */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sliders size={15} className="text-emerald-400" />
            <div>
              <h3 className="text-sm font-semibold text-[var(--tx-primary)]">
                Enterprise Stage-Gate Win Probability &amp; Exit Criteria Matrix
              </h3>
              <p className="text-[11px] text-[var(--tx-muted)]">
                Standardizes weighted ARR forecasting and Fortune 500 procurement exit gates across all active opportunities.
              </p>
            </div>
          </div>
          <span className="text-[11px] font-mono text-[var(--tx-muted)]">
            Zero Stale Haircut · Pure Stage-Weighted Forecast
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)]/60 text-[11px] font-semibold uppercase tracking-wider text-[var(--tx-muted)]">
                <th className="py-2.5 px-4">Gate</th>
                <th className="py-2.5 px-4">Pipeline Stage</th>
                <th className="py-2.5 px-4">Win Prob (%)</th>
                <th className="py-2.5 px-4">Target Cycle</th>
                <th className="py-2.5 px-4">Primary Stakeholder</th>
                <th className="py-2.5 px-4">Mandatory Exit Criteria</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] text-xs">
              {Object.entries(STAGE_GOVERNANCE_META).map(([stageName, meta]) => {
                const prob = pipelineRules.stageWinProbs[stageName] ?? 0;
                return (
                  <tr
                    key={stageName}
                    className="hover:bg-[var(--bg-canvas)]/40 transition-colors"
                  >
                    <td className="py-2.5 px-4 font-mono text-[11px] text-sky-400 whitespace-nowrap">
                      {meta.code}
                    </td>
                    <td className="py-2.5 px-4 font-medium text-[var(--tx-primary)] whitespace-nowrap">
                      {stageName}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={5}
                          value={prob}
                          onChange={(e) =>
                            updateRules({
                              ...pipelineRules,
                              stageWinProbs: {
                                ...pipelineRules.stageWinProbs,
                                [stageName]: Math.max(
                                  0,
                                  Math.min(100, Number(e.target.value) || 0)
                                ),
                              },
                            })
                          }
                          className="w-16 px-2 py-1 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-right font-mono text-xs text-[var(--tx-primary)] focus:outline-none focus:border-sky-400"
                        />
                        <span className="font-mono text-[11px] text-[var(--tx-muted)]">%</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[11px] text-[var(--tx-secondary)] whitespace-nowrap">
                      {meta.slaDays > 0 ? `${meta.slaDays}d benchmark` : 'Closed'}
                    </td>
                    <td className="py-2.5 px-4 text-[11.5px] text-[var(--tx-secondary)] whitespace-nowrap">
                      {meta.buyerFocus}
                    </td>
                    <td className="py-2.5 px-4 text-[11.5px] text-[var(--tx-muted)]">
                      {meta.exitGate}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Autonomous Health Score Formula Weights */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
          <div className="flex items-center gap-2">
            <Gauge size={15} className="text-sky-400" />
            <div>
              <h3 className="text-sm font-semibold text-[var(--tx-primary)]">
                Autonomous Health Score Formula Weights
              </h3>
              <p className="text-[11px] text-[var(--tx-muted)]">
                Controls how the 0–100 Autonomous Health Score on Pipeline Health weights each pillar.
              </p>
            </div>
          </div>
          <span
            className={`px-2 py-0.5 rounded text-[11px] font-mono border ${
              derived.scoreWeightSum === 100
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/25'
            }`}
          >
            Weight Sum: {derived.scoreWeightSum}%
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          {(
            [
              { key: 'coverage', label: 'Pipeline Coverage Ratio (%)' },
              { key: 'qualificationDepth', label: 'Stage 2+ Qualification Depth (%)' },
              { key: 'weightedAttainment', label: 'Weighted Quota Attainment (%)' },
              { key: 'velocityHygiene', label: 'Stage Progression Velocity (%)' },
            ] as const
          ).map((item) => (
            <label key={item.key} className="space-y-1.5">
              <span className="text-[11px] font-medium text-[var(--tx-secondary)]">
                {item.label}
              </span>
              <input
                type="number"
                min={0}
                max={100}
                step={5}
                value={pipelineRules.scoreWeights[item.key]}
                onChange={(e) =>
                  updateRules({
                    ...pipelineRules,
                    scoreWeights: {
                      ...pipelineRules.scoreWeights,
                      [item.key]: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                    },
                  })
                }
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--tx-primary)] font-mono focus:outline-none focus:border-sky-400"
              />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
