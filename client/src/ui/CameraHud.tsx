import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import { useStore } from '../store';
import { enterBuilding, enterOverview, exitView, rotateView, useCameraView, visitFloor } from '../world/camera/rig';
import { watchPads } from '../world/gamepad';
import { useLookPrefs } from '../world/look';
import { requestLook } from '../world/Player';
import { keyName } from './controls';
import { Key, MoveKeys } from './Key';

// The camera's HUD: the overview button (on the floor card), the overview's and the building's toolbars (turn, the
// building, back) with what a click would open, the follow cam's banner, and a reticle for the gamepad's A in a view.

/** Back to first person from a click: the click may grab the mouse again (if that setting is on). */
function back() {
  exitView();
  if (useLookPrefs.getState().grabOnClose) requestLook();
}

/** On the floor card: fly up to the overview (the HUD button for Tab). */
export function OverviewButton() {
  const t = useT();
  const onFoot = useCameraView((s) => s.mode) === 'first';
  const started = useStore((s) => s.started);
  const travel = useStore((s) => s.travel);
  if (!started || !onFoot || travel) return null;
  return (
    <button
      className="cam-btn"
      title={t('ui.cam.overviewTitle', { key: keyName('overview') })}
      onClick={(e) => {
        e.currentTarget.blur();
        enterOverview();
      }}
    >
      🗺️ <Key action="overview" />
    </button>
  );
}

export function CameraHud() {
  const t = useT();
  const mode = useCameraView((s) => s.mode);
  const following = useCameraView((s) => s.following);
  const hover = useCameraView((s) => s.hover);
  const started = useStore((s) => s.started);
  const overlay = useStore((s) => s.overlay);
  const floor = useStore((s) => s.floor);
  const [pad, setPad] = useState(false);
  useEffect(() => watchPads((on) => setPad(on)), []);
  if (!started || overlay || mode === 'first') return null;

  if (mode === 'follow') {
    return (
      <div className="cam-follow" role="status">
        🎥 {t('ui.cam.following')} <b>{following}</b> · <MoveKeys joined /> {t('ui.snake.or')} <kbd>Esc</kbd> {t('ui.cam.takeOver')}
        <button className="btn btn-small" onClick={back}>
          ✕ {t('ui.cam.stop')}
        </button>
      </div>
    );
  }

  const tip =
    mode === 'overview' ? t('ui.cam.tipOverview') : t('ui.cam.tipBuilding');
  return (
    <>
      {pad && <div className="crosshair cam-reticle" />}
      <div className="cam-bar" role="toolbar" aria-label={mode === 'overview' ? t('ui.cam.overview') : t('ui.cam.building')}>
        <span className="cam-title">{mode === 'overview' ? `🗺️ ${t('ui.cam.overview')}` : `🏢 ${t('ui.cam.theBuilding')}`}</span>
        {mode === 'overview' ? (
          <>
            <button className="btn btn-small" onClick={() => rotateView(-1)} title={t('ui.cam.left')}>
              ⟲ <Key action="rotateLeft" />
            </button>
            <button className="btn btn-small" onClick={() => rotateView(1)} title={t('ui.cam.right')}>
              ⟳ <Key action="rotateRight" />
            </button>
            <button className="btn btn-small" onClick={() => enterBuilding()} title={t('ui.cam.everyFloor', { key: keyName('overview') })}>
              🏢 {t('ui.cam.building')}
            </button>
          </>
        ) : (
          <button className="btn btn-small" onClick={() => visitFloor(floor)} title={t('ui.cam.backDown')}>
            🗺️ {t('ui.cam.thisFloor')}
          </button>
        )}
        <button className="btn btn-small btn-good" onClick={back} title={t('ui.cam.flyBack')}>
          ✕ {t('ui.cam.back')} <Key action="overview" />
        </button>
      </div>
      <div className="cam-tip">{hover ? t('ui.cam.click', { what: hover }) : tip}</div>
    </>
  );
}
