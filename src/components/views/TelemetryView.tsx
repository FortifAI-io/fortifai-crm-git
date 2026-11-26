import { useState, type FormEvent } from 'react';
import { Globe, Mail, MessageSquareReply, RefreshCw } from 'lucide-react';
import type { Contact, ContactType, DeliveryStatus, TelemetryEvent } from '../../types/crm';
import { DeliveryStatusBadge } from '../DeliveryStatusBadge';
import { CmsText } from '../CmsText';

interface TelemetryViewProps {
  domainScope: ContactType;
  telemetry: TelemetryEvent[];
  contacts: Contact[];
  openRatePct: number;
  onSimulateWebhook: (
    mode?: 'portal' | 'human_open' | 'bot_scan' | 'replied' | 'bounced',
    domainScope?: ContactType
  ) => void;
  onLogInboundReply: (
    contact: Contact,
    payload: { subject: string; snippet: string }
  ) => Promise<void>;
  onSelectContact: (id: string) => void;
}

function mapEventToStatus(evt: TelemetryEvent): DeliveryStatus {
  switch (evt.event_type) {
    case 'email_sent':
      return 'sent';
    case 'email_delivered':
      return 'delivered';
    case 'email_opened':
      return 'opened';
    case 'email_replied':
      return 'replied';
    case 'email_bounced':
      return 'bounced';
    case 'email_clicked':
    case 'visit':
    case 'deck_opened':
    case 'financials_viewed':
    case 'callback_requested':
    case 'safe_generated':
    case 'agent_explored':
      return 'portal_visited';
    default:
      return 'sent';
  }
}

