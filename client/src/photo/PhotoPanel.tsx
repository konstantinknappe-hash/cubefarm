import { TranslatedLabel } from '../ui/TranslatedLabel';
// Photo mode's panel (lazy, shown instead of the HUD): freeze, camera, depth of field, filters, overlays, time of
// day, shots, clips, instant replay and the gallery, plus the overlay preview drawn over the 3D view.
import { useEffect, useRef, useState } from 'react';
import { t as tr } from '../i18n';
import { repoOnFloor, useStore } from '../store';
import { bodyState } from '../world/people';
import { FILTER_LABELS, FILTERS } from './filters';
import { FOV_MAX, FOV_MIN, ROLL_MAX } from './flight';
import { removeFromGallery, saveItem, useGallery, type GalleryItem } from './gallery';
import { setReplay, usePhotoGate } from './gate';
import { drawOverlay } from './overlay';
import {
  cam,
  CLIP_SECONDS,
  focusCenter,
  GOLDEN_HOUR,
  leave,
  overlayOptions,
  requestFrame,
  setDaytime,
  setFrozen,
  takeShot,
  toggleRecording,
  update,
  usePhoto,
  type OrbitTarget,
} from './photoMode';
import { clockTime, formatBytes, SCALES, shotSize } from './shots';
import { useDayTime } from '../world/sky/useDayTime';
import { Key, MoveKeys } from '../ui/Key';
import './photo.css';

/** The overlay as it will be saved, plus the thirds guides, over the live view. */
function Preview() {
  const ref = useRef<HTMLCanvasElement>(null);
  const s = usePhoto();
  const floor = useStore((st) => st.floor);
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(size.w * dpr);
    c.height = Math.round(size.h * dpr);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    drawOverlay(ctx, c.width, c.height, overlayOptions(true));
  }, [s.filter, s.stamp, s.caption, s.guides, size, floor]);
  return <canvas ref={ref} className="photo-preview" aria-hidden="true" />;
}

function Recording() {
  const rec = usePhoto((s) => s.recording);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!rec) return;
    const t = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, [rec]);
  if (!rec) return null;
  const secs = Math.min(rec.limit, (performance.now() - rec.started) / 1000);
  const fmt = (n: number) => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
  return (
    <div className="photo-rec" role="status">
      <span className="photo-rec-dot" /> {tr('ui.photo.rec')} {fmt(secs)} / {fmt(rec.limit)}
      <button className="btn btn-small" onClick={() => void toggleRecording()}>
        ■ {tr('ui.cam.stop')} <kbd>V</kbd>
      </button>
    </div>
  );
}

function Thumb({ item }: { item: GalleryItem }) {
  if (item.kind === 'shot') return <img src={item.thumb ?? item.url} alt="" />;
  return <video src={item.url} muted preload="metadata" />;
}

