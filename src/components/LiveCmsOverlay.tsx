import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Download,
  PanelRightOpen,
  PencilLine,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import { useLiveCms, type CmsFieldMeta } from '../context/LiveCmsContext';

interface LiveCmsOverlayProps {
  onNotify?: (msg: string) => void;
}

export function LiveCmsHeaderButton() {
  const { isEditing, toggleEditing, canEditCms, overrideCount } = useLiveCms();

  if (!canEditCms) return null;

  return (
    <button
      type="button"
      onClick={toggleEditing}
      title="Toggle Inline Live CMS (⌘E) — click any highlighted heading or label to edit directly"
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-md transition-colors whitespace-nowrap shrink-0 ${
        isEditing
          ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700'
          : 'text-slate-700 bg-white border-[#E2E8F0] hover:bg-slate-50'
      }`}
    >
      <PencilLine size={13} className={isEditing ? 'text-white' : 'text-indigo-600'} />
      <span>{isEditing ? 'Editing Live' : 'Live CMS'}</span>
      {overrideCount > 0 && (
        <span
          className={`text-[10px] font-mono px-1 py-0.2 rounded tabular-nums ${
            isEditing ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'
          }`}
        >
          {overrideCount}
        </span>
      )}
    </button>
  );
}

interface InspectorFieldRowProps {
  field: CmsFieldMeta;
  isCustomized: boolean;
  currentVal: string;
  onCommit: (id: string, val: string, immediateSync?: boolean) => void;
  onReset: (id: string) => void;
}

function InspectorFieldRow({
  field,
  isCustomized,
  currentVal,
  onCommit,
  onReset,
}: InspectorFieldRowProps) {
  const [localVal, setLocalVal] = useState(currentVal);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setLocalVal(currentVal);
    }
  }, [currentVal, isFocused]);

  const isDirty = localVal !== currentVal;
  const isDeleted = currentVal.trim() === '';

  const commitNow = (val: string) => {
    const normalized = val.trim() === '' ? '' : val;
    setLocalVal(normalized);
    onCommit(field.id, normalized, true);
  };

  const handleChange = (next: string) => {
    setLocalVal(next);
    // Live preview without debounce-flooding server until blur/Save
    onCommit(field.id, next.trim() === '' ? '' : next, false);
  };

  const handleBlur = () => {
    setIsFocused(false);
    commitNow(localVal);
  };

  return (
    <div
      className={`p-2.5 rounded-md border text-xs space-y-1.5 ${
        isDeleted
          ? 'bg-rose-50/40 border-rose-200'
          : isCustomized
          ? 'bg-amber-50/40 border-amber-200'
          : 'bg-white border-[#E2E8F0]'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] text-slate-500 truncate">{field.id}</span>
        <div className="flex items-center gap-2 shrink-0">
          {isDirty && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                commitNow(localVal);
              }}
              className="inline-flex items-center gap-1 text-[10px] font-medium text-indigo-700 hover:text-indigo-900"
            >
              <Check size={10} />
              Save
            </button>
          )}
          {!isDeleted && (
            <button
              type="button"
              onClick={() => commitNow('')}
              title="Delete / clear this line from view"
              className="inline-flex items-center gap-1 text-[10px] font-medium text-rose-600 hover:text-rose-800"
            >
              <Trash2 size={10} />
              Delete
            </button>
          )}
          {isCustomized && (
            <button
              type="button"
              onClick={() => {
                onReset(field.id);
                setLocalVal(field.defaultValue);
              }}
              className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 hover:text-amber-900"
            >
              <RotateCcw size={10} />
              Reset
            </button>
          )}
        </div>
      </div>

      {field.multiline ? (
        <textarea
          rows={2}
          value={localVal}
          placeholder="Deleted (empty line) — type to restore"
          onFocus={() => setIsFocused(true)}
          onBlur={handleBlur}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              commitNow(localVal);
            }
          }}
          className="w-full px-2 py-1.5 text-xs text-slate-900 bg-white border border-[#E2E8F0] rounded focus:outline-none focus:border-indigo-500"
        />
      ) : (
        <input
          type="text"
          value={localVal}
          placeholder="Deleted (empty line) — type to restore"
          onFocus={() => setIsFocused(true)}
          onBlur={handleBlur}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitNow(localVal);
            }
          }}
          className="w-full px-2 py-1.5 text-xs text-slate-900 bg-white border border-[#E2E8F0] rounded focus:outline-none focus:border-indigo-500"
        />
      )}

      {isCustomized && (
        <div className="text-[10px] text-slate-400 truncate">
          {isDeleted ? 'Line deleted · ' : ''}Default: {field.defaultValue}
        </div>
      )}
    </div>
  );
}

