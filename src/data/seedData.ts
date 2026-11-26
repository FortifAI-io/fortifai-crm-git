import realDatabase from "./realDatabase.json";
import type {
  Contact,
  CrmUser,
  CustomFieldDefinition,
  Quarter,
  Region,
  TelemetryEvent,
  UserPermissions,
  UserRole,
} from '../types/crm';

export const ALLOWED_AUTH_DOMAINS = ['@fortifai.io', '@tryfortifai.us'] as const;

export const REGIONS: ('All' | Region)[] = [
  'All',
  'US',
  'India',
  'UAE',
  'Singapore',
  'UK/Europe',
  'Other',
];

export const QUARTERS: Quarter[] = ['Q1 2027', 'Q2 2027', 'Q3 2027', 'Q4 2027'];

export const CUSTOMER_STAGES = [
  'All',
  '1 Lead',
  '2 Qualified',
  '4 Decisionmaker buy in',
  '5 Internal Review Pending',
  '6 Commercial / Contracting',
  '7 Closed Won',
  '9 No response',
];

export const STAGE_WIN_PROBABILITIES: Record<string, number> = {
  '1 Lead': 0,
  '2 Qualified': 20,
  '4 Decisionmaker buy in': 20,
  '5 Internal Review Pending': 50,
  '6 Commercial / Contracting': 75,
  '7 Closed Won': 100,
  '9 No response': 0,
};

export interface UsGtmStrategyRow {
  dimension: string;
  targetSpecification: string;
  keyCriteria: string;
  primaryValueProp: string;
  primaryProducts: string;
  keyStakeholders: string;
}

export interface UsBuyerPersonaRow {
  roleLabel: string;
  personaCode: 'CCO/GC' | 'CAE' | 'CFO' | 'CPO';
  tierI: number;
  tierII: number;
  playbook: string;
}

export interface UsEnterpriseProfileRow {
  segment: string;
  totalContacts: number;
  tierI: number;
  tierII: number;
  positioning: string;
}

export interface UsAccountFitRow {
  band: string;
  scoreRange: string;
  totalContacts: number;
  tierISharePct: number;
  playbook: string;
}

