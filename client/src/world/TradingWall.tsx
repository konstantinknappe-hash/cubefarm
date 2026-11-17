// The trading wallboard (docs/trading-wallboard.md): a big wall screen on the trading floor showing MoneyPrint's
// Alpaca paper account from the store (the server reads MoneyPrint; this only draws). The picture is one canvas
// texture repainted when what it shows changes, not per frame; the moving bits are cheap: the ticker strip scrolls
// its texture, the live LED and the chart's last point pulse, and a small rocket flies on a new equity high. They
// all hold still with reduced motion. E (or a click) opens TradingPanel with the same numbers, bigger.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { feedState, peakEquity, TICKER_SYMBOLS, type TradingView } from '../../../shared/trading';
import { t } from '../i18n';
import { useStore } from '../store';
import { reduceMotion } from '../ui/a11y';
import { BLOOM } from './gfx/bloomMarks';
import { useCanvasTexture, useInteractable } from './interact';
import { HALF_D, TRADING_WALL } from './layout';
import { glow } from './materials';
import { chartGeometry, wallRange } from './tradingChart';
import { drawRocket, drawTicker, drawTradingWall, STATE_COLOR, TICKER_PX, WALL_CHART, WALL_PX } from './tradingDraw';
import { Box } from './Toon';

const FRESH_MS = 8000;
const LAUNCH_MS = 2600;
const TICKER_SPEED = 0.025; // texture widths per second

/** What the wall's picture depends on, as one string: equal strings paint the same picture. */
function signature(v: TradingView) {
  const h = v.history.all;
  return JSON.stringify([v.source, v.account, v.positions, v.recent_fills, { ...v.system, last_successful_update: Math.floor((v.system.last_successful_update ?? 0) / 60_000) }, v.error, h.length, h[h.length - 1]?.timestamp ?? 0]);
}

/** Order ids of fills that arrived since the last view (none on the first one), shown highlighted for a while. */
function useFreshFills(v: TradingView) {
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const ids = v.recent_fills.map((f) => f.order_id).join('|');
  useEffect(() => {
    const now = new Set(ids ? ids.split('|') : []);
    const before = seen.current;
    seen.current = now;
    if (!before) return;
    const added = [...now].filter((id) => !before.has(id));
    if (!added.length) return;
    setFresh(new Set(added));
    const timer = setTimeout(() => setFresh(new Set()), FRESH_MS);
    return () => clearTimeout(timer);
  }, [ids]);
  return fresh;
}

/** True for a moment when equity tops every earlier reading (not on the first view). */
function useNewHigh(v: TradingView) {
  const peak = useRef<number | null | undefined>(undefined);
  const [at, setAt] = useState(0);
  const equity = v.account.equity;
  const live = v.state === 'live' || v.state === 'mock';
  useEffect(() => {
    const before = peak.current;
    const all = peakEquity(v.history.all);
    peak.current = Math.max(all ?? -Infinity, equity ?? -Infinity, before ?? -Infinity);
    if (before === undefined || before === null || !Number.isFinite(before)) return;
    if (live && equity !== null && equity > before) setAt(performance.now());
  }, [equity, v.history.all, live]);
  return at;
}

