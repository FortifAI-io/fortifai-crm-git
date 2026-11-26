import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Database,
  ExternalLink,
  Loader2,
  Mail,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useRbac } from '../context/RbacContext';
import type {
  AskMeChatMessage,
  AskMeContactPill,
  Contact,
  ContactType,
} from '../types/crm';

interface AskMeDrawerProps {
  isOpen: boolean;
  messages: AskMeChatMessage[];
  isLoading: boolean;
  geminiConfigured: boolean;
  contacts: Contact[];
  onClose: () => void;
  onClearConversation: () => void;
  onSendMessage: (text: string) => void;
  onOpenContact: (contactId: string) => void;
  onDraftInComposer: (
    contactIds: string[],
    audienceType: ContactType,
    subject?: string,
    bodyTemplate?: string
  ) => void;
}

interface PromptGroup {
  group: string;
  visible: boolean;
  prompts: string[];
}

function buildSuperhumanHref(contact: Contact | AskMeContactPill, subject?: string, body?: string): string {
  const defaultSubject =
    subject ||
    (contact.contact_type === 'investor'
      ? `Fortifai ($3M Seed) — ${contact.organization}`
      : `Fortifai Continuous Assurance — ${contact.organization}`);
  const firstName = contact.full_name.split(' ')[0] || contact.full_name;
  const fullContact = 'custom_hook' in contact ? contact : undefined;
  const defaultBody =
    body ||
    (contact.contact_type === 'investor'
      ? `Hi ${firstName},\n\n${
          fullContact?.custom_hook ||
          'Following up on our $3M Seed ($15M cap SAFE) and enterprise deployments across Honeywell, Nokia, and Brookfield Properties.'
        }\n\nBest,\nVarun`
      : `Hi ${firstName},\n\nFollowing up on continuous controls & risk assurance for ${contact.organization}.\n\nBest,\nVarun`);

  return `mailto:${encodeURIComponent(contact.email)}?subject=${encodeURIComponent(
    defaultSubject
  )}&body=${encodeURIComponent(defaultBody)}`;
}

function isNumericCell(val: string | number | boolean | null): boolean {
  if (typeof val === 'number') return true;
  if (typeof val !== 'string') return false;
  return /^[\$€£]?\s*-?\d[\d,.]*%?$/.test(val.trim());
}

function formatCellValue(col: string, val: string | number | boolean | null): string {
  if (val === null || val === undefined || val === '') return '—';
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  if (typeof val === 'number') {
    const lowerCol = col.toLowerCase();
    if (lowerCol.includes('usd') || lowerCol.includes('arr') || lowerCol.includes('check') || lowerCol.includes('amount')) {
      return `$${Math.round(val).toLocaleString()}`;
    }
    if (lowerCol.includes('pct') || lowerCol.includes('rate') || lowerCol.includes('prob')) {
      return `${val}%`;
    }
    return val.toLocaleString();
  }
  return String(val);
}

