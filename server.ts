import { createClient as _createSupabaseAdminClient } from '@supabase/supabase-js';
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
  "mike@fortifai.io": { id: "usr_mike", email: "mike@fortifai.io", full_name: "Michael Malarkey", role: "sales_lead", is_active: true },
  "dave@fortifai.io": { id: "usr_dave", email: "dave@fortifai.io", full_name: "Dave Brooks", role: "sales_lead", is_active: true },
  "arun@fortifai.io": { id: "usr_arun", email: "arun@fortifai.io", full_name: "Arunava Mitra", role: "investor_relations", is_active: true },
  "chandra@fortifai.io": { id: "usr_chandra", email: "chandra@fortifai.io", full_name: "Chandra Yeleshwarapu", role: "sales_lead", is_active: true },
  "contact@fortifai.io": { id: "usr_marketing", email: "contact@fortifai.io", full_name: "Fortifai Marketing", role: "marketing", is_active: true },
};


startServer().catch((err) => {
  console.error('Failed to start Fortifai Scale server:', err);
  process.exit(1);
});
