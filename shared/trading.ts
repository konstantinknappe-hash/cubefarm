// The trading wallboard's contract (docs/trading-wallboard.md): what the office's server sends the tabs about the
// MoneyPrint Alpaca *paper* account, read-only. Every number is either a value MoneyPrint reported or null for "not
// available": nothing is made up or interpolated, and mock data is only ever sent with `source: 'mock'`.
// Timestamps are epoch milliseconds. The pure helpers here (ranges, drawdown, freshness) are shared by the wall's
// canvas, the enlarged panel and the server.

/** Bumped on any breaking change to TradingView. */
export const TRADING_SCHEMA = 'cubefarm.trading/v1';

/** The schema MoneyPrint's own wallboard endpoint answers with (docs/trading-wallboard.md, "Upstream contract"). */
export const UPSTREAM_SCHEMA = 'moneyprint.wallboard/v1';

/** Where the numbers came from: MoneyPrint's endpoint, the clearly marked mock, or nothing yet. */
export type TradingSource = 'moneyprint' | 'mock' | 'none';

/**
 * How current the view is. live: read within STALE_MS; stale: the last good read is older (it's never shown as live);
 * offline: MoneyPrint can't be reached and nothing was read yet; mock: made-up numbers (no MoneyPrint configured).
 */
export type FeedState = 'live' | 'stale' | 'offline' | 'mock';

export interface TradingAccount {
  equity: number | null;
  cash: number | null;
  buying_power: number | null;
  day_pnl: number | null;
  total_pnl: number | null;
  total_return_pct: number | null;
  /** Market value of the open positions. */
  invested: number | null;
  /** Realized net P&L after fees, from MoneyPrint's daily report. */
  realized_pnl: number | null;
}

export interface EquityPoint {
  timestamp: number;
  equity: number;
  /** Who measured it: e.g. 'alpaca.portfolio_history', 'moneyprint.report' (sampled by the office) or 'mock'. */
  source: string;
}

export interface TradingPosition {
  symbol: string;
  quantity: number | null;
  market_value: number | null;
  /** What MoneyPrint's audit holds as invested in it (cost side), when that's all there is. */
  notional: number | null;
  avg_entry_price: number | null;
  current_price: number | null;
  unrealized_pnl: number | null;
  unrealized_pnl_pct: number | null;
}

/** An executed broker fill. Signals, submitted, pending or rejected orders never become one. */
export interface TradingFill {
  order_id: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  fill_price: number;
  filled_at: number | null;
  strategy_id: string | null;
}

export interface MarketQuote {
  symbol: string;
  price: number | null;
  change_pct: number | null;
  timestamp: number | null;
  /** e.g. 'iex', 'crypto', 'mock'. */
  feed: string | null;
}

export type BotStatus = 'active' | 'paused' | 'halted' | 'error' | 'unknown';
export type OnOff = 'on' | 'off' | 'unknown';

export interface TradingSystem {
  /** MoneyPrint is paper-only by construction; anything but 'paper' is shown as a warning, never as normal. */
  trading_mode: 'paper' | 'live' | 'unknown';
  broker_connection: 'connected' | 'disconnected' | 'unknown';
  bot_status: BotStatus;
  risk_status: 'ok' | 'paused' | 'unknown';
  kill_switch: OnOff;
  active_strategies: number | null;
  /** MoneyPrint's own last successful broker/data update (its heartbeat when that's all it says). */
  last_successful_update: number | null;
}

export interface TradingView {
  schema: typeof TRADING_SCHEMA;
  source: TradingSource;
  state: FeedState;
  /** The office floor the wallboard hangs on. */
  floor: number;
  /** The last successful read of MoneyPrint (or of the mock), null before one. */
  fetchedAt: number | null;
  /** Why the last read failed, null when it didn't. */
  error: string | null;
  account: TradingAccount;
  /** Up to HISTORY_POINTS real points per range, oldest first. */
  history: Record<HistoryRange, EquityPoint[]>;
  positions: TradingPosition[];
  /** Newest first, at most FILLS. */
  recent_fills: TradingFill[];
  market_quotes: MarketQuote[];
  system: TradingSystem;
  /** Contract fields MoneyPrint doesn't provide yet (shown as n/a; listed in the docs' MoneyPrint issue). */
  missing: string[];
}

export const HISTORY_RANGES = ['24h', '7d', '30d', 'all'] as const;
export type HistoryRange = (typeof HISTORY_RANGES)[number];
export const RANGE_MS: Record<HistoryRange, number> = { '24h': 86_400_000, '7d': 7 * 86_400_000, '30d': 30 * 86_400_000, all: Number.POSITIVE_INFINITY };
export const HISTORY_POINTS = 240;
export const FILLS = 10;
/** The instruments the ticker prefers, in order. */
export const TICKER_SYMBOLS = ['BTC/USD', 'ETH/USD', 'AAPL', 'MSFT', 'NVDA', 'SPY'] as const;
/** A read older than this is no longer live. */
export const STALE_MS = 30_000;

