import { useCallback } from 'react';
import { de } from './de';
import { en } from './en';

type Translations = typeof de;

const translations: Record<string, Translations> = { de, en };

/**
 * Get nested value from object by dot-notation path
 */
function getNestedValue(obj: Record<string, unknown>, path: string): string {
  const keys = path.split('.');
  let current: unknown = obj;

  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return path;
    }
  }

  return typeof current === 'string' ? current : path;
}

/**
 * Hook for users module translations
 */
export function useTranslation(locale: string = 'de') {
  const currentTranslations = translations[locale] ?? translations.de;

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      let text = getNestedValue(currentTranslations as unknown as Record<string, unknown>, key);

      if (params) {
        Object.entries(params).forEach(([paramKey, value]) => {
          text = text.replace(new RegExp(`{{${paramKey}}}`, 'g'), String(value));
        });
      }

      return text;
    },
    [currentTranslations]
  );

  return { t, locale };
}
