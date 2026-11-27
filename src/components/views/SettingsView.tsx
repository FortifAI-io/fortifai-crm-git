import type { PipelineHealthRules } from "../../types/pipelineRules";
import { DEFAULT_PIPELINE_RULES } from "../../types/pipelineRules";
import { useState } from 'react';
import { Check, CheckCircle2, Copy, Database, Download, RefreshCw, ShieldCheck, Upload } from 'lucide-react';
import { PORTAL_SNIPPET_CODE, SUPABASE_SQL_SCHEMA } from '../../data/seedData';

interface SettingsViewProps {
  pipelineRules?: PipelineHealthRules;
  onUpdatePipelineRules?: (next: PipelineHealthRules) => void;
  supabaseUrl: string;
  onChangeSupabaseUrl: (url: string) => void;
  supabaseAnonKey: string;
  onChangeSupabaseAnonKey: (key: string) => void;
  resendConfigured: boolean;
  isLiveConnected: boolean;
  isSyncing: boolean;
  onSaveConnection: () => void;
  onTestConnection: () => void;
  onPushToSupabase: () => void;
  onPullFromSupabase: () => void;
}

export function SettingsView({
  supabaseUrl,
  onChangeSupabaseUrl,
  supabaseAnonKey,
  onChangeSupabaseAnonKey,
  resendConfigured,
  isLiveConnected,
  isSyncing,
  onSaveConnection,
  onTestConnection,
  onPushToSupabase,
  onPullFromSupabase,
  pipelineRules,
  onUpdatePipelineRules,
}: SettingsViewProps) {
  const [copiedPortal, setCopiedPortal] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  return (
    <div className="p-6 max-w-4xl mx-auto w-full space-y-6">
      {/* 1. Supabase & Resend Connection */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              1. Supabase (@supabase/supabase-js) &amp; Server-Side Resend Gateway
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Connect to your live Fortifai Supabase project to sync <span className="font-mono">crm_users</span>, contacts, custom fields, and portal telemetry.
            </p>
          </div>
          <span
            className={`text-xs px-2.5 py-1 rounded-full font-medium border ${
              isLiveConnected
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}
          >
            {isLiveConnected ? 'Supabase Live' : 'Local Synced Mode'}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 text-xs">
          <div>
            <label className="block text-slate-600 font-medium mb-1">Supabase Project URL</label>
            <input
              type="text"
              value={supabaseUrl}
              onChange={(e) => onChangeSupabaseUrl(e.target.value)}
              className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md font-mono text-slate-800"
            />
          </div>
          <div>
            <label className="block text-slate-600 font-medium mb-1">
              Supabase Anon Public Key
            </label>
            <input
              type="password"
              value={supabaseAnonKey}
              onChange={(e) => onChangeSupabaseAnonKey(e.target.value)}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md font-mono text-slate-800"
            />
          </div>
          <div className="p-3.5 rounded-md bg-slate-50 border border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              {resendConfigured ? (
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              ) : (
                <ShieldCheck size={16} className="text-slate-600 shrink-0" />
              )}
              <div>
                <div className="font-medium text-slate-900">
                  Resend Email API (<span className="font-mono">/api/send-batch</span>)
                </div>
                <div className="text-[11px] text-slate-500">
                  {resendConfigured
                    ? 'RESEND_API_KEY is active on the Express backend — live sending enabled with BCC sync.'
                    : 'Running in verified sandbox mode. Set RESEND_API_KEY in server environment secrets for live delivery.'}
                </div>
              </div>
            </div>
            <span
              className={`text-[11px] px-2.5 py-0.5 rounded-full font-medium border ${
                resendConfigured
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-slate-100 text-slate-700 border-slate-200'
              }`}
            >
              {resendConfigured ? 'Server Key Active' : 'Sandbox Relay Mode'}
            </span>
          </div>
        </div>

        <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isSyncing}
              onClick={onTestConnection}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-[#E2E8F0] rounded-md hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
            >
              <Database size={13} />
              Test Supabase Connection
            </button>
            <button
              type="button"
              disabled={isSyncing || !supabaseAnonKey.trim()}
              onClick={onPushToSupabase}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md hover:bg-indigo-100 disabled:opacity-40 whitespace-nowrap"
            >
              <Upload size={13} />
              Push Local Data to Supabase
            </button>
            <button
              type="button"
              disabled={isSyncing || !supabaseAnonKey.trim()}
              onClick={onPullFromSupabase}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-50 border border-[#E2E8F0] rounded-md hover:bg-slate-100 disabled:opacity-40 whitespace-nowrap"
            >
              <Download size={13} />
              Pull From Supabase
            </button>
          </div>

          <button
            type="button"
            disabled={isSyncing}
            onClick={onSaveConnection}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#0D1520] rounded-md hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
          >
            {isSyncing && <RefreshCw size={13} className="animate-spin" />}
            Save Connection Settings
          </button>
        </div>
      </div>

      {/* 2. Portal Telemetry Hook */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg p-6 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              2. Portal Telemetry Hook (investor.fortifai.io &amp; overview.fortifai.io)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Drop this helper into both React/Vite portals so tracked links (?ref=contact_id)
              automatically update CRM stages and dashboards.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(PORTAL_SNIPPET_CODE);
              setCopiedPortal(true);
              setTimeout(() => setCopiedPortal(false), 2500);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md whitespace-nowrap shrink-0"
          >
            {copiedPortal ? <Check size={13} /> : <Copy size={13} />}
            {copiedPortal ? 'Copied' : 'Copy Code'}
          </button>
        </div>

        <pre className="p-4 bg-[#0D1520] text-slate-200 rounded-md text-[11px] font-mono overflow-x-auto leading-relaxed">
          {PORTAL_SNIPPET_CODE}
        </pre>
      </div>

      {/* 3. Supabase SQL Schema */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg p-6 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              3. Supabase PostgreSQL Table Schema
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Run this DDL in your Supabase SQL Editor if your project does not have the CRM
              tables provisioned yet.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(SUPABASE_SQL_SCHEMA);
              setCopiedSql(true);
              setTimeout(() => setCopiedSql(false), 2500);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md whitespace-nowrap shrink-0"
          >
            {copiedSql ? <Check size={13} /> : <Copy size={13} />}
            {copiedSql ? 'Copied' : 'Copy SQL'}
          </button>
        </div>

        <pre className="p-4 bg-[#0D1520] text-slate-200 rounded-md text-[11px] font-mono overflow-x-auto leading-relaxed max-h-72">
          {SUPABASE_SQL_SCHEMA}
        </pre>
      </div>
    
      {/* Pipeline Health Formulas & Benchmarks Engine */}
      {pipelineRules && onUpdatePipelineRules && (
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
            <div>
              <h2 className="text-sm font-semibold text-[var(--tx-primary)]">
                Pipeline Health Formulas &amp; Autonomous Benchmarks
              </h2>
              <p className="text-xs text-[var(--tx-muted)] mt-0.5">
                Configure the thresholds, aging SLAs, stage probabilities, and health score weights that trigger Failing / At-Risk alerts.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onUpdatePipelineRules(DEFAULT_PIPELINE_RULES)}
              className="px-2.5 py-1 text-xs font-medium rounded border border-[var(--border-subtle)] text-[var(--tx-muted)] hover:text-[var(--tx-primary)]"
            >
              Reset Defaults
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <label className="space-y-1">
              <span className="text-[var(--tx-muted)] font-medium">2027 ARR Quota Target ($ USD)</span>
              <input
                type="number"
                step={100000}
                value={pipelineRules.arrTarget2027}
                onChange={(e) =>
                  onUpdatePipelineRules({
                    ...pipelineRules,
                    arrTarget2027: Math.max(250000, Number(e.target.value) || 0),
                  })
                }
                className="w-full px-2.5 py-1.5 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--tx-primary)] font-mono"
              />
            </label>

            <label className="space-y-1">
              <span className="text-[var(--tx-muted)] font-medium">Required Coverage Multiple (x)</span>
              <input
                type="number"
                step={0.1}
                value={pipelineRules.requiredCoverageMultiple}
                onChange={(e) =>
                  onUpdatePipelineRules({
                    ...pipelineRules,
                    requiredCoverageMultiple: Math.max(1, Number(e.target.value) || 5.7),
                  })
                }
                className="w-full px-2.5 py-1.5 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--tx-primary)] font-mono"
              />
            </label>

            <label className="space-y-1">
              <span className="text-[var(--tx-muted)] font-medium">Stale Deal SLA Limit (Days)</span>
              <input
                type="number"
                step={5}
                value={pipelineRules.staleSlaDays}
                onChange={(e) =>
                  onUpdatePipelineRules({
                    ...pipelineRules,
                    staleSlaDays: Math.max(15, Number(e.target.value) || 90),
                  })
                }
                className="w-full px-2.5 py-1.5 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--tx-primary)] font-mono"
              />
            </label>

            <label className="space-y-1">
              <span className="text-[var(--tx-muted)] font-medium">Max Stale Pipeline Share (%)</span>
              <input
                type="number"
                step={5}
                value={pipelineRules.maxStaleSharePct}
                onChange={(e) =>
                  onUpdatePipelineRules({
                    ...pipelineRules,
                    maxStaleSharePct: Math.max(5, Math.min(100, Number(e.target.value) || 20)),
                  })
                }
                className="w-full px-2.5 py-1.5 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--tx-primary)] font-mono"
              />
            </label>

            <label className="space-y-1">
              <span className="text-[var(--tx-muted)] font-medium">Healthy Coverage Floor (x)</span>
              <input
                type="number"
                step={0.1}
                value={pipelineRules.healthyCoverageFloor}
                onChange={(e) =>
                  onUpdatePipelineRules({
                    ...pipelineRules,
                    healthyCoverageFloor: Math.max(1, Number(e.target.value) || 3.5),
                  })
                }
                className="w-full px-2.5 py-1.5 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--tx-primary)] font-mono"
              />
            </label>

            <label className="space-y-1">
              <span className="text-[var(--tx-muted)] font-medium">Min Stage 2+ Qualified Share (%)</span>
              <input
                type="number"
                step={5}
                value={pipelineRules.minQualifiedSharePct}
                onChange={(e) =>
                  onUpdatePipelineRules({
                    ...pipelineRules,
                    minQualifiedSharePct: Math.max(10, Math.min(100, Number(e.target.value) || 65)),
                  })
                }
                className="w-full px-2.5 py-1.5 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--tx-primary)] font-mono"
              />
            </label>

            <label className="space-y-1">
              <span className="text-[var(--tx-muted)] font-medium">Min Weighted Attainment (%)</span>
              <input
                type="number"
                step={5}
                value={pipelineRules.minWeightedAttainmentPct}
                onChange={(e) =>
                  onUpdatePipelineRules({
                    ...pipelineRules,
                    minWeightedAttainmentPct: Math.max(5, Math.min(100, Number(e.target.value) || 35)),
                  })
                }
                className="w-full px-2.5 py-1.5 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--tx-primary)] font-mono"
              />
            </label>

            <label className="space-y-1">
              <span className="text-[var(--tx-muted)] font-medium">Avg Enterprise ACV ($ USD)</span>
              <input
                type="number"
                step={25000}
                value={pipelineRules.avgAcvAssumption}
                onChange={(e) =>
                  onUpdatePipelineRules({
                    ...pipelineRules,
                    avgAcvAssumption: Math.max(50000, Number(e.target.value) || 250000),
                  })
                }
                className="w-full px-2.5 py-1.5 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--tx-primary)] font-mono"
              />
            </label>
          </div>
        </div>
      )}
</div>
  );
}
