import { createClient as _createSbAdminClient } from '@supabase/supabase-js';

function resolveValidSupabaseUrl(...candidates: Array<string | undefined>): string {
  for (const raw of candidates) {
    const cleaned = String(raw || "").trim().replace(/^['"]|['"]$/g, "");
    if (!cleaned) continue;
    const withProto = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;
    try {
      const parsed = new URL(withProto);
      if (parsed.hostname.includes(".")) return parsed.origin;
    } catch {}
  }
  return "https://xwigfdsvknsgnlrbfshs.supabase.co";
}

function getSupabaseAdmin() {
  const url = resolveValidSupabaseUrl(process.env.SUPABASE_URL, process.env.VITE_SUPABASE_URL);
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim().replace(/^['"]|['"]$/g, "");
  if (!key) return null;
  return _createSbAdminClient(url, key, { auth: { persistSession: false } });
}

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import { handleAskMeRequest, type AskMeRequestPayload } from './server/askMe.ts';
import { handleGenerateDossier, type GenerateDossierRequest } from './server/dossier.ts';
import {
  fetchCrmUserByEmail,
  getServiceSupabaseClient,
  isServiceSupabaseConfigured,
} from './server/supabaseAdmin.ts';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  crypto
    .createHash("sha256")
    .update(
      (process.env.SUPABASE_SERVICE_ROLE_KEY || "") +
        ":" +
        (process.env.RESEND_API_KEY || "") +
        ":fortifai-scale-v2"
    )
    .digest("hex");
const ALLOWED_EMAIL_DOMAINS = ['@fortifai.io', '@tryfortifai.us'];
const ALLOWED_PORTALS = new Set(['investor.fortifai.io', 'overview.fortifai.io']);
const ALLOWED_PORTAL_EVENTS = new Set([
  'visit',
  'deck_opened',
  'financials_viewed',
  'callback_requested',
  'safe_generated',
  'pass_submitted',
  'agent_explored',
]);

interface SessionPermissions {
  can_view_customers: boolean;
  can_edit_customers: boolean;
  can_view_investors: boolean;
  can_edit_investors: boolean;
  can_send_campaigns: boolean;
  can_send_as_marketing: boolean;
  can_manage_schema: boolean;
  can_manage_users: boolean;
}

interface SessionClaims {
  email: string;
  role: string;
  permissions: SessionPermissions;
  simulated?: boolean;
  exp: number;
}

const SERVER_ROLE_PRESETS: Record<string, SessionPermissions> = {
  super_admin: {
    can_view_customers: true,
    can_edit_customers: true,
    can_view_investors: true,
    can_edit_investors: true,
    can_send_campaigns: true,
    can_send_as_marketing: true,
    can_manage_schema: true,
    can_manage_users: true,
  },
  admin: {
    can_view_customers: true,
    can_edit_customers: true,
    can_view_investors: true,
    can_edit_investors: true,
    can_send_campaigns: true,
    can_send_as_marketing: true,
    can_manage_schema: true,
    can_manage_users: true,
  },
  marketing: {
    can_view_customers: true,
    can_edit_customers: false,
    can_view_investors: false,
    can_edit_investors: false,
    can_send_campaigns: true,
    can_send_as_marketing: true,
    can_manage_schema: false,
    can_manage_users: false,
  },
  sales_lead: {
    can_view_customers: true,
    can_edit_customers: true,
    can_view_investors: false,
    can_edit_investors: false,
    can_send_campaigns: true,
    can_send_as_marketing: false,
    can_manage_schema: true,
    can_manage_users: false,
  },
  investor_relations: {
    can_view_customers: false,
    can_edit_customers: false,
    can_view_investors: true,
    can_edit_investors: true,
    can_send_campaigns: true,
    can_send_as_marketing: false,
    can_manage_schema: false,
    can_manage_users: false,
  },
  analyst_viewer: {
    can_view_customers: true,
    can_edit_customers: false,
    can_view_investors: true,
    can_edit_investors: false,
    can_send_campaigns: false,
    can_send_as_marketing: false,
    can_manage_schema: false,
    can_manage_users: false,
  },
};

function intersectSessionPermissions(
  a: SessionPermissions,
  b: SessionPermissions
): SessionPermissions {
  return {
    can_view_customers: Boolean(a.can_view_customers && b.can_view_customers),
    can_edit_customers: Boolean(a.can_edit_customers && b.can_edit_customers),
    can_view_investors: Boolean(a.can_view_investors && b.can_view_investors),
    can_edit_investors: Boolean(a.can_edit_investors && b.can_edit_investors),
    can_send_campaigns: Boolean(a.can_send_campaigns && b.can_send_campaigns),
    can_send_as_marketing: Boolean(a.can_send_as_marketing && b.can_send_as_marketing),
    can_manage_schema: Boolean(a.can_manage_schema && b.can_manage_schema),
    can_manage_users: Boolean(a.can_manage_users && b.can_manage_users),
  };
}

interface AuthenticatedRequest extends Request {
  session?: SessionClaims;
}

function isAllowedDomainEmail(email: string): boolean {
  const lower = email.trim().toLowerCase();
  return ALLOWED_EMAIL_DOMAINS.some((domain) => lower.endsWith(domain));
}

function isFortifaiInternalEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith('@fortifai.io');
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function containsHeaderInjection(value: string): boolean {
  return /[\r\n]/.test(value);
}

function extractEmailAddress(header: string): string {
  const trimmed = header.trim();
  const angleMatch = trimmed.match(/<([^<>]+)>/);
  return (angleMatch ? angleMatch[1] : trimmed).trim().toLowerCase();
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function signSessionToken(claims: SessionClaims): string {
  const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifySessionToken(token: string): SessionClaims | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionClaims;
    if (!parsed.exp || parsed.exp < Date.now()) return null;
    if (!parsed.email || !isAllowedDomainEmail(parsed.email)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    res.status(401).json({ ok: false, error: 'Missing Bearer session token.' });
    return;
  }
  const claims = verifySessionToken(authHeader.slice(7).trim());
  if (!claims) {
    res.status(401).json({ ok: false, error: 'Invalid or expired session token.' });
    return;
  }
  req.session = claims;
  next();
}

function verifyWebhookSecretHeader(req: Request): boolean {
  const webhookSecret = (process.env.RESEND_WEBHOOK_SECRET || '').trim();
  if (!webhookSecret) return false;
  const providedSecret = req.headers['x-webhook-secret'];
  if (typeof providedSecret === 'string' && providedSecret.length === webhookSecret.length) {
    return crypto.timingSafeEqual(Buffer.from(providedSecret), Buffer.from(webhookSecret));
  }
  return false;
}

function requireAuthOrWebhookSecret(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (verifyWebhookSecretHeader(req)) {
    next();
    return;
  }
  requireAuth(req, res, next);
}

function verifyResendSvixSignature(req: Request, rawBody: string): boolean {
  const secret = (process.env.RESEND_WEBHOOK_SECRET || '').trim();
  if (!secret) return true; // No secret configured in sandbox/preview
  if (verifyWebhookSecretHeader(req)) return true;

  const svixId = req.headers['svix-id'];
  const svixTimestamp = req.headers['svix-timestamp'];
  const svixSignature = req.headers['svix-signature'];
  if (
    typeof svixId !== 'string' ||
    typeof svixTimestamp !== 'string' ||
    typeof svixSignature !== 'string'
  ) {
    return false;
  }

  const secretBytes = secret.startsWith('whsec_')
    ? Buffer.from(secret.slice(6), 'base64')
    : Buffer.from(secret, 'utf8');
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expectedSig = crypto
    .createHmac('sha256', secretBytes)
    .update(signedContent)
    .digest('base64');

  const signatures = svixSignature.split(' ').map((part) => {
    const [, v] = part.split(',');
    return v || part;
  });

  return signatures.some((sig) => {
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}


const FALLBACK_CRM_USERS: Record<string, { id: string; email: string; full_name: string; role: string; is_active: boolean }> = {
  "varun@fortifai.io": { id: "usr_varun", email: "varun@fortifai.io", full_name: "Varun Mowar", role: "super_admin", is_active: true },
};

async function startServer() {
  const app = express();
  app.use(
    express.json({
      limit: '5mb',
      verify: (req, _res, buf) => {
        (req as Request & { rawBody?: string }).rawBody = buf.toString('utf8');
      },
    })
  );

  app.get('/api/config-status', (_req: Request, res: Response) => {
    const key = process.env.RESEND_API_KEY || '';
    const resendConfigured = Boolean(key && key !== 'MY_RESEND_API_KEY');
    const geminiKey = process.env.GEMINI_API_KEY || '';
    const geminiConfigured = Boolean(geminiKey && geminiKey !== 'MY_GEMINI_API_KEY');
    const supabaseServerConfigured = isServiceSupabaseConfigured();
    res.json({ ok: true, resendConfigured, geminiConfigured, supabaseServerConfigured });
  });

  
  function hashPasswordScrypt(plainPassword: string): string {
    const salt = crypto.randomBytes(16).toString("hex");
    const derived = crypto.scryptSync(plainPassword, salt, 64).toString("hex");
    return `scrypt:${salt}:${derived}`;
  }

  function verifyPasswordScrypt(plainPassword: string, storedHash: string): boolean {
    if (!storedHash || !storedHash.startsWith("scrypt:")) return false;
    const parts = storedHash.split(":");
    if (parts.length !== 3) return false;
    const [, salt, keyHex] = parts;
    const keyBuf = Buffer.from(keyHex, "hex");
    const derivedBuf = crypto.scryptSync(plainPassword, salt, 64);
    if (keyBuf.length !== derivedBuf.length) return false;
    return crypto.timingSafeEqual(keyBuf, derivedBuf);
  }

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as { email?: string; password?: string };
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const password = typeof body.password === "string" ? body.password : "";

      if (!email || !isValidEmail(email) || !isAllowedDomainEmail(email)) {
        return res.status(403).json({
          ok: false,
          error: "Access restricted to @fortifai.io or @tryfortifai.us accounts.",
        });
      }
      if (!password || password.length < 6) {
        return res.status(400).json({
          ok: false,
          error: "Enter your workspace password (minimum 6 characters).",
        });
      }

      let dbUser: Record<string, any> | null = null;
      try {
        dbUser = await Promise.race([
          fetchCrmUserByEmail(email),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
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
          error: `Account "${email}" is not provisioned in crm_users.`,
        });
      }
      if (dbUser.is_active === false) {
        return res.status(403).json({
          ok: false,
          error: `Account "${email}" has been deactivated.`,
        });
      }

      const storedHash = typeof (dbUser as Record<string, unknown>).password_hash === "string"
        ? String((dbUser as Record<string, unknown>).password_hash)
        : "";

      const bootstrapPassword =
        process.env.SCALE_ADMIN_PASSWORD ||
        process.env.RESEND_WEBHOOK_SECRET ||
        "FortifaiScale2026!";

      let passwordValid = false;
      const supabaseAdmin = getSupabaseAdmin();

      const envAdminPw = String(process.env.SCALE_ADMIN_PASSWORD || "").trim();
      if (email === "varun@fortifai.io" && envAdminPw && password.trim() === envAdminPw) {
        passwordValid = true;
      } else if (storedHash) {
        passwordValid = verifyPasswordScrypt(password, storedHash);
      } else if (password.trim() === bootstrapPassword.trim()) {
        // First-time bootstrap: accept workspace bootstrap password and persist salted hash
        passwordValid = true;
        if (supabaseAdmin) {
          const initialHash = hashPasswordScrypt(password);
          void Promise.race([
            supabaseAdmin
              .from("crm_users")
              .update({ password_hash: initialHash, last_login_at: new Date().toISOString() })
              .eq("email", email),
            new Promise((r) => setTimeout(r, 1500)),
          ]).catch(() => {});
        }
      }

      if (!passwordValid) {
        return res.status(401).json({
          ok: false,
          error: "Invalid email or password.",
        });
      }

      if (supabaseAdmin && storedHash) {
        void Promise.race([
          supabaseAdmin
            .from("crm_users")
            .update({ last_login_at: new Date().toISOString() })
            .eq("email", email),
          new Promise((r) => setTimeout(r, 1500)),
        ]).catch(() => {});
      }

      const role = typeof dbUser.role === "string" && SERVER_ROLE_PRESETS[dbUser.role]
        ? dbUser.role
        : "analyst_viewer";
      const permissions = {
        ...SERVER_ROLE_PRESETS[role],
        ...(dbUser.permissions || {}),
      };
      const claims: SessionClaims = {
        email,
        role,
        permissions,
        exp: Date.now() + 12 * 60 * 60 * 1000,
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
          is_active: true,
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Authentication error";
      return res.status(500).json({ ok: false, error: msg });
    }
  });

  
  
function formatAllocatedRole(rawRole: string): string {
  const map: Record<string, string> = {
    super_admin: "Super Admin",
    admin: "Admin",
    marketing: "Marketing",
    sales_lead: "Sales Lead",
    investor_relations: "Investor Relations",
    analyst_viewer: "Analyst Viewer",
  };
  const key = String(rawRole || "").trim().toLowerCase();
  if (map[key]) return map[key];
  return key
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ") || "Member";
}

function generateOpaqueJoinCode(length = 16): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

function escapeHtmlBasic(str: string): string {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

  
  app.post("/api/crm/upsert-contact", async (req: Request, res: Response) => {
    try {
      const authHeader = String(req.headers.authorization || "");
      const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
      const caller = verifySessionToken(bearer);
      if (!caller) {
        return res.status(401).json({ ok: false, error: "Unauthorized session." });
      }

      const contact = (req.body || {}).contact as Record<string, any> | undefined;
      if (!contact) {
        return res.status(400).json({ ok: false, error: "Contact payload required." });
      }

      const sbAdmin = getSupabaseAdmin();
      if (!sbAdmin) {
        return res.status(500).json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY missing on server." });
      }

      const email =
        String(contact.email || "").trim().toLowerCase() ||
        `pending.${String(contact.organization || contact.id || Date.now())
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")}@pipeline.fortifai.local`;

      const resolvedCloseQtr =
        contact.expected_close ??
        contact.close_qtr ??
        contact.custom_fields?.expected_close ??
        contact.custom_fields?.close_qtr ??
        null;

      const mergedCustomFields = {
        ...(contact.custom_fields || {}),
        ...(resolvedCloseQtr !== null
          ? { expected_close: resolvedCloseQtr, close_qtr: resolvedCloseQtr }
          : {}),
      };

      const contactRow: Record<string, any> = {
        email,
        first_name: contact.first_name ?? null,
        last_name: contact.last_name ?? null,
        full_name: contact.full_name ?? null,
        organization: contact.organization ?? null,
        title: contact.title ?? null,
        region: contact.region ?? "US",
        location: contact.location ?? null,
        contact_type: contact.contact_type ?? "customer",
        buyer_persona: contact.buyer_persona ?? null,
        industry: contact.industry ?? null,
        tier: contact.tier ?? null,
        icp_score: contact.icp_score ?? null,
        fortune_500: Boolean(contact.fortune_500),
        owner: contact.owner ?? "Varun",
        relationship_strength: contact.relationship_strength ?? null,
        tags: Array.isArray(contact.tags) ? contact.tags : [],
        unsubscribed: Boolean(contact.unsubscribed),
        custom_fields: mergedCustomFields,
      };

      const { data: savedContact, error: cErr } = await sbAdmin
        .from("contacts")
        .upsert(contactRow, { onConflict: "email" })
        .select("*")
        .single();

      if (cErr) {
        return res.status(502).json({ ok: false, error: cErr.message });
      }

      if (savedContact?.id) {
        const oppPayload: Record<string, any> = {
          contact_id: savedContact.id,
          opportunity_type:
            savedContact.contact_type === "investor" ? "seed_investment" : "enterprise_deal",
          stage: contact.stage || "1 Lead",
          outcome: contact.outcome ?? null,
          meeting_booked: Boolean(contact.meeting_booked),
          product_or_instrument: contact.product_or_instrument ?? null,
          amount_usd: Number(contact.amount_usd ?? 0),
          probability: Number(contact.probability ?? 0),
          expected_close: resolvedCloseQtr,
          next_step: contact.next_step ?? null,
          notes: contact.notes ?? null,
          owner_email: contact.owner_email || "varun@fortifai.io",
          updated_at: new Date().toISOString(),
        };

        const { data: existingOpp } = await sbAdmin
          .from("opportunities")
          .select("id")
          .eq("contact_id", savedContact.id)
          .limit(1)
          .maybeSingle();

        if (existingOpp?.id) {
          const { error: uErr } = await sbAdmin
            .from("opportunities")
            .update(oppPayload)
            .eq("id", existingOpp.id);
          if (uErr) {
            return res.status(502).json({ ok: false, error: "opportunities update: " + uErr.message });
          }
        } else {
          const { error: iErr } = await sbAdmin.from("opportunities").insert(oppPayload);
          if (iErr) {
            return res.status(502).json({ ok: false, error: "opportunities insert: " + iErr.message });
          }
        }
      }

      return res.status(200).json({ ok: true, contact: savedContact });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Contact upsert failed";
      return res.status(500).json({ ok: false, error: msg });
    }
  });

  app.post("/api/crm/delete-contact", async (req: Request, res: Response) => {
    try {
      const authHeader = String(req.headers.authorization || "");
      const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
      const caller = verifySessionToken(bearer);
      if (!caller) {
        return res.status(401).json({ ok: false, error: "Unauthorized session." });
      }
      const email = String((req.body || {}).email || "").trim().toLowerCase();
      if (!email) return res.status(200).json({ ok: true });
      const sbAdmin = getSupabaseAdmin();
      if (sbAdmin) {
        await sbAdmin.from("contacts").delete().eq("email", email);
      }
      return res.status(200).json({ ok: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Delete failed";
      return res.status(500).json({ ok: false, error: msg });
    }
  });

  app.post("/api/admin/send-invite", async (req: Request, res: Response) => {
    try {
      const authHeader = String(req.headers.authorization || "");
      const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
      const caller = verifySessionToken(bearer);
      if (!caller || caller.role !== "super_admin") {
        return res.status(403).json({ ok: false, error: "Only super_admin can send workspace invites." });
      }

      const body = (req.body || {}) as {
        email?: string;
        full_name?: string;
        role?: string;
        permissions?: Record<string, boolean>;
        initialPassword?: string;
      };
      const email = String(body.email || "").trim().toLowerCase();
      const fullName = String(body.full_name || email.split("@")[0]).trim();
      const firstName = fullName.split(/\s+/)[0] || email.split("@")[0];
      const role = String(body.role || "sales_lead").trim();
      const allocatedRoleLabel = formatAllocatedRole(role);
      const initialPassword = String(body.initialPassword || "").trim();

      if (!email || !isAllowedDomainEmail(email)) {
        return res.status(400).json({ ok: false, error: "Valid @fortifai.io or @tryfortifai.us email required." });
      }

      // Option A: Generate short 16-char opaque join code + 7-day expiry stored on crm_users
      const inviteCode = generateOpaqueJoinCode(16);
      const inviteExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const sbAdmin = getSupabaseAdmin();
      if (sbAdmin) {
        const upsertRow: Record<string, unknown> = {
          email,
          full_name: fullName,
          sender_display_name: fullName,
          role,
          is_active: true,
          invite_code: inviteCode,
          invite_expires_at: inviteExpiresAt,
        };
        if (body.permissions) upsertRow.permissions = body.permissions;
        if (initialPassword.length >= 8) {
          upsertRow.password_hash = hashPasswordScrypt(initialPassword);
        }
        const { error: upsertErr } = await sbAdmin
          .from("crm_users")
          .upsert(upsertRow, { onConflict: "email" });

        // Fallback if invite_code column hasn't been added yet
        if (upsertErr) {
          delete upsertRow.invite_code;
          delete upsertRow.invite_expires_at;
          await sbAdmin.from("crm_users").upsert(upsertRow, { onConflict: "email" });
        }
      }

      const baseUrl = (process.env.APP_URL || "https://scale.fortifai.io").trim().replace(/\/+$/, "");
      const setupLink = `${baseUrl}/join/${inviteCode}`;

      const resendKey = (process.env.RESEND_API_KEY || "").trim();
      if (!resendKey || resendKey === "MY_RESEND_API_KEY") {
        return res.status(200).json({ ok: true, mode: "skipped_no_resend_key", setupLink });
      }

      const textBody = [
        "Join Fortifai Scale (Beta)",
        "",
        `Hi ${firstName},`,
        "",
        "Fortifai Marketing has invited you to join Fortifai Scale (Beta), our in-house Customer Relationship Management portal.",
        `- Your Login Email: ${email}`,
        `- Your Allocated Role: ${allocatedRoleLabel}`,
        "",
        `Activate Account & Set Password → (Join Now): ${setupLink}`,
        "",
        "Or use this direct link (valid for 7 days):",
        setupLink,
        "",
        "— Fortifai Marketing Team",
      ].join("\n");

      const htmlBody = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:28px 16px;background-color:#FFFFFF;font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',Roboto,sans-serif;color:#1E293B;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:540px;margin:0 auto;background-color:#FFFFFF;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;">
      <tr>
        <td style="padding:20px 28px;border-bottom:1px solid #E5E7EB;background-color:#FFFFFF;">
          <div style="font-size:17px;font-weight:600;color:#0F172A;letter-spacing:-0.01em;">
            Join Fortifai Scale (Beta)
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:24px 28px;font-size:14px;line-height:1.6;color:#334155;background-color:#FFFFFF;">
          <p style="margin:0 0 14px 0;color:#0F172A;">Hi ${escapeHtmlBasic(firstName)},</p>
          <p style="margin:0 0 16px 0;">
            Fortifai Marketing has invited you to join <strong style="color:#0F172A;">Fortifai Scale (Beta)</strong>, our in-house Customer Relationship Management portal.
          </p>
          <ul style="margin:0 0 22px 0;padding-left:18px;color:#1E293B;">
            <li style="margin-bottom:6px;"><strong>Your Login Email:</strong> <span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#2E5A8A;">${escapeHtmlBasic(email)}</span></li>
            <li><strong>Your Allocated Role:</strong> ${escapeHtmlBasic(allocatedRoleLabel)}</li>
          </ul>
          <div style="margin:0 0 22px 0;">
            <a href="${setupLink}" style="display:inline-block;padding:11px 20px;background-color:#2E5A8A;color:#FFFFFF;font-size:13.5px;font-weight:600;text-decoration:none;border-radius:6px;">
              Activate Account &amp; Set Password &rarr; (Join Now)
            </a>
          </div>
          <p style="margin:0 0 6px 0;font-size:12.5px;color:#64748B;">
            Or use this direct link (valid for 7 days):
          </p>
          <p style="margin:0 0 22px 0;font-size:12.5px;word-break:break-all;">
            <a href="${setupLink}" style="color:#2E5A8A;text-decoration:underline;">${setupLink}</a>
          </p>
          <p style="margin:0;font-size:13.5px;color:#475569;">
            &mdash; Fortifai Marketing Team
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

      const resendResp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Fortifai Support <support@fortifai.io>",
          reply_to: "varun@fortifai.io",
          to: [email],
          subject: "Your Fortifai Scale workspace invite",
          text: textBody,
          html: htmlBody,
        }),
      });

      const resendJson = await resendResp.json().catch(() => ({}));
      if (!resendResp.ok) {
        return res.status(502).json({
          ok: false,
          error: (resendJson as { message?: string }).message || "Resend failed to deliver invite.",
        });
      }

      return res.status(200).json({ ok: true, id: (resendJson as { id?: string }).id, setupLink });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invite dispatch error";
      return res.status(500).json({ ok: false, error: msg });
    }
  });

  app.get("/api/auth/invite-info/:code", async (req: Request, res: Response) => {
    try {
      const code = String(req.params.code || "").trim();
      if (!code || !/^[A-Za-z0-9]{8,32}$/.test(code)) {
        return res.status(400).json({ ok: false, error: "Invalid invitation code format." });
      }
      const sbAdmin = getSupabaseAdmin();
      if (!sbAdmin) {
        return res.status(500).json({ ok: false, error: "Supabase admin client unavailable." });
      }
      const { data: userRow, error } = await sbAdmin
        .from("crm_users")
        .select("email, full_name, role, is_active, invite_expires_at")
        .eq("invite_code", code)
        .maybeSingle();

      if (error || !userRow || userRow.is_active === false) {
        return res.status(404).json({
          ok: false,
          error: "This invitation link has already been used or is invalid. Ask your admin to click Resend Invite.",
        });
      }

      if (userRow.invite_expires_at && new Date(userRow.invite_expires_at).getTime() < Date.now()) {
        return res.status(410).json({
          ok: false,
          error: "This 7-day invitation link has expired. Ask your admin to click Resend Invite.",
        });
      }

      return res.status(200).json({
        ok: true,
        email: userRow.email,
        full_name: userRow.full_name,
        role: formatAllocatedRole(userRow.role),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to verify invite code";
      return res.status(500).json({ ok: false, error: msg });
    }
  });

  app.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
    try {
      const email = String((req.body || {}).email || "").trim().toLowerCase();
      if (!email || !isValidEmail(email) || !isAllowedDomainEmail(email)) {
        return res.status(400).json({
          ok: false,
          error: "Enter a valid @fortifai.io or @tryfortifai.us workspace email.",
        });
      }

      let dbUser: Record<string, any> | null = null;
      try {
        dbUser = await Promise.race([
          fetchCrmUserByEmail(email),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
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
          error: `"${email}" is not an active provisioned user in Fortifai Scale. Ask varun@fortifai.io to invite this email first.`,
        });
      }

      const role = typeof dbUser.role === "string" && SERVER_ROLE_PRESETS[dbUser.role]
        ? dbUser.role
        : "analyst_viewer";
      const permissions = {
        ...SERVER_ROLE_PRESETS[role],
        ...(dbUser.permissions || {}),
      };

      const inviteCode = generateOpaqueJoinCode(16);
      const inviteExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const sbAdmin = getSupabaseAdmin();
      let useCodeLink = false;
      if (sbAdmin) {
        const { error: codeErr } = await sbAdmin
          .from("crm_users")
          .update({ invite_code: inviteCode, invite_expires_at: inviteExpiresAt })
          .eq("email", email);
        if (!codeErr) useCodeLink = true;
      }

      const resetClaims: SessionClaims = {
        email,
        role,
        permissions,
        exp: Date.now() + 60 * 60 * 1000,
      };
      const resetToken = signSessionToken(resetClaims);
      const baseUrl = (process.env.APP_URL || "https://scale.fortifai.io").trim().replace(/\/+$/, "");
      const setupLink = useCodeLink
        ? `${baseUrl}/join/${inviteCode}`
        : `${baseUrl}/?inviteToken=${encodeURIComponent(resetToken)}&email=${encodeURIComponent(email)}`;

      const resendKey = (process.env.RESEND_API_KEY || "").trim();
      if (!resendKey || resendKey === "MY_RESEND_API_KEY") {
        return res.status(500).json({
          ok: false,
          error: "RESEND_API_KEY is not configured on the server to send password reset emails.",
        });
      }

      const resendResp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Fortifai Support <support@fortifai.io>",
          reply_to: "varun@fortifai.io",
          to: [email],
          subject: "Fortifai Scale — Set or Reset Your Password",
          text: [
            `Hi ${(dbUser.full_name || email.split("@")[0]).split(/\s+/)[0]},`,
            "",
            "Click the link below to set or reset your Fortifai Scale password (valid for 60 minutes):",
            setupLink,
            "",
            "— Fortifai Marketing Team",
          ].join("\n"),
        }),
      });

      const resendJson = await resendResp.json().catch(() => ({}));
      if (!resendResp.ok) {
        return res.status(502).json({
          ok: false,
          error: (resendJson as { message?: string }).message || "Failed to send password setup email via Resend.",
        });
      }

      return res.status(200).json({ ok: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Password reset request failed";
      return res.status(500).json({ ok: false, error: msg });
    }
  });

  app.post("/api/auth/accept-invite", async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as {
        inviteCode?: string;
        inviteToken?: string;
        newPassword?: string;
      };
      const inviteCode = String(body.inviteCode || "").trim();
      const inviteToken = String(body.inviteToken || "").trim();
      const newPassword = String(body.newPassword || "");

      if (newPassword.length < 8) {
        return res.status(400).json({
          ok: false,
          error: "Choose a password with at least 8 characters.",
        });
      }

      const sbAdmin = getSupabaseAdmin();
      let targetEmail = "";
      let targetRole = "sales_lead";
      let targetPermissions: Record<string, boolean> = { ...SERVER_ROLE_PRESETS.sales_lead };
      let existingUserRow: Record<string, any> | null = null;

      if (inviteCode) {
        if (!sbAdmin) {
          return res.status(500).json({ ok: false, error: "Supabase admin client unavailable." });
        }
        const { data: row, error } = await sbAdmin
          .from("crm_users")
          .select("*")
          .eq("invite_code", inviteCode)
          .maybeSingle();

        if (error || !row || row.is_active === false) {
          return res.status(401).json({
            ok: false,
            error: "This invitation link is invalid or already used. Ask your admin to resend your invite.",
          });
        }
        if (row.invite_expires_at && new Date(row.invite_expires_at).getTime() < Date.now()) {
          return res.status(401).json({
            ok: false,
            error: "This invitation link has expired. Ask your admin to resend your invite.",
          });
        }
        existingUserRow = row;
        targetEmail = String(row.email || "").trim().toLowerCase();
        targetRole = typeof row.role === "string" && SERVER_ROLE_PRESETS[row.role] ? row.role : "sales_lead";
        targetPermissions = {
          ...SERVER_ROLE_PRESETS[targetRole],
          ...(row.permissions || {}),
        };
      } else {
        const claims = verifySessionToken(inviteToken);
        if (!claims || !isAllowedDomainEmail(claims.email)) {
          return res.status(401).json({
            ok: false,
            error: "This invitation link is invalid or expired. Ask your admin to click Resend Invite.",
          });
        }
        targetEmail = claims.email;
        targetRole = claims.role;
        targetPermissions = claims.permissions;
      }

      if (!targetEmail || !isAllowedDomainEmail(targetEmail)) {
        return res.status(401).json({ ok: false, error: "Unauthorized workspace domain." });
      }

      const newHash = hashPasswordScrypt(newPassword);
      let dbUser: Record<string, any> | null = existingUserRow;

      if (sbAdmin) {
        const updatePayload: Record<string, unknown> = {
          email: targetEmail,
          full_name: existingUserRow?.full_name || targetEmail.split("@")[0],
          sender_display_name:
            existingUserRow?.sender_display_name ||
            existingUserRow?.full_name ||
            targetEmail.split("@")[0],
          role: targetRole,
          permissions: targetPermissions,
          is_active: true,
          password_hash: newHash,
          last_login_at: new Date().toISOString(),
          invite_code: null,
          invite_expires_at: null,
        };
        const { data, error: upErr } = await sbAdmin
          .from("crm_users")
          .upsert(updatePayload, { onConflict: "email" })
          .select("*")
          .single();

        if (upErr) {
          delete updatePayload.invite_code;
          delete updatePayload.invite_expires_at;
          const fallback = await sbAdmin
            .from("crm_users")
            .upsert(updatePayload, { onConflict: "email" })
            .select("*")
            .single();
          dbUser = fallback.data || existingUserRow;
        } else {
          dbUser = data || existingUserRow;
        }
      }

      const sessionClaims: SessionClaims = {
        email: targetEmail,
        role: targetRole,
        permissions: targetPermissions,
        exp: Date.now() + 12 * 60 * 60 * 1000,
      };
      const token = signSessionToken(sessionClaims);

      return res.status(200).json({
        ok: true,
        token,
        user: {
          id: dbUser?.id || `usr_${targetEmail}`,
          email: targetEmail,
          full_name: dbUser?.full_name || targetEmail.split("@")[0],
          sender_display_name:
            dbUser?.sender_display_name || dbUser?.full_name || targetEmail.split("@")[0],
          role: targetRole,
          permissions: targetPermissions,
          is_active: true,
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to complete invite setup";
      return res.status(500).json({ ok: false, error: msg });
    }
  });

  app.post("/api/admin/delete-user", async (req: Request, res: Response) => {
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
          await sbAdmin
            .from("opportunities")
            .update({ owner_id: null, owner_email: "varun@fortifai.io" })
            .eq("owner_email", email);
        } catch {}
        await sbAdmin.from("crm_users").delete().eq("email", email);
      }
      return res.status(200).json({ ok: true, email });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Delete user failed";
      return res.status(500).json({ ok: false, error: msg });
    }
  });

  app.post("/api/auth/set-password", async (req: Request, res: Response) => {
    try {
      const authHeader = String(req.headers.authorization || "");
      const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
      const caller = verifySessionToken(bearer);
      if (!caller) {
        return res.status(401).json({ ok: false, error: "Valid session required." });
      }

      const body = (req.body || {}) as { targetEmail?: string; newPassword?: string };
      const targetEmail = String(body.targetEmail || caller.email).trim().toLowerCase();
      const newPassword = String(body.newPassword || "");

      if (targetEmail !== caller.email && caller.role !== "super_admin") {
        return res.status(403).json({
          ok: false,
          error: "Only super_admin can reset another user's password.",
        });
      }
      if (newPassword.length < 8) {
        return res.status(400).json({
          ok: false,
          error: "Password must be at least 8 characters long.",
        });
      }

      const supabaseAdmin = getSupabaseAdmin();
      if (!supabaseAdmin) {
        return res.status(500).json({
          ok: false,
          error: "SUPABASE_SERVICE_ROLE_KEY is required on the server to store password hashes.",
        });
      }

      const newHash = hashPasswordScrypt(newPassword);
      const { error } = await supabaseAdmin
        .from("crm_users")
        .update({ password_hash: newHash })
        .eq("email", targetEmail);

      if (error) {
        return res.status(500).json({
          ok: false,
          error: `Failed to save password_hash (ensure password_hash text column exists on crm_users): ${error.message}`,
        });
      }

      return res.status(200).json({ ok: true, targetEmail });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Password update failed";
      return res.status(500).json({ ok: false, error: msg });
    }
  });

  
  app.post('/api/auth/logout', async (req: Request, res: Response) => {
    const body = (req.body || {}) as {
      accessLogId?: string;
      email?: string;
      reason?: string;
    };
    const authHeader = req.headers.authorization || '';
    const claims = authHeader.startsWith('Bearer ')
      ? verifySessionToken(authHeader.slice(7).trim())
      : null;

    const accessLogId = typeof body.accessLogId === 'string' ? body.accessLogId.trim() : '';
    const email = (claims?.email || (typeof body.email === 'string' ? body.email.trim().toLowerCase() : '')).toLowerCase();
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 64) : 'manual_signout';
    const nowIso = new Date().toISOString();

    const supabaseAdmin = getServiceSupabaseClient();
    if (supabaseAdmin) {
      try {
        if (accessLogId) {
          await supabaseAdmin
            .from('user_access_logs')
            .update({ logout_at: nowIso, logout_reason: reason })
            .eq('id', accessLogId)
            .is('logout_at', null);
        } else if (email && isAllowedDomainEmail(email)) {
          const { data: latestOpen } = await supabaseAdmin
            .from('user_access_logs')
            .select('id')
            .eq('user_email', email)
            .is('logout_at', null)
            .order('login_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (latestOpen?.id) {
            await supabaseAdmin
              .from('user_access_logs')
              .update({ logout_at: nowIso, logout_reason: reason })
              .eq('id', latestOpen.id);
          }
        }
      } catch {
        // Non-blocking
      }
    }

    res.json({ ok: true, logoutAt: nowIso });
  });

  app.get('/api/admin/access-logs', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const claims = req.session;
    if (!claims || claims.role !== 'super_admin') {
      res.status(403).json({
        ok: false,
        error: 'Access denied. Only super_admin users can view workspace access logs.',
      });
      return;
    }

    const supabaseAdmin = getServiceSupabaseClient();
    if (!supabaseAdmin) {
      res.status(503).json({
        ok: false,
        error: 'SUPABASE_SERVICE_ROLE_KEY is not configured on the server.',
      });
      return;
    }

    // Authoritative check in crm_users to ensure caller is still an active super_admin
    try {
      const dbCaller = await fetchCrmUserByEmail(claims.email);
      if (dbCaller && (dbCaller.role !== 'super_admin' || dbCaller.is_active === false)) {
        res.status(403).json({
          ok: false,
          error: 'Access denied. Active super_admin role required.',
        });
        return;
      }
    } catch {
      // Fall back to verified JWT claims
    }

    const { data, error } = await supabaseAdmin
      .from('user_access_logs')
      .select('id, user_id, user_email, user_name, user_role, login_at, logout_at, logout_reason, ip_address, user_agent')
      .order('login_at', { ascending: false })
      .limit(500);

    if (error) {
      res.status(500).json({
        ok: false,
        error: error.message || 'Failed to load user_access_logs from Supabase.',
      });
      return;
    }

    res.json({ ok: true, logs: data || [] });
  });

