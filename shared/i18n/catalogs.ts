// Pro Bereich genau eine Registrierung; die Typreferenz liegt in der deutschen Bereichsdatei.
import { core as enCore } from './en/core.ts';
import { core as deCore } from './de/core.ts';
import type { Message } from './types.ts';
export const areas = [{ en: enCore, de: deCore }] as const;
type Keys<T> = T extends unknown ? keyof T : never;
export type TranslationKey = Keys<(typeof areas)[number]['en']>;
export const catalogs = {
  en: Object.fromEntries(areas.flatMap((area) => Object.entries(area.en))) as Record<TranslationKey, Message>,
  de: Object.fromEntries(areas.flatMap((area) => Object.entries(area.de))) as Record<TranslationKey, Message>,
};
