import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CrmUser, UserPermissions, UserRole } from '../src/types/crm.ts';

let cachedAdminClient: SupabaseClient | null = null;
let cachedConfigKey = '';

export function isServiceSupabaseConfigured(): boolean {
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  return Boolean(url && serviceKey && !serviceKey.startsWith('MY_'));
}

export function getServiceSupabaseClient(): SupabaseClient | null {
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !serviceKey || serviceKey.startsWith('MY_')) {
    return null;
  }

  const key = `${url}::${serviceKey.slice(0, 12)}`;
  if (!cachedAdminClient || cachedConfigKey !== key) {
    cachedAdminClient = createClient(url, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    cachedConfigKey = key;
  }
  return cachedAdminClient;
}

export function mapRawCrmUserRow(raw: Record<string, unknown>): CrmUser {
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

export async function fetchCrmUserByEmail(email: string): Promise<CrmUser | null> {
  const admin = getServiceSupabaseClient();
  if (!admin) return null;

  try {
    const { data, error } = await admin
      .from('crm_users')
      .select('*')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle();

    if (error || !data) return null;
    return mapRawCrmUserRow(data as Record<string, unknown>);
  } catch {
    return null;
  }
}
