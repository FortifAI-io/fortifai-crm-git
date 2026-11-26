import type { Contact, CustomFieldDefinition } from '../types/crm';

interface CustomFieldCellProps {
  contact: Contact;
  field: CustomFieldDefinition;
  disabled?: boolean;
  onUpdateValue: (contactId: string, fieldKey: string, value: string | number | boolean) => void;
}

export function CustomFieldCell({
  contact,
  field,
  disabled = false,
  onUpdateValue,
}: CustomFieldCellProps) {
  const val = contact.custom_fields?.[field.field_key];

  if (field.field_type === 'boolean') {
    return (
      <input
        type="checkbox"
        aria-label={field.field_label}
        checked={Boolean(val)}
        disabled={disabled}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onUpdateValue(contact.id, field.field_key, e.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-[#0D1520] focus:ring-[#0D1520] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      />
    );
  }

  if (field.field_type === 'select') {
    return (
      <select
        aria-label={field.field_label}
        value={typeof val === 'string' ? val : ''}
        disabled={disabled}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onUpdateValue(contact.id, field.field_key, e.target.value)}
        className="text-xs bg-transparent border border-transparent hover:border-slate-200 focus:border-slate-400 rounded px-1.5 py-1 text-slate-700 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <option value="">—</option>
        {(field.select_options || []).map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      aria-label={field.field_label}
      type={field.field_type === 'number' ? 'number' : field.field_type === 'date' ? 'date' : 'text'}
      value={val === undefined || val === null ? '' : String(val)}
      placeholder="—"
      disabled={disabled}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) =>
        onUpdateValue(
          contact.id,
          field.field_key,
          field.field_type === 'number' ? Number(e.target.value) : e.target.value
        )
      }
      className="w-28 text-xs bg-transparent border border-transparent hover:border-slate-200 focus:border-slate-400 focus:bg-white rounded px-1.5 py-1 text-slate-700 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
    />
  );
}
