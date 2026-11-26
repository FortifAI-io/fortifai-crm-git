export type Region = 'US' | 'India' | 'UAE' | 'Singapore' | 'UK/Europe' | 'Other';
export type ContactType = 'customer' | 'investor';
export type PortalLinkMode = 'none' | 'overview' | 'investor';
export type CustomFieldType = 'text' | 'number' | 'select' | 'boolean' | 'date';
export type EntityScope = 'customer' | 'investor' | 'both';
export type Quarter = 'Q1 2027' | 'Q2 2027' | 'Q3 2027' | 'Q4 2027';

export type ActiveTab =
  | 'pipeline_health'
  | 'pipeline_timeline'
  | 'customer_analytics'
  | 'customers'
  | 'customer_outreach'
  | 'customer_telemetry'
  | 'investor_funnel'
  | 'investors'
  | 'investor_outreach'
  | 'investor_telemetry'
  | 'admin'
  | 'settings';

export type UserRole =
  | 'super_admin'
  | 'admin'
  | 'marketing'
  | 'sales_lead'
  | 'investor_relations'
  | 'analyst_viewer';

export interface UserPermissions {
  can_view_customers: boolean;
  can_edit_customers: boolean;
  can_view_investors: boolean;
  can_edit_investors: boolean;
  can_send_campaigns: boolean;
  can_send_as_marketing: boolean;
  can_manage_schema: boolean;
  can_manage_users: boolean;
}

export interface CrmUser {
  id: string;
  email: string;
  full_name: string;
  sender_display_name?: string;
  role: UserRole;
  permissions: UserPermissions;
  is_active: boolean;
  invited_by?: string;
  created_at: string;
  last_login_at?: string;
}

export type DeliveryStatus =
  | 'not_sent'
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'portal_visited'
  | 'replied'
  | 'bounced';

export interface CustomFieldDefinition {
  id: string;
  entity_scope: EntityScope;
  field_key: string;
  field_label: string;
  field_type: CustomFieldType;
  select_options?: string[];
  display_order?: number;
}

export interface QuickNoteEntry {
  id: string;
  text: string;
  author_name: string;
  author_email: string;
  created_at: string;
}

export interface Contact {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  organization: string;
  title: string;
  region: Region;
  location: string;
  contact_type: ContactType;

  // Customer & Enterprise Pipeline fields
  buyer_persona?: 'CCO/GC' | 'CAE' | 'CFO' | 'CPO' | 'Other';
  industry?: string;
  tier?: 'Tier I' | 'Tier II';
  icp_score?: number;
  fortune_500?: boolean;
  expected_close?: Quarter;
  aging_days?: number;
  omit_from_pipeline?: boolean;

  // Investor & $3M Seed fields
  priority_tier?: 'P1' | 'P2' | 'P3' | 'P4';
  execution_wave?: string;
  batch_order?: number;
  us_inst_seed_track?: boolean;
  check_size_label?: string;
  min_check_usd?: number;
  max_check_usd?: number;
  stage_focus?: string;
  thesis_fit?: string;
  match_score?: number;
  custom_hook?: string;
  email_opened?: boolean;
  portal_visited?: boolean;

  // Delivery & Read Status Tracking
  delivery_status?: DeliveryStatus;
  sent_at?: string;
  delivered_at?: string;
  opened_at?: string;
  opened_duration_sec?: number;
  replied_at?: string;
  last_reply_subject?: string;
  last_reply_snippet?: string;
  last_reply_from?: string;
  bounced_at?: string;
  bounced_reason?: string;

  // Shared Opportunity / Pipeline fields
  opportunity_id?: string;
  meeting_booked?: boolean;
  stage: string;
  outcome?: string;
  amount_usd?: number;
  probability?: number;
  product_or_instrument?: string;
  next_step?: string;
  notes?: string;
  quick_notes?: QuickNoteEntry[];

  // Shared Ownership, Metadata & Dynamic Custom Fields
  owner_id: string;
  owner_email: string;
  owner: string;
  relationship_strength?: string;
  tags?: string[];
  unsubscribed: boolean;
  is_demo?: boolean;
  last_contacted_at?: string;
  custom_fields: Record<string, string | number | boolean>;
}