/** A small rocket that rises across the screen, fading, after a new high. */
function LaunchRocket({ at }: { at: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const tex = useCanvasTexture(128, 128, (ctx) => drawRocket(ctx, 64, 64, 96), []);
  const s = TRADING_WALL;
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const k = (performance.now() - at) / LAUNCH_MS;
    m.visible = at > 0 && k >= 0 && k < 1 && !reduceMotion();
    if (!m.visible) return;
    m.position.set(-s.w * 0.3 + k * s.w * 0.55, -s.h * 0.25 + k * s.h * 0.6, s.depth + 0.02);
    (m.material as THREE.MeshBasicMaterial).opacity = Math.min(1, (1 - k) * 2.5);
  });
  return (
    <mesh ref={ref} visible={false}>
      <planeGeometry args={[0.36, 0.36]} />
      <meshBasicMaterial map={tex} transparent toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

export function TradingWall() {
  const v = useStore((s) => s.trading);
  // feedState turns a quiet "live" stale: check every few seconds, repaint only when it flips
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);
  const state = feedState(v, clock);
  const range = wallRange(v);
  const fresh = useFreshFills(v);
  const freshKey = [...fresh].join('|');
  const highAt = useNewHigh(v);
  const sig = useMemo(() => signature(v), [v]);
  const now = v.fetchedAt ?? clock;
  const stampMinute = Math.floor(now / 60_000);

  const tex = useCanvasTexture(WALL_PX[0], WALL_PX[1], (ctx) => drawTradingWall(ctx, WALL_PX[0], WALL_PX[1], v, { now, range, fresh }), [sig, state, range, freshKey, stampMinute]);
  const quoteSig = JSON.stringify(v.market_quotes);
  const tickerTex = useCanvasTexture(TICKER_PX[0], TICKER_PX[1], (ctx) => drawTicker(ctx, TICKER_PX[0], TICKER_PX[1], v.market_quotes, TICKER_SYMBOLS, v.source === 'mock', Date.now()), [quoteSig, v.source]);
  useEffect(() => {
    tickerTex.wrapS = THREE.RepeatWrapping;
    tickerTex.needsUpdate = true;
  }, [tickerTex]);

  const ref = useInteractable<THREE.Group>({ id: 'trading-wall', label: t('trading.open'), action: { kind: 'trading' } }, 7);

  // where the chart's last reading sits on the screen, for its pulsing dot
  const s = TRADING_WALL;
  const picH = s.h - s.ticker;
  const last = useMemo(() => {
    const g = chartGeometry(v.history[range], range, now, { x: WALL_CHART.x + 10, y: WALL_CHART.y + 60, w: WALL_CHART.w - 150, h: WALL_CHART.h - 110 });
    return g.last ? { x: (g.last.x / WALL_PX[0] - 0.5) * s.w, y: s.h / 2 - (g.last.y / WALL_PX[1]) * picH } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, range, stampMinute]);

  const led = useRef<THREE.Mesh>(null);
  const dot = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    const calm = reduceMotion();
    if (!calm) tickerTex.offset.x = (tickerTex.offset.x + dt * TICKER_SPEED) % 1;
    const pulse = calm ? 1 : 0.75 + 0.25 * Math.sin(performance.now() / 380);
    led.current?.scale.setScalar(state === 'live' || state === 'mock' ? pulse : 1);
    dot.current?.scale.setScalar(calm ? 1 : 0.8 + 0.4 * Math.abs(Math.sin(performance.now() / 600)));
  });

  const outerW = s.w + s.bezel * 2;
  const outerH = s.h + s.bezel * 2;
  return (
    <group ref={ref} position={[s.x, s.y, -HALF_D]}>
      {/* the case: a thin dark bezel with a faint neon edge */}
      <mesh position={[0, 0, 0.01]} material={glow('#3b2f6b')}>
        <planeGeometry args={[outerW + 0.05, outerH + 0.05]} />
      </mesh>
      <Box size={[outerW, outerH, s.depth]} position={[0, 0, s.depth / 2]} color="#121722" outline shadow={false} />
      <mesh position={[0, s.ticker / 2, s.depth + 0.002]}>
        <planeGeometry args={[s.w, picH]} />
        <meshBasicMaterial map={tex} toneMapped={false} userData={BLOOM} />
      </mesh>
      <mesh position={[0, -s.h / 2 + s.ticker / 2, s.depth + 0.002]}>
        <planeGeometry args={[s.w, s.ticker]} />
        <meshBasicMaterial map={tickerTex} toneMapped={false} />
      </mesh>
      {last && (
        <mesh ref={dot} position={[last.x, last.y, s.depth + 0.006]} material={glow('#38d6ff')}>
          <circleGeometry args={[0.022, 16]} />
        </mesh>
      )}
      <mesh ref={led} position={[s.w / 2 - 0.05, -s.h / 2 - s.bezel / 2, s.depth + 0.002]} material={glow(STATE_COLOR[state])}>
        <circleGeometry args={[0.02, 12]} />
      </mesh>
      <LaunchRocket at={highAt} />
    </group>
  );
}
