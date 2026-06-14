/**
 * Generic, typed filter-presets store backed by localStorage.
 *
 * A "preset" is a named snapshot of a filter value object scoped to a screen
 * (e.g. "documents-v1", "pending-signatures-v1"). Presets are local to the
 * browser/user — no backend round-trip — which keeps perf identical to
 * non-preset filters while still giving users quick recall.
 */

import { useCallback, useEffect, useState } from "react";

export interface FilterPreset<T> {
  id: string;
  name: string;
  value: T;
  createdAt: number;
}

const STORAGE_PREFIX = "spp.filter-presets.";

function storageKey(scope: string) {
  return `${STORAGE_PREFIX}${scope}`;
}

function safeRead<T>(scope: string): FilterPreset<T>[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(scope));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as FilterPreset<T>[];
  } catch {
    return [];
  }
}

function safeWrite<T>(scope: string, presets: FilterPreset<T>[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(scope), JSON.stringify(presets));
  } catch {
    /* quota / private mode — ignore */
  }
}

/**
 * React hook: list/save/delete/apply filter presets for a given scope.
 *
 * Usage:
 *   const presets = useFilterPresets<MyFilters>("documents-v1");
 *   presets.save("Factures impayées", currentFilters);
 *   presets.list.map(p => <button onClick={() => onApply(p.value)} />)
 */
export function useFilterPresets<T>(scope: string) {
  const [list, setList] = useState<FilterPreset<T>[]>(() => safeRead<T>(scope));

  // Re-read when scope changes (rare, but keeps hook honest).
  useEffect(() => {
    setList(safeRead<T>(scope));
  }, [scope]);

  // Cross-tab sync.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey(scope)) setList(safeRead<T>(scope));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [scope]);

  const save = useCallback(
    (name: string, value: T): FilterPreset<T> => {
      const trimmed = name.trim() || "Sans nom";
      const next: FilterPreset<T> = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        name: trimmed,
        value,
        createdAt: Date.now(),
      };
      const updated = [next, ...safeRead<T>(scope)].slice(0, 20); // hard cap
      safeWrite(scope, updated);
      setList(updated);
      return next;
    },
    [scope],
  );

  const remove = useCallback(
    (id: string) => {
      const updated = safeRead<T>(scope).filter((p) => p.id !== id);
      safeWrite(scope, updated);
      setList(updated);
    },
    [scope],
  );

  const clear = useCallback(() => {
    safeWrite<T>(scope, []);
    setList([]);
  }, [scope]);

  return { list, save, remove, clear };
}
