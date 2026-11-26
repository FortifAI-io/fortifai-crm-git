import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  Filter,
  Search,
  X,
} from 'lucide-react';

export type SortDirection = 'asc' | 'desc';

export interface ColumnSortState {
  key: string;
  direction: SortDirection;
}

export interface CategoricalOption {
  value: string;
  label?: string;
  count: number;
}

export interface SubFacetConfig {
  id: string;
  label: string;
  options: { value: string; label?: string; count: number }[];
  selectedValues: string[] | null;
  onChange: (next: string[] | null) => void;
}

export interface NumericPreset {
  label: string;
  min?: number;
  max?: number;
}

export interface NumericFilterRange {
  min?: number;
  max?: number;
}

interface ColumnFilterHeaderProps {
  columnKey: string;
  label: string;
  thClassName?: string;
  align?: 'left' | 'right';
  mode: 'categorical' | 'numeric';

  // Sorting
  sortState: ColumnSortState | null;
  onChangeSort: (next: ColumnSortState | null) => void;

  // Categorical filtering (null = all selected / inactive)
  options?: CategoricalOption[];
  selectedValues?: string[] | null;
  onChangeSelectedValues?: (next: string[] | null) => void;
  subFacets?: SubFacetConfig[];

  // Numeric filtering
  numericRange?: NumericFilterRange | null;
  onChangeNumericRange?: (next: NumericFilterRange | null) => void;
  numericPresets?: NumericPreset[];
  numericPlaceholder?: { min?: string; max?: string };
}