export function AskMeDrawer({
  isOpen,
  messages,
  isLoading,
  geminiConfigured,
  contacts,
  onClose,
  onClearConversation,
  onSendMessage,
  onOpenContact,
  onDraftInComposer,
}: AskMeDrawerProps) {
  const { currentUser, permissions } = useRbac();
  const userEmail = currentUser.email;
  const userRole = currentUser.role;

  const [input, setInput] = useState('');
  const [expandedSqlIds, setExpandedSqlIds] = useState<Record<string, boolean>>({});
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [isOpen]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  if (!isOpen) return null;

  const promptGroups: PromptGroup[] = [
    {
      group: 'Customer Pipeline & Deals',
      visible: permissions.can_view_customers,
      prompts: [
        'Which Q1/Q2 2027 deals are aging over 90 days and need follow-up?',
        'Show weighted ARR coverage vs our $3M target by buyer persona',
        'List all Tier I CCO/GC contacts in Aero & Defense or Semiconductors',
      ],
    },
    {
      group: 'Account Intelligence & Customer Telemetry',
      visible: permissions.can_view_customers && !permissions.can_view_investors,
      prompts: [
        'Which Fortune 500 customer accounts have the highest ICP fit score?',
        'What is our open and bounce rate across Customer Resend outreach?',
        'Who visited overview.fortifai.io in the past 7 days?',
      ],
    },
    {
      group: 'Investors & Fundraising',
      visible: permissions.can_view_investors,
      prompts: [
        'Which P1/P2 investors opened emails or visited investor.fortifai.io without replying?',
        'How much check capacity do we have across Wave 1 Leads in the US vs Singapore/UAE?',
        'Summarize all investor passes and reasons',
      ],
    },
    {
      group: 'Outreach & Telemetry',
      visible: permissions.can_view_investors,
      prompts: [
        ...(permissions.can_view_customers && permissions.can_view_investors
          ? ['What is our open and bounce rate across the last 3 Resend campaigns?']
          : ['What is our open and bounce rate across Investor Resend campaigns?']),
        ...(permissions.can_view_customers
          ? ['Who visited overview.fortifai.io in the past 7 days?']
          : []),
        'Which Wave 1 investors visited investor.fortifai.io in the past 7 days?',
      ],
    },
  ].filter((g) => g.visible);

  const visibleContacts = contacts.filter((c) =>
    c.contact_type === 'investor' ? permissions.can_view_investors : permissions.can_view_customers
  );
  const contactById = new Map(visibleContacts.map((c) => [c.id, c]));

  const scopeLabel =
    permissions.can_view_customers && permissions.can_view_investors
      ? 'Enterprise Pipeline + $3M Seed Investors + Telemetry'
      : permissions.can_view_investors
      ? '$3M Seed Investors + Telemetry'
      : permissions.can_view_customers
      ? 'Customer Pipeline + Account Intelligence'
      : 'No CRM Data Access';

  const welcomeTitle =
    permissions.can_view_customers && permissions.can_view_investors
      ? 'Fortifai Revenue & Fundraising Intelligence'
      : permissions.can_view_investors
      ? 'Fortifai Fundraising & Investor Intelligence'
      : 'Fortifai Enterprise Revenue Intelligence';

  const welcomeDescription =
    permissions.can_view_customers && permissions.can_view_investors
      ? 'Query across Enterprise Deals, Target Accounts, $3M Seed Investors, Custom Sheet Columns, Resend Delivery Logs, and Portal Telemetry with RBAC-grounded SQL and 1-click Composer follow-ups.'
      : permissions.can_view_investors
      ? 'Query across $3M Seed Investors, Custom Sheet Columns, Resend Delivery Logs, and investor.fortifai.io Telemetry with RBAC-grounded SQL and 1-click Composer follow-ups.'
      : 'Scoped to Customer Pipeline, Account Intelligence, Custom Columns, and overview.fortifai.io Telemetry with RBAC-grounded SQL and 1-click Composer follow-ups.';

  const inputPlaceholder =
    permissions.can_view_customers && permissions.can_view_investors
      ? 'Ask across Enterprise Pipeline, $3M Seed Investors, Custom Columns, or Telemetry...'
      : permissions.can_view_investors
      ? 'Ask across $3M Seed Investors, Custom Columns, or investor.fortifai.io Telemetry...'
      : 'Ask across Customer Pipeline, Account Intelligence, or overview.fortifai.io...';

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    setInput('');
    onSendMessage(trimmed);
  };

  const toggleSqlDisclosure = (msgId: string) => {
    setExpandedSqlIds((prev) => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  const contentPanel = (
    <div className="w-full max-w-[460px] bg-[#F8FAFC] h-full border-l border-[#E2E8F0] shadow-2xl flex flex-col">
      {/* Institutional Header */}
      <div className="bg-white border-b border-[#E2E8F0] px-4 py-3.5 flex items-center justify-between gap-2 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full shrink-0 ${
                geminiConfigured ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
              title={
                geminiConfigured
                  ? 'Gemini intelligence endpoint active'
                  : 'GEMINI_API_KEY not configured on server'
              }
            />
            <h2 className="text-sm font-semibold text-slate-900 tracking-tight">Ask Scale</h2>
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-100 text-slate-600 border border-[#E2E8F0] rounded">
              ⌘K
            </kbd>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600">
              {userRole}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 truncate">
            {scopeLabel} · {userEmail}
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={onClearConversation}
              className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-slate-600 bg-white border border-[#E2E8F0] rounded-md hover:bg-slate-50 whitespace-nowrap"
              title="Clear conversation"
            >
              <Trash2 size={13} />
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            aria-label="Close Ask Scale"
          >
            <X size={18} />
          </button>
        </div>
      </div>

        {/* Conversation Canvas */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {!geminiConfigured && (
            <div className="bg-amber-50 border border-amber-200 rounded-md p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
              <AlertCircle size={15} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">Gemini API key not detected on server</div>
                <p className="mt-0.5 text-amber-800">
                  Configure <code className="font-mono">GEMINI_API_KEY</code> in your runtime
                  Secrets panel so <code className="font-mono">/api/ask-me</code> can execute live
                  queries.
                </p>
              </div>
            </div>
          )}

          {messages.length === 0 && (
            <div className="space-y-5">
              <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
                  <Sparkles size={14} className="text-[#0D1520]" />
                  <span>{welcomeTitle}</span>
                </div>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  {welcomeDescription}
                </p>
              </div>

              <div className="space-y-4">
                {promptGroups.map((grp) => (
                  <div key={grp.group} className="space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      {grp.group}
                    </div>
                    <div className="flex flex-col gap-2">
                      {grp.prompts.map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          disabled={isLoading}
                          onClick={() => onSendMessage(prompt)}
                          className="group text-left px-3.5 py-2.5 bg-white border border-[#E2E8F0] rounded-md text-xs text-slate-700 hover:border-slate-400 hover:bg-slate-50 transition-colors flex items-center justify-between gap-3"
                        >
                          <span>{prompt}</span>
                          <ArrowUpRight
                            size={14}
                            className="text-slate-400 group-hover:text-slate-700 shrink-0"
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => {
            if (msg.role === 'user') {
              return (
                <div key={msg.id} className="flex justify-end">
                  <div className="bg-[#0D1520] text-white text-xs sm:text-[13px] leading-relaxed px-4 py-2.5 rounded-lg max-w-[85%] shadow-xs">
                    {msg.text}
                  </div>
                </div>
              );
            }

            const structured = msg.structured;
            const sqlSources = structured?.sql_sources || [];
            const totalSqlRows = sqlSources.reduce((s, q) => s + q.row_count, 0);
            const isSqlOpen = Boolean(expandedSqlIds[msg.id]);
            const contactPills = (structured?.contact_pills || []).filter((p) =>
              p.contact_type === 'investor'
                ? permissions.can_view_investors
                : permissions.can_view_customers
            );
            const draftActions = (structured?.draft_actions || []).filter((d) =>
              d.audience_type === 'investor'
                ? permissions.can_view_investors
                : permissions.can_view_customers
            );
            const singleContact =
              contactPills.length === 1
                ? contactById.get(contactPills[0].id) || contactPills[0]
                : null;

            return (
              <div key={msg.id} className="bg-white border border-[#E2E8F0] rounded-lg p-4 space-y-4">
                {msg.error ? (
                  <div className="bg-rose-50 border border-rose-200 rounded-md p-3 text-xs text-rose-800 flex items-start gap-2">
                    <AlertCircle size={15} className="text-rose-600 shrink-0 mt-0.5" />
                    <div>{msg.error}</div>
                  </div>
                ) : structured ? (
                  <>
                    {/* Narrative Summary */}
                    <div className="text-[13px] leading-relaxed text-slate-800 whitespace-pre-line">
                      {structured.summary}
                    </div>

                    {/* KPI Summary Strip */}
                    {structured.kpis && structured.kpis.length > 0 && (
                      <div className="grid grid-cols-2 gap-2">
                        {structured.kpis.map((kpi, idx) => (
                          <div
                            key={`${kpi.label}_${idx}`}
                            className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-md px-3 py-2.5"
                          >
                            <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500 truncate">
                              {kpi.label}
                            </div>
                            <div className="text-sm font-semibold text-slate-900 tabular-nums mt-0.5 truncate">
                              {kpi.value}
                            </div>
                            {kpi.sub && (
                              <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                                {kpi.sub}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Compact Data Table */}
                    {structured.table &&
                      structured.table.columns.length > 0 &&
                      structured.table.rows.length > 0 && (
                        <div className="border border-[#E2E8F0] rounded-md overflow-x-auto">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                                {structured.table.columns
                                  .filter((c) => c !== 'contact_id')
                                  .map((col) => (
                                    <th
                                      key={col}
                                      className="px-3 py-2 font-medium text-[11px] text-slate-500 whitespace-nowrap"
                                    >
                                      {col}
                                    </th>
                                  ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#E2E8F0]">
                              {structured.table.rows.map((row, rIdx) => {
                                const rowContactId =
                                  typeof row.contact_id === 'string' &&
                                  contactById.has(row.contact_id)
                                    ? row.contact_id
                                    : null;
                                return (
                                  <tr
                                    key={rIdx}
                                    onClick={() => {
                                      if (rowContactId) onOpenContact(rowContactId);
                                    }}
                                    className={
                                      rowContactId
                                        ? 'hover:bg-slate-50 cursor-pointer transition-colors'
                                        : ''
                                    }
                                  >
                                    {structured.table!.columns
                                      .filter((c) => c !== 'contact_id')
                                      .map((col) => {
                                        const cellVal = row[col] ?? null;
                                        const numeric = isNumericCell(cellVal);
                                        return (
                                          <td
                                            key={col}
                                            className={`px-3 py-2 text-slate-700 whitespace-nowrap ${
                                              numeric ? 'tabular-nums font-mono text-[11px]' : ''
                                            }`}
                                          >
                                            {formatCellValue(col, cellVal)}
                                          </td>
                                        );
                                      })}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}

                    {/* Clickable Contact Pills */}
                    {contactPills.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-medium text-slate-500">
                          Referenced Contacts (click to inspect drawer)
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {contactPills.map((pill) => (
                            <button
                              key={pill.id}
                              type="button"
                              onClick={() => onOpenContact(pill.id)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs bg-[#F8FAFC] hover:bg-slate-100 border border-[#E2E8F0] rounded-md text-slate-800 transition-colors"
                            >
                              <span className="font-medium">{pill.full_name}</span>
                              <span className="text-slate-400">·</span>
                              <span className="text-slate-600">{pill.organization}</span>
                              {pill.stage && (
                                <span className="text-[10px] font-mono px-1.5 py-0.2 bg-white border border-[#E2E8F0] rounded text-slate-600">
                                  {pill.stage}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Prepared Draft Action Cards (from prepare_outreach_draft tool) */}
                    {draftActions.length > 0 && (
                      <div className="space-y-2.5">
                        {draftActions.map((draft, dIdx) => {
                          const eligibleContact =
                            draft.contacts.length === 1
                              ? contactById.get(draft.contacts[0].id) || draft.contacts[0]
                              : null;
                          return (
                            <div
                              key={dIdx}
                              className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-md p-3 space-y-2.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                                  <Mail size={13} />
                                  <span>
                                    Prepared Draft ({draft.recipient_count}{' '}
                                    {draft.audience_type === 'investor'
                                      ? 'Investors'
                                      : 'Enterprise Contacts'}
                                    )
                                  </span>
                                </div>
                                <span className="text-[10px] font-mono text-slate-500">
                                  Review required before send
                                </span>
                              </div>
                              <div className="text-xs text-slate-700">
                                <span className="text-slate-400">Subject: </span>
                                <span className="font-medium">{draft.subject}</span>
                              </div>
                              {draft.body_template && (
                                <div className="text-[11px] text-slate-600 bg-white border border-[#E2E8F0] rounded p-2.5 whitespace-pre-line max-h-28 overflow-y-auto font-mono">
                                  {draft.body_template}
                                </div>
                              )}
                              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                                <button
                                  type="button"
                                  disabled={!permissions.can_send_campaigns}
                                  onClick={() =>
                                    onDraftInComposer(
                                      draft.contact_ids,
                                      draft.audience_type,
                                      draft.subject,
                                      draft.body_template
                                    )
                                  }
                                  title={
                                    !permissions.can_send_campaigns
                                      ? 'Requires can_send_campaigns permission'
                                      : undefined
                                  }
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#0D1520] rounded-md hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                                >
                                  <Send size={12} />
                                  Draft Follow-Up in Composer
                                </button>
                                {eligibleContact && (
                                  <a
                                    href={buildSuperhumanHref(
                                      eligibleContact,
                                      draft.subject,
                                      draft.body_template
                                    )}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-[#E2E8F0] rounded-md hover:bg-slate-100 whitespace-nowrap"
                                  >
                                    <ExternalLink size={12} />
                                    Open in Superhuman
                                  </a>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* 1-Click Next-Action Buttons when contacts are referenced without explicit draft tool */}
                    {draftActions.length === 0 && contactPills.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
                        <button
                          type="button"
                          disabled={!permissions.can_send_campaigns}
                          onClick={() => {
                            const primaryType = contactPills[0].contact_type;
                            const sameAudienceIds = contactPills
                              .filter((p) => p.contact_type === primaryType)
                              .map((p) => p.id);
                            onDraftInComposer(sameAudienceIds, primaryType);
                          }}
                          title={
                            !permissions.can_send_campaigns
                              ? 'Requires can_send_campaigns permission'
                              : undefined
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#0D1520] rounded-md hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                          <Send size={12} />
                          Draft Follow-Up in Composer ({contactPills.length})
                        </button>
                        {singleContact && (
                          <a
                            href={buildSuperhumanHref(singleContact)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-[#E2E8F0] rounded-md hover:bg-slate-100 whitespace-nowrap"
                          >
                            <ExternalLink size={12} />
                            Open in Superhuman
                          </a>
                        )}
                      </div>
                    )}

                    {/* Follow-up Suggestion Chips */}
                    {structured.follow_up_suggestions &&
                      structured.follow_up_suggestions.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {structured.follow_up_suggestions.map((sug) => (
                            <button
                              key={sug}
                              type="button"
                              disabled={isLoading}
                              onClick={() => onSendMessage(sug)}
                              className="px-2.5 py-1 text-[11px] bg-slate-50 hover:bg-slate-100 text-slate-700 border border-[#E2E8F0] rounded-md transition-colors text-left"
                            >
                              {sug}
                            </button>
                          ))}
                        </div>
                      )}

                    {/* Collapsible SQL & Sources Disclosure Pill */}
                    {sqlSources.length > 0 && (
                      <div className="pt-1 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => toggleSqlDisclosure(msg.id)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono text-slate-600 bg-slate-50 hover:bg-slate-100 border border-[#E2E8F0] rounded-md transition-colors"
                        >
                          <Database size={11} className="text-slate-500" />
                          <span>
                            SQL &amp; Sources · {totalSqlRows} row{totalSqlRows === 1 ? '' : 's'} ·{' '}
                            {sqlSources.length} quer{sqlSources.length === 1 ? 'y' : 'ies'}
                          </span>
                          {isSqlOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        </button>

                        {isSqlOpen && (
                          <div className="mt-2 space-y-2">
                            {sqlSources.map((src, sIdx) => (
                              <div
                                key={sIdx}
                                className="bg-[#0D1520] text-slate-200 rounded-md p-3 text-[11px] font-mono space-y-1.5"
                              >
                                <div className="flex items-center justify-between gap-2 text-slate-400">
                                  <span className="truncate">{src.purpose}</span>
                                  <span className="shrink-0">
                                    {src.source === 'supabase_rpc'
                                      ? 'Supabase RPC'
                                      : 'In-Memory SQL'}{' '}
                                    · {src.row_count} rows{src.retried ? ' (LIKE retry)' : ''}
                                  </span>
                                </div>
                                <pre className="whitespace-pre-wrap break-words text-emerald-300 leading-relaxed">
                                  {src.sql}
                                </pre>
                                {src.error && (
                                  <div className="text-rose-300">Error: {src.error}</div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-[13px] text-slate-800 whitespace-pre-line">{msg.text}</div>
                )}
              </div>
            );
          })}

          {isLoading && (
            <div className="bg-white border border-[#E2E8F0] rounded-lg p-4 flex items-center gap-2.5 text-xs text-slate-600">
              <Loader2 size={15} className="animate-spin text-[#0D1520] shrink-0" />
              <span>Querying CRM database &amp; synthesizing telemetry...</span>
            </div>
          )}
        </div>

        {/* Bottom Prompt Bar */}
        <div className="bg-white border-t border-[#E2E8F0] p-4 shrink-0">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder={inputPlaceholder}
              className="flex-1 resize-none px-3 py-2 text-xs sm:text-[13px] bg-[#F8FAFC] border border-[#E2E8F0] rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-400"
            />
            <button
              type="button"
              disabled={!input.trim() || isLoading}
              onClick={handleSubmit}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium text-white bg-[#0D1520] rounded-md hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0"
            >
              <Send size={13} />
              Ask
            </button>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400">
            <span>Enter to send · Shift+Enter for newline · Esc to close</span>
            <span>Read-only SQL + explicit Composer approval</span>
          </div>
        </div>
      </div>
  );

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-slate-900/25 backdrop-blur-[1px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {contentPanel}
    </div>
  );
}
