'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'quellwerk-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

/** What the user chose. 'system' means: follow prefers-color-scheme. */
export type ThemePreference = 'light' | 'dark' | 'system';

/** What the page actually shows once the preference is resolved. */
export type ResolvedTheme = 'light' | 'dark';

export interface UseThemeResult {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (next: ThemePreference) => void;
  toggleTheme: () => void;
}

function readStoredPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    // A private window can refuse storage. Following the system is the
    // sensible fallback, so the failure stays invisible.
    return 'system';
  }
}

function writeStoredPreference(preference: ThemePreference): void {
  try {
    if (preference === 'system') {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, preference);
    }
  } catch {
    // Storage is optional; the choice still applies for this page view.
  }
}

/* The preference lives outside React (localStorage), so it is read through a
   store rather than copied into state inside an effect. */
const preferenceListeners = new Set<() => void>();

function notifyPreferenceChanged(): void {
  preferenceListeners.forEach((listener) => listener());
}

function subscribeToPreference(listener: () => void): () => void {
  preferenceListeners.add(listener);
  // Another tab writing the same key counts as a change here too.
  window.addEventListener('storage', listener);
  return () => {
    preferenceListeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function subscribeToSystemTheme(listener: () => void): () => void {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

const getServerPreference = (): ThemePreference => 'system';
const getServerSystemTheme = (): ResolvedTheme => 'light';

/**
 * The attribute mirrors the prototype: no attribute means the CSS follows
 * prefers-color-scheme, an explicit value overrides it in both directions.
 */
function applyPreference(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', preference);
  }
}

export function useTheme(): UseThemeResult {
  const preference = useSyncExternalStore(
    subscribeToPreference,
    readStoredPreference,
    getServerPreference
  );
  const systemTheme = useSyncExternalStore(
    subscribeToSystemTheme,
    getSystemTheme,
    getServerSystemTheme
  );

  // Writing the attribute is the one thing React does not own here. Someone
  // who picked the opposite of their system setting sees one frame of the
  // system theme; without a choice there is no flash at all.
  useEffect(() => {
    applyPreference(preference);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    writeStoredPreference(next);
    notifyPreferenceChanged();
  }, []);

  const resolvedTheme: ResolvedTheme = preference === 'system' ? systemTheme : preference;

  const toggleTheme = useCallback(() => {
    setPreference(resolvedTheme === 'dark' ? 'light' : 'dark');
  }, [resolvedTheme, setPreference]);

  return { preference, resolvedTheme, setPreference, toggleTheme };
}
