// vercel_api_entry.ts
import { createClient as _createSbAdminClient } from "@supabase/supabase-js";
import crypto2 from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import express from "express";

// server/askMe.ts
import { DatabaseSync } from "node:sqlite";
import {
  FunctionCallingConfigMode,
  GoogleGenAI,
  Type
} from "@google/genai";

// server/supabaseAdmin.ts
import { createClient } from "@supabase/supabase-js";
function resolveSbUrl(raw) {
  const cleaned = String(raw || "").trim().replace(/^['"]|['"]$/g, "");
  if (cleaned) {
    const withProto = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;
    try {
      const u = new URL(withProto);
      if (u.hostname.includes(".")) return u.origin;
    } catch {
    }
  }
  return "https://xwigfdsvknsgnlrbfshs.supabase.co";
}
var cachedAdminClient = null;
var cachedConfigKey = "";
function isServiceSupabaseConfigured() {
  const rawUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://xwigfdsvknsgnlrbfshs.supabase.co").trim().replace(/^['"]|['"]$/g, "");
  const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : rawUrl.includes(".") ? `https://${rawUrl}` : "https://xwigfdsvknsgnlrbfshs.supabase.co";
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return Boolean(url && serviceKey && !serviceKey.startsWith("MY_"));
}
function getServiceSupabaseClient() {
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !serviceKey || serviceKey.startsWith("MY_")) {
    return null;
  }
  const key = `${url}::${serviceKey.slice(0, 12)}`;
  if (!cachedAdminClient || cachedConfigKey !== key) {
    cachedAdminClient = createClient(resolveSbUrl((url || "").trim().replace(/^['"]|['"]$/g), "").startsWith("http") ? url.trim().replace(/^['"]|['"]$/g, "") : "https://xwigfdsvknsgnlrbfshs.supabase.co", serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
    cachedConfigKey = key;
  }
  return cachedAdminClient;
}
function mapRawCrmUserRow(raw) {
  const role = typeof raw.role === "string" ? raw.role : "analyst_viewer";
  const nested = raw.permissions && typeof raw.permissions === "object" ? raw.permissions : {};
  const permissions = {
    can_view_customers: typeof raw.can_view_customers === "boolean" ? raw.can_view_customers : Boolean(nested.can_view_customers),
    can_edit_customers: typeof raw.can_edit_customers === "boolean" ? raw.can_edit_customers : Boolean(nested.can_edit_customers),
    can_view_investors: typeof raw.can_view_investors === "boolean" ? raw.can_view_investors : Boolean(nested.can_view_investors),
    can_edit_investors: typeof raw.can_edit_investors === "boolean" ? raw.can_edit_investors : Boolean(nested.can_edit_investors),
    can_send_campaigns: typeof raw.can_send_campaigns === "boolean" ? raw.can_send_campaigns : Boolean(nested.can_send_campaigns),
    can_send_as_marketing: typeof raw.can_send_as_marketing === "boolean" ? raw.can_send_as_marketing : Boolean(nested.can_send_as_marketing) || ["super_admin", "admin", "marketing"].includes(role),
    can_manage_schema: typeof raw.can_manage_schema === "boolean" ? raw.can_manage_schema : Boolean(nested.can_manage_schema),
    can_manage_users: typeof raw.can_manage_users === "boolean" ? raw.can_manage_users : Boolean(nested.can_manage_users)
  };
  return {
    id: String(raw.id || ""),
    email: String(raw.email || "").toLowerCase(),
    full_name: String(raw.full_name || raw.email || "Fortifai User"),
    sender_display_name: typeof raw.sender_display_name === "string" && raw.sender_display_name.trim() ? raw.sender_display_name.trim() : String(raw.full_name || raw.email || "Fortifai User"),
    role,
    permissions,
    is_active: raw.is_active !== false,
    invited_by: typeof raw.invited_by === "string" ? raw.invited_by : void 0,
    created_at: typeof raw.created_at === "string" ? raw.created_at : (/* @__PURE__ */ new Date()).toISOString(),
    last_login_at: typeof raw.last_login_at === "string" ? raw.last_login_at : void 0
  };
}
async function fetchCrmUserByEmail(email) {
  const admin = getServiceSupabaseClient();
  if (!admin) return null;
  try {
    const { data, error } = await admin.from("crm_users").select("*").eq("email", email.trim().toLowerCase()).maybeSingle();
    if (error || !data) return null;
    return mapRawCrmUserRow(data);
  } catch {
    return null;
  }
}

// server/askMe.ts
var INVESTOR_ONLY_IDENTIFIERS = [
  "min_check_usd",
  "max_check_usd",
  "priority_tier",
  "execution_wave",
  "check_size_label",
  "investor.fortifai.io",
  "seed_investment",
  "us_inst_seed_track",
  "match_score",
  "thesis_fit",
  "stage_focus"
];
var CUSTOMER_ONLY_IDENTIFIERS = [
  "buyer_persona",
  "icp_score",
  "fortune_500",
  "expected_close",
  "overview.fortifai.io",
  "enterprise_deal",
  "account_dossiers"
];
function parseRelativeTimestampToIso(ts) {
  if (!ts) return new Date(Date.now() - 1e3 * 60 * 60 * 48).toISOString();
  const trimmed = ts.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const parsed = Date.parse(trimmed);
    return Number.isNaN(parsed) ? (/* @__PURE__ */ new Date()).toISOString() : new Date(parsed).toISOString();
  }
  const lower = trimmed.toLowerCase();
  const now = Date.now();
  if (lower === "just now") return new Date(now).toISOString();
  const minMatch = lower.match(/^(\d+)\s*m(?:in(?:s|utes?)?)?\s*ago$/);
  if (minMatch) return new Date(now - Number(minMatch[1]) * 60 * 1e3).toISOString();
  const hrMatch = lower.match(/^(\d+)\s*h(?:our(?:s)?)?\s*ago$/);
  if (hrMatch) return new Date(now - Number(hrMatch[1]) * 3600 * 1e3).toISOString();
  if (lower === "yesterday") return new Date(now - 24 * 3600 * 1e3).toISOString();
  const novMatch = trimmed.match(/^Nov\s+(\d{1,2})/i);
  if (novMatch) {
    const day = Number(novMatch[1]);
    return new Date(Date.UTC(2026, 10, day, 14, 0, 0)).toISOString();
  }
  return new Date(now - 2 * 24 * 3600 * 1e3).toISOString();
}
function parseMaxCheckUsd(contact) {
  const label = contact.check_size_label || "";
  const matches = Array.from(label.matchAll(/\$(\d+(?:\.\d+)?)\s*([MK])?/gi));
  if (matches.length > 0) {
    const last = matches[matches.length - 1];
    const num = Number(last[1]);
    const unit = (last[2] || "").toUpperCase();
    if (unit === "M") return Math.round(num * 1e6);
    if (unit === "K") return Math.round(num * 1e3);
    return Math.round(num);
  }
  return contact.min_check_usd || contact.amount_usd || 0;
}
function deriveRelationshipStrength(c) {
  if (c.delivery_status === "replied" || ["Meeting", "Diligence", "SAFE Signed", "5 Internal Review Pending", "6 Commercial / Contracting", "7 Closed Won"].includes(c.stage)) {
    return "strong";
  }
  if (c.delivery_status === "portal_visited" || c.delivery_status === "opened" || c.portal_visited) {
    return "warm";
  }
  return "cold";
}
function deriveTags(c) {
  const tags = [];
  if (c.fortune_500) tags.push("fortune_500");
  if (c.tier) tags.push(c.tier);
  if (c.priority_tier) tags.push(c.priority_tier);
  if (c.us_inst_seed_track) tags.push("us_inst_seed_track");
  if (c.industry) tags.push(c.industry);
  return tags.join(", ");
}
function buildInMemoryCrmDb(rawContacts, customFields, rawTelemetry, perms) {
  const visibleContacts = rawContacts.filter((c) => {
    if (c.contact_type === "investor" && !perms.can_view_investors) return false;
    if (c.contact_type === "customer" && !perms.can_view_customers) return false;
    return true;
  });
  const visibleContactIds = new Set(visibleContacts.map((c) => c.id));
  const visibleTelemetry = rawTelemetry.filter((t) => {
    if (t.contact_type === "investor" && !perms.can_view_investors) return false;
    if (t.contact_type === "customer" && !perms.can_view_customers) return false;
    if (t.source === "investor.fortifai.io" && !perms.can_view_investors) return false;
    if (t.source === "overview.fortifai.io" && !perms.can_view_customers) return false;
    return visibleContactIds.has(t.contact_id) || visibleContactIds.size === 0;
  });
  const db = new DatabaseSync(":memory:");
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
      c.first_name || "",
      c.last_name || "",
      c.full_name,
      c.organization,
      c.title || "",
      c.region,
      c.location || "",
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
      c.contact_type === "investor" ? parseMaxCheckUsd(c) : null,
      c.stage_focus || null,
      c.thesis_fit || null,
      c.match_score ?? null,
      c.custom_hook || null,
      JSON.stringify(c.custom_fields || {}),
      c.owner || "Varun",
      c.owner_id || "usr_varun",
      c.owner_email || "varun@fortifai.io",
      deriveRelationshipStrength(c),
      deriveTags(c),
      c.unsubscribed ? 1 : 0,
      c.aging_days ?? 0,
      c.delivery_status || "not_sent",
      c.last_reply_subject || null,
      c.last_reply_snippet || null,
      c.last_reply_from || null,
      c.last_contacted_at || null
    );
    const meetingBooked = [
      "Meeting",
      "Diligence",
      "SAFE Signed",
      "4 Decisionmaker buy in",
      "5 Internal Review Pending",
      "6 Commercial / Contracting",
      "7 Closed Won"
    ].includes(c.stage) ? 1 : 0;
    insertOpp.run(
      `opp_${c.id}`,
      c.id,
      c.owner_id || "usr_varun",
      c.owner_email || "varun@fortifai.io",
      c.contact_type === "investor" ? "seed_investment" : "enterprise_deal",
      c.stage,
      c.outcome || null,
      meetingBooked,
      c.product_or_instrument || null,
      c.amount_usd ?? 0,
      c.probability ?? 0,
      c.expected_close || null,
      c.aging_days ?? 0,
      c.next_step || null,
      [c.notes, ...(c.quick_notes || []).map((q) => `[${q.author_name}] ${q.text}`)].filter(Boolean).join(" | ") || null,
      c.last_contacted_at || new Date(Date.now() - 864e5 * 3).toISOString()
    );
  });
  const insertField = db.prepare(`
    INSERT INTO custom_field_definitions VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  customFields.filter((f) => {
    if (f.entity_scope === "investor" && !perms.can_view_investors) return false;
    if (f.entity_scope === "customer" && !perms.can_view_customers) return false;
    return true;
  }).forEach((f, idx) => {
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
  const now = Date.now();
  const seedCampaigns = [
    {
      id: "cmp_03",
      audience_type: "customer",
      subject: "Continuous Audit & Counterpart Risk Automation \u2014 Fortifai",
      body: "Zero-egress AI assurance agents across SAP, Oracle, and Workday.",
      created_at: new Date(now - 2 * 864e5).toISOString()
    },
    {
      id: "cmp_02",
      audience_type: "investor",
      subject: "Fortifai ($3M Seed) \u2014 Cat A Reminder & Q4 Enterprise Traction",
      body: "Honeywell, Nokia, and Brookfield Properties traction update.",
      created_at: new Date(now - 4 * 864e5).toISOString()
    },
    {
      id: "cmp_01",
      audience_type: "investor",
      subject: "Fortifai \u2014 Autonomous Audit & Compliance for Fortune 500 ($3M Seed)",
      body: "Initial Wave 1 & Cat B Seed round outreach ($15M cap SAFE).",
      created_at: new Date(now - 7 * 864e5).toISOString()
    }
  ];
  const campaigns = seedCampaigns.filter(
    (cmp) => cmp.audience_type === "investor" ? perms.can_view_investors : perms.can_view_customers
  );
  const insertCampaign = db.prepare(`INSERT INTO campaigns VALUES (?, ?, ?, ?, ?)`);
  campaigns.forEach((cmp) => {
    insertCampaign.run(cmp.id, cmp.audience_type, cmp.subject, cmp.body, cmp.created_at);
  });
  const insertEmailLog = db.prepare(`
    INSERT INTO email_logs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  visibleContacts.forEach((c, idx) => {
    if (!c.delivery_status || c.delivery_status === "not_sent") return;
    const isHumanOpen = c.delivery_status === "opened" || c.delivery_status === "portal_visited" || c.delivery_status === "replied" ? c.opened_duration_sec === void 0 || c.opened_duration_sec >= 10 : false;
    const isBotOnly = c.opened_duration_sec !== void 0 && c.opened_duration_sec < 10 && !isHumanOpen;
    const campaignId = c.contact_type === "customer" ? "cmp_03" : c.execution_wave?.includes("Cat A") ? "cmp_02" : "cmp_01";
    const sentIso = c.sent_at || c.last_contacted_at || new Date(now - (idx + 1) * 864e5).toISOString();
    const deliveredIso = c.delivery_status === "bounced" || c.delivery_status === "sent" ? null : c.delivered_at || sentIso;
    const openedIso = isHumanOpen ? parseRelativeTimestampToIso(c.opened_at) : null;
    const clickedIso = c.delivery_status === "portal_visited" || c.portal_visited ? parseRelativeTimestampToIso(c.opened_at) : null;
    const repliedIso = c.delivery_status === "replied" ? parseRelativeTimestampToIso(c.replied_at) : null;
    const bouncedIso = c.delivery_status === "bounced" ? parseRelativeTimestampToIso(c.bounced_at) : null;
    insertEmailLog.run(
      `log_${c.id}`,
      c.id,
      campaignId,
      `re_${c.id}_${idx}`,
      c.owner_email || "varun@fortifai.io",
      c.owner_email || "varun@fortifai.io",
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
  const insertPortalEvent = db.prepare(`
    INSERT INTO portal_events VALUES (?, ?, ?, ?, ?, ?)
  `);
  visibleTelemetry.filter((t) => t.source === "investor.fortifai.io" || t.source === "overview.fortifai.io").forEach((t) => {
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
function validateAndEnforceSqlRbac(rawSql, perms) {
  const cleaned = rawSql.trim().replace(/;\s*$/, "");
  if (!cleaned) {
    return { ok: false, error: "SQL query cannot be empty." };
  }
  if (!/^(select|with)\b/i.test(cleaned)) {
    return { ok: false, error: "Only read-only SELECT or WITH queries are permitted." };
  }
  if (/;\s*\S/.test(cleaned) || /\b(insert|update|delete|drop|alter|create|attach|pragma|truncate|grant|revoke|replace|vacuum)\b/i.test(
    cleaned
  )) {
    return { ok: false, error: "Disallowed write or DDL SQL keyword detected." };
  }
  const lower = cleaned.toLowerCase();
  if (!perms.can_view_investors) {
    const forbidden = INVESTOR_ONLY_IDENTIFIERS.find((id) => lower.includes(id));
    if (forbidden || /contact_type\s*=\s*'investor'/i.test(cleaned) || /entity_scope\s*=\s*'investor'/i.test(cleaned) || /audience_type\s*=\s*'investor'/i.test(cleaned) || /'investor'/i.test(cleaned)) {
      return {
        ok: false,
        error: `RBAC policy blocked query: can_view_investors is false (referenced "${forbidden || "investor"}").`
      };
    }
  }
  if (!perms.can_view_customers) {
    const forbidden = CUSTOMER_ONLY_IDENTIFIERS.find((id) => lower.includes(id));
    if (forbidden || /contact_type\s*=\s*'customer'/i.test(cleaned) || /entity_scope\s*=\s*'customer'/i.test(cleaned) || /audience_type\s*=\s*'customer'/i.test(cleaned) || /'customer'/i.test(cleaned)) {
      return {
        ok: false,
        error: `RBAC policy blocked query: can_view_customers is false (referenced "${forbidden || "customer"}").`
      };
    }
  }
  let enforcedSql = cleaned;
  if (!perms.can_view_investors || !perms.can_view_customers) {
    const domain = perms.can_view_customers ? "customer" : "investor";
    const oppType = domain === "customer" ? "enterprise_deal" : "seed_investment";
    const portalHost = domain === "customer" ? "overview.fortifai.io" : "investor.fortifai.io";
    const scopeCtes = [
      `contacts AS (SELECT * FROM public.contacts WHERE contact_type = '${domain}')`,
      `opportunities AS (SELECT * FROM public.opportunities WHERE opportunity_type = '${oppType}')`,
      `custom_field_definitions AS (SELECT * FROM public.custom_field_definitions WHERE entity_scope IN ('${domain}', 'both'))`,
      `campaigns AS (SELECT * FROM public.campaigns WHERE audience_type = '${domain}')`,
      `portal_events AS (SELECT * FROM public.portal_events WHERE portal = '${portalHost}')`,
      `email_logs AS (SELECT el.* FROM public.email_logs el JOIN public.contacts __rbac_c ON __rbac_c.id = el.contact_id WHERE __rbac_c.contact_type = '${domain}')`
    ].join(", ");
    if (/^with\b/i.test(enforcedSql)) {
      enforcedSql = enforcedSql.replace(/^with\s+/i, `WITH ${scopeCtes}, `);
    } else {
      enforcedSql = `WITH ${scopeCtes} ${enforcedSql}`;
    }
  }
  const sqliteSql = cleaned.replace(/\bILIKE\b/gi, "LIKE").replace(/::(numeric|float8|float4|float|integer|int|bigint|text|varchar|boolean|bool|timestamptz|timestamp|jsonb|json)\b/gi, "").replace(/STRING_AGG\s*\(/gi, "GROUP_CONCAT(").replace(/NOW\(\)\s*-\s*INTERVAL\s*'(\d+)\s+days?'/gi, "datetime('now', '-$1 days')").replace(/CURRENT_TIMESTAMP\s*-\s*INTERVAL\s*'(\d+)\s+days?'/gi, "datetime('now', '-$1 days')").replace(/NOW\(\)\s*-\s*INTERVAL\s*'(\d+)\s+hours?'/gi, "datetime('now', '-$1 hours')").replace(/\bNOW\(\)/gi, "datetime('now')");
  return { ok: true, enforcedSql, sqliteSql };
}
function broadenEqualityToLike(sql) {
  const replaced = sql.replace(
    /(\b[a-zA-Z0-9_."'>-]+)\s*=\s*'([^']{2,40})'/g,
    (match, col, val) => {
      if (["customer", "investor", "enterprise_deal", "seed_investment", "not_sent"].includes(val.toLowerCase())) {
        return match;
      }
      if (col.toLowerCase().includes("contact_type") || col.toLowerCase().includes("opportunity_type")) {
        return match;
      }
      return `${col} LIKE '%${val}%'`;
    }
  );
  return replaced !== sql ? replaced : null;
}
var QUERY_CRM_DATABASE_DECL = {
  name: "query_crm_database",
  description: "Executes a read-only PostgreSQL SELECT query against the CRM database (contacts, opportunities, custom_field_definitions, campaigns, email_logs, portal_events). Always query custom_field_definitions first if the user mentions a custom column.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      sql_query: {
        type: Type.STRING,
        description: "A read-only SELECT or WITH SQL query. Do not include semicolons or write statements."
      },
      purpose: {
        type: Type.STRING,
        description: "Short description of what this query is retrieving."
      }
    },
    required: ["sql_query", "purpose"]
  }
};
var GET_CONTACT_TIMELINE_DECL = {
  name: "get_contact_timeline",
  description: "Fetches the full profile, opportunity stage, custom fields, Resend email logs, and portal_events chronology for a specific person or firm.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      contact_id: {
        type: Type.STRING,
        description: "Contact ID (e.g. cust_01, inv_04) or organization/person name."
      }
    },
    required: ["contact_id"]
  }
};
var PREPARE_OUTREACH_DRAFT_DECL = {
  name: "prepare_outreach_draft",
  description: "Prepares a pre-populated Outreach Composer draft card for specific contact IDs so the user can review and click Send. Never sends emails automatically.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      contact_ids: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "Array of contact IDs to load into the Outreach Composer."
      },
      subject: {
        type: Type.STRING,
        description: "Email subject line supporting {{first_name}}, {{organization}}, etc."
      },
      body_template: {
        type: Type.STRING,
        description: "Email body template supporting {{first_name}}, {{organization}}, {{title}}, {{region}}, {{custom_hook}}, and {{contact_id}}."
      }
    },
    required: ["contact_ids", "subject", "body_template"]
  }
};
function buildSystemInstruction(session, arrTarget2027, customFields) {
  const perms = session.permissions;
  const scopedFields = customFields.filter((f) => {
    if (f.entity_scope === "investor" && !perms.can_view_investors) return false;
    if (f.entity_scope === "customer" && !perms.can_view_customers) return false;
    return true;
  });
  const customColHint = scopedFields.length > 0 ? scopedFields.map((f) => `${f.field_key} (${f.field_label}, scope=${f.entity_scope}, type=${f.field_type})`).join("; ") : "None yet";
  const contextLines = [
    "- Fortifai builds zero-egress, customer-VPC enterprise risk & continuous audit AI agents integrating with SAP, Oracle, Workday, and ERP systems: Counterpart Risk Monitoring, ABAC Risk Monitoring, Kuber Procurement Cost Optimisation, Surge Channel Stuffing, Aegis Trade Diversion, Crystal Balance Sheet Close, D7 Global TPRM with Signzy.",
    ...perms.can_view_customers ? [
      `- Current Enterprise 2027 ARR Target: $${arrTarget2027.toLocaleString()} (with 5.7x coverage model = $${Math.round(arrTarget2027 * 5.7).toLocaleString()} recommended pipeline). Customer briefing portal: overview.fortifai.io.`
    ] : [],
    ...perms.can_view_investors ? [
      "- Current Fundraising Round: $3,000,000 Seed on a $15,000,000 pre-money valuation cap SAFE (portal: investor.fortifai.io)."
    ] : []
  ].join("\n");
  const rbacDirectives = [
    !perms.can_view_investors ? "CRITICAL RBAC RULE: This user does NOT have can_view_investors. You are strictly scoped to CUSTOMER data only. Do NOT query investor rows, investor.fortifai.io, seed_investment, or investor-only fields (min_check_usd, max_check_usd, priority_tier, execution_wave, check_size_label). If asked about investors or fundraising, refuse briefly stating investor data requires can_view_investors." : "",
    !perms.can_view_customers ? "CRITICAL RBAC RULE: This user does NOT have can_view_customers. You are strictly scoped to INVESTOR data only. Do NOT query customer rows, overview.fortifai.io, enterprise_deal, account_dossiers, or customer-only fields (buyer_persona, icp_score, fortune_500, expected_close). If asked about enterprise customers or ARR deals, refuse briefly stating customer data requires can_view_customers." : ""
  ].filter(Boolean).join("\n- ");
  const portalEnum = [
    perms.can_view_investors ? "'investor.fortifai.io'" : "",
    perms.can_view_customers ? "'overview.fortifai.io'" : ""
  ].filter(Boolean).join("|");
  const oppTypeEnum = [
    perms.can_view_customers ? "'enterprise_deal'" : "",
    perms.can_view_investors ? "'seed_investment'" : ""
  ].filter(Boolean).join("|");
  const contactTypeEnum = [
    perms.can_view_customers ? "'customer'" : "",
    perms.can_view_investors ? "'investor'" : ""
  ].filter(Boolean).join("|");
  return `You are **Ask Scale**, Fortifai Scale's institutional Intelligence Copilot.
You operate strictly on real data returned by your declared function-calling tools. Never fabricate numbers, names, emails, or pipeline values.

### Fortifai Domain Context
${contextLines}

### Logged-In User RBAC Context
- User: ${session.email} (role: ${session.role})
- Permissions: can_view_customers=${perms.can_view_customers}, can_view_investors=${perms.can_view_investors}, can_send_campaigns=${perms.can_send_campaigns}.
${rbacDirectives ? `- ${rbacDirectives}` : ""}

### Relational Schema Grounding
1. \`contacts\` (id, email, first_name, last_name, full_name, organization, title, region, location, contact_type [${contactTypeEnum}], ${perms.can_view_customers ? "buyer_persona ['CCO/GC'|'CAE'|'CFO'|'CPO'|'Other'], industry, tier ['Tier I'|'Tier II'], icp_score, fortune_500 [0/1], " : ""}${perms.can_view_investors ? "priority_tier ['P1'..'P4'], execution_wave, batch_order, check_size_label, min_check_usd, max_check_usd, stage_focus, thesis_fit, match_score, custom_hook, " : ""}custom_fields JSONB, owner, owner_id, owner_email, relationship_strength, tags, unsubscribed [0/1], aging_days, delivery_status, last_reply_subject, last_reply_snippet, last_reply_from, last_contacted_at)
2. \`opportunities\` (id, contact_id, owner_id, owner_email, opportunity_type [${oppTypeEnum}], stage, outcome, meeting_booked [0/1], product_or_instrument, amount_usd, probability [0-100], ${perms.can_view_customers ? "expected_close ['Q1 2027'|'Q2 2027'|'Q3 2027'|'Q4 2027'], " : ""}aging_days, next_step, notes, updated_at)
3. \`custom_field_definitions\` (id, entity_scope, field_key, field_label, field_type, select_options, display_order)
   - Currently registered custom fields: ${customColHint}
4. \`campaigns\` (id, audience_type [${contactTypeEnum}], subject, body, created_at)
5. \`email_logs\` (id, contact_id, campaign_id, resend_email_id, sender_email, reply_to_email, status ['sent'|'delivered'|'opened'|'clicked'|'bounced'|'complained'|'replied'], delivered_at, opened_at, clicked_at, replied_at, reply_snippet, sent_at, bounced_at, is_bot_scan [0/1]) \u2014 note: bot scans <10s have opened_at = NULL and is_bot_scan = 1.
6. \`portal_events\` (id, contact_id, portal [${portalEnum}], event_type, metadata, created_at)
${perms.can_view_customers ? "7. `account_dossiers` (id, organization, industry, region, icp_fit_score, primary_wedge_product, dossier_json, sources, generated_by, generated_at)\n" : ""}
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
function tryParseStructuredAnswer(rawText, fallbackRows, visibleContacts, draftActions, sqlSources) {
  const trimmed = rawText.trim();
  let parsed = null;
  const jsonBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = jsonBlockMatch ? jsonBlockMatch[1].trim() : trimmed;
  if (candidate.startsWith("{")) {
    try {
      parsed = JSON.parse(candidate);
    } catch {
      parsed = null;
    }
  }
  const contactById = new Map(visibleContacts.map((c) => [c.id, c]));
  const collectedIds = new Set(Array.isArray(parsed?.contact_ids) ? parsed.contact_ids : []);
  const tableRows = parsed?.table?.rows || [];
  tableRows.forEach((row) => {
    const cid = row.contact_id ?? row.id;
    if (typeof cid === "string" && contactById.has(cid)) collectedIds.add(cid);
  });
  fallbackRows.forEach((row) => {
    const cid = row.contact_id ?? row.id;
    if (typeof cid === "string" && contactById.has(cid)) collectedIds.add(cid);
  });
  draftActions.forEach((da) => {
    da.contact_ids.forEach((cid) => {
      if (contactById.has(cid)) collectedIds.add(cid);
    });
  });
  const contact_pills = Array.from(collectedIds).map((id) => contactById.get(id)).filter((c) => Boolean(c)).slice(0, 12).map((c) => ({
    id: c.id,
    full_name: c.full_name,
    organization: c.organization,
    email: c.email,
    contact_type: c.contact_type,
    stage: c.stage
  }));
  let table = parsed?.table && Array.isArray(parsed.table.columns) && Array.isArray(parsed.table.rows) ? parsed.table : void 0;
  if (!table && fallbackRows.length > 0 && fallbackRows.length <= 15) {
    const cols = Object.keys(fallbackRows[0]).filter((k) => k !== "contact_id");
    if (cols.length > 0) {
      table = {
        columns: cols,
        rows: fallbackRows.map((r) => {
          const out = {};
          if (typeof r.contact_id === "string") out.contact_id = r.contact_id;
          cols.forEach((col) => {
            const v = r[col];
            out[col] = v === null || v === void 0 ? null : typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? v : JSON.stringify(v);
          });
          return out;
        })
      };
    }
  }
  return {
    summary: parsed?.summary || trimmed,
    kpis: Array.isArray(parsed?.kpis) ? parsed.kpis.slice(0, 4) : void 0,
    table,
    contact_pills: contact_pills.length > 0 ? contact_pills : void 0,
    draft_actions: draftActions.length > 0 ? draftActions : void 0,
    sql_sources: sqlSources.length > 0 ? sqlSources : void 0,
    follow_up_suggestions: Array.isArray(parsed?.follow_up_suggestions) ? parsed.follow_up_suggestions.slice(0, 3) : void 0
  };
}
async function handleAskMeRequest(payload, session) {
  if (!session.permissions.can_view_customers && !session.permissions.can_view_investors) {
    return {
      ok: false,
      status: 403,
      error: "RBAC policy denied: requires can_view_customers or can_view_investors."
    };
  }
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  if (messages.length === 0) {
    return { ok: false, status: 400, error: "At least one message is required." };
  }
  const latestUserText = [...messages].reverse().find((m) => m.role === "user")?.text?.trim() || "";
  if (!session.permissions.can_view_investors && /\b(investor|investors|vc|vcs|angel|angels|seed\s+round|seed\s+fund|fundrais(?:e|ing)|safe\s+(?:signed|cap|note)?|\$15m\s+cap|\$3m\s+seed|check\s+size|check\s+capacity|min_check|max_check|priority_tier|p1\/p2|wave\s*1|wave\s*2|cat\s+[ab]|family\s+office|soft\s+circle|investor\.fortifai\.io|investor\s+pass(?:es)?|passed\s+investor)\b/i.test(
    latestUserText
  )) {
    return {
      ok: true,
      message: {
        summary: "Access blocked by RBAC policy: Your active role does not include `can_view_investors` permission. Ask Scale is strictly scoped to Enterprise Customer pipeline, account intelligence, and overview.fortifai.io telemetry.",
        follow_up_suggestions: [
          "Which Q1/Q2 2027 deals are aging over 90 days and need follow-up?",
          "Show weighted ARR coverage vs our $3M target by buyer persona",
          "Who visited overview.fortifai.io in the past 7 days?"
        ]
      }
    };
  }
  if (!session.permissions.can_view_customers && /\b(enterprise\s+(?:customer|account|deal|pipeline)|customers?|target\s+arr|arr\s+coverage|2027\s+arr|tier\s*i{1,2}|buyer\s+persona|cco\/gc|cae|cfo|cpo|icp\s+score|fortune\s*500|overview\.fortifai\.io|account\s+dossier|dossier|aging\s+over\s+90)\b/i.test(
    latestUserText
  )) {
    return {
      ok: true,
      message: {
        summary: "Access blocked by RBAC policy: Your active role does not include `can_view_customers` permission. Ask Scale is strictly scoped to $3M Seed Investor pipeline, fundraising analytics, and investor.fortifai.io telemetry.",
        follow_up_suggestions: [
          "Which P1/P2 investors opened emails or visited investor.fortifai.io without replying?",
          "How much check capacity do we have across Wave 1 Leads in the US vs Singapore/UAE?",
          "Summarize all investor passes and reasons"
        ]
      }
    };
  }
  const apiKey = process.env.GEMINI_API_KEY || "";
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return {
      ok: false,
      status: 500,
      error: "GEMINI_API_KEY is not configured. Add your Gemini API key in Settings > Secrets to use Ask Scale."
    };
  }
  const crmState = payload.crmState || {
    contacts: [],
    customFields: [],
    telemetry: [],
    arrTarget2027: 3e6
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
        "User-Agent": "aistudio-build"
      }
    }
  });
  const sqlSources = [];
  const draftActions = [];
  let lastQueryRows = [];
  const contents = messages.slice(-10).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.text }]
  }));
  const systemInstruction = buildSystemInstruction(
    session,
    crmState.arrTarget2027 || 3e6,
    crmState.customFields || []
  );
  const tools = [
    {
      functionDeclarations: [
        QUERY_CRM_DATABASE_DECL,
        GET_CONTACT_TIMELINE_DECL,
        PREPARE_OUTREACH_DRAFT_DECL
      ]
    }
  ];
  const toolConfig = {
    functionCallingConfig: {
      mode: FunctionCallingConfigMode.AUTO
    }
  };
  try {
    let finalResponseText = "";
    for (let step = 0; step < 6; step += 1) {
      let response;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          response = await ai.models.generateContent({
            model: "gemini-4-hydrogen",
            contents,
            config: {
              systemInstruction,
              tools,
              toolConfig
            }
          });
          break;
        } catch (apiErr) {
          const msg = apiErr instanceof Error ? apiErr.message : String(apiErr);
          const isTransient503 = msg.includes("503") || msg.includes("UNAVAILABLE");
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
        finalResponseText = response.text || "No response generated.";
        break;
      }
      if (modelContent) {
        contents.push(modelContent);
      }
      const functionResponseParts = [];
      for (const call of functionCalls) {
        const args = call.args || {};
        if (call.name === "query_crm_database") {
          const rawSql = String(args.sql_query || "");
          const purpose = String(args.purpose || "Query CRM database");
          const check = validateAndEnforceSqlRbac(rawSql, session.permissions);
          if (!check.ok) {
            sqlSources.push({
              purpose,
              sql: rawSql,
              row_count: 0,
              source: "in_memory_sqlite",
              error: check.error
            });
            functionResponseParts.push({
              functionResponse: {
                id: call.id,
                name: call.name,
                response: { error: check.error }
              }
            });
            continue;
          }
          let rows = [];
          let source = "in_memory_sqlite";
          let retried = false;
          let sqlError;
          let rpcHandled = false;
          if (supabaseAdmin) {
            try {
              const { data, error } = await supabaseAdmin.rpc("execute_crm_readonly_query", {
                query_text: check.enforcedSql
              });
              if (!error && Array.isArray(data)) {
                rows = data;
                source = "supabase_rpc";
                rpcHandled = true;
              }
            } catch {
              rpcHandled = false;
            }
          }
          if (!rpcHandled) {
            try {
              rows = db.prepare(check.sqliteSql).all();
              if (rows.length === 0) {
                const broadened = broadenEqualityToLike(check.sqliteSql);
                if (broadened) {
                  const retryRows = db.prepare(broadened).all();
                  if (retryRows.length > 0) {
                    rows = retryRows;
                    retried = true;
                  }
                }
              }
            } catch (err) {
              sqlError = err instanceof Error ? err.message : "SQL execution failed";
            }
          }
          sqlSources.push({
            purpose,
            sql: check.enforcedSql,
            row_count: rows.length,
            source,
            retried,
            ...sqlError ? { error: sqlError } : {}
          });
          if (sqlError) {
            functionResponseParts.push({
              functionResponse: {
                id: call.id,
                name: call.name,
                response: {
                  error: sqlError,
                  hint: "Check column names against contacts, opportunities, custom_field_definitions, campaigns, email_logs, or portal_events and retry."
                }
              }
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
                  rows: rows.slice(0, 40)
                }
              }
            });
          }
        } else if (call.name === "get_contact_timeline") {
          const queryVal = String(args.contact_id || "").trim().toLowerCase();
          const match = visibleContacts.find(
            (c) => c.id.toLowerCase() === queryVal || c.email.toLowerCase() === queryVal || c.full_name.toLowerCase().includes(queryVal) || c.organization.toLowerCase().includes(queryVal)
          );
          if (!match) {
            functionResponseParts.push({
              functionResponse: {
                id: call.id,
                name: call.name,
                response: {
                  error: `No accessible contact matched "${args.contact_id}". Either it does not exist or your role lacks visibility.`
                }
              }
            });
            continue;
          }
          const emailLogs = db.prepare("SELECT * FROM email_logs WHERE contact_id = ? ORDER BY sent_at DESC").all(match.id);
          const portalEvents = db.prepare("SELECT * FROM portal_events WHERE contact_id = ? ORDER BY created_at DESC").all(match.id);
          const opp = db.prepare("SELECT * FROM opportunities WHERE contact_id = ?").get(match.id);
          sqlSources.push({
            purpose: `Timeline for ${match.full_name} (${match.organization})`,
            sql: `SELECT * FROM contacts WHERE id = '${match.id}'`,
            row_count: 1,
            source: "in_memory_sqlite"
          });
          functionResponseParts.push({
            functionResponse: {
              id: call.id,
              name: call.name,
              response: {
                contact: match,
                opportunity: opp || null,
                email_logs: emailLogs,
                portal_events: portalEvents
              }
            }
          });
        } else if (call.name === "prepare_outreach_draft") {
          const requestedIds = Array.isArray(args.contact_ids) ? args.contact_ids.map((id) => String(id)) : [];
          const subject = String(args.subject || "Follow-Up from Fortifai");
          const bodyTemplate = String(args.body_template || "");
          const contactById = new Map(visibleContacts.map((c) => [c.id, c]));
          const validRecipients = requestedIds.map((id) => contactById.get(id)).filter((c) => Boolean(c && !c.unsubscribed && c.stage !== "Passed"));
          if (validRecipients.length === 0) {
            functionResponseParts.push({
              functionResponse: {
                id: call.id,
                name: call.name,
                response: {
                  error: "No eligible (non-suppressed, RBAC-permitted) contact IDs were found for this draft."
                }
              }
            });
            continue;
          }
          const audienceType = validRecipients[0].contact_type;
          const draft = {
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
              stage: c.stage
            }))
          };
          draftActions.push(draft);
          functionResponseParts.push({
            functionResponse: {
              id: call.id,
              name: call.name,
              response: {
                status: "draft_ready_for_user_review",
                can_send_campaigns: session.permissions.can_send_campaigns,
                recipient_count: validRecipients.length,
                contact_ids: draft.contact_ids
              }
            }
          });
        }
      }
      contents.push({
        role: "user",
        parts: functionResponseParts
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
    let rawMsg = err instanceof Error ? err.message : "Gemini request failed.";
    let status = 500;
    try {
      const parsedErr = JSON.parse(rawMsg);
      if (parsedErr?.error?.message) {
        rawMsg = parsedErr.error.message;
        if (typeof parsedErr.error.code === "number") status = parsedErr.error.code;
      }
    } catch {
    }
    return { ok: false, status, error: rawMsg };
  } finally {
    db.close();
  }
}

// server/dossier.ts
import crypto from "node:crypto";
import { GoogleGenAI as GoogleGenAI2 } from "@google/genai";
var VALID_WEDGE_AGENTS = [
  "Counterpart Risk Monitoring",
  "ABAC",
  "Kuber",
  "Surge",
  "Aegis",
  "Crystal",
  "D7"
];
function sanitizeUrl(raw) {
  if (typeof raw !== "string") return null;
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}
function countWords(dossier) {
  const parts = [
    dossier.account_snapshot.revenue,
    dossier.account_snapshot.margin,
    dossier.account_snapshot.hq_regions,
    dossier.account_snapshot.target_arr,
    dossier.account_snapshot.primary_wedge_agent,
    ...dossier.account_snapshot.why_now_bullets,
    ...dossier.financial_triggers.bullets,
    ...dossier.regulatory_pressures.bullets,
    ...dossier.erp_india_gcc.bullets,
    ...dossier.buying_committee_map.flatMap((r) => [
      r.persona,
      r.contact_name,
      r.scale_status,
      r.persona_angle
    ]),
    ...dossier.scale_engagement_pulse.bullets
  ];
  const joined = parts.join(" ").trim();
  if (!joined) return 0;
  return joined.split(/\s+/).length;
}
function normalizeWedgeAgent(raw) {
  if (typeof raw !== "string") return "Counterpart Risk Monitoring";
  const lower = raw.trim().toLowerCase();
  const exact = VALID_WEDGE_AGENTS.find((w) => w.toLowerCase() === lower);
  if (exact) return exact;
  if (lower.includes("abac")) return "ABAC";
  if (lower.includes("kuber")) return "Kuber";
  if (lower.includes("surge")) return "Surge";
  if (lower.includes("aegis")) return "Aegis";
  if (lower.includes("crystal")) return "Crystal";
  if (lower.includes("d7")) return "D7";
  return "Counterpart Risk Monitoring";
}
function trimBullets(arr, maxItems, fallback) {
  if (!Array.isArray(arr)) return fallback;
  const cleaned = arr.map((item) => String(item || "").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, maxItems);
  return cleaned.length > 0 ? cleaned : fallback;
}
function formatCompactUsd(amount) {
  if (!amount) return "$0";
  if (amount >= 1e6) return `$${(amount / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
  if (amount >= 1e3) return `$${Math.round(amount / 1e3)}K`;
  return `$${amount}`;
}
async function handleGenerateDossier(payload, generatedByEmail) {
  const org = (payload.organization || "").trim();
  if (!org) {
    return { ok: false, status: 400, error: "Organization name is required to generate a dossier." };
  }
  const supabaseAdmin = getServiceSupabaseClient();
  if (supabaseAdmin && !payload.forceRefresh) {
    try {
      const { data: cachedRow, error: cacheErr } = await supabaseAdmin.from("account_dossiers").select("*").ilike("organization", org).order("generated_at", { ascending: false }).limit(1).maybeSingle();
      if (!cacheErr && cachedRow && cachedRow.dossier_json) {
        const cachedPayload = cachedRow.dossier_json;
        const dossier = {
          id: String(cachedRow.id),
          organization: String(cachedRow.organization),
          industry: String(cachedRow.industry || payload.industry || "Enterprise"),
          region: String(cachedRow.region || payload.region || "US"),
          icp_fit_score: Number(cachedRow.icp_fit_score ?? payload.icpScore ?? 85),
          primary_wedge_product: String(
            cachedRow.primary_wedge_product || cachedPayload?.account_snapshot?.primary_wedge_agent || "Counterpart Risk Monitoring"
          ),
          dossier_json: cachedPayload,
          sources: Array.isArray(cachedRow.sources) ? cachedRow.sources : [],
          generated_by: String(cachedRow.generated_by || generatedByEmail),
          generated_at: String(cachedRow.generated_at || (/* @__PURE__ */ new Date()).toISOString()),
          word_count: countWords(cachedPayload)
        };
        return { ok: true, cached: true, dossier };
      }
    } catch {
    }
  }
  let orgContacts = Array.isArray(payload.contactsInOrg) ? payload.contactsInOrg : [];
  let liveEmailLogs = [];
  let livePortalEvents = [];
  let liveOpps = [];
  if (supabaseAdmin) {
    try {
      const { data: dbContacts } = await supabaseAdmin.from("contacts").select("*").ilike("organization", org);
      if (Array.isArray(dbContacts) && dbContacts.length > 0) {
        const contactIds = dbContacts.map((c) => String(c.id));
        const [oppsRes, logsRes, portalRes] = await Promise.all([
          supabaseAdmin.from("opportunities").select("*").in("contact_id", contactIds),
          supabaseAdmin.from("email_logs").select("*").in("contact_id", contactIds).order("sent_at", { ascending: false }).limit(10),
          supabaseAdmin.from("portal_events").select("*").in("contact_id", contactIds).order("created_at", { ascending: false }).limit(10)
        ]);
        liveOpps = oppsRes.data || [];
        liveEmailLogs = logsRes.data || [];
        livePortalEvents = portalRes.data || [];
        if (orgContacts.length === 0) {
          orgContacts = dbContacts;
        }
      }
    } catch {
    }
  }
  const primaryContact = orgContacts.find((c) => c.id === payload.contactId) || orgContacts[0];
  const industry = payload.industry || primaryContact?.industry || "Enterprise";
  const region = payload.region || primaryContact?.region || "US";
  const icpScore = payload.icpScore ?? primaryContact?.icp_score ?? 88;
  const targetArr = payload.targetArr ?? primaryContact?.amount_usd ?? 25e4;
  const clientEvents = Array.isArray(payload.telemetryEvents) ? payload.telemetryEvents : [];
  const engagementFacts = {
    contacts: orgContacts.map((c) => ({
      full_name: c.full_name,
      title: c.title,
      buyer_persona: c.buyer_persona || "Other",
      stage: c.stage,
      aging_days: c.aging_days ?? 0,
      amount_usd: c.amount_usd ?? 0,
      delivery_status: c.delivery_status || "not_sent",
      opened_at: c.opened_at || null,
      replied_at: c.replied_at || null,
      portal_visited: Boolean(c.portal_visited),
      next_step: c.next_step || null
    })),
    supabase_opportunities: liveOpps,
    supabase_email_logs: liveEmailLogs,
    supabase_portal_events: livePortalEvents,
    recent_telemetry_events: clientEvents.slice(0, 8).map((e) => ({
      source: e.source,
      event_type: e.event_type,
      detail: e.detail,
      timestamp: e.timestamp,
      is_bot_scan: Boolean(e.is_bot_scan)
    }))
  };
  const apiKey = process.env.GEMINI_API_KEY || "";
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return {
      ok: false,
      status: 500,
      error: "GEMINI_API_KEY is not configured. Add your Gemini API key in Settings > Secrets to generate Customer Intelligence Dossiers."
    };
  }
  const ai = new GoogleGenAI2({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
  const systemInstruction = `You are Fortifai Scale's Executive Account Intelligence Analyst.
Generate an ultra-concise 6-section enterprise dossier for Fortifai (autonomous zero-egress customer-VPC audit, compliance, and risk AI agents integrating with SAP, Oracle, Coupa, Ariba, and Workday).

STRICT BREVITY & STRUCTURE RULES:
1. Keep the ENTIRE JSON text under 250 words total across all fields.
2. Max 2-3 short bullets per section (each bullet <= 18 words).
3. Do NOT include any 30-day action plan, playbook, or email drafts.
4. Choose primary_wedge_agent strictly from: "Counterpart Risk Monitoring", "ABAC", "Kuber", "Surge", "Aegis", "Crystal", "D7".
5. Buying Committee Map MUST have exactly 4 rows for: "CCO/GC", "CAE", "CFO/CAO", "CPO". Use actual Fortifai Scale contact names & statuses from the provided CRM JSON when present, otherwise "Unidentified (Prospect)".
6. Scale Engagement Pulse MUST use real numbers/dates from the provided CRM telemetry & opportunities JSON (Stage, Days in Stage, Resend opens/replies, overview.fortifai.io visits). Never fabricate CRM activity.
7. Output ONLY a single valid JSON object matching this exact schema (no prose before or after):
{
  "account_snapshot": {
    "revenue": "$XXB FY25",
    "margin": "XX.X% op margin",
    "hq_regions": "City, ST \xB7 Global",
    "icp_score": ${icpScore},
    "target_arr": "${formatCompactUsd(targetArr)}",
    "primary_wedge_agent": "Counterpart Risk Monitoring",
    "why_now_bullets": ["<=18 word thesis bullet 1", "<=18 word thesis bullet 2"]
  },
  "financial_triggers": {
    "bullets": [
      "<=18 word earnings or operating margin pressure trigger",
      "<=18 word 1% addressable spend/leakage recovery benchmark"
    ]
  },
  "regulatory_pressures": {
    "bullets": [
      "<=18 word bullet on DOJ National Fraud Enforcement Division Directive 26-12 tariff/import fraud or FCPA/FCA exposure",
      "<=18 word bullet on SEC/SOX control gaps, DOJ self-disclosure/whistleblower exposure, or recent M&A/litigation fines"
    ]
  },
  "erp_india_gcc": {
    "bullets": [
      "<=18 word bullet on SAP/Oracle/Coupa/Ariba ERP & procurement footprint",
      "<=18 word bullet on India GCC hubs (Bengaluru/Gurugram/Hyderabad/Pune) + zero-egress customer-VPC fit"
    ]
  },
  "buying_committee_map": [
    { "persona": "CCO/GC", "contact_name": "...", "scale_status": "...", "persona_angle": "<=12 words" },
    { "persona": "CAE", "contact_name": "...", "scale_status": "...", "persona_angle": "<=12 words" },
    { "persona": "CFO/CAO", "contact_name": "...", "scale_status": "...", "persona_angle": "<=12 words" },
    { "persona": "CPO", "contact_name": "...", "scale_status": "...", "persona_angle": "<=12 words" }
  ],
  "scale_engagement_pulse": {
    "bullets": [
      "<=18 word bullet with live Deal Stage and Days in Stage",
      "<=18 word bullet with live Resend open/reply status and overview.fortifai.io visits"
    ]
  }
}`;
  const prompt = `Research "${org}" (${industry}, region: ${region}) using Google Search for current FY financial metrics (revenue, margin, HQ), DOJ National Fraud Enforcement Division Directive 26-12 / FCPA / False Claims Act / SEC-SOX / litigation / M&A control pressures, ERP stack (SAP/Oracle/Coupa/Ariba), and India GCC footprint (Bengaluru, Gurugram, Hyderabad, Pune).

Live Fortifai Scale CRM Context for "${org}":
${JSON.stringify(engagementFacts, null, 2)}

Return ONLY the compact JSON object (<250 words total).`;
  try {
    let response;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        response = await ai.models.generateContent({
          model: "gemini-4-hydrogen",
          contents: prompt,
          config: {
            systemInstruction,
            tools: [{ googleSearch: {} }]
          }
        });
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (attempt === 0 && (msg.includes("503") || msg.includes("UNAVAILABLE"))) {
          await new Promise((r) => setTimeout(r, 1200));
          continue;
        }
        throw err;
      }
    }
    const rawText = (response?.text || "").trim();
    const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const jsonCandidate = (fenceMatch ? fenceMatch[1] : rawText).trim();
    const braceStart = jsonCandidate.indexOf("{");
    const braceEnd = jsonCandidate.lastIndexOf("}");
    if (braceStart === -1 || braceEnd <= braceStart) {
      return {
        ok: false,
        status: 502,
        error: "Gemini returned an unexpected non-JSON dossier format. Try Refresh Intelligence."
      };
    }
    const parsed = JSON.parse(jsonCandidate.slice(braceStart, braceEnd + 1));
    const defaultStageSummary = primaryContact ? `Stage: ${primaryContact.stage} (${primaryContact.aging_days ?? 0}d in stage, ${formatCompactUsd(primaryContact.amount_usd)} ARR).` : "No active pipeline stage logged yet.";
    const defaultPulseSummary = primaryContact ? `Resend status: ${(primaryContact.delivery_status || "not_sent").replace(/_/g, " ")}; overview.fortifai.io ${primaryContact.portal_visited ? "visited" : "not yet visited"}.` : "No Resend or overview.fortifai.io activity logged.";
    const personas = [
      "CCO/GC",
      "CAE",
      "CFO/CAO",
      "CPO"
    ];
    const parsedCommittee = Array.isArray(parsed.buying_committee_map) ? parsed.buying_committee_map : [];
    const normalizedCommittee = personas.map((persona) => {
      const found = parsedCommittee.find(
        (r) => String(r?.persona || "").toUpperCase().includes(persona.split("/")[0])
      );
      const crmMatch = orgContacts.find((c) => {
        const bp = (c.buyer_persona || "").toUpperCase();
        return bp.includes(persona.split("/")[0]);
      });
      return {
        persona,
        contact_name: typeof found?.contact_name === "string" && found.contact_name.trim() || crmMatch?.full_name || "Unidentified (Prospect)",
        scale_status: typeof found?.scale_status === "string" && found.scale_status.trim() || (crmMatch ? `${crmMatch.stage} \xB7 ${crmMatch.delivery_status || "not_sent"}` : "Not in Scale"),
        persona_angle: typeof found?.persona_angle === "string" && found.persona_angle.trim() || "Autonomous 100% transaction controls in customer VPC."
      };
    });
    const normalizedPayload = {
      account_snapshot: {
        revenue: String(parsed.account_snapshot?.revenue || "Public / Undisclosed"),
        margin: String(parsed.account_snapshot?.margin || "Monitor filing"),
        hq_regions: String(parsed.account_snapshot?.hq_regions || `${primaryContact?.location || region}`),
        icp_score: Number(parsed.account_snapshot?.icp_score ?? icpScore),
        target_arr: String(parsed.account_snapshot?.target_arr || formatCompactUsd(targetArr)),
        primary_wedge_agent: normalizeWedgeAgent(parsed.account_snapshot?.primary_wedge_agent),
        why_now_bullets: trimBullets(parsed.account_snapshot?.why_now_bullets, 2, [
          `${org} operates high-volume cross-border procurement with material compliance oversight.`,
          `Zero-egress deployment accelerates continuous audit coverage before ${primaryContact?.expected_close || "Q2 2027"}.`
        ])
      },
      financial_triggers: {
        bullets: trimBullets(parsed.financial_triggers?.bullets, 2, [
          "Ongoing operating margin and working-capital efficiency mandates across global business units.",
          "1% addressable indirect/vendor spend leakage recovery benchmark offsets multi-year Fortifai ACV."
        ])
      },
      regulatory_pressures: {
        bullets: trimBullets(parsed.regulatory_pressures?.bullets, 3, [
          "Heightened DOJ Directive 26-12 customs/tariff evasion and FCPA cross-border supply-chain scrutiny.",
          "SOX internal control automation and proactive whistleblower/self-disclosure readiness across subsidiaries."
        ])
      },
      erp_india_gcc: {
        bullets: trimBullets(parsed.erp_india_gcc?.bullets, 2, [
          "Multi-ERP landscape (SAP/Oracle/procurement workflows) creates fragmented manual audit sampling.",
          "India GCC engineering/finance hubs align cleanly with zero-egress customer-VPC agent deployment."
        ])
      },
      buying_committee_map: normalizedCommittee,
      scale_engagement_pulse: {
        bullets: trimBullets(parsed.scale_engagement_pulse?.bullets, 2, [
          defaultStageSummary,
          defaultPulseSummary
        ])
      }
    };
    const rawChunks = response?.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const seenUrls = /* @__PURE__ */ new Set();
    const sources = [];
    if (Array.isArray(rawChunks)) {
      for (const chunk of rawChunks) {
        const web = chunk?.web;
        const safeUri = sanitizeUrl(web?.uri);
        if (!safeUri || seenUrls.has(safeUri)) continue;
        seenUrls.add(safeUri);
        sources.push({
          title: (web?.title || new URL(safeUri).hostname).trim(),
          uri: safeUri
        });
        if (sources.length >= 8) break;
      }
    }
    const generatedAt = (/* @__PURE__ */ new Date()).toISOString();
    const dossierId = `dos_${org.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || crypto.randomUUID().slice(0, 8)}`;
    const dossier = {
      id: dossierId,
      organization: org,
      industry,
      region,
      icp_fit_score: normalizedPayload.account_snapshot.icp_score,
      primary_wedge_product: normalizedPayload.account_snapshot.primary_wedge_agent,
      dossier_json: normalizedPayload,
      sources,
      generated_by: generatedByEmail,
      generated_at: generatedAt,
      word_count: countWords(normalizedPayload)
    };
    if (supabaseAdmin) {
      try {
        await supabaseAdmin.from("account_dossiers").upsert(
          {
            id: dossier.id,
            organization: dossier.organization,
            industry: dossier.industry,
            region: dossier.region,
            icp_fit_score: dossier.icp_fit_score,
            primary_wedge_product: dossier.primary_wedge_product,
            dossier_json: dossier.dossier_json,
            sources: dossier.sources,
            generated_by: dossier.generated_by,
            generated_at: dossier.generated_at
          },
          { onConflict: "id" }
        );
      } catch {
      }
    }
    return { ok: true, cached: false, dossier };
  } catch (err) {
    let rawMsg = err instanceof Error ? err.message : "Failed to generate customer intelligence dossier.";
    let status = 500;
    try {
      const parsedErr = JSON.parse(rawMsg);
      if (parsedErr?.error?.message) {
        rawMsg = parsedErr.error.message;
        if (typeof parsedErr.error.code === "number") status = parsedErr.error.code;
      }
    } catch {
    }
    return { ok: false, status, error: rawMsg };
  }
}

// vercel_api_entry.ts
function resolveValidSupabaseUrl(...candidates) {
  for (const raw of candidates) {
    const cleaned = String(raw || "").trim().replace(/^['"]|['"]$/g, "");
    if (!cleaned) continue;
    const withProto = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;
    try {
      const parsed = new URL(withProto);
      if (parsed.hostname.includes(".")) return parsed.origin;
    } catch {
    }
  }
  return "https://xwigfdsvknsgnlrbfshs.supabase.co";
}
function getSupabaseAdmin() {
  const url = resolveValidSupabaseUrl(process.env.SUPABASE_URL, process.env.VITE_SUPABASE_URL);
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim().replace(/^['"]|['"]$/g, "");
  if (!key) return null;
  return _createSbAdminClient(url, key, { auth: { persistSession: false } });
}
dotenv.config();
var PORT = Number(process.env.PORT || 3e3);
var SESSION_SECRET = process.env.SESSION_SECRET || crypto2.createHash("sha256").update(
  (process.env.SUPABASE_SERVICE_ROLE_KEY || "") + ":" + (process.env.RESEND_API_KEY || "") + ":fortifai-scale-v2"
).digest("hex");
var ALLOWED_EMAIL_DOMAINS = ["@fortifai.io", "@tryfortifai.us"];
var ALLOWED_PORTALS = /* @__PURE__ */ new Set(["investor.fortifai.io", "overview.fortifai.io"]);
var ALLOWED_PORTAL_EVENTS = /* @__PURE__ */ new Set([
  "visit",
  "deck_opened",
  "financials_viewed",
  "callback_requested",
  "safe_generated",
  "pass_submitted",
  "agent_explored"
]);
var SERVER_ROLE_PRESETS = {
  super_admin: {
    can_view_customers: true,
    can_edit_customers: true,
    can_view_investors: true,
    can_edit_investors: true,
    can_send_campaigns: true,
    can_send_as_marketing: true,
    can_manage_schema: true,
    can_manage_users: true
  },
  admin: {
    can_view_customers: true,
    can_edit_customers: true,
    can_view_investors: true,
    can_edit_investors: true,
    can_send_campaigns: true,
    can_send_as_marketing: true,
    can_manage_schema: true,
    can_manage_users: true
  },
  marketing: {
    can_view_customers: true,
    can_edit_customers: false,
    can_view_investors: false,
    can_edit_investors: false,
    can_send_campaigns: true,
    can_send_as_marketing: true,
    can_manage_schema: false,
    can_manage_users: false
  },
  sales_lead: {
    can_view_customers: true,
    can_edit_customers: true,
    can_view_investors: false,
    can_edit_investors: false,
    can_send_campaigns: true,
    can_send_as_marketing: false,
    can_manage_schema: true,
    can_manage_users: false
  },
  investor_relations: {
    can_view_customers: false,
    can_edit_customers: false,
    can_view_investors: true,
    can_edit_investors: true,
    can_send_campaigns: true,
    can_send_as_marketing: false,
    can_manage_schema: false,
    can_manage_users: false
  },
  analyst_viewer: {
    can_view_customers: true,
    can_edit_customers: false,
    can_view_investors: true,
    can_edit_investors: false,
    can_send_campaigns: false,
    can_send_as_marketing: false,
    can_manage_schema: false,
    can_manage_users: false
  }
};
function intersectSessionPermissions(a, b) {
  return {
    can_view_customers: Boolean(a.can_view_customers && b.can_view_customers),
    can_edit_customers: Boolean(a.can_edit_customers && b.can_edit_customers),
    can_view_investors: Boolean(a.can_view_investors && b.can_view_investors),
    can_edit_investors: Boolean(a.can_edit_investors && b.can_edit_investors),
    can_send_campaigns: Boolean(a.can_send_campaigns && b.can_send_campaigns),
    can_send_as_marketing: Boolean(a.can_send_as_marketing && b.can_send_as_marketing),
    can_manage_schema: Boolean(a.can_manage_schema && b.can_manage_schema),
    can_manage_users: Boolean(a.can_manage_users && b.can_manage_users)
  };
}
function isAllowedDomainEmail(email) {
  const lower = email.trim().toLowerCase();
  return ALLOWED_EMAIL_DOMAINS.some((domain) => lower.endsWith(domain));
}
function isFortifaiInternalEmail(email) {
  return email.trim().toLowerCase().endsWith("@fortifai.io");
}
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
function containsHeaderInjection(value) {
  return /[\r\n]/.test(value);
}
function extractEmailAddress(header) {
  const trimmed = header.trim();
  const angleMatch = trimmed.match(/<([^<>]+)>/);
  return (angleMatch ? angleMatch[1] : trimmed).trim().toLowerCase();
}
function escapeHtml(raw) {
  return raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function signSessionToken(claims) {
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const sig = crypto2.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}
function verifySessionToken(token) {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = crypto2.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto2.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!parsed.exp || parsed.exp < Date.now()) return null;
    if (!parsed.email || !isAllowedDomainEmail(parsed.email)) return null;
    return parsed;
  } catch {
    return null;
  }
}
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    res.status(401).json({ ok: false, error: "Missing Bearer session token." });
    return;
  }
  const claims = verifySessionToken(authHeader.slice(7).trim());
  if (!claims) {
    res.status(401).json({ ok: false, error: "Invalid or expired session token." });
    return;
  }
  req.session = claims;
  next();
}
function verifyWebhookSecretHeader(req) {
  const webhookSecret = (process.env.RESEND_WEBHOOK_SECRET || "").trim();
  if (!webhookSecret) return false;
  const providedSecret = req.headers["x-webhook-secret"];
  if (typeof providedSecret === "string" && providedSecret.length === webhookSecret.length) {
    return crypto2.timingSafeEqual(Buffer.from(providedSecret), Buffer.from(webhookSecret));
  }
  return false;
}
function requireAuthOrWebhookSecret(req, res, next) {
  if (verifyWebhookSecretHeader(req)) {
    next();
    return;
  }
  requireAuth(req, res, next);
}
function verifyResendSvixSignature(req, rawBody) {
  const secret = (process.env.RESEND_WEBHOOK_SECRET || "").trim();
  if (!secret) return true;
  if (verifyWebhookSecretHeader(req)) return true;
  const svixId = req.headers["svix-id"];
  const svixTimestamp = req.headers["svix-timestamp"];
  const svixSignature = req.headers["svix-signature"];
  if (typeof svixId !== "string" || typeof svixTimestamp !== "string" || typeof svixSignature !== "string") {
    return false;
  }
  const secretBytes = secret.startsWith("whsec_") ? Buffer.from(secret.slice(6), "base64") : Buffer.from(secret, "utf8");
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expectedSig = crypto2.createHmac("sha256", secretBytes).update(signedContent).digest("base64");
  const signatures = svixSignature.split(" ").map((part) => {
    const [, v] = part.split(",");
    return v || part;
  });
  return signatures.some((sig) => {
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    return a.length === b.length && crypto2.timingSafeEqual(a, b);
  });
}
var FALLBACK_CRM_USERS = {
  "varun@fortifai.io": { id: "usr_varun", email: "varun@fortifai.io", full_name: "Varun Mowar", role: "super_admin", is_active: true }
};
var app = express();
app.use((req, _res, next) => {
  if (req.url && !req.url.startsWith("/api")) {
    req.url = "/api" + (req.url.startsWith("/") ? "" : "/") + req.url;
  }
  next();
});
app.use(
  express.json({
    limit: "5mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString("utf8");
    }
  })
);
app.get("/api/config-status", (_req, res) => {
  const key = process.env.RESEND_API_KEY || "";
  const resendConfigured = Boolean(key && key !== "MY_RESEND_API_KEY");
  const geminiKey = process.env.GEMINI_API_KEY || "";
  const geminiConfigured = Boolean(geminiKey && geminiKey !== "MY_GEMINI_API_KEY");
  const supabaseServerConfigured = isServiceSupabaseConfigured();
  res.json({ ok: true, resendConfigured, geminiConfigured, supabaseServerConfigured });
});
function hashPasswordScrypt(plainPassword) {
  const salt = crypto2.randomBytes(16).toString("hex");
  const derived = crypto2.scryptSync(plainPassword, salt, 64).toString("hex");
  return `scrypt:${salt}:${derived}`;
}
function verifyPasswordScrypt(plainPassword, storedHash) {
  if (!storedHash || !storedHash.startsWith("scrypt:")) return false;
  const parts = storedHash.split(":");
  if (parts.length !== 3) return false;
  const [, salt, keyHex] = parts;
  const keyBuf = Buffer.from(keyHex, "hex");
  const derivedBuf = crypto2.scryptSync(plainPassword, salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return crypto2.timingSafeEqual(keyBuf, derivedBuf);
}
app.post("/api/auth/login", async (req, res) => {
  try {
    const body = req.body || {};
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !isValidEmail(email) || !isAllowedDomainEmail(email)) {
      return res.status(403).json({
        ok: false,
        error: "Access restricted to @fortifai.io or @tryfortifai.us accounts."
      });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({
        ok: false,
        error: "Enter your workspace password (minimum 6 characters)."
      });
    }
    let dbUser = null;
    try {
      dbUser = await Promise.race([
        fetchCrmUserByEmail(email),
        new Promise((resolve) => setTimeout(() => resolve(null), 2500))
      ]);
    } catch {
      dbUser = null;
    }
    if (!dbUser && FALLBACK_CRM_USERS[email]) {
      dbUser = FALLBACK_CRM_USERS[email];
    }
    if (!dbUser) {
      return res.status(403).json({
        ok: false,
        error: `Account "${email}" is not provisioned in crm_users.`
      });
    }
    if (dbUser.is_active === false) {
      return res.status(403).json({
        ok: false,
        error: `Account "${email}" has been deactivated.`
      });
    }
    const storedHash = typeof dbUser.password_hash === "string" ? String(dbUser.password_hash) : "";
    const bootstrapPassword = process.env.SCALE_ADMIN_PASSWORD || process.env.RESEND_WEBHOOK_SECRET || "FortifaiScale2026!";
    let passwordValid = false;
    const supabaseAdmin = getSupabaseAdmin();
    const envAdminPw = String(process.env.SCALE_ADMIN_PASSWORD || "").trim();
    if (email === "varun@fortifai.io" && envAdminPw && password.trim() === envAdminPw) {
      passwordValid = true;
    } else if (storedHash) {
      passwordValid = verifyPasswordScrypt(password, storedHash);
    } else if (password.trim() === bootstrapPassword.trim()) {
      passwordValid = true;
      if (supabaseAdmin) {
        const initialHash = hashPasswordScrypt(password);
        void Promise.race([
          supabaseAdmin.from("crm_users").update({ password_hash: initialHash, last_login_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("email", email),
          new Promise((r) => setTimeout(r, 1500))
        ]).catch(() => {
        });
      }
    }
    if (!passwordValid) {
      return res.status(401).json({
        ok: false,
        error: "Invalid email or password."
      });
    }
    if (supabaseAdmin && storedHash) {
      void Promise.race([
        supabaseAdmin.from("crm_users").update({ last_login_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("email", email),
        new Promise((r) => setTimeout(r, 1500))
      ]).catch(() => {
      });
    }
    const role = typeof dbUser.role === "string" && SERVER_ROLE_PRESETS[dbUser.role] ? dbUser.role : "analyst_viewer";
    const permissions = {
      ...SERVER_ROLE_PRESETS[role],
      ...dbUser.permissions || {}
    };
    const claims = {
      email,
      role,
      permissions,
      exp: Date.now() + 12 * 60 * 60 * 1e3
    };
    const token = signSessionToken(claims);
    return res.status(200).json({
      ok: true,
      token,
      user: {
        id: dbUser.id || `usr_${email}`,
        email,
        full_name: dbUser.full_name || email.split("@")[0],
        sender_display_name: dbUser.sender_display_name || dbUser.full_name || email.split("@")[0],
        role,
        permissions,
        is_active: true
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Authentication error";
    return res.status(500).json({ ok: false, error: msg });
  }
});
app.post("/api/admin/send-invite", async (req, res) => {
  try {
    const authHeader = String(req.headers.authorization || "");
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    const caller = verifySessionToken(bearer);
    if (!caller || caller.role !== "super_admin") {
      return res.status(403).json({ ok: false, error: "Only super_admin can send workspace invites." });
    }
    const body = req.body || {};
    const email = String(body.email || "").trim().toLowerCase();
    const fullName = String(body.full_name || email.split("@")[0]).trim();
    const role = String(body.role || "sales_lead").trim();
    const initialPassword = String(body.initialPassword || "").trim();
    if (!email || !isAllowedDomainEmail(email)) {
      return res.status(400).json({ ok: false, error: "Valid @fortifai.io or @tryfortifai.us email required." });
    }
    const sbAdmin = getSupabaseAdmin();
    if (sbAdmin) {
      const upsertRow = {
        email,
        full_name: fullName,
        sender_display_name: fullName,
        role,
        is_active: true
      };
      if (body.permissions) upsertRow.permissions = body.permissions;
      if (initialPassword.length >= 8) {
        upsertRow.password_hash = hashPasswordScrypt(initialPassword);
      }
      await sbAdmin.from("crm_users").upsert(upsertRow, { onConflict: "email" });
    }
    const inviteClaims = {
      email,
      role,
      permissions: {
        ...SERVER_ROLE_PRESETS[role] || SERVER_ROLE_PRESETS.sales_lead,
        ...body.permissions || {}
      },
      exp: Date.now() + 7 * 24 * 60 * 60 * 1e3
    };
    const inviteToken = signSessionToken(inviteClaims);
    const baseUrl = (process.env.APP_URL || "https://scale.fortifai.io").trim().replace(/\/+$/, "");
    const setupLink = `${baseUrl}/?inviteToken=${encodeURIComponent(inviteToken)}&email=${encodeURIComponent(email)}`;
    const resendKey = (process.env.RESEND_API_KEY || "").trim();
    if (!resendKey || resendKey === "MY_RESEND_API_KEY") {
      return res.status(200).json({ ok: true, mode: "skipped_no_resend_key", setupLink });
    }
    const textBody = [
      `Hi ${fullName},`,
      "",
      `You have been invited to Fortifai Scale (${role}) by ${caller.email}.`,
      "",
      "Click the secure link below to set your personal workspace password and sign in (link valid for 7 days):",
      setupLink,
      "",
      `Workspace URL: ${baseUrl}`,
      `Login Email: ${email}`,
      ...initialPassword ? [`Temporary Password (optional): ${initialPassword}`] : [],
      "",
      "Best,",
      "Fortifai Support"
    ].join("\n");
    const resendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "Fortifai Support <support@fortifai.io>",
        reply_to: "varun@fortifai.io",
        to: [email],
        subject: "You're invited to Fortifai Scale \u2014 Set Your Password",
        text: textBody
      })
    });
    const resendJson = await resendResp.json().catch(() => ({}));
    if (!resendResp.ok) {
      return res.status(502).json({
        ok: false,
        error: resendJson.message || "Resend failed to deliver invite."
      });
    }
    return res.status(200).json({ ok: true, id: resendJson.id, setupLink });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invite dispatch error";
    return res.status(500).json({ ok: false, error: msg });
  }
});
app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const email = String((req.body || {}).email || "").trim().toLowerCase();
    if (!email || !isValidEmail(email) || !isAllowedDomainEmail(email)) {
      return res.status(400).json({
        ok: false,
        error: "Enter a valid @fortifai.io or @tryfortifai.us workspace email."
      });
    }
    let dbUser = null;
    try {
      dbUser = await Promise.race([
        fetchCrmUserByEmail(email),
        new Promise((resolve) => setTimeout(() => resolve(null), 2500))
      ]);
    } catch {
      dbUser = null;
    }
    if (!dbUser && FALLBACK_CRM_USERS[email]) {
      dbUser = FALLBACK_CRM_USERS[email];
    }
    if (!dbUser || dbUser.is_active === false) {
      return res.status(403).json({
        ok: false,
        error: `"${email}" is not an active provisioned user in Fortifai Scale. Ask varun@fortifai.io to invite this email first.`
      });
    }
    const role = typeof dbUser.role === "string" && SERVER_ROLE_PRESETS[dbUser.role] ? dbUser.role : "analyst_viewer";
    const permissions = {
      ...SERVER_ROLE_PRESETS[role],
      ...dbUser.permissions || {}
    };
    const resetClaims = {
      email,
      role,
      permissions,
      exp: Date.now() + 60 * 60 * 1e3
      // 1 hour validity
    };
    const resetToken = signSessionToken(resetClaims);
    const baseUrl = (process.env.APP_URL || "https://scale.fortifai.io").trim().replace(/\/+$/, "");
    const setupLink = `${baseUrl}/?inviteToken=${encodeURIComponent(resetToken)}&email=${encodeURIComponent(email)}`;
    const resendKey = (process.env.RESEND_API_KEY || "").trim();
    if (!resendKey || resendKey === "MY_RESEND_API_KEY") {
      return res.status(500).json({
        ok: false,
        error: "RESEND_API_KEY is not configured on the server to send password reset emails."
      });
    }
    const resendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "Fortifai Support <support@fortifai.io>",
        reply_to: "varun@fortifai.io",
        to: [email],
        subject: "Fortifai Scale \u2014 Set or Reset Your Password",
        text: [
          `Hi ${dbUser.full_name || email.split("@")[0]},`,
          "",
          "Click the secure link below to set or reset your Fortifai Scale password (valid for 60 minutes):",
          setupLink,
          "",
          "If you did not request this, you can safely ignore this email.",
          "",
          "\u2014 Fortifai Support"
        ].join("\n")
      })
    });
    const resendJson = await resendResp.json().catch(() => ({}));
    if (!resendResp.ok) {
      return res.status(502).json({
        ok: false,
        error: resendJson.message || "Failed to send password setup email via Resend."
      });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Password reset request failed";
    return res.status(500).json({ ok: false, error: msg });
  }
});
app.post("/api/auth/accept-invite", async (req, res) => {
  try {
    const body = req.body || {};
    const inviteToken = String(body.inviteToken || "").trim();
    const newPassword = String(body.newPassword || "");
    const claims = verifySessionToken(inviteToken);
    if (!claims || !isAllowedDomainEmail(claims.email)) {
      return res.status(401).json({
        ok: false,
        error: "This invitation link is invalid or expired. Ask Varun to click Resend Invite."
      });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({
        ok: false,
        error: "Choose a password with at least 8 characters."
      });
    }
    const newHash = hashPasswordScrypt(newPassword);
    const sbAdmin = getSupabaseAdmin();
    let dbUser = null;
    if (sbAdmin) {
      const { data } = await sbAdmin.from("crm_users").upsert(
        {
          email: claims.email,
          full_name: claims.email.split("@")[0],
          sender_display_name: claims.email.split("@")[0],
          role: claims.role,
          permissions: claims.permissions,
          is_active: true,
          password_hash: newHash,
          last_login_at: (/* @__PURE__ */ new Date()).toISOString()
        },
        { onConflict: "email" }
      ).select("*").single();
      dbUser = data || null;
    }
    const sessionClaims = {
      email: claims.email,
      role: claims.role,
      permissions: claims.permissions,
      exp: Date.now() + 12 * 60 * 60 * 1e3
    };
    const token = signSessionToken(sessionClaims);
    return res.status(200).json({
      ok: true,
      token,
      user: {
        id: dbUser?.id || `usr_${claims.email}`,
        email: claims.email,
        full_name: dbUser?.full_name || claims.email.split("@")[0],
        sender_display_name: dbUser?.sender_display_name || dbUser?.full_name || claims.email.split("@")[0],
        role: claims.role,
        permissions: claims.permissions,
        is_active: true
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to complete invite setup";
    return res.status(500).json({ ok: false, error: msg });
  }
});
app.post("/api/admin/purge-stale-users", async (req, res) => {
  try {
    const authHeader = String(req.headers.authorization || "");
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    const caller = verifySessionToken(bearer);
    if (!caller || caller.role !== "super_admin") {
      return res.status(403).json({ ok: false, error: "Only super_admin can purge users." });
    }
    const keepOnlyVarun = Boolean((req.body || {}).keepOnlyVarun);
    const staleEmails = [
      "mike@fortifai.io",
      "dave@fortifai.io",
      "arun@fortifai.io",
      "chandra@fortifai.io",
      "alex@fortifai.io",
      "sarah@fortifai.io"
    ];
    const sbAdmin = getSupabaseAdmin();
    if (sbAdmin) {
      if (keepOnlyVarun) {
        try {
          await sbAdmin.from("opportunities").update({ owner_id: null, owner_email: "varun@fortifai.io" }).neq("owner_email", "varun@fortifai.io");
        } catch {
        }
        await sbAdmin.from("crm_users").delete().neq("email", "varun@fortifai.io");
      } else {
        try {
          await sbAdmin.from("opportunities").update({ owner_id: null, owner_email: "varun@fortifai.io" }).in("owner_email", staleEmails);
        } catch {
        }
        await sbAdmin.from("crm_users").delete().in("email", staleEmails);
      }
    }
    return res.status(200).json({ ok: true, keepOnlyVarun });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Purge failed";
    return res.status(500).json({ ok: false, error: msg });
  }
});
app.post("/api/admin/delete-user", async (req, res) => {
  try {
    const authHeader = String(req.headers.authorization || "");
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    const caller = verifySessionToken(bearer);
    if (!caller || caller.role !== "super_admin") {
      return res.status(403).json({ ok: false, error: "Only super_admin can remove users." });
    }
    const email = String((req.body || {}).email || "").trim().toLowerCase();
    if (!email || email === "varun@fortifai.io") {
      return res.status(400).json({ ok: false, error: "Primary super_admin cannot be deleted." });
    }
    const sbAdmin = getSupabaseAdmin();
    if (sbAdmin) {
      try {
        await sbAdmin.from("opportunities").update({ owner_id: null, owner_email: "varun@fortifai.io" }).eq("owner_email", email);
      } catch {
      }
      await sbAdmin.from("crm_users").delete().eq("email", email);
    }
    return res.status(200).json({ ok: true, email });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Delete user failed";
    return res.status(500).json({ ok: false, error: msg });
  }
});
app.post("/api/auth/set-password", async (req, res) => {
  try {
    const authHeader = String(req.headers.authorization || "");
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    const caller = verifySessionToken(bearer);
    if (!caller) {
      return res.status(401).json({ ok: false, error: "Valid session required." });
    }
    const body = req.body || {};
    const targetEmail = String(body.targetEmail || caller.email).trim().toLowerCase();
    const newPassword = String(body.newPassword || "");
    if (targetEmail !== caller.email && caller.role !== "super_admin") {
      return res.status(403).json({
        ok: false,
        error: "Only super_admin can reset another user's password."
      });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({
        ok: false,
        error: "Password must be at least 8 characters long."
      });
    }
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_SERVICE_ROLE_KEY is required on the server to store password hashes."
      });
    }
    const newHash = hashPasswordScrypt(newPassword);
    const { error } = await supabaseAdmin.from("crm_users").update({ password_hash: newHash }).eq("email", targetEmail);
    if (error) {
      return res.status(500).json({
        ok: false,
        error: `Failed to save password_hash (ensure password_hash text column exists on crm_users): ${error.message}`
      });
    }
    return res.status(200).json({ ok: true, targetEmail });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Password update failed";
    return res.status(500).json({ ok: false, error: msg });
  }
});
app.post("/api/auth/session", async (req, res) => {
  const body = req.body || {};
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !isValidEmail(email) || !isAllowedDomainEmail(email)) {
    res.status(403).json({
      ok: false,
      error: "Access restricted to authenticated @fortifai.io or @tryfortifai.us accounts."
    });
    return;
  }
  let dbUser = null;
  try {
    dbUser = await Promise.race([
      fetchCrmUserByEmail(email),
      new Promise((resolve) => setTimeout(() => resolve(null), 2500))
    ]);
  } catch {
    dbUser = null;
  }
  if (!dbUser && FALLBACK_CRM_USERS[email]) {
    dbUser = FALLBACK_CRM_USERS[email];
  }
  if (dbUser && !dbUser.is_active) {
    res.status(403).json({
      ok: false,
      error: "This user account is deactivated in crm_users."
    });
    return;
  }
  if (body.is_active === false) {
    res.status(403).json({
      ok: false,
      error: "This user account is deactivated in crm_users."
    });
    return;
  }
  const baseRole = dbUser?.role || (typeof body.role === "string" ? body.role : "analyst_viewer");
  const sourcePerms = dbUser?.permissions || body.permissions;
  const basePermissions = {
    can_view_customers: Boolean(sourcePerms?.can_view_customers),
    can_edit_customers: Boolean(sourcePerms?.can_edit_customers),
    can_view_investors: Boolean(sourcePerms?.can_view_investors),
    can_edit_investors: Boolean(sourcePerms?.can_edit_investors),
    can_send_campaigns: Boolean(sourcePerms?.can_send_campaigns),
    can_send_as_marketing: Boolean(sourcePerms?.can_send_as_marketing) || ["super_admin", "admin", "marketing"].includes(baseRole),
    can_manage_schema: Boolean(sourcePerms?.can_manage_schema),
    can_manage_users: Boolean(sourcePerms?.can_manage_users)
  };
  let finalRole = baseRole;
  let finalPermissions = basePermissions;
  let simulated = false;
  const requestedSimRole = typeof body.simulateRole === "string" ? body.simulateRole.trim() : "";
  if (requestedSimRole && basePermissions.can_manage_users && SERVER_ROLE_PRESETS[requestedSimRole]) {
    simulated = true;
    finalRole = requestedSimRole;
    const preset = SERVER_ROLE_PRESETS[requestedSimRole];
    const requestedSimPerms = body.simulatePermissions ? {
      can_view_customers: Boolean(body.simulatePermissions.can_view_customers),
      can_edit_customers: Boolean(body.simulatePermissions.can_edit_customers),
      can_view_investors: Boolean(body.simulatePermissions.can_view_investors),
      can_edit_investors: Boolean(body.simulatePermissions.can_edit_investors),
      can_send_campaigns: Boolean(body.simulatePermissions.can_send_campaigns),
      can_send_as_marketing: Boolean(body.simulatePermissions.can_send_as_marketing),
      can_manage_schema: Boolean(body.simulatePermissions.can_manage_schema),
      can_manage_users: Boolean(body.simulatePermissions.can_manage_users)
    } : preset;
    finalPermissions = intersectSessionPermissions(basePermissions, requestedSimPerms);
  }
  const claims = {
    email,
    role: finalRole,
    permissions: finalPermissions,
    ...simulated ? { simulated: true } : {},
    exp: Date.now() + 1e3 * 60 * 60 * 12
  };
  const token = signSessionToken(claims);
  res.json({ ok: true, token, claims });
});
app.post("/api/send-batch", requireAuth, async (req, res) => {
  const dbSender = req.session?.email ? await fetchCrmUserByEmail(req.session.email) : null;
  if (dbSender && !dbSender.is_active) {
    res.status(403).json({ ok: false, error: "Account is deactivated in crm_users." });
    return;
  }
  const sessionPerms = req.session?.permissions;
  const isSimulatedAdminSession = Boolean(req.session?.simulated) && Boolean(dbSender?.permissions?.can_manage_users);
  const effectivePerms = dbSender ? isSimulatedAdminSession && sessionPerms ? intersectSessionPermissions(dbSender.permissions, sessionPerms) : dbSender.permissions : sessionPerms || SERVER_ROLE_PRESETS.analyst_viewer;
  const effectiveCanSend = effectivePerms.can_send_campaigns;
  const effectiveRole = isSimulatedAdminSession ? req.session?.role || "analyst_viewer" : dbSender?.role || req.session?.role || "analyst_viewer";
  const effectiveCanSendAsMarketing = ["super_admin", "admin", "marketing"].includes(effectiveRole) || Boolean(effectivePerms.can_send_as_marketing);
  const effectiveCanViewCustomers = effectivePerms.can_view_customers;
  const effectiveCanViewInvestors = effectivePerms.can_view_investors;
  if (!effectiveCanSend) {
    res.status(403).json({
      ok: false,
      error: "Permission denied: can_send_campaigns is required to dispatch campaigns."
    });
    return;
  }
  const payload = req.body || {};
  const isTestMode = payload.testMode === true;
  const audienceType = payload.audienceType === "investor" ? "investor" : "customer";
  const portalLinkMode = payload.portalLinkMode === "overview" || payload.portalLinkMode === "investor" ? payload.portalLinkMode : "none";
  if (audienceType === "customer" && portalLinkMode === "investor") {
    res.status(403).json({
      ok: false,
      error: "Domain isolation violation: Investor Portal links cannot be attached to Customer Outreach."
    });
    return;
  }
  if (audienceType === "investor" && portalLinkMode === "overview") {
    res.status(403).json({
      ok: false,
      error: "Domain isolation violation: Product Overview links cannot be attached to Investor Outreach."
    });
    return;
  }
  if (audienceType === "investor" && !effectiveCanViewInvestors) {
    res.status(403).json({
      ok: false,
      error: "Permission denied: can_view_investors is required for Investor Outreach."
    });
    return;
  }
  if (audienceType === "customer" && !effectiveCanViewCustomers) {
    res.status(403).json({
      ok: false,
      error: "Permission denied: can_view_customers is required for Customer Outreach."
    });
    return;
  }
  const recipients = Array.isArray(payload.recipients) ? payload.recipients : [];
  if (recipients.length === 0) {
    res.status(400).json({ ok: false, error: "At least one recipient is required." });
    return;
  }
  const bcc = typeof payload.bcc === "string" && payload.bcc.trim() ? payload.bcc.trim() : void 0;
  if (bcc && (!isValidEmail(bcc) || containsHeaderInjection(bcc))) {
    res.status(400).json({ ok: false, error: "Invalid BCC email address." });
    return;
  }
  const explicitReplyTo = typeof payload.replyTo === "string" && payload.replyTo.trim() ? payload.replyTo.trim() : void 0;
  if (explicitReplyTo && (!isValidEmail(explicitReplyTo) || containsHeaderInjection(explicitReplyTo))) {
    res.status(400).json({ ok: false, error: "Invalid Reply-To email address." });
    return;
  }
  const defaultFrom = typeof payload.from === "string" && payload.from.trim() ? payload.from.trim() : `${req.session.email}`;
  const senderMode = payload.senderMode === "deal_owner" ? "deal_owner" : "selected";
  const resolvedRecipients = [];
  for (const r of recipients) {
    if (!r.email || !isValidEmail(r.email) || !r.subject || !r.text) {
      res.status(400).json({
        ok: false,
        error: `Invalid recipient payload for ${r.name || "unknown contact"}.`
      });
      return;
    }
    const rawFrom = senderMode === "deal_owner" && typeof r.from === "string" && r.from.trim() ? r.from.trim() : defaultFrom;
    if (containsHeaderInjection(rawFrom) || containsHeaderInjection(r.subject)) {
      res.status(400).json({
        ok: false,
        error: "Invalid characters in email header."
      });
      return;
    }
    const senderEmail = extractEmailAddress(rawFrom);
    if (!isValidEmail(senderEmail)) {
      res.status(400).json({
        ok: false,
        error: `Invalid Send From email address: "${rawFrom}".`
      });
      return;
    }
    if (senderEmail === "contact@fortifai.io") {
      if (!effectiveCanSendAsMarketing) {
        res.status(403).json({
          ok: false,
          error: "Permission denied: super_admin, admin, marketing role or can_send_as_marketing permission is required to send from contact@fortifai.io."
        });
        return;
      }
    } else {
      if (!isAllowedDomainEmail(senderEmail)) {
        res.status(403).json({
          ok: false,
          error: "Send From identity must use an @fortifai.io or @tryfortifai.us domain."
        });
        return;
      }
      if (senderEmail !== req.session.email.toLowerCase() && senderMode !== "deal_owner" && !["super_admin", "admin"].includes(effectiveRole)) {
        res.status(403).json({
          ok: false,
          error: "Permission denied: you may only send from your own workspace address unless Deal Owner batch routing is enabled."
        });
        return;
      }
    }
    const replyToEmail = explicitReplyTo || (senderEmail === "contact@fortifai.io" ? req.session.email : senderEmail);
    resolvedRecipients.push({
      id: r.id,
      email: r.email,
      name: r.name,
      subject: r.subject,
      text: r.text,
      fromHeader: rawFrom,
      senderEmail,
      replyToEmail
    });
  }
  if (isTestMode && resolvedRecipients.length > 5) {
    res.status(400).json({
      ok: false,
      error: "Test Send Guard: test batches are capped at 5 recipients."
    });
    return;
  }
  if (isTestMode) {
    const nonFortifaiTarget = resolvedRecipients.find((r) => !isFortifaiInternalEmail(r.email));
    if (nonFortifaiTarget) {
      res.status(403).json({
        ok: false,
        safeModeBlocked: true,
        error: `Test Send Guard: test emails may only ever be sent to @fortifai.io addresses (blocked "${nonFortifaiTarget.email}").`
      });
      return;
    }
  }
  const resendKey = process.env.RESEND_API_KEY || "";
  const hasLiveResend = Boolean(resendKey && resendKey !== "MY_RESEND_API_KEY");
  const supabaseAdmin = getServiceSupabaseClient();
  const verifiedLiveExternalIds = /* @__PURE__ */ new Set();
  const blockedReasons = /* @__PURE__ */ new Map();
  if (!isTestMode) {
    const externalRecipients = resolvedRecipients.filter(
      (r) => !isFortifaiInternalEmail(r.email)
    );
    if (supabaseAdmin) {
      try {
        const allIds = resolvedRecipients.map((r) => r.id).filter(Boolean);
        const { data: contactRows, error: contactsQueryErr } = allIds.length > 0 ? await supabaseAdmin.from("contacts").select("id, email, contact_type, is_demo").in("id", allIds) : { data: [], error: null };
        if (contactsQueryErr) {
          for (const ext of externalRecipients) {
            blockedReasons.set(
              ext.id,
              `Safe Mode Guard: unable to verify live Supabase contacts.is_demo = false (${contactsQueryErr.message}).`
            );
          }
        } else {
          const rowById = new Map(
            (contactRows || []).map((row) => [String(row.id), row])
          );
          for (const r of resolvedRecipients) {
            const row = rowById.get(r.id);
            if (row && row.contact_type && row.contact_type !== audienceType) {
              res.status(403).json({
                ok: false,
                error: `Domain isolation violation: recipient "${row.id}" does not belong to the ${audienceType} domain.`
              });
              return;
            }
            if (!isFortifaiInternalEmail(r.email)) {
              if (!row) {
                blockedReasons.set(
                  r.id,
                  `Safe Mode Guard: "${r.email}" does not exist in live Supabase contacts table.`
                );
              } else if (String(row.email || "").trim().toLowerCase() !== r.email.trim().toLowerCase()) {
                blockedReasons.set(
                  r.id,
                  `Safe Mode Guard: recipient email "${r.email}" does not match live Supabase contact record.`
                );
              } else if (row.is_demo !== false) {
                blockedReasons.set(
                  r.id,
                  `Safe Mode Guard: external domain send to "${r.email}" blocked (requires is_demo = false in live Supabase contacts).`
                );
              } else {
                verifiedLiveExternalIds.add(r.id);
              }
            }
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Supabase lookup failed";
        for (const ext of externalRecipients) {
          blockedReasons.set(
            ext.id,
            `Safe Mode Guard: live Supabase verification failed (${msg}).`
          );
        }
      }
    } else {
      for (const ext of externalRecipients) {
        blockedReasons.set(
          ext.id,
          `Safe Mode Guard: external domain send to "${ext.email}" blocked because live Supabase contacts verification (is_demo = false) is not connected.`
        );
      }
    }
  }
  const eligibleForDispatch = resolvedRecipients.filter((r) => !blockedReasons.has(r.id));
  if (!isTestMode && eligibleForDispatch.length === 0) {
    const blockedResults = resolvedRecipients.map((r) => ({
      contact_id: r.id,
      email: r.email,
      from: r.fromHeader,
      status: "blocked",
      error: blockedReasons.get(r.id) || "Safe Mode Guard: external domain blocked (requires live Supabase contacts row with is_demo = false)."
    }));
    res.status(403).json({
      ok: false,
      safeModeBlocked: true,
      error: blockedResults[0]?.error,
      blockedCount: blockedResults.length,
      results: blockedResults
    });
    return;
  }
  const campaignId = isTestMode ? null : `cmp_${crypto2.randomUUID().slice(0, 10)}`;
  const sentAtIso = (/* @__PURE__ */ new Date()).toISOString();
  if (!isTestMode && supabaseAdmin && campaignId) {
    try {
      await supabaseAdmin.from("campaigns").insert({
        id: campaignId,
        audience_type: audienceType,
        subject: eligibleForDispatch[0]?.subject || "Fortifai Outreach",
        body: eligibleForDispatch[0]?.text || "",
        created_at: sentAtIso
      });
    } catch {
    }
  }
  const results = [];
  let liveSendIndex = 0;
  for (let i = 0; i < resolvedRecipients.length; i += 1) {
    const r = resolvedRecipients[i];
    const blockedReason = blockedReasons.get(r.id);
    if (blockedReason) {
      results.push({
        contact_id: r.id,
        email: r.email,
        from: r.fromHeader,
        status: "blocked",
        error: blockedReason
      });
      continue;
    }
    const canDispatchResend = isTestMode ? isFortifaiInternalEmail(r.email) : isFortifaiInternalEmail(r.email) || verifiedLiveExternalIds.has(r.id);
    if (!canDispatchResend) {
      results.push({
        contact_id: r.id,
        email: r.email,
        from: r.fromHeader,
        status: "blocked",
        error: "Safe Mode Guard: recipient failed external domain verification."
      });
      continue;
    }
    const finalSubject = isTestMode ? r.subject.startsWith("[TEST]") ? r.subject : `[TEST] ${r.subject}` : r.subject;
    let finalText = r.text;
    if (portalLinkMode === "none") {
      finalText = finalText.replace(/\n?\s*\{\{portal_link\}\}\s*/g, "").trimEnd();
    } else {
      const portalHost = portalLinkMode === "investor" ? "investor.fortifai.io" : "overview.fortifai.io";
      const trackedUrl = `https://${portalHost}/?ref=${encodeURIComponent(r.id)}`;
      if (finalText.includes("{{portal_link}}")) {
        finalText = finalText.replace(/\{\{portal_link\}\}/g, trackedUrl);
      } else if (!finalText.includes(`${portalHost}/?ref=`)) {
        const ctaLabel = portalLinkMode === "investor" ? "Investor portal & deck" : "Interactive product overview";
        finalText = `${finalText.trimEnd()}

${ctaLabel}: ${trackedUrl}`;
      }
    }
    let status = "delivered";
    let resendId = `sim_${crypto2.randomUUID().slice(0, 8)}`;
    let errorMsg;
    if (hasLiveResend) {
      if (liveSendIndex > 0) {
        await new Promise((resolve) => setTimeout(resolve, 160));
      }
      liveSendIndex += 1;
      try {
        const resp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            from: r.fromHeader,
            to: [r.email],
            reply_to: r.replyToEmail,
            ...bcc && !isTestMode ? { bcc: [bcc] } : {},
            subject: finalSubject,
            text: finalText
          })
        });
        const data = await resp.json();
        if (!resp.ok) {
          status = "bounced";
          errorMsg = data.message || `Resend HTTP ${resp.status}`;
          resendId = "";
        } else {
          resendId = data.id || resendId;
        }
      } catch (err) {
        status = "bounced";
        errorMsg = err instanceof Error ? err.message : "Network error";
        resendId = "";
      }
    }
    results.push({
      contact_id: r.id,
      email: r.email,
      from: r.fromHeader,
      status,
      ...resendId ? { resend_id: resendId } : {},
      ...errorMsg ? { error: errorMsg } : {}
    });
    if (!isTestMode && supabaseAdmin && campaignId) {
      try {
        await supabaseAdmin.from("email_logs").insert({
          id: `log_${crypto2.randomUUID().slice(0, 10)}`,
          contact_id: r.id,
          campaign_id: campaignId,
          resend_email_id: resendId || null,
          sender_email: r.senderEmail,
          reply_to_email: r.replyToEmail,
          status: status === "delivered" ? "sent" : "bounced",
          sent_at: sentAtIso
        });
        if (status === "delivered") {
          await supabaseAdmin.from("contacts").update({ last_contacted_at: sentAtIso }).eq("id", r.id);
        }
      } catch {
      }
    }
  }
  res.json({
    ok: true,
    mode: hasLiveResend ? "resend" : "sandbox",
    testMode: isTestMode,
    portalLinkMode,
    campaignId,
    senderMode,
    bcc: !isTestMode && bcc ? bcc : null,
    sentCount: results.filter((r) => r.status === "delivered").length,
    blockedCount: results.filter((r) => r.status === "blocked").length,
    results
  });
});
app.post("/api/webhooks/resend", async (req, res) => {
  const rawBody = req.rawBody || JSON.stringify(req.body || {});
  if (!verifyResendSvixSignature(req, rawBody)) {
    res.status(401).json({ ok: false, error: "Invalid Resend webhook signature." });
    return;
  }
  const body = req.body || {};
  const eventType = typeof body.type === "string" ? body.type.trim() : "";
  const allowedEvents = /* @__PURE__ */ new Set([
    "email.delivered",
    "email.opened",
    "email.clicked",
    "email.bounced",
    "email.complained"
  ]);
  if (!allowedEvents.has(eventType)) {
    res.status(400).json({ ok: false, error: `Unsupported Resend webhook event: "${eventType}".` });
    return;
  }
  const resendEmailId = body.data?.email_id?.trim() || "";
  const eventTimeIso = typeof body.created_at === "string" && !Number.isNaN(Date.parse(body.created_at)) ? new Date(body.created_at).toISOString() : (/* @__PURE__ */ new Date()).toISOString();
  const toField = body.data?.to;
  const recipientEmail = Array.isArray(toField) ? String(toField[0] || "").trim().toLowerCase() : typeof toField === "string" ? toField.trim().toLowerCase() : "";
  const supabaseAdmin = getServiceSupabaseClient();
  let botScanFiltered = false;
  let suppressedContact = false;
  let matchedContactId = null;
  if (supabaseAdmin) {
    try {
      let logRow = null;
      if (resendEmailId) {
        const { data } = await supabaseAdmin.from("email_logs").select("*").eq("resend_email_id", resendEmailId).maybeSingle();
        logRow = data || null;
      }
      if (!logRow && recipientEmail) {
        const { data: contactRow } = await supabaseAdmin.from("contacts").select("id").eq("email", recipientEmail).maybeSingle();
        if (contactRow?.id) {
          matchedContactId = String(contactRow.id);
          const { data: latestLog } = await supabaseAdmin.from("email_logs").select("*").eq("contact_id", matchedContactId).order("sent_at", { ascending: false }).limit(1).maybeSingle();
          logRow = latestLog || null;
        }
      } else if (logRow?.contact_id) {
        matchedContactId = String(logRow.contact_id);
      }
      if (eventType === "email.opened" && logRow?.sent_at) {
        const sentMs = Date.parse(String(logRow.sent_at));
        const eventMs = Date.parse(eventTimeIso);
        if (!Number.isNaN(sentMs) && !Number.isNaN(eventMs) && eventMs - sentMs < 1e4) {
          botScanFiltered = true;
        }
      }
      if (logRow?.id && !botScanFiltered) {
        const patch = {};
        if (eventType === "email.delivered") {
          patch.status = "delivered";
          patch.delivered_at = eventTimeIso;
        } else if (eventType === "email.opened") {
          patch.status = "opened";
          patch.opened_at = eventTimeIso;
        } else if (eventType === "email.clicked") {
          patch.status = "clicked";
          patch.clicked_at = eventTimeIso;
        } else if (eventType === "email.bounced") {
          patch.status = "bounced";
        } else if (eventType === "email.complained") {
          patch.status = "complained";
        }
        await supabaseAdmin.from("email_logs").update(patch).eq("id", logRow.id);
      }
      if ((eventType === "email.bounced" || eventType === "email.complained") && matchedContactId) {
        await supabaseAdmin.from("contacts").update({ unsubscribed: true }).eq("id", matchedContactId);
        suppressedContact = true;
      }
    } catch {
    }
  }
  res.json({
    ok: true,
    eventType,
    resendEmailId: resendEmailId || null,
    contactId: matchedContactId,
    botScanFiltered,
    suppressedContact,
    processedAt: eventTimeIso
  });
});
app.options("/api/track-portal", (_req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.status(204).end();
});
app.post("/api/track-portal", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  const body = req.body || {};
  const contactId = typeof body.contactId === "string" ? body.contactId.trim() : "";
  const portal = typeof body.portal === "string" ? body.portal.trim().toLowerCase() : "";
  const eventType = typeof body.eventType === "string" ? body.eventType.trim() : "visit";
  const metadata = body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata : {};
  if (!contactId || contactId.length > 120) {
    res.status(400).json({ ok: false, error: "Valid contactId is required." });
    return;
  }
  if (!ALLOWED_PORTALS.has(portal)) {
    res.status(400).json({
      ok: false,
      error: "portal must be investor.fortifai.io or overview.fortifai.io."
    });
    return;
  }
  if (!ALLOWED_PORTAL_EVENTS.has(eventType)) {
    res.status(400).json({ ok: false, error: `Unsupported portal eventType "${eventType}".` });
    return;
  }
  const eventId = `evt_${crypto2.randomUUID().slice(0, 10)}`;
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  let updatedStage = null;
  const supabaseAdmin = getServiceSupabaseClient();
  if (supabaseAdmin) {
    try {
      await supabaseAdmin.from("portal_events").insert({
        id: eventId,
        contact_id: contactId,
        portal,
        event_type: eventType,
        metadata,
        created_at: nowIso
      });
      const { data: opp } = await supabaseAdmin.from("opportunities").select("id, stage, opportunity_type").eq("contact_id", contactId).maybeSingle();
      if (opp) {
        const currStage = String(opp.stage || "");
        const isInvestor = portal === "investor.fortifai.io" || opp.opportunity_type === "seed_investment";
        if (isInvestor) {
          if (eventType === "safe_generated") {
            updatedStage = "SAFE Signed";
          } else if (eventType === "pass_submitted") {
            updatedStage = "Passed";
            await supabaseAdmin.from("contacts").update({ unsubscribed: true }).eq("id", contactId);
          } else if (["Not sent", "Scheduled", "Sent", "Reminder Sched", "Reminder Sent"].includes(currStage)) {
            updatedStage = "Portal Visited";
          }
        } else if (currStage === "1 Lead") {
          updatedStage = "2 Qualified";
        }
        if (updatedStage && updatedStage !== currStage) {
          await supabaseAdmin.from("opportunities").update({
            stage: updatedStage,
            updated_at: nowIso,
            ...updatedStage === "SAFE Signed" ? { outcome: "Committed" } : {},
            ...updatedStage === "Passed" ? { outcome: "Pass" } : {}
          }).eq("id", opp.id);
        }
      }
    } catch {
    }
  }
  res.json({
    ok: true,
    eventId,
    contactId,
    portal,
    eventType,
    updatedStage,
    createdAt: nowIso
  });
});
app.get("/api/unsubscribe", async (req, res) => {
  const contactId = typeof req.query.contactId === "string" ? req.query.contactId.trim() : typeof req.query.id === "string" ? req.query.id.trim() : "";
  const email = typeof req.query.email === "string" ? req.query.email.trim().toLowerCase() : "";
  if (!contactId && (!email || !isValidEmail(email))) {
    res.status(400).send(
      '<!doctype html><html><body style="font-family:Inter,sans-serif;padding:40px;color:#0f172a;"><h2>Invalid unsubscribe link</h2><p>Missing contact identifier.</p></body></html>'
    );
    return;
  }
  const supabaseAdmin = getServiceSupabaseClient();
  if (supabaseAdmin) {
    try {
      if (contactId) {
        await supabaseAdmin.from("contacts").update({ unsubscribed: true }).eq("id", contactId);
      } else if (email) {
        await supabaseAdmin.from("contacts").update({ unsubscribed: true }).eq("email", email);
      }
    } catch {
    }
  }
  const safeIdentifier = escapeHtml(email || contactId);
  res.status(200).send(`<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Unsubscribed \u2014 Fortifai</title></head>
  <body style="font-family:Inter,system-ui,sans-serif;background:#F8FAFC;color:#0F172A;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;">
    <div style="max-width:440px;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:10px;padding:28px;">
      <div style="font-size:12px;font-weight:600;color:#64748B;letter-spacing:0.06em;text-transform:uppercase;">Fortifai Scale</div>
      <h1 style="font-size:18px;font-weight:600;margin:8px 0 8px;">You have been unsubscribed</h1>
      <p style="font-size:13px;color:#475569;line-height:1.5;margin:0;">
        Outreach emails have been suppressed for <strong>${safeIdentifier}</strong>. No further automated campaigns will be sent to this address.
      </p>
    </div>
  </body>
</html>`);
});
app.post(
  "/api/inbound-reply",
  requireAuthOrWebhookSecret,
  async (req, res) => {
    const body = req.body || {};
    const contactId = typeof body.contactId === "string" ? body.contactId.trim() : "";
    const fromEmail = typeof body.fromEmail === "string" ? body.fromEmail.trim().toLowerCase() : "";
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const snippet = typeof body.snippet === "string" ? body.snippet.trim() : "";
    if (!contactId && (!fromEmail || !isValidEmail(fromEmail))) {
      res.status(400).json({
        ok: false,
        error: "Either contactId or a valid fromEmail is required to log an inbound reply."
      });
      return;
    }
    if (fromEmail && !isValidEmail(fromEmail)) {
      res.status(400).json({ ok: false, error: "Invalid fromEmail format." });
      return;
    }
    if (!snippet && !subject) {
      res.status(400).json({
        ok: false,
        error: "Reply subject or snippet is required."
      });
      return;
    }
    const receivedAt = typeof body.receivedAt === "string" && body.receivedAt.trim() ? body.receivedAt.trim() : (/* @__PURE__ */ new Date()).toISOString();
    const supabaseAdmin = getServiceSupabaseClient();
    if (supabaseAdmin && contactId) {
      try {
        await supabaseAdmin.from("email_logs").update({
          status: "replied",
          replied_at: receivedAt,
          reply_snippet: snippet || subject
        }).eq("contact_id", contactId);
      } catch {
      }
    }
    res.json({
      ok: true,
      reply: {
        id: `rep_${crypto2.randomUUID().slice(0, 10)}`,
        contactId: contactId || null,
        fromEmail: fromEmail || null,
        subject: subject || "Re: Fortifai",
        snippet: snippet || "(Inbound email reply received)",
        receivedAt,
        loggedBy: req.session?.email || "webhook"
      }
    });
  }
);
app.post("/api/ask-me", requireAuth, async (req, res) => {
  if (!req.session) {
    res.status(401).json({ ok: false, error: "Authentication required." });
    return;
  }
  if (!req.session.permissions?.can_view_customers && !req.session.permissions?.can_view_investors) {
    res.status(403).json({
      ok: false,
      error: "Permission denied: requires can_view_customers or can_view_investors."
    });
    return;
  }
  const body = req.body || {};
  const result = await handleAskMeRequest(body, {
    email: req.session.email,
    role: req.session.role,
    permissions: req.session.permissions
  });
  if (!result.ok) {
    res.status(result.status).json({ ok: false, error: result.error });
    return;
  }
  res.json({ ok: true, message: result.message });
});
app.post(
  "/api/generate-dossier",
  requireAuth,
  async (req, res) => {
    if (!req.session) {
      res.status(401).json({ ok: false, error: "Authentication required." });
      return;
    }
    if (!req.session.permissions?.can_view_customers) {
      res.status(403).json({
        ok: false,
        error: "Permission denied: can_view_customers is required to access Account Intelligence."
      });
      return;
    }
    const body = req.body || {};
    const result = await handleGenerateDossier(body, req.session.email);
    if (!result.ok) {
      res.status(result.status).json({ ok: false, error: result.error });
      return;
    }
    res.json({ ok: true, cached: result.cached, dossier: result.dossier });
  }
);
var cmsDataDir = path.resolve(process.cwd(), "data");
var cmsFilePath = path.resolve(cmsDataDir, "live_cms_overrides.json");
var CMS_KEY_REGEX = /^[a-zA-Z0-9_.:-]{2,120}$/;
var readCmsStore = () => {
  try {
    if (!cmsFilePath.startsWith(cmsDataDir + path.sep)) {
      return { overrides: {}, updatedAt: null, updatedBy: null };
    }
    if (!fs.existsSync(cmsFilePath)) {
      return { overrides: {}, updatedAt: null, updatedBy: null };
    }
    const raw = fs.readFileSync(cmsFilePath, "utf8");
    const parsed = JSON.parse(raw);
    const clean = {};
    if (parsed.overrides && typeof parsed.overrides === "object") {
      for (const [k, v] of Object.entries(parsed.overrides)) {
        if (CMS_KEY_REGEX.test(k) && typeof v === "string") {
          clean[k] = v.slice(0, 2e3);
        }
      }
    }
    return {
      overrides: clean,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
      updatedBy: typeof parsed.updatedBy === "string" ? parsed.updatedBy : null
    };
  } catch {
    return { overrides: {}, updatedAt: null, updatedBy: null };
  }
};
app.get("/api/cms", (_req, res) => {
  const store = readCmsStore();
  res.json({ ok: true, ...store });
});
app.put("/api/cms", requireAuth, (req, res) => {
  if (!req.session) {
    res.status(401).json({ ok: false, error: "Authentication required." });
    return;
  }
  const canEditCms = Boolean(req.session.permissions?.can_manage_schema) || Boolean(req.session.permissions?.can_manage_users) || ["super_admin", "admin"].includes(req.session.role);
  if (!canEditCms) {
    res.status(403).json({
      ok: false,
      error: "Permission denied: requires Admin or Schema Manager privileges to save Live CMS copy."
    });
    return;
  }
  const rawOverrides = req.body?.overrides;
  if (!rawOverrides || typeof rawOverrides !== "object" || Array.isArray(rawOverrides)) {
    res.status(400).json({ ok: false, error: "Expected overrides object." });
    return;
  }
  const entries = Object.entries(rawOverrides);
  if (entries.length > 500) {
    res.status(400).json({ ok: false, error: "Maximum 500 CMS keys allowed." });
    return;
  }
  const sanitized = {};
  for (const [key, val] of entries) {
    if (!CMS_KEY_REGEX.test(key) || typeof val !== "string") {
      res.status(400).json({ ok: false, error: `Invalid CMS entry for key "${key}".` });
      return;
    }
    sanitized[key] = val.slice(0, 2e3);
  }
  if (!cmsFilePath.startsWith(cmsDataDir + path.sep)) {
    res.status(500).json({ ok: false, error: "Invalid CMS storage path." });
    return;
  }
  try {
    fs.mkdirSync(cmsDataDir, { recursive: true });
    const payload = {
      overrides: sanitized,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedBy: req.session.email
    };
    fs.writeFileSync(cmsFilePath, JSON.stringify(payload, null, 2), "utf8");
    res.json({ ok: true, ...payload });
  } catch {
    res.status(500).json({ ok: false, error: "Failed to persist Live CMS overrides." });
  }
});
var vercel_api_entry_default = app;
export {
  vercel_api_entry_default as default
};
