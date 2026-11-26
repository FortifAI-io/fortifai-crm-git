import {
  AlertCircle,
  Building2,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react';
import type { AccountDossier } from '../types/crm';

interface AccountDossierDrawerProps {
  organization: string | null;
  industry?: string;
  region?: string;
  dossier: AccountDossier | null;
  isLoading: boolean;
  isCached?: boolean;
  error: string | null;
  onClose: () => void;
  onRefresh: () => void;
}

function getSafeExternalUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export function AccountDossierDrawer({
  organization,
  industry,
  region,
  dossier,
  isLoading,
  isCached,
  error,
  onClose,
  onRefresh,
}: AccountDossierDrawerProps) {
  if (!organization) return null;

  const payload = dossier?.dossier_json;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/30 backdrop-blur-[1px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl bg-[#F8FAFC] h-full border-l border-[#E2E8F0] shadow-2xl flex flex-col">
        {/* Institutional Header */}
        <div className="bg-white border-b border-[#E2E8F0] px-6 py-4 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded bg-[#0D1520] text-white">
                <Sparkles size={11} />
                Account Intelligence
              </span>
              {dossier?.primary_wedge_product && (
                <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Wedge: {dossier.primary_wedge_product}
                </span>
              )}
              {dossier?.word_count !== undefined && (
                <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                  {dossier.word_count} words · {isCached ? 'Cached' : 'Live Search'}
                </span>
              )}
            </div>
            <h2 className="text-lg font-semibold text-slate-900 tracking-tight mt-2 truncate">
              {organization}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {dossier?.industry || industry || 'Enterprise'} · {dossier?.region || region || 'US'}
              {dossier?.generated_at && (
                <>
                  {' · '}
                  Updated{' '}
                  {new Date(dossier.generated_at).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={isLoading}
              onClick={onRefresh}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-800 bg-white border border-[#E2E8F0] rounded-md hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
            >
              <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
              Refresh Intelligence
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              aria-label="Close Account Intelligence"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {isLoading && !payload && (
            <div className="bg-white border border-[#E2E8F0] rounded-lg p-10 flex flex-col items-center justify-center text-center gap-3">
              <Loader2 size={22} className="animate-spin text-slate-700" />
              <div className="text-xs font-medium text-slate-800">
                Synthesizing live Google Search &amp; Scale CRM intelligence for {organization}...
              </div>
              <div className="text-[11px] text-slate-400">
                Evaluating CFO margin triggers, DOJ/FCPA/SOX pressures, ERP/India GCC stack, and Scale telemetry.
              </div>
            </div>
          )}

          {error && (
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 text-xs text-rose-800 flex items-start gap-2.5">
              <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">Unable to generate Customer Intelligence Dossier</div>
                <p className="mt-0.5 text-rose-700">{error}</p>
              </div>
            </div>
          )}

          {payload && (
            <>
              {/* 1. Account Snapshot & Wedge */}
              <section className="bg-white border border-[#E2E8F0] rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    1. Account Snapshot &amp; Wedge
                  </h3>
                  <span className="text-[11px] font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                    {payload.account_snapshot.primary_wedge_agent}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-1 tabular-nums">
                  <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-md px-3 py-2">
                    <div className="text-[10px] font-medium text-slate-400">Revenue</div>
                    <div className="text-xs font-semibold text-slate-900 mt-0.5 truncate">
                      {payload.account_snapshot.revenue}
                    </div>
                  </div>
                  <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-md px-3 py-2">
                    <div className="text-[10px] font-medium text-slate-400">Margin</div>
                    <div className="text-xs font-semibold text-slate-900 mt-0.5 truncate">
                      {payload.account_snapshot.margin}
                    </div>
                  </div>
                  <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-md px-3 py-2">
                    <div className="text-[10px] font-medium text-slate-400">HQ / Regions</div>
                    <div className="text-xs font-semibold text-slate-900 mt-0.5 truncate">
                      {payload.account_snapshot.hq_regions}
                    </div>
                  </div>
                  <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-md px-3 py-2">
                    <div className="text-[10px] font-medium text-slate-400">ICP Score</div>
                    <div className="text-xs font-semibold text-emerald-700 mt-0.5">
                      {payload.account_snapshot.icp_score}/100
                    </div>
                  </div>
                  <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-md px-3 py-2">
                    <div className="text-[10px] font-medium text-slate-400">Target ARR</div>
                    <div className="text-xs font-semibold text-slate-900 mt-0.5">
                      {payload.account_snapshot.target_arr}
                    </div>
                  </div>
                </div>

                <div className="pt-1">
                  <div className="text-[11px] font-semibold text-slate-700 mb-1">Why Now Thesis</div>
                  <ul className="space-y-1 text-xs text-slate-700 list-disc pl-4">
                    {payload.account_snapshot.why_now_bullets.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </div>
              </section>

              {/* 2. Financial & Margin Triggers (CFO/CAO) */}
              <section className="bg-white border border-[#E2E8F0] rounded-lg p-4 space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  2. Financial &amp; Margin Triggers (CFO / CAO)
                </h3>
                <ul className="space-y-1.5 text-xs text-slate-700 list-disc pl-4">
                  {payload.financial_triggers.bullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </section>

              {/* 3. Regulatory & DOJ Enforcement Pressures (CCO/GC/CAE) */}
              <section className="bg-white border border-[#E2E8F0] rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-1.5">
                  <ShieldAlert size={13} className="text-amber-600 shrink-0" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    3. Regulatory &amp; DOJ Enforcement Pressures (CCO / GC / CAE)
                  </h3>
                </div>
                <ul className="space-y-1.5 text-xs text-slate-700 list-disc pl-4">
                  {payload.regulatory_pressures.bullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </section>

              {/* 4. ERP & India GCC Footprint */}
              <section className="bg-white border border-[#E2E8F0] rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-1.5">
                  <Building2 size={13} className="text-slate-500 shrink-0" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    4. ERP &amp; India GCC Footprint
                  </h3>
                </div>
                <ul className="space-y-1.5 text-xs text-slate-700 list-disc pl-4">
                  {payload.erp_india_gcc.bullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </section>

              {/* 5. Buying Committee Map */}
              <section className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-[#E2E8F0] bg-[#F8FAFC]">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    5. Buying Committee Map
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-[#E2E8F0] text-[11px] text-slate-500 bg-slate-50/50">
                        <th className="py-2 px-3 font-semibold">Persona</th>
                        <th className="py-2 px-3 font-semibold">Contact Name</th>
                        <th className="py-2 px-3 font-semibold">Scale Status</th>
                        <th className="py-2 px-3 font-semibold">Persona Angle</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {payload.buying_committee_map.map((row) => (
                        <tr key={row.persona}>
                          <td className="py-2 px-3 font-semibold text-slate-800 whitespace-nowrap">
                            {row.persona}
                          </td>
                          <td className="py-2 px-3 text-slate-800 whitespace-nowrap">
                            {row.contact_name}
                          </td>
                          <td className="py-2 px-3 text-slate-600 whitespace-nowrap">
                            {row.scale_status}
                          </td>
                          <td className="py-2 px-3 text-slate-600">{row.persona_angle}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* 6. Scale Engagement Pulse */}
              <section className="bg-white border border-[#E2E8F0] rounded-lg p-4 space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  6. Scale Engagement Pulse
                </h3>
                <ul className="space-y-1.5 text-xs text-slate-700 list-disc pl-4">
                  {payload.scale_engagement_pulse.bullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </section>

              {/* Grounding Sources */}
              {dossier?.sources && dossier.sources.length > 0 && (
                <div className="bg-white border border-[#E2E8F0] rounded-lg p-4 space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Google Search Grounding Sources
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {dossier.sources.map((src, idx) => {
                      const safeHref = getSafeExternalUrl(src.uri);
                      if (!safeHref) return null;
                      return (
                        <a
                          key={`${safeHref}_${idx}`}
                          href={safeHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-[#F8FAFC] border border-[#E2E8F0] rounded-md hover:bg-slate-100 hover:text-slate-900 transition-colors max-w-[260px]"
                        >
                          <ExternalLink size={11} className="shrink-0 text-slate-400" />
                          <span className="truncate">{src.title}</span>
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
