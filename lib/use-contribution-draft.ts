'use client';
import { useCallback, useSyncExternalStore } from 'react';

type Draft = {
  text: string;
  kind: string;
  author: string;
  requestId: string;
  ready: boolean;
};
const empty: Draft = {
  text: '',
  kind: 'idea',
  author: '',
  requestId: '',
  ready: false,
};
const memory = new Map<string, { raw: string | null; draft: Draft }>();
const eventName = 'hackpilot-contribution-draft';
function read(key: string): Draft {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return memory.get(key)?.draft || initialize(key, null);
  }
  if (memory.get(key)?.raw === raw) return memory.get(key)!.draft;
  return initialize(key, raw);
}
function initialize(key: string, raw: string | null): Draft {
  let value: Partial<Draft> = {};
  try {
    value = JSON.parse(raw || '{}') || {};
  } catch {
    /* Recover from corrupt storage. */
  }
  const draft = {
    text: typeof value.text === 'string' ? value.text.slice(0, 8000) : '',
    kind: ['idea', 'evidence', 'correction', 'constraint'].includes(
      value.kind || '',
    )
      ? value.kind!
      : 'idea',
    author: typeof value.author === 'string' ? value.author.slice(0, 80) : '',
    requestId: /^[a-f0-9-]{36}$/.test(value.requestId || '')
      ? value.requestId!
      : crypto.randomUUID(),
    ready: true,
  };
  memory.set(key, { raw, draft });
  return draft;
}
function write(key: string, draft: Draft) {
  const raw = JSON.stringify(draft);
  let storedRaw = memory.get(key)?.raw ?? null;
  try {
    localStorage.setItem(key, raw);
    storedRaw = raw;
  } catch {
    /* Keep the draft in memory if storage is unavailable. */
  }
  memory.set(key, { raw: storedRaw, draft });
  window.dispatchEvent(new Event(eventName));
}
export function useContributionDraft(projectId: string) {
  const key = 'hackpilot-contribution-' + projectId;
  const subscribe = useCallback(
    (listener: () => void) => {
      const storage = (e: StorageEvent) => {
        if (e.key === key || e.key === null) listener();
      };
      window.addEventListener(eventName, listener);
      window.addEventListener('storage', storage);
      return () => {
        window.removeEventListener(eventName, listener);
        window.removeEventListener('storage', storage);
      };
    },
    [key],
  );
  const snapshot = useCallback(() => read(key), [key]);
  const draft = useSyncExternalStore(subscribe, snapshot, () => empty);
  const update = useCallback(
    (patch: Partial<Draft>) =>
      write(key, {
        ...read(key),
        ...patch,
        requestId: crypto.randomUUID(),
        ready: true,
      }),
    [key],
  );
  const clear = useCallback(
    (submittedRequestId: string) => {
      const current = read(key);
      if (current.requestId !== submittedRequestId) return;
      write(key, {
        ...current,
        text: '',
        requestId: crypto.randomUUID(),
        ready: true,
      });
    },
    [key],
  );
  return { draft, update, clear };
}
