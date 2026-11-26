import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRbac } from './RbacContext';

const STORAGE_KEY = 'fortifai_live_cms_v1';

export interface CmsFieldMeta {
  id: string;
  defaultValue: string;
  section: string;
  label?: string;
  multiline?: boolean;
}

interface CmsHistoryEntry {
  id: string;
  prevValue: string | undefined;
  nextValue: string | undefined;
}

export interface ActiveCmsEditor {
  instanceId: string;
  fieldId: string;
}

export type CmsSyncStatus = 'idle' | 'saving' | 'saved' | 'local_only' | 'error';

interface LiveCmsContextValue {
  isEditing: boolean;
  setIsEditing: (val: boolean | ((prev: boolean) => boolean)) => void;
  toggleEditing: () => void;
  isInspectorOpen: boolean;
  setIsInspectorOpen: (val: boolean | ((prev: boolean) => boolean)) => void;
  activeEditor: ActiveCmsEditor | null;
  setActiveEditor: (editor: ActiveCmsEditor | null) => void;
  canEditCms: boolean;
  overrides: Record<string, string>;
  registry: Record<string, CmsFieldMeta>;
  registerField: (meta: CmsFieldMeta) => void;
  getText: (id: string, defaultValue: string) => string;
  setOverride: (id: string, nextValue: string, immediateSync?: boolean) => void;
  resetKey: (id: string) => void;
  resetSection: (section: string) => void;
  resetAll: () => void;
  undoLast: () => void;
  canUndo: boolean;
  importOverrides: (incoming: Record<string, string>) => number;
  syncNow: () => void;
  syncStatus: CmsSyncStatus;
  syncError: string | null;
  lastSavedAt: string | null;
  overrideCount: number;
}

const LiveCmsContext = createContext<LiveCmsContextValue | null>(null);

function loadLocalOverrides(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string') clean[k] = v;
    }
    return clean;
  } catch {
    return {};
  }
}

function saveLocalOverrides(overrides: Record<string, string>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // ignore quota errors
  }
}

interface LiveCmsProviderProps {
  sessionToken: string | null;
  onRefreshSession?: () => Promise<string | null>;
  onNotify?: (msg: string) => void;
  children: ReactNode;
}

