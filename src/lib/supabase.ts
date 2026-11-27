import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import type {
  AccountDossier,
  Contact,
  CrmUser,
  CustomFieldDefinition,
  DeliveryStatus,
  Quarter,
  Region,
  TelemetryEvent,
  UserPermissions,
  UserRole,
} from '../types/crm';

const STORAGE_KEYS = {
  CONTACTS: 'fortifai_crm_contacts_v3_real',
  CUSTOM_FIELDS: 'fortifai_crm_custom_fields_v1',
  TELEMETRY: 'fortifai_crm_telemetry_v2',
  USERS: 'fortifai_crm_users_v1',
  DOSSIERS: 'fortifai_crm_dossiers_v1',
  CONFIG: 'fortifai_crm_supabase_config_v3',
};

export interface SupabaseConnectionConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export function getSavedConfig(): SupabaseConnectionConfig {
  const envUrl =
    (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SUPABASE_URL || '';
  const envAnon =
    (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SUPABASE_ANON_KEY || '';

  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CONFIG);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SupabaseConnectionConfig>;
      return {
        supabaseUrl: parsed.supabaseUrl || envUrl || 'https://xwigfdsvknsgnlrbfshs.supabase.co',
        supabaseAnonKey: parsed.supabaseAnonKey || envAnon || '',
      };
    }
  } catch {
    // ignore storage errors
  }
  return {
    supabaseUrl: envUrl || 'https://xwigfdsvknsgnlrbfshs.supabase.co',
    supabaseAnonKey: envAnon || '',
  };
}

export function saveConfig(config: SupabaseConnectionConfig): void {
  try {
    localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(config));
  } catch {
    // ignore
  }
}

export function loadLocalState<T>(key: keyof typeof STORAGE_KEYS, fallback: T): T {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS[key]);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    // ignore
  }
  return fallback;
}

export function saveLocalState<T>(key: keyof typeof STORAGE_KEYS, value: T): void {
  try {
    localStorage.setItem(STORAGE_KEYS[key], JSON.stringify(value));
  } catch {
    // ignore
  }
}

export function buildSupabaseClient(
  url: string,
  anonKey: string
): SupabaseClient | null {
  if (!url.trim() || !anonKey.trim()) return null;
  try {
    return createClient(url.trim(), anonKey.trim());
  } catch {
    return null;
  }
}

function mapSupabaseCrmUser(raw: Record<string, unknown>): CrmUser {
  const role = (typeof raw.role === 'string' ? raw.role : 'analyst_viewer') as UserRole;
  const nested =
    raw.permissions && typeof raw.permissions === 'object'
      ? (raw.permissions as Partial<UserPermissions>)
      : {};

  const permissions: UserPermissions = {
    can_view_customers:
      typeof raw.can_view_customers === 'boolean'
        ? raw.can_view_customers
        : Boolean(nested.can_view_customers),
    can_edit_customers:
      typeof raw.can_edit_customers === 'boolean'
        ? raw.can_edit_customers
        : Boolean(nested.can_edit_customers),
    can_view_investors:
      typeof raw.can_view_investors === 'boolean'
        ? raw.can_view_investors
        : Boolean(nested.can_view_investors),
    can_edit_investors:
      typeof raw.can_edit_investors === 'boolean'
        ? raw.can_edit_investors
        : Boolean(nested.can_edit_investors),
    can_send_campaigns:
      typeof raw.can_send_campaigns === 'boolean'
        ? raw.can_send_campaigns
        : Boolean(nested.can_send_campaigns),
    can_send_as_marketing:
      typeof raw.can_send_as_marketing === 'boolean'
        ? raw.can_send_as_marketing
        : Boolean(nested.can_send_as_marketing) ||
          ['super_admin', 'admin', 'marketing'].includes(role),
    can_manage_schema:
      typeof raw.can_manage_schema === 'boolean'
        ? raw.can_manage_schema
        : Boolean(nested.can_manage_schema),
    can_manage_users:
      typeof raw.can_manage_users === 'boolean'
        ? raw.can_manage_users
        : Boolean(nested.can_manage_users),
  };

  return {
    id: String(raw.id || ''),
    email: String(raw.email || '').toLowerCase(),
    full_name: String(raw.full_name || raw.email || 'Fortifai User'),
    sender_display_name:
      typeof raw.sender_display_name === 'string' && raw.sender_display_name.trim()
        ? raw.sender_display_name.trim()
        : String(raw.full_name || raw.email || 'Fortifai User'),
    role,
    permissions,
    is_active: raw.is_active !== false,
    invited_by: typeof raw.invited_by === 'string' ? raw.invited_by : undefined,
    created_at:
      typeof raw.created_at === 'string' ? raw.created_at : new Date().toISOString(),
    last_login_at:
      typeof raw.last_login_at === 'string' ? raw.last_login_at : undefined,
  };
}


