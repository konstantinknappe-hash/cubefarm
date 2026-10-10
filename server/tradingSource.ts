// Reading MoneyPrint for the trading wallboard (docs/trading-wallboard.md), pure: what one answer of its read-only
// endpoint says, in the wallboard's contract (shared/trading.ts). Two shapes are understood: MoneyPrint's own
// wallboard contract (`moneyprint.wallboard/v1`, the target), and the `/status.json` its `moneyprint dashboard`
// serves today, which lacks most of it. Whatever an answer doesn't say stays null and is listed in `missing`; nothing
// is guessed. Only executed orders with a complete fill become fills.
import {
  EMPTY_ACCOUNT,
  EMPTY_SYSTEM,
  FILLS,
  UPSTREAM_SCHEMA,
  type BotStatus,
  type EquityPoint,
  type MarketQuote,
  type OnOff,
  type TradingAccount,
  type TradingFill,
  type TradingPosition,
  type TradingSystem,
} from '../shared/trading.ts';

/** What one read of MoneyPrint gave: everything but the history, plus its own history when it sends one. */
export interface SourceRead {
  account: TradingAccount;
  positions: TradingPosition[];
  recent_fills: TradingFill[];
  market_quotes: MarketQuote[];
  system: TradingSystem;
  /** MoneyPrint's own equity history (native shape only); null when the office has to sample `account.equity`. */
  equity_history: EquityPoint[] | null;
  missing: string[];
}

/** A heartbeat older than this means the trader isn't running its loop. */
export const HEARTBEAT_MS = 5 * 60_000;

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown, max = 64): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
/** An ISO date or epoch milliseconds as epoch milliseconds, else null. */
export function time(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  if (typeof v !== 'string') return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
}
const onOff = (v: unknown): OnOff => (v === 'on' || v === true ? 'on' : v === 'off' || v === false ? 'off' : 'unknown');
const side = (v: unknown): 'buy' | 'sell' | null => (v === 'buy' || v === 'sell' ? v : null);
const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T => (options.includes(v as T) ? (v as T) : fallback);

/** The null fields of `o`, as "prefix.field". */
const nulls = (prefix: string, o: object) =>
  Object.entries(o)
    .filter(([, v]) => v === null || v === 'unknown')
    .map(([k]) => `${prefix}.${k}`);

/** Which upstream shape `raw` is. */
export const isNative = (raw: unknown) => obj(raw)?.schema === UPSTREAM_SCHEMA;

/** Reads either shape; throws when it's neither. */
export function readSource(raw: unknown, now: number): SourceRead {
  if (isNative(raw)) return readNative(raw as Obj);
  const o = obj(raw);
  if (o && ('controls' in o || 'report' in o || 'orders' in o)) return readStatus(o, now);
  throw new Error('MoneyPrint answered with an unknown format');
}

// ---------- moneyprint.wallboard/v1 ----------

function fill(v: unknown): TradingFill | null {
  const f = obj(v);
  if (!f) return null;
  const s = side(f.side);
  const quantity = num(f.quantity);
  const fillPrice = num(f.fill_price);
  const id = str(f.order_id, 80);
  const symbol = str(f.symbol, 24);
  if (!s || !id || !symbol || quantity === null || quantity <= 0 || fillPrice === null || fillPrice <= 0) return null;
  return { order_id: id, symbol, side: s, quantity, fill_price: fillPrice, filled_at: time(f.filled_at), strategy_id: str(f.strategy_id, 64) };
}

function position(v: unknown): TradingPosition | null {
  const p = obj(v);
  const symbol = str(p?.symbol, 24);
  if (!p || !symbol) return null;
  return {
    symbol,
    quantity: num(p.quantity),
    market_value: num(p.market_value),
    notional: num(p.notional),
    avg_entry_price: num(p.avg_entry_price),
    current_price: num(p.current_price),
    unrealized_pnl: num(p.unrealized_pnl),
    unrealized_pnl_pct: num(p.unrealized_pnl_pct),
  };
}

function quote(v: unknown): MarketQuote | null {
  const q = obj(v);
  const symbol = str(q?.symbol, 24);
  if (!q || !symbol) return null;
  return { symbol, price: num(q.price), change_pct: num(q.change_pct), timestamp: time(q.timestamp), feed: str(q.feed, 24) };
}

