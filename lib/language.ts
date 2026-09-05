'use client';
import { useEffect, useSyncExternalStore, useCallback } from 'react';
import english from './en.json';
import { englishMessage } from '../engine/english.mjs';
export type Locale = 'fr' | 'en';
const dictionary: Record<string, string> = english;
const event = 'hackpilot-language';
let fallback: Locale = 'fr';
function snapshot(): Locale {
  try {
    return window.localStorage.getItem(event) === 'en' ? 'en' : 'fr';
  } catch {
    return fallback;
  }
}
function subscribe(listener: () => void) {
  window.addEventListener(event, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(event, listener);
    window.removeEventListener('storage', listener);
  };
}
export function translate(text: string, locale: Locale) {
  return locale === 'en' ? dictionary[text] || englishMessage(text) : text;
}
export function useLanguage() {
  const locale = useSyncExternalStore(
    subscribe,
    snapshot,
    () => 'fr' as Locale,
  );
  function setLocale(value: Locale) {
    fallback = value;
    try {
      window.localStorage.setItem(event, value);
    } catch {
      /* Session-only preference when storage is unavailable. */
    }
    window.dispatchEvent(new Event(event));
  }
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title =
      locale === 'en' ? 'HackPilot — Projects' : 'HackPilot — Projets';
  }, [locale]);
  const t = useCallback((text: string) => translate(text, locale), [locale]);
  return { locale, setLocale, t };
}