export function LiveCmsOverlay({ onNotify }: LiveCmsOverlayProps) {
  const {
    isEditing,
    setIsEditing,
    isInspectorOpen,
    setIsInspectorOpen,
    setActiveEditor,
    canEditCms,
    overrides,
    registry,
    setOverride,
    resetKey,
    resetSection,
    resetAll,
    undoLast,
    canUndo,
    importOverrides,
    syncNow,
    syncStatus,
    syncError,
    overrideCount,
  } = useLiveCms();

  const [confirmResetAll, setConfirmResetAll] = useState(false);
  const [search, setSearch] = useState('');
  const [sectionFilter, setSectionFilter] = useState<string>('All');
  const [onlyCustomized, setOnlyCustomized] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const registeredList = useMemo(() => {
    const items = Object.values(registry);
    // Include any overrides whose keys aren't currently mounted so they remain editable/resettable
    for (const key of Object.keys(overrides)) {
      if (!registry[key]) {
        items.push({
          id: key,
          defaultValue: overrides[key],
          section: 'Other Views',
          label: key,
          multiline: overrides[key].length > 72,
        });
      }
    }
    return items.sort((a, b) =>
      a.section === b.section ? a.id.localeCompare(b.id) : a.section.localeCompare(b.section)
    );
  }, [registry, overrides]);

  const sections = useMemo(() => {
    const set = new Set<string>();
    registeredList.forEach((f) => set.add(f.section));
    return ['All', ...Array.from(set).sort()];
  }, [registeredList]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return registeredList.filter((item) => {
      if (sectionFilter !== 'All' && item.section !== sectionFilter) return false;
      const isCustom = Object.prototype.hasOwnProperty.call(overrides, item.id);
      if (onlyCustomized && !isCustom) return false;
      if (!q) return true;
      const currentVal = (
        Object.prototype.hasOwnProperty.call(overrides, item.id)
          ? overrides[item.id]
          : item.defaultValue
      ).toLowerCase();
      return (
        item.id.toLowerCase().includes(q) ||
        item.section.toLowerCase().includes(q) ||
        (item.label || '').toLowerCase().includes(q) ||
        item.defaultValue.toLowerCase().includes(q) ||
        currentVal.includes(q)
      );
    });
  }, [registeredList, sectionFilter, onlyCustomized, search, overrides]);

  const groupedBySection = useMemo(() => {
    const map = new Map<string, CmsFieldMeta[]>();
    for (const item of filteredItems) {
      const list = map.get(item.section) || [];
      list.push(item);
      map.set(item.section, list);
    }
    return Array.from(map.entries());
  }, [filteredItems]);

  if (!canEditCms) return null;

  const handleExportJson = () => {
    const payload = JSON.stringify(overrides, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fortifai-scale-cms-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify?.(`Exported ${overrideCount} Live CMS copy override${overrideCount === 1 ? '' : 's'}.`);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        onNotify?.('Invalid JSON: expected a key-value map of CMS overrides.');
        return;
      }
      importOverrides(parsed as Record<string, string>);
    } catch {
      onNotify?.('Could not parse JSON file for Live CMS import.');
    }
  };

  return (
    <>
      {/* Floating Inline Edit Dock */}
      {isEditing && (
        <div
          role="region"
          aria-label="Live CMS Toolbar"
          onMouseDown={(e) => e.stopPropagation()}
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 bg-[#0D1520] text-white border border-slate-700 rounded-lg shadow-xl px-4 py-2.5 flex items-center gap-3 text-xs max-w-[95vw] flex-wrap sm:flex-nowrap"
        >
          <div className="flex items-center gap-2 pr-2 border-r border-slate-700/80 whitespace-nowrap">
            <PencilLine size={14} className="text-sky-400 shrink-0" />
            <span className="font-semibold tracking-tight">Live CMS</span>
            <span className="text-slate-400 hidden md:inline">
              · Click highlighted text to edit or delete
            </span>
          </div>

          <div className="flex items-center gap-2 text-[11px] tabular-nums text-slate-300 whitespace-nowrap">
            <span>
              <strong className="text-white">{overrideCount}</strong> edited
            </span>
            <span className="text-slate-600">·</span>
            {syncStatus === 'saving' ? (
              <span className="text-sky-300">Saving...</span>
            ) : syncStatus === 'saved' ? (
              <span className="text-emerald-400">Saved</span>
            ) : syncStatus === 'error' ? (
              <button
                type="button"
                onClick={syncNow}
                title={syncError || 'Click to retry server sync'}
                className="inline-flex items-center gap-1 text-rose-300 hover:text-rose-200 underline"
              >
                <RefreshCw size={10} />
                Retry Sync
              </button>
            ) : (
              <button
                type="button"
                onClick={syncNow}
                title="Saved in browser — click to sync with server"
                className="text-slate-400 hover:text-slate-200"
              >
                Saved locally
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 ml-auto">
            <button
              type="button"
              onClick={() => setIsInspectorOpen((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-[11px] font-medium transition-colors whitespace-nowrap ${
                isInspectorOpen
                  ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                  : 'bg-white/5 border-slate-700 text-slate-200 hover:bg-white/10'
              }`}
            >
              <PanelRightOpen size={12} />
              Inspector ({registeredList.length})
            </button>

            <button
              type="button"
              disabled={!canUndo}
              onClick={undoLast}
              title="Undo last copy change"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-700 bg-white/5 text-slate-200 hover:bg-white/10 disabled:opacity-35 disabled:cursor-not-allowed text-[11px] font-medium whitespace-nowrap"
            >
              <Undo2 size={12} />
              Undo
            </button>

            {overrideCount > 0 &&
              (confirmResetAll ? (
                <div className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      resetAll();
                      setConfirmResetAll(false);
                    }}
                    className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-medium whitespace-nowrap"
                  >
                    Confirm Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmResetAll(false)}
                    className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-[11px] whitespace-nowrap"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmResetAll(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-700 bg-white/5 text-amber-300 hover:bg-white/10 text-[11px] font-medium whitespace-nowrap"
                >
                  <RotateCcw size={12} />
                  Reset All
                </button>
              ))}

            <button
              type="button"
              onClick={() => {
                setActiveEditor(null);
                setIsEditing(false);
                setConfirmResetAll(false);
              }}
              className="inline-flex items-center gap-1 px-3 py-1 rounded bg-white text-[#0D1520] hover:bg-slate-100 text-[11px] font-semibold whitespace-nowrap"
            >
              <Check size={12} />
              Done
            </button>
          </div>
        </div>
      )}

      {/* Slide-Over Copy Inspector Drawer */}
      {isInspectorOpen && (
        <aside
          aria-label="Live CMS Copy Inspector"
          onMouseDown={(e) => e.stopPropagation()}
          className="fixed inset-y-0 right-0 z-50 w-full max-w-[460px] bg-white border-l border-[#E2E8F0] shadow-2xl flex flex-col"
        >
          <div className="px-5 py-4 border-b border-[#E2E8F0] bg-[#0D1520] text-white flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <PencilLine size={15} className="text-sky-400 shrink-0" />
                <h2 className="text-sm font-semibold tracking-tight truncate">
                  Live CMS · Copy Inspector
                </h2>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
                {registeredList.length} copy blocks indexed · {overrideCount} customized
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsInspectorOpen(false)}
              aria-label="Close Live CMS Inspector"
              className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/10"
            >
              <X size={16} />
            </button>
          </div>

          {/* Search & Filters */}
          <div className="p-4 border-b border-[#E2E8F0] bg-slate-50/70 space-y-2.5">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search headings, labels, keys..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-[#E2E8F0] rounded-md focus:outline-none focus:border-slate-400"
              />
            </div>
            <div className="flex items-center justify-between gap-2 text-xs">
              <select
                value={sectionFilter}
                onChange={(e) => setSectionFilter(e.target.value)}
                aria-label="Filter CMS section"
                className="bg-white border border-[#E2E8F0] rounded px-2 py-1 text-xs text-slate-700 max-w-[220px]"
              >
                {sections.map((sec) => (
                  <option key={sec} value={sec}>
                    {sec === 'All' ? 'All Sections' : sec}
                  </option>
                ))}
              </select>

              <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={onlyCustomized}
                  onChange={(e) => setOnlyCustomized(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                Customized only ({overrideCount})
              </label>
            </div>
          </div>

          {/* Editable Copy Directory */}
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {groupedBySection.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-md">
                No editable copy blocks match the current filter.
              </div>
            ) : (
              groupedBySection.map(([sectionName, fields]) => {
                const sectionCustomCount = fields.filter((f) =>
                  Object.prototype.hasOwnProperty.call(overrides, f.id)
                ).length;
                return (
                  <div key={sectionName} className="space-y-2.5">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                      <h3 className="text-xs font-semibold text-slate-800 tracking-tight">
                        {sectionName}{' '}
                        <span className="text-slate-400 font-normal tabular-nums">
                          ({fields.length})
                        </span>
                      </h3>
                      {sectionCustomCount > 0 && (
                        <button
                          type="button"
                          onClick={() => resetSection(sectionName)}
                          className="text-[11px] text-amber-700 hover:underline font-medium"
                        >
                          Reset section ({sectionCustomCount})
                        </button>
                      )}
                    </div>

                    <div className="space-y-2.5">
                      {fields.map((field) => {
                        const isCustomized = Object.prototype.hasOwnProperty.call(
                          overrides,
                          field.id
                        );
                        const currentVal = isCustomized
                          ? overrides[field.id]
                          : field.defaultValue;
                        return (
                          <InspectorFieldRow
                            key={field.id}
                            field={field}
                            isCustomized={isCustomized}
                            currentVal={currentVal}
                            onCommit={setOverride}
                            onReset={resetKey}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Import/Export & Reset */}
          <div className="px-4 py-3 border-t border-[#E2E8F0] bg-slate-50 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportJson}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-[#E2E8F0] bg-white text-slate-700 hover:bg-slate-100 font-medium"
              >
                <Download size={12} />
                Export JSON
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-[#E2E8F0] bg-white text-slate-700 hover:bg-slate-100 font-medium"
              >
                <Upload size={12} />
                Import JSON
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                onChange={handleImportFile}
                className="hidden"
              />
            </div>

            {overrideCount > 0 && (
              <button
                type="button"
                onClick={resetAll}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 font-medium"
              >
                <RotateCcw size={12} />
                Reset All
              </button>
            )}
          </div>
        </aside>
      )}
    </>
  );
}