export const US_SALES_PIPELINE_BENCHMARKS = {
  totalAddressableContacts: 1669,
  totalTierI: 797,
  totalTierII: 872,
  avgFitScore: 64.2,
  gtmStrategy: [
    {
      dimension: 'Ideal Customer Profile (ICP)',
      targetSpecification: 'US Large Enterprise ($1B+ Revenue, F500 / Public)',
      keyCriteria: 'High regulatory scrutiny, multi-entity ERPs, complex transactions, SEC/DOJ oversight',
      primaryValueProp: 'Continuous automated enterprise risk surveillance, litigation readiness & predictive compliance',
      primaryProducts: 'Fortifai, D7',
      keyStakeholders: 'Board, Audit Committee, C-Suite',
    },
    {
      dimension: 'Priority Verticals',
      targetSpecification: 'Aero & Defense, Industrial, Semi, Healthcare, Pharma, Manufacturing, Telecom, Tech',
      keyCriteria: 'Complex supply chains, heavy FCPA/FAR/ITAR/SEC exposure, massive transaction volumes',
      primaryValueProp: 'Real-time transactional audit AI, cross-system anomaly detection, automated vendor vetting',
      primaryProducts: 'Fortifai AI Core',
      keyStakeholders: 'Business Unit Presidents, EVP Ops',
    },
    {
      dimension: 'Buyer Persona: CCO / GC',
      targetSpecification: 'Chief Compliance Officer / General Counsel',
      keyCriteria: 'Govt investigations, compliance reporting, anti-bribery/FCPA, subpoena response',
      primaryValueProp: 'Automated investigation triage, defensible audit trails, early anomaly identification',
      primaryProducts: 'Fortifai, D7',
      keyStakeholders: 'Chief Legal Officer, Compliance Dir.',
    },
    {
      dimension: 'Buyer Persona: CAE',
      targetSpecification: 'Chief Audit Executive / VP Internal Audit',
      keyCriteria: 'Internal audit coverage, SOX testing, continuous controls monitoring, risk logs',
      primaryValueProp: '100% full-population risk monitoring replacing sample spot-audits; 80% faster cycles',
      primaryProducts: 'Fortifai',
      keyStakeholders: 'Audit Committee, CAE, VP Risk',
    },
    {
      dimension: 'Buyer Persona: CFO / CAO',
      targetSpecification: 'Chief Financial Officer / Chief Accounting Officer',
      keyCriteria: 'Margin leakage, T&E forensics, short collection risk, procurement anomalies',
      primaryValueProp: 'Direct bottom-line margin protection through automated spend forensics and leakage detection',
      primaryProducts: 'Fortifai, D7',
      keyStakeholders: 'CFO, VP Finance, Controller',
    },
    {
      dimension: 'Buyer Persona: CPO',
      targetSpecification: 'Chief Procurement Officer / VP Supply Chain',
      keyCriteria: 'Vendor risk scoring, contract leakage, conflict of interest, vendor collusion',
      primaryValueProp: 'Pre-award vendor risk scoring and continuous contract discrepancy detection',
      primaryProducts: 'Fortifai',
      keyStakeholders: 'CPO, VP Global Procurement',
    },
  ] as UsGtmStrategyRow[],
  buyerPersonaBreakdown: [
    {
      roleLabel: 'Audit & Legal Leadership (CCO / GC)',
      personaCode: 'CCO/GC',
      tierI: 152,
      tierII: 128,
      playbook: 'DOJ/SEC investigation triage, subpoena surveillance, FCPA anti-bribery automation',
    },
    {
      roleLabel: 'Internal Audit & Controls (CAE)',
      personaCode: 'CAE',
      tierI: 96,
      tierII: 60,
      playbook: '100% full-population risk monitoring replacing spot-audits, automated SOX workpapers',
    },
    {
      roleLabel: 'Finance & Accounting Office (CFO / CAO)',
      personaCode: 'CFO',
      tierI: 374,
      tierII: 570,
      playbook: 'Margin leakage eradication, spend anomaly detection, short collections forensics',
    },
    {
      roleLabel: 'Procurement & Supply Chain (CPO)',
      personaCode: 'CPO',
      tierI: 174,
      tierII: 116,
      playbook: 'Pre-award vendor risk scoring, invoice-contract mismatch AI, vendor collusion scans',
    },
  ] as UsBuyerPersonaRow[],
  enterpriseProfileAnalysis: [
    {
      segment: 'Fortune 500 Enterprise Leaders',
      totalContacts: 192,
      tierI: 167,
      tierII: 25,
      positioning: 'Premier marquee logos with $250K+ ACV potential; complex multi-entity risk audit',
    },
    {
      segment: 'US Publicly Listed (Non-F500)',
      totalContacts: 674,
      tierI: 630,
      tierII: 44,
      positioning: 'Mandatory SEC 10-K, SOX 404 & DOJ compliance requirements accelerate adoption',
    },
    {
      segment: 'Non-Listed Private Enterprise',
      totalContacts: 803,
      tierI: 0,
      tierII: 803,
      positioning: 'Focus on procurement leak recovery and cash flow margin defense without public filings',
    },
  ] as UsEnterpriseProfileRow[],
  fitScoreDistribution: [
    {
      band: 'Top Fit Tier (Priority Enterprise)',
      scoreRange: 'Score >= 75',
      totalContacts: 505,
      tierISharePct: 96.8,
      playbook: 'Immediate high-touch AE multi-threading; tailored executive ROI POC proposals',
    },
    {
      band: 'Medium Fit Tier (Core Market)',
      scoreRange: 'Score 50 - 74',
      totalContacts: 704,
      tierISharePct: 43.8,
      playbook: 'Automated SDR sequencing, persona pain-point webinars, mid-market account nurture',
    },
    {
      band: 'Low Fit Tier (Long-Tail / Reserve)',
      scoreRange: 'Score < 50',
      totalContacts: 460,
      tierISharePct: 0.0,
      playbook: 'Inbound-only routing; periodic compliance trigger tracking before outbound effort',
    },
  ] as UsAccountFitRow[],
};