export function TelemetryView({
  domainScope,
  telemetry,
  contacts,
  openRatePct,
  onSimulateWebhook,
  onLogInboundReply,
  onSelectContact,
}: TelemetryViewProps) {
  const isInvestor = domainScope === 'investor';
  const portalDomain = isInvestor ? 'investor.fortifai.io' : 'overview.fortifai.io';
  const disallowedPortal = isInvestor ? 'overview.fortifai.io' : 'investor.fortifai.io';

  const scopedContacts = contacts.filter((c) => c.contact_type === domainScope);
  const scopedTelemetry = telemetry.filter(
    (t) => t.contact_type === domainScope && t.source !== disallowedPortal
  );

  const [replyDrawerOpen, setReplyDrawerOpen] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string>(scopedContacts[0]?.id || '');
  const [replySubject, setReplySubject] = useState(
    isInvestor
      ? 'Re: Fortifai ($3M Seed) & Investor Room'
      : 'Re: Fortifai Continuous Assurance & Next Steps'
  );
  const [replySnippet, setReplySnippet] = useState('');
  const [savingReply, setSavingReply] = useState(false);

  const botFilteredCount = scopedTelemetry.filter(
    (t) =>
      t.is_bot_scan ||
      (t.event_type === 'email_opened' && t.duration_sec !== undefined && t.duration_sec < 10)
  ).length;
  const portalSessionsCount = scopedTelemetry.filter((t) => t.source === portalDomain).length;
  const repliesCount = scopedTelemetry.filter((t) => t.event_type === 'email_replied').length;

  const handleSubmitReply = async (e: FormEvent) => {
    e.preventDefault();
    const target = scopedContacts.find((c) => c.id === selectedContactId) || scopedContacts[0];
    if (!target || !replySnippet.trim()) return;
    setSavingReply(true);
    try {
      await onLogInboundReply(target, {
        subject: replySubject.trim() || `Re: ${target.organization}`,
        snippet: replySnippet.trim(),
      });
      setReplySnippet('');
      setReplyDrawerOpen(false);
    } finally {
      setSavingReply(false);
    }
  };

  return (
    <div className="p-6 space-y-5 max-w-[1600px] w-full mx-auto">
      {/* Domain-Scoped Telemetry Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 tabular-nums">
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
          <div className="text-xs text-slate-500 font-medium">
            <CmsText
              id={`telemetry.${domainScope}.delivery_label`}
              defaultValue={isInvestor ? 'Investor Resend Delivery' : 'Customer Resend Delivery'}
              section="Outreach & Telemetry"
            />
          </div>
          <div className="text-2xl font-semibold text-slate-900 mt-1">99.2%</div>
          <div className="text-[11px] text-emerald-600 mt-1">SPF / DKIM / DMARC Aligned</div>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
          <div className="text-xs text-slate-500 font-medium">
            <CmsText
              id={`telemetry.${domainScope}.open_rate_label`}
              defaultValue="Verified Human Open Rate"
              section="Outreach & Telemetry"
            />
          </div>
          <div className="text-2xl font-semibold text-slate-900 mt-1">{openRatePct}%</div>
          <div className="text-[11px] text-slate-400 mt-1">
            {botFilteredCount} bot scan{botFilteredCount === 1 ? '' : 's'} (&lt;10s) filtered out
          </div>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
          <div className="text-xs text-slate-500 font-medium">{portalDomain} Sessions</div>
          <div
            className={`text-2xl font-semibold mt-1 ${
              isInvestor ? 'text-indigo-600' : 'text-sky-600'
            }`}
          >
            {portalSessionsCount}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {isInvestor ? 'Auto-updates Seed Funnel' : 'Auto-updates Enterprise Pipeline'}
          </div>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
          <div className="text-xs text-slate-500 font-medium">
            {isInvestor ? 'Investor Inbound Replies' : 'Customer Inbound Replies'}
          </div>
          <div className="text-2xl font-semibold text-amber-600 mt-1">{repliesCount}</div>
          <div className="text-[11px] text-slate-400 mt-1">
            Across {scopedTelemetry.length} {isInvestor ? 'investor' : 'customer'} events
          </div>
        </div>
      </div>

      {/* Manual Inbound Reply Logger */}
      {replyDrawerOpen && (
        <form
          onSubmit={handleSubmitReply}
          className="bg-white border border-[#E2E8F0] rounded-lg p-5 space-y-3 text-xs"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Log Inbound Reply (/api/inbound-reply)
              </h3>
              <p className="text-[11px] text-slate-400">
                Records an inbound email response, sets status to Replied, and preserves reply snippet on the contact timeline.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setReplyDrawerOpen(false)}
              className="text-slate-400 hover:text-slate-700 text-xs"
            >
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Contact / Sender
              </label>
              <select
                value={selectedContactId}
                onChange={(e) => setSelectedContactId(e.target.value)}
                className="w-full px-2.5 py-2 bg-slate-50 border border-[#E2E8F0] rounded-md text-slate-800"
              >
                {scopedContacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name} · {c.organization} ({c.email})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Reply Subject
              </label>
              <input
                type="text"
                required
                value={replySubject}
                onChange={(e) => setReplySubject(e.target.value)}
                className="w-full px-2.5 py-2 bg-white border border-[#E2E8F0] rounded-md text-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              Inbound Reply Snippet / Body
            </label>
            <textarea
              rows={2}
              required
              value={replySnippet}
              onChange={(e) => setReplySnippet(e.target.value)}
              placeholder="e.g. Thanks for the update — let's schedule 25 minutes next Tuesday with our Head of Internal Audit."
              className="w-full px-2.5 py-2 bg-white border border-[#E2E8F0] rounded-md text-slate-900"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingReply || !replySnippet.trim()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#0D1520] rounded-md hover:bg-slate-800 disabled:opacity-40 whitespace-nowrap"
            >
              <MessageSquareReply size={13} />
              {savingReply ? 'Logging Reply...' : 'Record Inbound Reply'}
            </button>
          </div>
        </form>
      )}

      {/* Unified Event Stream */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              {isInvestor
                ? 'Investor Resend & investor.fortifai.io Telemetry'
                : 'Customer Resend & overview.fortifai.io Telemetry'}
            </h2>
            <p className="text-xs text-slate-400">
              Domain-isolated status pills for Sent, Delivered, Verified Opens (&ge;10s), {portalDomain} Visits, Replies, &amp; Bounces
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setReplyDrawerOpen((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-md hover:bg-amber-100 whitespace-nowrap"
            >
              <MessageSquareReply size={13} />
              Log Inbound Reply
            </button>
            <button
              type="button"
              onClick={() => onSimulateWebhook('replied', domainScope)}
              className="px-2.5 py-1.5 text-xs font-medium text-amber-700 bg-white border border-amber-200 rounded-md hover:bg-amber-50 whitespace-nowrap"
            >
              + Sim Inbound Reply
            </button>
            <button
              type="button"
              onClick={() => onSimulateWebhook('human_open', domainScope)}
              className="px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100 whitespace-nowrap"
            >
              + Sim Human Open
            </button>
            <button
              type="button"
              onClick={() => onSimulateWebhook('bot_scan', domainScope)}
              className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 border border-slate-200 rounded-md hover:bg-slate-200 whitespace-nowrap"
            >
              + Sim Bot Scan (&lt;10s)
            </button>
            <button
              type="button"
              onClick={() => onSimulateWebhook('portal', domainScope)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md hover:bg-indigo-100 transition-colors whitespace-nowrap"
            >
              <RefreshCw size={13} />
              {isInvestor ? 'Simulate investor.fortifai.io / SAFE' : 'Simulate overview.fortifai.io Visit'}
            </button>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {scopedTelemetry.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No {isInvestor ? 'investor' : 'customer'} Resend or {portalDomain} events recorded yet.
            </div>
          ) : (
            scopedTelemetry.map((evt) => {
            const derivedStatus = mapEventToStatus(evt);
            return (
              <div
                key={evt.id}
                onClick={() => onSelectContact(evt.contact_id)}
                className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50 cursor-pointer transition-colors text-xs"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div
                    className={`h-8 w-8 rounded-full flex items-center justify-center border shrink-0 ${
                      evt.source === 'investor.fortifai.io'
                        ? 'bg-indigo-50 text-indigo-600 border-indigo-200'
                        : evt.source === 'overview.fortifai.io'
                        ? 'bg-sky-50 text-sky-600 border-sky-200'
                        : evt.event_type === 'email_replied'
                        ? 'bg-amber-50 text-amber-600 border-amber-200'
                        : 'bg-emerald-50 text-emerald-600 border-emerald-200'
                    }`}
                  >
                    {evt.source === 'resend' ? <Mail size={14} /> : <Globe size={14} />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900">{evt.contact_name}</span>
                      <span className="text-slate-400">· {evt.organization}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
                        {evt.source}
                      </span>
                      <DeliveryStatusBadge
                        status={derivedStatus}
                        openedAt={evt.timestamp}
                        openedDurationSec={evt.duration_sec}
                        isBotScan={evt.is_bot_scan}
                      />
                      {evt.sender_from && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 font-mono">
                          From: {evt.sender_from}
                        </span>
                      )}
                      {evt.bcc_inbox && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono">
                          BCC: {evt.bcc_inbox}
                        </span>
                      )}
                    </div>
                    <div className="text-slate-600 mt-0.5">{evt.detail}</div>
                    {evt.reply_snippet && (
                      <div className="mt-1 px-2.5 py-1 rounded bg-amber-50/70 border border-amber-200/70 text-[11px] text-amber-900">
                        {evt.reply_subject ? `${evt.reply_subject}: ` : ''}
                        &ldquo;{evt.reply_snippet}&rdquo;
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-[11px] text-slate-400 shrink-0 ml-4 tabular-nums">
                  {evt.timestamp}
                </div>
              </div>
            );
          })
          )}
        </div>
      </div>
    </div>
  );
}