export function ColumnFilterHeader({
  columnKey,
  label,
  thClassName = '',
  align = 'left',
  mode,
  sortState,
  onChangeSort,
  options = [],
  selectedValues = null,
  onChangeSelectedValues,
  subFacets = [],
  numericRange = null,
  onChangeNumericRange,
  numericPresets = [],
  numericPlaceholder,
}: ColumnFilterHeaderProps) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const thRef = useRef<HTMLTableCellElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const isSorted = sortState?.key === columnKey;
  const sortDir = isSorted ? sortState.direction : null;

  const hasSubFacetFilter = subFacets.some((sf) => sf.selectedValues !== null);
  const hasCategoricalFilter = selectedValues !== null;
  const hasNumericFilter =
    numericRange !== null &&
    (numericRange.min !== undefined || numericRange.max !== undefined);
  const isFiltered = hasCategoricalFilter || hasSubFacetFilter || hasNumericFilter;

  const updatePosition = () => {
    const anchor = thRef.current || triggerRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const popoverWidth = 276;
    const estimatedHeight = 360;
    const margin = 10;

    let left = align === 'right' ? rect.right - popoverWidth : rect.left;
    if (left + popoverWidth > window.innerWidth - margin) {
      left = window.innerWidth - popoverWidth - margin;
    }
    if (left < margin) left = margin;

    let top = rect.bottom + 4;
    if (top + estimatedHeight > window.innerHeight - margin && rect.top > estimatedHeight) {
      top = Math.max(margin, rect.top - estimatedHeight - 4);
    }
    setCoords({ top, left });
  };

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const handleScrollOrResize = () => updatePosition();
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);
    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const filteredOptions = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (opt) =>
        opt.value.toLowerCase().includes(q) ||
        (opt.label || '').toLowerCase().includes(q)
    );
  }, [options, searchTerm]);

  const allValues = useMemo(() => options.map((o) => o.value), [options]);

  const isChecked = (val: string) => {
    if (selectedValues === null) return true;
    return selectedValues.includes(val);
  };

  const toggleValue = (val: string) => {
    if (!onChangeSelectedValues) return;
    const baseSet = new Set(selectedValues === null ? allValues : selectedValues);
    if (baseSet.has(val)) {
      baseSet.delete(val);
    } else {
      baseSet.add(val);
    }
    if (baseSet.size >= allValues.length) {
      onChangeSelectedValues(null);
    } else {
      onChangeSelectedValues(Array.from(baseSet));
    }
  };

  const selectOnlyValue = (val: string) => {
    if (!onChangeSelectedValues) return;
    onChangeSelectedValues([val]);
  };

  const selectAllVisible = () => {
    if (!onChangeSelectedValues) return;
    if (!searchTerm.trim()) {
      onChangeSelectedValues(null);
      return;
    }
    const visibleVals = filteredOptions.map((o) => o.value);
    if (visibleVals.length >= allValues.length) {
      onChangeSelectedValues(null);
    } else {
      onChangeSelectedValues(visibleVals);
    }
  };

  const clearAllValues = () => {
    if (!onChangeSelectedValues) return;
    onChangeSelectedValues([]);
  };

  const clearColumnFilters = () => {
    onChangeSelectedValues?.(null);
    subFacets.forEach((sf) => sf.onChange(null));
    onChangeNumericRange?.(null);
    setSearchTerm('');
  };

  const toggleSubFacetValue = (sf: SubFacetConfig, val: string) => {
    const allSfVals = sf.options.map((o) => o.value);
    const current = new Set(sf.selectedValues === null ? [] : sf.selectedValues);
    if (current.has(val)) {
      current.delete(val);
    } else {
      current.add(val);
    }
    if (current.size === 0 || current.size >= allSfVals.length) {
      sf.onChange(null);
    } else {
      sf.onChange(Array.from(current));
    }
  };

  const handleSortClick = (dir: SortDirection) => {
    if (isSorted && sortDir === dir) {
      onChangeSort(null);
    } else {
      onChangeSort({ key: columnKey, direction: dir });
    }
  };

  const popover =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={popoverRef}
            style={{ top: coords.top, left: coords.left }}
            onClick={(e) => e.stopPropagation()}
            className="fixed z-[90] w-[276px] bg-white border border-slate-200 rounded-lg shadow-xl text-xs text-slate-700 overflow-hidden"
          >
            {/* Popover Header */}
            <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
              <span className="font-semibold text-slate-900 truncate">{label}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                {(isFiltered || isSorted) && (
                  <button
                    type="button"
                    onClick={() => {
                      clearColumnFilters();
                      if (isSorted) onChangeSort(null);
                    }}
                    className="text-[11px] font-medium text-indigo-600 hover:underline"
                  >
                    Reset
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={`Close ${label} filter`}
                  className="p-0.5 text-slate-400 hover:text-slate-700 rounded"
                >
                  <X size={13} />
                </button>
              </div>
            </div>

            {/* Sort Controls */}
            <div className="p-2 border-b border-slate-100 grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => handleSortClick('asc')}
                className={`inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded border text-[11px] font-medium transition-colors ${
                  isSorted && sortDir === 'asc'
                    ? 'bg-[#0D1520] text-white border-[#0D1520]'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <ArrowUp size={11} />
                {mode === 'numeric' ? 'Low → High' : 'Sort A → Z'}
              </button>
              <button
                type="button"
                onClick={() => handleSortClick('desc')}
                className={`inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded border text-[11px] font-medium transition-colors ${
                  isSorted && sortDir === 'desc'
                    ? 'bg-[#0D1520] text-white border-[#0D1520]'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <ArrowDown size={11} />
                {mode === 'numeric' ? 'High → Low' : 'Sort Z → A'}
              </button>
            </div>

            {/* Sub-facets (for combined columns like Account & Tier, Location, Priority / Track) */}
            {subFacets.length > 0 && (
              <div className="p-2.5 border-b border-slate-100 space-y-2.5 bg-slate-50/40">
                {subFacets.map((sf) => (
                  <div key={sf.id} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        {sf.label}
                      </span>
                      {sf.selectedValues !== null && (
                        <button
                          type="button"
                          onClick={() => sf.onChange(null)}
                          className="text-[10px] text-indigo-600 hover:underline"
                        >
                          All
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {sf.options.map((opt) => {
                        const active = sf.selectedValues?.includes(opt.value) ?? false;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => toggleSubFacetValue(sf, opt.value)}
                            className={`px-2 py-0.5 rounded border text-[11px] font-medium transition-colors ${
                              active
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {opt.label || opt.value}{' '}
                            <span className={active ? 'text-indigo-100' : 'text-slate-400'}>
                              ({opt.count})
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Mode-specific Filter Body */}
            {mode === 'categorical' ? (
              <div className="p-2.5 space-y-2">
                <div className="relative">
                  <Search
                    size={12}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="text"
                    autoFocus
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Filter values..."
                    className="w-full pl-7 pr-7 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded focus:outline-none focus:bg-white focus:border-slate-400"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      aria-label="Clear search"
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between text-[11px] px-0.5">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={selectAllVisible}
                      className="text-indigo-600 hover:underline font-medium"
                    >
                      {searchTerm.trim() ? 'Select matching' : 'Select all'}
                    </button>
                    <span className="text-slate-300">·</span>
                    <button
                      type="button"
                      onClick={clearAllValues}
                      className="text-slate-500 hover:text-slate-800 hover:underline font-medium"
                    >
                      Clear
                    </button>
                  </div>
                  <span className="text-slate-400 tabular-nums">
                    {selectedValues === null ? options.length : selectedValues.length}/
                    {options.length}
                  </span>
                </div>

                <div className="max-h-52 overflow-y-auto divide-y divide-slate-50 border border-slate-100 rounded bg-white">
                  {filteredOptions.length === 0 ? (
                    <div className="px-3 py-4 text-center text-[11px] text-slate-400">
                      No matching values
                    </div>
                  ) : (
                    filteredOptions.map((opt) => {
                      const checked = isChecked(opt.value);
                      return (
                        <div
                          key={opt.value}
                          className="group flex items-center justify-between gap-2 px-2 py-1.5 hover:bg-slate-50 text-xs"
                        >
                          <label className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer">
                            <span
                              className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                checked
                                  ? 'bg-[#0D1520] border-[#0D1520] text-white'
                                  : 'bg-white border-slate-300'
                              }`}
                            >
                              {checked && <Check size={10} strokeWidth={3} />}
                            </span>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleValue(opt.value)}
                              className="sr-only"
                            />
                            <span className="truncate text-slate-800" title={opt.label || opt.value}>
                              {opt.label || opt.value}
                            </span>
                          </label>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => selectOnlyValue(opt.value)}
                              className="opacity-0 group-hover:opacity-100 text-[10px] font-medium text-indigo-600 hover:underline transition-opacity"
                            >
                              Only
                            </button>
                            <span className="text-[10px] text-slate-400 tabular-nums">
                              {opt.count}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              <div className="p-2.5 space-y-2.5">
                {numericPresets.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Quick Filters
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => onChangeNumericRange?.(null)}
                        className={`px-2 py-1 rounded border text-[11px] font-medium ${
                          !hasNumericFilter
                            ? 'bg-[#0D1520] text-white border-[#0D1520]'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        All
                      </button>
                      {numericPresets.map((preset) => {
                        const active =
                          hasNumericFilter &&
                          numericRange?.min === preset.min &&
                          numericRange?.max === preset.max;
                        return (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() =>
                              onChangeNumericRange?.({
                                min: preset.min,
                                max: preset.max,
                              })
                            }
                            className={`px-2 py-1 rounded border text-[11px] font-medium ${
                              active
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Custom Range
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-0.5">Min</label>
                      <input
                        type="number"
                        value={numericRange?.min ?? ''}
                        placeholder={numericPlaceholder?.min ?? 'Any'}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const nextMin = raw === '' ? undefined : Number(raw);
                          const nextMax = numericRange?.max;
                          if (nextMin === undefined && nextMax === undefined) {
                            onChangeNumericRange?.(null);
                          } else {
                            onChangeNumericRange?.({ min: nextMin, max: nextMax });
                          }
                        }}
                        className="w-full px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded focus:outline-none focus:bg-white focus:border-slate-400 tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-0.5">Max</label>
                      <input
                        type="number"
                        value={numericRange?.max ?? ''}
                        placeholder={numericPlaceholder?.max ?? 'Any'}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const nextMax = raw === '' ? undefined : Number(raw);
                          const nextMin = numericRange?.min;
                          if (nextMin === undefined && nextMax === undefined) {
                            onChangeNumericRange?.(null);
                          } else {
                            onChangeNumericRange?.({ min: nextMin, max: nextMax });
                          }
                        }}
                        className="w-full px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded focus:outline-none focus:bg-white focus:border-slate-400 tabular-nums"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>,
          document.body
        )
      : null;

  return (
    <th ref={thRef} className={`${thClassName} select-none`}>
      <div
        className={`inline-flex items-center gap-1 ${
          align === 'right' ? 'justify-end w-full' : ''
        }`}
      >
        <button
          type="button"
          onClick={() => {
            if (!isSorted) {
              onChangeSort({ key: columnKey, direction: 'asc' });
            } else if (sortDir === 'asc') {
              onChangeSort({ key: columnKey, direction: 'desc' });
            } else {
              onChangeSort(null);
            }
          }}
          className="inline-flex items-center gap-1 text-left hover:text-slate-900 transition-colors"
          title={`Sort by ${label}`}
        >
          <span>{label}</span>
          {isSorted ? (
            sortDir === 'asc' ? (
              <ArrowUp size={11} className="text-indigo-600 shrink-0" />
            ) : (
              <ArrowDown size={11} className="text-indigo-600 shrink-0" />
            )
          ) : (
            <ArrowUpDown size={10} className="text-slate-300 shrink-0" />
          )}
        </button>

        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-label={`Filter ${label}`}
          title={`Filter ${label}`}
          className={`p-1 rounded transition-colors relative shrink-0 ${
            isFiltered
              ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
              : open
              ? 'bg-slate-200 text-slate-800'
              : 'text-slate-400 hover:text-slate-700 hover:bg-slate-200/70'
          }`}
        >
          <Filter size={11} className={isFiltered ? 'fill-indigo-600/20' : ''} />
        </button>
      </div>
      {popover}
    </th>
  );
}
