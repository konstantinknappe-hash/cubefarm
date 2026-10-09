// Gemeinsame Katalogform: Englisch definiert die Schlüssel und Pluralformen.
export type Language = 'de' | 'en';
export type Message = string | ({ other: string } & Partial<Record<Intl.LDMLPluralRule, string>>);
export type Catalog = Record<string, Message>;
export type TranslationOf<T extends Catalog> = { [K in keyof T]: T[K] extends string ? string : { [P in keyof T[K]]: string } };
export const isLanguage = (value: unknown): value is Language => value === 'de' || value === 'en';
