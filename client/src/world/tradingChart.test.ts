import { describe, expect, it } from 'vitest';
import { emptyTradingView, type EquityPoint } from '../../../shared/trading';
import { chartGeometry, gapLimit, niceStep, wallRange } from './tradingChart';

const pt = (timestamp: number, equity: number): EquityPoint => ({ timestamp, equity, source: 'test' });
const BOX = { x: 0, y: 0, w: 100, h: 100 };
const MIN = 60_000;

describe('trading chart geometry', () => {
  it('picks round tick steps', () => {
    expect(niceStep(100)).toBe(50);
    expect(niceStep(7)).toBe(2);
    expect(niceStep(0)).toBe(1);
  });

  it('places the last reading at the right edge and inside the box', () => {
    const now = 1_000 * MIN;
    const g = chartGeometry([pt(now - 60 * MIN, 100), pt(now - 30 * MIN, 110), pt(now, 105)], '24h', now, BOX);
    expect(g.last?.x).toBeCloseTo(100);
    for (const s of g.strokes) for (const [x, y] of s.pts) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(100);
    }
    expect(g.strokes.every((s) => s.up)).toBe(true);
  });

  it('breaks the line over a gap in readings instead of drawing through it', () => {
    const now = 10_000 * MIN;
    const points = [0, 1, 2, 3, 4, 5].map((i) => pt(now - 2000 * MIN + i * MIN, 100 + i)).concat([0, 1, 2].map((i) => pt(now - 2 * MIN + i * MIN, 110 + i)));
    expect(gapLimit(points)).toBe(30 * MIN);
    const g = chartGeometry(points, 'all', now, BOX);
    expect(g.strokes).toHaveLength(2);
    expect(g.strokes.flatMap((s) => s.pts)).toHaveLength(points.length);
  });

  it('draws nothing for no readings', () => {
    const g = chartGeometry([], '7d', 1000, BOX);
    expect(g.strokes).toEqual([]);
    expect(g.last).toBeNull();
  });

  it('opens the wall on the shortest range with a line', () => {
    const v = emptyTradingView();
    expect(wallRange(v)).toBe('24h');
    v.history = { ...v.history, '30d': [pt(1, 1), pt(2, 2)], all: [pt(1, 1), pt(2, 2)] };
    expect(wallRange(v)).toBe('30d');
  });
});
