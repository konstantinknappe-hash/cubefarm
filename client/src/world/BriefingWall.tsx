// The desk briefing board (docs/desk-briefing.md): a wall screen on the trading floor's west wall with MoneyPrint's
// CEO briefing (what the desk watches and why, its planned moves and exit plans, the sectors) and the latest question
// to the research team. One canvas texture, repainted only when the briefing changes. E (or a click) opens
// BriefingPanel, where the manager reads everything and asks the team a question.
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import type { BriefingState, BriefingView } from '../../../shared/briefing';
import { t } from '../i18n';
import { useStore } from '../store';
import { BRIEFING_PX, BRIEFING_STATE_COLOR, drawBriefingWall } from './briefingDraw';
import { BLOOM } from './gfx/bloomMarks';
import { useCanvasTexture, useInteractable } from './interact';
import { BRIEFING_WALL, HALF_W } from './layout';
import { glow } from './materials';
import { Box } from './Toon';

/** A live read older than five minutes past its interval reads as stale. */
const STALE_MS = 5 * 60_000 + 60_000;

export function briefingState(v: BriefingView, now: number): BriefingState {
  if (v.state === 'live' && v.fetchedAt !== null && now - v.fetchedAt > STALE_MS) return 'stale';
  return v.state;
}

export function BriefingWall() {
  const v = useStore((s) => s.briefing);
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const state = briefingState(v, clock);
  const sig = useMemo(() => JSON.stringify([v.briefingAt, v.briefing, v.inquiries[0], v.error]), [v]);
  const tex = useCanvasTexture(BRIEFING_PX[0], BRIEFING_PX[1], (ctx) => drawBriefingWall(ctx, BRIEFING_PX[0], BRIEFING_PX[1], v, state), [sig, state]);
  const ref = useInteractable<THREE.Group>({ id: 'briefing-wall', label: t('briefing.open'), action: { kind: 'briefing' } }, 7);
  const s = BRIEFING_WALL;
  const outerW = s.w + s.bezel * 2;
  const outerH = s.h + s.bezel * 2;
  return (
    <group ref={ref} position={[-HALF_W, s.y, s.z]} rotation={[0, Math.PI / 2, 0]}>
      <mesh position={[0, 0, 0.01]} material={glow('#2f4b6b')}>
        <planeGeometry args={[outerW + 0.05, outerH + 0.05]} />
      </mesh>
      <Box size={[outerW, outerH, s.depth]} position={[0, 0, s.depth / 2]} color="#121722" outline shadow={false} />
      <mesh position={[0, 0, s.depth + 0.002]}>
        <planeGeometry args={[s.w, s.h]} />
        <meshBasicMaterial map={tex} toneMapped={false} userData={BLOOM} />
      </mesh>
      <mesh position={[s.w / 2 - 0.05, -s.h / 2 - s.bezel / 2, s.depth + 0.002]} material={glow(BRIEFING_STATE_COLOR[state])}>
        <circleGeometry args={[0.02, 12]} />
      </mesh>
    </group>
  );
}
