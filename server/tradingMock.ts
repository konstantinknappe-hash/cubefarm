// The trading wallboard's mock (docs/trading-wallboard.md): made-up numbers so the wall can be seen and tested without
// MoneyPrint (the demo office, or no MONEYPRINT_WALLBOARD_URL). Everything it makes goes out with `source: 'mock'`
// and the wall says MOCK in large letters; none of it is ever mixed with real readings. Seeded, so tests can pin it.
import { FILLS, TICKER_SYMBOLS, type EquityPoint, type MarketQuote, type TradingFill, type TradingPosition } from '../shared/trading.ts';
import type { SourceRead } from './tradingSource.ts';

const START = 100_000;
const STEP_MS = 15 * 60_000;
const DAYS = 45;
/** A new mock fill about this often, so the wall's highlight can be seen. */
export const MOCK_FILL_MS = 45_000;

/** A small deterministic generator (mulberry32). */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BOOK: { symbol: string; qty: number; entry: number; last: number; strategy: string }[] = [
  { symbol: 'NVDA', qty: 40, entry: 118.4, last: 131.2, strategy: 'momentum-v2' },
  { symbol: 'SPY', qty: 18, entry: 548.1, last: 556.9, strategy: 'trend-follow' },
  { symbol: 'BTC/USD', qty: 0.12, entry: 61250, last: 63980, strategy: 'crypto-breakout' },
  { symbol: 'AAPL', qty: 25, entry: 226.3, last: 221.7, strategy: 'mean-revert' },
  { symbol: 'MSFT', qty: 10, entry: 421.0, last: 428.4, strategy: 'momentum-v2' },
  { symbol: 'ETH/USD', qty: 1.4, entry: 2610, last: 2544, strategy: 'crypto-breakout' },
];
const QUOTE_BASE: Record<string, number> = { 'BTC/USD': 63980, 'ETH/USD': 2544, AAPL: 221.7, MSFT: 428.4, NVDA: 131.2, SPY: 556.9 };

export class TradingMock {
  private history: EquityPoint[] = [];
  private fills: TradingFill[] = [];
  private nextFill = 0;
  private seq = 0;
  private rand: () => number;

  constructor(private now: () => number, seed = 42) {
    this.rand = seeded(seed);
    const t0 = Math.floor((now() - DAYS * 86_400_000) / STEP_MS) * STEP_MS;
    let e = START;
    for (let t = t0; t <= now(); t += STEP_MS) {
      e *= 1 + (this.rand() - 0.495) * 0.003;
      this.history.push({ timestamp: t, equity: Math.round(e * 100) / 100, source: 'mock' });
    }
    for (let i = FILLS; i > 0; i--) this.fills.push(this.makeFill(now() - i * 37 * 60_000));
    this.fills.reverse();
    this.nextFill = now() + MOCK_FILL_MS;
  }

  private makeFill(at: number): TradingFill {
    const b = BOOK[Math.floor(this.rand() * BOOK.length)];
    const quantity = b.qty < 1 ? Math.round(b.qty * 0.25 * 1e4) / 1e4 : Math.max(1, Math.round(b.qty * 0.2));
    return {
      order_id: `mock-${(++this.seq).toString().padStart(4, '0')}`,
      symbol: b.symbol,
      side: this.rand() < 0.6 ? 'buy' : 'sell',
      quantity,
      fill_price: Math.round(b.last * (1 + (this.rand() - 0.5) * 0.004) * 100) / 100,
      filled_at: at,
      strategy_id: b.strategy,
    };
  }

  /** One read, as MoneyPrint's would be: the walk moves on, now and then a new fill. */
  read(): SourceRead {
    const now = this.now();
    const last = this.history[this.history.length - 1];
    if (now - last.timestamp >= 60_000) {
      const equity = Math.round(last.equity * (1 + (this.rand() - 0.495) * 0.0012) * 100) / 100;
      this.history.push({ timestamp: now, equity, source: 'mock' });
    }
    if (now >= this.nextFill) {
      this.fills = [this.makeFill(now), ...this.fills].slice(0, FILLS);
      this.nextFill = now + MOCK_FILL_MS;
    }
    const equity = this.history[this.history.length - 1].equity;
    const positions: TradingPosition[] = BOOK.map((b) => {
      const value = b.qty * b.last;
      const pnl = (b.last - b.entry) * b.qty;
      return { symbol: b.symbol, quantity: b.qty, market_value: value, notional: b.qty * b.entry, avg_entry_price: b.entry, current_price: b.last, unrealized_pnl: pnl, unrealized_pnl_pct: ((b.last - b.entry) / b.entry) * 100 };
    });
    const invested = positions.reduce((s, p) => s + (p.market_value ?? 0), 0);
    const dayAgo = this.history.find((p) => p.timestamp >= now - 86_400_000) ?? this.history[0];
    const quotes: MarketQuote[] = TICKER_SYMBOLS.map((symbol) => {
      const base = QUOTE_BASE[symbol];
      const wobble = Math.sin(now / 90_000 + symbol.length) * 0.004;
      return { symbol, price: Math.round(base * (1 + wobble) * 100) / 100, change_pct: Math.round((wobble * 100 + (symbol.length % 3) - 1) * 100) / 100, timestamp: now, feed: 'mock' };
    });
    return {
      account: {
        equity,
        cash: Math.round((equity - invested) * 100) / 100,
        buying_power: Math.round((equity - invested) * 2 * 100) / 100,
        day_pnl: Math.round((equity - dayAgo.equity) * 100) / 100,
        total_pnl: Math.round((equity - START) * 100) / 100,
        total_return_pct: ((equity - START) / START) * 100,
        invested,
        realized_pnl: 1834.2,
      },
      positions,
      recent_fills: this.fills,
      market_quotes: quotes,
      system: {
        trading_mode: 'paper',
        broker_connection: 'connected',
        bot_status: 'active',
        risk_status: 'ok',
        kill_switch: 'off',
        active_strategies: 4,
        last_successful_update: now,
      },
      equity_history: this.history,
      missing: [],
    };
  }
}
