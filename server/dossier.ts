import crypto from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import type {
  AccountDossier,
  AccountDossierPayload,
  Contact,
  DossierSource,
  TelemetryEvent,
  WedgeAgentName,
} from '../src/types/crm';
import { getServiceSupabaseClient } from './supabaseAdmin';

export interface GenerateDossierRequest {
  contactId?: string;
  organization: string;
  industry?: string;
  region?: string;
  icpScore?: number;
  targetArr?: number;
  forceRefresh?: boolean;
  contactsInOrg?: Contact[];
  telemetryEvents?: TelemetryEvent[];
}

const VALID_WEDGE_AGENTS: WedgeAgentName[] = [
  'Counterpart Risk Monitoring',
  'ABAC',
  'Kuber',
  'Surge',
  'Aegis',
  'Crystal',
  'D7',
];

function sanitizeUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

function countWords(dossier: AccountDossierPayload): number {
  const parts: string[] = [
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
      r.persona_angle,
    ]),
    ...dossier.scale_engagement_pulse.bullets,
  ];
  const joined = parts.join(' ').trim();
  if (!joined) return 0;
  return joined.split(/\s+/).length;
}

function normalizeWedgeAgent(raw: unknown): WedgeAgentName {
  if (typeof raw !== 'string') return 'Counterpart Risk Monitoring';
  const lower = raw.trim().toLowerCase();
  const exact = VALID_WEDGE_AGENTS.find((w) => w.toLowerCase() === lower);
  if (exact) return exact;
  if (lower.includes('abac')) return 'ABAC';
  if (lower.includes('kuber')) return 'Kuber';
  if (lower.includes('surge')) return 'Surge';
  if (lower.includes('aegis')) return 'Aegis';
  if (lower.includes('crystal')) return 'Crystal';
  if (lower.includes('d7')) return 'D7';
  return 'Counterpart Risk Monitoring';
}

