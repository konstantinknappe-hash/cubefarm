// The Settings tab's Themes section: holiday themes by date (auto), never (off), or one forced on; holidays the office
// doesn't celebrate switched off one by one; and the manager's birthday (day and month, kept on the server).
import { useId } from 'react';
import { api } from '../api';
import { useStore } from '../store';
import { DEFAULT_THEME_SETTINGS, THEME_IDS, THEME_INFO, type ThemeMode, type ThemeSettings as Themes } from '../../../shared/themes';
import { useTheme } from '../world/themes/active';
import { useT } from '../i18n';

const DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function ThemeSettings() {
  const t = useT();
  const themes = useStore((s) => s.settings.themes) ?? DEFAULT_THEME_SETTINGS;
  const now = useTheme();
  const radio = useId();
  const save = (patch: Partial<Themes>) => void api.updateSettings({ themes: { ...themes, ...patch } }).catch(() => undefined);
  const forced = themes.mode !== 'auto' && themes.mode !== 'off';
  const b = themes.birthday;
  const setBirthday = (month: number, day: number) => save({ birthday: month ? { month, day: Math.min(day || 1, DAYS[month - 1]) } : null });
  const months = Array.from({ length: 12 }, (_, i) => t(`themes.months.${i + 1}` as Parameters<typeof t>[0]));
  const source = now.source === 'auto' ? t('themes.source.auto') : now.source === 'forced' ? t('themes.source.forced') : now.source === 'url' ? t('themes.source.url') : '';
  return (
    <div className="card">
      <h3>{t('themes.title')}</h3>
      <p className="muted small">
        {t('themes.desc')}{' '}
        {now.id ? (
          <>
            {t('themes.now')} <b>{`${THEME_INFO[now.id].emoji} ${THEME_INFO[now.id].name}`}</b> ({source}).
          </>
        ) : (
          t('themes.noToday')
        )}
      </p>
      <div role="radiogroup" aria-label={t('themes.radioAria')}>
        {(
          [
            ['auto', t('themes.byDate'), t('themes.byDateNote')],
            ['off', t('themes.off'), t('themes.offNote')],
          ] as [ThemeMode, string, string][]
        ).map(([m, label, note]) => (
          <label key={m} className="toggle block">
            <input type="radio" name={radio} checked={themes.mode === m} onChange={() => save({ mode: m })} />
            <span>
              <b>{label}</b> ({note})
            </span>
          </label>
        ))}
        <label className="toggle block">
          <input type="radio" name={radio} checked={forced} onChange={() => save({ mode: forced ? themes.mode : 'halloween' })} />
          <span>
            <b>{t('themes.always')}</b>{' '}
            <select value={forced ? themes.mode : 'halloween'} onChange={(e) => save({ mode: e.target.value as ThemeMode })} aria-label={t('themes.themeAria')}>
              {THEME_IDS.map((id) => (
                <option key={id} value={id}>
                  {`${THEME_INFO[id].emoji} ${THEME_INFO[id].name}`}
                </option>
              ))}
            </select>
          </span>
        </label>
      </div>
      <div className="field">{t('themes.celebrate')}</div>
      {THEME_IDS.map((id) => (
        <label key={id} className="toggle block">
          <input type="checkbox" checked={!themes.disabled.includes(id)} onChange={(e) => save({ disabled: e.target.checked ? themes.disabled.filter((x) => x !== id) : [...themes.disabled, id] })} />
          <span>
            {`${THEME_INFO[id].emoji} ${THEME_INFO[id].name}`} <span className="muted small">({THEME_INFO[id].when})</span>
          </span>
        </label>
      ))}
      <div className="field">{t('themes.birthday')}</div>
      <div className="row">
        <select value={b?.month ?? 0} onChange={(e) => setBirthday(Number(e.target.value), b?.day ?? 1)} aria-label={t('themes.monthAria')}>
          <option value={0}>{t('themes.monthPlaceholder')}</option>
          {months.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <select value={b?.day ?? 0} disabled={!b} onChange={(e) => b && setBirthday(b.month, Number(e.target.value))} aria-label={t('themes.dayAria')}>
          {!b && <option value={0}>{t('themes.dayPlaceholder')}</option>}
          {Array.from({ length: b ? DAYS[b.month - 1] : 31 }, (_, i) => (
            <option key={i} value={i + 1}>
              {i + 1}
            </option>
          ))}
        </select>
        {b && (
          <button className="btn btn-small" onClick={() => save({ birthday: null })}>
            {t('themes.clear')}
          </button>
        )}
      </div>
      <p className="muted small">
        Preview any theme with <code>?theme=christmas</code> in the address bar (or <code>?date=2026-12-24</code> to pretend it's another day).
      </p>
    </div>
  );
}
