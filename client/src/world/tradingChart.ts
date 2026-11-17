// The trading wallboard's chart geometry, pure (TradingWall's canvas and TradingPanel's SVG both draw from it): the
// equity points of a range placed in a box, split into rising (green) and falling (red) strokes against the range's
// first point, and broken where readings are missing, so a gap is never drawn as if it had been measured.
import { HISTORY_RANGES, RANGE_MS, trendRuns, type EquityPoint, type HistoryRange, type TradingView } from '../../../shared/trading';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ChartGeometry {
  /** Polylines in box coordinates, each rising or falling from the base. */
  strokes: { up: boolean; pts: [number, number][] }[];
  /** Where the range's first value sits (the dashed base line), or null for an empty chart. */
  baseY: number | null;
  yTicks: { value: number; y: number }[];
  xTicks: { time: number; x: number }[];
  last: { x: number; y: number; equity: number } | null;
  /** Each reading's position, for dots when there are few. */
  dots: [number, number][];
  t0: number;
  t1: number;
}

/** A gap in readings longer than this many typical steps (and at least 30 minutes) breaks the line. */
const GAP_STEPS = 6;
const MIN_GAP_MS = 30 * 60_000;

/** Round tick steps for a span of values: 1, 2 or 5 times a power of ten, about `n` of them. */
export function niceStep(span: number, n = 4): number {
  if (!(span > 0)) return 1;
  const raw = span / n;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
}

/** The longest step between readings that still counts as continuous. */
export function gapLimit(points: readonly EquityPoint[]): number {
  if (points.length < 3) return Number.POSITIVE_INFINITY;
  const steps = points
    .slice(1)
    .map((p, i) => p.timestamp - points[i].timestamp)
    .sort((a, b) => a - b);
  return Math.max(MIN_GAP_MS, steps[Math.floor(steps.length / 2)] * GAP_STEPS);
}

export function chartGeometry(points: readonly EquityPoint[], range: HistoryRange, now: number, box: Box): ChartGeometry {
  const t1 = now;
  const t0 = range === 'all' ? (points[0]?.timestamp ?? now - RANGE_MS['24h']) : now - RANGE_MS[range];
  const empty: ChartGeometry = { strokes: [], baseY: null, yTicks: [], xTicks: [], last: null, dots: [], t0, t1 };
  if (!points.length) return empty;
  let lo = Math.min(...points.map((p) => p.equity));
  let hi = Math.max(...points.map((p) => p.equity));
  // A flat line sits in the middle; otherwise a little headroom above and below.
  const pad = hi - lo > 0 ? (hi - lo) * 0.12 : Math.max(1, Math.abs(hi) * 0.002);
  lo -= pad;
  hi += pad;
  const span = Math.max(1, t1 - t0);
  const x = (t: number) => box.x + ((t - t0) / span) * box.w;
  const y = (v: number) => box.y + box.h - ((v - lo) / (hi - lo)) * box.h;
  const limit = gapLimit(points);

  const strokes: ChartGeometry['strokes'] = [];
  for (const run of trendRuns(points)) {
    let pts: [number, number][] = [];
    run.points.forEach((p, i) => {
      if (i > 0 && p.timestamp - run.points[i - 1].timestamp > limit) {
        if (pts.length > 1) strokes.push({ up: run.up, pts });
        pts = [];
      }
      pts.push([x(p.timestamp), y(p.equity)]);
    });
    if (pts.length > 1 || (pts.length === 1 && points.length === 1)) strokes.push({ up: run.up, pts });
  }

  const step = niceStep(hi - lo);
  const yTicks: ChartGeometry['yTicks'] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) yTicks.push({ value: v, y: y(v) });

  const xTicks: ChartGeometry['xTicks'] = [];
  for (let i = 0; i <= 4; i++) {
    const time = t0 + (span * i) / 4;
    xTicks.push({ time, x: x(time) });
  }
  const lp = points[points.length - 1];
  return {
    strokes,
    baseY: y(points[0].equity),
    yTicks,
    xTicks,
    last: { x: x(lp.timestamp), y: y(lp.equity), equity: lp.equity },
    dots: points.length <= 60 ? points.map((p) => [x(p.timestamp), y(p.equity)] as [number, number]) : [],
    t0,
    t1,
  };
}

/** The range the wall opens on: the shortest one with a line to draw, 24h when none has. */
export function wallRange(v: Pick<TradingView, 'history'>): HistoryRange {
  return HISTORY_RANGES.find((r) => v.history[r].length >= 2) ?? '24h';
}
