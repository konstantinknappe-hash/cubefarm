import { describe, expect, it } from 'vitest';
import { emptyTradingView, feedState, maxDrawdownPct, rangePoints, signedPct, signedUsd, sortPositions, STALE_MS, trendRuns, usd, type EquityPoint, type TradingPosition } from './trading';

const pt = (timestamp: number, equity: number): EquityPoint => ({ timestamp, equity, source: 'test' });

describe('trading contract helpers', () => {
  it('never calls a quiet live view live', () => {
    const v = { ...emptyTradingView(), state: 'live' as const, fetchedAt: 1000 };
    expect(feedState(v, 1000 + STALE_MS)).toBe('live');
    expect(feedState(v, 1001 + STALE_MS)).toBe('stale');
    expect(feedState({ state: 'live', fetchedAt: null }, 0)).toBe('stale');
    expect(feedState({ state: 'mock', fetchedAt: 0 }, 10 * STALE_MS)).toBe('mock');
  });

  it('thins a range to measured points only, keeping the latest', () => {
    const now = 1_000_000_000;
    const points = Array.from({ length: 1000 }, (_, i) => pt(now - 86_000_000 + i * 86_000, 100 + i));
    const out = rangePoints(points, '24h', now, 50);
    expect(out.length).toBeLessThanOrEqual(50);
    for (const p of out) expect(points).toContainEqual(p);
    expect(out[out.length - 1]).toEqual(points[points.length - 1]);
    expect(rangePoints([pt(now - 2 * 86_400_000, 1), pt(now - 10, 2)], '24h', now)).toEqual([pt(now - 10, 2)]);
  });

  it('works out the max drawdown from a running peak', () => {
    expect(maxDrawdownPct([pt(1, 100)])).toBeNull();
    expect(maxDrawdownPct([pt(1, 100), pt(2, 120), pt(3, 90), pt(4, 130)])).toBeCloseTo(-25);
    expect(maxDrawdownPct([pt(1, 100), pt(2, 110)])).toBe(0);
  });

  it('splits a series into rising and falling runs against its first point', () => {
    const runs = trendRuns([pt(1, 100), pt(2, 105), pt(3, 98), pt(4, 97), pt(5, 101)]);
    expect(runs.map((r) => r.up)).toEqual([true, false, true]);
    expect(runs[1].points.map((p) => p.equity)).toEqual([105, 98, 97]);
  });

  it('sorts positions by size, then by P&L', () => {
    const p = (symbol: string, market_value: number | null, notional: number | null = null, unrealized_pnl: number | null = null): TradingPosition => ({ symbol, quantity: null, market_value, notional, avg_entry_price: null, current_price: null, unrealized_pnl, unrealized_pnl_pct: null });
    expect(sortPositions([p('A', 10), p('B', null, 50), p('C', 10, null, -9), p('D', 30)]).map((x) => x.symbol)).toEqual(['B', 'D', 'C', 'A']);
  });

  it('formats money and percentages with signs', () => {
    expect(usd(12345.678)).toBe('$12,345.68');
    expect(usd(-3)).toBe('−$3.00');
    expect(signedUsd(4)).toBe('+$4.00');
    expect(signedUsd(-4)).toBe('−$4.00');
    expect(signedPct(-0.4)).toBe('−0.40%');
  });
});
