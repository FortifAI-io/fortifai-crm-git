export interface PipelineHealthRules {
  arrTarget2027: number;
  avgAcvAssumption: number;
  requiredCoverageMultiple: number;
  healthyCoverageFloor: number;
  minQualifiedSharePct: number;
  staleSlaDays: number;
  watchSlaDays: number;
  maxStaleSharePct: number;
  minWeightedAttainmentPct: number;
  quarterWeights: {
    "Q1 2027": number;
    "Q2 2027": number;
    "Q3 2027": number;
    "Q4 2027": number;
  };
  scoreWeights: {
    coverage: number;
    velocityHygiene: number;
    qualificationDepth: number;
    weightedAttainment: number;
  };
  stageWinProbs: Record<string, number>;
}

export const DEFAULT_PIPELINE_RULES: PipelineHealthRules = {
  arrTarget2027: 3000000,
  avgAcvAssumption: 250000,
  requiredCoverageMultiple: 5.7,
  healthyCoverageFloor: 3.5,
  minQualifiedSharePct: 65,
  staleSlaDays: 90,
  watchSlaDays: 60,
  maxStaleSharePct: 20,
  minWeightedAttainmentPct: 35,
  quarterWeights: {
    "Q1 2027": 8.33,
    "Q2 2027": 16.67,
    "Q3 2027": 33.33,
    "Q4 2027": 41.67,
  },
  scoreWeights: {
    coverage: 35,
    velocityHygiene: 30,
    qualificationDepth: 20,
    weightedAttainment: 15,
  },
  stageWinProbs: {
    "1 Lead": 5,
    "2 Qualified": 20,
    "4 Decisionmaker buy in": 40,
    "5 Internal Review Pending": 60,
    "6 Commercial / Contracting": 80,
    "7 Closed Won": 100,
  },
};

export function loadPipelineRules(): PipelineHealthRules {
  try {
    const raw = localStorage.getItem("fortifai_pipeline_health_rules_v1");
    if (!raw) return DEFAULT_PIPELINE_RULES;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_PIPELINE_RULES,
      ...parsed,
      quarterWeights: { ...DEFAULT_PIPELINE_RULES.quarterWeights, ...(parsed.quarterWeights || {}) },
      scoreWeights: { ...DEFAULT_PIPELINE_RULES.scoreWeights, ...(parsed.scoreWeights || {}) },
      stageWinProbs: { ...DEFAULT_PIPELINE_RULES.stageWinProbs, ...(parsed.stageWinProbs || {}) },
    };
  } catch {
    return DEFAULT_PIPELINE_RULES;
  }
}

export function savePipelineRules(rules: PipelineHealthRules): void {
  try {
    localStorage.setItem("fortifai_pipeline_health_rules_v1", JSON.stringify(rules));
  } catch {}
}