export const INVESTOR_STAGES = [
  'All',
  'Not sent',
  'Scheduled',
  'Sent',
  'Reminder Sched',
  'Reminder Sent',
  'Portal Visited',
  'Replied',
  'Meeting',
  'Diligence',
  'SAFE Signed',
  'Passed',
];

export const PERMISSION_LABELS: { key: keyof UserPermissions; label: string; short: string }[] = [
  { key: 'can_view_customers', label: 'View Customers', short: 'View Cust' },
  { key: 'can_edit_customers', label: 'Edit Customers', short: 'Edit Cust' },
  { key: 'can_view_investors', label: 'View Investors', short: 'View Inv' },
  { key: 'can_edit_investors', label: 'Edit Investors', short: 'Edit Inv' },
  { key: 'can_send_campaigns', label: 'Send Campaigns', short: 'Send Email' },
  {
    key: 'can_send_as_marketing',
    label: 'Send as Marketing (Fortifai <contact@fortifai.io>)',
    short: 'Mktg From',
  },
  { key: 'can_manage_schema', label: 'Manage Schema (+ Columns)', short: 'Schema' },
  { key: 'can_manage_users', label: 'Manage Users (RBAC)', short: 'Admin' },
];

export const ROLE_PRESETS: Record<
  UserRole,
  { label: string; description: string; permissions: UserPermissions }
> = {
  super_admin: {
    label: 'Super Admin',
    description:
      'Full access to Customers, $3M Seed Investors, Marketing Send-From, Schema, and RBAC.',
    permissions: {
      can_view_customers: true,
      can_edit_customers: true,
      can_view_investors: true,
      can_edit_investors: true,
      can_send_campaigns: true,
      can_send_as_marketing: true,
      can_manage_schema: true,
      can_manage_users: true,
    },
  },
  admin: {
    label: 'Admin',
    description:
      'Workspace admin across Customers, Investors, Marketing Send-From, Schema, and team access.',
    permissions: {
      can_view_customers: true,
      can_edit_customers: true,
      can_view_investors: true,
      can_edit_investors: true,
      can_send_campaigns: true,
      can_send_as_marketing: true,
      can_manage_schema: true,
      can_manage_users: true,
    },
  },
  marketing: {
    label: 'Marketing',
    description:
      'Runs enterprise campaigns and sends as Fortifai <contact@fortifai.io> or personal address.',
    permissions: {
      can_view_customers: true,
      can_edit_customers: false,
      can_view_investors: false,
      can_edit_investors: false,
      can_send_campaigns: true,
      can_send_as_marketing: true,
      can_manage_schema: false,
      can_manage_users: false,
    },
  },
  sales_lead: {
    label: 'Sales Lead',
    description:
      'Manages Enterprise Customers, Pipeline Health, Schema, and personal Deal Owner outreach.',
    permissions: {
      can_view_customers: true,
      can_edit_customers: true,
      can_view_investors: false,
      can_edit_investors: false,
      can_send_campaigns: true,
      can_send_as_marketing: false,
      can_manage_schema: true,
      can_manage_users: false,
    },
  },
  investor_relations: {
    label: 'Investor Relations',
    description: 'Manages $3M Seed Investor Funnel, Investor DB, and Investor Outreach.',
    permissions: {
      can_view_customers: false,
      can_edit_customers: false,
      can_view_investors: true,
      can_edit_investors: true,
      can_send_campaigns: true,
      can_send_as_marketing: false,
      can_manage_schema: false,
      can_manage_users: false,
    },
  },
  analyst_viewer: {
    label: 'Analyst Viewer',
    description: 'Read-only access to dashboards and contact tables; cannot send or edit.',
    permissions: {
      can_view_customers: true,
      can_edit_customers: false,
      can_view_investors: true,
      can_edit_investors: false,
      can_send_campaigns: false,
      can_send_as_marketing: false,
      can_manage_schema: false,
      can_manage_users: false,
    },
  },
};

