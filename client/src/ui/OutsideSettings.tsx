// The Settings tab's Outside section: where the weather comes from (the calm cycle, off, or the manager's own local
// weather, which the office's server reads from Open-Meteo) and how often something happens outside (world events),
// both saved on the server for every viewer.
import { useId } from 'react';
import { api } from '../api';
import { useStore } from '../store';
import { useT } from '../i18n';
import type { EventFrequency, WeatherKind, WeatherMode, WeatherSettings, WorldEventSettings } from '../../../shared/outside';

export function OutsideSettings() {
  const t = useT();
  const weather = useStore((s) => s.settings.weather);
  const events = useStore((s) => s.settings.worldEvents);
  const view = useStore((s) => s.weather);
  const radioName = useId();
  const saveWeather = (patch: Partial<WeatherSettings>) => void api.updateSettings({ weather: { ...weather, ...patch } }).catch(() => undefined);
  const saveEvents = (patch: Partial<WorldEventSettings>) => void api.updateSettings({ worldEvents: { ...events, ...patch } }).catch(() => undefined);

  const MODES: [WeatherMode, string, string][] = [
    ['cycle', t('outside.mode.cycle'), t('outside.mode.cycleNote')],
    ['off', t('outside.mode.off'), t('outside.mode.offNote')],
    ['real', t('outside.mode.real'), t('outside.mode.realNote')],
  ];

  const FREQUENCIES: [EventFrequency, string][] = [
    ['off', t('outside.freq.off')],
    ['rare', t('outside.freq.rare')],
    ['normal', t('outside.freq.normal')],
    ['chaos', t('outside.freq.chaos')],
  ];

  const WEATHER_LABELS: Record<WeatherKind, string> = {
    clear: t('outside.weather.clear'),
    cloudy: t('outside.weather.cloudy'),
    'light-rain': t('outside.weather.lightRain'),
    'heavy-rain': t('outside.weather.heavyRain'),
    storm: t('outside.weather.storm'),
    fog: t('outside.weather.fog'),
    snow: t('outside.weather.snow'),
  };

  const ago = (at: number) => {
    const min = Math.round((Date.now() - at) / 60_000);
    if (min < 1) return t('outside.justNow');
    if (min < 60) return t('outside.minAgo', { min });
    return t('outside.hAgo', { h: Math.round(min / 60) });
  };

  const real = weather.mode === 'real';
  return (
    <div className="card">
      <h3>{t('outside.title')}</h3>
      <div role="radiogroup" aria-label={t('outside.radioAria')}>
        {MODES.map(([m, label, note]) => (
          <label key={m} className="toggle block">
            <input type="radio" name={radioName} checked={weather.mode === m} onChange={() => saveWeather({ mode: m })} />
            <span>
              <b>{label}</b> ({note})
            </span>
          </label>
        ))}
      </div>
      {real && (
        <>
          <label className="field">
            <span>{t('outside.yourCity')}</span>
            <input
              key={weather.city}
              defaultValue={weather.city}
              placeholder={t('outside.cityPlaceholder')}
              maxLength={80}
              onBlur={(e) => e.target.value.trim() !== weather.city && saveWeather({ city: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          </label>
          <p className="small" aria-live="polite">
            {view.place && <b>{view.place.name}</b>}
            {view.place && view.reading && `: ${t('outside.reading', { label: WEATHER_LABELS[view.reading.kind], ago: ago(view.reading.at) })}`}
            {view.place && !view.reading && !view.error && `: ${t('outside.lookingUp')}`}
            {view.error && <span className="muted"> {view.error}</span>}
          </p>
          <p className="muted small">{t('outside.serverDesc')}</p>
        </>
      )}
      <h3>{t('outside.events')}</h3>
      <p className="muted small">{t('outside.eventsDesc')}</p>
      <label className="field">
        <span>{t('outside.howOften')}</span>
        <select value={events.frequency} onChange={(e) => saveEvents({ frequency: e.target.value as EventFrequency })}>
          {FREQUENCIES.map(([f, label]) => (
            <option key={f} value={f}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="toggle block">
        <input type="checkbox" checked={events.calm} onChange={(e) => saveEvents({ calm: e.target.checked })} />
        <span>
          <b>{t('outside.keepCalm')}</b>: {t('outside.keepCalmDesc')}
        </span>
      </label>
    </div>
  );
}
