import React, { useState } from 'react';
import { X } from 'lucide-react';
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

  const relevantCustomFields = customFields.filter(
    (f) => f.entity_scope === contactType || f.entity_scope === 'both'
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim() || !organization.trim()) return;

    const parts = fullName.trim().split(/\s+/);
    const firstName = parts[0] || '';
    const lastName = parts.slice(1).join(' ');

    const assignedOwner =
      activeUsers.find((u) => u.id === ownerId) || activeUsers[0];
    if (!assignedOwner) return;

    onSave({
      email: email.trim(),
      first_name: firstName,
      last_name: lastName,
      full_name: fullName.trim(),
      organization: organization.trim(),
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
            check_size_label: formatCurrency(Number(checkOrArr)),
            min_check_usd: Number(checkOrArr),
            match_score: 90,
            custom_hook: customHook.trim(),
            stage: 'Not sent',
            probability: 20,
            product_or_instrument: '$15M Cap Post-Money SAFE',
          }
        : {
            tier: priorityOrTier === 'Tier II' ? 'Tier II' : 'Tier I',
            buyer_persona: 'CCO/GC',
            industry: industry.trim() || 'Enterprise',
            icp_score: Math.min(100, Math.max(0, Number(icpScore) || 90)),
            stage: '2 Qualified',
            probability: 20,
            expected_close: expectedClose,
            aging_days: 1,
            product_or_instrument: 'Fortifai AI Core',
          }),
      amount_usd: Number(checkOrArr) || 0,
      owner_id: assignedOwner.id,
      owner_email: assignedOwner.email,
      owner: assignedOwner.full_name,
      unsubscribed: false,
      custom_fields: customValues,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 overflow-y-auto">
      <div className="bg-white border border-[#E2E8F0] rounded-lg max-w-lg w-full p-6 space-y-4 shadow-xl my-8">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <h3 className="text-sm font-semibold text-slate-900">Add New Record</h3>
            <div className="flex rounded-md bg-slate-100 p-0.5 text-[11px]">
              {canEditInvestors && (
                <button
                  type="button"
                  onClick={() => {
                    setContactType('investor');
                    setPriorityOrTier('P1');
                    setCheckOrArr('1000000');
                  }}
                  className={`px-2.5 py-1 rounded font-medium whitespace-nowrap ${
                    contactType === 'investor'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500'
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
                  }}
                  className={`px-2.5 py-1 rounded font-medium whitespace-nowrap ${
                    contactType === 'customer'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500'
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
            className="p-1 text-slate-400 hover:text-slate-700 rounded"
            aria-label="Close modal"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-600 font-medium mb-1">Full Name *</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={
                  contactType === 'investor' ? 'e.g., Prashanth Prakash' : 'e.g., Jane Doe'
                }
                className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-medium mb-1">Email *</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@firm.com"
                className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-600 font-medium mb-1">
                {contactType === 'investor' ? 'VC Fund / Syndicate *' : 'Enterprise Account *'}
              </label>
              <input
                type="text"
                required
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                placeholder={contactType === 'investor' ? 'e.g., Accel India' : 'e.g., Siemens'}
                className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-medium mb-1">Title / Role</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  contactType === 'investor' ? 'General Partner' : 'Chief Audit Executive'
                }
                className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md"
              />
            </div>
          </div>

          {contactType === 'customer' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-600 font-medium mb-1">Sector / Industry</label>
                <input
                  type="text"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  placeholder="e.g., Financial Services"
                  className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-medium mb-1">ICP Score (0–100)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={icpScore}
                  onChange={(e) => setIcpScore(e.target.value)}
                  className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md tabular-nums"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-600 font-medium mb-1">Region *</label>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value as Region)}
                className="w-full px-2.5 py-2 border border-[#E2E8F0] rounded-md bg-white"
              >
                {REGIONS.filter((r) => r !== 'All').map((reg) => (
                  <option key={reg} value={reg}>
                    {reg}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-slate-600 font-medium mb-1">City / Location</label>
              <input
                type="text"
                value={location}
                onChange={(e) => {
                  const val = e.target.value;
                  setLocation(val);
                  if (val.length > 2) setRegion(inferRegionFromLocation(val));
                }}
                placeholder="e.g., Bengaluru, Dubai, New York"
                className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-600 font-medium mb-1">
                {contactType === 'investor' ? 'Priority Tier' : 'Tier & Expected Close'}
              </label>
              {contactType === 'investor' ? (
                <select
                  value={priorityOrTier}
                  onChange={(e) => setPriorityOrTier(e.target.value)}
                  className="w-full px-2.5 py-2 border border-[#E2E8F0] rounded-md bg-white"
                >
                  <option value="P1">P1</option>
                  <option value="P2">P2</option>
                  <option value="P3">P3</option>
                  <option value="P4">P4</option>
                </select>
              ) : (
                <div className="flex gap-1.5">
                  <select
                    value={priorityOrTier}
                    onChange={(e) => setPriorityOrTier(e.target.value)}
                    className="w-24 px-2 py-2 border border-[#E2E8F0] rounded-md bg-white"
                  >
                    <option value="Tier I">Tier I</option>
                    <option value="Tier II">Tier II</option>
                  </select>
                  <select
                    value={expectedClose}
                    onChange={(e) => setExpectedClose(e.target.value as Quarter)}
                    className="flex-1 px-2 py-2 border border-[#E2E8F0] rounded-md bg-white"
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
              <label className="block text-slate-600 font-medium mb-1">
                {contactType === 'investor' ? 'Target Check Size ($)' : 'Target ARR ($)'}
              </label>
              <input
                type="number"
                value={checkOrArr}
                onChange={(e) => setCheckOrArr(e.target.value)}
                className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md tabular-nums"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-600 font-medium mb-1">
              Assigned Deal / Contact Owner (Active crm_users) *
            </label>
            <select
              required
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              className="w-full px-2.5 py-2 border border-[#E2E8F0] rounded-md bg-white text-slate-900"
            >
              {activeUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name} ({u.email}) — {u.role}
                </option>
              ))}
            </select>
          </div>

          {contactType === 'investor' && (
            <div>
              <label className="block text-slate-600 font-medium mb-1">
                Custom 1-Sentence Opening Hook
              </label>
              <textarea
                rows={2}
                value={customHook}
                onChange={(e) => setCustomHook(e.target.value)}
                placeholder="Personalized thesis hook injected via {{custom_hook}}..."
                className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md"
              />
            </div>
          )}

          {relevantCustomFields.length > 0 && (
            <div className="border-t border-slate-100 pt-3 grid grid-cols-2 gap-3">
              {relevantCustomFields.map((cf) => (
                <div key={cf.id}>
                  <label className="block text-slate-500 mb-1">{cf.field_label}</label>
                  {cf.field_type === 'boolean' ? (
                    <input
                      type="checkbox"
                      checked={Boolean(customValues[cf.field_key])}
                      onChange={(e) =>
                        setCustomValues((prev) => ({
                          ...prev,
                          [cf.field_key]: e.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded border-slate-300"
                    />
                  ) : cf.field_type === 'select' ? (
                    <select
                      value={String(customValues[cf.field_key] || '')}
                      onChange={(e) =>
                        setCustomValues((prev) => ({
                          ...prev,
                          [cf.field_key]: e.target.value,
                        }))
                      }
                      className="w-full px-2.5 py-1.5 border border-[#E2E8F0] rounded-md bg-white"
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
                      className="w-full px-2.5 py-1.5 border border-[#E2E8F0] rounded-md"
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-slate-600 hover:text-slate-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-[#0D1520] text-white font-medium rounded-md hover:bg-slate-800 whitespace-nowrap"
            >
              Save {contactType === 'investor' ? 'Investor' : 'Deal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
