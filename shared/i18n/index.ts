import { catalogs, type TranslationKey } from './catalogs.ts';
import type { Catalog, Language } from './types.ts';
export { isLanguage, type Language } from './types.ts';
export type { TranslationKey } from './catalogs.ts';
export type Params = Record<string, string | number>;
const development = import.meta.env?.DEV ?? (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production');

/** Eigene Instanzen verhindern, dass Server-Aufrufe die Sprache anderer Aufrufe ändern. */
export function createI18n(initial: Language = 'de', source: Record<Language, Catalog> = catalogs, warn = development) {
  let language = initial;
  const listeners = new Set<() => void>();
  const locale = () => language === 'de' ? 'de-DE' : 'en-US';
  return {
    getLanguage: () => language,
    setLanguage(next: Language) {
      if (next === language) return;
      language = next;
      listeners.forEach((fn) => fn());
    },
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    t(key: TranslationKey | (string & {}), params: Params = {}): string {
      let message = source[language][key];
      let messageLanguage = language;
      if (message === undefined) {
        if (warn) console.warn(`[i18n] Missing translation: ${language}:${key}`);
        message = source.en[key];
        messageLanguage = 'en';
      }
      if (message === undefined) return key;
      if (typeof message !== 'string') {
        const category = new Intl.PluralRules(messageLanguage).select(Number(params.count ?? 0));
        message = message[category] ?? message.other;
      }
      return message.replace(/\{(\w+)\}/g, (placeholder, name: string) => String(params[name] ?? placeholder));
    },
    formatTime(value: Date | number, options: Intl.DateTimeFormatOptions = {}) {
      return new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit', ...options, ...(language === 'de' ? { hour12: false } : {}) }).format(value);
    },
    formatDate(value: Date | number, options: Intl.DateTimeFormatOptions = {}) {
      return new Intl.DateTimeFormat(locale(), options).format(value);
    },
    formatNumber(value: number, options: Intl.NumberFormatOptions = {}) {
      return new Intl.NumberFormat(locale(), options).format(value);
    },
  };
}
export const i18n = createI18n();
export const { t, formatTime, formatDate, formatNumber, setLanguage, getLanguage } = i18n;
