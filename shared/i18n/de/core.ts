import type { core as English } from '../en/core.ts';
import type { TranslationOf } from '../types.ts';
export const core = {
  'core.confirm.cancel': 'Abbrechen',
  'core.confirm.ok': 'OK',
  'core.confirm.enter': 'Eingabe',
  'core.confirm.escape': 'Esc',
  'core.language.label': 'Sprache / Language',
  'core.language.de': 'Deutsch',
  'core.language.en': 'English',
  'core.language.override': 'Dieser Tab verwendet die Sprache aus der URL. Die Auswahl ändert den gespeicherten Standard.',
  'core.settings.invalidLanguage': 'Die Sprache muss de oder en sein.',
} satisfies TranslationOf<typeof English>;