export const INITIAL_CRM_USERS: CrmUser[] = [
  {
    id: 'usr_varun',
    email: 'varun@fortifai.io',
    full_name: 'Varun Mowar',
    sender_display_name: 'Varun Mowar',
    role: 'super_admin',
    permissions: { ...ROLE_PRESETS.super_admin.permissions },
    is_active: true,
    invited_by: 'System Owner',
    created_at: '2026-10-01T09:00:00Z',
    last_login_at: '2026-11-26T04:45:00Z',
  },
  {
    id: 'usr_mike',
    email: 'mike@fortifai.io',
    full_name: 'Mike Miller',
    sender_display_name: 'Mike Miller',
    role: 'sales_lead',
    permissions: { ...ROLE_PRESETS.sales_lead.permissions },
    is_active: true,
    invited_by: 'varun@fortifai.io',
    created_at: '2026-10-14T14:20:00Z',
    last_login_at: '2026-11-25T19:10:00Z',
  },
  {
    id: 'usr_elena',
    email: 'elena@fortifai.io',
    full_name: 'Elena Rostova',
    sender_display_name: 'Elena Rostova',
    role: 'marketing',
    permissions: { ...ROLE_PRESETS.marketing.permissions },
    is_active: true,
    invited_by: 'varun@fortifai.io',
    created_at: '2026-10-22T11:30:00Z',
    last_login_at: '2026-11-25T15:00:00Z',
  },
  {
    id: 'usr_arun',
    email: 'arun@tryfortifai.us',
    full_name: 'Arun Verma',
    sender_display_name: 'Arun Verma',
    role: 'investor_relations',
    permissions: { ...ROLE_PRESETS.investor_relations.permissions },
    is_active: true,
    invited_by: 'varun@fortifai.io',
    created_at: '2026-11-02T11:00:00Z',
    last_login_at: '2026-11-24T16:05:00Z',
  },
  {
    id: 'usr_dave',
    email: 'dave@tryfortifai.us',
    full_name: 'Dave Brooks',
    sender_display_name: 'Dave Brooks',
    role: 'analyst_viewer',
    permissions: { ...ROLE_PRESETS.analyst_viewer.permissions },
    is_active: true,
    invited_by: 'varun@fortifai.io',
    created_at: '2026-11-10T10:30:00Z',
    last_login_at: '2026-11-23T12:00:00Z',
  },
];

export const INITIAL_CUSTOM_FIELDS: CustomFieldDefinition[] = [
  {
    id: 'cf_1',
    entity_scope: 'investor',
    field_key: 'warm_intro_by',
    field_label: 'Warm Intro By',
    field_type: 'text',
  },
  {
    id: 'cf_2',
    entity_scope: 'customer',
    field_key: 'erp_stack',
    field_label: 'Core ERP / GRC',
    field_type: 'select',
    select_options: ['SAP S/4HANA', 'Oracle NetSuite', 'Workday', 'ServiceNow', 'Custom'],
  },
  {
    id: 'cf_3',
    entity_scope: 'both',
    field_key: 'priority_flag',
    field_label: 'Q1 Executive Focus',
    field_type: 'boolean',
  },
];

export const INITIAL_CONTACTS: Contact[] = realDatabase as unknown as Contact[];