function readNative(o: Obj): SourceRead {
  const a = obj(o.account) ?? {};
  const s = obj(o.system) ?? {};
  const account: TradingAccount = {
    equity: num(a.equity),
    cash: num(a.cash),
    buying_power: num(a.buying_power),
    day_pnl: num(a.day_pnl),
    total_pnl: num(a.total_pnl),
    total_return_pct: num(a.total_return_pct),
    invested: num(a.invested ?? a.long_market_value),
    realized_pnl: num(a.realized_pnl),
  };
  const system: TradingSystem = {
    trading_mode: oneOf(s.trading_mode, ['paper', 'live'] as const, 'unknown'),
    broker_connection: oneOf(s.broker_connection, ['connected', 'disconnected'] as const, 'unknown'),
    bot_status: oneOf<BotStatus>(s.bot_status, ['active', 'paused', 'halted', 'error'], 'unknown'),
    risk_status: oneOf(s.risk_status, ['ok', 'paused'] as const, 'unknown'),
    kill_switch: onOff(s.kill_switch),
    active_strategies: num(s.active_strategies),
    last_successful_update: time(s.last_successful_update),
  };
  const history = arr(o.equity_history)
    .map((v): EquityPoint | null => {
      const p = obj(v);
      const t = time(p?.timestamp);
      const e = num(p?.equity);
      return t !== null && e !== null ? { timestamp: t, equity: e, source: str(p?.source, 48) ?? 'moneyprint' } : null;
    })
    .filter((p): p is EquityPoint => !!p)
    .sort((x, y) => x.timestamp - y.timestamp);
  const fills = arr(o.recent_fills).map(fill).filter((f): f is TradingFill => !!f);
  fills.sort((x, y) => (y.filled_at ?? 0) - (x.filled_at ?? 0));
  const read: SourceRead = {
    account,
    positions: arr(o.positions).map(position).filter((p): p is TradingPosition => !!p),
    recent_fills: fills.slice(0, FILLS),
    market_quotes: arr(o.market_quotes).map(quote).filter((q): q is MarketQuote => !!q),
    system,
    equity_history: Array.isArray(o.equity_history) ? history : null,
    missing: [],
  };
  read.missing = [
    ...nulls('account', account).filter((k) => k !== 'account.realized_pnl'),
    ...nulls('system', system),
    ...(read.equity_history ? [] : ['equity_history']),
    ...(Array.isArray(o.market_quotes) ? [] : ['market_quotes']),
  ];
  return read;
}

// ---------- today's /status.json ----------

/** The fields MoneyPrint's /status.json never has, for the wallboard's "n/a" and the docs' issue. */
export const STATUS_JSON_MISSING = [
  'account.buying_power',
  'account.day_pnl',
  'account.total_pnl',
  'account.total_return_pct',
  'equity_history',
  'positions.quantity',
  'positions.market_value',
  'positions.avg_entry_price',
  'positions.current_price',
  'positions.unrealized_pnl',
  'positions.unrealized_pnl_pct',
  'recent_fills.filled_at',
  'recent_fills.strategy_id',
  'market_quotes',
  'system.trading_mode',
  'system.broker_connection',
  'system.active_strategies',
];

/** The trader's state from its controls and heartbeat: the kill switch halts, a pause pauses, a quiet loop is an error. */
export function botStatus(controls: Obj, heartbeatAt: number | null, now: number): BotStatus {
  if (controls.kill_switch === 'on') return 'halted';
  if (controls.autotrade_paused === 'on' || controls.risk_paused === 'on') return 'paused';
  if (heartbeatAt === null) return 'unknown';
  return now - heartbeatAt <= HEARTBEAT_MS ? 'active' : 'error';
}

function readStatus(o: Obj, now: number): SourceRead {
  const controls = obj(o.controls) ?? {};
  const report = obj(o.report) ?? {};
  const heartbeatAt = time(obj(o.heartbeat)?.at);
  // The daily report leaves equity out when a position couldn't be marked to market: then it's unknown, not cash.
  const marked = report.equity_status !== 'unavailable';
  const account: TradingAccount = {
    ...EMPTY_ACCOUNT,
    equity: marked ? num(report.equity) : null,
    cash: num(report.cash),
    invested: marked ? num(report.open_position_market_value) : null,
    realized_pnl: num(report.pnl_net),
  };
  const fills: TradingFill[] = [];
  for (const v of arr(o.orders)) {
    const order = obj(v);
    if (order?.status !== 'executed') continue;
    const f = obj(order.fill);
    const id = str(order.client_order_id, 80);
    const symbol = str(f?.symbol, 24);
    const s = side(f?.side);
    const quantity = num(f?.quantity);
    const fillPrice = num(f?.price);
    if (!f || !id || !symbol || !s || quantity === null || quantity <= 0 || fillPrice === null || fillPrice <= 0) continue;
    fills.push({ order_id: id, symbol, side: s, quantity, fill_price: fillPrice, filled_at: time(order.executed_at ?? f.filled_at), strategy_id: str(f.strategy_id ?? order.strategy_id, 64) });
    if (fills.length >= FILLS) break; // the orders come newest first
  }
  const positions: TradingPosition[] = arr(o.positions)
    .map((v) => obj(v))
    .filter((p): p is Obj => !!p && !!str(p.symbol, 24))
    .map((p) => ({ symbol: str(p.symbol, 24)!, quantity: null, market_value: null, notional: num(p.notional), avg_entry_price: null, current_price: null, unrealized_pnl: null, unrealized_pnl_pct: null }));
  const system: TradingSystem = {
    ...EMPTY_SYSTEM,
    // MoneyPrint can only trade Alpaca paper (docs/betrieb.md: paper=True, PA account check), but /status.json
    // doesn't say so: 'unknown' keeps the wall from claiming more than it was told.
    trading_mode: 'unknown',
    bot_status: botStatus(controls, heartbeatAt, now),
    risk_status: controls.risk_paused === 'on' ? 'paused' : controls.risk_paused === 'off' ? 'ok' : 'unknown',
    kill_switch: onOff(controls.kill_switch),
    last_successful_update: heartbeatAt,
  };
  return {
    account,
    positions,
    recent_fills: fills,
    market_quotes: [],
    system,
    equity_history: null,
    missing: [...STATUS_JSON_MISSING, ...(account.equity === null ? ['account.equity'] : []), ...(account.cash === null ? ['account.cash'] : [])],
  };
}
