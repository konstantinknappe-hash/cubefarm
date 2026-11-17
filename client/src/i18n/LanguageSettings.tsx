import { useState } from 'react';
import { api } from '../api';
import { useStore } from '../store';
import { languageOverride, useT } from './index';
import { isLanguage } from '../../../shared/i18n';
export function LanguageSettings() {
  const t = useT();
  const language = useStore((s) => s.settings.language);
  const [busy, setBusy] = useState(false);
  return <div className="card">
    <label className="field">
      <span>{t('core.language.label')}</span>
      <select value={language} disabled={busy} onChange={(e) => {
        const next = e.target.value;
        if (!isLanguage(next)) return;
        setBusy(true);
        void api.updateSettings({ language: next }).catch(() => undefined).finally(() => setBusy(false));
      }}>
        <option value="de">{t('core.language.de')}</option>
        <option value="en">{t('core.language.en')}</option>
      </select>
    </label>
    {languageOverride && <p className="muted small">{t('core.language.override')}</p>}
  </div>;
}
