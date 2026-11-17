// Eine Instanz pro Browser-Tab; URL-Vorgaben verändern keine Server-Einstellung.
import { useSyncExternalStore } from 'react';
import { i18n, isLanguage } from '../../../shared/i18n';
import { useStore } from '../store';
const query = new URLSearchParams(window.location.search).get('lang');
export const languageOverride = isLanguage(query) ? query : null;
const sync = () => {
  i18n.setLanguage(languageOverride ?? useStore.getState().settings.language ?? 'de');
  document.documentElement.lang = i18n.getLanguage();
};
sync();
useStore.subscribe((state, previous) => {
  if (state.settings.language !== previous.settings.language) sync();
});
export function useT() {
  useSyncExternalStore(i18n.subscribe, i18n.getLanguage, i18n.getLanguage);
  return i18n.t;
}
/** Die aktuelle Sprache, z. B. als Abhängigkeit für Canvas-Texturen, die bei einem Sprachwechsel neu zeichnen. */
export function useLanguage() {
  return useSyncExternalStore(i18n.subscribe, i18n.getLanguage, i18n.getLanguage);
}
export { t, formatTime, formatDate, formatNumber, getLanguage } from '../../../shared/i18n';
