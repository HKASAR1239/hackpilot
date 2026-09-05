'use client';
import { useCallback, useSyncExternalStore } from 'react';
import {
  DRAFT_KEY,
  emptyDraft,
  restoreDraft,
  serializeDraft,
} from './project-draft.mjs';

type Draft = ReturnType<typeof emptyDraft>;
type Snapshot = {
  draft: Draft;
  ready: boolean;
  saved: boolean;
  storageAvailable: boolean;
  expired: number;
};
const serverSnapshot: Snapshot = {
  draft: emptyDraft(),
  ready: false,
  saved: false,
  storageAvailable: true,
  expired: 0,
};
const eventName = 'hackpilot-draft-changed';
let cached: Snapshot | undefined;
let cachedRaw: string | null | undefined;
function snapshot(): Snapshot {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!cached || cachedRaw !== raw) {
      const restored = restoreDraft(raw);
      cached = {
        ...restored,
        ready: true,
        saved: raw !== null,
        storageAvailable: true,
      };
      cachedRaw = raw;
    }
  } catch {
    cached ??= { ...serverSnapshot, ready: true, storageAvailable: false };
  }
  return cached;
}
function subscribe(listener: () => void) {
  const changed = (event: StorageEvent) => {
    if (event.key === DRAFT_KEY || event.key === null) listener();
  };
  window.addEventListener(eventName, listener);
  window.addEventListener('storage', changed);
  return () => {
    window.removeEventListener(eventName, listener);
    window.removeEventListener('storage', changed);
  };
}
function write(draft: Draft, expired: number) {
  // Synchronous persistence protects the last edit even on an immediate reload.
  let saved = false;
  try {
    const raw = serializeDraft(draft);
    localStorage.setItem(DRAFT_KEY, raw);
    cachedRaw = raw;
    saved = true;
  } catch {
    // Keep an in-memory draft when browser storage is unavailable or full.
  }
  cached = { draft, ready: true, saved, storageAvailable: saved, expired };
  window.dispatchEvent(new Event(eventName));
}
export function useProjectDraft() {
  const state = useSyncExternalStore(subscribe, snapshot, () => serverSnapshot);
  const update = useCallback((patch: Partial<Draft>) => {
    const current = snapshot();
    write({ ...current.draft, ...patch }, current.expired);
  }, []);
  const dismissExpired = useCallback(() => write(snapshot().draft, 0), []);
  return { ...state, update, dismissExpired };
}
