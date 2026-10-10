// Settings → Accessibility: captions, colour-blind-safe status, motion comfort, UI scale and readability, and how to
// use the office by keyboard. Everything is saved in this browser (a11y.ts) and applies at once. In pocket mode the
// 3D-only parts (motion, the field of view) are left out.
import { useId, type ReactNode } from 'react';
import { useStore } from '../store';
import { Key } from './Key';
import { resetA11y, setA11y, useA11y } from './a11y';
import { DEFAULT_A11Y, LIMITS, reducesMotion, showsShapes, type A11yPrefs, type ReduceMotion } from './a11yPrefs';
import { KIND_ICON, KIND_WORD, kindStrong, PALETTE_LABELS, PALETTES, STATUS_KINDS, type Palette } from './statusLook';
import { useT } from '../i18n';

function Toggle({ k, children, hint, disabled }: { k: 'captions' | 'statusShapes' | 'headBob' | 'cameraShake' | 'centerDot' | 'readableFont' | 'highContrast'; children: ReactNode; hint?: string; disabled?: boolean }) {
  const on = useA11y((s) => s.prefs[k]);
  const hintId = useId();
  return (
    <label className="toggle block">
      <input type="checkbox" checked={on || !!disabled} disabled={disabled} onChange={(e) => setA11y({ [k]: e.target.checked })} aria-describedby={hint ? hintId : undefined} />
      <span>
        <b>{children}</b>
        {hint && (
          <span className="muted small a11y-hint" id={hintId}>
            {' '}
            {hint}
          </span>
        )}
      </span>
    </label>
  );
}

function Slider({ k, label, unit, describe }: { k: 'captionSize' | 'captionBg' | 'fov' | 'uiScale'; label: string; unit: string; describe?: (v: number) => string }) {
  const t = useT();
  const v = useA11y((s) => s.prefs[k]);
  const { min, max, step } = LIMITS[k];
  return (
    <label className="a11y-slider">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={v} aria-valuetext={`${v}${unit}${describe ? `, ${describe(v)}` : ''}`} onChange={(e) => setA11y({ [k]: Number(e.target.value) })} />
      <b>
        {v}
        {unit}
      </b>
      {v !== DEFAULT_A11Y[k] && (
        <button type="button" className="btn btn-ghost btn-small" onClick={() => setA11y({ [k]: DEFAULT_A11Y[k] })} aria-label={t('access.resetAria').replace('{label}', label.toLowerCase())}>
          {t('access.reset')}
        </button>
      )}
    </label>
  );
}

/** Each kind of status as it looks now: its colour and shape, and its name. */
function Swatches({ palette, shapes }: { palette: Palette; shapes: boolean }) {
  const t = useT();
  return (
    <ul className="status-swatches" aria-label={t('access.howStatus')}>
      {STATUS_KINDS.map((k) => (
        <li key={k} className={`status-kind status-kind-${k}`} style={{ ['--kind' as string]: kindStrong(k, palette) }}>
          {shapes && <span aria-hidden>{KIND_ICON[k]}</span>} {KIND_WORD[k]}
        </li>
      ))}
    </ul>
  );
}