function Gallery() {
  const items = useGallery((s) => s.items);
  const total = items.reduce((n, i) => n + i.bytes, 0);
  return (
    <section className="photo-section">
      <h4>
        {tr('ui.photo.gallery')} <span className="muted small">{items.length ? tr('ui.photo.galleryMeta', { n: items.length, size: formatBytes(total) }) : tr('ui.photo.empty')}</span>
      </h4>
      {items.length > 0 && (
        <ul className="photo-gallery">
          {[...items].reverse().map((i) => (
            <li key={i.id} title={i.name}>
              <Thumb item={i} />
              <div className="photo-gallery-meta">
                <span>{i.kind === 'shot' ? `📸 ${i.width}×${i.height}` : `${i.kind === 'replay' ? '⏪' : '🎬'} ${Math.round(i.seconds ?? 0)} s`}</span>
                <span className="muted">{formatBytes(i.bytes)}</span>
              </div>
              <div className="photo-gallery-actions">
                <button className="btn btn-ghost btn-small" onClick={() => saveItem(i)} aria-label={tr('ui.photo.download', { name: i.name })}>
                  ⬇
                </button>
                <button className="btn btn-ghost btn-small" onClick={() => removeFromGallery(i.id)} aria-label={tr('ui.photo.delete', { name: i.name })}>
                  🗑
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** FOV and roll change every frame from the keys and the wheel, so the sliders read the camera a few times a second. */
function useCamera() {
  const [v, setV] = useState({ fov: cam.fov, roll: cam.roll });
  useEffect(() => {
    const t = setInterval(() => setV((p) => (p.fov === cam.fov && p.roll === cam.roll ? p : { fov: cam.fov, roll: cam.roll })), 150);
    return () => clearInterval(t);
  }, []);
  return v;
}

export default function PhotoPanel() {
  const s = usePhoto();
  const frozen = usePhotoGate((g) => g.frozen);
  const replay = usePhotoGate((g) => g.replay);
  const toasts = useStore((st) => st.toasts);
  const dismiss = useStore((st) => st.dismissToast);
  const floor = useStore((st) => st.floor);
  const repo = useStore((st) => (st.floor === 0 ? null : repoOnFloor(st.repos, st.floor)));
  const agents = useStore((st) => st.agents);
  const { fov, roll } = useCamera();
  const people = Object.values(agents).filter((a) => (repo ? a.repoId === repo.id : a.role === 'ceo') && bodyState(a.id));
  const size = shotSize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1, s.scale);
  const sky = useDayTime().t;
  const t = s.daytime ?? sky;

  return (
    <>
      <Preview />
      <Recording />
      {!s.panel ? (
        <button className="photo-show" onClick={() => update({ panel: true })}>
          📷 <kbd>H</kbd> {tr('ui.photo.showPanel')}
        </button>
      ) : (
        <aside className="photo-panel" aria-label={tr('ui.photo.mode')}>
          <header className="photo-head">
            <b>📷 {tr('ui.photo.mode')}</b>
            <button className="btn btn-small" onClick={leave} title={tr('ui.photo.leaveTitle')}>
              {tr('ui.photo.leave')} <Key action="photo" />
            </button>
          </header>
          {s.note && (
            <p className={`photo-note ${s.note.level === 'error' ? 'photo-note-bad' : ''}`} role="status" onClick={() => update({ note: null })}>
              {s.note.text}
            </p>
          )}

          <section className="photo-section">
            <label className="toggle">
              <input type="checkbox" checked={frozen} onChange={(e) => setFrozen(e.target.checked)} /> ❄ {tr('ui.photo.freeze')} <kbd>F</kbd>
            </label>
            <p className="muted small">{frozen ? tr('ui.photo.frozen') : tr('ui.photo.live')}</p>
          </section>

          <section className="photo-section">
            <h4><TranslatedLabel id="camera" /></h4>
            <label className="photo-row">
              <span><TranslatedLabel id="zoom" /></span>
              <input type="range" min={FOV_MIN} max={FOV_MAX} step={1} value={Math.round(fov)} onChange={(e) => ((cam.fov = Number(e.target.value)), requestFrame())} aria-label={tr('ui.photo.fov')} />
              <b>{Math.round(fov)}°</b>
            </label>
            <label className="photo-row">
              <span><TranslatedLabel id="roll" /></span>
              <input
                type="range"
                min={-45}
                max={45}
                step={1}
                value={Math.round((roll * 180) / Math.PI)}
                onChange={(e) => ((cam.roll = Math.max(-ROLL_MAX, Math.min(ROLL_MAX, (Number(e.target.value) * Math.PI) / 180))), requestFrame())}
                aria-label={tr('ui.photo.roll')}
              />
              <b>{Math.round((roll * 180) / Math.PI)}°</b>
            </label>
            <label className="toggle">
              <input type="checkbox" checked={s.dof} onChange={(e) => update({ dof: e.target.checked })} /> {tr('ui.photo.dof')}
            </label>
            {s.dof && (
              <>
                <label className="photo-row">
                  <span><TranslatedLabel id="focus" /></span>
                  <input type="range" min={0.3} max={40} step={0.1} value={s.focus} onChange={(e) => update({ focus: Number(e.target.value) })} aria-label={tr('ui.photo.focusDistance')} />
                  <b>{s.focus.toFixed(1)} m</b>
                </label>
                <label className="photo-row">
                  <span><TranslatedLabel id="blur" /></span>
                  <input type="range" min={0} max={1} step={0.05} value={s.blur} onChange={(e) => update({ blur: Number(e.target.value) })} aria-label={tr('ui.photo.blurStrength')} />
                  <b>{Math.round(s.blur * 100)}%</b>
                </label>
              </>
            )}
            <button className="btn btn-ghost btn-small" onClick={() => focusCenter()}>
              ◎ {tr('ui.photo.focusMiddle')} <kbd>T</kbd>
            </button>
          </section>

          <section className="photo-section">
            <h4><TranslatedLabel id="filter" /></h4>
            <div className="photo-chips" role="radiogroup" aria-label={tr('uiExtra.filter')}>
              {FILTERS.map((f) => (
                <button key={f} role="radio" aria-checked={s.filter === f} className={`photo-chip ${s.filter === f ? 'on' : ''}`} onClick={() => update({ filter: f })}>
                  {FILTER_LABELS[f]}
                </button>
              ))}
            </div>
            <div className="photo-checks">
              <label className="toggle">
                <input type="checkbox" checked={s.stamp} onChange={(e) => update({ stamp: e.target.checked })} /> {tr('ui.photo.stamp')}
              </label>
              <label className="toggle">
                <input type="checkbox" checked={s.caption} onChange={(e) => update({ caption: e.target.checked })} /> {tr('ui.photo.caption')}
              </label>
              <label className="toggle">
                <input type="checkbox" checked={s.guides} onChange={(e) => update({ guides: e.target.checked })} /> {tr('ui.photo.guides')}
              </label>
            </div>
          </section>

          <section className="photo-section">
            <h4>
              {tr('ui.photo.timeOfDay')} <span className="muted small">{clockTime(t)}</span>
            </h4>
            <input type="range" min={0} max={1} step={0.002} value={t} onChange={(e) => setDaytime(Number(e.target.value))} aria-label={tr('ui.photo.timeOfDay')} aria-valuetext={clockTime(t)} />
            <div className="row wrap">
              <button className="btn btn-ghost btn-small" onClick={() => setDaytime(GOLDEN_HOUR)}>
                🌇 {tr('ui.photo.golden')}
              </button>
              <button className="btn btn-ghost btn-small" onClick={() => setDaytime(0.5)}>
                ☀️ {tr('ui.photo.noon')}
              </button>
              <button className="btn btn-ghost btn-small" onClick={() => setDaytime(0.79)}>
                🌆 {tr('ui.photo.blue')}
              </button>
              <button className="btn btn-ghost btn-small" onClick={() => setDaytime(null)} disabled={s.daytime === null}>
                ↺ {tr('ui.photo.asItIs')}
              </button>
            </div>
          </section>

          <section className="photo-section">
            <h4><TranslatedLabel id="shot" /></h4>
            <div className="photo-chips" role="radiogroup" aria-label={tr('ui.photo.shotSize')}>
              {SCALES.map((k) => (
                <button key={k} role="radio" aria-checked={s.scale === k} className={`photo-chip ${s.scale === k ? 'on' : ''}`} onClick={() => update({ scale: k })}>
                  {k}×
                </button>
              ))}
              <span className="muted small">
                {size.width}×{size.height}
              </span>
            </div>
            <button className="btn photo-big" disabled={!!s.busy} onClick={() => void takeShot()}>
              📸 {s.busy === 'Developing…' ? tr('ui.photo.developing') : tr('ui.photo.take')} <kbd>Enter</kbd>
            </button>
            <p className="muted small">{tr('ui.photo.saves')}</p>
          </section>

          <section className="photo-section">
            <h4><TranslatedLabel id="clip" /></h4>
            <div className="photo-chips">
              {CLIP_SECONDS.map((n) => (
                <button key={n} className={`photo-chip ${s.clipSeconds === n ? 'on' : ''}`} aria-pressed={s.clipSeconds === n} onClick={() => update({ clipSeconds: n })}>
                  {n} s
                </button>
              ))}
              {([30, 60] as const).map((n) => (
                <button key={n} className={`photo-chip ${s.fps === n ? 'on' : ''}`} aria-pressed={s.fps === n} onClick={() => update({ fps: n })}>
                  {n} fps
                </button>
              ))}
            </div>
            <label className="photo-row">
              <span><TranslatedLabel id="camera" /></span>
              <select value={s.orbit} onChange={(e) => update({ orbit: e.target.value as OrbitTarget })} aria-label={tr('ui.photo.orbitAria')}>
                <option value="free">{tr('ui.photo.free')}</option>
                {floor !== 0 && <option value="gong"><TranslatedLabel id="orbitGong" /></option>}
                {floor !== 0 && <option value="board"><TranslatedLabel id="orbitBoard" /></option>}
                {people.map((a) => (
                  <option key={a.id} value={`person:${a.id}`}>
                    {tr('ui.photo.orbit', { name: a.name })}
                  </option>
                ))}
              </select>
            </label>
            <button className={`btn photo-big ${s.recording ? 'photo-recording' : ''}`} disabled={!s.recording && !!s.busy} onClick={() => void toggleRecording()}>
              {s.recording ? tr('ui.photo.stopRec') : s.busy === 'Saving the clip…' ? tr('ui.photo.savingClip') : tr('ui.photo.record')} <kbd>V</kbd>
            </button>
            <p className="muted small">{tr('ui.photo.webm')}{frozen ? tr('ui.photo.webmFrozen') : ''}.</p>
          </section>

          <section className="photo-section">
            <h4><TranslatedLabel id="replay" /></h4>
            <label className="toggle">
              <input type="checkbox" checked={replay} onChange={(e) => setReplay(e.target.checked)} /> {tr('ui.photo.keep')}
            </label>
            <p className="muted small">
              {tr('ui.photo.press')} <Key action="saveReplay" /> {tr('ui.photo.keepHint')}
            </p>
          </section>

          <Gallery />

          <p className="photo-keys muted small">
            {tr('ui.photo.kSteer')} · <MoveKeys joined /> {tr('ui.photo.kFly')} · <kbd>Space</kbd>/<kbd>C</kbd> {tr('ui.photo.kUpDown')} · <Key action="run" /> {tr('ui.photo.kFaster')} · <Key action="rotateLeft" />/<Key action="rotateRight" /> {tr('ui.photo.kRoll')} ·{' '}
            <kbd>R</kbd> {tr('ui.photo.kReset')} · <kbd>H</kbd> {tr('ui.photo.kHide')} · <kbd>Esc</kbd> {tr('ui.photo.kEsc')}
          </p>
        </aside>
      )}
      <div className="toasts photo-toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.level}`} onClick={() => dismiss(t.id)}>
            {t.text}
          </div>
        ))}
      </div>
    </>
  );
}