export interface TelemetryEvent {
  id: string;
  contact_id: string;
  contact_name: string;
  organization: string;
  contact_type: ContactType;
  source: 'resend' | 'investor.fortifai.io' | 'overview.fortifai.io';
  event_type:
    | 'email_sent'
    | 'email_delivered'
    | 'email_opened'
    | 'email_clicked'
    | 'email_bounced'
    | 'email_replied'
    | 'visit'
    | 'deck_opened'
    | 'financials_viewed'
    | 'callback_requested'
    | 'safe_generated'
    | 'pass_submitted'
    | 'agent_explored';
  detail: string;
  timestamp: string;
  duration_sec?: number;
  is_bot_scan?: boolean;
  bcc_inbox?: string;
  sender_from?: string;
  reply_subject?: string;
  reply_snippet?: string;
}

export interface PipelineAnalytics {
  activeDealsCount: number;
  qualifiedDealsCount: number;
  actualPipelineArr: number;
  qualifiedPipelineArr: number;
  qualifiedSharePct: number;
  leadOnlyPipelineArr: number;
  weightedPipelineArr: number;
  closedDealsRequired: number;
  coverageMultiple: number;
  recommendedCoverageArr: number;
  coverageGapArr: number;
  coverageVsTargetPct: number;
  pipelineCoverageMultipleActual: number;
  requiredWinRatePct: number;
  avgDealSizeArr: number;
  weightedWinProbPct: number;
  weightedAttainmentPct: number;
  weightedArrGap: number;
  netNewDealsNeeded: number;
  avgAgingDays: number;
  stalePipelineArr: number;
  stalePipelineSharePct: number;
  staleWeightedArr: number;
  healthyPipelineArr: number;
  quarterly: {
    quarter: Quarter;
    weightPct: number;
    targetArr: number;
    cumulativeTargetArr: number;
    closedRequired: number;
    activeQualifiedCount: number;
    qualifiedArr: number;
    requiredPipeline: number;
    actualCoverage: number;
    weightedArr: number;
    pipelineGapArr: number;
    newDealsRequired: number;
    coverageMultipleActual: number;
    coveragePct: number;
    weightedAttainmentPct: number;
    reqWinRate: number;
  }[];
  byStage: {
    stage: string;
    stageProbPct: number;
    count: number;
    arr: number;
    sharePct: number;
    weighted: number;
    avgAcv: number;
    avgAgingDays: number;
  }[];
  byPersona: {
    persona: 'CCO/GC' | 'CAE' | 'CFO' | 'CPO';
    count: number;
    arr: number;
    weighted: number;
    sharePct: number;
    avgAgingDays: number;
  }[];
  byRegion: {
    region: Region;
    count: number;
    arr: number;
    weighted: number;
    sharePct: number;
  }[];
  agingBuckets: {
    label: string;
    deals: Contact[];
    color: string;
  }[];
  staleDeals: Contact[];
  velocityTrend90d: {
    label: string;
    daysAgo: number;
    activeDealsCount: number;
    activeArrM: number;
    weightedArrM: number;
    staleLeakageArrM: number;
    velocityPerMonthM: number;
    avgAgeDays: number;
  }[];
  stageConversion90d: {
    stageKey: string;
    stageLabel: string;
    reachedCount: number;
    reachedArrM: number;
    conversionPct: number;
    healthyConversionPct: number;
    leakagePct: number;
    dropOffFromPrevPct: number;
    benchmarkPct: number;
    stalledOver90dCount: number;
  }[];
}

export interface InvestorAnalytics {
  total: number;
  usInstSeedCount: number;
  contactedCount: number;
  sentCount: number;
  scheduledCount: number;
  activeOutreachCount: number;
  activeExclPassesCount: number;
  openedCount: number;
  openRatePct: number;
  portalVisitsCount: number;
  meetingsOrDiligenceCount: number;
  passedCount: number;
  committedSafeUsd: number;
  softCircledDiligenceUsd: number;
  remainingToCloseUsd: number;
  usSeedBreakdown: {
    label: string;
    count: number;
    sharePct: number;
    isHighlight?: boolean;
  }[];
  byTrack: {
    track: string;
    count: number;
    sharePct: number;
    opened: number;
    portalVisited: number;
    meetings: number;
  }[];
  byPriority: {
    priority: 'P1' | 'P2' | 'P3' | 'P4';
    targets: number;
    sent: number;
    scheduled: number;
    opened: number;
    portalVisits: number;
    meetings: number;
    passed: number;
  }[];
  priorityTotals: {
    targets: number;
    sent: number;
    scheduled: number;
    opened: number;
    portalVisits: number;
    meetings: number;
    passed: number;
  };
  hotSignals: Contact[];
}

