import { DatabaseSync } from 'node:sqlite';
import {
  FunctionCallingConfigMode,
  GoogleGenAI,
  Type,
  type Content,
  type FunctionDeclaration,
} from '@google/genai';
import { getServiceSupabaseClient } from './supabaseAdmin';
import type {
  AskMeContactPill,
  AskMeDraftAction,
  AskMeKpi,
  AskMeSqlSource,
  AskMeStructuredPayload,
  AskMeTableData,
  Contact,
  CustomFieldDefinition,
  TelemetryEvent,
  UserPermissions,
} from '../src/types/crm';

export interface AskMeRequestPayload {
  messages: { role: 'user' | 'assistant'; text: string }[];
  crmState: {
    contacts: Contact[];
    customFields: CustomFieldDefinition[];
    telemetry: TelemetryEvent[];
    arrTarget2027?: number;
    supabaseUrl?: string;
    supabaseAnonKey?: string;
  };
}

interface SessionContext {
  email: string;
  role: string;
  permissions: UserPermissions;
}

const INVESTOR_ONLY_IDENTIFIERS = [
  'min_check_usd',
  'max_check_usd',
  'priority_tier',
  'execution_wave',
  'check_size_label',
  'investor.fortifai.io',
  'seed_investment',
  'us_inst_seed_track',
  'match_score',
  'thesis_fit',
  'stage_focus',
];

const CUSTOMER_ONLY_IDENTIFIERS = [
  'buyer_persona',
  'icp_score',
  'fortune_500',
  'expected_close',
  'overview.fortifai.io',
  'enterprise_deal',
  'account_dossiers',
];

function parseRelativeTimestampToIso(ts?: string): string {
  if (!ts) return new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString();
  const trimmed = ts.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const parsed = Date.parse(trimmed);
    return Number.isNaN(parsed) ? new Date().toISOString() : new Date(parsed).toISOString();
  }
  const lower = trimmed.toLowerCase();
  const now = Date.now();
  if (lower === 'just now') return new Date(now).toISOString();
  const minMatch = lower.match(/^(\d+)\s*m(?:in(?:s|utes?)?)?\s*ago$/);
  if (minMatch) return new Date(now - Number(minMatch[1]) * 60 * 1000).toISOString();
  const hrMatch = lower.match(/^(\d+)\s*h(?:our(?:s)?)?\s*ago$/);
  if (hrMatch) return new Date(now - Number(hrMatch[1]) * 3600 * 1000).toISOString();
  if (lower === 'yesterday') return new Date(now - 24 * 3600 * 1000).toISOString();
  const novMatch = trimmed.match(/^Nov\s+(\d{1,2})/i);
  if (novMatch) {
    const day = Number(novMatch[1]);
    return new Date(Date.UTC(2026, 10, day, 14, 0, 0)).toISOString();
  }
  return new Date(now - 2 * 24 * 3600 * 1000).toISOString();
}

function parseMaxCheckUsd(contact: Contact): number {
  const label = contact.check_size_label || '';
  const matches = Array.from(label.matchAll(/\$(\d+(?:\.\d+)?)\s*([MK])?/gi));
  if (matches.length > 0) {
    const last = matches[matches.length - 1];
    const num = Number(last[1]);
    const unit = (last[2] || '').toUpperCase();
    if (unit === 'M') return Math.round(num * 1_000_000);
    if (unit === 'K') return Math.round(num * 1_000);
    return Math.round(num);
  }
  return contact.min_check_usd || contact.amount_usd || 0;
}

function deriveRelationshipStrength(c: Contact): string {
  if (c.delivery_status === 'replied' || ['Meeting', 'Diligence', 'SAFE Signed', '5 Internal Review Pending', '6 Commercial / Contracting', '7 Closed Won'].includes(c.stage)) {
    return 'strong';
  }
  if (c.delivery_status === 'portal_visited' || c.delivery_status === 'opened' || c.portal_visited) {
    return 'warm';
  }
  return 'cold';
}

function deriveTags(c: Contact): string {
  const tags: string[] = [];
  if (c.fortune_500) tags.push('fortune_500');
  if (c.tier) tags.push(c.tier);
  if (c.priority_tier) tags.push(c.priority_tier);
  if (c.us_inst_seed_track) tags.push('us_inst_seed_track');
  if (c.industry) tags.push(c.industry);
  return tags.join(', ');
}

