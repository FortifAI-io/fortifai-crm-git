import type { Region } from '../types/crm';

export function formatCurrency(amount?: number, compact = true): string {
  if (amount === undefined || amount === null || amount === 0) return '$0';
  if (!compact) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(amount);
  }
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')}M`;
  }
  if (amount >= 1000) {
    return `$${Math.round(amount / 1000)}K`;
  }
  return `$${amount}`;
}

export function formatMillions(amount?: number): string {
  const val = amount ?? 0;
  const absM = (Math.abs(val) / 1_000_000).toFixed(2);
  return val < 0 ? `-$${absM}M` : `$${absM}M`;
}

export function inferRegionFromLocation(loc: string): Region {
  const l = loc.toLowerCase();
  if (
    l.includes('india') ||
    l.includes('bengaluru') ||
    l.includes('bangalore') ||
    l.includes('mumbai') ||
    l.includes('delhi') ||
    l.includes('gurugram') ||
    l.includes('gurgaon') ||
    l.includes('hyderabad') ||
    l.includes('chennai') ||
    l.includes('pune')
  ) {
    return 'India';
  }
  if (l.includes('uae') || l.includes('dubai') || l.includes('abu dhabi') || l.includes('sharjah')) {
    return 'UAE';
  }
  if (l.includes('singapore')) {
    return 'Singapore';
  }
  if (
    l.includes('uk') ||
    l.includes('london') ||
    l.includes('europe') ||
    l.includes('berlin') ||
    l.includes('paris') ||
    l.includes('zurich')
  ) {
    return 'UK/Europe';
  }
  if (
    l.includes('us') ||
    l.includes('usa') ||
    l.includes('new york') ||
    l.includes('san francisco') ||
    l.includes('ca') ||
    l.includes('ny') ||
    l.includes('tx') ||
    l.includes('ma') ||
    l.includes('md') ||
    l.includes('nc') ||
    l.includes('az')
  ) {
    return 'US';
  }
  return 'Other';
}

export function getStageBadgeStyle(stage: string): string {
  const s = stage.toLowerCase();
  if (
    s.includes('safe signed') ||
    s.includes('7 closed won') ||
    s.includes('5 internal review') ||
    s.includes('6 commercial')
  ) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
  if (s.includes('diligence') || s.includes('meeting') || s.includes('4 decisionmaker')) {
    return 'bg-blue-50 text-blue-700 border-blue-200';
  }
  if (s.includes('portal visited') || s.includes('replied') || s.includes('2 qualified')) {
    return 'bg-indigo-50 text-indigo-700 border-indigo-200';
  }
  if (s.includes('passed') || s.includes('no response')) {
    return 'bg-rose-50 text-rose-700 border-rose-200';
  }
  if (s.includes('sent') || s.includes('scheduled') || s.includes('reminder') || s.includes('1 lead')) {
    return 'bg-amber-50 text-amber-700 border-amber-200';
  }
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

export function getRegionBadgeStyle(region: Region): string {
  switch (region) {
    case 'US':
      return 'bg-slate-100 text-slate-800 border-slate-200';
    case 'India':
      return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'UAE':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'Singapore':
      return 'bg-red-50 text-red-700 border-red-200';
    case 'UK/Europe':
      return 'bg-sky-50 text-sky-700 border-sky-200';
    default:
      return 'bg-slate-50 text-slate-600 border-slate-200';
  }
}

export const STAGE_PROBABILITY_MAP: Record<string, number> = {
  "1 Lead": 5,
  "2 Qualified": 15,
  "4 Decisionmaker buy in": 35,
  "5 Internal Review Pending": 60,
  "6 Commercial / Contracting": 85,
  "7 Closed Won": 100,
  "9 No response": 0,
};

export function getStageDefaultProbability(stage: string): number {
  return STAGE_PROBABILITY_MAP[stage] ?? 5;
}

export const STAGE_2_PLUS_SET = new Set([
  "2 Qualified",
  "4 Decisionmaker buy in",
  "5 Internal Review Pending",
  "6 Commercial / Contracting",
  "7 Closed Won",
]);

export function daysBetweenIso(startIso?: string, endMs: number = Date.now()): number {
  if (!startIso) return 0;
  const parsed = Date.parse(startIso);
  if (Number.isNaN(parsed)) return 0;
  return Math.max(0, Math.floor((endMs - parsed) / 86400000));
}

export function computeDealVelocity(c: {
  stage: string;
  aging_days?: number;
  created_at?: string;
  stage_entered_at?: string;
  stage2_entered_at?: string;
  stage_history?: Record<string, number>;
}) {
  const now = Date.now();
  const currentStageDays = c.stage_entered_at
    ? daysBetweenIso(c.stage_entered_at, now)
    : Math.max(0, c.aging_days || 0);

  const isStage2Plus = STAGE_2_PLUS_SET.has(c.stage);
  const stage2PlusDays = !isStage2Plus
    ? 0
    : c.stage2_entered_at
    ? daysBetweenIso(c.stage2_entered_at, now)
    : Math.max(0, c.aging_days || 0);

  const historySum = Object.values(c.stage_history || {}).reduce((s, d) => s + (Number(d) || 0), 0);
  const totalPipelineDays = c.created_at
    ? Math.max(daysBetweenIso(c.created_at, now), historySum + currentStageDays)
    : Math.max(historySum + currentStageDays, stage2PlusDays, c.aging_days || 0);

  const perStageDays: Record<string, number> = { ...(c.stage_history || {}) };
  if (c.stage && c.stage !== "9 No response") {
    perStageDays[c.stage] = (perStageDays[c.stage] || 0) + currentStageDays;
  }

  return {
    totalPipelineDays,
    currentStageDays,
    stage2PlusDays,
    isStage2Plus,
    perStageDays,
  };
}
