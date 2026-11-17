import { describe, expect, it, vi } from 'vitest';
import { createI18n } from './index.ts';
import { areas, catalogs } from './catalogs.ts';
import type { Catalog } from './types.ts';

describe('i18n', () => {
  it('ersetzt Platzhalter und behält unbekannte Platzhalter', () => {
    const translator = createI18n('de', { en: {}, de: { 'test.greeting.text': 'Hallo {name}, {missing}!' } });
    expect(translator.t('test.greeting.text', { name: 'Ada' })).toBe('Hallo Ada, {missing}!');
  });
  it('wählt Pluralformen nach der Sprache des Textes', () => {
    const en = { 'test.items.count': { one: '{count} item', other: '{count} items' } };
    const translator = createI18n('de', { en, de: {} }, false);
    expect(translator.t('test.items.count', { count: 1 })).toBe('1 item');
    expect(translator.t('test.items.count', { count: 0 })).toBe('0 items');
    translator.setLanguage('en');
    expect(translator.t('test.items.count', { count: 2 })).toBe('2 items');
    const german = createI18n('de', { en, de: { 'test.items.count': { one: '{count} Eintrag', other: '{count} Einträge' } } });
    expect(german.t('test.items.count', { count: 1 })).toBe('1 Eintrag');
    expect(german.t('test.items.count', { count: 2 })).toBe('2 Einträge');
  });
  it('fällt auf Englisch und anschließend den Schlüssel zurück; warnt nur in Entwicklung', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const translator = createI18n('de', { en: { 'test.fallback.text': 'Hello {name}' }, de: {} }, true);
      expect(translator.t('test.fallback.text', { name: 'Ada' })).toBe('Hello Ada');
      expect(translator.t('test.missing.text')).toBe('test.missing.text');
      expect(warn).toHaveBeenCalledTimes(2);
      createI18n('de', { en: {}, de: {} }, false).t('test.missing.text');
      expect(warn).toHaveBeenCalledTimes(2);
    } finally { warn.mockRestore(); }
  });
  it('formatiert deutsch mit 24 Stunden und reagiert auf Sprachwechsel', () => {
    const translator = createI18n();
    const date = new Date('2026-10-09T15:04:00Z');
    expect(translator.formatTime(date, { timeZone: 'UTC' })).toBe('15:04');
    expect(translator.formatDate(date, { timeZone: 'UTC' })).toBe('9.10.2026');
    expect(translator.formatNumber(1234.5)).toBe('1.234,5');
    const changed = vi.fn();
    const unsubscribe = translator.subscribe(changed);
    translator.setLanguage('en');
    expect(translator.formatTime(date, { timeZone: 'UTC' })).toMatch(/03:04.*PM/);
    expect(translator.formatNumber(1234.5)).toBe('1,234.5');
    expect(changed).toHaveBeenCalledTimes(1);
    unsubscribe();
    translator.setLanguage('de');
    expect(changed).toHaveBeenCalledTimes(1);
  });
  it('verwendet identische Schlüssel, Pluralformen und Platzhalter in beiden Katalogen', () => {
    for (const area of [...areas, catalogs]) {
      expect(Object.keys(area.de).sort()).toEqual(Object.keys(area.en).sort());
      const en: Catalog = area.en;
      const de: Catalog = area.de;
      const placeholders = (value: string) => [...new Set(value.match(/\{\w+\}/g) ?? [])].sort();
      for (const key of Object.keys(en)) {
        expect(key).toMatch(/^[a-z][a-zA-Z0-9]*(?:\.[a-z0-9][a-zA-Z0-9]*){1,3}$/);
        const english = en[key];
        const german = de[key];
        if (typeof english === 'string') {
          expect(typeof german, key).toBe('string');
          expect(placeholders(german as string), key).toEqual(placeholders(english));
        } else {
          expect(typeof german, key).toBe('object');
          expect(Object.keys(german).sort(), key).toEqual(Object.keys(english).sort());
          for (const form of Object.keys(english) as Intl.LDMLPluralRule[]) {
            expect(placeholders((german as Exclude<typeof german, string>)[form]!), `${key}:${form}`).toEqual(placeholders(english[form]!));
          }
        }
      }
    }
  });
});
