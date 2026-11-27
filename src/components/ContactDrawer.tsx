import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Building2,
  CheckCircle2,
  ExternalLink,
  Plus,
  Send,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type {
  Contact,
  CrmUser,
  CustomFieldDefinition,
  Region,
} from '../types/crm';

interface ContactDrawerProps {
  contact: Contact | null;
  allContacts?: Contact[];
  currentUser?: CrmUser;
  activeUsers: CrmUser[];
  customFields: CustomFieldDefinition[];
  telemetry?: unknown[];
  canEdit: boolean;
  canSendCampaigns: boolean;
  composerAudience?: string;
  composerSubject?: string;
  composerBody?: string;
  composerSendFrom?: string;
  useAssignedOwnerSender?: boolean;
  bccEnabled?: boolean;
  renderTemplate?: (tpl: string, c: Contact) => string;
  onClose: () => void;
  onUpdateContact: (id: string, patch: Partial<Contact>) => void;
  onUpdateCustomFieldValue: (
    contactId: string,
    fieldKey: string,
    value: string | number | boolean
  ) => void;
  onDeleteContact?: (id: string) => void;
  onSelectContact?: (id: string) => void;
  onCreateAccountContact?: (newContact: Omit<Contact, 'id'>) => void;
  onComposeEmail: (contact: Contact, subject?: string, body?: string) => void;
  onLogInboundReply?: (contactId: string, snippet?: string) => void;
  onOpenAccountIntelligence?: (contact: Contact) => void;
}

const CUSTOMER_STAGES = [
  '1 Lead',
  '2 Qualified',
  '3 Demo / Discovery',
  '4 Decisionmaker buy in',
  '5 Internal Review Pending',
  '6 Commercial / Contracting',
  '7 Closed Won',
  '8 Closed Lost',
  '9 No response',
];

const INVESTOR_STAGES = [
  'Outreach',
  'Deck Viewed',
  'Meeting Scheduled',
  'Diligence',
  'Soft Circle',
  'SAFE Signed',
  'Wired',
  'Passed',
];

const REGIONS: Region[] = ['US', 'India', 'UAE', 'Singapore', 'UK/Europe', 'Other'];
const PERSONAS = ['CCO/GC', 'CAE', 'CFO', 'CPO', 'CISO / Risk', 'Other'];
const TIERS = ['Tier I', 'Tier II', 'Tier III'];
const FIT_CATEGORIES = ['Best-fit', 'Adjacent', 'Other'];
const CLOSE_QUARTERS = ['', 'Q1 2027', 'Q2 2027', 'Q3 2027', 'Q4 2027'];
const PRODUCTS = [
  'Fortifai',
  'Veritas',
  'D7',
  'Surge',
  'Aegis',
  'Crystal',
  'Kuber',
  'Sara',
];

