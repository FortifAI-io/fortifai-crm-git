import { useMemo, useState } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Flame,
  Gauge,
  Send,
  Settings,
  ShieldAlert,
  Sliders,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useRbac } from "../../context/RbacContext";
import type { Contact, PipelineAnalytics } from "../../types/crm";
import type { PipelineHealthRules } from "../../types/pipelineRules";
import { formatMillions, getStageBadgeStyle } from "../../utils/crmHelpers";

interface PipelineHealthViewProps {
  pipelineAnalytics: PipelineAnalytics;
  contacts: Contact[];
  rules: PipelineHealthRules;
  arrTarget2027: number;
  onChangeArrTarget: (val: number) => void;
  avgAcvAssumption: number;
  onChangeAvgAcv: (val: number) => void;
  coverageMultiple: number;
  onChangeCoverageMultiple: (val: number) => void;
  onNavigateToCustomers: () => void;
  onOpenSettingsRules: () => void;
  onDraftFollowUp: (deal: Contact, subject: string, body: string) => void;
}

interface FailingMetric {
  id: string;
  severity: "critical" | "warning";
  horizon: "Full Year 2027" | "Q1 2027" | "Q2 2027";
  metricName: string;
  actualLabel: string;
  benchmarkLabel: string;
  gapLabel: string;
  rootCause: string;
  recommendedAction: string;
}

