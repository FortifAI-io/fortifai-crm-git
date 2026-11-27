import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Flame,
  Gauge,
  Send,
  Settings,
  ShieldAlert,
  Sliders,
  Sparkles,
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
import { formatMillions } from "../../utils/crmHelpers";

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
  onUpdateContact: (id: string, updates: Partial<Contact>) => void;
  onSelectContact: (id: string) => void;
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

const VALID_QUARTERS = ["Q1 2027", "Q2 2027", "Q3 2027", "Q4 2027"] as const;

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
  onUpdateContact,
  onSelectContact,
}: PipelineHealthViewProps) {
  const { permissions, currentUser } = useRbac();
  const canSendCampaigns = permissions.can_send_campaigns;
  const canConfigureRules = permissions.can_manage_users || currentUser.role === "super_admin";

  const [simExtraDeals, setSimExtraDeals] = useState<number>(0);
  const [simRescueStale, setSimRescueStale] = useState<boolean>(false);
  const [showFormulaAudit, setShowFormulaAudit] = useState<boolean>(false);
  const [draggedDealId, setDraggedDealId] = useState<string | null>(null);
  const [dragOverQuarter, setDragOverQuarter] = useState<string | null>(null);

  const engine = useMemo(() => {
    const isNoise = (c: Contact) =>
      ["stage", "qualified", "total", "grand total"].includes((c.organization || "").trim().toLowerCase()) ||
      ["acv ($k)", "0", "weighted ($k)"].includes((c.full_name || "").trim().toLowerCase());

    const activeDeals = contacts.filter(
      (c) =>
        c.contact_type === "customer" &&
        !isNoise(c) &&
        !c.omit_from_pipeline &&
        c.stage !== "9 No response"
    );

    const scheduledDeals = activeDeals.filter((d) =>
      VALID_QUARTERS.includes((d.expected_close || "") as (typeof VALID_QUARTERS)[number])
    );

    const simulatedAddedArr = simExtraDeals * avgAcvAssumption;
    const basePipelineArr = activeDeals.reduce((s, d) => s + (d.amount_usd || 0), 0);
    const totalPipelineArr = basePipelineArr + simulatedAddedArr;

    const qualifiedDeals = activeDeals.filter((d) => !d.stage.startsWith("1 Lead"));
    const qualifiedArr =
      qualifiedDeals.reduce((s, d) => s + (d.amount_usd || 0), 0) + simulatedAddedArr;
    const qualifiedSharePct =
      totalPipelineArr > 0 ? Math.round((qualifiedArr / totalPipelineArr) * 100) : 0;

    const staleDeals = activeDeals
      .filter((d) => (d.aging_days || 0) > rules.staleSlaDays)
      .sort((a, b) => (b.aging_days || 0) - (a.aging_days || 0));
    const staleArr = staleDeals.reduce((s, d) => s + (d.amount_usd || 0), 0);
    const effectiveStaleArr = simRescueStale ? Math.round(staleArr * 0.35) : staleArr;
    const staleSharePct =
      totalPipelineArr > 0 ? Math.round((effectiveStaleArr / totalPipelineArr) * 100) : 0;

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

    const covScore = Math.min(100, Math.round((coverageMultActual / Math.max(0.1, coverageMultiple)) * 100));
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

    const buildHorizon = (
      label: "Full Year 2027" | "Q1 2027" | "Q2 2027",
      subLabel: string,
      targetArr: number,
      horizonDeals: Contact[],
      extraSimArr: number
    ) => {
      const pipeArr =
        horizonDeals.reduce((s, d) => s + (d.amount_usd || 0), 0) + extraSimArr;
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
        aiWtdArr,
        reqPipe,
        covMult,
        gapArr,
        dealsNeeded,
        activeCount: horizonDeals.length,
        staleCount: hStaleDeals.length,
        status,
      };
    };

    const q1Weight = (rules.quarterWeights["Q1 2027"] || 8.33) / 100;
    const q2Weight = (rules.quarterWeights["Q2 2027"] || 16.67) / 100;
    const q1Deals = scheduledDeals.filter((d) => d.expected_close === "Q1 2027");
    const q2Deals = scheduledDeals.filter((d) => d.expected_close === "Q2 2027");

    const horizons = [
      buildHorizon(
        "Full Year 2027",
        "Annual Quota Horizon",
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
        rootCause: `${activeDeals.length} active deals in pipeline against ${formatMillions(arrTarget2027)} FY27 quota.`,
        recommendedAction: "Qualify top Tier I Fortune 500 accounts into Stage 2+.",
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
        recommendedAction: "Trigger executive re-engagement on stalled accounts.",
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
        rootCause: "Concentration in Stage 2 (20% prob) plus aging SLA discounts.",
        recommendedAction: "Advance Stage 2 accounts (Dynatrace, Nokia, Sony) to Decisionmaker buy-in.",
      });
    }

    const q1H = horizons[1];
    if (q1H.covMult < coverageMultiple) {
      failingMetrics.push({
        id: "fail_q1_horizon",
        severity: q1H.covMult < rules.healthyCoverageFloor ? "critical" : "warning",
        horizon: "Q1 2027",
        metricName: "Q1 2027 Coverage & Close Readiness",
        actualLabel: `${q1H.covMult}x (${formatMillions(q1H.pipeArr)})`,
        benchmarkLabel: `${coverageMultiple}x (${formatMillions(q1H.reqPipe)})`,
        gapLabel: `-${formatMillions(q1H.gapArr)} (${q1H.dealsNeeded} deals needed)`,
        rootCause:
          q1H.activeCount === 0
            ? "No deals currently assigned to Q1 2027 Close Qtr."
            : `Only ${q1H.activeCount} deal(s) assigned to Q1 2027.`,
        recommendedAction: "Assign expected Close Qtr on near-term deals in Accounts & Targets.",
      });
    }

    const q2H = horizons[2];
    if (q2H.covMult < coverageMultiple) {
      failingMetrics.push({
        id: "fail_q2_horizon",
        severity: q2H.covMult < rules.healthyCoverageFloor ? "critical" : "warning",
        horizon: "Q2 2027",
        metricName: "Q2 2027 Coverage & Build Velocity",
        actualLabel: `${q2H.covMult}x (${formatMillions(q2H.pipeArr)})`,
        benchmarkLabel: `${coverageMultiple}x (${formatMillions(q2H.reqPipe)})`,
        gapLabel: `-${formatMillions(q2H.gapArr)} (${q2H.dealsNeeded} deals needed)`,
        rootCause:
          q2H.activeCount === 0
            ? "No deals currently assigned to Q2 2027 Close Qtr."
            : `${q2H.activeCount} deal(s) scheduled in Q2 2027.`,
        recommendedAction: "Assign Q2 2027 Close Qtr to active Stage 2–4 opportunities.",
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
        rootCause: "Active pipeline includes unvalidated Stage 1 Lead records.",
        recommendedAction: "Validate Stage 1 leads or move dormant records out of active pipeline.",
      });
    }

    const whitespaceTargets = contacts
      .filter(
        (c) =>
          c.contact_type === "customer" &&
          !isNoise(c) &&
          c.omit_from_pipeline &&
          c.tier === "Tier I" &&
          c.fortune_500 &&
          (c.icp_score || 0) >= 88
      )
      .slice(0, 4);

    return {
      activeDeals,
      scheduledDeals,
      totalPipelineArr,
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
  }, [contacts, rules, arrTarget2027, avgAcvAssumption, coverageMultiple, simExtraDeals, simRescueStale]);

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
          <div className="flex items-center justify-between gap-2">
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
            Coverage ({rules.scoreWeights.coverage}%) · Hygiene ({rules.scoreWeights.velocityHygiene}%) · Qual ({rules.scoreWeights.qualificationDepth}%)
          </div>
        </div>

        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg p-4">
          <div className="flex items-center justify-between gap-2">
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
            Rep stated: {formatMillions(engine.repWeightedArr)} (discounted for &gt;{rules.staleSlaDays}d SLA)
          </div>
        </div>

        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg p-4">
          <div className="flex items-center justify-between gap-2">
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
            Deficit: {formatMillions(engine.coverageGapArr)} ({Math.ceil(engine.coverageGapArr / avgAcvAssumption)} deals)
          </div>
        </div>

        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg p-4">
          <div className="flex items-center justify-between gap-2">
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
            <span>Governed by Settings Rules</span>
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
      <div className="bg-[var(--bg-surface)] border border-rose-500/35 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 bg-rose-500/10 border-b border-rose-500/20 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldAlert size={15} className="text-rose-400" />
            <h2 className="text-[13px] font-semibold text-[var(--tx-primary)]">
              Failing Pipeline Health Metrics ({engine.failingMetrics.length} Breaching Settings Benchmarks)
            </h2>
          </div>
          {canConfigureRules && (
            <button
              type="button"
              onClick={onOpenSettingsRules}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--tx-primary)] hover:border-sky-400/50 transition-colors"
            >
              <Sliders size={12} className="text-sky-400" />
              Configure Benchmarks &amp; Formulas
            </button>
          )}
        </div>

        <div className="divide-y divide-[var(--border-subtle)]">
          {engine.failingMetrics.map((fm) => (
            <div
              key={fm.id}
              className="px-4 py-2.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 hover:bg-[var(--bg-hover)] transition-colors"
            >
              <div className="space-y-0.5 min-w-0 flex-1">
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
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[13.5px] font-semibold text-[var(--tx-primary)]">
              Horizon Health &amp; Coverage Diagnostics (Full Year 2027 &amp; Next 2 Quarters)
            </h2>
            <p className="text-[11.5px] text-[var(--tx-muted)]">
              Evaluates immediate close readiness for Q1 2027, build velocity for Q2 2027, and full-year quota attainment.
            </p>
          </div>

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

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11.5px]">
                    <span className="text-[var(--tx-muted)]">Coverage vs {coverageMultiple}x Target</span>
                    <span className="font-semibold tabular-nums text-[var(--tx-primary)]">
                      {h.covMult}x ({formatMillions(h.pipeArr)} / {formatMillions(h.reqPipe)})
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-800/80 overflow-hidden">
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
                    {h.activeCount} scheduled deals · {h.dealsNeeded} net-new needed
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

      {/* SECTION 2B: Compressed 2027 Deal Close Timeline (Populates ONLY when Close Qtr is assigned) */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-semibold text-[var(--tx-primary)]">
              2027 Deal Close Timeline
            </h3>
            <span className="text-[11px] font-mono text-[var(--tx-muted)]">
              · {engine.scheduledDeals.length} deals with assigned Close Qtr
            </span>
          </div>
          <span className="text-[11px] text-[var(--tx-muted)]">
            Assign Close Qtr in Accounts &amp; Targets to populate · Drag cards across Q1–Q4 to reschedule
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-[var(--border-subtle)]">
          {VALID_QUARTERS.map((q) => {
            const qDeals = engine.scheduledDeals
              .filter((d) => d.expected_close === q)
              .sort((a, b) => (b.amount_usd || 0) - (a.amount_usd || 0));
            const qTotalArr = qDeals.reduce((s, d) => s + (d.amount_usd || 0), 0);
            const qWeightedArr = qDeals.reduce((s, d) => {
              const prob = rules.stageWinProbs[d.stage] ?? d.probability ?? 0;
              return s + ((d.amount_usd || 0) * prob) / 100;
            }, 0);
            const isOver = dragOverQuarter === q;

            return (
              <div
                key={q}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragOverQuarter !== q) setDragOverQuarter(q);
                }}
                onDragLeave={() => {
                  if (dragOverQuarter === q) setDragOverQuarter(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const dealId = e.dataTransfer.getData("text/plain") || draggedDealId;
                  setDragOverQuarter(null);
                  setDraggedDealId(null);
                  if (dealId) {
                    onUpdateContact(dealId, { expected_close: q });
                  }
                }}
                className={`p-3 flex flex-col gap-2 min-h-[140px] transition-colors ${
                  isOver ? "bg-sky-500/10" : "bg-transparent"
                }`}
              >
                <div className="flex items-center justify-between pb-1.5 border-b border-[var(--border-subtle)]">
                  <div>
                    <div className="text-[12px] font-semibold text-[var(--tx-primary)]">{q}</div>
                    <div className="text-[10.5px] font-mono text-[var(--tx-muted)]">
                      {formatMillions(qTotalArr)} · {formatMillions(qWeightedArr)} wtd
                    </div>
                  </div>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--tx-muted)]">
                    {qDeals.length} {qDeals.length === 1 ? "deal" : "deals"}
                  </span>
                </div>

                {qDeals.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center rounded border border-dashed border-[var(--border-subtle)] text-[11px] text-[var(--tx-muted)] py-5">
                    No deals scheduled in {q}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {qDeals.map((deal) => {
                      const prob = rules.stageWinProbs[deal.stage] ?? deal.probability ?? 0;
                      const isStale = (deal.aging_days || 0) > rules.staleSlaDays;
                      return (
                        <div
                          key={deal.id}
                          draggable
                          onDragStart={(e) => {
                            setDraggedDealId(deal.id);
                            e.dataTransfer.setData("text/plain", deal.id);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnd={() => {
                            setDraggedDealId(null);
                            setDragOverQuarter(null);
                          }}
                          onClick={() => onSelectContact(deal.id)}
                          className={`p-2 rounded border cursor-grab active:cursor-grabbing transition-colors ${
                            isStale
                              ? "bg-rose-500/10 border-rose-500/30 hover:border-rose-400/60"
                              : "bg-[var(--bg-canvas)] border-[var(--border-subtle)] hover:border-sky-400/50"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="text-[12px] font-semibold text-[var(--tx-primary)] truncate">
                              {deal.organization}
                            </span>
                            <span className="text-[11px] font-mono font-semibold text-sky-400 shrink-0">
                              {formatMillions(deal.amount_usd || 0)}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center justify-between gap-1.5 text-[10.5px] text-[var(--tx-muted)]">
                            <span className="truncate">{deal.stage}</span>
                            <span className="font-mono shrink-0">
                              {prob}% · {deal.owner || "Unassigned"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 3: Quarterly Coverage Trend Graph & Autonomous Rescue Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-6 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg p-4">
          <div className="mb-3">
            <h3 className="text-[13px] font-semibold text-[var(--tx-primary)]">
              2027 Quarterly Coverage vs. Required Pipeline ($M)
            </h3>
            <p className="text-[11px] text-[var(--tx-muted)]">
              Compares scheduled pipeline, weighted ARR, and {coverageMultiple}x required coverage across Q1–Q4.
            </p>
          </div>
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={VALID_QUARTERS.map((q) => {
                  const weight = (rules.quarterWeights[q] || 25) / 100;
                  const qTarget = Math.round(arrTarget2027 * weight);
                  const qReq = Math.round(qTarget * coverageMultiple);
                  const qDeals = engine.scheduledDeals.filter((d) => d.expected_close === q);
                  const qAct = qDeals.reduce((s, d) => s + (d.amount_usd || 0), 0);
                  const qWtd = qDeals.reduce((s, d) => {
                    const prob = rules.stageWinProbs[d.stage] ?? d.probability ?? 0;
                    return s + ((d.amount_usd || 0) * prob) / 100;
                  }, 0);
                  return {
                    quarter: q,
                    RequiredM: Number((qReq / 1_000_000).toFixed(2)),
                    ActiveM: Number((qAct / 1_000_000).toFixed(2)),
                    WeightedM: Number((qWtd / 1_000_000).toFixed(2)),
                  };
                })}
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
                <Bar dataKey="ActiveM" name="Scheduled Pipeline ($M)" fill="#38BDF8" radius={[3, 3, 0, 0]} />
                <Bar dataKey="WeightedM" name="Weighted ARR ($M)" fill="#10B981" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

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
                  className="px-3 py-2 flex items-center justify-between gap-2 hover:bg-[var(--bg-hover)] text-[12px]"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-[var(--tx-primary)] truncate">
                      {deal.organization}{" "}
                      <span className="text-[11px] font-normal text-[var(--tx-muted)]">
                        · {deal.full_name} {deal.expected_close ? `(${deal.expected_close})` : ""}
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
                          `Hi ${deal.first_name || "there"},\n\nFollowing up on our ${deal.product_or_instrument || "Fortifai"} scope for ${deal.organization}. Happy to share a 2-page executive brief tailored for your ${deal.buyer_persona || "Risk & Finance"} team.\n\nBest,\n${currentUser.full_name}`
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

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--tx-muted)] mb-1.5">
              Top Uncontacted Tier I Whitespace to Close Coverage Gap
            </div>
            <div className="grid grid-cols-2 gap-2">
              {engine.whitespaceTargets.map((wt) => (
                <div
                  key={wt.id}
                  className="px-2.5 py-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex items-center justify-between text-[11.5px]"
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

      {/* Collapsible Formula Audit Table */}
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
                  <th className="px-4 py-2">Scheduled Pipeline</th>
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
