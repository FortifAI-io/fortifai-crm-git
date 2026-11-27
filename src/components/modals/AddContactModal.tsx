import React, { useEffect, useState } from 'react';
import { AlertCircle, Check, X } from 'lucide-react';
import type {
  Contact,
  ContactType,
  CrmUser,
  CustomFieldDefinition,
  Quarter,
  Region,
} from '../../types/crm';
import { QUARTERS, REGIONS } from '../../data/seedData';
import { formatCurrency, inferRegionFromLocation } from '../../utils/crmHelpers';

interface AddContactModalProps {
  initialType: ContactType;
  canEditCustomers: boolean;
  canEditInvestors: boolean;
  activeUsers: CrmUser[];
  defaultOwnerId: string;
  customFields: CustomFieldDefinition[];
  onClose: () => void;
  onSave: (contact: Omit<Contact, 'id'>) => void;
}

const BUYER_PERSONAS = ['CCO/GC', 'CAE', 'CFO', 'CPO', 'CISO / Risk', 'Other'];

export function AddContactModal({
  initialType,
  canEditCustomers,
  canEditInvestors,
  activeUsers,
  defaultOwnerId,
  customFields,
  onClose,
  onSave,
}: AddContactModalProps) {
  const resolvedInitialType: ContactType =
    initialType === 'investor' && !canEditInvestors && canEditCustomers
      ? 'customer'
      : initialType === 'customer' && !canEditCustomers && canEditInvestors
      ? 'investor'
      : initialType;

  const [contactType, setContactType] = useState<ContactType>(resolvedInitialType);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [organization, setOrganization] = useState('');
  const [title, setTitle] = useState('');
  const [buyerPersona, setBuyerPersona] = useState('CCO/GC');
  const [industry, setIndustry] = useState('Enterprise Software');
  const [icpScore, setIcpScore] = useState('90');
  const [region, setRegion] = useState<Region>('US');
  const [location, setLocation] = useState('');
  const [priorityOrTier, setPriorityOrTier] = useState(
    resolvedInitialType === 'investor' ? 'P1' : 'Tier I'
  );
  const [checkOrArr, setCheckOrArr] = useState(
    resolvedInitialType === 'investor' ? '1000000' : '250000'
  );
  const [expectedClose, setExpectedClose] = useState<Quarter>('Q2 2027');
  const [ownerId, setOwnerId] = useState<string>(
    activeUsers.find((u) => u.id === defaultOwnerId)?.id || activeUsers[0]?.id || ''
  );
  const [customHook, setCustomHook] = useState('');
  const [customValues, setCustomValues] = useState<Record<string, string | number | boolean>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Keep ownerId synced if activeUsers hydrates after mount
  useEffect(() => {
    if (!ownerId && activeUsers.length > 0) {
      const match = activeUsers.find((u) => u.id === defaultOwnerId) || activeUsers[0];
      if (match) setOwnerId(match.id);
    }
  }, [activeUsers, defaultOwnerId, ownerId]);

  const relevantCustomFields = customFields.filter(
    (f) => f.entity_scope === contactType || f.entity_scope === 'both'
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setFormError(null);

    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedOrg = organization.trim();

    if (!trimmedName) {
      setFormError('Please enter the contact Full Name.');
      return;
    }
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setFormError('Please enter a valid work Email address.');
      return;
    }
    if (!trimmedOrg) {
      setFormError(
        contactType === 'investor'
          ? 'Please enter the VC Fund / Syndicate name.'
          : 'Please enter the Enterprise Account name.'
      );
      return;
    }

    setSubmitting(true);

    const parts = trimmedName.split(/\s+/);
    const firstName = parts[0] || '';
    const lastName = parts.slice(1).join(' ');

    const assignedOwner: CrmUser =
      activeUsers.find((u) => u.id === ownerId) ||
      activeUsers[0] || {
        id: defaultOwnerId || 'usr_varun',
        email: 'varun@fortifai.io',
        full_name: 'Varun Mowar',
        sender_display_name: 'Varun Mowar',
        role: 'super_admin',
        is_active: true,
        created_at: new Date().toISOString(),
        permissions: {
          can_view_customers: true,
          can_edit_customers: true,
          can_view_investors: true,
          can_edit_investors: true,
          can_send_campaigns: true,
          can_manage_schema: true,
          can_manage_users: true,
        },
      };

    const parsedAmount = Number(checkOrArr) || 0;

    onSave({
      email: trimmedEmail,
      first_name: firstName,
      last_name: lastName,
      full_name: trimmedName,
      organization: trimmedOrg,
      title: title.trim() || (contactType === 'investor' ? 'Partner' : 'Executive'),
      region,
      location: location.trim() || region,
      contact_type: contactType,
      ...(contactType === 'investor'
        ? {
            priority_tier: priorityOrTier as 'P1' | 'P2' | 'P3' | 'P4',
            execution_wave:
              region === 'US'
                ? 'Wave 1 Lead'
                : 'India / UAE / Singapore Strategic & Family Offices',
            us_inst_seed_track: region === 'US',
            check_size_label: formatCurrency(parsedAmount),
            min_check_usd: parsedAmount,
            match_score: 90,
            custom_hook: customHook.trim(),
            stage: 'Outreach',
            probability: 20,
            product_or_instrument: '$15M Cap Post-Money SAFE',
          }
        : {
            tier: priorityOrTier === 'Tier II' ? 'Tier II' : 'Tier I',
            buyer_persona: buyerPersona,
            industry: industry.trim() || 'Enterprise',
            icp_score: Math.min(100, Math.max(0, Number(icpScore) || 90)),
            stage: parsedAmount > 0 ? '2 Qualified' : '1 Lead',
            omit_from_pipeline: parsedAmount <= 0,
            probability: parsedAmount > 0 ? 20 : 5,
            expected_close: expectedClose,
            aging_days: 1,
            product_or_instrument: 'Fortifai',
          }),
      amount_usd: parsedAmount,
      owner_id: assignedOwner.id,
      owner_email: assignedOwner.email,
      owner: assignedOwner.full_name.split(' ')[0] || assignedOwner.full_name,
      unsubscribed: false,
      delivery_status: 'not_sent',
      custom_fields: {
        us_listed: 'No',
        fit_category: 'Best-fit',
        ...customValues,
      },
    });
  };

  const inputCls =
    'w-full h-9 px-3 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[13px] text-[var(--tx-primary)] placeholder:text-[var(--tx-muted)] focus:outline-none focus:border-[#3B82F6] transition-colors';
  const labelCls = 'block text-[12px] font-medium text-[var(--tx-secondary)] mb-1';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-[2px] p-4 overflow-y-auto"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl max-w-[540px] w-full p-6 space-y-4 shadow-2xl my-8 text-[var(--tx-primary)]">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3.5">
          <div className="flex items-center gap-3">
            <h3 className="text-[15px] font-semibold tracking-tight text-[var(--tx-primary)]">
              Add New Record
            </h3>
            <div className="inline-flex rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] p-0.5 text-[12px]">
              {canEditInvestors && (
                <button
                  type="button"
                  onClick={() => {
                    setContactType('investor');
                    setPriorityOrTier('P1');
                    setCheckOrArr('1000000');
                    setFormError(null);
                  }}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap ${
                    contactType === 'investor'
                      ? 'bg-[#2563EB] text-white shadow-xs'
                      : 'text-[var(--tx-secondary)] hover:text-[var(--tx-primary)]'
                  }`}
                >
                  Investor
                </button>
              )}
              {canEditCustomers && (
                <button
                  type="button"
                  onClick={() => {
                    setContactType('customer');
                    setPriorityOrTier('Tier I');
                    setCheckOrArr('250000');
                    setFormError(null);
                  }}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap ${
                    contactType === 'customer'
                      ? 'bg-[#2563EB] text-white shadow-xs'
                      : 'text-[var(--tx-secondary)] hover:text-[var(--tx-primary)]'
                  }`}
                >
                  Customer Deal
                </button>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[var(--tx-muted)] hover:text-[var(--tx-primary)] hover:bg-[var(--bg-subtle)] rounded-lg transition-colors"
            aria-label="Close modal"
          >
            <X size={16} />
          </button>
        </div>

        {formError && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-[12.5px] flex items-center gap-2">
            <AlertCircle size={15} className="shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Full Name *</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  if (formError) setFormError(null);
                }}
                placeholder={
                  contactType === 'investor' ? 'e.g., Prashanth Prakash' : 'e.g., Jane Doe'
                }
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Work Email *</label>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (formError) setFormError(null);
                }}
                placeholder="name@company.com"
                className={inputCls}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>
                {contactType === 'investor' ? 'VC Fund / Syndicate *' : 'Enterprise Account *'}
              </label>
              <input
                type="text"
                value={organization}
                onChange={(e) => {
                  setOrganization(e.target.value);
                  if (formError) setFormError(null);
                }}
                placeholder={contactType === 'investor' ? 'e.g., Accel' : 'e.g., Siemens'}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Title / Role</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  contactType === 'investor' ? 'General Partner' : 'Chief Audit Executive'
                }
                className={inputCls}
              />
            </div>
          </div>

          {contactType === 'customer' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Sector / Industry</label>
                <input
                  type="text"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  placeholder="Enterprise Software"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Buyer Persona</label>
                <select
                  value={buyerPersona}
                  onChange={(e) => setBuyerPersona(e.target.value)}
                  className={inputCls}
                >
                  {BUYER_PERSONAS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>ICP Score (0–100)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={icpScore}
                  onChange={(e) => setIcpScore(e.target.value)}
                  className={`${inputCls} tabular-nums`}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Region *</label>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value as Region)}
                className={inputCls}
              >
                {REGIONS.filter((r) => r !== 'All').map((reg) => (
                  <option key={reg} value={reg}>
                    {reg}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>City / Location</label>
              <input
                type="text"
                value={location}
                onChange={(e) => {
                  const val = e.target.value;
                  setLocation(val);
                  if (val.length > 2) setRegion(inferRegionFromLocation(val));
                }}
                placeholder="e.g., Bengaluru, Dubai, New York"
                className={inputCls}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>
                {contactType === 'investor' ? 'Priority Tier' : 'Tier & Close Quarter'}
              </label>
              {contactType === 'investor' ? (
                <select
                  value={priorityOrTier}
                  onChange={(e) => setPriorityOrTier(e.target.value)}
                  className={inputCls}
                >
                  <option value="P1">P1</option>
                  <option value="P2">P2</option>
                  <option value="P3">P3</option>
                  <option value="P4">P4</option>
                </select>
              ) : (
                <div className="flex gap-2">
                  <select
                    value={priorityOrTier}
                    onChange={(e) => setPriorityOrTier(e.target.value)}
                    className={`${inputCls} w-28 shrink-0`}
                  >
                    <option value="Tier I">Tier I</option>
                    <option value="Tier II">Tier II</option>
                  </select>
                  <select
                    value={expectedClose}
                    onChange={(e) => setExpectedClose(e.target.value as Quarter)}
                    className={`${inputCls} flex-1`}
                  >
                    {QUARTERS.map((q) => (
                      <option key={q} value={q}>
                        {q}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div>
              <label className={labelCls}>
                {contactType === 'investor' ? 'Target Check Size ($)' : 'Target ARR ($)'}
              </label>
              <input
                type="number"
                value={checkOrArr}
                onChange={(e) => setCheckOrArr(e.target.value)}
                className={`${inputCls} tabular-nums`}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Deal / Account Owner *</label>
            <select
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              className={inputCls}
            >
              {activeUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name} ({u.email})
                </option>
              ))}
            </select>
          </div>

          {contactType === 'investor' && (
            <div>
              <label className={labelCls}>Custom Opening Hook</label>
              <textarea
                rows={2}
                value={customHook}
                onChange={(e) => setCustomHook(e.target.value)}
                placeholder="Personalized thesis hook..."
                className="w-full p-3 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[13px] text-[var(--tx-primary)] focus:outline-none focus:border-[#3B82F6]"
              />
            </div>
          )}

          {relevantCustomFields.length > 0 && (
            <div className="border-t border-[var(--border-subtle)] pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {relevantCustomFields.map((cf) => (
                <div key={cf.id}>
                  <label className={labelCls}>{cf.field_label}</label>
                  {cf.field_type === 'boolean' ? (
                    <label className="inline-flex items-center gap-2 h-9 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(customValues[cf.field_key])}
                        onChange={(e) =>
                          setCustomValues((prev) => ({
                            ...prev,
                            [cf.field_key]: e.target.checked,
                          }))
                        }
                        className="h-4 w-4 rounded border-slate-500 text-[#2563EB]"
                      />
                      <span className="text-[13px] text-[var(--tx-secondary)]">Enabled</span>
                    </label>
                  ) : cf.field_type === 'select' ? (
                    <select
                      value={String(customValues[cf.field_key] || '')}
                      onChange={(e) =>
                        setCustomValues((prev) => ({
                          ...prev,
                          [cf.field_key]: e.target.value,
                        }))
                      }
                      className={inputCls}
                    >
                      <option value="">Select...</option>
                      {(cf.select_options || []).map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={
                        cf.field_type === 'number'
                          ? 'number'
                          : cf.field_type === 'date'
                          ? 'date'
                          : 'text'
                      }
                      value={String(customValues[cf.field_key] || '')}
                      onChange={(e) =>
                        setCustomValues((prev) => ({
                          ...prev,
                          [cf.field_key]:
                            cf.field_type === 'number' ? Number(e.target.value) : e.target.value,
                        }))
                      }
                      className={inputCls}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 h-9 rounded-lg text-[13px] font-medium text-[var(--tx-secondary)] hover:text-[var(--tx-primary)] hover:bg-[var(--bg-subtle)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-5 h-9 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[13px] font-medium shadow-sm disabled:opacity-50 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Check size={14} />
              {submitting
                ? 'Saving...'
                : `Save ${contactType === 'investor' ? 'Investor' : 'Deal'}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
