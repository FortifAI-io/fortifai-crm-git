import { useMemo, useState } from 'react';
import { ExternalLink, Eye, Mail, MessageSquareReply, Send, Sparkles, Trash2, X } from 'lucide-react';
import type {
  Contact,
  ContactType,
  CrmUser,
  CustomFieldDefinition,
  Quarter,
  Region,
  TelemetryEvent,
} from '../types/crm';
import { CUSTOMER_STAGES, INVESTOR_STAGES, QUARTERS, REGIONS } from '../data/seedData';
import { getRegionBadgeStyle } from '../utils/crmHelpers';
import { CustomFieldCell } from './CustomFieldCell';
import { DeliveryStatusBadge } from './DeliveryStatusBadge';

interface ContactDrawerProps {
  contact: Contact;
  currentUser: CrmUser;
  activeUsers: CrmUser[];
  customFields: CustomFieldDefinition[];
  telemetry: TelemetryEvent[];
  canEdit: boolean;
  canSendCampaigns: boolean;
  composerAudience: ContactType;
  composerSubject: string;
  composerBody: string;
  composerSendFrom: string;
  useAssignedOwnerSender: boolean;
  bccEnabled: boolean;
  renderTemplate: (tpl: string, contact?: Contact) => string;
  onClose: () => void;
  onUpdateContact: (id: string, patch: Partial<Contact>) => void;
  onUpdateCustomFieldValue: (
    contactId: string,
    fieldKey: string,
    value: string | number | boolean
  ) => void;
  onComposeEmail: (contact: Contact, subject?: string, body?: string) => void;
  onLogInboundReply?: (
    contact: Contact,
    payload: { subject: string; snippet: string }
  ) => Promise<void>;
  onOpenAccountIntelligence?: (contact: Contact) => void;
}

function formatUserSender(user: CrmUser): string {
  const displayName = user.sender_display_name?.trim() || user.full_name;
  return `${displayName} <${user.email}>`;
}

