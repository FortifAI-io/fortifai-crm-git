import { useEffect, useState } from 'react';

export type TableDensity = 'compact' | 'standard' | 'comfortable';

export const TABLE_DENSITY_OPTIONS: { value: TableDensity; label: string }[] = [
  { value: 'compact', label: 'Compact' },
  { value: 'standard', label: 'Standard' },
  { value: 'comfortable', label: 'Comfortable' },
];

export const TABLE_DENSITY_CLASSES: Record<
  TableDensity,
  {
    headerCell: string;
    bodyCell: string;
    compactCell: string;
    rowText: string;
    subtextSpacing: string;
  }
> = {
  compact: {
    headerCell: 'py-2 px-2.5',
    bodyCell: 'py-1.5 px-2.5',
    compactCell: 'py-1.5 px-2',
    rowText: 'text-xs leading-tight',
    subtextSpacing: 'mt-0',
  },
  standard: {
    headerCell: 'py-3 px-4',
    bodyCell: 'py-3 px-4',
    compactCell: 'py-3 px-3',
    rowText: 'text-xs leading-normal',
    subtextSpacing: 'mt-0.5',
  },
  comfortable: {
    headerCell: 'py-3.5 px-5',
    bodyCell: 'py-4 px-5',
    compactCell: 'py-4 px-4',
    rowText: 'text-xs leading-relaxed',
    subtextSpacing: 'mt-1',
  },
};

export function useTableDensity(
  storageKey = 'fortifai_table_density_v1'
): [TableDensity, (next: TableDensity) => void] {
  const [density, setDensity] = useState<TableDensity>(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved === 'compact' || saved === 'standard' || saved === 'comfortable') {
        return saved;
      }
    } catch {
      // Ignore storage read errors in restricted frames
    }
    return 'standard';
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, density);
    } catch {
      // Ignore storage write errors
    }
  }, [storageKey, density]);

  return [density, setDensity];
}

interface TableDensityToggleProps {
  value: TableDensity;
  onChange: (next: TableDensity) => void;
}

export function TableDensityToggle({ value, onChange }: TableDensityToggleProps) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <span className="text-[11px] font-medium text-slate-400">Density:</span>
      <div
        role="group"
        aria-label="Table view density"
        className="inline-flex items-center bg-slate-100 border border-[#E2E8F0] rounded-md p-0.5"
      >
        {TABLE_DENSITY_OPTIONS.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(opt.value)}
              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
                active
                  ? 'bg-[#0D1520] text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
