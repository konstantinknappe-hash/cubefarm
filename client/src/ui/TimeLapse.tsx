import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { api } from '../api';
import { useStore } from '../store';
import { currentPresence, replayDay, seekReplay, setReplaySpeed, startReplay, stopReplay, toggleReplay, useReplay } from '../replay';
import { SPEEDS, sinceLastHere, timelineAt } from '../replayClock';
import { dayKey, type JournalDayView, type JournalMark } from '../../../shared/journal';
import { isConfirmOpen } from './Confirm';
import { useT } from '../i18n';
import './timelapse.css';

// The time-lapse's controls: the manager's console tab (pick a day or "since I was last here", and a speed) and,
// while it plays, the REPLAY badge, a red frame round the view and the bar with the scrubber. Esc goes back to live.

const hhmm = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const dayLabel = (t: number) => new Date(t).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
const MARK_ICON: Record<JournalMark['kind'], string> = { merge: '🎉', 'needs-human': '🔴', issue: '🆕' };

function size(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const count = (marks: JournalMark[], kind: JournalMark['kind']) => marks.filter((m) => m.kind === kind).length;

/** The marks on a timeline: one icon per merge, needs-you and new issue, placed by time. */
function Marks({ marks, from, to }: { marks: JournalMark[]; from: number; to: number }) {
  return (
    <>
      {marks.slice(0, 400).map((m, i) => (
        <span key={`${m.kind}-${m.repoId}-${m.n}-${i}`} className={`tl-mark tl-mark-${m.kind}`} style={{ left: `${timelineAt(m.t, from, to) * 100}%` }} title={`${hhmm(m.t)} · ${m.label}`}>
          {MARK_ICON[m.kind]}
        </span>
      ))}
    </>
  );
}

function DayRow({ day, speed }: { day: JournalDayView; speed: number }) {
  const t = useT();
  const today = day.day === dayKey(Date.now());
  return (
    <div className="card tl-day">
      <div className="row">
        <div className="grow">
          <b>{today ? t('timelapse.today') : dayLabel(day.from)}</b>{' '}
          <span className="muted small">
            {hhmm(day.from)}–{hhmm(day.to)} · {size(day.bytes)}
          </span>
          <div className="small">
            {t('timelapse.merged', { n: String(count(day.marks, 'merge')) })} · {t('timelapse.needed', { n: String(count(day.marks, 'needs-human')) })} · {t('timelapse.issues', { n: String(count(day.marks, 'issue')) })}
          </div>
        </div>
        <button className="btn btn-small btn-good" onClick={() => void replayDay(day, speed)}>
          {t('timelapse.replay')}
        </button>
      </div>
      <div className="tl-track tl-track-mini" aria-hidden>
        <Marks marks={day.marks} from={day.from} to={day.to} />
      </div>
    </div>
  );
}

/** The manager's console tab. */
export function TimeLapseTab() {
  const t = useT();
  const demo = useStore((s) => s.demo);
  const [days, setDays] = useState<JournalDayView[] | null>(null);
  const [speed, setSpeed] = useState(useReplay.getState().speed);
  const [making, setMaking] = useState(false);
  const load = () =>
    api
      .journalDays()
      .then(setDays)
      .catch(() => setDays([]));
  useEffect(() => {
    void load();
  }, []);
  const pick = (s: number) => {
    setSpeed(s);
    setReplaySpeed(s);
  };

  const SPEED_NOTE: Record<number, string> = {
    30: t('timelapse.speedNote.30'),
    120: t('timelapse.speedNote.120'),
    600: t('timelapse.speedNote.600'),
  };

  const ago = (ms: number) => {
    const min = Math.round(ms / 60_000);
    if (min < 60) return t('timelapse.minAgo', { min: String(min) });
    const h = Math.floor(min / 60);
    if (h < 24) return min % 60 ? t('timelapse.hmAgo', { h: String(h), min: String(min % 60) }) : t('timelapse.hAgo', { h: String(h) });
    return t('timelapse.daysAgo', { count: Math.floor(h / 24) });
  };

  const recorded = days?.length ? { from: days[0].from, to: days[days.length - 1].to } : null;
  const away = sinceLastHere(currentPresence(), recorded);
  const sample = () => {
    setMaking(true);
    void api
      .journalSample()
      .then(load)
      .catch(() => undefined)
      .finally(() => setMaking(false));
  };
  return (
    <div className="tab-grid">
      <div>
        <h3 className="section">{t('timelapse.title')}</h3>
        <p className="muted small">{t('timelapse.desc')}</p>
        <div className="card tl-since">
          <div className="row">
            <div className="grow">
              <b>{t('timelapse.sinceTitle')}</b>
              <div className="small muted">
                {away
                  ? t('timelapse.sinceAway', { from: hhmm(away.from), to: hhmm(away.to), ago: ago(Date.now() - away.from) })
                  : t('timelapse.sinceNothing')}
              </div>
            </div>
            <button className="btn btn-good" disabled={!away} onClick={() => away && void startReplay({ ...away, label: t('timelapse.sinceTitle').toLowerCase(), speed, marks: days ? days.flatMap((d) => d.marks).filter((m) => m.t >= away.from && m.t <= away.to) : undefined })}>
              {t('timelapse.catchUp')}
            </button>
          </div>
        </div>
        {days === null && <p className="muted">{t('timelapse.loading')}</p>}
        {days?.length === 0 && <p className="muted">{t('timelapse.nothing')}</p>}
        {[...(days ?? [])].reverse().map((d) => (
          <DayRow key={d.day} day={d} speed={speed} />
        ))}
      </div>
      <div className="card">
        <h3>{t('timelapse.speed')}</h3>
        <div className="tl-speeds" role="radiogroup" aria-label={t('timelapse.speedAria')}>
          {SPEEDS.map((s) => (
            <label key={s} className="toggle">
              <input type="radio" name="tl-speed" checked={speed === s} onChange={() => pick(s)} /> <b>{s}×</b> <span className="muted small">{SPEED_NOTE[s]}</span>
            </label>
          ))}
        </div>
        <h3>{t('timelapse.while')}</h3>
        <p className="small">
          {t('help.locale') === 'de' ? (
            <>
              Das Büro zeigt den aufgezeichneten Moment statt des Live-Zustands, bis hin zum Himmel und den Uhren. Zuweisen, Nachrichten und Mergen sind deaktiviert. Entlang der Timeline ziehen zum Springen: 🎉 Merges, 🔴 PRs die dich brauchten, 🆕 neue Aufgaben.{' '}
              <kbd>Esc</kbd> gibt die Maus frei, und <kbd>Esc</kbd> nochmal geht direkt zum Live-Büro zurück.
            </>
          ) : (
            <>
              The office shows the recorded moment instead of the live one, down to the sky and the clocks. Assigning, messaging and merging are off. Drag along the timeline to jump: 🎉 merges, 🔴 PRs that needed you, 🆕 new issues.{' '}
              <kbd>Esc</kbd> frees the mouse, and <kbd>Esc</kbd> again goes straight back to the live office.
            </>
          )}
        </p>
        <p className="muted small">{t('timelapse.journalNote')}</p>
        {demo && (
          <button className="btn btn-small" disabled={making} onClick={sample} title="Writes a made-up working day on these floors as yesterday's journal">
            🧪 {making ? t('timelapse.making') : t('timelapse.sample')}
          </button>
        )}
      </div>
    </div>
  );
}

/** The timeline while it plays: marks, the playhead, and click or drag to jump. */
function Scrubber() {
  const t = useT();
  const { from, to, time, marks } = useReplay();
  const track = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const at = (e: ReactPointerEvent) => {
    const r = track.current!.getBoundingClientRect();
    return from + Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * (to - from);
  };
  const shown = drag ?? time;
  return (
    <div
      ref={track}
      className="tl-track tl-scrub"
      role="slider"
      tabIndex={0}
      aria-label={t('timelapse.timelineAria')}
      aria-valuemin={from}
      aria-valuemax={to}
      aria-valuenow={Math.round(shown)}
      aria-valuetext={hhmm(shown)}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag(at(e));
      }}
      onPointerMove={(e) => drag !== null && setDrag(at(e))}
      onPointerUp={(e) => {
        if (drag === null) return;
        setDrag(null);
        seekReplay(at(e));
      }}
      onKeyDown={(e) => {
        const step = (to - from) / 50;
        if (e.key === 'ArrowRight') seekReplay(time + step);
        if (e.key === 'ArrowLeft') seekReplay(time - step);
      }}
    >
      <div className="tl-fill" style={{ width: `${timelineAt(shown, from, to) * 100}%` }} />
      <Marks marks={marks} from={from} to={to} />
      <div className="tl-head" style={{ left: `${timelineAt(shown, from, to) * 100}%` }}>
        {drag !== null && <span className="tl-tip">{hhmm(drag)}</span>}
      </div>
    </div>
  );
}