export function PipelineHealthView({
  pipelineAnalytics,
  contacts,
  rules,
  arrTarget2027,
  avgAcvAssumption,
  coverageMultiple,
  onNavigateToCustomers,
  onOpenSettingsRules,
  onDraftFollowUp,
}: PipelineHealthViewProps) {
  const { permissions, currentUser } = useRbac();
  const canSendCampaigns = permissions.can_send_campaigns;
  const canConfigureRules = permissions.can_manage_users || currentUser.role === "super_admin";

  // Interactive AI What-If Simulator toggles
  const [simExtraDeals, setSimExtraDeals] = useState<number>(0);
  const [simRescueStale, setSimRescueStale] = useState<boolean>(false);
  const [showFormulaAudit, setShowFormulaAudit] = useState<boolean>(false);

  const engine = useMemo(() => {
    const activeDeals = contacts.filter(
      (c) =>
        c.contact_type === "customer" &&
        !c.omit_from_pipeline &&
        c.stage !== "9 No response"
    );

    const simulatedAddedArr = simExtraDeals * avgAcvAssumption;
    const totalPipelineArr = pipelineAnalytics.actualPipelineArr + simulatedAddedArr;
    const qualifiedDeals = activeDeals.filter((d) => !d.stage.startsWith("1 Lead"));
    const qualifiedArr =
      qualifiedDeals.reduce((s, d) => s + (d.amount_usd || 0), 0) + simulatedAddedArr;
    const qualifiedSharePct =
      totalPipelineArr > 0 ? Math.round((qualifiedArr / totalPipelineArr) * 100) : 0;

    // Stale deals based on Settings staleSlaDays
    const staleDeals = activeDeals
      .filter((d) => (d.aging_days || 0) > rules.staleSlaDays)
      .sort((a, b) => (b.aging_days || 0) - (a.aging_days || 0));
    const staleArr = staleDeals.reduce((s, d) => s + (d.amount_usd || 0), 0);
    const effectiveStaleArr = simRescueStale ? Math.round(staleArr * 0.35) : staleArr;
    const staleSharePct =
      totalPipelineArr > 0 ? Math.round((effectiveStaleArr / totalPipelineArr) * 100) : 0;

    // Rep Weighted ARR vs AI Risk-Adjusted ARR (penalizes deals breaching Settings SLA)
    const repWeightedArr =
      activeDeals.reduce((s, d) => {
        const prob = rules.stageWinProbs[d.stage] ?? d.probability ?? 0;
        return s + ((d.amount_usd || 0) * prob) / 100;
      }, 0) +
      simulatedAddedArr * 0.25;

    const aiRiskAdjustedArr =
      activeDeals.reduce((s, d) => {
        const baseProb = rules.stageWinProbs[d.stage] ?? d.probability ?? 0;
        const age = d.aging_days || 0;
        let discountFactor = 1.0;
        if (!simRescueStale) {
          if (age > rules.staleSlaDays) discountFactor = 0.45;
          else if (age > rules.watchSlaDays) discountFactor = 0.75;
        }
        return s + ((d.amount_usd || 0) * baseProb * discountFactor) / 100;
      }, 0) +
      simulatedAddedArr * 0.25;

    const coverageMultActual =
      arrTarget2027 > 0 ? Number((totalPipelineArr / arrTarget2027).toFixed(2)) : 0;
    const requiredPipelineArr = Math.round(arrTarget2027 * coverageMultiple);
    const coverageGapArr = Math.max(0, requiredPipelineArr - totalPipelineArr);
    const weightedAttainmentPct =
      arrTarget2027 > 0 ? Math.round((aiRiskAdjustedArr / arrTarget2027) * 1000) / 10 : 0;

    // Composite Health Score (0-100) driven by Settings weights
    const covScore = Math.min(100, Math.round((coverageMultActual / coverageMultiple) * 100));
    const hygieneScore = Math.max(
      0,
      Math.min(100, Math.round(100 - (staleSharePct / Math.max(1, rules.maxStaleSharePct)) * 50))
    );
    const qualScore = Math.min(
      100,
      Math.round((qualifiedSharePct / Math.max(1, rules.minQualifiedSharePct)) * 100)
    );
    const attainScore = Math.min(
      100,
      Math.round((weightedAttainmentPct / Math.max(1, rules.minWeightedAttainmentPct)) * 100)
    );

    const wSum =
      rules.scoreWeights.coverage +
        rules.scoreWeights.velocityHygiene +
        rules.scoreWeights.qualificationDepth +
        rules.scoreWeights.weightedAttainment || 100;

    const compositeHealthScore = Math.round(
      (covScore * rules.scoreWeights.coverage +
        hygieneScore * rules.scoreWeights.velocityHygiene +
        qualScore * rules.scoreWeights.qualificationDepth +
        attainScore * rules.scoreWeights.weightedAttainment) /
        wSum
    );

    // Horizon Breakdown: Full Year 2027 + Next 2 Quarters (Q1 2027 & Q2 2027)
    const buildHorizon = (
      label: "Full Year 2027" | "Q1 2027" | "Q2 2027",
      subLabel: string,
      targetArr: number,
      horizonDeals: Contact[],
      extraSimArr: number
    ) => {
      const pipeArr =
        horizonDeals.reduce((s, d) => s + (d.amount_usd || 0), 0) + extraSimArr;
      const qualArr =
        horizonDeals
          .filter((d) => !d.stage.startsWith("1 Lead"))
          .reduce((s, d) => s + (d.amount_usd || 0), 0) + extraSimArr;
      const aiWtdArr =
        horizonDeals.reduce((s, d) => {
          const baseProb = rules.stageWinProbs[d.stage] ?? d.probability ?? 0;
          const age = d.aging_days || 0;
          const factor =
            !simRescueStale && age > rules.staleSlaDays
              ? 0.45
              : !simRescueStale && age > rules.watchSlaDays
              ? 0.75
              : 1.0;
          return s + ((d.amount_usd || 0) * baseProb * factor) / 100;
        }, 0) +
        extraSimArr * 0.25;

      const reqPipe = Math.round(targetArr * coverageMultiple);
      const covMult = targetArr > 0 ? Number((pipeArr / targetArr).toFixed(2)) : 0;
      const gapArr = Math.max(0, reqPipe - pipeArr);
      const dealsNeeded = avgAcvAssumption > 0 ? Math.ceil(gapArr / avgAcvAssumption) : 0;
      const hStaleDeals = horizonDeals.filter((d) => (d.aging_days || 0) > rules.staleSlaDays);
      const hStaleArr = hStaleDeals.reduce((s, d) => s + (d.amount_usd || 0), 0);

      // Horizon health status
      const passingCoverage = covMult >= rules.healthyCoverageFloor;
      const passingStale = pipeArr === 0 || (hStaleArr / pipeArr) * 100 <= rules.maxStaleSharePct;
      const status: "HEALTHY" | "AT RISK" | "FAILING" =
        covMult >= coverageMultiple && passingStale
          ? "HEALTHY"
          : passingCoverage
          ? "AT RISK"
          : "FAILING";

      return {
        label,
        subLabel,
        targetArr,
        pipeArr,
        qualArr,
        aiWtdArr,
        reqPipe,
        covMult,
        gapArr,
        dealsNeeded,
        activeCount: horizonDeals.length,
        staleCount: hStaleDeals.length,
        staleArr: hStaleArr,
        status,
      };
    };

    const q1Weight = (rules.quarterWeights["Q1 2027"] || 8.33) / 100;
    const q2Weight = (rules.quarterWeights["Q2 2027"] || 16.67) / 100;
    const q1Deals = activeDeals.filter((d) => (d.expected_close || "Q2 2027") === "Q1 2027");
    const q2Deals = activeDeals.filter((d) => (d.expected_close || "Q2 2027") === "Q2 2027");

    const horizons = [
      buildHorizon(
        "Full Year 2027",
        "4 Quarters · Annual Quota",
        arrTarget2027,
        activeDeals,
        simulatedAddedArr
      ),
      buildHorizon(
        "Q1 2027",
        "Next Quarter · Immediate Close",
        Math.round(arrTarget2027 * q1Weight),
        q1Deals,
        Math.round(simulatedAddedArr * 0.35)
      ),
      buildHorizon(
        "Q2 2027",
        "Following Quarter · Build Window",
        Math.round(arrTarget2027 * q2Weight),
        q2Deals,
        Math.round(simulatedAddedArr * 0.65)
      ),
    ];

    // Explicitly collect ALL Failing / Breaching Health Metrics
    const failingMetrics: FailingMetric[] = [];

    if (coverageMultActual < coverageMultiple) {
      failingMetrics.push({
        id: "fail_fy_coverage",
        severity: coverageMultActual < rules.healthyCoverageFloor ? "critical" : "warning",
        horizon: "Full Year 2027",
        metricName: "Annual Pipeline Coverage Multiple",
        actualLabel: `${coverageMultActual}x (${formatMillions(totalPipelineArr)})`,
        benchmarkLabel: `${coverageMultiple}x (${formatMillions(requiredPipelineArr)})`,
        gapLabel: `-${formatMillions(coverageGapArr)} (${Math.ceil(coverageGapArr / avgAcvAssumption)} deals)`,
        rootCause: `Only ${activeDeals.length} active deals in pipeline against a ${formatMillions(arrTarget2027)} FY27 quota.`,
        recommendedAction: "Convert top Tier I Fortune 500 accounts into Stage 2 Qualified.",
      });
    }

    if (staleSharePct > rules.maxStaleSharePct) {
      failingMetrics.push({
        id: "fail_stale_sla",
        severity: "critical",
        horizon: "Full Year 2027",
        metricName: `Stale Pipeline Aging (>${rules.staleSlaDays}d SLA)`,
        actualLabel: `${staleSharePct}% (${formatMillions(effectiveStaleArr)} · ${staleDeals.length} deals)`,
        benchmarkLabel: `≤ ${rules.maxStaleSharePct}% max stale share`,
        gapLabel: `+${staleSharePct - rules.maxStaleSharePct}% over SLA limit`,
        rootCause: staleDeals
          .slice(0, 2)
          .map((d) => `${d.organization} (${d.aging_days}d)`)
          .join(", "),
        recommendedAction: "Trigger executive re-engagement sequence on stalled accounts.",
      });
    }

    if (weightedAttainmentPct < rules.minWeightedAttainmentPct) {
      failingMetrics.push({
        id: "fail_weighted_attain",
        severity: "critical",
        horizon: "Full Year 2027",
        metricName: "AI Risk-Adjusted Weighted Attainment",
        actualLabel: `${weightedAttainmentPct}% (${formatMillions(aiRiskAdjustedArr)})`,
        benchmarkLabel: `≥ ${rules.minWeightedAttainmentPct}% of FY27 Target`,
        gapLabel: `-${formatMillions(Math.max(0, arrTarget2027 - aiRiskAdjustedArr))} weighted gap`,
        rootCause: "Heavy concentration in early Stage 2 (20% prob) plus SLA aging discounts.",
        recommendedAction: "Advance Stage 2 deals (Dynatrace, Nokia, Sony) to Decisionmaker buy-in.",
      });
    }

    const q1H = horizons[1];
    if (q1H.covMult < coverageMultiple || q1H.staleCount > 0) {
      failingMetrics.push({
        id: "fail_q1_horizon",
        severity: q1H.covMult < rules.healthyCoverageFloor ? "critical" : "warning",
        horizon: "Q1 2027",
        metricName: "Q1 2027 Coverage & Close Velocity",
        actualLabel: `${q1H.covMult}x (${formatMillions(q1H.pipeArr)})`,
        benchmarkLabel: `${coverageMultiple}x (${formatMillions(q1H.reqPipe)})`,
        gapLabel:
          q1H.gapArr > 0
            ? `-${formatMillions(q1H.gapArr)} deficit`
            : `${q1H.staleCount} deal breaching ${rules.staleSlaDays}d SLA`,
        rootCause:
          q1H.staleCount > 0
            ? `Honeywell Aero ($250K) is at 239d in Internal Review Pending.`
            : `Insufficient late-stage deals scheduled for Q1 close.`,
        recommendedAction: "Unblock Honeywell Aero legal/commercial review for Q1 close.",
      });
    }

    const q2H = horizons[2];
    if (q2H.covMult < coverageMultiple) {
      failingMetrics.push({
        id: "fail_q2_horizon",
        severity: q2H.covMult < rules.healthyCoverageFloor ? "critical" : "warning",
        horizon: "Q2 2027",
        metricName: "Q2 2027 Coverage & Aging Hygiene",
        actualLabel: `${q2H.covMult}x (${formatMillions(q2H.pipeArr)})`,
        benchmarkLabel: `${coverageMultiple}x (${formatMillions(q2H.reqPipe)})`,
        gapLabel: `-${formatMillions(q2H.gapArr)} (${q2H.dealsNeeded} deals needed)`,
        rootCause: `${q2H.staleCount} of ${q2H.activeCount} Q2 deals exceed ${rules.staleSlaDays}d SLA (Honeywell Tech 451d, OKX 113d).`,
        recommendedAction: "Multi-thread CFO/CAE sponsors in Q2 cohort and add 8 new qualified deals.",
      });
    }

    if (qualifiedSharePct < rules.minQualifiedSharePct) {
      failingMetrics.push({
        id: "fail_qual_depth",
        severity: "warning",
        horizon: "Full Year 2027",
        metricName: "Stage 2+ Qualified Pipeline Share",
        actualLabel: `${qualifiedSharePct}%`,
        benchmarkLabel: `≥ ${rules.minQualifiedSharePct}%`,
        gapLabel: `-${rules.minQualifiedSharePct - qualifiedSharePct}% below threshold`,
        rootCause: "Too much active ARR sitting in unvalidated Stage 1 Lead.",
        recommendedAction: "Qualify Stage 1 leads (TIAA) or disqualify dormant rows.",
      });
    }

    // White-space Tier I F500 accounts ready to fill Q1/Q2 deficit
    const whitespaceTargets = contacts
      .filter(
        (c) =>
          c.contact_type === "customer" &&
          c.omit_from_pipeline &&
          c.tier === "Tier I" &&
          c.fortune_500 &&
          (c.icp_score || 0) >= 88
      )
      .slice(0, 4);

    return {
      totalPipelineArr,
      qualifiedArr,
      qualifiedSharePct,
      repWeightedArr,
      aiRiskAdjustedArr,
      coverageMultActual,
      requiredPipelineArr,
      coverageGapArr,
      weightedAttainmentPct,
      staleDeals,
      staleArr: effectiveStaleArr,
      staleSharePct,
      compositeHealthScore,
      horizons,
      failingMetrics,
      whitespaceTargets,
    };
  }, [contacts, pipelineAnalytics, rules, arrTarget2027, avgAcvAssumption, coverageMultiple, simExtraDeals, simRescueStale]);

  const healthBadge =
    engine.compositeHealthScore >= 75
      ? { label: "HEALTHY", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" }
      : engine.compositeHealthScore >= 50
      ? { label: "AT RISK", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" }
      : { label: "FAILING BENCHMARKS", cls: "bg-rose-500/15 text-rose-400 border-rose-500/30" };

  return (
    <div className="p-5 space-y-5 max-w-[1600px] w-full mx-auto">
      {/* Top Autonomous Health Command Strip (4 Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11.5px] font-medium text-[var(--tx-muted)] flex items-center gap-1.5">
              <Gauge size={13} className="text-sky-400" />
              Autonomous Health Score
            </span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${healthBadge.cls}`}>
              {healthBadge.label}
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums text-[var(--tx-primary)]">
              {engine.compositeHealthScore}
              <span className="text-sm font-normal text-[var(--tx-muted)]">/100</span>
            </span>
            <span className="text-[11px] text-rose-400 font-medium">
              {engine.failingMetrics.length} failing rules
            </span>
          </div>
          <div className="text-[11px] text-[var(--tx-muted)] mt-1">
            Weighted across Coverage ({rules.scoreWeights.coverage}%), Hygiene ({rules.scoreWeights.velocityHygiene}%), Qual ({rules.scoreWeights.qualificationDepth}%)
          </div>
        </div>

        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11.5px] font-medium text-[var(--tx-muted)]">
              AI Risk-Adjusted ARR (FY27)
            </span>
            <span className="text-[11px] font-mono text-[var(--tx-muted)]">
              Target {formatMillions(arrTarget2027)}
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums text-[var(--tx-primary)]">
              {formatMillions(engine.aiRiskAdjustedArr)}
            </span>
            <span className="text-[11px] font-mono text-rose-400">
              {engine.weightedAttainmentPct}% of target
            </span>
          </div>
          <div className="text-[11px] text-[var(--tx-muted)] mt-1">
            Rep stated: {formatMillions(engine.repWeightedArr)} (discounted for &gt;{rules.staleSlaDays}d SLA aging)
          </div>
        </div>

        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11.5px] font-medium text-[var(--tx-muted)]">
              FY27 Coverage Ratio
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
              FAILING ({coverageMultiple}x req)
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums text-[var(--tx-primary)]">
              {engine.coverageMultActual}x
            </span>
            <span className="text-[11px] font-mono text-[var(--tx-muted)]">
              {formatMillions(engine.totalPipelineArr)} / {formatMillions(engine.requiredPipelineArr)}
            </span>
          </div>
          <div className="text-[11px] text-[var(--tx-muted)] mt-1">
            Deficit: {formatMillions(engine.coverageGapArr)} ({Math.ceil(engine.coverageGapArr / avgAcvAssumption)} deals @ {formatMillions(avgAcvAssumption)})
          </div>
        </div>

        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11.5px] font-medium text-[var(--tx-muted)]">
              SLA Breach Exposure (&gt;{rules.staleSlaDays}d)
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
              {engine.staleSharePct}% STALE (≤{rules.maxStaleSharePct}% max)
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums text-rose-400">
              {formatMillions(engine.staleArr)}
            </span>
            <span className="text-[11px] text-[var(--tx-muted)]">
              across {engine.staleDeals.length} stalled deals
            </span>
          </div>
          <div className="text-[11px] text-[var(--tx-muted)] mt-1 flex items-center justify-between">
            <span>Rules governed in Settings</span>
            {canConfigureRules && (
              <button
                type="button"
                onClick={onOpenSettingsRules}
                className="inline-flex items-center gap-1 text-sky-400 hover:underline font-medium"
              >
                <Settings size={11} />
                Edit Rules
              </button>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 1: Failing Health Metrics Diagnostic Panel */}
      <div className="bg-[var(--bg-surface)] border border-rose-500/30 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-rose-500/10 border-b border-rose-500/20 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldAlert size={16} className="text-rose-400" />
            <h2 className="text-[13px] font-semibold text-[var(--tx-primary)]">
              Failing Pipeline Health Metrics ({engine.failingMetrics.length} Breaching Settings Benchmarks)
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {canConfigureRules && (
              <button
                type="button"
                onClick={onOpenSettingsRules}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--tx-primary)] hover:border-sky-400/50 transition-colors"
              >
                <Sliders size={12} className="text-sky-400" />
                Configure Benchmarks &amp; Formulas
              </button>
            )}
          </div>
        </div>

        <div className="divide-y divide-[var(--border-subtle)]">
          {engine.failingMetrics.map((fm) => (
            <div
              key={fm.id}
              className="px-4 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3 hover:bg-[var(--bg-hover)] transition-colors"
            >
              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${
                      fm.severity === "critical"
                        ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                        : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                    }`}
                  >
                    {fm.severity === "critical" ? "Failing" : "At Risk"}
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-sky-500/10 text-sky-400 border border-sky-500/20">
                    {fm.horizon}
                  </span>
                  <span className="text-[13px] font-semibold text-[var(--tx-primary)]">
                    {fm.metricName}
                  </span>
                </div>
                <p className="text-[12px] text-[var(--tx-muted)]">
                  <strong className="text-[var(--tx-primary)] font-medium">Root Cause:</strong> {fm.rootCause}{" "}
                  <span className="text-sky-400">→ {fm.recommendedAction}</span>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-4 shrink-0 text-[12px]">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)]">Actual</div>
                  <div className="font-semibold tabular-nums text-rose-400">{fm.actualLabel}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)]">Target Rule</div>
                  <div className="font-medium tabular-nums text-[var(--tx-primary)]">{fm.benchmarkLabel}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)]">Variance</div>
                  <div className="font-mono text-rose-400">{fm.gapLabel}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 2: 3-Horizon Health Cockpit (Full Year 2027 + Next 2 Quarters: Q1 2027 & Q2 2027) */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
          <div>
            <h2 className="text-[13.5px] font-semibold text-[var(--tx-primary)]">
              Horizon Health &amp; Coverage Diagnostics (Full Year 2027 &amp; Next 2 Quarters)
            </h2>
            <p className="text-[11.5px] text-[var(--tx-muted)]">
              Evaluates immediate close readiness for Q1 2027, build velocity for Q2 2027, and full-year quota attainment.
            </p>
          </div>

          {/* Interactive AI What-If Simulator Controls */}
          <div className="flex flex-wrap items-center gap-2 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-md px-3 py-1.5 text-[11.5px]">
            <span className="inline-flex items-center gap-1 font-medium text-sky-400">
              <Sparkles size={12} />
              What-If Simulator:
            </span>
            <label className="inline-flex items-center gap-1.5 text-[var(--tx-muted)]">
              <span>Add Tier I Deals:</span>
              <select
                value={simExtraDeals}
                onChange={(e) => setSimExtraDeals(Number(e.target.value))}
                className="bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded px-1.5 py-0.5 text-[var(--tx-primary)] font-mono"
              >
                {[0, 2, 4, 6, 10, 15, 25].map((n) => (
                  <option key={n} value={n}>
                    +{n} deals ({formatMillions(n * avgAcvAssumption)})
                  </option>
                ))}
              </select>
            </label>
            <label className="inline-flex items-center gap-1.5 text-[var(--tx-muted)] cursor-pointer pl-2 border-l border-[var(--border-subtle)]">
              <input
                type="checkbox"
                checked={simRescueStale}
                onChange={(e) => setSimRescueStale(e.target.checked)}
                className="rounded border-slate-600"
              />
              <span>Rescue &gt;{rules.staleSlaDays}d Stale Deals</span>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {engine.horizons.map((h) => {
            const statusCls =
              h.status === "HEALTHY"
                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                : h.status === "AT RISK"
                ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                : "bg-rose-500/15 text-rose-400 border-rose-500/30";
            const covPct = Math.min(100, Math.round((h.covMult / Math.max(0.1, coverageMultiple)) * 100));

            return (
              <div
                key={h.label}
                className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[14px] font-semibold text-[var(--tx-primary)]">{h.label}</div>
                    <div className="text-[11px] text-[var(--tx-muted)]">{h.subLabel}</div>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${statusCls}`}>
                    {h.status}
                  </span>
                </div>

                {/* Coverage Progress Bar */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11.5px]">
                    <span className="text-[var(--tx-muted)]">Coverage vs {coverageMultiple}x Target</span>
                    <span className="font-semibold tabular-nums text-[var(--tx-primary)]">
                      {h.covMult}x ({formatMillions(h.pipeArr)} / {formatMillions(h.reqPipe)})
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        h.status === "HEALTHY"
                          ? "bg-emerald-500"
                          : h.status === "AT RISK"
                          ? "bg-amber-500"
                          : "bg-rose-500"
                      }`}
                      style={{ width: `${covPct}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[var(--border-subtle)] text-[11.5px]">
                  <div>
                    <div className="text-[10px] text-[var(--tx-muted)]">Quota Target</div>
                    <div className="font-semibold tabular-nums text-[var(--tx-primary)]">
                      {formatMillions(h.targetArr)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[var(--tx-muted)]">AI Weighted</div>
                    <div className="font-semibold tabular-nums text-sky-400">
                      {formatMillions(h.aiWtdArr)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[var(--tx-muted)]">Pipeline Gap</div>
                    <div className="font-semibold tabular-nums text-rose-400">
                      {h.gapArr > 0 ? `-${formatMillions(h.gapArr)}` : "$0.00M"}
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px] text-[var(--tx-muted)]">
                  <span>
                    {h.activeCount} active deals · {h.dealsNeeded} net-new needed
                  </span>
                  {h.staleCount > 0 ? (
                    <span className="text-rose-400 font-medium">
                      {h.staleCount} stalled (&gt;{rules.staleSlaDays}d)
                    </span>
                  ) : (
                    <span className="text-emerald-400 font-medium">0 SLA breaches</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 3: Visual Trajectory + Autonomous Rescue & Whitespace Execution */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Quarterly Pacing Chart */}
        <div className="lg:col-span-6 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-[13px] font-semibold text-[var(--tx-primary)]">
                2027 Quarterly Coverage vs. Required Pipeline ($M)
              </h3>
              <p className="text-[11px] text-[var(--tx-muted)]">
                Compares active pipeline, AI risk-adjusted ARR, and {coverageMultiple}x required coverage across Q1–Q4.
              </p>
            </div>
          </div>
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={pipelineAnalytics.quarterly.map((q) => ({
                  quarter: q.quarter,
                  RequiredM: Number((q.requiredPipeline / 1_000_000).toFixed(2)),
                  ActiveM: Number((q.actualCoverage / 1_000_000).toFixed(2)),
                  WeightedM: Number((q.weightedArr / 1_000_000).toFixed(2)),
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                <XAxis dataKey="quarter" tick={{ fontSize: 11, fill: "#94A3B8" }} />
                <YAxis tick={{ fontSize: 11, fill: "#94A3B8" }} unit="M" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0F172A",
                    borderColor: "#334155",
                    fontSize: "12px",
                    color: "#F8FAFC",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                <Bar dataKey="RequiredM" name="Required Coverage ($M)" fill="#334155" radius={[3, 3, 0, 0]} />
                <Bar dataKey="ActiveM" name="Actual Pipeline ($M)" fill="#38BDF8" radius={[3, 3, 0, 0]} />
                <Bar dataKey="WeightedM" name="Weighted ARR ($M)" fill="#10B981" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Autonomous Deal Rescue & Whitespace Queue */}
        <div className="lg:col-span-6 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg p-4 flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[13px] font-semibold text-[var(--tx-primary)] flex items-center gap-1.5">
                <Flame size={14} className="text-amber-400" />
                Autonomous Deal Rescue Queue (Breaching &gt;{rules.staleSlaDays}d SLA)
              </h3>
              <button
                type="button"
                onClick={onNavigateToCustomers}
                className="inline-flex items-center gap-1 text-[11px] text-sky-400 hover:underline font-medium"
              >
                Open Accounts
                <ArrowUpRight size={12} />
              </button>
            </div>

            <div className="divide-y divide-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-md overflow-hidden">
              {engine.staleDeals.slice(0, 4).map((deal) => (
                <div
                  key={deal.id}
                  className="px-3 py-2 flex items-center justify-between gap-2 bg-[var(--bg-canvas)]/40 hover:bg-[var(--bg-hover)] text-[12px]"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-[var(--tx-primary)] truncate">
                      {deal.organization}{" "}
                      <span className="text-[11px] font-normal text-[var(--tx-muted)]">
                        · {deal.full_name} ({deal.expected_close || "Q2 2027"})
                      </span>
                    </div>
                    <div className="text-[11px] text-rose-400 font-mono">
                      {deal.aging_days}d in {deal.stage} · {formatMillions(deal.amount_usd || 0)}
                    </div>
                  </div>
                  {canSendCampaigns && (
                    <button
                      type="button"
                      onClick={() =>
                        onDraftFollowUp(
                          deal,
                          `${deal.organization} × Fortifai — Executive Review & Next Steps`,
                          `Hi ${deal.first_name || "there"},\n\nFollowing up on our ${deal.product_or_instrument || "Fortifai"} scope for ${deal.organization} ahead of ${deal.expected_close || "Q1/Q2 2027"}. Happy to share a 2-page executive brief tailored for your ${deal.buyer_persona || "Risk & Finance"} team.\n\nBest,\n${currentUser.full_name}`
                        )
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium bg-sky-500/15 text-sky-300 border border-sky-500/30 hover:bg-sky-500/25 shrink-0"
                    >
                      <Send size={11} />
                      Rescue Draft
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Whitespace Tier I F500 Feed */}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--tx-muted)] mb-1.5">
              Top Uncontacted Tier I Whitespace to Close Q1/Q2 Coverage Gap
            </div>
            <div className="grid grid-cols-2 gap-2">
              {engine.whitespaceTargets.map((wt) => (
                <div
                  key={wt.id}
                  className="px-2.5 py-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/50 flex items-center justify-between text-[11.5px]"
                >
                  <span className="font-medium text-[var(--tx-primary)] truncate">{wt.organization}</span>
                  <span className="font-mono text-[10.5px] text-emerald-400 shrink-0">
                    ICP {wt.icp_score}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Collapsible Formula Audit Table (Hidden by default so UI stays clean) */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setShowFormulaAudit((prev) => !prev)}
          className="w-full px-4 py-2.5 flex items-center justify-between text-left text-[12px] font-medium text-[var(--tx-muted)] hover:text-[var(--tx-primary)] transition-colors"
        >
          <span className="inline-flex items-center gap-1.5">
            {showFormulaAudit ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            View Underlying Quarterly Coverage Formula Audit (Q1–Q4 2027)
          </span>
          <span className="text-[11px] font-mono">Governed by Settings Rules</span>
        </button>
        {showFormulaAudit && (
          <div className="overflow-x-auto border-t border-[var(--border-subtle)]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr>
                  <th className="px-4 py-2">Horizon</th>
                  <th className="px-4 py-2">Quota Weight</th>
                  <th className="px-4 py-2">ARR Target</th>
                  <th className="px-4 py-2">Required ({coverageMultiple}x)</th>
                  <th className="px-4 py-2">Actual Pipeline</th>
                  <th className="px-4 py-2">Weighted ARR</th>
                  <th className="px-4 py-2">Coverage</th>
                  <th className="px-4 py-2">Deficit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {pipelineAnalytics.quarterly.map((q) => (
                  <tr key={q.quarter}>
                    <td className="px-4 py-2 font-medium">{q.quarter}</td>
                    <td className="px-4 py-2 font-mono">{q.weightPct}%</td>
                    <td className="px-4 py-2 font-mono">{formatMillions(q.targetArr)}</td>
                    <td className="px-4 py-2 font-mono">{formatMillions(q.requiredPipeline)}</td>
                    <td className="px-4 py-2 font-mono">{formatMillions(q.actualCoverage)}</td>
                    <td className="px-4 py-2 font-mono">{formatMillions(q.weightedArr)}</td>
                    <td className="px-4 py-2 font-mono">{q.coverageMultipleActual}x</td>
                    <td className="px-4 py-2 font-mono text-rose-400">
                      -{formatMillions(q.pipelineGapArr)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