function buildInMemoryCrmDb(
  rawContacts: Contact[],
  customFields: CustomFieldDefinition[],
  rawTelemetry: TelemetryEvent[],
  perms: UserPermissions
): { db: DatabaseSync; visibleContacts: Contact[] } {
  const visibleContacts = rawContacts.filter((c) => {
    if (c.contact_type === 'investor' && !perms.can_view_investors) return false;
    if (c.contact_type === 'customer' && !perms.can_view_customers) return false;
    return true;
  });

  const visibleContactIds = new Set(visibleContacts.map((c) => c.id));
  const visibleTelemetry = rawTelemetry.filter((t) => {
    if (t.contact_type === 'investor' && !perms.can_view_investors) return false;
    if (t.contact_type === 'customer' && !perms.can_view_customers) return false;
    if (t.source === 'investor.fortifai.io' && !perms.can_view_investors) return false;
    if (t.source === 'overview.fortifai.io' && !perms.can_view_customers) return false;
    return visibleContactIds.has(t.contact_id) || visibleContactIds.size === 0;
  });

  const db = new DatabaseSync(':memory:');

  db.exec(`
    CREATE TABLE contacts (
      id TEXT PRIMARY KEY,
      email TEXT,
      first_name TEXT,
      last_name TEXT,
      full_name TEXT,
      organization TEXT,
      title TEXT,
      region TEXT,
      location TEXT,
      contact_type TEXT,
      buyer_persona TEXT,
      industry TEXT,
      tier TEXT,
      icp_score INTEGER,
      fortune_500 INTEGER,
      priority_tier TEXT,
      execution_wave TEXT,
      batch_order INTEGER,
      check_size_label TEXT,
      min_check_usd INTEGER,
      max_check_usd INTEGER,
      stage_focus TEXT,
      thesis_fit TEXT,
      match_score INTEGER,
      custom_hook TEXT,
      custom_fields TEXT,
      owner TEXT,
      owner_id TEXT,
      owner_email TEXT,
      relationship_strength TEXT,
      tags TEXT,
      unsubscribed INTEGER,
      aging_days INTEGER,
      delivery_status TEXT,
      last_reply_subject TEXT,
      last_reply_snippet TEXT,
      last_reply_from TEXT,
      last_contacted_at TEXT
    );

    CREATE TABLE opportunities (
      id TEXT PRIMARY KEY,
      contact_id TEXT,
      owner_id TEXT,
      owner_email TEXT,
      opportunity_type TEXT,
      stage TEXT,
      outcome TEXT,
      meeting_booked INTEGER,
      product_or_instrument TEXT,
      amount_usd INTEGER,
      probability INTEGER,
      expected_close TEXT,
      aging_days INTEGER,
      next_step TEXT,
      notes TEXT,
      updated_at TEXT
    );

    CREATE TABLE custom_field_definitions (
      id TEXT PRIMARY KEY,
      entity_scope TEXT,
      field_key TEXT,
      field_label TEXT,
      field_type TEXT,
      select_options TEXT,
      display_order INTEGER
    );

    CREATE TABLE campaigns (
      id TEXT PRIMARY KEY,
      audience_type TEXT,
      subject TEXT,
      body TEXT,
      created_at TEXT
    );

    CREATE TABLE email_logs (
      id TEXT PRIMARY KEY,
      contact_id TEXT,
      campaign_id TEXT,
      resend_email_id TEXT,
      sender_email TEXT,
      reply_to_email TEXT,
      status TEXT,
      delivered_at TEXT,
      opened_at TEXT,
      clicked_at TEXT,
      replied_at TEXT,
      reply_snippet TEXT,
      sent_at TEXT,
      bounced_at TEXT,
      is_bot_scan INTEGER
    );

    CREATE TABLE portal_events (
      id TEXT PRIMARY KEY,
      contact_id TEXT,
      portal TEXT,
      event_type TEXT,
      metadata TEXT,
      created_at TEXT
    );

    CREATE TABLE account_dossiers (
      id TEXT PRIMARY KEY,
      organization TEXT,
      industry TEXT,
      region TEXT,
      icp_fit_score INTEGER,
      primary_wedge_product TEXT,
      dossier_json TEXT,
      sources TEXT,
      generated_by TEXT,
      generated_at TEXT
    );
  `);

  const insertContact = db.prepare(`
    INSERT INTO contacts VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `);

  const insertOpp = db.prepare(`
    INSERT INTO opportunities VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  visibleContacts.forEach((c, idx) => {
    insertContact.run(
      c.id,
      c.email,
      c.first_name || '',
      c.last_name || '',
      c.full_name,
      c.organization,
      c.title || '',
      c.region,
      c.location || '',
      c.contact_type,
      c.buyer_persona || null,
      c.industry || null,
      c.tier || null,
      c.icp_score ?? null,
      c.fortune_500 ? 1 : 0,
      c.priority_tier || null,
      c.execution_wave || null,
      idx + 1,
      c.check_size_label || null,
      c.min_check_usd ?? null,
      c.contact_type === 'investor' ? parseMaxCheckUsd(c) : null,
      c.stage_focus || null,
      c.thesis_fit || null,
      c.match_score ?? null,
      c.custom_hook || null,
      JSON.stringify(c.custom_fields || {}),
      c.owner || 'Varun',
      c.owner_id || 'usr_varun',
      c.owner_email || 'varun@fortifai.io',
      deriveRelationshipStrength(c),
      deriveTags(c),
      c.unsubscribed ? 1 : 0,
      c.aging_days ?? 0,
      c.delivery_status || 'not_sent',
      c.last_reply_subject || null,
      c.last_reply_snippet || null,
      c.last_reply_from || null,
      c.last_contacted_at || null
    );

    const meetingBooked = [
      'Meeting',
      'Diligence',
      'SAFE Signed',
      '4 Decisionmaker buy in',
      '5 Internal Review Pending',
      '6 Commercial / Contracting',
      '7 Closed Won',
    ].includes(c.stage)
      ? 1
      : 0;

    insertOpp.run(
      `opp_${c.id}`,
      c.id,
      c.owner_id || 'usr_varun',
      c.owner_email || 'varun@fortifai.io',
      c.contact_type === 'investor' ? 'seed_investment' : 'enterprise_deal',
      c.stage,
      c.outcome || null,
      meetingBooked,
      c.product_or_instrument || null,
      c.amount_usd ?? 0,
      c.probability ?? 0,
      c.expected_close || null,
      c.aging_days ?? 0,
      c.next_step || null,
      [c.notes, ...(c.quick_notes || []).map((q) => `[${q.author_name}] ${q.text}`)]
        .filter(Boolean)
        .join(' | ') || null,
      c.last_contacted_at || new Date(Date.now() - 86400_000 * 3).toISOString()
    );
  });

  const insertField = db.prepare(`
    INSERT INTO custom_field_definitions VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  customFields
    .filter((f) => {
      if (f.entity_scope === 'investor' && !perms.can_view_investors) return false;
      if (f.entity_scope === 'customer' && !perms.can_view_customers) return false;
      return true;
    })
    .forEach((f, idx) => {
      insertField.run(
        f.id,
        f.entity_scope,
        f.field_key,
        f.field_label,
        f.field_type,
        JSON.stringify(f.select_options || []),
        f.display_order ?? idx + 1
      );
    });

  // Seed last 3 campaigns filtered by RBAC
  const now = Date.now();
  const seedCampaigns: {
    id: string;
    audience_type: 'customer' | 'investor';
    subject: string;
    body: string;
    created_at: string;
  }[] = [
    {
      id: 'cmp_03',
      audience_type: 'customer',
      subject: 'Continuous Audit & Counterpart Risk Automation — Fortifai',
      body: 'Zero-egress AI assurance agents across SAP, Oracle, and Workday.',
      created_at: new Date(now - 2 * 86400_000).toISOString(),
    },
    {
      id: 'cmp_02',
      audience_type: 'investor',
      subject: 'Fortifai ($3M Seed) — Cat A Reminder & Q4 Enterprise Traction',
      body: 'Honeywell, Nokia, and Brookfield Properties traction update.',
      created_at: new Date(now - 4 * 86400_000).toISOString(),
    },
    {
      id: 'cmp_01',
      audience_type: 'investor',
      subject: 'Fortifai — Autonomous Audit & Compliance for Fortune 500 ($3M Seed)',
      body: 'Initial Wave 1 & Cat B Seed round outreach ($15M cap SAFE).',
      created_at: new Date(now - 7 * 86400_000).toISOString(),
    },
  ];
  const campaigns = seedCampaigns.filter((cmp) =>
    cmp.audience_type === 'investor' ? perms.can_view_investors : perms.can_view_customers
  );

  const insertCampaign = db.prepare(`INSERT INTO campaigns VALUES (?, ?, ?, ?, ?)`);
  campaigns.forEach((cmp) => {
    insertCampaign.run(cmp.id, cmp.audience_type, cmp.subject, cmp.body, cmp.created_at);
  });

  // Populate email_logs from contact delivery state & Resend telemetry (filtering <10s bot scans)
  const insertEmailLog = db.prepare(`
    INSERT INTO email_logs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  visibleContacts.forEach((c, idx) => {
    if (!c.delivery_status || c.delivery_status === 'not_sent') return;
    const isHumanOpen =
      c.delivery_status === 'opened' ||
      c.delivery_status === 'portal_visited' ||
      c.delivery_status === 'replied'
        ? c.opened_duration_sec === undefined || c.opened_duration_sec >= 10
        : false;
    const isBotOnly =
      c.opened_duration_sec !== undefined && c.opened_duration_sec < 10 && !isHumanOpen;

    const campaignId =
      c.contact_type === 'customer'
        ? 'cmp_03'
        : c.execution_wave?.includes('Cat A')
        ? 'cmp_02'
        : 'cmp_01';

    const sentIso = c.sent_at || c.last_contacted_at || new Date(now - (idx + 1) * 86400_000).toISOString();
    const deliveredIso =
      c.delivery_status === 'bounced' || c.delivery_status === 'sent'
        ? null
        : c.delivered_at || sentIso;
    const openedIso = isHumanOpen ? parseRelativeTimestampToIso(c.opened_at) : null;
    const clickedIso =
      c.delivery_status === 'portal_visited' || c.portal_visited
        ? parseRelativeTimestampToIso(c.opened_at)
        : null;
    const repliedIso =
      c.delivery_status === 'replied' ? parseRelativeTimestampToIso(c.replied_at) : null;
    const bouncedIso = c.delivery_status === 'bounced' ? parseRelativeTimestampToIso(c.bounced_at) : null;

    insertEmailLog.run(
      `log_${c.id}`,
      c.id,
      campaignId,
      `re_${c.id}_${idx}`,
      c.owner_email || 'varun@fortifai.io',
      c.owner_email || 'varun@fortifai.io',
      c.delivery_status,
      deliveredIso,
      openedIso,
      clickedIso,
      repliedIso,
      c.last_reply_snippet || null,
      sentIso,
      bouncedIso,
      isBotOnly ? 1 : 0
    );
  });

  // Populate portal_events from telemetry
  const insertPortalEvent = db.prepare(`
    INSERT INTO portal_events VALUES (?, ?, ?, ?, ?, ?)
  `);
  visibleTelemetry
    .filter((t) => t.source === 'investor.fortifai.io' || t.source === 'overview.fortifai.io')
    .forEach((t) => {
      insertPortalEvent.run(
        t.id,
        t.contact_id,
        t.source,
        t.event_type,
        JSON.stringify({ detail: t.detail, duration_sec: t.duration_sec ?? null }),
        parseRelativeTimestampToIso(t.timestamp)
      );
    });

  return { db, visibleContacts };
}

function validateAndEnforceSqlRbac(
  rawSql: string,
  perms: UserPermissions
): { ok: true; enforcedSql: string; sqliteSql: string } | { ok: false; error: string } {
  const cleaned = rawSql.trim().replace(/;\s*$/, '');
  if (!cleaned) {
    return { ok: false, error: 'SQL query cannot be empty.' };
  }

  if (!/^(select|with)\b/i.test(cleaned)) {
    return { ok: false, error: 'Only read-only SELECT or WITH queries are permitted.' };
  }

  if (
    /;\s*\S/.test(cleaned) ||
    /\b(insert|update|delete|drop|alter|create|attach|pragma|truncate|grant|revoke|replace|vacuum)\b/i.test(
      cleaned
    )
  ) {
    return { ok: false, error: 'Disallowed write or DDL SQL keyword detected.' };
  }

  const lower = cleaned.toLowerCase();

  if (!perms.can_view_investors) {
    const forbidden = INVESTOR_ONLY_IDENTIFIERS.find((id) => lower.includes(id));
    if (
      forbidden ||
      /contact_type\s*=\s*'investor'/i.test(cleaned) ||
      /entity_scope\s*=\s*'investor'/i.test(cleaned) ||
      /audience_type\s*=\s*'investor'/i.test(cleaned) ||
      /'investor'/i.test(cleaned)
    ) {
      return {
        ok: false,
        error: `RBAC policy blocked query: can_view_investors is false (referenced "${forbidden || 'investor'}").`,
      };
    }
  }

  if (!perms.can_view_customers) {
    const forbidden = CUSTOMER_ONLY_IDENTIFIERS.find((id) => lower.includes(id));
    if (
      forbidden ||
      /contact_type\s*=\s*'customer'/i.test(cleaned) ||
      /entity_scope\s*=\s*'customer'/i.test(cleaned) ||
      /audience_type\s*=\s*'customer'/i.test(cleaned) ||
      /'customer'/i.test(cleaned)
    ) {
      return {
        ok: false,
        error: `RBAC policy blocked query: can_view_customers is false (referenced "${forbidden || 'customer'}").`,
      };
    }
  }

  let enforcedSql = cleaned;
  if (!perms.can_view_investors || !perms.can_view_customers) {
    const domain = perms.can_view_customers ? 'customer' : 'investor';
    const oppType = domain === 'customer' ? 'enterprise_deal' : 'seed_investment';
    const portalHost = domain === 'customer' ? 'overview.fortifai.io' : 'investor.fortifai.io';
    const scopeCtes = [
      `contacts AS (SELECT * FROM public.contacts WHERE contact_type = '${domain}')`,
      `opportunities AS (SELECT * FROM public.opportunities WHERE opportunity_type = '${oppType}')`,
      `custom_field_definitions AS (SELECT * FROM public.custom_field_definitions WHERE entity_scope IN ('${domain}', 'both'))`,
      `campaigns AS (SELECT * FROM public.campaigns WHERE audience_type = '${domain}')`,
      `portal_events AS (SELECT * FROM public.portal_events WHERE portal = '${portalHost}')`,
      `email_logs AS (SELECT el.* FROM public.email_logs el JOIN public.contacts __rbac_c ON __rbac_c.id = el.contact_id WHERE __rbac_c.contact_type = '${domain}')`,
    ].join(', ');

    if (/^with\b/i.test(enforcedSql)) {
      enforcedSql = enforcedSql.replace(/^with\s+/i, `WITH ${scopeCtes}, `);
    } else {
      enforcedSql = `WITH ${scopeCtes} ${enforcedSql}`;
    }
  }

  // Translate PostgreSQL syntax to SQLite-compatible SQL
  const sqliteSql = cleaned
    .replace(/\bILIKE\b/gi, 'LIKE')
    .replace(/::(numeric|float8|float4|float|integer|int|bigint|text|varchar|boolean|bool|timestamptz|timestamp|jsonb|json)\b/gi, '')
    .replace(/STRING_AGG\s*\(/gi, 'GROUP_CONCAT(')
    .replace(/NOW\(\)\s*-\s*INTERVAL\s*'(\d+)\s+days?'/gi, "datetime('now', '-$1 days')")
    .replace(/CURRENT_TIMESTAMP\s*-\s*INTERVAL\s*'(\d+)\s+days?'/gi, "datetime('now', '-$1 days')")
    .replace(/NOW\(\)\s*-\s*INTERVAL\s*'(\d+)\s+hours?'/gi, "datetime('now', '-$1 hours')")
    .replace(/\bNOW\(\)/gi, "datetime('now')");

  return { ok: true, enforcedSql, sqliteSql };
}

function broadenEqualityToLike(sql: string): string | null {
  // Broadens exact string equality `col = 'Value'` -> `col LIKE '%Value%'` for 0-row retry recovery
  const replaced = sql.replace(
    /(\b[a-zA-Z0-9_."'>-]+)\s*=\s*'([^']{2,40})'/g,
    (match, col, val) => {
      if (['customer', 'investor', 'enterprise_deal', 'seed_investment', 'not_sent'].includes(val.toLowerCase())) {
        return match;
      }
      if (col.toLowerCase().includes('contact_type') || col.toLowerCase().includes('opportunity_type')) {
        return match;
      }
      return `${col} LIKE '%${val}%'`;
    }
  );
  return replaced !== sql ? replaced : null;
}

const QUERY_CRM_DATABASE_DECL: FunctionDeclaration = {
  name: 'query_crm_database',
  description:
    'Executes a read-only PostgreSQL SELECT query against the CRM database (contacts, opportunities, custom_field_definitions, campaigns, email_logs, portal_events). Always query custom_field_definitions first if the user mentions a custom column.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      sql_query: {
        type: Type.STRING,
        description:
          'A read-only SELECT or WITH SQL query. Do not include semicolons or write statements.',
      },
      purpose: {
        type: Type.STRING,
        description: 'Short description of what this query is retrieving.',
      },
    },
    required: ['sql_query', 'purpose'],
  },
};

const GET_CONTACT_TIMELINE_DECL: FunctionDeclaration = {
  name: 'get_contact_timeline',
  description:
    'Fetches the full profile, opportunity stage, custom fields, Resend email logs, and portal_events chronology for a specific person or firm.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      contact_id: {
        type: Type.STRING,
        description: 'Contact ID (e.g. cust_01, inv_04) or organization/person name.',
      },
    },
    required: ['contact_id'],
  },
};

const PREPARE_OUTREACH_DRAFT_DECL: FunctionDeclaration = {
  name: 'prepare_outreach_draft',
  description:
    'Prepares a pre-populated Outreach Composer draft card for specific contact IDs so the user can review and click Send. Never sends emails automatically.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      contact_ids: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'Array of contact IDs to load into the Outreach Composer.',
      },
      subject: {
        type: Type.STRING,
        description: 'Email subject line supporting {{first_name}}, {{organization}}, etc.',
      },
      body_template: {
        type: Type.STRING,
        description:
          'Email body template supporting {{first_name}}, {{organization}}, {{title}}, {{region}}, {{custom_hook}}, and {{contact_id}}.',
      },
    },
    required: ['contact_ids', 'subject', 'body_template'],
  },
};

function buildSystemInstruction(
  session: SessionContext,
  arrTarget2027: number,
  customFields: CustomFieldDefinition[]
): string {
  const perms = session.permissions;
  const scopedFields = customFields.filter((f) => {
    if (f.entity_scope === 'investor' && !perms.can_view_investors) return false;
    if (f.entity_scope === 'customer' && !perms.can_view_customers) return false;
    return true;
  });

  const customColHint =
    scopedFields.length > 0
      ? scopedFields
          .map((f) => `${f.field_key} (${f.field_label}, scope=${f.entity_scope}, type=${f.field_type})`)
          .join('; ')
      : 'None yet';

  const contextLines = [
    '- Fortifai builds zero-egress, customer-VPC enterprise risk & continuous audit AI agents integrating with SAP, Oracle, Workday, and ERP systems: Counterpart Risk Monitoring, ABAC Risk Monitoring, Kuber Procurement Cost Optimisation, Surge Channel Stuffing, Aegis Trade Diversion, Crystal Balance Sheet Close, D7 Global TPRM with Signzy.',
    ...(perms.can_view_customers
      ? [
          `- Current Enterprise 2027 ARR Target: $${arrTarget2027.toLocaleString()} (with 5.7x coverage model = $${Math.round(arrTarget2027 * 5.7).toLocaleString()} recommended pipeline). Customer briefing portal: overview.fortifai.io.`,
        ]
      : []),
    ...(perms.can_view_investors
      ? [
          '- Current Fundraising Round: $3,000,000 Seed on a $15,000,000 pre-money valuation cap SAFE (portal: investor.fortifai.io).',
        ]
      : []),
  ].join('\n');

  const rbacDirectives = [
    !perms.can_view_investors
      ? "CRITICAL RBAC RULE: This user does NOT have can_view_investors. You are strictly scoped to CUSTOMER data only. Do NOT query investor rows, investor.fortifai.io, seed_investment, or investor-only fields (min_check_usd, max_check_usd, priority_tier, execution_wave, check_size_label). If asked about investors or fundraising, refuse briefly stating investor data requires can_view_investors."
      : '',
    !perms.can_view_customers
      ? "CRITICAL RBAC RULE: This user does NOT have can_view_customers. You are strictly scoped to INVESTOR data only. Do NOT query customer rows, overview.fortifai.io, enterprise_deal, account_dossiers, or customer-only fields (buyer_persona, icp_score, fortune_500, expected_close). If asked about enterprise customers or ARR deals, refuse briefly stating customer data requires can_view_customers."
      : '',
  ]
    .filter(Boolean)
    .join('\n- ');

  const portalEnum = [
    perms.can_view_investors ? "'investor.fortifai.io'" : '',
    perms.can_view_customers ? "'overview.fortifai.io'" : '',
  ]
    .filter(Boolean)
    .join('|');

  const oppTypeEnum = [
    perms.can_view_customers ? "'enterprise_deal'" : '',
    perms.can_view_investors ? "'seed_investment'" : '',
  ]
    .filter(Boolean)
    .join('|');

  const contactTypeEnum = [
    perms.can_view_customers ? "'customer'" : '',
    perms.can_view_investors ? "'investor'" : '',
  ]
    .filter(Boolean)
    .join('|');

  return `You are **Ask Scale**, Fortifai Scale's institutional Intelligence Copilot.
You operate strictly on real data returned by your declared function-calling tools. Never fabricate numbers, names, emails, or pipeline values.

### Fortifai Domain Context
${contextLines}

### Logged-In User RBAC Context
- User: ${session.email} (role: ${session.role})
- Permissions: can_view_customers=${perms.can_view_customers}, can_view_investors=${perms.can_view_investors}, can_send_campaigns=${perms.can_send_campaigns}.
${rbacDirectives ? `- ${rbacDirectives}` : ''}

### Relational Schema Grounding
1. \`contacts\` (id, email, first_name, last_name, full_name, organization, title, region, location, contact_type [${contactTypeEnum}], ${perms.can_view_customers ? "buyer_persona ['CCO/GC'|'CAE'|'CFO'|'CPO'|'Other'], industry, tier ['Tier I'|'Tier II'], icp_score, fortune_500 [0/1], " : ''}${perms.can_view_investors ? "priority_tier ['P1'..'P4'], execution_wave, batch_order, check_size_label, min_check_usd, max_check_usd, stage_focus, thesis_fit, match_score, custom_hook, " : ''}custom_fields JSONB, owner, owner_id, owner_email, relationship_strength, tags, unsubscribed [0/1], aging_days, delivery_status, last_reply_subject, last_reply_snippet, last_reply_from, last_contacted_at)
2. \`opportunities\` (id, contact_id, owner_id, owner_email, opportunity_type [${oppTypeEnum}], stage, outcome, meeting_booked [0/1], product_or_instrument, amount_usd, probability [0-100], ${perms.can_view_customers ? "expected_close ['Q1 2027'|'Q2 2027'|'Q3 2027'|'Q4 2027'], " : ''}aging_days, next_step, notes, updated_at)
3. \`custom_field_definitions\` (id, entity_scope, field_key, field_label, field_type, select_options, display_order)
   - Currently registered custom fields: ${customColHint}
4. \`campaigns\` (id, audience_type [${contactTypeEnum}], subject, body, created_at)
5. \`email_logs\` (id, contact_id, campaign_id, resend_email_id, sender_email, reply_to_email, status ['sent'|'delivered'|'opened'|'clicked'|'bounced'|'complained'|'replied'], delivered_at, opened_at, clicked_at, replied_at, reply_snippet, sent_at, bounced_at, is_bot_scan [0/1]) — note: bot scans <10s have opened_at = NULL and is_bot_scan = 1.
6. \`portal_events\` (id, contact_id, portal [${portalEnum}], event_type, metadata, created_at)
${perms.can_view_customers ? '7. `account_dossiers` (id, organization, industry, region, icp_fit_score, primary_wedge_product, dossier_json, sources, generated_by, generated_at)\n' : ''}
### Tool Usage Rules
- Use standard SQLite/PostgreSQL-portable SELECT syntax (single-quoted strings, avoid non-standard functions; \`ILIKE\` and \`custom_fields->>'key'\` and \`NOW() - INTERVAL '7 days'\` are supported).
- Always query \`custom_field_definitions\` first if the user asks about a custom column.
- Always select \`c.id AS contact_id\` when returning contacts so the UI can render clickable contact pills and 1-click Composer actions.
- If a SQL query returns an error, inspect the error and retry with corrected columns/syntax.
- When the user asks to draft an email or follow-up (e.g., "Draft a check-in email to the top 3"), call \`prepare_outreach_draft\` with the grounded \`contact_ids\`, personalized \`subject\`, and \`body_template\`.
- When you are ready to deliver the final answer (after all necessary tool calls complete), return ONLY a single valid JSON object (no markdown fences needed, though valid JSON inside \`\`\`json is accepted) matching:
{
  "summary": "Crisp executive summary in plain prose with key numbers and actionable takeaways.",
  "kpis": [{ "label": "Short Metric Label", "value": "Formatted Value", "sub": "Context" }],
  "table": {
    "columns": ["Column A", "Column B"],
    "rows": [{ "contact_id": "optional_id", "Column A": "val", "Column B": "val" }]
  },
  "contact_ids": ["id_1"],
  "follow_up_suggestions": ["Short follow-up question 1", "Short follow-up question 2"]
}`;
}

function tryParseStructuredAnswer(
  rawText: string,
  fallbackRows: Record<string, unknown>[],
  visibleContacts: Contact[],
  draftActions: AskMeDraftAction[],
  sqlSources: AskMeSqlSource[]
): AskMeStructuredPayload {
  const trimmed = rawText.trim();
  let parsed: Partial<{
    summary: string;
    kpis: AskMeKpi[];
    table: AskMeTableData;
    contact_ids: string[];
    follow_up_suggestions: string[];
  }> | null = null;

  const jsonBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = jsonBlockMatch ? jsonBlockMatch[1].trim() : trimmed;
  if (candidate.startsWith('{')) {
    try {
      parsed = JSON.parse(candidate);
    } catch {
      parsed = null;
    }
  }

  const contactById = new Map(visibleContacts.map((c) => [c.id, c]));
  const collectedIds = new Set<string>(Array.isArray(parsed?.contact_ids) ? parsed.contact_ids : []);

  // Also harvest contact_id / id from table rows & fallback rows
  const tableRows = parsed?.table?.rows || [];
  tableRows.forEach((row) => {
    const cid = row.contact_id ?? row.id;
    if (typeof cid === 'string' && contactById.has(cid)) collectedIds.add(cid);
  });
  fallbackRows.forEach((row) => {
    const cid = row.contact_id ?? row.id;
    if (typeof cid === 'string' && contactById.has(cid)) collectedIds.add(cid);
  });
  draftActions.forEach((da) => {
    da.contact_ids.forEach((cid) => {
      if (contactById.has(cid)) collectedIds.add(cid);
    });
  });

  const contact_pills: AskMeContactPill[] = Array.from(collectedIds)
    .map((id) => contactById.get(id))
    .filter((c): c is Contact => Boolean(c))
    .slice(0, 12)
    .map((c) => ({
      id: c.id,
      full_name: c.full_name,
      organization: c.organization,
      email: c.email,
      contact_type: c.contact_type,
      stage: c.stage,
    }));

  let table: AskMeTableData | undefined =
    parsed?.table && Array.isArray(parsed.table.columns) && Array.isArray(parsed.table.rows)
      ? parsed.table
      : undefined;

  if (!table && fallbackRows.length > 0 && fallbackRows.length <= 15) {
    const cols = Object.keys(fallbackRows[0]).filter((k) => k !== 'contact_id');
    if (cols.length > 0) {
      table = {
        columns: cols,
        rows: fallbackRows.map((r) => {
          const out: Record<string, string | number | boolean | null> = {};
          if (typeof r.contact_id === 'string') out.contact_id = r.contact_id;
          cols.forEach((col) => {
            const v = r[col];
            out[col] =
              v === null || v === undefined
                ? null
                : typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
                ? v
                : JSON.stringify(v);
          });
          return out;
        }),
      };
    }
  }

  return {
    summary: parsed?.summary || trimmed,
    kpis: Array.isArray(parsed?.kpis) ? parsed.kpis.slice(0, 4) : undefined,
    table,
    contact_pills: contact_pills.length > 0 ? contact_pills : undefined,
    draft_actions: draftActions.length > 0 ? draftActions : undefined,
    sql_sources: sqlSources.length > 0 ? sqlSources : undefined,
    follow_up_suggestions: Array.isArray(parsed?.follow_up_suggestions)
      ? parsed.follow_up_suggestions.slice(0, 3)
      : undefined,
  };
}

export async function handleAskMeRequest(
  payload: AskMeRequestPayload,
  session: SessionContext
): Promise<{ ok: true; message: AskMeStructuredPayload } | { ok: false; status: number; error: string }> {
  if (!session.permissions.can_view_customers && !session.permissions.can_view_investors) {
    return {
      ok: false,
      status: 403,
      error: 'RBAC policy denied: requires can_view_customers or can_view_investors.',
    };
  }

  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  if (messages.length === 0) {
    return { ok: false, status: 400, error: 'At least one message is required.' };
  }

  const latestUserText =
    [...messages].reverse().find((m) => m.role === 'user')?.text?.trim() || '';

  if (
    !session.permissions.can_view_investors &&
    /\b(investor|investors|vc|vcs|angel|angels|seed\s+round|seed\s+fund|fundrais(?:e|ing)|safe\s+(?:signed|cap|note)?|\$15m\s+cap|\$3m\s+seed|check\s+size|check\s+capacity|min_check|max_check|priority_tier|p1\/p2|wave\s*1|wave\s*2|cat\s+[ab]|family\s+office|soft\s+circle|investor\.fortifai\.io|investor\s+pass(?:es)?|passed\s+investor)\b/i.test(
      latestUserText
    )
  ) {
    return {
      ok: true,
      message: {
        summary:
          'Access blocked by RBAC policy: Your active role does not include `can_view_investors` permission. Ask Scale is strictly scoped to Enterprise Customer pipeline, account intelligence, and overview.fortifai.io telemetry.',
        follow_up_suggestions: [
          'Which Q1/Q2 2027 deals are aging over 90 days and need follow-up?',
          'Show weighted ARR coverage vs our $3M target by buyer persona',
          'Who visited overview.fortifai.io in the past 7 days?',
        ],
      },
    };
  }

  if (
    !session.permissions.can_view_customers &&
    /\b(enterprise\s+(?:customer|account|deal|pipeline)|customers?|target\s+arr|arr\s+coverage|2027\s+arr|tier\s*i{1,2}|buyer\s+persona|cco\/gc|cae|cfo|cpo|icp\s+score|fortune\s*500|overview\.fortifai\.io|account\s+dossier|dossier|aging\s+over\s+90)\b/i.test(
      latestUserText
    )
  ) {
    return {
      ok: true,
      message: {
        summary:
          'Access blocked by RBAC policy: Your active role does not include `can_view_customers` permission. Ask Scale is strictly scoped to $3M Seed Investor pipeline, fundraising analytics, and investor.fortifai.io telemetry.',
        follow_up_suggestions: [
          'Which P1/P2 investors opened emails or visited investor.fortifai.io without replying?',
          'How much check capacity do we have across Wave 1 Leads in the US vs Singapore/UAE?',
          'Summarize all investor passes and reasons',
        ],
      },
    };
  }

  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return {
      ok: false,
      status: 500,
      error:
        'GEMINI_API_KEY is not configured. Add your Gemini API key in Settings > Secrets to use Ask Scale.',
    };
  }

  const crmState = payload.crmState || {
    contacts: [],
    customFields: [],
    telemetry: [],
    arrTarget2027: 3000000,
  };

  const { db, visibleContacts } = buildInMemoryCrmDb(
    crmState.contacts || [],
    crmState.customFields || [],
    crmState.telemetry || [],
    session.permissions
  );

  const supabaseAdmin = getServiceSupabaseClient();

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const sqlSources: AskMeSqlSource[] = [];
  const draftActions: AskMeDraftAction[] = [];
  let lastQueryRows: Record<string, unknown>[] = [];

  const contents: Content[] = messages.slice(-10).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.text }],
  }));

  const systemInstruction = buildSystemInstruction(
    session,
    crmState.arrTarget2027 || 3000000,
    crmState.customFields || []
  );

  const tools = [
    {
      functionDeclarations: [
        QUERY_CRM_DATABASE_DECL,
        GET_CONTACT_TIMELINE_DECL,
        PREPARE_OUTREACH_DRAFT_DECL,
      ],
    },
  ];

  const toolConfig = {
    functionCallingConfig: {
      mode: FunctionCallingConfigMode.AUTO,
    },
  };

  try {
    let finalResponseText = '';

    for (let step = 0; step < 6; step += 1) {
      let response;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          response = await ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents,
            config: {
              systemInstruction,
              tools,
              toolConfig,
            },
          });
          break;
        } catch (apiErr) {
          const msg = apiErr instanceof Error ? apiErr.message : String(apiErr);
          const isTransient503 = msg.includes('503') || msg.includes('UNAVAILABLE');
          if (attempt === 0 && isTransient503) {
            await new Promise((r) => setTimeout(r, 1200));
            continue;
          }
          throw apiErr;
        }
      }

      if (!response) break;

      const modelContent = response.candidates?.[0]?.content;
      const functionCalls = response.functionCalls;

      if (!functionCalls || functionCalls.length === 0) {
        finalResponseText = response.text || 'No response generated.';
        break;
      }

      if (modelContent) {
        contents.push(modelContent);
      }

      const functionResponseParts = [];

      for (const call of functionCalls) {
        const args = (call.args || {}) as Record<string, unknown>;

        if (call.name === 'query_crm_database') {
          const rawSql = String(args.sql_query || '');
          const purpose = String(args.purpose || 'Query CRM database');
          const check = validateAndEnforceSqlRbac(rawSql, session.permissions);

          if (!check.ok) {
            sqlSources.push({
              purpose,
              sql: rawSql,
              row_count: 0,
              source: 'in_memory_sqlite',
              error: check.error,
            });
            functionResponseParts.push({
              functionResponse: {
                id: call.id,
                name: call.name,
                response: { error: check.error },
              },
            });
            continue;
          }

          let rows: Record<string, unknown>[] = [];
          let source: 'supabase_rpc' | 'in_memory_sqlite' = 'in_memory_sqlite';
          let retried = false;
          let sqlError: string | undefined;

          // Attempt live Supabase RPC strictly via SUPABASE_SERVICE_ROLE_KEY
          let rpcHandled = false;
          if (supabaseAdmin) {
            try {
              const { data, error } = await supabaseAdmin.rpc('execute_crm_readonly_query', {
                query_text: check.enforcedSql,
              });
              if (!error && Array.isArray(data)) {
                rows = data as Record<string, unknown>[];
                source = 'supabase_rpc';
                rpcHandled = true;
              }
            } catch {
              rpcHandled = false;
            }
          }

          if (!rpcHandled) {
            try {
              rows = db.prepare(check.sqliteSql).all() as Record<string, unknown>[];
              if (rows.length === 0) {
                const broadened = broadenEqualityToLike(check.sqliteSql);
                if (broadened) {
                  const retryRows = db.prepare(broadened).all() as Record<string, unknown>[];
                  if (retryRows.length > 0) {
                    rows = retryRows;
                    retried = true;
                  }
                }
              }
            } catch (err) {
              sqlError = err instanceof Error ? err.message : 'SQL execution failed';
            }
          }

          sqlSources.push({
            purpose,
            sql: check.enforcedSql,
            row_count: rows.length,
            source,
            retried,
            ...(sqlError ? { error: sqlError } : {}),
          });

          if (sqlError) {
            functionResponseParts.push({
              functionResponse: {
                id: call.id,
                name: call.name,
                response: {
                  error: sqlError,
                  hint: 'Check column names against contacts, opportunities, custom_field_definitions, campaigns, email_logs, or portal_events and retry.',
                },
              },
            });
          } else {
            if (rows.length > 0) lastQueryRows = rows;
            functionResponseParts.push({
              functionResponse: {
                id: call.id,
                name: call.name,
                response: {
                  row_count: rows.length,
                  retried_with_broader_like: retried,
                  rows: rows.slice(0, 40),
                },
              },
            });
          }
        } else if (call.name === 'get_contact_timeline') {
          const queryVal = String(args.contact_id || '').trim().toLowerCase();
          const match = visibleContacts.find(
            (c) =>
              c.id.toLowerCase() === queryVal ||
              c.email.toLowerCase() === queryVal ||
              c.full_name.toLowerCase().includes(queryVal) ||
              c.organization.toLowerCase().includes(queryVal)
          );

          if (!match) {
            functionResponseParts.push({
              functionResponse: {
                id: call.id,
                name: call.name,
                response: {
                  error: `No accessible contact matched "${args.contact_id}". Either it does not exist or your role lacks visibility.`,
                },
              },
            });
            continue;
          }

          const emailLogs = db
            .prepare('SELECT * FROM email_logs WHERE contact_id = ? ORDER BY sent_at DESC')
            .all(match.id);
          const portalEvents = db
            .prepare('SELECT * FROM portal_events WHERE contact_id = ? ORDER BY created_at DESC')
            .all(match.id);
          const opp = db.prepare('SELECT * FROM opportunities WHERE contact_id = ?').get(match.id);

          sqlSources.push({
            purpose: `Timeline for ${match.full_name} (${match.organization})`,
            sql: `SELECT * FROM contacts WHERE id = '${match.id}'`,
            row_count: 1,
            source: 'in_memory_sqlite',
          });

          functionResponseParts.push({
            functionResponse: {
              id: call.id,
              name: call.name,
              response: {
                contact: match,
                opportunity: opp || null,
                email_logs: emailLogs,
                portal_events: portalEvents,
              },
            },
          });
        } else if (call.name === 'prepare_outreach_draft') {
          const requestedIds = Array.isArray(args.contact_ids)
            ? args.contact_ids.map((id) => String(id))
            : [];
          const subject = String(args.subject || 'Follow-Up from Fortifai');
          const bodyTemplate = String(args.body_template || '');

          const contactById = new Map(visibleContacts.map((c) => [c.id, c]));
          const validRecipients = requestedIds
            .map((id) => contactById.get(id))
            .filter((c): c is Contact => Boolean(c && !c.unsubscribed && c.stage !== 'Passed'));

          if (validRecipients.length === 0) {
            functionResponseParts.push({
              functionResponse: {
                id: call.id,
                name: call.name,
                response: {
                  error:
                    'No eligible (non-suppressed, RBAC-permitted) contact IDs were found for this draft.',
                },
              },
            });
            continue;
          }

          const audienceType = validRecipients[0].contact_type;
          const draft: AskMeDraftAction = {
            contact_ids: validRecipients.map((c) => c.id),
            subject,
            body_template: bodyTemplate,
            audience_type: audienceType,
            recipient_count: validRecipients.length,
            contacts: validRecipients.map((c) => ({
              id: c.id,
              full_name: c.full_name,
              organization: c.organization,
              email: c.email,
              contact_type: c.contact_type,
              stage: c.stage,
            })),
          };
          draftActions.push(draft);

          functionResponseParts.push({
            functionResponse: {
              id: call.id,
              name: call.name,
              response: {
                status: 'draft_ready_for_user_review',
                can_send_campaigns: session.permissions.can_send_campaigns,
                recipient_count: validRecipients.length,
                contact_ids: draft.contact_ids,
              },
            },
          });
        }
      }

      contents.push({
        role: 'user',
        parts: functionResponseParts,
      });
    }

    const structured = tryParseStructuredAnswer(
      finalResponseText,
      lastQueryRows,
      visibleContacts,
      draftActions,
      sqlSources
    );

    return { ok: true, message: structured };
  } catch (err) {
    let rawMsg = err instanceof Error ? err.message : 'Gemini request failed.';
    let status = 500;
    try {
      const parsedErr = JSON.parse(rawMsg) as { error?: { code?: number; message?: string } };
      if (parsedErr?.error?.message) {
        rawMsg = parsedErr.error.message;
        if (typeof parsedErr.error.code === 'number') status = parsedErr.error.code;
      }
    } catch {
      // Keep original string if not JSON
    }
    return { ok: false, status, error: rawMsg };
  } finally {
    db.close();
  }
}