export function ContactDrawer({
  contact,
  allContacts = [],
  activeUsers,
  customFields,
  canEdit,
  canSendCampaigns,
  onClose,
  onUpdateContact,
  onUpdateCustomFieldValue,
  onDeleteContact,
  onSelectContact,
  onCreateAccountContact,
  onComposeEmail,
  onOpenAccountIntelligence,
}: ContactDrawerProps) {
  const [noteDraft, setNoteDraft] = useState('');
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);

  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newPersona, setNewPersona] = useState('CFO');
  const [newStage, setNewStage] = useState('1 Lead');

  useEffect(() => {
    setShowAddMember(false);
    setNewFirstName('');
    setNewLastName('');
    setNewEmail('');
    setNewTitle('');
    setNewPersona('CFO');
    setNewStage('1 Lead');
  }, [contact?.id]);

  const flashSaved = (label = 'Saved to DB') => {
    setSaveFeedback(label);
    window.setTimeout(() => {
      setSaveFeedback((prev) => (prev === label ? null : prev));
    }, 1800);
  };

  const accountContacts = useMemo(() => {
    if (!contact) return [];
    const orgKey = String(contact.organization || '').trim().toLowerCase();
    if (!orgKey) return [contact];
    const peers = allContacts.filter(
      (c) =>
        c.contact_type === contact.contact_type &&
        String(c.organization || '').trim().toLowerCase() === orgKey
    );
    return peers.length > 0 ? peers : [contact];
  }, [contact, allContacts]);

  if (!contact) return null;

  const isCustomer = contact.contact_type === 'customer';
  const stageOptions = isCustomer ? CUSTOMER_STAGES : INVESTOR_STAGES;
  const usListedVal = String(contact.custom_fields?.us_listed || 'No');
  const fitCategoryVal = String(contact.custom_fields?.fit_category || 'Best-fit');

  const commitPatch = (patch: Partial<Contact>, feedbackLabel = 'Synced to DB') => {
    if (!canEdit) return;
    onUpdateContact(contact.id, patch);
    flashSaved(feedbackLabel);
  };

  // Account-level changes propagate across all contacts tagged to this Account and save to Supabase
  const commitAccountPatch = (
    patch: Partial<Contact>,
    customFieldPatch?: Record<string, string | number | boolean>
  ) => {
    if (!canEdit) return;
    const mergedCustom = customFieldPatch
      ? { ...(contact.custom_fields || {}), ...customFieldPatch }
      : contact.custom_fields;

    onUpdateContact(contact.id, {
      ...patch,
      ...(customFieldPatch ? { custom_fields: mergedCustom } : {}),
    });

    for (const peer of accountContacts) {
      if (peer.id === contact.id) continue;
      onUpdateContact(peer.id, {
        ...patch,
        ...(customFieldPatch
          ? { custom_fields: { ...(peer.custom_fields || {}), ...customFieldPatch } }
          : {}),
      });
    }
    flashSaved('Account updated in DB');
  };

  const handleSaveQuickNote = () => {
    const trimmed = noteDraft.trim();
    if (!trimmed || !canEdit) return;
    const stamp = new Date().toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    const nextNotes = contact.notes
      ? `[${stamp}] ${trimmed}\n${contact.notes}`
      : `[${stamp}] ${trimmed}`;
    commitPatch({ notes: nextNotes }, 'Note saved');
    setNoteDraft('');
  };

  const handleAddContactToAccount = (e: FormEvent) => {
    e.preventDefault();
    if (!canEdit || !onCreateAccountContact) return;
    const first = newFirstName.trim();
    const last = newLastName.trim();
    const full = [first, last].filter(Boolean).join(' ') || 'New Contact';
    const email = newEmail.trim().toLowerCase();
    if (!email) return;

    onCreateAccountContact({
      email,
      first_name: first,
      last_name: last,
      full_name: full,
      organization: contact.organization,
      title: newTitle.trim() || newPersona,
      region: contact.region || 'US',
      location: contact.location || 'United States',
      contact_type: contact.contact_type,
      buyer_persona: newPersona,
      industry: contact.industry || '',
      tier: contact.tier || 'Tier I',
      icp_score: contact.icp_score ?? 80,
      fortune_500: Boolean(contact.fortune_500),
      owner_id: contact.owner_id,
      owner_email: contact.owner_email,
      owner: contact.owner,
      relationship_strength: 'Warm',
      tags: Array.from(
        new Set([
          ...(contact.tier ? [contact.tier] : []),
          newPersona,
          ...(contact.fortune_500 ? ['Fortune 500'] : []),
        ])
      ),
      unsubscribed: false,
      delivery_status: 'not_sent',
      stage: newStage,
      omit_from_pipeline: newStage === '1 Lead' || newStage === '9 No response',
      product_or_instrument: contact.product_or_instrument || 'Fortifai',
      amount_usd: 0,
      probability: newStage === '1 Lead' ? 5 : 15,
      expected_close: contact.expected_close || '',
      next_step: '',
      notes: '',
      custom_fields: {
        us_listed: usListedVal,
        fit_category: fitCategoryVal,
      },
    });

    setShowAddMember(false);
    setNewFirstName('');
    setNewLastName('');
    setNewEmail('');
    setNewTitle('');
    flashSaved(`Added ${full} to ${contact.organization}`);
  };

  const mailtoSubject = encodeURIComponent(
    `Fortifai — ${contact.organization || 'Enterprise Risk & Audit'}`
  );
  const mailtoBody = encodeURIComponent(
    `Hi ${contact.first_name || contact.full_name?.split(' ')[0] || 'there'},\n\n`
  );
  const mailtoHref = `mailto:${contact.email}?subject=${mailtoSubject}&body=${mailtoBody}`;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-[1px]">
      <div className="w-full max-w-[660px] h-full bg-[var(--bg-surface)] border-l border-[var(--border-subtle)] shadow-2xl flex flex-col text-[var(--tx-primary)]">
        {/* Salesforce-Grade Account & Contact Record Banner */}
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)]/80 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 text-[10.5px]">
              <span className="px-2 py-0.5 rounded font-semibold uppercase tracking-wider bg-sky-500/15 text-sky-400 border border-sky-500/30">
                {isCustomer ? 'Enterprise Account Record' : 'Investor Record'}
              </span>
              {contact.tier && (
                <span className="px-2 py-0.5 rounded font-mono bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--tx-secondary)]">
                  {contact.tier}
                </span>
              )}
              {contact.fortune_500 && (
                <span className="px-2 py-0.5 rounded font-mono bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  F500
                </span>
              )}
              {usListedVal === 'Yes' && (
                <span className="px-2 py-0.5 rounded font-mono bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                  US Listed
                </span>
              )}
              {saveFeedback && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-medium">
                  <CheckCircle2 size={10} />
                  {saveFeedback}
                </span>
              )}
            </div>

            <h2 className="mt-1.5 text-lg font-bold text-[var(--tx-primary)] truncate">
              {contact.organization || 'Unnamed Account'}
            </h2>
            <p className="text-xs text-[var(--tx-secondary)] truncate">
              Active Contact:{' '}
              <span className="font-semibold text-[var(--tx-primary)]">{contact.full_name}</span>
              {contact.title ? ` · ${contact.title}` : ''} ·{' '}
              <span className="font-mono text-[11px] text-sky-400">{contact.email}</span>
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close record drawer"
            className="p-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--tx-secondary)] hover:text-[var(--tx-primary)] hover:border-sky-400/50 transition-colors shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable Record Form Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          {/* SECTION 1: ACCOUNT PROFILE & CLASSIFICATION */}
          <div className="rounded-xl bg-[var(--bg-canvas)]/55 border border-[var(--border-subtle)] p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
              <div className="flex items-center gap-1.5 font-semibold text-[var(--tx-primary)] uppercase tracking-wider text-[11px]">
                <Building2 size={13} className="text-sky-400" />
                Account Profile &amp; Classification
              </div>
              <span className="text-[10.5px] text-[var(--tx-muted)]">
                Updates all {accountContacts.length}{' '}
                {accountContacts.length === 1 ? 'contact' : 'contacts'} on account
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-[11px] text-[var(--tx-muted)]">Account / Organization</span>
                <input
                  type="text"
                  disabled={!canEdit}
                  value={contact.organization || ''}
                  onChange={(e) => commitAccountPatch({ organization: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--tx-primary)] focus:outline-none focus:border-sky-400"
                />
              </label>

              <label className="space-y-1">
                <span className="text-[11px] text-[var(--tx-muted)]">Industry / Sector</span>
                <input
                  type="text"
                  disabled={!canEdit}
                  value={contact.industry || ''}
                  onChange={(e) => commitAccountPatch({ industry: e.target.value })}
                  placeholder="e.g., Aviation & Aerospace, Software..."
                  className="w-full px-2.5 py-1.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--tx-primary)] focus:outline-none focus:border-sky-400"
                />
              </label>

              <label className="space-y-1">
                <span className="text-[11px] text-[var(--tx-muted)]">Account Tier</span>
                <select
                  disabled={!canEdit}
                  value={contact.tier || 'Tier I'}
                  onChange={(e) => commitAccountPatch({ tier: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--tx-primary)] focus:outline-none focus:border-sky-400"
                >
                  {TIERS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-[11px] text-[var(--tx-muted)]">Fit Category</span>
                <select
                  disabled={!canEdit}
                  value={fitCategoryVal}
                  onChange={(e) => commitAccountPatch({}, { fit_category: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--tx-primary)] focus:outline-none focus:border-sky-400"
                >
                  {FIT_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-[11px] text-[var(--tx-muted)]">US Listed Status</span>
                <select
                  disabled={!canEdit}
                  value={usListedVal}
                  onChange={(e) => commitAccountPatch({}, { us_listed: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--tx-primary)] focus:outline-none focus:border-sky-400"
                >
                  <option value="Yes">Yes (US Listed)</option>
                  <option value="No">No (Private / Non-US)</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-[11px] text-[var(--tx-muted)]">Fortune 500 Status</span>
                <select
                  disabled={!canEdit}
                  value={contact.fortune_500 ? 'Yes' : 'No'}
                  onChange={(e) =>
                    commitAccountPatch({ fortune_500: e.target.value === 'Yes' })
                  }
                  className="w-full px-2.5 py-1.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--tx-primary)] focus:outline-none focus:border-sky-400"
                >
                  <option value="Yes">Yes (Fortune 500)</option>
                  <option value="No">No</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-[11px] text-[var(--tx-muted)]">Region</span>
                <select
                  disabled={!canEdit}
                  value={contact.region || 'US'}
                  onChange={(e) =>
                    commitAccountPatch({ region: e.target.value as Region })
                  }
                  className="w-full px-2.5 py-1.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--tx-primary)] focus:outline-none focus:border-sky-400"
                >
                  {REGIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-[11px] text-[var(--tx-muted)]">HQ Location &amp; ICP Score</span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    disabled={!canEdit}
                    value={contact.location || ''}
                    onChange={(e) => commitAccountPatch({ location: e.target.value })}
                    placeholder="Location"
                    className="flex-1 min-w-0 px-2.5 py-1.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--tx-primary)] focus:outline-none focus:border-sky-400"
                  />
                  <input
                    type="number"
                    min={0}
                    max={100}
                    disabled={!canEdit}
                    value={contact.icp_score ?? 0}
                    onChange={(e) =>
                      commitAccountPatch({
                        icp_score: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                      })
                    }
                    title="ICP Score (0-100)"
                    className="w-16 px-2 py-1.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-right font-mono text-[var(--tx-primary)] focus:outline-none focus:border-sky-400"
                  />
                </div>
              </label>
            </div>
          </div>

          {/* SECTION 2: ASSOCIATED ACCOUNT CONTACTS & ADD CONTACT TO ACCOUNT */}
          <div className="rounded-xl bg-[var(--bg-canvas)]/55 border border-[var(--border-subtle)] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-2">
              <div className="flex items-center gap-1.5 font-semibold text-[var(--tx-primary)] uppercase tracking-wider text-[11px]">
                <Users size={13} className="text-emerald-400" />
                Account Contacts &amp; Buying Committee ({accountContacts.length})
              </div>
              {canEdit && onCreateAccountContact && (
                <button
                  type="button"
                  onClick={() => setShowAddMember((v) => !v)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-sky-500/15 text-sky-400 border border-sky-500/30 hover:bg-sky-500/25 transition-colors"
                >
                  <UserPlus size={12} />
                  {showAddMember ? 'Cancel' : 'Add Contact to Account'}
                </button>
              )}
            </div>

            {showAddMember && (
              <form
                onSubmit={handleAddContactToAccount}
                className="p-3 rounded-lg bg-[var(--bg-surface)] border border-sky-500/30 space-y-2.5"
              >
                <div className="text-[11px] font-semibold text-sky-400">
                  New Contact Tagged to {contact.organization}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    required
                    placeholder="First Name *"
                    value={newFirstName}
                    onChange={(e) => setNewFirstName(e.target.value)}
                    className="px-2.5 py-1.5 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--tx-primary)]"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Last Name *"
                    value={newLastName}
                    onChange={(e) => setNewLastName(e.target.value)}
                    className="px-2.5 py-1.5 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--tx-primary)]"
                  />
                  <input
                    type="email"
                    required
                    placeholder="Work Email *"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="px-2.5 py-1.5 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--tx-primary)] font-mono"
                  />
                  <input
                    type="text"
                    placeholder="Job Title (e.g., Chief Audit Executive)"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="px-2.5 py-1.5 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--tx-primary)]"
                  />
                  <select
                    value={newPersona}
                    onChange={(e) => setNewPersona(e.target.value)}
                    className="px-2.5 py-1.5 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--tx-primary)]"
                  >
                    {PERSONAS.map((p) => (
                      <option key={p} value={p}>
                        Persona: {p}
                      </option>
                    ))}
                  </select>
                  <select
                    value={newStage}
                    onChange={(e) => setNewStage(e.target.value)}
                    className="px-2.5 py-1.5 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--tx-primary)]"
                  >
                    {stageOptions.map((st) => (
                      <option key={st} value={st}>
                        Stage: {st}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#2E5A8A] text-white text-[11px] font-medium hover:bg-[#244870]"
                  >
                    <Plus size={12} />
                    Save &amp; Tag to {contact.organization}
                  </button>
                </div>
              </form>
            )}

            <div className="divide-y divide-[var(--border-subtle)] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
              {accountContacts.map((member) => {
                const isCurrent = member.id === contact.id;
                return (
                  <div
                    key={member.id}
                    onClick={() => {
                      if (!isCurrent && onSelectContact) onSelectContact(member.id);
                    }}
                    className={`px-3 py-2 flex items-center justify-between gap-2 transition-colors ${
                      isCurrent
                        ? 'bg-sky-500/10'
                        : 'hover:bg-[var(--bg-canvas)]/70 cursor-pointer'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-[var(--tx-primary)] truncate">
                          {member.full_name}
                        </span>
                        {member.buyer_persona && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-sky-400">
                            {member.buyer_persona}
                          </span>
                        )}
                        {isCurrent && (
                          <span className="text-[10px] font-medium text-emerald-400">
                            (Viewing)
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[var(--tx-muted)] truncate">
                        {member.title || 'Executive'} · {member.email}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-[10.5px] font-mono text-[var(--tx-secondary)]">
                        {member.stage}
                      </div>
                      {(member.amount_usd || 0) > 0 && (
                        <div className="text-[10.5px] font-mono text-emerald-400">
                          ${Math.round((member.amount_usd || 0) / 1000)}K ARR
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* SECTION 3: ACTIVE CONTACT & DEAL OPPORTUNITY */}
          <div className="rounded-xl bg-[var(--bg-canvas)]/55 border border-[var(--border-subtle)] p-4 space-y-3">
            <div className="font-semibold text-[var(--tx-primary)] uppercase tracking-wider text-[11px] border-b border-[var(--border-subtle)] pb-2">
              Contact Details &amp; Opportunity ({contact.full_name})
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-[11px] text-[var(--tx-muted)]">Full Name</span>
                <input
                  type="text"
                  disabled={!canEdit}
                  value={contact.full_name || ''}
                  onChange={(e) => {
                    const parts = e.target.value.trim().split(/\s+/);
                    commitPatch({
                      full_name: e.target.value,
                      first_name: parts[0] || '',
                      last_name: parts.slice(1).join(' '),
                    });
                  }}
                  className="w-full px-2.5 py-1.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--tx-primary)]"
                />
              </label>

              <label className="space-y-1">
                <span className="text-[11px] text-[var(--tx-muted)]">Work Email</span>
                <input
                  type="email"
                  disabled={!canEdit}
                  value={contact.email || ''}
                  onChange={(e) => commitPatch({ email: e.target.value.trim() })}
                  className="w-full px-2.5 py-1.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--tx-primary)] font-mono"
                />
              </label>

              <label className="space-y-1">
                <span className="text-[11px] text-[var(--tx-muted)]">Job Title</span>
                <input
                  type="text"
                  disabled={!canEdit}
                  value={contact.title || ''}
                  onChange={(e) => commitPatch({ title: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--tx-primary)]"
                />
              </label>

              <label className="space-y-1">
                <span className="text-[11px] text-[var(--tx-muted)]">ICP Tag / Buyer Persona</span>
                <select
                  disabled={!canEdit}
                  value={contact.buyer_persona || 'CCO/GC'}
                  onChange={(e) => commitPatch({ buyer_persona: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--tx-primary)]"
                >
                  {PERSONAS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-[11px] text-[var(--tx-muted)]">Stage / Status</span>
                <select
                  disabled={!canEdit}
                  value={contact.stage}
                  onChange={(e) => {
                    const nextStage = e.target.value;
                    commitPatch({
                      stage: nextStage,
                      omit_from_pipeline:
                        nextStage === '1 Lead' ||
                        nextStage === '8 Closed Lost' ||
                        nextStage === '9 No response' ||
                        nextStage === 'Passed',
                    });
                  }}
                  className="w-full px-2.5 py-1.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--tx-primary)]"
                >
                  {stageOptions.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-[11px] text-[var(--tx-muted)]">Primary Product / Wedge</span>
                <select
                  disabled={!canEdit}
                  value={contact.product_or_instrument || 'Fortifai'}
                  onChange={(e) =>
                    commitPatch({ product_or_instrument: e.target.value })
                  }
                  className="w-full px-2.5 py-1.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--tx-primary)]"
                >
                  {PRODUCTS.map((prod) => (
                    <option key={prod} value={prod}>
                      {prod}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-[11px] text-[var(--tx-muted)]">Target ARR ($ USD)</span>
                <input
                  type="number"
                  step={10000}
                  disabled={!canEdit}
                  value={contact.amount_usd ?? 0}
                  onChange={(e) =>
                    commitPatch({ amount_usd: Math.max(0, Number(e.target.value) || 0) })
                  }
                  className="w-full px-2.5 py-1.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--tx-primary)] font-mono"
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-[11px] text-[var(--tx-muted)]">Prob (%)</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={5}
                    disabled={!canEdit}
                    value={contact.probability ?? 0}
                    onChange={(e) =>
                      commitPatch({
                        probability: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--tx-primary)] font-mono"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-[11px] text-[var(--tx-muted)]">Close Qtr</span>
                  <select
                    disabled={!canEdit}
                    value={contact.expected_close || ''}
                    onChange={(e) => commitPatch({ expected_close: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--tx-primary)]"
                  >
                    <option value="">—</option>
                    {CLOSE_QUARTERS.filter(Boolean).map((q) => (
                      <option key={q} value={q}>
                        {q}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="space-y-1 sm:col-span-2">
                <span className="text-[11px] text-[var(--tx-muted)]">Assigned Deal / Contact Owner</span>
                <select
                  disabled={!canEdit}
                  value={contact.owner_id || ''}
                  onChange={(e) => {
                    const chosen = activeUsers.find((u) => u.id === e.target.value);
                    if (chosen) {
                      commitPatch({
                        owner_id: chosen.id,
                        owner_email: chosen.email,
                        owner: chosen.full_name.split(' ')[0] || chosen.full_name,
                      });
                    }
                  }}
                  className="w-full px-2.5 py-1.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--tx-primary)]"
                >
                  {activeUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name} ({u.email}) — {u.role}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 sm:col-span-2">
                <span className="text-[11px] text-[var(--tx-muted)]">Next Action / Follow-Up</span>
                <input
                  type="text"
                  disabled={!canEdit}
                  value={contact.next_step || ''}
                  onChange={(e) => commitPatch({ next_step: e.target.value })}
                  placeholder="Next milestone or executive follow-up..."
                  className="w-full px-2.5 py-1.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--tx-primary)]"
                />
              </label>
            </div>
          </div>

          {/* SECTION 4: QUICK NOTES */}
          <div className="rounded-xl bg-[var(--bg-canvas)]/55 border border-[var(--border-subtle)] p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[var(--tx-primary)] uppercase tracking-wider text-[11px]">
                Quick Notes &amp; Internal Account Summary
              </span>
              <span className="text-[10.5px] text-[var(--tx-muted)]">Internal team reference</span>
            </div>

            {canEdit && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveQuickNote();
                    }
                  }}
                  placeholder={`Add a short internal note on ${contact.first_name || contact.organization}...`}
                  className="flex-1 px-2.5 py-1.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--tx-primary)]"
                />
                <button
                  type="button"
                  onClick={handleSaveQuickNote}
                  className="px-3 py-1.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--tx-primary)] hover:border-sky-400/50 font-medium shrink-0"
                >
                  Save Note
                </button>
              </div>
            )}

            {contact.notes && (
              <pre className="p-2.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[11px] text-[var(--tx-secondary)] whitespace-pre-wrap font-sans">
                {contact.notes}
              </pre>
            )}
          </div>

          {/* SECTION 5: DYNAMIC CUSTOM FIELDS */}
          {customFields.length > 0 && (
            <div className="rounded-xl bg-[var(--bg-canvas)]/55 border border-[var(--border-subtle)] p-4 space-y-2.5">
              <div className="font-semibold text-[var(--tx-primary)] uppercase tracking-wider text-[11px]">
                Additional Custom Fields
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {customFields.map((cf) => {
                  const val = contact.custom_fields?.[cf.field_key] ?? '';
                  return (
                    <label key={cf.id} className="space-y-1">
                      <span className="text-[11px] text-[var(--tx-muted)]">{cf.field_label}</span>
                      {cf.field_type === 'select' && cf.select_options ? (
                        <select
                          disabled={!canEdit}
                          value={String(val)}
                          onChange={(e) => {
                            onUpdateCustomFieldValue(contact.id, cf.field_key, e.target.value);
                            flashSaved('Field saved');
                          }}
                          className="w-full px-2.5 py-1.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--tx-primary)]"
                        >
                          <option value="">—</option>
                          {cf.select_options.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={cf.field_type === 'number' ? 'number' : 'text'}
                          disabled={!canEdit}
                          value={String(val)}
                          onChange={(e) => {
                            onUpdateCustomFieldValue(
                              contact.id,
                              cf.field_key,
                              cf.field_type === 'number' ? Number(e.target.value) : e.target.value
                            );
                            flashSaved('Field saved');
                          }}
                          className="w-full px-2.5 py-1.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--tx-primary)]"
                        />
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Sticky Footer Action Bar */}
        <div className="px-5 py-3.5 bg-[var(--bg-canvas)] border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-md text-xs font-medium text-[var(--tx-secondary)] hover:text-[var(--tx-primary)]"
            >
              Close
            </button>
            {canEdit && onDeleteContact && (
              <button
                type="button"
                onClick={() => {
                  onDeleteContact(contact.id);
                  onClose();
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-rose-400 hover:bg-rose-500/10 transition-colors"
              >
                <Trash2 size={12} />
                Delete
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {isCustomer && onOpenAccountIntelligence && (
              <button
                type="button"
                onClick={() => onOpenAccountIntelligence(contact)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/25 transition-colors"
              >
                <Sparkles size={13} />
                Account Intelligence
              </button>
            )}
            {canSendCampaigns && (
              <>
                <a
                  href={mailtoHref}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--tx-primary)] hover:border-sky-400/50 transition-colors"
                >
                  <ExternalLink size={13} />
                  Superhuman
                </a>
                <button
                  type="button"
                  onClick={() => onComposeEmail(contact)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-medium bg-[#2E5A8A] text-white hover:bg-[#244870] transition-colors"
                >
                  <Send size={13} />
                  Compose Email
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
