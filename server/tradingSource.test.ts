import { describe, expect, it } from 'vitest';
import { botStatus, HEARTBEAT_MS, readSource, STATUS_JSON_MISSING } from './tradingSource.ts';

const NOW = Date.parse('2026-10-10T12:00:00Z');

/** Today's `moneyprint dashboard` /status.json, as monitoring/dashboard.py builds it. */
const status = (over: Record<string, unknown> = {}) => ({
  controls: { kill_switch: 'off', risk_paused: 'off', autotrade_paused: 'off', starter_order_state: 'complete' },
  orders: [
    { client_order_id: 'o-5', status: 'pending', reason: '', fill: null },
    { client_order_id: 'o-4', status: 'rejected', reason: 'risk', fill: null },
    { client_order_id: 'o-3', status: 'executed', reason: '', fill: { symbol: 'SPY', side: 'buy', quantity: 2, price: 500, fees: 0 } },
    { client_order_id: 'o-2', status: 'executed', reason: '', fill: { symbol: 'AAPL', quantity: 1, price: 200 } },
    { client_order_id: 'o-1', status: 'accepted', reason: '', fill: { symbol: 'MSFT', side: 'buy', quantity: 1, price: 400 } },
  ],
  positions: [{ symbol: 'SPY', notional: 1000 }],
  heartbeat: { at: new Date(NOW - 30_000).toISOString() },
  report: { equity: 10012.5, cash: 9012.5, pnl_net: 12.5, open_position_market_value: 1000, equity_status: 'marked_to_market' },
  ...over,
});

describe('reading MoneyPrint /status.json', () => {
  it('turns only executed orders with a complete fill into fills', () => {
    const r = readSource(status(), NOW);
    expect(r.recent_fills).toEqual([{ order_id: 'o-3', symbol: 'SPY', side: 'buy', quantity: 2, fill_price: 500, filled_at: null, strategy_id: null }]);
  });

  it('takes what the report says and marks the rest missing', () => {
    const r = readSource(status(), NOW);
    expect(r.account).toMatchObject({ equity: 10012.5, cash: 9012.5, invested: 1000, realized_pnl: 12.5, day_pnl: null, total_pnl: null, buying_power: null });
    expect(r.positions).toEqual([{ symbol: 'SPY', quantity: null, market_value: null, notional: 1000, avg_entry_price: null, current_price: null, unrealized_pnl: null, unrealized_pnl_pct: null }]);
    expect(r.market_quotes).toEqual([]);
    expect(r.equity_history).toBeNull();
    expect(r.missing).toEqual(expect.arrayContaining(STATUS_JSON_MISSING));
    expect(r.system).toMatchObject({ trading_mode: 'unknown', bot_status: 'active', kill_switch: 'off', risk_status: 'ok', broker_connection: 'unknown' });
  });

  it('leaves equity unknown when the report could not mark a position', () => {
    const r = readSource(status({ report: { cash: 5000, equity_status: 'unavailable', equity_unavailable_symbols: ['SPY'] } }), NOW);
    expect(r.account.equity).toBeNull();
    expect(r.account.invested).toBeNull();
    expect(r.missing).toContain('account.equity');
  });

  it('works out the bot from its controls and heartbeat', () => {
    expect(botStatus({ kill_switch: 'on' }, NOW, NOW)).toBe('halted');
    expect(botStatus({ autotrade_paused: 'on' }, NOW, NOW)).toBe('paused');
    expect(botStatus({ risk_paused: 'on' }, NOW, NOW)).toBe('paused');
    expect(botStatus({}, NOW - HEARTBEAT_MS - 1, NOW)).toBe('error');
    expect(botStatus({}, null, NOW)).toBe('unknown');
  });

  it('refuses an answer in an unknown format', () => {
    expect(() => readSource({ hello: 'world' }, NOW)).toThrow(/unknown format/);
    expect(() => readSource([1, 2], NOW)).toThrow(/unknown format/);
    expect(() => readSource(null, NOW)).toThrow(/unknown format/);
  });
});

describe('reading moneyprint.wallboard/v1', () => {
  const native = {
    schema: 'moneyprint.wallboard/v1',
    account: { equity: 101000, cash: 50000, buying_power: 100000, day_pnl: -120.5, total_pnl: 1000, total_return_pct: 1, long_market_value: 51000 },
    equity_history: [
      { timestamp: '2026-10-10T11:00:00Z', equity: 100900, source: 'alpaca.portfolio_history' },
      { timestamp: '2026-10-10T10:00:00Z', equity: 100800 },
      { timestamp: 'nonsense', equity: 1 },
    ],
    positions: [{ symbol: 'NVDA', quantity: 10, market_value: 1300, avg_entry_price: 120, current_price: 130, unrealized_pnl: 100, unrealized_pnl_pct: 8.3 }],
    recent_fills: [
      { order_id: 'a', symbol: 'NVDA', side: 'buy', quantity: 10, fill_price: 120, filled_at: '2026-10-10T09:00:00Z', strategy_id: 'momo' },
      { order_id: 'b', symbol: 'NVDA', side: 'short', quantity: 1, fill_price: 1 },
      { order_id: 'c', symbol: 'SPY', side: 'sell', quantity: 0, fill_price: 500 },
    ],
    market_quotes: [{ symbol: 'BTC/USD', price: 64000, change_pct: 1.2, timestamp: '2026-10-10T11:59:00Z', feed: 'crypto' }],
    system: { trading_mode: 'paper', broker_connection: 'connected', bot_status: 'active', risk_status: 'ok', kill_switch: 'off', active_strategies: 3, last_successful_update: '2026-10-10T11:59:30Z' },
  };

  it('reads every field and drops malformed entries', () => {
    const r = readSource(native, NOW);
    expect(r.account.invested).toBe(51000);
    expect(r.equity_history?.map((p) => p.equity)).toEqual([100800, 100900]);
    expect(r.equity_history?.[0].source).toBe('moneyprint');
    expect(r.recent_fills.map((f) => f.order_id)).toEqual(['a']);
    expect(r.recent_fills[0].filled_at).toBe(Date.parse('2026-10-10T09:00:00Z'));
    expect(r.system.trading_mode).toBe('paper');
    expect(r.missing).toEqual([]);
  });

  it('never upgrades an unknown trading mode, and lists what is missing', () => {
    const r = readSource({ schema: 'moneyprint.wallboard/v1', system: { trading_mode: 'margin' } }, NOW);
    expect(r.system.trading_mode).toBe('unknown');
    expect(r.missing).toEqual(expect.arrayContaining(['account.equity', 'system.trading_mode', 'equity_history', 'market_quotes']));
  });
});
