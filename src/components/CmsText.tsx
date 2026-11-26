import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Pencil, RotateCcw, Trash2, X } from 'lucide-react';
import { useLiveCms } from '../context/LiveCmsContext';

interface CmsTextProps {
  id: string;
  defaultValue: string;
  section?: string;
  label?: string;
  multiline?: boolean;
  className?: string;
  as?: 'span' | 'div' | 'p' | 'h1' | 'h2' | 'h3';
}

interface PopoverCoords {
  top: number;
  left: number;
  width: number;
  placement: 'bottom' | 'top';
}

export function CmsText({
  id,
  defaultValue,
  section = 'General',
  label,
  multiline = false,
  className = '',
  as = 'span',
}: CmsTextProps) {
  const instanceId = useId();
  const {
    isEditing,
    canEditCms,
    activeEditor,
    setActiveEditor,
    overrides,
    registerField,
    getText,
    setOverride,
    resetKey,
  } = useLiveCms();

  const resolved = getText(id, defaultValue);
  const isMultiline = multiline || defaultValue.length > 64 || resolved.includes('\n');
  const isEditorOpen = isEditing && canEditCms && activeEditor?.instanceId === instanceId;
  const [draft, setDraft] = useState('');
  const [coords, setCoords] = useState<PopoverCoords | null>(null);

  const draftRef = useRef('');
  const wasOpenRef = useRef(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    registerField({
      id,
      defaultValue,
      section,
      label: label || defaultValue,
      multiline: isMultiline,
    });
  }, [id, defaultValue, section, label, isMultiline, registerField]);

  const isCustomized = Object.prototype.hasOwnProperty.call(overrides, id);
  const isCleared = resolved.trim() === '';
  const Tag = as;

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el || typeof window === 'undefined') return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const popoverWidth = Math.min(Math.max(320, rect.width + 48), 440, vw - 24);
    const estimatedHeight = isMultiline ? 196 : 156;

    const spaceBelow = vh - rect.bottom;
    const placement: 'bottom' | 'top' =
      spaceBelow >= estimatedHeight + 16 || rect.top < estimatedHeight + 16 ? 'bottom' : 'top';

    const top =
      placement === 'bottom'
        ? Math.min(vh - estimatedHeight - 12, rect.bottom + 8)
        : Math.max(12, rect.top - estimatedHeight - 8);

    const left = Math.max(12, Math.min(rect.left, vw - popoverWidth - 12));
    setCoords({ top, left, width: popoverWidth, placement });
  }, [isMultiline]);

  // Initialize draft ONLY on closed -> open transition so typing is never overwritten
  useLayoutEffect(() => {
    if (!isEditorOpen) {
      wasOpenRef.current = false;
      setCoords(null);
      return;
    }

    if (!wasOpenRef.current) {
      wasOpenRef.current = true;
      draftRef.current = resolved;
      setDraft(resolved);

      requestAnimationFrame(() => {
        if (isMultiline && textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.select();
        } else if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      });
    }

    updatePosition();

    const handleReposition = () => updatePosition();
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);

    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [isEditorOpen, resolved, isMultiline, updatePosition]);

  const commitValue = useCallback(
    (nextText: string) => {
      // Allow empty string "" so deleted lines actually disappear from the UI
      const normalized = nextText.trim() === '' ? '' : nextText;
      setOverride(id, normalized, true);
      setActiveEditor(null);
    },
    [id, setOverride, setActiveEditor]
  );

  const commit = useCallback(() => {
    commitValue(draftRef.current);
  }, [commitValue]);

  const clearLine = useCallback(() => {
    draftRef.current = '';
    setDraft('');
    setOverride(id, '', true);
    setActiveEditor(null);
  }, [id, setOverride, setActiveEditor]);

  const cancel = useCallback(() => {
    setActiveEditor(null);
  }, [setActiveEditor]);

  // Close & commit when clicking outside both popover and trigger
  useEffect(() => {
    if (!isEditorOpen) return;
    const handleOutsideMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (popoverRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      commit();
    };
    document.addEventListener('mousedown', handleOutsideMouseDown, true);
    return () => document.removeEventListener('mousedown', handleOutsideMouseDown, true);
  }, [isEditorOpen, commit]);

  const handleOpenClick = (e: React.MouseEvent) => {
    if (!isEditing || !canEditCms) return;
    e.preventDefault();
    e.stopPropagation();
    if (isEditorOpen) {
      commit();
      return;
    }
    draftRef.current = resolved;
    setDraft(resolved);
    setActiveEditor({ instanceId, fieldId: id });
  };

  if (!isEditing || !canEditCms) {
    if (isCleared) return null;
    return (
      <Tag className={`${className}${resolved.includes('\n') ? ' whitespace-pre-line' : ''}`}>
        {resolved}
      </Tag>
    );
  }

  const highlightClasses = isEditorOpen
    ? 'ring-2 ring-inset ring-indigo-500 bg-indigo-500/20'
    : isCleared
    ? 'ring-1 ring-inset ring-rose-400/90 bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 italic'
    : isCustomized
    ? 'ring-1 ring-inset ring-amber-400/90 bg-amber-400/15 hover:bg-amber-400/25'
    : 'ring-1 ring-inset ring-sky-400/80 bg-sky-400/10 hover:bg-sky-400/20 hover:ring-sky-500';

  return (
    <>
      <Tag
        ref={triggerRef as never}
        data-cms-editable="true"
        data-cms-key={id}
        onMouseDown={(e: React.MouseEvent) => {
          if (isEditing && canEditCms) {
            e.stopPropagation();
          }
        }}
        onClick={handleOpenClick}
        title={`Click to edit "${id}"${isCleared ? ' (Deleted)' : isCustomized ? ' (Customized)' : ''}`}
        className={`${className}${
          resolved.includes('\n') ? ' whitespace-pre-line' : ''
        } group/cms relative cursor-text rounded px-1 transition-colors ${highlightClasses}`}
      >
        {isCleared ? '[Deleted · click to restore]' : resolved}
        <Pencil
          size={10}
          className={`inline-block ml-1 align-middle transition-opacity ${
            isEditorOpen
              ? 'opacity-100 text-indigo-400'
              : isCleared
              ? 'opacity-80 text-rose-400'
              : 'opacity-65 group-hover/cms:opacity-100 text-sky-400'
          }`}
        />
      </Tag>

      {isEditorOpen &&
        coords &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label={`Edit ${id}`}
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              width: coords.width,
              zIndex: 70,
            }}
            // Stop React synthetic event bubbling across portal boundary into parent <button>s
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            onKeyUp={(e) => e.stopPropagation()}
            className="bg-white text-slate-900 border border-slate-200 rounded-lg shadow-2xl p-3 space-y-2.5 text-xs"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 truncate">
                  {section}
                </div>
                <div className="font-mono text-[10px] text-slate-500 truncate">{id}</div>
              </div>
              <button
                type="button"
                onClick={cancel}
                title="Cancel (Esc)"
                className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 shrink-0"
              >
                <X size={13} />
              </button>
            </div>

            {isMultiline ? (
              <textarea
                ref={textareaRef}
                value={draft}
                rows={3}
                placeholder="Type text, or leave empty to delete this line..."
                onChange={(e) => {
                  const val = e.target.value;
                  draftRef.current = val;
                  setDraft(val);
                }}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    cancel();
                  } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    commit();
                  }
                }}
                className="w-full px-2.5 py-1.5 text-xs text-slate-900 bg-slate-50 border border-indigo-400 rounded-md focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            ) : (
              <input
                ref={inputRef}
                type="text"
                value={draft}
                placeholder="Type text, or leave empty to delete this line..."
                onChange={(e) => {
                  const val = e.target.value;
                  draftRef.current = val;
                  setDraft(val);
                }}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commit();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    cancel();
                  }
                }}
                className="w-full px-2.5 py-1.5 text-xs text-slate-900 bg-slate-50 border border-indigo-400 rounded-md focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            )}

            {(isCustomized || draft !== defaultValue) && (
              <div className="text-[10px] text-slate-400 truncate">
                Default: <span className="text-slate-600">{defaultValue}</span>
              </div>
            )}

            <div className="flex items-center justify-between gap-1.5 pt-0.5 flex-wrap">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={clearLine}
                  title="Delete / clear this line from view"
                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 text-[11px] font-medium"
                >
                  <Trash2 size={11} />
                  Delete
                </button>
                {isCustomized && (
                  <button
                    type="button"
                    onClick={() => {
                      resetKey(id);
                      setActiveEditor(null);
                    }}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 text-[11px] font-medium"
                  >
                    <RotateCcw size={11} />
                    Reset
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5 ml-auto">
                <button
                  type="button"
                  onClick={cancel}
                  className="px-2.5 py-1 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-[11px] font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={commit}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 text-[11px] font-medium"
                >
                  <Check size={11} />
                  Save
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
