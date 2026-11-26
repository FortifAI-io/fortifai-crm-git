import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { CustomFieldDefinition, CustomFieldType, EntityScope } from '../../types/crm';

interface AddCustomColumnModalProps {
  defaultScope: EntityScope;
  canViewCustomers: boolean;
  canViewInvestors: boolean;
  onClose: () => void;
  onSave: (def: Omit<CustomFieldDefinition, 'id'>) => void;
}

export function AddCustomColumnModal({
  defaultScope,
  canViewCustomers,
  canViewInvestors,
  onClose,
  onSave,
}: AddCustomColumnModalProps) {
  const allowedScopes: { value: EntityScope; label: string }[] = [
    ...(canViewCustomers ? [{ value: 'customer' as EntityScope, label: 'Customers Only' }] : []),
    ...(canViewInvestors ? [{ value: 'investor' as EntityScope, label: 'Investors Only' }] : []),
    ...(canViewCustomers && canViewInvestors
      ? [{ value: 'both' as EntityScope, label: 'Both Tables' }]
      : []),
  ];
  const initialScope: EntityScope = allowedScopes.some((s) => s.value === defaultScope)
    ? defaultScope
    : allowedScopes[0]?.value || 'customer';

  const [label, setLabel] = useState('');
  const [scope, setScope] = useState<EntityScope>(initialScope);
  const [fieldType, setFieldType] = useState<CustomFieldType>('text');
  const [optionsText, setOptionsText] = useState('');

  const generatedKey = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || !generatedKey) return;
    onSave({
      entity_scope: scope,
      field_key: generatedKey,
      field_label: label.trim(),
      field_type: fieldType,
      select_options:
        fieldType === 'select'
          ? optionsText
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="bg-white border border-[#E2E8F0] rounded-lg max-w-md w-full p-6 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-sm font-semibold text-slate-900">Add Custom CRM Column</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded"
            aria-label="Close modal"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-600 font-medium mb-1">Column Label</label>
            <input
              type="text"
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., Warm Intro By, Board Seat Req, ERP System"
              className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md focus:outline-none focus:border-slate-400"
            />
            {generatedKey && (
              <div className="text-[11px] text-slate-500 mt-1">
                Email template variable:{' '}
                <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700 font-mono">
                  &#123;&#123;custom.{generatedKey}&#125;&#125;
                </code>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-600 font-medium mb-1">Apply To Table</label>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as EntityScope)}
                className="w-full px-2.5 py-2 border border-[#E2E8F0] rounded-md bg-white"
              >
                {allowedScopes.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-600 font-medium mb-1">Data Type</label>
              <select
                value={fieldType}
                onChange={(e) => setFieldType(e.target.value as CustomFieldType)}
                className="w-full px-2.5 py-2 border border-[#E2E8F0] rounded-md bg-white"
              >
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="select">Dropdown Select</option>
                <option value="boolean">Checkbox (Yes/No)</option>
                <option value="date">Date</option>
              </select>
            </div>
          </div>

          {fieldType === 'select' && (
            <div>
              <label className="block text-slate-600 font-medium mb-1">
                Dropdown Options (comma-separated)
              </label>
              <input
                type="text"
                required
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                placeholder="e.g., Lead, Co-Invest, Strategic, Follow-on"
                className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md"
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
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
              Create Column
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