export function ContactDrawer({
  contact,
  currentUser,
  activeUsers,
  customFields,
  telemetry,
  canEdit,
  canSendCampaigns,
  composerAudience,
  composerSubject,
  composerBody,
  composerSendFrom,
  useAssignedOwnerSender,
  bccEnabled,
  renderTemplate,
  onClose,
  onUpdateContact,
  onUpdateCustomFieldValue,
  onComposeEmail,
  onLogInboundReply,
  onOpenAccountIntelligence,
}: ContactDrawerProps) {
  const [replyFormOpen, setReplyFormOpen] = useState(false);
  const [replySubject, setReplySubject] = useState(
    contact.contact_type === 'investor'
      ? `Re: Fortifai ($3M Seed) — ${contact.organization}`
      : `Re: Fortifai Continuous Assurance — ${contact.organization}`
  );
  const [replySnippet, setReplySnippet] = useState('');
  const [savingReply, setSavingReply] = useState(false);
  const [quickNoteDraft, setQuickNoteDraft] = useState('');

  const templatePresets = useMemo(() => {
    const signOffName = currentUser.sender_display_name?.trim() || currentUser.full_name;
    const isInvestor = contact.contact_type === 'investor';

    const defaultSubject = isInvestor
      ? 'Fortifai — Autonomous Audit & Compliance for Fortune 500 ($3M Seed)'
      : 'Continuous Audit & Counterpart Risk Automation — Fortifai';
    const defaultBody = isInvestor
      ? `Hi {{first_name}},\n\n{{custom_hook}}\n\nWe are raising a $3M Seed ($15M cap post-money SAFE) with enterprise traction across Honeywell, Nokia, and Brookfield Properties.\n\nYou can review our 25-slide deck and 2027–2031 financial model directly in our investor portal:\nhttps://investor.fortifai.io/?ref={{contact_id}}\n\nWould you be open to a 20-minute conversation next week?\n\nBest,\n${signOffName}\nFortifai`
      : `Hi {{first_name}},\n\nFollowing up on how {{organization}} approaches continuous controls testing and third-party compliance across {{region}}.\n\nFortifai deploys autonomous AI assurance agents directly over SAP, Oracle, and Workday to test 100% of transactions rather than manual quarterly samples.\n\nYou can explore an interactive briefing tailored for {{title}} leaders here:\nhttps://overview.fortifai.io/?ref={{contact_id}}\n\nOpen to a brief 15-minute walkthrough next Tuesday or Thursday?\n\nBest,\n${signOffName}\nFortifai`;

    const followUpSubject = isInvestor
      ? `Quick follow-up: {{organization}} & Fortifai ($3M Seed)`
      : `Quick follow-up for {{organization}} — Autonomous Audit Briefing`;
    const followUpBody = isInvestor
      ? `Hi {{first_name}},\n\nSharing a quick note ahead of our $3M Seed close. Since our last email, we have progressed commercial reviews across Tier I Fortune 500 accounts.\n\nDirect portal link for {{organization}}:\nhttps://investor.fortifai.io/?ref={{contact_id}}\n\nHappy to send over our data room checklist if helpful.\n\nBest,\n${signOffName}`
      : `Hi {{first_name}},\n\nChecking back in on continuous controls monitoring for {{organization}} in {{region}}.\n\nOur briefing room remains live for your team:\nhttps://overview.fortifai.io/?ref={{contact_id}}\n\nLet me know if next week works for a 15-minute technical walkthrough.\n\nBest,\n${signOffName}`;

    const presets: { id: string; label: string; subject: string; body: string }[] = [];
    if (composerAudience === contact.contact_type) {
      presets.push({
        id: 'composer',
        label: 'Active Composer Template',
        subject: composerSubject,
        body: composerBody,
      });
    }
    presets.push(
      {
        id: 'default',
        label: isInvestor ? 'Seed Outreach Template' : 'Enterprise Outreach Template',
        subject: defaultSubject,
        body: defaultBody,
      },
      {
        id: 'followup',
        label: 'Portal Follow-Up Nudge',
        subject: followUpSubject,
        body: followUpBody,
      }
    );
    return presets;
  }, [
    contact.contact_type,
    composerAudience,
    composerSubject,
    composerBody,
    currentUser.sender_display_name,
    currentUser.full_name,
  ]);

  const [selectedPresetId, setSelectedPresetId] = useState<string>(templatePresets[0].id);
  const activeTemplate =
    templatePresets.find((p) => p.id === selectedPresetId) || templatePresets[0];

  const resolvedFromAddress = useMemo(() => {
    if (useAssignedOwnerSender) {
      const ownerUser =
        activeUsers.find((u) => u.id === contact.owner_id) ||
        activeUsers.find(
          (u) => u.email.toLowerCase() === (contact.owner_email || '').toLowerCase()
        );
      if (ownerUser) return formatUserSender(ownerUser);
    }
    return composerSendFrom || formatUserSender(currentUser);
  }, [useAssignedOwnerSender, activeUsers, contact.owner_id, contact.owner_email, composerSendFrom, currentUser]);

  const renderedPreviewSubject = renderTemplate(activeTemplate.subject, contact);
  const renderedPreviewBody = renderTemplate(activeTemplate.body, contact);

  const relevantCustomFields = customFields.filter(
    (f) => f.entity_scope === contact.contact_type || f.entity_scope === 'both'
  );
  const contactEvents = telemetry.filter((t) => t.contact_id === contact.id);

  const superhumanSubject =
    contact.contact_type === 'investor'
      ? `Fortifai ($3M Seed) — ${contact.organization}`
      : `Fortifai Continuous Assurance — ${contact.organization}`;

  const superhumanBody =
    contact.contact_type === 'investor'
      ? `Hi ${contact.first_name || contact.full_name},\n\n${
          contact.custom_hook ||
          `Following up on our $3M Seed ($15M cap SAFE) and enterprise deployments across Honeywell, Nokia, and Brookfield Properties.`
        }\n\nBest,\nVarun`
      : `Hi ${contact.first_name || contact.full_name},\n\nFollowing up on continuous controls & risk assurance for ${contact.organization}.\n\nBest,\nVarun`;

  const mailtoHref = `mailto:${encodeURIComponent(contact.email)}?subject=${encodeURIComponent(
    renderedPreviewSubject || superhumanSubject
  )}&body=${encodeURIComponent(renderedPreviewBody || superhumanBody)}`;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30 backdrop-blur-[1px]">
      <div className="w-full max-w-xl bg-white h-full border-l border-[#E2E8F0] shadow-xl flex flex-col justify-between overflow-y-auto">
        <div className="p-6 space-y-6">
          <div className="flex items-start justify-between border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                  {contact.contact_type === 'investor' ? 'Seed Investor' : 'Enterprise Account'}
                </span>
                <span
                  className={`text-[11px] px-2 py-0.5 rounded border font-medium ${getRegionBadgeStyle(
                    contact.region
                  )}`}
                >
                  {contact.region} · {contact.location}
                </span>
                <DeliveryStatusBadge
                  status={contact.delivery_status}
                  openedAt={contact.opened_at}
                  openedDurationSec={contact.opened_duration_sec}
                  bouncedReason={contact.bounced_reason}
                />
              </div>
              <h2 className="text-lg font-semibold text-slate-900 mt-2">{contact.full_name}</h2>
              <p className="text-xs text-slate-500">
                {contact.title} at <strong className="text-slate-700">{contact.organization}</strong>{' '}
                · {contact.email}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              aria-label="Close drawer"
            >
              <X size={18} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">Stage / Status</label>
              <select
                value={contact.stage}
                disabled={!canEdit}
                onChange={(e) => {
                  const nextStage = e.target.value;
                  onUpdateContact(contact.id, {
                    stage: nextStage,
                    unsubscribed: nextStage === 'Passed' ? true : contact.unsubscribed,
                  });
                }}
                className="w-full bg-slate-50 border border-[#E2E8F0] rounded-md px-2.5 py-2 font-medium text-slate-800 disabled:opacity-60"
              >
                {(contact.contact_type === 'customer' ? CUSTOMER_STAGES : INVESTOR_STAGES)
                  .filter((s) => s !== 'All')
                  .map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Region</label>
              <select
                value={contact.region}
                disabled={!canEdit}
                onChange={(e) =>
                  onUpdateContact(contact.id, { region: e.target.value as Region })
                }
                className="w-full bg-slate-50 border border-[#E2E8F0] rounded-md px-2.5 py-2 text-slate-800 disabled:opacity-60"
              >
                {REGIONS.filter((r) => r !== 'All').map((reg) => (
                  <option key={reg} value={reg}>
                    {reg}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">
                {contact.contact_type === 'investor'
                  ? 'Target / Committed Check ($)'
                  : 'Target ARR ($)'}
              </label>
              <input
                type="number"
                disabled={!canEdit}
                value={contact.amount_usd || 0}
                onChange={(e) =>
                  onUpdateContact(contact.id, { amount_usd: Number(e.target.value) })
                }
                className="w-full bg-slate-50 border border-[#E2E8F0] rounded-md px-2.5 py-2 text-slate-800 tabular-nums disabled:opacity-60"
              />
            </div>

            {contact.contact_type === 'customer' ? (
              <div>
                <label className="block text-slate-400 mb-1">Probability (%) / Close Qtr</label>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    disabled={!canEdit}
                    value={contact.probability ?? 0}
                    onChange={(e) =>
                      onUpdateContact(contact.id, { probability: Number(e.target.value) })
                    }
                    className="w-16 bg-slate-50 border border-[#E2E8F0] rounded-md px-2 py-2 text-slate-800 tabular-nums disabled:opacity-60"
                  />
                  <select
                    value={contact.expected_close || 'Q2 2027'}
                    disabled={!canEdit}
                    onChange={(e) =>
                      onUpdateContact(contact.id, {
                        expected_close: e.target.value as Quarter,
                      })
                    }
                    className="flex-1 bg-slate-50 border border-[#E2E8F0] rounded-md px-2 py-2 text-slate-800 disabled:opacity-60"
                  >
                    {QUARTERS.map((q) => (
                      <option key={q} value={q}>
                        {q}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-slate-400 mb-1">Outreach Suppression</label>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() =>
                    onUpdateContact(contact.id, {
                      unsubscribed: !contact.unsubscribed,
                    })
                  }
                  className={`w-full px-2.5 py-2 rounded-md border font-medium text-left disabled:opacity-60 ${
                    contact.unsubscribed
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}
                >
                  {contact.unsubscribed ? 'Suppressed' : 'Active / Eligible'}
                </button>
              </div>
            )}
          </div>

          {/* Assigned Deal / Contact Owner (Required from active crm_users) */}
          <div className="text-xs">
            <label className="block text-slate-400 mb-1">
              Assigned Deal / Contact Owner (Active crm_users) *
            </label>
            <select
              value={contact.owner_id || ''}
              disabled={!canEdit}
              required
              onChange={(e) => {
                const selected = activeUsers.find((u) => u.id === e.target.value);
                if (!selected) return;
                onUpdateContact(contact.id, {
                  owner_id: selected.id,
                  owner_email: selected.email,
                  owner: selected.full_name,
                });
              }}
              className="w-full bg-slate-50 border border-[#E2E8F0] rounded-md px-2.5 py-2 font-medium text-slate-800 disabled:opacity-60"
            >
              {!activeUsers.some((u) => u.id === contact.owner_id) && (
                <option value={contact.owner_id || ''}>
                  {contact.owner ? `${contact.owner} (Select active owner)` : 'Select active owner...'}
                </option>
              )}
              {activeUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name} ({u.email}) — {u.role}
                </option>
              ))}
            </select>
          </div>

          {contact.contact_type === 'investor' && (
            <div className="text-xs">
              <label className="block text-slate-400 mb-1">
                Custom 1-Sentence Opening Hook (&#123;&#123;custom_hook&#125;&#125;)
              </label>
              <textarea
                rows={3}
                disabled={!canEdit}
                value={contact.custom_hook || ''}
                onChange={(e) =>
                  onUpdateContact(contact.id, { custom_hook: e.target.value })
                }
                className="w-full p-2.5 bg-slate-50 border border-[#E2E8F0] rounded-md text-slate-800 disabled:opacity-60"
              />
            </div>
          )}

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">Next Action / Follow-Up</label>
              <input
                type="text"
                disabled={!canEdit}
                value={contact.next_step || ''}
                onChange={(e) =>
                  onUpdateContact(contact.id, { next_step: e.target.value })
                }
                className="w-full px-2.5 py-2 bg-slate-50 border border-[#E2E8F0] rounded-md text-slate-800 disabled:opacity-60"
              />
            </div>
          </div>

          {/* Quick Notes (Internal Team Reference) */}
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-800">Quick Notes</span>
              <span className="text-[11px] text-slate-400 tabular-nums">
                {(contact.quick_notes?.length || 0) + (contact.notes?.trim() ? 1 : 0)}{' '}
                {(contact.quick_notes?.length || 0) + (contact.notes?.trim() ? 1 : 0) === 1
                  ? 'entry'
                  : 'entries'}{' '}
                · Internal team reference
              </span>
            </div>

            {canEdit && (
              <div className="flex gap-2 items-start">
                <textarea
                  rows={2}
                  maxLength={500}
                  value={quickNoteDraft}
                  onChange={(e) => setQuickNoteDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && quickNoteDraft.trim()) {
                      e.preventDefault();
                      const trimmed = quickNoteDraft.trim();
                      const nextEntry = {
                        id: `qn_${Date.now()}`,
                        text: trimmed,
                        author_name: currentUser.full_name,
                        author_email: currentUser.email,
                        created_at: new Date().toISOString(),
                      };
                      onUpdateContact(contact.id, {
                        quick_notes: [nextEntry, ...(contact.quick_notes || [])],
                      });
                      setQuickNoteDraft('');
                    }
                  }}
                  placeholder={`Add a short internal note on ${contact.first_name || contact.full_name}... (⌘+Enter to save)`}
                  className="flex-1 px-2.5 py-2 text-xs bg-slate-50 border border-[#E2E8F0] rounded-md text-slate-800 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-slate-400 resize-none"
                />
                <button
                  type="button"
                  disabled={!quickNoteDraft.trim()}
                  onClick={() => {
                    const trimmed = quickNoteDraft.trim();
                    if (!trimmed) return;
                    const nextEntry = {
                      id: `qn_${Date.now()}`,
                      text: trimmed,
                      author_name: currentUser.full_name,
                      author_email: currentUser.email,
                      created_at: new Date().toISOString(),
                    };
                    onUpdateContact(contact.id, {
                      quick_notes: [nextEntry, ...(contact.quick_notes || [])],
                    });
                    setQuickNoteDraft('');
                  }}
                  className="px-3 py-2 text-xs font-medium text-white bg-[#0D1520] rounded-md hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
                >
                  Save Note
                </button>
              </div>
            )}

            {(contact.quick_notes && contact.quick_notes.length > 0) || contact.notes?.trim() ? (
              <div className="border border-[#E2E8F0] rounded-md divide-y divide-slate-100 bg-white">
                {(contact.quick_notes || []).map((entry) => (
                  <div
                    key={entry.id}
                    className="px-3 py-2.5 text-xs flex items-start justify-between gap-2 group"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="text-slate-800 whitespace-pre-wrap break-words leading-relaxed">
                        {entry.text}
                      </p>
                      <div className="text-[11px] text-slate-400 tabular-nums">
                        {entry.author_name} ·{' '}
                        {new Date(entry.created_at).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        aria-label="Delete quick note"
                        onClick={() =>
                          onUpdateContact(contact.id, {
                            quick_notes: (contact.quick_notes || []).filter(
                              (n) => n.id !== entry.id
                            ),
                          })
                        }
                        className="p-1 text-slate-300 hover:text-rose-600 rounded transition-colors shrink-0"
                        title="Remove note"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}

                {contact.notes?.trim() && (
                  <div className="px-3 py-2.5 text-xs flex items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <p className="text-slate-800 whitespace-pre-wrap break-words leading-relaxed">
                        {contact.notes}
                      </p>
                      <div className="text-[11px] text-slate-400">
                        Account summary note · Internal
                      </div>
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        aria-label="Clear summary note"
                        onClick={() => onUpdateContact(contact.id, { notes: '' })}
                        className="p-1 text-slate-300 hover:text-rose-600 rounded transition-colors shrink-0"
                        title="Remove note"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-slate-400">
                No internal quick notes recorded for {contact.first_name || contact.full_name} yet.
              </div>
            )}
          </div>

          {/* Custom Fields */}
          {relevantCustomFields.length > 0 && (
            <div className="border-t border-slate-100 pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800">Additional Details</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                {relevantCustomFields.map((cf) => (
                  <div key={cf.id}>
                    <label className="block text-slate-400 mb-1">{cf.field_label}</label>
                    <CustomFieldCell
                      contact={contact}
                      field={cf}
                      disabled={!canEdit}
                      onUpdateValue={onUpdateCustomFieldValue}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Visual Email Preview (Live Data Rendering) */}
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Eye size={13} className="text-slate-500" />
                <span className="text-xs font-semibold text-slate-800">Visual Email Preview</span>
              </div>
              <div className="flex items-center gap-2">
                <select
                  aria-label="Select email template to preview"
                  value={activeTemplate.id}
                  onChange={(e) => setSelectedPresetId(e.target.value)}
                  className="text-[11px] bg-slate-50 border border-[#E2E8F0] rounded px-2 py-1 text-slate-700 font-medium focus:outline-none focus:border-slate-400"
                >
                  {templatePresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                </select>
                {canSendCampaigns && (
                  <button
                    type="button"
                    onClick={() =>
                      onComposeEmail(contact, activeTemplate.subject, activeTemplate.body)
                    }
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:underline whitespace-nowrap shrink-0"
                  >
                    <Mail size={11} />
                    Load in Composer
                  </button>
                )}
              </div>
            </div>

            <div className="border border-[#E2E8F0] rounded-lg overflow-hidden bg-white">
              <div className="bg-slate-50 border-b border-slate-200/80 px-3.5 py-2.5 space-y-1 text-[11px]">
                <div className="flex items-baseline gap-2">
                  <span className="text-slate-400 w-12 shrink-0">From:</span>
                  <span className="font-mono text-slate-700 truncate">{resolvedFromAddress}</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-slate-400 w-12 shrink-0">To:</span>
                  <span className="font-medium text-slate-800 truncate">
                    {contact.full_name} &lt;{contact.email}&gt;
                  </span>
                </div>
                {bccEnabled && (
                  <div className="flex items-baseline gap-2">
                    <span className="text-slate-400 w-12 shrink-0">BCC:</span>
                    <span className="font-mono text-indigo-700 truncate">
                      {currentUser.email} (Superhuman sync)
                    </span>
                  </div>
                )}
                <div className="flex items-baseline gap-2 pt-0.5">
                  <span className="text-slate-400 w-12 shrink-0">Subject:</span>
                  <span className="font-semibold text-slate-900">{renderedPreviewSubject}</span>
                </div>
              </div>

              <div className="p-4 text-xs leading-relaxed text-slate-800 whitespace-pre-wrap max-h-64 overflow-y-auto">
                {renderedPreviewBody}
                <div className="mt-4 pt-2.5 border-t border-slate-100 text-[11px] text-slate-400">
                  Tracked portal link active · If you&apos;d prefer not to receive updates,{' '}
                  <span className="underline">unsubscribe here</span>.
                </div>
              </div>
            </div>
          </div>

          {/* Inbound Reply Summary & Manual Logging */}
          <div className="border-t border-slate-100 pt-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-800">
                Inbound Reply Logging &amp; Telemetry
              </span>
              {canEdit && onLogInboundReply && (
                <button
                  type="button"
                  onClick={() => setReplyFormOpen((prev) => !prev)}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 hover:underline"
                >
                  <MessageSquareReply size={12} />
                  {replyFormOpen ? 'Cancel' : '+ Log Inbound Reply'}
                </button>
              )}
            </div>

            {contact.last_reply_snippet && (
              <div className="p-3 rounded-md bg-amber-50/70 border border-amber-200 text-xs space-y-1">
                <div className="flex items-center justify-between text-[11px] text-amber-800 font-medium">
                  <span className="truncate">{contact.last_reply_subject || 'Inbound Reply'}</span>
                  <span className="shrink-0">{contact.replied_at || 'Recorded'}</span>
                </div>
                <p className="text-slate-700 leading-relaxed">{contact.last_reply_snippet}</p>
              </div>
            )}

            {replyFormOpen && onLogInboundReply && (
              <div className="p-3 rounded-md bg-slate-50 border border-[#E2E8F0] space-y-2 text-xs">
                <input
                  type="text"
                  value={replySubject}
                  onChange={(e) => setReplySubject(e.target.value)}
                  placeholder="Reply subject..."
                  className="w-full px-2.5 py-1.5 bg-white border border-[#E2E8F0] rounded text-slate-800"
                />
                <textarea
                  rows={2}
                  value={replySnippet}
                  onChange={(e) => setReplySnippet(e.target.value)}
                  placeholder={`Paste reply summary from ${contact.full_name}...`}
                  className="w-full px-2.5 py-1.5 bg-white border border-[#E2E8F0] rounded text-slate-800"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={!replySnippet.trim() || savingReply}
                    onClick={async () => {
                      setSavingReply(true);
                      await onLogInboundReply(contact, {
                        subject: replySubject.trim() || 'Inbound Reply',
                        snippet: replySnippet.trim(),
                      });
                      setSavingReply(false);
                      setReplySnippet('');
                      setReplyFormOpen(false);
                    }}
                    className="px-3 py-1.5 bg-[#0D1520] text-white rounded font-medium hover:bg-slate-800 disabled:opacity-40"
                  >
                    {savingReply ? 'Saving...' : 'Record Reply'}
                  </button>
                </div>
              </div>
            )}

            {contactEvents.length === 0 ? (
              <div className="text-xs text-slate-400">
                No portal visits or Resend events recorded yet.
              </div>
            ) : (
              <div className="space-y-2">
                {contactEvents.map((evt) => (
                  <div
                    key={evt.id}
                    className="p-2.5 rounded-md bg-slate-50 border border-slate-200/70 text-xs"
                  >
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span className="font-mono text-slate-600">{evt.source}</span>
                      <span>{evt.timestamp}</span>
                    </div>
                    <div className="text-slate-800 mt-1">{evt.detail}</div>
                    {evt.sender_from && (
                      <div className="text-[10px] font-mono text-slate-500 mt-1">
                        From: {evt.sender_from}
                      </div>
                    )}
                    {evt.reply_snippet && (
                      <div className="text-[11px] text-amber-800 mt-1 bg-amber-50/70 px-2 py-1 rounded border border-amber-200/70">
                        {evt.reply_snippet}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="p-4 bg-slate-50 border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
          >
            Close
          </button>
          <div className="flex items-center gap-2 flex-wrap">
            {contact.contact_type === 'customer' && onOpenAccountIntelligence && (
              <button
                type="button"
                onClick={() => onOpenAccountIntelligence(contact)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md hover:bg-indigo-100 whitespace-nowrap"
              >
                <Sparkles size={13} />
                Account Intelligence
              </button>
            )}
            {canSendCampaigns ? (
              <a
                href={mailtoHref}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-800 bg-white border border-[#E2E8F0] rounded-md hover:bg-slate-100 whitespace-nowrap"
                title="Open 1-to-1 personal draft in Superhuman / Mail with native read receipts"
              >
                <ExternalLink size={13} />
                Open in Superhuman
              </a>
            ) : (
              <button
                type="button"
                disabled
                title="Requires can_send_campaigns permission"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-800 bg-white border border-[#E2E8F0] rounded-md opacity-40 cursor-not-allowed whitespace-nowrap"
              >
                <ExternalLink size={13} />
                Open in Superhuman
              </button>
            )}
            <button
              type="button"
              disabled={!canSendCampaigns}
              onClick={() =>
                onComposeEmail(contact, activeTemplate.subject, activeTemplate.body)
              }
              title={!canSendCampaigns ? 'Requires can_send_campaigns permission' : undefined}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#0D1520] rounded-md hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            >
              <Send size={13} />
              Compose Personal Email
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