export const INITIAL_TELEMETRY: TelemetryEvent[] = [
  {
    id: 'evt_101',
    contact_id: 'cust_01',
    contact_name: 'Matt Nollan',
    organization: 'Honeywell Aero',
    contact_type: 'customer',
    source: 'overview.fortifai.io',
    event_type: 'agent_explored',
    detail: 'Explored Counterpart Risk Monitoring & ABAC Compliance Agents',
    timestamp: '3 hours ago',
    duration_sec: 42,
  },
  {
    id: 'evt_102',
    contact_id: 'inv_01',
    contact_name: 'Jason Spievak',
    organization: 'Entrada Ventures',
    contact_type: 'investor',
    source: 'resend',
    event_type: 'email_opened',
    detail: 'Opened Cat A Reminder Email (47s read — verified human open)',
    timestamp: 'Nov 10',
    duration_sec: 47,
    is_bot_scan: false,
  },
  {
    id: 'evt_103',
    contact_id: 'inv_02',
    contact_name: 'Andrew Van Nest',
    organization: 'Exceptional Capital',
    contact_type: 'investor',
    source: 'resend',
    event_type: 'email_opened',
    detail: 'Opened Cat A Follow-Up Email (52s read — verified human open)',
    timestamp: 'Nov 10',
    duration_sec: 52,
    is_bot_scan: false,
  },
  {
    id: 'evt_104',
    contact_id: 'inv_03',
    contact_name: 'Bala Chandrasekaran',
    organization: 'Alt Capital',
    contact_type: 'investor',
    source: 'resend',
    event_type: 'email_opened',
    detail: 'Opened Cat A Reminder Email (41s read — verified human open)',
    timestamp: 'Nov 10',
    duration_sec: 41,
    is_bot_scan: false,
  },
  {
    id: 'evt_104b',
    contact_id: 'cust_03',
    contact_name: 'Glynna Christian',
    organization: 'TIAA',
    contact_type: 'customer',
    source: 'resend',
    event_type: 'email_opened',
    detail: 'Automated link prefetch / security scanner hit (3s < 10s threshold — filtered)',
    timestamp: '6 hours ago',
    duration_sec: 3,
    is_bot_scan: true,
  },
  {
    id: 'evt_105',
    contact_id: 'inv_08',
    contact_name: 'Davis Treybig',
    organization: 'Innovation Endeavors',
    contact_type: 'investor',
    source: 'resend',
    event_type: 'email_opened',
    detail: 'Opened initial Seed note (Cat B reminder scheduled tonight)',
    timestamp: 'Nov 10',
    duration_sec: 38,
    is_bot_scan: false,
  },
  {
    id: 'evt_106',
    contact_id: 'cust_09',
    contact_name: 'Vikram Mehta',
    organization: 'Brookfield Properties',
    contact_type: 'customer',
    source: 'resend',
    event_type: 'email_delivered',
    detail: 'Delivered Continuous Audit MSA packet via Resend (250 OK)',
    timestamp: 'Yesterday',
  },
  {
    id: 'evt_107',
    contact_id: 'cust_07',
    contact_name: 'Jeff Huang',
    organization: 'Dynatrace',
    contact_type: 'customer',
    source: 'resend',
    event_type: 'email_bounced',
    detail: 'Hard bounce: 550 5.1.1 Mailbox unavailable',
    timestamp: 'Nov 21',
  },
];

export const PORTAL_SNIPPET_CODE = `// src/lib/crmTracker.ts — Add to investor.fortifai.io & overview.fortifai.io
const CRM_WEBHOOK_URL = 'https://<your-crm-vercel-domain>/api/track-portal';

export function getTrackedContactId(): string | null {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get('ref');
  if (ref) {
    sessionStorage.setItem('fortifai_ref', ref);
    return ref;
  }
  return sessionStorage.getItem('fortifai_ref');
}

export async function trackPortalEvent(
  eventType: 'visit' | 'deck_opened' | 'financials_viewed' | 'callback_requested' | 'safe_generated' | 'pass_submitted' | 'agent_explored',
  metadata: Record<string, any> = {}
) {
  const contactId = getTrackedContactId();
  if (!contactId) return;

  await fetch(CRM_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contactId,
      portal: window.location.hostname,
      eventType,
      metadata,
    }),
  }).catch(() => {});
}`;