function trimBullets(arr: unknown, maxItems: number, fallback: string[]): string[] {
  if (!Array.isArray(arr)) return fallback;
  const cleaned = arr
    .map((item) => String(item || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, maxItems);
  return cleaned.length > 0 ? cleaned : fallback;
}

function formatCompactUsd(amount?: number): string {
  if (!amount) return '$0';
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (amount >= 1_000) return `$${Math.round(amount / 1_000)}K`;
  return `$${amount}`;
}

export async function handleGenerateDossier(
  payload: GenerateDossierRequest,
  generatedByEmail: string
): Promise<
  | { ok: true; cached: boolean; dossier: AccountDossier }
  | { ok: false; status: number; error: string }
> {
  const org = (payload.organization || '').trim();
  if (!org) {
    return { ok: false, status: 400, error: 'Organization name is required to generate a dossier.' };
  }

  const supabaseAdmin = getServiceSupabaseClient();

  // 1. Check account_dossiers cache unless forceRefresh is requested
  if (supabaseAdmin && !payload.forceRefresh) {
    try {
      const { data: cachedRow, error: cacheErr } = await supabaseAdmin
        .from('account_dossiers')
        .select('*')
        .ilike('organization', org)
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!cacheErr && cachedRow && cachedRow.dossier_json) {
        const cachedPayload = cachedRow.dossier_json as AccountDossierPayload;
        const dossier: AccountDossier = {
          id: String(cachedRow.id),
          organization: String(cachedRow.organization),
          industry: String(cachedRow.industry || payload.industry || 'Enterprise'),
          region: String(cachedRow.region || payload.region || 'US'),
          icp_fit_score: Number(cachedRow.icp_fit_score ?? payload.icpScore ?? 85),
          primary_wedge_product: String(
            cachedRow.primary_wedge_product ||
              cachedPayload?.account_snapshot?.primary_wedge_agent ||
              'Counterpart Risk Monitoring'
          ),
          dossier_json: cachedPayload,
          sources: Array.isArray(cachedRow.sources) ? (cachedRow.sources as DossierSource[]) : [],
          generated_by: String(cachedRow.generated_by || generatedByEmail),
          generated_at: String(cachedRow.generated_at || new Date().toISOString()),
          word_count: countWords(cachedPayload),
        };
        return { ok: true, cached: true, dossier };
      }
    } catch {
      // Cache lookup failed cleanly; proceed to fresh generation
    }
  }

  // 2. Gather live CRM context from Supabase (if available) + client state passed in request
  let orgContacts: Contact[] = Array.isArray(payload.contactsInOrg) ? payload.contactsInOrg : [];
  let liveEmailLogs: Record<string, unknown>[] = [];
  let livePortalEvents: Record<string, unknown>[] = [];
  let liveOpps: Record<string, unknown>[] = [];

  if (supabaseAdmin) {
    try {
      const { data: dbContacts } = await supabaseAdmin
        .from('contacts')
        .select('*')
        .ilike('organization', org);

      if (Array.isArray(dbContacts) && dbContacts.length > 0) {
        const contactIds = dbContacts.map((c) => String(c.id));
        const [oppsRes, logsRes, portalRes] = await Promise.all([
          supabaseAdmin.from('opportunities').select('*').in('contact_id', contactIds),
          supabaseAdmin
            .from('email_logs')
            .select('*')
            .in('contact_id', contactIds)
            .order('sent_at', { ascending: false })
            .limit(10),
          supabaseAdmin
            .from('portal_events')
            .select('*')
            .in('contact_id', contactIds)
            .order('created_at', { ascending: false })
            .limit(10),
        ]);
        liveOpps = (oppsRes.data as Record<string, unknown>[]) || [];
        liveEmailLogs = (logsRes.data as Record<string, unknown>[]) || [];
        livePortalEvents = (portalRes.data as Record<string, unknown>[]) || [];

        if (orgContacts.length === 0) {
          orgContacts = dbContacts as unknown as Contact[];
        }
      }
    } catch {
      // Fall back to client-passed CRM telemetry/contacts gracefully
    }
  }

  const primaryContact =
    orgContacts.find((c) => c.id === payload.contactId) || orgContacts[0];

  const industry = payload.industry || primaryContact?.industry || 'Enterprise';
  const region = payload.region || primaryContact?.region || 'US';
  const icpScore = payload.icpScore ?? primaryContact?.icp_score ?? 88;
  const targetArr = payload.targetArr ?? primaryContact?.amount_usd ?? 250000;

  const clientEvents = Array.isArray(payload.telemetryEvents) ? payload.telemetryEvents : [];

  const engagementFacts = {
    contacts: orgContacts.map((c) => ({
      full_name: c.full_name,
      title: c.title,
      buyer_persona: c.buyer_persona || 'Other',
      stage: c.stage,
      aging_days: c.aging_days ?? 0,
      amount_usd: c.amount_usd ?? 0,
      delivery_status: c.delivery_status || 'not_sent',
      opened_at: c.opened_at || null,
      replied_at: c.replied_at || null,
      portal_visited: Boolean(c.portal_visited),
      next_step: c.next_step || null,
    })),
    supabase_opportunities: liveOpps,
    supabase_email_logs: liveEmailLogs,
    supabase_portal_events: livePortalEvents,
    recent_telemetry_events: clientEvents.slice(0, 8).map((e) => ({
      source: e.source,
      event_type: e.event_type,
      detail: e.detail,
      timestamp: e.timestamp,
      is_bot_scan: Boolean(e.is_bot_scan),
    })),
  };

  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return {
      ok: false,
      status: 500,
      error:
        'GEMINI_API_KEY is not configured. Add your Gemini API key in Settings > Secrets to generate Customer Intelligence Dossiers.',
    };
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
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
    "hq_regions": "City, ST · Global",
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
          model: 'gemini-4-hydrogen',
          contents: prompt,
          config: {
            systemInstruction,
            tools: [{ googleSearch: {} }],
          },
        });
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (attempt === 0 && (msg.includes('503') || msg.includes('UNAVAILABLE'))) {
          await new Promise((r) => setTimeout(r, 1200));
          continue;
        }
        throw err;
      }
    }

    const rawText = (response?.text || '').trim();
    const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const jsonCandidate = (fenceMatch ? fenceMatch[1] : rawText).trim();
    const braceStart = jsonCandidate.indexOf('{');
    const braceEnd = jsonCandidate.lastIndexOf('}');

    if (braceStart === -1 || braceEnd <= braceStart) {
      return {
        ok: false,
        status: 502,
        error: 'Gemini returned an unexpected non-JSON dossier format. Try Refresh Intelligence.',
      };
    }

    const parsed = JSON.parse(jsonCandidate.slice(braceStart, braceEnd + 1)) as Partial<AccountDossierPayload>;

    const defaultStageSummary = primaryContact
      ? `Stage: ${primaryContact.stage} (${primaryContact.aging_days ?? 0}d in stage, ${formatCompactUsd(primaryContact.amount_usd)} ARR).`
      : 'No active pipeline stage logged yet.';
    const defaultPulseSummary = primaryContact
      ? `Resend status: ${(primaryContact.delivery_status || 'not_sent').replace(/_/g, ' ')}; overview.fortifai.io ${primaryContact.portal_visited ? 'visited' : 'not yet visited'}.`
      : 'No Resend or overview.fortifai.io activity logged.';

    const personas: ('CCO/GC' | 'CAE' | 'CFO/CAO' | 'CPO')[] = [
      'CCO/GC',
      'CAE',
      'CFO/CAO',
      'CPO',
    ];
    const parsedCommittee = Array.isArray(parsed.buying_committee_map)
      ? parsed.buying_committee_map
      : [];

    const normalizedCommittee = personas.map((persona) => {
      const found = parsedCommittee.find((r) =>
        String(r?.persona || '').toUpperCase().includes(persona.split('/')[0])
      );
      const crmMatch = orgContacts.find((c) => {
        const bp = (c.buyer_persona || '').toUpperCase();
        return bp.includes(persona.split('/')[0]);
      });

      return {
        persona,
        contact_name:
          (typeof found?.contact_name === 'string' && found.contact_name.trim()) ||
          crmMatch?.full_name ||
          'Unidentified (Prospect)',
        scale_status:
          (typeof found?.scale_status === 'string' && found.scale_status.trim()) ||
          (crmMatch ? `${crmMatch.stage} · ${crmMatch.delivery_status || 'not_sent'}` : 'Not in Scale'),
        persona_angle:
          (typeof found?.persona_angle === 'string' && found.persona_angle.trim()) ||
          'Autonomous 100% transaction controls in customer VPC.',
      };
    });

    const normalizedPayload: AccountDossierPayload = {
      account_snapshot: {
        revenue: String(parsed.account_snapshot?.revenue || 'Public / Undisclosed'),
        margin: String(parsed.account_snapshot?.margin || 'Monitor filing'),
        hq_regions: String(parsed.account_snapshot?.hq_regions || `${primaryContact?.location || region}`),
        icp_score: Number(parsed.account_snapshot?.icp_score ?? icpScore),
        target_arr: String(parsed.account_snapshot?.target_arr || formatCompactUsd(targetArr)),
        primary_wedge_agent: normalizeWedgeAgent(parsed.account_snapshot?.primary_wedge_agent),
        why_now_bullets: trimBullets(parsed.account_snapshot?.why_now_bullets, 2, [
          `${org} operates high-volume cross-border procurement with material compliance oversight.`,
          `Zero-egress deployment accelerates continuous audit coverage before ${primaryContact?.expected_close || 'Q2 2027'}.`,
        ]),
      },
      financial_triggers: {
        bullets: trimBullets(parsed.financial_triggers?.bullets, 2, [
          'Ongoing operating margin and working-capital efficiency mandates across global business units.',
          '1% addressable indirect/vendor spend leakage recovery benchmark offsets multi-year Fortifai ACV.',
        ]),
      },
      regulatory_pressures: {
        bullets: trimBullets(parsed.regulatory_pressures?.bullets, 3, [
          'Heightened DOJ Directive 26-12 customs/tariff evasion and FCPA cross-border supply-chain scrutiny.',
          'SOX internal control automation and proactive whistleblower/self-disclosure readiness across subsidiaries.',
        ]),
      },
      erp_india_gcc: {
        bullets: trimBullets(parsed.erp_india_gcc?.bullets, 2, [
          'Multi-ERP landscape (SAP/Oracle/procurement workflows) creates fragmented manual audit sampling.',
          'India GCC engineering/finance hubs align cleanly with zero-egress customer-VPC agent deployment.',
        ]),
      },
      buying_committee_map: normalizedCommittee,
      scale_engagement_pulse: {
        bullets: trimBullets(parsed.scale_engagement_pulse?.bullets, 2, [
          defaultStageSummary,
          defaultPulseSummary,
        ]),
      },
    };

    // Extract clickable grounding citations safely
    const rawChunks = response?.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const seenUrls = new Set<string>();
    const sources: DossierSource[] = [];
    if (Array.isArray(rawChunks)) {
      for (const chunk of rawChunks) {
        const web = (chunk as { web?: { uri?: string; title?: string } })?.web;
        const safeUri = sanitizeUrl(web?.uri);
        if (!safeUri || seenUrls.has(safeUri)) continue;
        seenUrls.add(safeUri);
        sources.push({
          title: (web?.title || new URL(safeUri).hostname).trim(),
          uri: safeUri,
        });
        if (sources.length >= 8) break;
      }
    }

    const generatedAt = new Date().toISOString();
    const dossierId = `dos_${org.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || crypto.randomUUID().slice(0, 8)}`;

    const dossier: AccountDossier = {
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
      word_count: countWords(normalizedPayload),
    };

    if (supabaseAdmin) {
      try {
        await supabaseAdmin.from('account_dossiers').upsert(
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
            generated_at: dossier.generated_at,
          },
          { onConflict: 'id' }
        );
      } catch {
        // Non-blocking if account_dossiers table has not been populated yet
      }
    }

    return { ok: true, cached: false, dossier };
  } catch (err) {
    let rawMsg = err instanceof Error ? err.message : 'Failed to generate customer intelligence dossier.';
    let status = 500;
    try {
      const parsedErr = JSON.parse(rawMsg) as { error?: { code?: number; message?: string } };
      if (parsedErr?.error?.message) {
        rawMsg = parsedErr.error.message;
        if (typeof parsedErr.error.code === 'number') status = parsedErr.error.code;
      }
    } catch {
      // Keep original message
    }
    return { ok: false, status, error: rawMsg };
  }
}
