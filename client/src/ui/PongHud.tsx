import { useEffect, useState, useSyncExternalStore } from 'react';
import { t } from '../../../shared/i18n';
import { PONG_PLAYER } from '../../../shared/pong';
import { useStore } from '../store';
import { Key } from './Key';
import { pongView, subscribePong, type PongView } from '../world/toys/pongState';
import type { PointWhy } from '../world/toys/pongRules';

// Playing ping-pong (a paddle in hand): the score chip at the top of the screen, what's happening, and the controls.

/** What the one who lost the point did, as a phrase after their name. */
const LOST: Record<PointWhy, string> = {
  'serve-fault': 'ui.pong.serveFault',
  net: 'ui.pong.net',
  'own-side': 'ui.pong.ownSide',
  out: 'ui.pong.out',
  missed: 'ui.pong.missed',
  'double-bounce': 'ui.pong.doubleBounce',
};

/** The line under the score: who serves, who won the point and how, or how the game ended. */
export function pongStatus(v: PongView, name: (end: 'west' | 'east') => string, waited: number): string {
  const you = v.you;
  const other = you === 'west' ? 'east' : 'west';
  if (v.phase === 'waiting') {
    if (you && v[other]) return t('ui.pong.onTheWay', { name: name(other) });
    return waited > 20 ? t('ui.pong.nobodyFree') : t('ui.pong.waiting');
  }
  if (v.phase === 'over' && v.last) {
    const w = v.last.winner;
    const score = `${v.score[w]}–${v.score[w === 'west' ? 'east' : 'west']}`;
    return `${w === you ? t('ui.pong.youWin', { score }) : t('ui.pong.wins', { name: name(w), score })}${you ? t('ui.pong.rematch') : ''}`;
  }
  if (v.phase === 'point') {
    if (!v.last) return t('ui.pong.let');
    if (v.last.why === 'game') return '';
    const loser = v.last.winner === 'west' ? 'east' : 'west';
    return `${t(LOST[v.last.why], { who: loser === you ? t('ui.pong.you') : name(loser) })}${v.gamePoint ? t('ui.pong.gamePointAfter') : ''}`;
  }
  if (v.phase === 'serve') {
    const lead = v.gamePoint ? t('ui.pong.gamePointBefore') : '';
    return v.server === you ? `${lead}${t('ui.pong.yourServe')}` : `${lead}${t('ui.pong.toServe', { name: name(v.server) })}`;
  }
  return v.rally >= 3 ? t('ui.pong.rally', { n: v.rally }) : '';
}

export function PongHud() {
  const v = useSyncExternalStore(subscribePong, pongView);
  const agents = useStore((s) => s.agents);
  const [waited, setWaited] = useState(0);
  const waiting = v?.phase === 'waiting';
  useEffect(() => {
    setWaited(0);
    if (!waiting) return;
    const t = setInterval(() => setWaited((w) => w + 1), 1000);
    return () => clearInterval(t);
  }, [waiting]);
  if (!v) return null;
  const name = (end: 'west' | 'east') => {
    const id = v[end];
    return !id ? '…' : id === PONG_PLAYER ? t('ui.pong.you') : (agents[id]?.name ?? '?');
  };
  const left = v.you ?? 'west';
  const right = left === 'west' ? 'east' : 'west';
  const status = pongStatus(v, name, waited);
  return (
    <>
      <div className="hud-pong" aria-live="polite">
        <div className="hud-pong-score">
          <span className={v.server === left && v.phase !== 'over' ? 'hud-pong-serving' : ''}>{name(left)}</span>
          <b>{v.score[left]}</b>
          <i>:</i>
          <b>{v.score[right]}</b>
          <span className={v.server === right && v.phase !== 'over' ? 'hud-pong-serving' : ''}>{name(right)}</span>
        </div>
        {status && <div className="hud-pong-status">{status}</div>}
      </div>
      <div className="hud-hint hud-pong-keys">
        <kbd>{t('ui.pong.mouse')}</kbd> {t('ui.pong.kPaddle')} · {t('ui.pong.kSwing')} · <kbd>{t('ui.held.click')}</kbd> / <Key action="throw" /> {t('ui.pong.kServe')} · <Key action="drop" /> / <kbd>Esc</kbd> {t('ui.pong.kLeave')}
      </div>
    </>
  );
}