export const SUPABASE_SQL_SCHEMA = `-- Fortifai Scale PostgreSQL Schema (contacts, opportunities, custom_field_definitions, campaigns, email_logs, portal_events, crm_users, account_dossiers)
create table if not exists crm_users (
  id text primary key,
  email text not null unique,
  full_name text not null,
  sender_display_name text,
  role text not null check (role in ('super_admin', 'admin', 'marketing', 'sales_lead', 'investor_relations', 'analyst_viewer')),
  can_view_customers boolean not null default true,
  can_edit_customers boolean not null default false,
  can_view_investors boolean not null default false,
  can_edit_investors boolean not null default false,
  can_send_campaigns boolean not null default false,
  can_send_as_marketing boolean not null default false,
  can_manage_schema boolean not null default false,
  can_manage_users boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz default now()
);

create table if not exists contacts (
  id text primary key,
  email text not null,
  first_name text default '',
  last_name text default '',
  full_name text not null,
  organization text not null,
  title text default '',
  region text not null default 'US',
  location text default '',
  contact_type text not null check (contact_type in ('customer', 'investor')),
  buyer_persona text,
  industry text,
  tier text,
  icp_score integer,
  fortune_500 boolean default false,
  priority_tier text,
  execution_wave text,
  batch_order integer,
  check_size_label text,
  min_check_usd integer,
  max_check_usd integer,
  stage_focus text,
  thesis_fit text,
  match_score integer,
  custom_hook text,
  custom_fields jsonb default '{}'::jsonb,
  owner text not null default 'Varun Mowar',
  relationship_strength text,
  tags text[] default '{}',
  unsubscribed boolean default false,
  is_demo boolean not null default false,
  last_contacted_at timestamptz
);

create table if not exists opportunities (
  id text primary key,
  contact_id text not null references contacts(id) on delete cascade,
  opportunity_type text not null check (opportunity_type in ('enterprise_deal', 'seed_investment')),
  owner_id text not null references crm_users(id),
  owner_email text not null,
  stage text not null,
  outcome text,
  meeting_booked boolean default false,
  product_or_instrument text,
  amount_usd integer default 0,
  probability integer default 0,
  expected_close text,
  next_step text,
  notes text,
  updated_at timestamptz default now()
);

create table if not exists custom_field_definitions (
  id text primary key,
  entity_scope text not null check (entity_scope in ('customer', 'investor', 'both')),
  field_key text not null unique,
  field_label text not null,
  field_type text not null check (field_type in ('text', 'number', 'select', 'boolean', 'date')),
  select_options text[],
  display_order integer default 0
);

create table if not exists campaigns (
  id text primary key,
  audience_type text not null,
  subject text not null,
  body text not null,
  created_at timestamptz default now()
);

create table if not exists email_logs (
  id text primary key,
  contact_id text not null references contacts(id) on delete cascade,
  campaign_id text references campaigns(id),
  resend_email_id text,
  sender_email text,
  reply_to_email text,
  status text not null check (status in ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'replied')),
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  replied_at timestamptz,
  reply_snippet text,
  sent_at timestamptz default now()
);

create table if not exists portal_events (
  id text primary key,
  contact_id text not null references contacts(id) on delete cascade,
  portal text not null check (portal in ('investor.fortifai.io', 'overview.fortifai.io')),
  event_type text not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists account_dossiers (
  id text primary key,
  organization text not null,
  industry text,
  region text,
  icp_fit_score integer,
  primary_wedge_product text,
  dossier_json jsonb not null,
  sources jsonb default '[]'::jsonb,
  generated_by text,
  generated_at timestamptz default now()
);

-- Read-only SQL RPC for Ask Scale AI Intelligence Agent (service_role only)
create or replace function execute_crm_readonly_query(query_text text)
returns jsonb
language plpgsql
security definer
as $$
declare
  cleaned text := btrim(query_text);
  result jsonb;
begin
  if cleaned !~* '^(select|with)\s' then
    raise exception 'Only read-only SELECT or WITH queries are permitted';
  end if;
  if cleaned ~* ';\s*\S' or cleaned ~* '\b(insert|update|delete|drop|alter|create|truncate|grant|revoke)\b' then
    raise exception 'Disallowed SQL statement detected';
  end if;
  execute format('select coalesce(jsonb_agg(t), ''[]''::jsonb) from (%s) t', regexp_replace(cleaned, ';\s*$', '')) into result;
  return result;
end;
$$;`;