export function AccessibilitySettings({ pocket = false }: { pocket?: boolean }) {
  const t = useT();
  const prefs = useA11y((s) => s.prefs);
  const systemReduced = useA11y((s) => s.systemReduced);
  const openOverlay = useStore((s) => s.openOverlay);
  const name = useId();
  const shapes = showsShapes(prefs);
  const set = (p: Partial<A11yPrefs>) => setA11y(p);
  const motionLabels: Record<ReduceMotion, string> = {
    system: t('access.motion.system'),
    on: t('access.motion.on'),
    off: t('access.motion.off'),
  };
  return (
    <>
      <section className="card a11y-card" aria-labelledby={`${name}-cap`}>
        <h3 id={`${name}-cap`}>{t('access.captions')}</h3>
        <Toggle k="captions" hint={t('access.captionHint')}>
          {t('access.showCaptions')}
        </Toggle>
        <Slider k="captionSize" label={t('access.captionSize')} unit="%" />
        <Slider k="captionBg" label={t('access.captionBg')} unit="%" />
        <div className="captions captions-preview" aria-hidden style={{ ['--caption-scale' as string]: prefs.captionSize / 100, ['--caption-bg' as string]: prefs.captionBg / 100 }}>
          <div className="caption">{t('ui.cap.gong')} ↗</div>
          <div className="caption caption-speech">
            <b>CEO:</b> {t('ui.access.sample')}
          </div>
        </div>
      </section>

      <section className="card a11y-card" aria-labelledby={`${name}-col`}>
        <h3 id={`${name}-col`}>{t('access.colorStatus')}</h3>
        <fieldset className="a11y-fieldset">
          <legend>{t('access.statusColors')}</legend>
          {PALETTES.map((p) => (
            <label key={p} className="toggle block">
              <input type="radio" name={`${name}-palette`} checked={prefs.palette === p} onChange={() => set({ palette: p })} /> {PALETTE_LABELS[p]}
            </label>
          ))}
        </fieldset>
        <Toggle k="statusShapes" disabled={prefs.palette !== 'standard'} hint={prefs.palette !== 'standard' ? t('access.shapesAlwaysOn') : t('access.shapesHint')}>
          {t('access.shapesLabel')}
        </Toggle>
        <Swatches palette={prefs.palette} shapes={shapes} />
      </section>

      {!pocket && (
        <section className="card a11y-card" aria-labelledby={`${name}-mot`}>
          <h3 id={`${name}-mot`}>{t('access.motion')}</h3>
          <Slider k="fov" label={t('access.fov')} unit="°" describe={(v) => (v < 72 ? t('access.fovNarrower') : v > 72 ? t('access.fovWider') : t('access.fovNormal'))} />
          <Toggle k="headBob">{t('access.headBob')}</Toggle>
          <Toggle k="cameraShake" hint={t('access.cameraShakeHint')}>
            {t('access.cameraShake')}
          </Toggle>
          <fieldset className="a11y-fieldset">
            <legend>{t('access.reduceMotion')}</legend>
            {(Object.keys(motionLabels) as ReduceMotion[]).map((m) => (
              <label key={m} className="toggle block">
                <input type="radio" name={`${name}-motion`} checked={prefs.reduceMotion === m} onChange={() => set({ reduceMotion: m })} /> {motionLabels[m]}
                {m === 'system' && <span className="muted small">({t('ui.access.yourSystem')} {t(systemReduced ? 'access.motion.systemOn' : 'access.motion.systemOff')})</span>}
              </label>
            ))}
            <p className="muted small">
              {t('access.motion.reduced')}{' '}
              {t(reducesMotion(prefs.reduceMotion, systemReduced) ? 'access.motion.onNow' : 'access.motion.offNow')}
            </p>
          </fieldset>
          <Toggle k="centerDot" hint={t('access.centerDotHint')}>
            {t('access.centerDot')}
          </Toggle>
        </section>
      )}

      <section className="card a11y-card" aria-labelledby={`${name}-read`}>
        <h3 id={`${name}-read`}>{t('access.size')}</h3>
        <Slider k="uiScale" label={t('access.uiScale')} unit="%" />
        <p className="muted small">{t('access.uiScaleHint')}</p>
        <Toggle k="readableFont" hint={t('access.readableFontHint')}>
          {t('access.readableFont')}
        </Toggle>
        <Toggle k="highContrast" hint={t('access.highContrastHint')}>
          {t('access.highContrast')}
        </Toggle>
      </section>

      {!pocket && (
        <section className="card a11y-card" aria-labelledby={`${name}-kb`}>
          <h3 id={`${name}-kb`}>{t('access.keyboard')}</h3>
          {t('help.locale') === 'de' ? (
            <p className="small">
              <Key action="phone" /> öffnet dein Telefon überall: der Tab <b>Unternehmen</b> öffnet die Konsole, Kanban dieser Etage, die Etagenliste, Hilfe und diese Einstellungen. <Key action="help" /> öffnet die Hilfe. In jedem Bereich bewegen <kbd>Tab</kbd> und <kbd>Shift</kbd>+<kbd>Tab</kbd> zwischen Steuerelementen, <kbd>Enter</kbd> oder <kbd>Space</kbd> verwendet eines und <kbd>Esc</kbd> schließt es; der Fokus kehrt zurück. Bildschirmleser hören CEO-Nachrichten und Alarme live.
            </p>
          ) : (
            <p className="small">
              <Key action="phone" /> opens your phone from anywhere: its <b>Company</b> tab opens the console, this floor's Kanban, the floor list, help and these settings. <Key action="help" /> opens help. In any panel,{' '}
              <kbd>Tab</kbd> and <kbd>Shift</kbd>+<kbd>Tab</kbd> move between controls, <kbd>Enter</kbd> or <kbd>Space</kbd> uses one and <kbd>Esc</kbd> closes it; focus goes back where it was.
              Screen readers hear the CEO's messages and alarms as they happen.
            </p>
          )}
          <div className="row wrap">
            <button className="btn btn-small" onClick={() => openOverlay({ kind: 'floorList' })}>
              {t('access.floorListBtn')}
            </button>
          </div>
        </section>
      )}

      <div className="row">
        <button className="btn btn-ghost btn-small" onClick={resetA11y}>
          {t('access.reset')}
        </button>
      </div>
    </>
  );
}