export function LiveCmsProvider({
  sessionToken,
  onRefreshSession,
  onNotify,
  children,
}: LiveCmsProviderProps) {
  const { permissions, role } = useRbac();
  const canEditCms = Boolean(
    permissions.can_manage_schema ||
      permissions.can_manage_users ||
      role === 'super_admin' ||
      role === 'admin'
  );

  const [isEditing, setIsEditingState] = useState(false);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [activeEditor, setActiveEditor] = useState<ActiveCmsEditor | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>(() => loadLocalOverrides());
  const [registry, setRegistry] = useState<Record<string, CmsFieldMeta>>({});
  const [history, setHistory] = useState<CmsHistoryEntry[]>([]);
  const [syncStatus, setSyncStatus] = useState<CmsSyncStatus>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const overridesRef = useRef<Record<string, string>>(overrides);
  const historyRef = useRef<CmsHistoryEntry[]>(history);
  const registryRef = useRef<Record<string, CmsFieldMeta>>({});
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSyncRef = useRef<boolean>(false);
  const hasMutatedLocallyRef = useRef<boolean>(false);

  useEffect(() => {
    overridesRef.current = overrides;
  }, [overrides]);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  // Hydrate shared overrides from server on mount (only if user hasn't already edited locally this session)
  useEffect(() => {
    let cancelled = false;
    fetch('/api/cms')
      .then((r) => r.json())
      .then(
        (data: {
          ok?: boolean;
          overrides?: Record<string, string>;
          updatedAt?: string | null;
        }) => {
          if (cancelled || !data?.ok || !data.overrides || hasMutatedLocallyRef.current) return;
          const serverOverrides = data.overrides;
          if (data.updatedAt || Object.keys(serverOverrides).length > 0) {
            overridesRef.current = serverOverrides;
            setOverrides(serverOverrides);
            saveLocalOverrides(serverOverrides);
            if (data.updatedAt) setLastSavedAt(data.updatedAt);
            setSyncStatus('saved');
            setSyncError(null);
          }
        }
      )
      .catch(() => {
        // Local storage fallback remains active
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Automatically turn off edit mode if RBAC drops privileges (e.g. role simulation)
  useEffect(() => {
    if (!canEditCms) {
      setIsEditingState(false);
      setIsInspectorOpen(false);
      setActiveEditor(null);
    }
  }, [canEditCms]);

  // Close any open field editor if inline editing mode is turned off
  useEffect(() => {
    if (!isEditing) {
      setActiveEditor(null);
    }
  }, [isEditing]);

  // Global Cmd+E / Ctrl+E shortcut to toggle Live CMS inline editing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!canEditCms) return;
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        setIsEditingState((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canEditCms]);

  const flushToServer = useCallback(
    async (payloadOverrides: Record<string, string>) => {
      if (!canEditCms) {
        pendingSyncRef.current = true;
        setSyncStatus('local_only');
        setSyncError(null);
        return;
      }

      let activeToken = sessionToken;
      if (!activeToken && onRefreshSession) {
        activeToken = await onRefreshSession();
      }

      if (!activeToken) {
        pendingSyncRef.current = true;
        setSyncStatus('local_only');
        setSyncError(null);
        return;
      }

      pendingSyncRef.current = false;
      setSyncStatus('saving');
      setSyncError(null);

      const attemptPut = async (tokenToUse: string) =>
        fetch('/api/cms', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenToUse}`,
          },
          body: JSON.stringify({ overrides: payloadOverrides }),
        });

      try {
        let res = await attemptPut(activeToken);
        if (res.status === 401 && onRefreshSession) {
          const freshToken = await onRefreshSession();
          if (freshToken) {
            res = await attemptPut(freshToken);
          }
        }
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          updatedAt?: string;
          error?: string;
        };
        if (res.ok && data?.ok) {
          setSyncStatus('saved');
          setSyncError(null);
          setLastSavedAt(data.updatedAt || new Date().toISOString());
        } else {
          pendingSyncRef.current = true;
          setSyncStatus('error');
          setSyncError(data?.error || `Sync failed (${res.status})`);
        }
      } catch {
        pendingSyncRef.current = true;
        setSyncStatus('local_only');
        setSyncError('Network error while syncing CMS copy');
      }
    },
    [sessionToken, canEditCms, onRefreshSession]
  );

  const persistOverrides = useCallback(
    (nextOverrides: Record<string, string>, immediate = true) => {
      hasMutatedLocallyRef.current = true;
      saveLocalOverrides(nextOverrides);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

      if (!canEditCms) {
        pendingSyncRef.current = true;
        setSyncStatus('local_only');
        return;
      }

      setSyncStatus('saving');
      if (immediate) {
        void flushToServer(nextOverrides);
      } else {
        saveTimerRef.current = setTimeout(() => {
          void flushToServer(overridesRef.current);
        }, 250);
      }
    },
    [canEditCms, flushToServer]
  );

  // Flush queued local edits once sessionToken becomes available
  useEffect(() => {
    if (sessionToken && canEditCms && pendingSyncRef.current) {
      void flushToServer(overridesRef.current);
    }
  }, [sessionToken, canEditCms, flushToServer]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const syncNow = useCallback(() => {
    void flushToServer(overridesRef.current);
  }, [flushToServer]);

  const registerField = useCallback((meta: CmsFieldMeta) => {
    const existing = registryRef.current[meta.id];
    if (
      existing &&
      existing.defaultValue === meta.defaultValue &&
      existing.section === meta.section &&
      existing.label === meta.label &&
      Boolean(existing.multiline) === Boolean(meta.multiline)
    ) {
      return;
    }
    registryRef.current[meta.id] = meta;
    setRegistry((prev) => ({ ...prev, [meta.id]: meta }));
  }, []);

  const getText = useCallback(
    (id: string, defaultValue: string) => {
      if (Object.prototype.hasOwnProperty.call(overrides, id)) {
        return overrides[id];
      }
      return defaultValue;
    },
    [overrides]
  );

  const setOverride = useCallback(
    (id: string, nextValue: string, immediateSync = true) => {
      const defaultVal = registryRef.current[id]?.defaultValue;
      const prevOverrides = overridesRef.current;
      const hasPrev = Object.prototype.hasOwnProperty.call(prevOverrides, id);
      const prevVal = hasPrev ? prevOverrides[id] : undefined;

      const nextOverrides = { ...prevOverrides };
      if (defaultVal !== undefined && nextValue === defaultVal) {
        delete nextOverrides[id];
      } else {
        nextOverrides[id] = nextValue;
      }

      const hasNext = Object.prototype.hasOwnProperty.call(nextOverrides, id);
      const nextStored = hasNext ? nextOverrides[id] : undefined;
      if (hasPrev === hasNext && prevVal === nextStored) return;

      const nextHistory: CmsHistoryEntry[] = [
        ...historyRef.current.slice(-29),
        { id, prevValue: prevVal, nextValue: nextStored },
      ];

      overridesRef.current = nextOverrides;
      historyRef.current = nextHistory;
      setOverrides(nextOverrides);
      setHistory(nextHistory);
      persistOverrides(nextOverrides, immediateSync);
    },
    [persistOverrides]
  );

  const resetKey = useCallback(
    (id: string) => {
      const prevOverrides = overridesRef.current;
      if (!Object.prototype.hasOwnProperty.call(prevOverrides, id)) return;
      const prevVal = prevOverrides[id];
      const nextOverrides = { ...prevOverrides };
      delete nextOverrides[id];

      const nextHistory: CmsHistoryEntry[] = [
        ...historyRef.current.slice(-29),
        { id, prevValue: prevVal, nextValue: undefined },
      ];

      overridesRef.current = nextOverrides;
      historyRef.current = nextHistory;
      setOverrides(nextOverrides);
      setHistory(nextHistory);
      persistOverrides(nextOverrides, true);
    },
    [persistOverrides]
  );

  const resetSection = useCallback(
    (section: string) => {
      const prevOverrides = overridesRef.current;
      const nextOverrides = { ...prevOverrides };
      let changed = 0;

      for (const meta of Object.values(registryRef.current)) {
        if (meta.section === section && Object.prototype.hasOwnProperty.call(nextOverrides, meta.id)) {
          delete nextOverrides[meta.id];
          changed += 1;
        }
      }
      if (changed === 0) return;

      overridesRef.current = nextOverrides;
      setOverrides(nextOverrides);
      persistOverrides(nextOverrides, true);
      onNotify?.(`Reset ${changed} customized label${changed === 1 ? '' : 's'} in ${section}.`);
    },
    [persistOverrides, onNotify]
  );

  const resetAll = useCallback(() => {
    overridesRef.current = {};
    historyRef.current = [];
    setOverrides({});
    setHistory([]);
    setActiveEditor(null);
    persistOverrides({}, true);
    onNotify?.('Restored all Live CMS copy to factory defaults.');
  }, [persistOverrides, onNotify]);

  const undoLast = useCallback(() => {
    const prevHistory = historyRef.current;
    if (prevHistory.length === 0) return;

    const last = prevHistory[prevHistory.length - 1];
    const nextHistory = prevHistory.slice(0, -1);
    const nextOverrides = { ...overridesRef.current };

    if (last.prevValue === undefined) {
      delete nextOverrides[last.id];
    } else {
      nextOverrides[last.id] = last.prevValue;
    }

    historyRef.current = nextHistory;
    overridesRef.current = nextOverrides;
    setHistory(nextHistory);
    setOverrides(nextOverrides);
    persistOverrides(nextOverrides, true);
  }, [persistOverrides]);

  const importOverrides = useCallback(
    (incoming: Record<string, string>) => {
      const clean: Record<string, string> = {};
      for (const [k, v] of Object.entries(incoming)) {
        if (/^[a-zA-Z0-9_.:-]{2,120}$/.test(k) && typeof v === 'string') {
          clean[k] = v.slice(0, 2000);
        }
      }
      const count = Object.keys(clean).length;
      const nextOverrides = { ...overridesRef.current, ...clean };
      overridesRef.current = nextOverrides;
      setOverrides(nextOverrides);
      persistOverrides(nextOverrides, true);
      onNotify?.(`Imported ${count} Live CMS copy override${count === 1 ? '' : 's'}.`);
      return count;
    },
    [persistOverrides, onNotify]
  );

  const setIsEditing = useCallback(
    (val: boolean | ((prev: boolean) => boolean)) => {
      if (!canEditCms) return;
      setIsEditingState(val);
    },
    [canEditCms]
  );

  const toggleEditing = useCallback(() => {
    if (!canEditCms) {
      onNotify?.('Live CMS requires Admin or Schema Manager permissions.');
      return;
    }
    setIsEditingState((prev) => !prev);
  }, [canEditCms, onNotify]);

  const overrideCount = useMemo(() => Object.keys(overrides).length, [overrides]);

  const value = useMemo<LiveCmsContextValue>(
    () => ({
      isEditing,
      setIsEditing,
      toggleEditing,
      isInspectorOpen,
      setIsInspectorOpen,
      activeEditor,
      setActiveEditor,
      canEditCms,
      overrides,
      registry,
      registerField,
      getText,
      setOverride,
      resetKey,
      resetSection,
      resetAll,
      undoLast,
      canUndo: history.length > 0,
      importOverrides,
      syncNow,
      syncStatus,
      syncError,
      lastSavedAt,
      overrideCount,
    }),
    [
      isEditing,
      setIsEditing,
      toggleEditing,
      isInspectorOpen,
      activeEditor,
      canEditCms,
      overrides,
      registry,
      registerField,
      getText,
      setOverride,
      resetKey,
      resetSection,
      resetAll,
      undoLast,
      history.length,
      importOverrides,
      syncNow,
      syncStatus,
      syncError,
      lastSavedAt,
      overrideCount,
    ]
  );

  return <LiveCmsContext.Provider value={value}>{children}</LiveCmsContext.Provider>;
}

export function useLiveCms(): LiveCmsContextValue {
  const ctx = useContext(LiveCmsContext);
  if (!ctx) {
    throw new Error('useLiveCms must be used inside a LiveCmsProvider');
  }
  return ctx;
}