app.post('/api/auth/session', async (req: Request, res: Response) => {
    const body = (req.body || {}) as {
      email?: string;
      role?: string;
      permissions?: Partial<SessionPermissions>;
      is_active?: boolean;
      simulateRole?: string;
      simulatePermissions?: Partial<SessionPermissions>;
    };

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email || !isValidEmail(email) || !isAllowedDomainEmail(email)) {
      res.status(403).json({
        ok: false,
        error: 'Access restricted to authenticated @fortifai.io or @tryfortifai.us accounts.',
      });
      return;
    }

    // Authoritative check against Supabase crm_users when configured
    let dbUser: Record<string, any> | null = null;
    try {
      dbUser = await Promise.race([
        fetchCrmUserByEmail(email),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
      ]);
    } catch {
      dbUser = null;
    }
    if (!dbUser && FALLBACK_CRM_USERS[email]) {
      dbUser = FALLBACK_CRM_USERS[email] as any;
    }
    if (dbUser && !dbUser.is_active) {
      res.status(403).json({
        ok: false,
        error: 'This user account is deactivated in crm_users.',
      });
      return;
    }

    if (body.is_active === false) {
      res.status(403).json({
        ok: false,
        error: 'This user account is deactivated in crm_users.',
      });
      return;
    }

    const baseRole = dbUser?.role || (typeof body.role === 'string' ? body.role : 'analyst_viewer');
    const sourcePerms = dbUser?.permissions || body.permissions;
    const basePermissions: SessionPermissions = {
      can_view_customers: Boolean(sourcePerms?.can_view_customers),
      can_edit_customers: Boolean(sourcePerms?.can_edit_customers),
      can_view_investors: Boolean(sourcePerms?.can_view_investors),
      can_edit_investors: Boolean(sourcePerms?.can_edit_investors),
      can_send_campaigns: Boolean(sourcePerms?.can_send_campaigns),
      can_send_as_marketing:
        Boolean(sourcePerms?.can_send_as_marketing) ||
        ['super_admin', 'admin', 'marketing'].includes(baseRole),
      can_manage_schema: Boolean(sourcePerms?.can_manage_schema),
      can_manage_users: Boolean(sourcePerms?.can_manage_users),
    };

    let finalRole = baseRole;
    let finalPermissions = basePermissions;
    let simulated = false;

    const requestedSimRole =
      typeof body.simulateRole === 'string' ? body.simulateRole.trim() : '';
    if (requestedSimRole && basePermissions.can_manage_users && SERVER_ROLE_PRESETS[requestedSimRole]) {
      simulated = true;
      finalRole = requestedSimRole;
      const preset = SERVER_ROLE_PRESETS[requestedSimRole];
      const requestedSimPerms: SessionPermissions = body.simulatePermissions
        ? {
            can_view_customers: Boolean(body.simulatePermissions.can_view_customers),
            can_edit_customers: Boolean(body.simulatePermissions.can_edit_customers),
            can_view_investors: Boolean(body.simulatePermissions.can_view_investors),
            can_edit_investors: Boolean(body.simulatePermissions.can_edit_investors),
            can_send_campaigns: Boolean(body.simulatePermissions.can_send_campaigns),
            can_send_as_marketing: Boolean(body.simulatePermissions.can_send_as_marketing),
            can_manage_schema: Boolean(body.simulatePermissions.can_manage_schema),
            can_manage_users: Boolean(body.simulatePermissions.can_manage_users),
          }
        : preset;
      // Intersect with basePermissions so simulation can NEVER escalate privileges
      finalPermissions = intersectSessionPermissions(basePermissions, requestedSimPerms);
    }

    const claims: SessionClaims = {
      email,
      role: finalRole,
      permissions: finalPermissions,
      ...(simulated ? { simulated: true } : {}),
      exp: Date.now() + 1000 * 60 * 60 * 12,
    };

    const token = signSessionToken(claims);
    let accessLogId: string | null = null;
    if (supabaseAdmin) {
      accessLogId = `alog_${crypto.randomUUID().slice(0, 12)}`;
      const forwarded = req.headers["x-forwarded-for"];
      const ipAddress = Array.isArray(forwarded)
        ? forwarded[0]
        : typeof forwarded === "string"
        ? forwarded.split(",")[0].trim()
        : req.socket?.remoteAddress || null;
      const userAgent = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"].slice(0, 300) : null;
      try {
        await Promise.race([
          supabaseAdmin.from("user_access_logs").insert({
            id: accessLogId,
            user_id: userPayload.id,
            user_email: userPayload.email,
            user_name: userPayload.full_name,
            user_role: userPayload.role,
            login_at: new Date().toISOString(),
            ip_address: ipAddress,
            user_agent: userAgent,
          }),
          new Promise((r) => setTimeout(r, 1500)),
        ]);
      } catch {
        // Non-blocking if table has not been created yet
      }
    }

    res.json({ ok: true, token, accessLogId, claims });
  });

  app.post('/api/send-batch', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const dbSender = req.session?.email ? await fetchCrmUserByEmail(req.session.email) : null;
    if (dbSender && !dbSender.is_active) {
      res.status(403).json({ ok: false, error: 'Account is deactivated in crm_users.' });
      return;
    }

    const sessionPerms = req.session?.permissions;
    const isSimulatedAdminSession =
      Boolean(req.session?.simulated) && Boolean(dbSender?.permissions?.can_manage_users);
    const effectivePerms: SessionPermissions = dbSender
      ? isSimulatedAdminSession && sessionPerms
        ? intersectSessionPermissions(dbSender.permissions, sessionPerms)
        : dbSender.permissions
      : sessionPerms || SERVER_ROLE_PRESETS.analyst_viewer;

    const effectiveCanSend = effectivePerms.can_send_campaigns;
    const effectiveRole = isSimulatedAdminSession
      ? req.session?.role || 'analyst_viewer'
      : dbSender?.role || req.session?.role || 'analyst_viewer';
    const effectiveCanSendAsMarketing =
      ['super_admin', 'admin', 'marketing'].includes(effectiveRole) ||
      Boolean(effectivePerms.can_send_as_marketing);

    const effectiveCanViewCustomers = effectivePerms.can_view_customers;
    const effectiveCanViewInvestors = effectivePerms.can_view_investors;

    if (!effectiveCanSend) {
      res.status(403).json({
        ok: false,
        error: 'Permission denied: can_send_campaigns is required to dispatch campaigns.',
      });
      return;
    }

    const payload = (req.body || {}) as {
      audienceType?: 'customer' | 'investor';
      senderMode?: 'selected' | 'deal_owner';
      portalLinkMode?: 'none' | 'overview' | 'investor';
      testMode?: boolean;
      from?: string;
      replyTo?: string;
      bcc?: string;
      recipients?: {
        id: string;
        email: string;
        name: string;
        subject: string;
        text: string;
        from?: string;
      }[];
    };

    const isTestMode = payload.testMode === true;

    const audienceType: 'customer' | 'investor' =
      payload.audienceType === 'investor' ? 'investor' : 'customer';

    const portalLinkMode: 'none' | 'overview' | 'investor' =
      payload.portalLinkMode === 'overview' || payload.portalLinkMode === 'investor'
        ? payload.portalLinkMode
        : 'none';

    if (audienceType === 'customer' && portalLinkMode === 'investor') {
      res.status(403).json({
        ok: false,
        error: 'Domain isolation violation: Investor Portal links cannot be attached to Customer Outreach.',
      });
      return;
    }
    if (audienceType === 'investor' && portalLinkMode === 'overview') {
      res.status(403).json({
        ok: false,
        error: 'Domain isolation violation: Product Overview links cannot be attached to Investor Outreach.',
      });
      return;
    }

    if (audienceType === 'investor' && !effectiveCanViewInvestors) {
      res.status(403).json({
        ok: false,
        error: 'Permission denied: can_view_investors is required for Investor Outreach.',
      });
      return;
    }
    if (audienceType === 'customer' && !effectiveCanViewCustomers) {
      res.status(403).json({
        ok: false,
        error: 'Permission denied: can_view_customers is required for Customer Outreach.',
      });
      return;
    }

    const recipients = Array.isArray(payload.recipients) ? payload.recipients : [];
    if (recipients.length === 0) {
      res.status(400).json({ ok: false, error: 'At least one recipient is required.' });
      return;
    }

    const bcc = typeof payload.bcc === 'string' && payload.bcc.trim() ? payload.bcc.trim() : undefined;
    if (bcc && (!isValidEmail(bcc) || containsHeaderInjection(bcc))) {
      res.status(400).json({ ok: false, error: 'Invalid BCC email address.' });
      return;
    }

    const explicitReplyTo =
      typeof payload.replyTo === 'string' && payload.replyTo.trim()
        ? payload.replyTo.trim()
        : undefined;
    if (explicitReplyTo && (!isValidEmail(explicitReplyTo) || containsHeaderInjection(explicitReplyTo))) {
      res.status(400).json({ ok: false, error: 'Invalid Reply-To email address.' });
      return;
    }

    const defaultFrom =
      typeof payload.from === 'string' && payload.from.trim()
        ? payload.from.trim()
        : `${req.session!.email}`;

    const senderMode = payload.senderMode === 'deal_owner' ? 'deal_owner' : 'selected';
    const resolvedRecipients: {
      id: string;
      email: string;
      name: string;
      subject: string;
      text: string;
      fromHeader: string;
      senderEmail: string;
      replyToEmail: string;
    }[] = [];

    for (const r of recipients) {
      if (!r.email || !isValidEmail(r.email) || !r.subject || !r.text) {
        res.status(400).json({
          ok: false,
          error: `Invalid recipient payload for ${r.name || 'unknown contact'}.`,
        });
        return;
      }

      const rawFrom =
        senderMode === 'deal_owner' && typeof r.from === 'string' && r.from.trim()
          ? r.from.trim()
          : defaultFrom;

      if (containsHeaderInjection(rawFrom) || containsHeaderInjection(r.subject)) {
        res.status(400).json({
          ok: false,
          error: 'Invalid characters in email header.',
        });
        return;
      }

      const senderEmail = extractEmailAddress(rawFrom);
      if (!isValidEmail(senderEmail)) {
        res.status(400).json({
          ok: false,
          error: `Invalid Send From email address: "${rawFrom}".`,
        });
        return;
      }

      if (senderEmail === 'contact@fortifai.io') {
        if (!effectiveCanSendAsMarketing) {
          res.status(403).json({
            ok: false,
            error:
              'Permission denied: super_admin, admin, marketing role or can_send_as_marketing permission is required to send from contact@fortifai.io.',
          });
          return;
        }
      } else {
        if (!isAllowedDomainEmail(senderEmail)) {
          res.status(403).json({
            ok: false,
            error: 'Send From identity must use an @fortifai.io or @tryfortifai.us domain.',
          });
          return;
        }
        if (
          senderEmail !== req.session!.email.toLowerCase() &&
          senderMode !== 'deal_owner' &&
          !['super_admin', 'admin'].includes(effectiveRole)
        ) {
          res.status(403).json({
            ok: false,
            error:
              'Permission denied: you may only send from your own workspace address unless Deal Owner batch routing is enabled.',
          });
          return;
        }
      }

      const replyToEmail =
        explicitReplyTo ||
        (senderEmail === 'contact@fortifai.io' ? req.session!.email : senderEmail);

      resolvedRecipients.push({
        id: r.id,
        email: r.email,
        name: r.name,
        subject: r.subject,
        text: r.text,
        fromHeader: rawFrom,
        senderEmail,
        replyToEmail,
      });
    }

    if (isTestMode && resolvedRecipients.length > 5) {
      res.status(400).json({
        ok: false,
        error: 'Test Send Guard: test batches are capped at 5 recipients.',
      });
      return;
    }

    if (isTestMode) {
      const nonFortifaiTarget = resolvedRecipients.find((r) => !isFortifaiInternalEmail(r.email));
      if (nonFortifaiTarget) {
        res.status(403).json({
          ok: false,
          safeModeBlocked: true,
          error: `Test Send Guard: test emails may only ever be sent to @fortifai.io addresses (blocked "${nonFortifaiTarget.email}").`,
        });
        return;
      }
    }

    const resendKey = process.env.RESEND_API_KEY || '';
    const hasLiveResend = Boolean(resendKey && resendKey !== 'MY_RESEND_API_KEY');
    const supabaseAdmin = getServiceSupabaseClient();

    const verifiedLiveExternalIds = new Set<string>();
    const blockedReasons = new Map<string, string>();

    if (!isTestMode) {
      const externalRecipients = resolvedRecipients.filter(
        (r) => !isFortifaiInternalEmail(r.email)
      );

      if (supabaseAdmin) {
        try {
          const allIds = resolvedRecipients.map((r) => r.id).filter(Boolean);
          const { data: contactRows, error: contactsQueryErr } =
            allIds.length > 0
              ? await supabaseAdmin
                  .from('contacts')
                  .select('id, email, contact_type, is_demo')
                  .in('id', allIds)
              : { data: [], error: null };

          if (contactsQueryErr) {
            for (const ext of externalRecipients) {
              blockedReasons.set(
                ext.id,
                `Safe Mode Guard: unable to verify live Supabase contacts.is_demo = false (${contactsQueryErr.message}).`
              );
            }
          } else {
            const rowById = new Map(
              ((contactRows || []) as {
                id: string;
                email?: string | null;
                contact_type?: string | null;
                is_demo?: boolean | null;
              }[]).map((row) => [String(row.id), row])
            );

            for (const r of resolvedRecipients) {
              const row = rowById.get(r.id);
              if (row && row.contact_type && row.contact_type !== audienceType) {
                res.status(403).json({
                  ok: false,
                  error: `Domain isolation violation: recipient "${row.id}" does not belong to the ${audienceType} domain.`,
                });
                return;
              }

              if (!isFortifaiInternalEmail(r.email)) {
                if (!row) {
                  blockedReasons.set(
                    r.id,
                    `Safe Mode Guard: "${r.email}" does not exist in live Supabase contacts table.`
                  );
                } else if (
                  String(row.email || '').trim().toLowerCase() !== r.email.trim().toLowerCase()
                ) {
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
          const msg = err instanceof Error ? err.message : 'Supabase lookup failed';
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
        status: 'blocked' as const,
        error:
          blockedReasons.get(r.id) ||
          'Safe Mode Guard: external domain blocked (requires live Supabase contacts row with is_demo = false).',
      }));
      res.status(403).json({
        ok: false,
        safeModeBlocked: true,
        error: blockedResults[0]?.error,
        blockedCount: blockedResults.length,
        results: blockedResults,
      });
      return;
    }

    const campaignId = isTestMode ? null : `cmp_${crypto.randomUUID().slice(0, 10)}`;
    const sentAtIso = new Date().toISOString();

    if (!isTestMode && supabaseAdmin && campaignId) {
      try {
        await supabaseAdmin.from('campaigns').insert({
          id: campaignId,
          audience_type: audienceType,
          subject: eligibleForDispatch[0]?.subject || 'Fortifai Outreach',
          body: eligibleForDispatch[0]?.text || '',
          created_at: sentAtIso,
        });
      } catch {
        // Non-blocking if table doesn't exist in sandbox
      }
    }

    const results: {
      contact_id: string;
      email: string;
      from: string;
      status: 'delivered' | 'bounced' | 'blocked';
      resend_id?: string;
      error?: string;
    }[] = [];

    let liveSendIndex = 0;
    for (let i = 0; i < resolvedRecipients.length; i += 1) {
      const r = resolvedRecipients[i];
      const blockedReason = blockedReasons.get(r.id);
      if (blockedReason) {
        results.push({
          contact_id: r.id,
          email: r.email,
          from: r.fromHeader,
          status: 'blocked',
          error: blockedReason,
        });
        continue;
      }

      // Defense-in-depth gate right before any Resend HTTP call
      const canDispatchResend = isTestMode
        ? isFortifaiInternalEmail(r.email)
        : isFortifaiInternalEmail(r.email) || verifiedLiveExternalIds.has(r.id);

      if (!canDispatchResend) {
        results.push({
          contact_id: r.id,
          email: r.email,
          from: r.fromHeader,
          status: 'blocked',
          error: 'Safe Mode Guard: recipient failed external domain verification.',
        });
        continue;
      }

      const finalSubject = isTestMode
        ? r.subject.startsWith('[TEST]')
          ? r.subject
          : `[TEST] ${r.subject}`
        : r.subject;

      let finalText = r.text;
      if (portalLinkMode === 'none') {
        finalText = finalText.replace(/\n?\s*\{\{portal_link\}\}\s*/g, '').trimEnd();
      } else {
        const portalHost =
          portalLinkMode === 'investor' ? 'investor.fortifai.io' : 'overview.fortifai.io';
        const trackedUrl = `https://${portalHost}/?ref=${encodeURIComponent(r.id)}`;
        if (finalText.includes('{{portal_link}}')) {
          finalText = finalText.replace(/\{\{portal_link\}\}/g, trackedUrl);
        } else if (!finalText.includes(`${portalHost}/?ref=`)) {
          const ctaLabel =
            portalLinkMode === 'investor'
              ? 'Investor portal & deck'
              : 'Interactive product overview';
          finalText = `${finalText.trimEnd()}\n\n${ctaLabel}: ${trackedUrl}`;
        }
      }

      let status: 'delivered' | 'bounced' = 'delivered';
      let resendId = `sim_${crypto.randomUUID().slice(0, 8)}`;
      let errorMsg: string | undefined;

      if (hasLiveResend) {
        if (liveSendIndex > 0) {
          await new Promise((resolve) => setTimeout(resolve, 160));
        }
        liveSendIndex += 1;
        try {
          const resp = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${resendKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: r.fromHeader,
              to: [r.email],
              reply_to: r.replyToEmail,
              ...(bcc && !isTestMode ? { bcc: [bcc] } : {}),
              subject: finalSubject,
              text: finalText,
            }),
          });
          const data = (await resp.json()) as { id?: string; message?: string };
          if (!resp.ok) {
            status = 'bounced';
            errorMsg = data.message || `Resend HTTP ${resp.status}`;
            resendId = '';
          } else {
            resendId = data.id || resendId;
          }
        } catch (err) {
          status = 'bounced';
          errorMsg = err instanceof Error ? err.message : 'Network error';
          resendId = '';
        }
      }

      results.push({
        contact_id: r.id,
        email: r.email,
        from: r.fromHeader,
        status,
        ...(resendId ? { resend_id: resendId } : {}),
        ...(errorMsg ? { error: errorMsg } : {}),
      });

      if (!isTestMode && supabaseAdmin && campaignId) {
        try {
          await supabaseAdmin.from('email_logs').insert({
            id: `log_${crypto.randomUUID().slice(0, 10)}`,
            contact_id: r.id,
            campaign_id: campaignId,
            resend_email_id: resendId || null,
            sender_email: r.senderEmail,
            reply_to_email: r.replyToEmail,
            status: status === 'delivered' ? 'sent' : 'bounced',
            sent_at: sentAtIso,
          });
          if (status === 'delivered') {
            await supabaseAdmin
              .from('contacts')
              .update({ last_contacted_at: sentAtIso })
              .eq('id', r.id);
          }
        } catch {
          // Non-blocking sync
        }
      }
    }

    res.json({
      ok: true,
      mode: hasLiveResend ? 'resend' : 'sandbox',
      testMode: isTestMode,
      portalLinkMode,
      campaignId,
      senderMode,
      bcc: !isTestMode && bcc ? bcc : null,
      sentCount: results.filter((r) => r.status === 'delivered').length,
      blockedCount: results.filter((r) => r.status === 'blocked').length,
      results,
    });
  });

  app.post('/api/webhooks/resend', async (req: Request, res: Response) => {
    const rawBody = (req as Request & { rawBody?: string }).rawBody || JSON.stringify(req.body || {});
    if (!verifyResendSvixSignature(req, rawBody)) {
      res.status(401).json({ ok: false, error: 'Invalid Resend webhook signature.' });
      return;
    }

    const body = (req.body || {}) as {
      type?: string;
      created_at?: string;
      data?: {
        email_id?: string;
        to?: string[] | string;
        from?: string;
        subject?: string;
        reason?: string;
        bounce?: { message?: string };
      };
    };

    const eventType = typeof body.type === 'string' ? body.type.trim() : '';
    const allowedEvents = new Set([
      'email.delivered',
      'email.opened',
      'email.clicked',
      'email.bounced',
      'email.complained',
    ]);
    if (!allowedEvents.has(eventType)) {
      res.status(400).json({ ok: false, error: `Unsupported Resend webhook event: "${eventType}".` });
      return;
    }

    const resendEmailId = body.data?.email_id?.trim() || '';
    const eventTimeIso =
      typeof body.created_at === 'string' && !Number.isNaN(Date.parse(body.created_at))
        ? new Date(body.created_at).toISOString()
        : new Date().toISOString();

    const toField = body.data?.to;
    const recipientEmail = Array.isArray(toField)
      ? String(toField[0] || '').trim().toLowerCase()
      : typeof toField === 'string'
      ? toField.trim().toLowerCase()
      : '';

    const supabaseAdmin = getServiceSupabaseClient();
    let botScanFiltered = false;
    let suppressedContact = false;
    let matchedContactId: string | null = null;

    if (supabaseAdmin) {
      try {
        let logRow: Record<string, unknown> | null = null;
        if (resendEmailId) {
          const { data } = await supabaseAdmin
            .from('email_logs')
            .select('*')
            .eq('resend_email_id', resendEmailId)
            .maybeSingle();
          logRow = (data as Record<string, unknown>) || null;
        }

        if (!logRow && recipientEmail) {
          const { data: contactRow } = await supabaseAdmin
            .from('contacts')
            .select('id')
            .eq('email', recipientEmail)
            .maybeSingle();
          if (contactRow?.id) {
            matchedContactId = String(contactRow.id);
            const { data: latestLog } = await supabaseAdmin
              .from('email_logs')
              .select('*')
              .eq('contact_id', matchedContactId)
              .order('sent_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            logRow = (latestLog as Record<string, unknown>) || null;
          }
        } else if (logRow?.contact_id) {
          matchedContactId = String(logRow.contact_id);
        }

        if (eventType === 'email.opened' && logRow?.sent_at) {
          const sentMs = Date.parse(String(logRow.sent_at));
          const eventMs = Date.parse(eventTimeIso);
          if (!Number.isNaN(sentMs) && !Number.isNaN(eventMs) && eventMs - sentMs < 10_000) {
            botScanFiltered = true;
          }
        }

        if (logRow?.id && !botScanFiltered) {
          const patch: Record<string, unknown> = {};
          if (eventType === 'email.delivered') {
            patch.status = 'delivered';
            patch.delivered_at = eventTimeIso;
          } else if (eventType === 'email.opened') {
            patch.status = 'opened';
            patch.opened_at = eventTimeIso;
          } else if (eventType === 'email.clicked') {
            patch.status = 'clicked';
            patch.clicked_at = eventTimeIso;
          } else if (eventType === 'email.bounced') {
            patch.status = 'bounced';
          } else if (eventType === 'email.complained') {
            patch.status = 'complained';
          }
          await supabaseAdmin.from('email_logs').update(patch).eq('id', logRow.id);
        }

        if ((eventType === 'email.bounced' || eventType === 'email.complained') && matchedContactId) {
          await supabaseAdmin
            .from('contacts')
            .update({ unsubscribed: true })
            .eq('id', matchedContactId);
          suppressedContact = true;
        }
      } catch {
        // Non-blocking if Supabase table is unavailable
      }
    }

    res.json({
      ok: true,
      eventType,
      resendEmailId: resendEmailId || null,
      contactId: matchedContactId,
      botScanFiltered,
      suppressedContact,
      processedAt: eventTimeIso,
    });
  });

  // Public CORS-enabled endpoint for investor.fortifai.io & overview.fortifai.io telemetry
  app.options('/api/track-portal', (_req: Request, res: Response) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).end();
  });

  app.post('/api/track-portal', async (req: Request, res: Response) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    const body = (req.body || {}) as {
      contactId?: string;
      portal?: string;
      eventType?: string;
      metadata?: Record<string, unknown>;
    };

    const contactId = typeof body.contactId === 'string' ? body.contactId.trim() : '';
    const portal = typeof body.portal === 'string' ? body.portal.trim().toLowerCase() : '';
    const eventType = typeof body.eventType === 'string' ? body.eventType.trim() : 'visit';
    const metadata =
      body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
        ? body.metadata
        : {};

    if (!contactId || contactId.length > 120) {
      res.status(400).json({ ok: false, error: 'Valid contactId is required.' });
      return;
    }
    if (!ALLOWED_PORTALS.has(portal)) {
      res.status(400).json({
        ok: false,
        error: 'portal must be investor.fortifai.io or overview.fortifai.io.',
      });
      return;
    }
    if (!ALLOWED_PORTAL_EVENTS.has(eventType)) {
      res.status(400).json({ ok: false, error: `Unsupported portal eventType "${eventType}".` });
      return;
    }

    const eventId = `evt_${crypto.randomUUID().slice(0, 10)}`;
    const nowIso = new Date().toISOString();
    let updatedStage: string | null = null;

    const supabaseAdmin = getServiceSupabaseClient();
    if (supabaseAdmin) {
      try {
        await supabaseAdmin.from('portal_events').insert({
          id: eventId,
          contact_id: contactId,
          portal,
          event_type: eventType,
          metadata,
          created_at: nowIso,
        });

        const { data: opp } = await supabaseAdmin
          .from('opportunities')
          .select('id, stage, opportunity_type')
          .eq('contact_id', contactId)
          .maybeSingle();

        if (opp) {
          const currStage = String(opp.stage || '');
          const isInvestor = portal === 'investor.fortifai.io' || opp.opportunity_type === 'seed_investment';
          if (isInvestor) {
            if (eventType === 'safe_generated') {
              updatedStage = 'SAFE Signed';
            } else if (eventType === 'pass_submitted') {
              updatedStage = 'Passed';
              await supabaseAdmin
                .from('contacts')
                .update({ unsubscribed: true })
                .eq('id', contactId);
            } else if (
              ['Not sent', 'Scheduled', 'Sent', 'Reminder Sched', 'Reminder Sent'].includes(currStage)
            ) {
              updatedStage = 'Portal Visited';
            }
          } else if (currStage === '1 Lead') {
            updatedStage = '2 Qualified';
          }

          if (updatedStage && updatedStage !== currStage) {
            await supabaseAdmin
              .from('opportunities')
              .update({
                stage: updatedStage,
                updated_at: nowIso,
                ...(updatedStage === 'SAFE Signed' ? { outcome: 'Committed' } : {}),
                ...(updatedStage === 'Passed' ? { outcome: 'Pass' } : {}),
              })
              .eq('id', opp.id);
          }
        }
      } catch {
        // Non-blocking if Supabase table is unavailable
      }
    }

    res.json({
      ok: true,
      eventId,
      contactId,
      portal,
      eventType,
      updatedStage,
      createdAt: nowIso,
    });
  });

  app.get('/api/unsubscribe', async (req: Request, res: Response) => {
    const contactId =
      typeof req.query.contactId === 'string'
        ? req.query.contactId.trim()
        : typeof req.query.id === 'string'
        ? req.query.id.trim()
        : '';
    const email = typeof req.query.email === 'string' ? req.query.email.trim().toLowerCase() : '';

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
          await supabaseAdmin.from('contacts').update({ unsubscribed: true }).eq('id', contactId);
        } else if (email) {
          await supabaseAdmin.from('contacts').update({ unsubscribed: true }).eq('email', email);
        }
      } catch {
        // Non-blocking
      }
    }

    const safeIdentifier = escapeHtml(email || contactId);
    res.status(200).send(`<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Unsubscribed — Fortifai</title></head>
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
    '/api/inbound-reply',
    requireAuthOrWebhookSecret,
    async (req: AuthenticatedRequest, res: Response) => {
      const body = (req.body || {}) as {
        contactId?: string;
        fromEmail?: string;
        subject?: string;
        snippet?: string;
        receivedAt?: string;
      };

      const contactId = typeof body.contactId === 'string' ? body.contactId.trim() : '';
      const fromEmail = typeof body.fromEmail === 'string' ? body.fromEmail.trim().toLowerCase() : '';
      const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
      const snippet = typeof body.snippet === 'string' ? body.snippet.trim() : '';

      if (!contactId && (!fromEmail || !isValidEmail(fromEmail))) {
        res.status(400).json({
          ok: false,
          error: 'Either contactId or a valid fromEmail is required to log an inbound reply.',
        });
        return;
      }

      if (fromEmail && !isValidEmail(fromEmail)) {
        res.status(400).json({ ok: false, error: 'Invalid fromEmail format.' });
        return;
      }

      if (!snippet && !subject) {
        res.status(400).json({
          ok: false,
          error: 'Reply subject or snippet is required.',
        });
        return;
      }

      const receivedAt =
        typeof body.receivedAt === 'string' && body.receivedAt.trim()
          ? body.receivedAt.trim()
          : new Date().toISOString();

      const supabaseAdmin = getServiceSupabaseClient();
      if (supabaseAdmin && contactId) {
        try {
          await supabaseAdmin
            .from('email_logs')
            .update({
              status: 'replied',
              replied_at: receivedAt,
              reply_snippet: snippet || subject,
            })
            .eq('contact_id', contactId);
        } catch {
          // Non-blocking
        }
      }

      res.json({
        ok: true,
        reply: {
          id: `rep_${crypto.randomUUID().slice(0, 10)}`,
          contactId: contactId || null,
          fromEmail: fromEmail || null,
          subject: subject || 'Re: Fortifai',
          snippet: snippet || '(Inbound email reply received)',
          receivedAt,
          loggedBy: req.session?.email || 'webhook',
        },
      });
    }
  );

  app.post('/api/ask-me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    if (!req.session) {
      res.status(401).json({ ok: false, error: 'Authentication required.' });
      return;
    }
    if (
      !req.session.permissions?.can_view_customers &&
      !req.session.permissions?.can_view_investors
    ) {
      res.status(403).json({
        ok: false,
        error: 'Permission denied: requires can_view_customers or can_view_investors.',
      });
      return;
    }

    const body = (req.body || {}) as AskMeRequestPayload;
    const result = await handleAskMeRequest(body, {
      email: req.session.email,
      role: req.session.role,
      permissions: req.session.permissions,
    });

    if (!result.ok) {
      res.status(result.status).json({ ok: false, error: result.error });
      return;
    }

    res.json({ ok: true, message: result.message });
  });

  app.post(
    '/api/generate-dossier',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      if (!req.session) {
        res.status(401).json({ ok: false, error: 'Authentication required.' });
        return;
      }
      if (!req.session.permissions?.can_view_customers) {
        res.status(403).json({
          ok: false,
          error: 'Permission denied: can_view_customers is required to access Account Intelligence.',
        });
        return;
      }

      const body = (req.body || {}) as GenerateDossierRequest;
      const result = await handleGenerateDossier(body, req.session.email);

      if (!result.ok) {
        res.status(result.status).json({ ok: false, error: result.error });
        return;
      }

      res.json({ ok: true, cached: result.cached, dossier: result.dossier });
    }
  );

  // Live Inline CMS Persistence (path-confined JSON store with RBAC auth on writes)
  const cmsDataDir = path.resolve(process.cwd(), 'data');
  const cmsFilePath = path.resolve(cmsDataDir, 'live_cms_overrides.json');
  const CMS_KEY_REGEX = /^[a-zA-Z0-9_.:-]{2,120}$/;

  const readCmsStore = (): {
    overrides: Record<string, string>;
    updatedAt: string | null;
    updatedBy: string | null;
  } => {
    try {
      if (!cmsFilePath.startsWith(cmsDataDir + path.sep)) {
        return { overrides: {}, updatedAt: null, updatedBy: null };
      }
      if (!fs.existsSync(cmsFilePath)) {
        return { overrides: {}, updatedAt: null, updatedBy: null };
      }
      const raw = fs.readFileSync(cmsFilePath, 'utf8');
      const parsed = JSON.parse(raw) as {
        overrides?: Record<string, unknown>;
        updatedAt?: string | null;
        updatedBy?: string | null;
      };
      const clean: Record<string, string> = {};
      if (parsed.overrides && typeof parsed.overrides === 'object') {
        for (const [k, v] of Object.entries(parsed.overrides)) {
          if (CMS_KEY_REGEX.test(k) && typeof v === 'string') {
            clean[k] = v.slice(0, 2000);
          }
        }
      }
      return {
        overrides: clean,
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
        updatedBy: typeof parsed.updatedBy === 'string' ? parsed.updatedBy : null,
      };
    } catch {
      return { overrides: {}, updatedAt: null, updatedBy: null };
    }
  };

  app.get('/api/cms', (_req: Request, res: Response) => {
    const store = readCmsStore();
    res.json({ ok: true, ...store });
  });

  app.put('/api/cms', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    if (!req.session) {
      res.status(401).json({ ok: false, error: 'Authentication required.' });
      return;
    }
    const canEditCms =
      Boolean(req.session.permissions?.can_manage_schema) ||
      Boolean(req.session.permissions?.can_manage_users) ||
      ['super_admin', 'admin'].includes(req.session.role);

    if (!canEditCms) {
      res.status(403).json({
        ok: false,
        error: 'Permission denied: requires Admin or Schema Manager privileges to save Live CMS copy.',
      });
      return;
    }

    const rawOverrides = (req.body as { overrides?: unknown })?.overrides;
    if (!rawOverrides || typeof rawOverrides !== 'object' || Array.isArray(rawOverrides)) {
      res.status(400).json({ ok: false, error: 'Expected overrides object.' });
      return;
    }

    const entries = Object.entries(rawOverrides as Record<string, unknown>);
    if (entries.length > 500) {
      res.status(400).json({ ok: false, error: 'Maximum 500 CMS keys allowed.' });
      return;
    }

    const sanitized: Record<string, string> = {};
    for (const [key, val] of entries) {
      if (!CMS_KEY_REGEX.test(key) || typeof val !== 'string') {
        res.status(400).json({ ok: false, error: `Invalid CMS entry for key "${key}".` });
        return;
      }
      sanitized[key] = val.slice(0, 2000);
    }

    if (!cmsFilePath.startsWith(cmsDataDir + path.sep)) {
      res.status(500).json({ ok: false, error: 'Invalid CMS storage path.' });
      return;
    }

    try {
      fs.mkdirSync(cmsDataDir, { recursive: true });
      const payload = {
        overrides: sanitized,
        updatedAt: new Date().toISOString(),
        updatedBy: req.session.email,
      };
      fs.writeFileSync(cmsFilePath, JSON.stringify(payload, null, 2), 'utf8');
      res.json({ ok: true, ...payload });
    } catch {
      res.status(500).json({ ok: false, error: 'Failed to persist Live CMS overrides.' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req: Request, res: Response) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Fortifai Scale server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Fortifai Scale server:', err);
  process.exit(1);
});
