import { useEffect, useState, useSyncExternalStore } from 'react';
import { SENSITIVITY_MAX, SENSITIVITY_MIN, useLookPrefs } from '../world/look';
import { pad, padName, watchPads } from '../world/gamepad';
import { clearBinding, resetControls, setBinding, setPadSensitivity, useControls } from './controls';
import { ACTIONS, PAD_SENSITIVITY_MAX, PAD_SENSITIVITY_MIN, SLOTS, actionDef, exactKeyLabel, findConflicts, keyLabel, type ActionDef, type ActionId } from './keymap';
import { useT } from '../i18n';

// Help → Controls: every key action rebindable (click a key, press the new one), conflicts called out, the mouse's
// sensitivity and invert-Y, the gamepad's sensitivity and button map, and a reset. All saved in this browser.

const GROUPS: ActionDef['group'][] = ['Moving', 'Hands', 'Office', 'Overview'];

function MouseSettings() {
  const t = useT();
  const { sensitivity, invertY, grabOnClose, set } = useLookPrefs();
  return (
    <div className="mouse-settings">
      <label className="mouse-sens">
        <span>{t('controls.mouseSens')}</span>
        <input type="range" min={SENSITIVITY_MIN} max={SENSITIVITY_MAX} step={0.05} value={sensitivity} onChange={(e) => set({ sensitivity: Number(e.target.value) })} />
        <b>{sensitivity.toFixed(2)}×</b>
        {sensitivity !== 1 && (
          <button className="btn btn-ghost btn-small" onClick={() => set({ sensitivity: 1 })}>
            {t('controls.reset')}
          </button>
        )}
      </label>
      <label className="toggle">
        <input type="checkbox" checked={invertY} onChange={(e) => set({ invertY: e.target.checked })} /> {t('controls.invertY')}
      </label>
      <label className="toggle">
        <input type="checkbox" checked={grabOnClose} onChange={(e) => set({ grabOnClose: e.target.checked })} /> {t('controls.grabOnClose')}
      </label>
    </div>
  );
}

// The pad's state is read once a frame (Player.tsx): look again just after a plug event, and now and then.
function subscribePads(cb: () => void) {
  const off = watchPads(() => setTimeout(cb, 100));
  const t = setInterval(cb, 1000);
  return () => {
    off();
    clearInterval(t);
  };
}

/** The pad that's plugged in, or null. */
const padNow = () => (pad.connected ? padName(pad.id) : null);

function GamepadSettings() {
  const t = useT();
  const sens = useControls((s) => s.padSensitivity);
  const name = useSyncExternalStore(subscribePads, padNow);
  return (
    <div className="mouse-settings">
      <div className="pad-status">{name ? t('controls.padConnected', { name }) : t('controls.padNone')}</div>
      <label className="mouse-sens">
        <span>{t('controls.padSens')}</span>
        <input type="range" min={PAD_SENSITIVITY_MIN} max={PAD_SENSITIVITY_MAX} step={0.05} value={sens} onChange={(e) => setPadSensitivity(Number(e.target.value))} />
        <b>{sens.toFixed(2)}×</b>
      </label>
      <p className="muted small pad-map">{t('controls.padMap')}</p>
    </div>
  );
}

export function ControlsSettings() {
  const t = useT();
  const b = useControls((s) => s.bindings);
  const [listen, setListen] = useState<{ action: ActionId; slot: number } | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const groupLabel = (g: ActionDef['group']) => {
    if (g === 'Moving') return t('controls.group.moving');
    if (g === 'Hands') return t('controls.group.hands');
    if (g === 'Office') return t('controls.group.office');
    return t('controls.group.overview');
  };

  // Waiting for a key: it's caught before the office (or the panel's Esc) sees it.
  useEffect(() => {
    if (!listen) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.code === 'Escape') return setListen(null);
      const r = setBinding(listen.action, listen.slot, e.code);
      if (!r) return setNote(t('controls.cantBind', { key: keyLabel(e.code) }));
      const what = actionDef(listen.action).label;
      const moved = r.displaced?.key ? t('controls.movedTo', { key: keyLabel(r.displaced.key) }) : t('controls.noKeyNow');
      setNote(
        t('controls.reboundNow', { key: keyLabel(e.code), what }) +
          (r.displaced ? ' ' + t('controls.rebound', { prev: actionDef(r.displaced.action).label, moved }) : ''),
      );
      setListen(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [listen, t]);

  const conflicts = findConflicts(b);
  const clash = new Set(conflicts.flatMap((c) => c.actions.map((a) => `${a}|${c.code}`)));
  const reset = () => {
    resetControls();
    useLookPrefs.getState().set({ sensitivity: 1, invertY: false, grabOnClose: true });
    setListen(null);
    setNote(t('controls.resetDone'));
  };

  return (
    <div className="controls">
      <p className="muted small">{t('controls.help')}</p>
      {GROUPS.map((g) => (
        <div key={g} className="controls-group">
          <h3>{groupLabel(g)}</h3>
          <div className="controls-table" role="table" aria-label={t('controls.tableAria', { group: groupLabel(g) })}>
            {ACTIONS.filter((a) => a.group === g).map((a) => (
              <div key={a.id} className="controls-row" role="row">
                <span role="cell" className="controls-name">
                  {a.label}
                </span>
                {Array.from({ length: SLOTS }, (_, slot) => {
                  const code = b[a.id][slot];
                  const waiting = listen?.action === a.id && listen.slot === slot;
                  const slotName = slot ? t('controls.keySlotOther') : t('controls.keySlotMain');
                  return (
                    <span key={slot} role="cell" className="controls-slot">
                      <button
                        className={`key-btn ${waiting ? 'key-btn-wait' : ''} ${code && clash.has(`${a.id}|${code}`) ? 'key-btn-clash' : ''} ${!code ? 'key-btn-empty' : ''}`}
                        aria-label={t('controls.keyAria', { action: a.label, slot: slotName, code: code ? exactKeyLabel(code) : t('controls.keyNone') })}
                        onClick={(e) => {
                          e.currentTarget.blur();
                          setNote(null);
                          setListen(waiting ? null : { action: a.id, slot });
                        }}
                      >
                        {waiting ? t('controls.pressKey') : code ? exactKeyLabel(code) : slot ? '+' : '—'}
                      </button>
                      {code && slot > 0 && (
                        <button className="key-clear" title={t('controls.removeKey')} aria-label={t('controls.removeAria', { key: exactKeyLabel(code), action: a.label })} onClick={() => clearBinding(a.id, slot)}>
                          ✕
                        </button>
                      )}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ))}
      {note && (
        <p className="controls-note" role="status">
          {note}
        </p>
      )}
      {conflicts.length > 0 && (
        <p className="controls-clash" role="alert">
          ⚠️ {conflicts.map((c) => t('controls.conflict', { key: keyLabel(c.code), a: actionDef(c.actions[0]).label, b: actionDef(c.actions[1]).label })).join('; ')}. {t('controls.conflictNote')}
        </p>
      )}
      <h3>{t('controls.mouse')}</h3>
      <MouseSettings />
      <h3>{t('controls.gamepad')}</h3>
      <GamepadSettings />
      <div className="controls-reset">
        <button className="btn btn-small" onClick={reset}>
          {t('controls.resetAll')}
        </button>
      </div>
    </div>
  );
}