const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toDeterministicUuid(raw?: string | null): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (UUID_RE.test(s)) return s.toLowerCase();
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57, h3 = 0x1b873593, h4 = 0x85ebca6b;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
    h3 = Math.imul(h3 ^ ch, 2246822519);
    h4 = Math.imul(h4 ^ ch, 3266489917);
  }
  const hex =
    (h1 >>> 0).toString(16).padStart(8, "0") +
    (h2 >>> 0).toString(16).padStart(8, "0") +
    (h3 >>> 0).toString(16).padStart(8, "0") +
    (h4 >>> 0).toString(16).padStart(8, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function toSafeIsoTimestamp(val?: string | null): string | null {
  if (!val) return null;
  const s = String(val).trim();
  if (!s || s.toLowerCase().includes("sched")) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function serializeCrmUserForSupabase(u: CrmUser): Record<string, unknown> {
  return {
    id: toDeterministicUuid(u.id),
    email: u.email.toLowerCase(),
    full_name: u.full_name,
    sender_display_name: u.sender_display_name || u.full_name,
    role: u.role,
    can_view_customers: u.permissions.can_view_customers,
    can_edit_customers: u.permissions.can_edit_customers,
    can_view_investors: u.permissions.can_view_investors,
    can_edit_investors: u.permissions.can_edit_investors,
    can_send_campaigns: u.permissions.can_send_campaigns,
    can_send_as_marketing: u.permissions.can_send_as_marketing,
    can_manage_schema: u.permissions.can_manage_schema,
    can_manage_users: u.permissions.can_manage_users,
    is_active: u.is_active,
  };
}

function mapLogStatusToDelivery(status?: string): DeliveryStatus {
  switch ((status || '').toLowerCase()) {
    case 'sent':
      return 'sent';
    case 'delivered':
      return 'delivered';
    case 'opened':
      return 'opened';
    case 'clicked':
      return 'portal_visited';
    case 'replied':
      return 'replied';
    case 'bounced':
    case 'complained':
      return 'bounced';
    default:
      return 'not_sent';
  }
}

export async function testSupabaseConnection(
  url: string,
  anonKey: string
): Promise<{ ok: boolean; message: string }> {
  const client = buildSupabaseClient(url, anonKey);
  if (!client) {
    return { ok: false, message: 'Provide both Supabase Project URL and Anon Public Key.' };
  }
  try {
    const [uRes, cRes] = await Promise.all([
      client.from('crm_users').select('id').limit(1),
      client.from('contacts').select('id').limit(1),
    ]);
    if (uRes.error) {
      return {
        ok: false,
        message: `Connected to project, but crm_users query returned: ${uRes.error.message}. Run the SQL schema in Connections & Sync if tables are not created yet.`,
      };
    }
    if (cRes.error) {
      return {
        ok: false,
        message: `Connected to crm_users, but contacts query returned: ${cRes.error.message}.`,
      };
    }
    return {
      ok: true,
      message: 'Connected to Supabase (contacts, opportunities, crm_users, email_logs & portal_events verified).',
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Unable to reach Supabase endpoint.',
    };
  }
}

export async function verifyUserInSupabaseCrmUsers(
  client: SupabaseClient,
  email: string
): Promise<{ ok: boolean; user?: CrmUser; message?: string }> {
  try {
    const { data, error } = await client
      .from('crm_users')
      .select('*')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle();

    if (error) {
      return { ok: false, message: error.message };
    }
    if (!data) {
      return { ok: false, message: 'Email not found in Supabase crm_users table.' };
    }
    return { ok: true, user: mapSupabaseCrmUser(data as Record<string, unknown>) };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Supabase crm_users check failed.',
    };
  }
}

export async function syncStateToSupabase(
  client: SupabaseClient,
  contacts: Contact[],
  customFields: CustomFieldDefinition[],
  _telemetry: TelemetryEvent[],
  crmUsers?: CrmUser[]
): Promise<{ ok: boolean; message: string }> {
  try {
    if (crmUsers && crmUsers.length > 0) {
      const userRows = crmUsers.map(serializeCrmUserForSupabase);
      const { error: uErr } = await client
        .from('crm_users')
        .upsert(userRows, { onConflict: 'id' });
      if (uErr) return { ok: false, message: uErr.message };
    }

    if (contacts.length > 0) {
      const contactRows = contacts.map((c) => ({
        id: toDeterministicUuid(c.id),
        email: c.email,
        first_name: c.first_name || '',
        last_name: c.last_name || '',
        full_name: c.full_name,
        organization: c.organization,
        title: c.title || '',
        region: c.region,
        location: c.location || '',
        contact_type: c.contact_type,
        buyer_persona: c.buyer_persona || null,
        industry: c.industry || null,
        tier: c.tier || null,
        icp_score: c.icp_score ?? null,
        fortune_500: Boolean(c.fortune_500),
        priority_tier: c.priority_tier || null,
        execution_wave: c.execution_wave || null,
        batch_order: c.batch_order ?? null,
        check_size_label: c.check_size_label || null,
        min_check_usd: c.min_check_usd ?? null,
        max_check_usd: c.max_check_usd ?? null,
        stage_focus: c.stage_focus || null,
        thesis_fit: c.thesis_fit || null,
        match_score: c.match_score ?? null,
        custom_hook: c.custom_hook || null,
        custom_fields: c.custom_fields || {},
        owner: c.owner || 'Varun Mowar',
        relationship_strength: c.relationship_strength || null,
        tags: c.tags || [],
        unsubscribed: Boolean(c.unsubscribed),
        last_contacted_at: toSafeIsoTimestamp(c.last_contacted_at),
      }));
      const { error: cErr } = await client
        .from('contacts')
        .upsert(contactRows, { onConflict: 'id' });
      if (cErr) return { ok: false, message: cErr.message };

      const opportunityRows = contacts.map((c) => ({
        id: toDeterministicUuid(c.opportunity_id || `opp_${c.id}`),
        contact_id: toDeterministicUuid(c.id),
        opportunity_type: c.contact_type === 'investor' ? 'seed_investment' : 'enterprise_deal',
        owner_id: toDeterministicUuid(c.owner_id),
        owner_email: c.owner_email,
        stage: c.stage,
        outcome: c.outcome || null,
        meeting_booked:
          c.meeting_booked ??
          [
            'Meeting',
            'Diligence',
            'SAFE Signed',
            '4 Decisionmaker buy in',
            '5 Internal Review Pending',
            '6 Commercial / Contracting',
            '7 Closed Won',
          ].includes(c.stage),
        product_or_instrument: c.product_or_instrument || null,
        amount_usd: c.amount_usd ?? 0,
        probability: c.probability ?? 0,
        expected_close: (c.expected_close || null) || c.custom_fields?.expected_close || c.custom_fields?.close_qtr || '',
        next_step: c.next_step || null,
        notes: c.notes || null,
        updated_at: new Date().toISOString(),
      }));
      const { error: oErr } = await client
        .from('opportunities')
        .upsert(opportunityRows, { onConflict: 'id' });
      if (oErr) return { ok: false, message: oErr.message };
    }

    if (customFields.length > 0) {
      const fieldRows = customFields.map((f, idx) => ({
        id: toDeterministicUuid(f.id),
        entity_scope: f.entity_scope,
        field_key: f.field_key,
        field_label: f.field_label,
        field_type: f.field_type,
        select_options: f.select_options || null,
        display_order: f.display_order ?? idx + 1,
      }));
      const { error: fErr } = await client
        .from('custom_field_definitions')
        .upsert(fieldRows, { onConflict: 'id' });
      if (fErr) return { ok: false, message: fErr.message };
    }

    return {
      ok: true,
      message: `Synced ${crmUsers?.length ?? 0} users, ${contacts.length} contacts/opportunities, and ${customFields.length} custom columns to Supabase.`,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Supabase sync failed.',
    };
  }
}

export async function upsertSingleContactToSupabase(
  client: SupabaseClient,
  contact: Contact
): Promise<void> {
  try {
    await client.from('contacts').upsert(
      {
        id: contact.id,
        email: contact.email,
        first_name: contact.first_name || '',
        last_name: contact.last_name || '',
        full_name: contact.full_name,
        organization: contact.organization,
        title: contact.title || '',
        region: contact.region,
        location: contact.location || '',
        contact_type: contact.contact_type,
        buyer_persona: contact.buyer_persona || null,
        industry: contact.industry || null,
        tier: contact.tier || null,
        icp_score: contact.icp_score ?? null,
        fortune_500: Boolean(contact.fortune_500),
        priority_tier: contact.priority_tier || null,
        execution_wave: contact.execution_wave || null,
        batch_order: contact.batch_order ?? null,
        check_size_label: contact.check_size_label || null,
        min_check_usd: contact.min_check_usd ?? null,
        max_check_usd: contact.max_check_usd ?? null,
        stage_focus: contact.stage_focus || null,
        thesis_fit: contact.thesis_fit || null,
        match_score: contact.match_score ?? null,
        custom_hook: contact.custom_hook || null,
        custom_fields: contact.custom_fields || {},
        owner: contact.owner || 'Varun Mowar',
        relationship_strength: contact.relationship_strength || null,
        tags: contact.tags || [],
        unsubscribed: Boolean(contact.unsubscribed),
        last_contacted_at: contact.last_contacted_at || null,
      },
      { onConflict: 'id' }
    );

    await client.from('opportunities').upsert(
      {
        id: contact.opportunity_id || `opp_${contact.id}`,
        contact_id: contact.id,
        opportunity_type:
          contact.contact_type === 'investor' ? 'seed_investment' : 'enterprise_deal',
        owner_id: contact.owner_id,
        owner_email: contact.owner_email,
        stage: contact.stage,
        outcome: contact.outcome || null,
        meeting_booked:
          contact.meeting_booked ??
          [
            'Meeting',
            'Diligence',
            'SAFE Signed',
            '4 Decisionmaker buy in',
            '5 Internal Review Pending',
            '6 Commercial / Contracting',
            '7 Closed Won',
          ].includes(contact.stage),
        product_or_instrument: contact.product_or_instrument || null,
        amount_usd: contact.amount_usd ?? 0,
        probability: contact.probability ?? 0,
        expected_close: (contact.expected_close || null) || c.custom_fields?.expected_close || c.custom_fields?.close_qtr || '',
        next_step: contact.next_step || null,
        notes: contact.notes || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
  } catch {
    // Non-blocking background sync
  }
}

export async function upsertCrmUserToSupabase(
  client: SupabaseClient,
  user: CrmUser
): Promise<void> {
  try {
    await client.from('crm_users').upsert(serializeCrmUserForSupabase(user), { onConflict: 'id' });
  } catch {
    // Non-blocking background sync
  }
}

export async function deleteCustomFieldFromSupabase(
  client: SupabaseClient,
  fieldId: string
): Promise<void> {
  try {
    await client.from('custom_field_definitions').delete().eq('id', fieldId);
  } catch {
    // Non-blocking background sync
  }
}

export async function pullStateFromSupabase(
  client: SupabaseClient
): Promise<{
  ok: boolean;
  users?: CrmUser[];
  contacts?: Contact[];
  customFields?: CustomFieldDefinition[];
  telemetry?: TelemetryEvent[];
  dossiers?: AccountDossier[];
  message: string;
}> {
  try {
    const [uRes, cRes, oRes, fRes, logsRes, portalRes, dosRes] = await Promise.all([
      client.from('crm_users').select('*'),
      client.from('contacts').select('*'),
      client.from('opportunities').select('*'),
      client.from('custom_field_definitions').select('*').order('display_order', { ascending: true }),
      client.from('email_logs').select('*').order('sent_at', { ascending: false }).limit(80),
      client.from('portal_events').select('*').order('created_at', { ascending: false }).limit(80),
      client.from('account_dossiers').select('*').order('generated_at', { ascending: false }),
    ]);

    if (cRes.error) return { ok: false, message: cRes.error.message };

    const users = ((uRes.data || []) as Record<string, unknown>[]).map(mapSupabaseCrmUser);
    const oppsByContact = new Map<string, Record<string, unknown>>();
    for (const o of (oRes.data || []) as Record<string, unknown>[]) {
      const cid = String(o.contact_id || '');
      if (cid && !oppsByContact.has(cid)) {
        oppsByContact.set(cid, o);
      }
    }

    const latestLogByContact = new Map<string, Record<string, unknown>>();
    for (const log of (logsRes.data || []) as Record<string, unknown>[]) {
      const cid = String(log.contact_id || '');
      if (cid && !latestLogByContact.has(cid)) {
        latestLogByContact.set(cid, log);
      }
    }

    const portalVisitedSet = new Set<string>();
    for (const pe of (portalRes.data || []) as Record<string, unknown>[]) {
      if (pe.contact_id) portalVisitedSet.add(String(pe.contact_id));
    }

    const rawContacts = (cRes.data || []) as Record<string, unknown>[];
    const contactById = new Map<string, Contact>();

    const contacts: Contact[] = rawContacts.map((raw) => {
      const id = String(raw.id || '');
      const opp = oppsByContact.get(id);
      const log = latestLogByContact.get(id);
      const ownerName = String(raw.owner || 'Varun Mowar');
      const matchedUser =
        users.find((u) => u.id === opp?.owner_id) ||
        users.find((u) => u.email === String(opp?.owner_email || '').toLowerCase()) ||
        users.find((u) => u.full_name.toLowerCase() === ownerName.toLowerCase());

      const hasPortalVisit = portalVisitedSet.has(id);
      const logStatus = log ? mapLogStatusToDelivery(String(log.status || '')) : undefined;
      const deliveryStatus: DeliveryStatus =
        logStatus === 'replied'
          ? 'replied'
          : logStatus === 'bounced'
          ? 'bounced'
          : hasPortalVisit
          ? 'portal_visited'
          : logStatus || 'not_sent';

      const contact: Contact = {
        id,
        email: String(raw.email || ''),
        first_name: String(raw.first_name || ''),
        last_name: String(raw.last_name || ''),
        full_name: String(raw.full_name || ''),
        organization: String(raw.organization || ''),
        title: String(raw.title || ''),
        region: (String(raw.region || 'US') as Region),
        location: String(raw.location || ''),
        contact_type: raw.contact_type === 'investor' ? 'investor' : 'customer',
        buyer_persona: raw.buyer_persona as Contact['buyer_persona'],
        industry: raw.industry ? String(raw.industry) : undefined,
        tier: raw.tier as Contact['tier'],
        icp_score: typeof raw.icp_score === 'number' ? raw.icp_score : undefined,
        fortune_500: Boolean(raw.fortune_500),
        expected_close: ((opp?.expected_close as Quarter) || undefined) || c.custom_fields?.expected_close || c.custom_fields?.close_qtr || '',
        priority_tier: raw.priority_tier as Contact['priority_tier'],
        execution_wave: raw.execution_wave ? String(raw.execution_wave) : undefined,
        batch_order: typeof raw.batch_order === 'number' ? raw.batch_order : undefined,
        check_size_label: raw.check_size_label ? String(raw.check_size_label) : undefined,
        min_check_usd: typeof raw.min_check_usd === 'number' ? raw.min_check_usd : undefined,
        max_check_usd: typeof raw.max_check_usd === 'number' ? raw.max_check_usd : undefined,
        stage_focus: raw.stage_focus ? String(raw.stage_focus) : undefined,
        thesis_fit: raw.thesis_fit ? String(raw.thesis_fit) : undefined,
        match_score: typeof raw.match_score === 'number' ? raw.match_score : undefined,
        custom_hook: raw.custom_hook ? String(raw.custom_hook) : undefined,
        email_opened: Boolean(log?.opened_at) || deliveryStatus === 'replied' || hasPortalVisit,
        portal_visited: hasPortalVisit,
        delivery_status: deliveryStatus,
        sent_at: log?.sent_at ? String(log.sent_at) : undefined,
        delivered_at: log?.delivered_at ? String(log.delivered_at) : undefined,
        opened_at: log?.opened_at ? String(log.opened_at) : undefined,
        replied_at: log?.replied_at ? String(log.replied_at) : undefined,
        last_reply_snippet: log?.reply_snippet ? String(log.reply_snippet) : undefined,
        opportunity_id: opp?.id ? String(opp.id) : undefined,
        meeting_booked: typeof opp?.meeting_booked === 'boolean' ? opp.meeting_booked : undefined,
        stage: String(
          opp?.stage || (raw.contact_type === 'investor' ? 'Not sent' : '1 Lead')
        ),
        outcome: opp?.outcome ? String(opp.outcome) : undefined,
        amount_usd: typeof opp?.amount_usd === 'number' ? opp.amount_usd : 0,
        probability: typeof opp?.probability === 'number' ? opp.probability : 0,
        product_or_instrument: opp?.product_or_instrument
          ? String(opp.product_or_instrument)
          : undefined,
        next_step: opp?.next_step ? String(opp.next_step) : undefined,
        notes: opp?.notes ? String(opp.notes) : undefined,
        owner_id: String(opp?.owner_id || matchedUser?.id || 'usr_varun'),
        owner_email: String(opp?.owner_email || matchedUser?.email || 'varun@fortifai.io'),
        owner: matchedUser?.full_name || ownerName,
        relationship_strength: raw.relationship_strength
          ? String(raw.relationship_strength)
          : undefined,
        tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : undefined,
        unsubscribed: Boolean(raw.unsubscribed),
        is_demo: typeof raw.is_demo === 'boolean' ? raw.is_demo : undefined,
        last_contacted_at: raw.last_contacted_at ? String(raw.last_contacted_at) : undefined,
        custom_fields:
          raw.custom_fields && typeof raw.custom_fields === 'object'
            ? (raw.custom_fields as Record<string, string | number | boolean>)
            : {},
      };
      contactById.set(id, contact);
      return contact;
    });

    const telemetry: TelemetryEvent[] = [];

    for (const pe of (portalRes.data || []) as Record<string, unknown>[]) {
      const c = contactById.get(String(pe.contact_id || ''));
      const meta =
        pe.metadata && typeof pe.metadata === 'object'
          ? (pe.metadata as Record<string, unknown>)
          : {};
      telemetry.push({
        id: String(pe.id || ''),
        contact_id: String(pe.contact_id || ''),
        contact_name: c?.full_name || String(pe.contact_id || 'Contact'),
        organization: c?.organization || 'Fortifai Target',
        contact_type: c?.contact_type || (pe.portal === 'investor.fortifai.io' ? 'investor' : 'customer'),
        source:
          pe.portal === 'overview.fortifai.io' ? 'overview.fortifai.io' : 'investor.fortifai.io',
        event_type: (String(pe.event_type || 'visit') as TelemetryEvent['event_type']),
        detail: String(meta.detail || `${pe.event_type || 'visit'} on ${pe.portal}`),
        timestamp: pe.created_at
          ? new Date(String(pe.created_at)).toLocaleString([], {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })
          : 'Recent',
        duration_sec: typeof meta.duration_sec === 'number' ? meta.duration_sec : undefined,
      });
    }

    for (const log of (logsRes.data || []) as Record<string, unknown>[]) {
      const c = contactById.get(String(log.contact_id || ''));
      const st = String(log.status || 'sent').toLowerCase();
      const evtType: TelemetryEvent['event_type'] =
        st === 'replied'
          ? 'email_replied'
          : st === 'bounced' || st === 'complained'
          ? 'email_bounced'
          : st === 'clicked'
          ? 'email_clicked'
          : st === 'opened'
          ? 'email_opened'
          : st === 'delivered'
          ? 'email_delivered'
          : 'email_sent';
      const tsRaw = log.replied_at || log.clicked_at || log.opened_at || log.delivered_at || log.sent_at;
      telemetry.push({
        id: String(log.id || ''),
        contact_id: String(log.contact_id || ''),
        contact_name: c?.full_name || String(log.contact_id || 'Contact'),
        organization: c?.organization || 'Fortifai Target',
        contact_type: c?.contact_type || 'customer',
        source: 'resend',
        event_type: evtType,
        detail: log.reply_snippet
          ? `Reply: ${String(log.reply_snippet)}`
          : `Resend ${st} (${String(log.sender_email || 'outreach')})`,
        sender_from: log.sender_email ? String(log.sender_email) : undefined,
        reply_snippet: log.reply_snippet ? String(log.reply_snippet) : undefined,
        timestamp: tsRaw
          ? new Date(String(tsRaw)).toLocaleString([], {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })
          : 'Recent',
      });
    }

    const customFields = ((fRes.data || []) as Record<string, unknown>[]).map((f) => ({
      id: String(f.id),
      entity_scope: (String(f.entity_scope || 'both') as CustomFieldDefinition['entity_scope']),
      field_key: String(f.field_key),
      field_label: String(f.field_label),
      field_type: (String(f.field_type || 'text') as CustomFieldDefinition['field_type']),
      select_options: Array.isArray(f.select_options)
        ? (f.select_options as string[])
        : undefined,
      display_order: typeof f.display_order === 'number' ? f.display_order : undefined,
    }));

    const dossiers = ((dosRes.data || []) as Record<string, unknown>[]).map(
      (d) => d as unknown as AccountDossier
    );

    return {
      ok: true,
      users,
      contacts,
      customFields,
      telemetry,
      dossiers,
      message: `Pulled ${contacts.length} contacts, ${oRes.data?.length ?? 0} opportunities, and ${users.length} RBAC users from Supabase.`,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Failed to pull from Supabase.',
    };
  }
}

export function subscribeToCrmChanges(
  client: SupabaseClient,
  onRemoteUpdate: () => void
): () => void {
  const channel: RealtimeChannel = client
    .channel('fortifai-scale-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts' }, onRemoteUpdate)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'opportunities' }, onRemoteUpdate)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'custom_field_definitions' },
      onRemoteUpdate
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'email_logs' }, onRemoteUpdate)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'portal_events' }, onRemoteUpdate)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_users' }, onRemoteUpdate)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'account_dossiers' },
      onRemoteUpdate
    )
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}

export async function deleteContactFromSupabase(
  client: SupabaseClient,
  contactId: string
): Promise<{ ok: boolean; message: string }> {
  try {
    await client.from("opportunities").delete().eq("contact_id", toDeterministicUuid(contactId) || contactId);
    const { error } = await client.from("contacts").delete().eq("id", toDeterministicUuid(contactId) || contactId);
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Deleted contact from Supabase." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Delete failed" };
  }
}