export interface CustomerAnalytics {
  totalAccounts: number;
  totalArr: number;
  weightedArr: number;
  avgAcv: number;
  avgIcpScore: number;
  fortune500Count: number;
  fortune500Arr: number;
  tierIStats: { count: number; arr: number; avgScore: number; avgAging: number };
  tierIIStats: { count: number; arr: number; avgScore: number; avgAging: number };
  bySector: {
    sector: string;
    count: number;
    arr: number;
    weightedArr: number;
    avgScore: number;
    sharePct: number;
  }[];
  byRegion: {
    region: Region;
    count: number;
    arr: number;
    avgScore: number;
    sharePct: number;
  }[];
  byLocation: {
    location: string;
    region: Region;
    count: number;
    arr: number;
  }[];
  byScoreBand: {
    label: string;
    range: string;
    count: number;
    arr: number;
    color: string;
  }[];
  byOwner: {
    owner: string;
    count: number;
    arr: number;
    avgScore: number;
  }[];
  topAccounts: Contact[];
  customColumnInsights: {
    field: CustomFieldDefinition;
    populatedCount: number;
    breakdown: { label: string; count: number; arr: number }[];
  }[];
}

export interface DetectedColumnMapping {
  sourceHeader: string;
  normalizedKey: string;
  targetType: 'core' | 'custom' | 'skip';
  coreField?: string;
  customLabel: string;
  customKey: string;
  inferredType: CustomFieldType;
  selectOptions?: string[];
  sampleValues: string[];
  alreadyExists?: boolean;
}

export interface AskMeSqlSource {
  purpose: string;
  sql: string;
  row_count: number;
  source: 'supabase_rpc' | 'in_memory_sqlite';
  retried?: boolean;
  error?: string;
}

export interface AskMeKpi {
  label: string;
  value: string;
  sub?: string;
}

export interface AskMeTableData {
  columns: string[];
  rows: Record<string, string | number | boolean | null>[];
}

export interface AskMeContactPill {
  id: string;
  full_name: string;
  organization: string;
  email: string;
  contact_type: ContactType;
  stage?: string;
}

export interface AskMeDraftAction {
  contact_ids: string[];
  subject: string;
  body_template: string;
  audience_type: ContactType;
  recipient_count: number;
  contacts: AskMeContactPill[];
}

export interface AskMeStructuredPayload {
  summary: string;
  kpis?: AskMeKpi[];
  table?: AskMeTableData;
  contact_pills?: AskMeContactPill[];
  draft_actions?: AskMeDraftAction[];
  sql_sources?: AskMeSqlSource[];
  follow_up_suggestions?: string[];
}

export interface AskMeChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  structured?: AskMeStructuredPayload;
  error?: string;
}

export type WedgeAgentName =
  | 'Counterpart Risk Monitoring'
  | 'ABAC'
  | 'Kuber'
  | 'Surge'
  | 'Aegis'
  | 'Crystal'
  | 'D7';

export interface DossierSource {
  title: string;
  uri: string;
}

export interface DossierBuyingCommitteeRow {
  persona: 'CCO/GC' | 'CAE' | 'CFO/CAO' | 'CPO';
  contact_name: string;
  scale_status: string;
  persona_angle: string;
}

export interface AccountDossierPayload {
  account_snapshot: {
    revenue: string;
    margin: string;
    hq_regions: string;
    icp_score: number;
    target_arr: string;
    primary_wedge_agent: WedgeAgentName;
    why_now_bullets: string[];
  };
  financial_triggers: {
    bullets: string[];
  };
  regulatory_pressures: {
    bullets: string[];
  };
  erp_india_gcc: {
    bullets: string[];
  };
  buying_committee_map: DossierBuyingCommitteeRow[];
  scale_engagement_pulse: {
    bullets: string[];
  };
}

export interface AccountDossier {
  id: string;
  organization: string;
  industry: string;
  region: Region | string;
  icp_fit_score: number;
  primary_wedge_product: WedgeAgentName | string;
  dossier_json: AccountDossierPayload;
  sources: DossierSource[];
  generated_by: string;
  generated_at: string;
  word_count?: number;
}