/** While the time-lapse plays: the badge, the frame and the control bar. Esc (mouse free, no panel open) stops it. */
export function ReplayBar() {
  const t = useT();
  const replaying = useStore((s) => s.replaying);
  const v = useReplay();
  // Pocket mode has no 3D office to replay in: leaving the office (switching to it) goes back to live.
  useEffect(() => stopReplay, []);
  useEffect(() => {
    if (!replaying) return;
    // With the mouse captured, the browser takes Esc to free it (some browsers still pass the key on, just after).
    let freedAt = -Infinity;
    const onLock = () => {
      if (!document.pointerLockElement) freedAt = performance.now();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // A panel or dialog closes first, and the Esc that frees the mouse only frees it.
      if (useStore.getState().overlay || isConfirmOpen() || document.pointerLockElement || performance.now() - freedAt < 250) return;
      e.preventDefault();
      stopReplay();
    };
    document.addEventListener('pointerlockchange', onLock);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerlockchange', onLock);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [replaying]);
  if (!replaying) return null;
  const loading = v.phase === 'loading';
  return (
    <div className="replay">
      <div className="replay-frame" aria-hidden />
      <div className="replay-badge" role="status" aria-live="polite">
        ▶ {t('timelapse.badge')} · {hhmm(v.time)}
        <span className="replay-sub">
          {dayLabel(v.time)} · {v.speed}×{v.label ? ` · ${v.label}` : ''}
        </span>
      </div>
      <div className="replay-bar">
        <button className="btn btn-small replay-play" onClick={toggleReplay} disabled={loading} aria-label={v.phase === 'playing' ? t('timelapse.pause') : t('timelapse.play')} title={v.phase === 'ended' ? t('timelapse.playAgain') : `${t('timelapse.play')} / ${t('timelapse.pause')}`}>
          {v.phase === 'playing' ? '⏸' : v.phase === 'ended' ? '↺' : '▶'}
        </button>
        <span className="replay-time small">{hhmm(v.from)}</span>
        <Scrubber />
        <span className="replay-time small">{hhmm(v.to)}</span>
        <div className="replay-speeds" role="group" aria-label={t('timelapse.speed')}>
          {SPEEDS.map((s) => (
            <button key={s} className={`btn btn-small ${v.speed === s ? 'btn-good' : 'btn-ghost'}`} aria-pressed={v.speed === s} onClick={() => setReplaySpeed(s)}>
              {s}×
            </button>
          ))}
        </div>
        <button className="btn btn-small" onClick={stopReplay} title={t('timelapse.backLive')}>
          {t('timelapse.live')} <kbd>Esc</kbd>
        </button>
        {(loading || v.phase === 'error' || v.phase === 'ended') && (
          <div className={`replay-note small ${v.phase === 'error' ? 'replay-note-bad' : ''}`}>
            {loading ? t('timelapse.loadingNote') : v.phase === 'error' ? t('timelapse.error', { error: v.error ?? '' }) : t('timelapse.ended')}
          </div>
        )}
      </div>
    </div>
  );
}