export const EMPTY_ACCOUNT: TradingAccount = { equity: null, cash: null, buying_power: null, day_pnl: null, total_pnl: null, total_return_pct: null, invested: null, realized_pnl: null };
export const EMPTY_SYSTEM: TradingSystem = {
  trading_mode: 'unknown',
  broker_connection: 'unknown',
  bot_status: 'unknown',
  risk_status: 'unknown',
  kill_switch: 'unknown',
  active_strategies: null,
  last_successful_update: null,
};
export const EMPTY_HISTORY: Record<HistoryRange, EquityPoint[]> = { '24h': [], '7d': [], '30d': [], all: [] };

export const emptyTradingView = (floor = 1): TradingView => ({
  schema: TRADING_SCHEMA,
  source: 'none',
  state: 'offline',
  floor,
  fetchedAt: null,
  error: null,
  account: { ...EMPTY_ACCOUNT },
  history: { ...EMPTY_HISTORY },
  positions: [],
  recent_fills: [],
  market_quotes: [],
  system: { ...EMPTY_SYSTEM },
  missing: [],
});

// ---------- pure helpers ----------

/** The state to show now: a "live" view whose last read is older than STALE_MS is stale (e.g. the server went quiet). */
export function feedState(v: Pick<TradingView, 'state' | 'fetchedAt'>, now: number): FeedState {
  if (v.state === 'live' && (v.fetchedAt === null || now - v.fetchedAt > STALE_MS)) return 'stale';
  return v.state;
}

/**
 * At most `max` of `points` (sorted by time) inside `range` ending at `now`, thinned by keeping the last real point of
 * each time bucket: every point shown is one that was measured, never an average or an interpolation.
 */
export function rangePoints(points: readonly EquityPoint[], range: HistoryRange, now: number, max = HISTORY_POINTS): EquityPoint[] {
  const from = now - RANGE_MS[range];
  const inRange = points.filter((p) => p.timestamp >= from && p.timestamp <= now);
  if (inRange.length <= max) return inRange;
  const t0 = inRange[0].timestamp;
  const span = Math.max(1, inRange[inRange.length - 1].timestamp - t0);
  const buckets = new Map<number, EquityPoint>();
  for (const p of inRange) buckets.set(Math.min(max - 1, Math.floor(((p.timestamp - t0) / span) * max)), p);
  return [...buckets.values()];
}

/** The deepest fall from a running peak, as a negative percentage (e.g. -4.2), or null for fewer than two points. */
export function maxDrawdownPct(points: readonly EquityPoint[]): number | null {
  if (points.length < 2) return null;
  let peak = points[0].equity;
  let worst = 0;
  for (const p of points) {
    if (p.equity > peak) peak = p.equity;
    if (peak > 0) worst = Math.min(worst, ((p.equity - peak) / peak) * 100);
  }
  return worst;
}

/** The highest equity in `points`, or null. */
export const peakEquity = (points: readonly EquityPoint[]) => (points.length ? Math.max(...points.map((p) => p.equity)) : null);

/** Splits a series into runs that rose or fell from the range's first point, for green (up) and red (down) strokes. */
export function trendRuns(points: readonly EquityPoint[]): { up: boolean; points: EquityPoint[] }[] {
  if (points.length < 2) return points.length ? [{ up: true, points: [...points] }] : [];
  const base = points[0].equity;
  const runs: { up: boolean; points: EquityPoint[] }[] = [];
  for (let i = 1; i < points.length; i++) {
    const up = points[i].equity >= base;
    const last = runs[runs.length - 1];
    if (last && last.up === up) last.points.push(points[i]);
    else runs.push({ up, points: [points[i - 1], points[i]] });
  }
  return runs;
}

/** Positions by size of their market value (or notional), then by how much P&L they carry. */
export function sortPositions(positions: readonly TradingPosition[]): TradingPosition[] {
  const size = (p: TradingPosition) => Math.abs(p.market_value ?? p.notional ?? 0);
  return [...positions].sort((a, b) => size(b) - size(a) || Math.abs(b.unrealized_pnl ?? 0) - Math.abs(a.unrealized_pnl ?? 0) || a.symbol.localeCompare(b.symbol));
}

/** "$12,345.67" (or "−$12.30"); "n/a" stand-in for null is the caller's. */
export function usd(n: number, digits = 2): string {
  const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${n < 0 ? '−' : ''}$${s}`;
}

/** A signed amount: "+$12.30" / "−$4.00". */
export const signedUsd = (n: number, digits = 2) => `${n >= 0 ? '+' : '−'}${usd(Math.abs(n), digits)}`;

/** A signed percentage: "+1.25%" / "−0.40%". */
export const signedPct = (n: number, digits = 2) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(digits)}%`;

/** A price with sensible decimals: 4 below $1, 2 otherwise. */
export const price = (n: number) => usd(n, Math.abs(n) < 1 ? 4 : 2);

/** A quantity without trailing zeros (crypto has many decimals). */
export const qty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(6).replace(/0+$/, '').replace(/\.$/, ''));
