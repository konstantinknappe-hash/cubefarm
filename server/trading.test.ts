import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { TradingView } from '../shared/trading.ts';
import { nextDelay, readError, sample, tradingConfig, TradingService, type Fetcher } from './trading.ts';

const STATUS = {
  controls: { kill_switch: 'off', risk_paused: 'off', autotrade_paused: 'off' },
  orders: [{ client_order_id: 'o-1', status: 'executed', fill: { symbol: 'SPY', side: 'buy', quantity: 1, price: 500 } }],
  positions: [{ symbol: 'SPY', notional: 500 }],
  heartbeat: { at: new Date().toISOString() },
  report: { equity: 10000, cash: 9500, open_position_market_value: 500, pnl_net: 0 },
};

/** A fake MoneyPrint: answers from `answers` in turn (an Error throws), recording every call. */
function fakeFetch(answers: (unknown | Error)[]) {
  const calls: { url: string; init: Parameters<Fetcher>[1] }[] = [];
  const fetch: Fetcher = async (url, init) => {
    calls.push({ url, init });
    const next = answers.length > 1 ? answers.shift() : answers[0];
    if (next instanceof Error) throw next;
    return { ok: true, status: 200, text: async () => JSON.stringify(next) };
  };
  return { fetch, calls };
}

function service(answers: (unknown | Error)[], over: { token?: string; file?: string | null; now?: () => number } = {}) {
  const sent: { view: TradingView; history: boolean }[] = [];
  const f = fakeFetch(answers);
  const s = new TradingService({
    config: { url: 'http://127.0.0.1:8765/status.json', token: over.token ?? null, floor: 1, pollMs: 7000 },
    file: over.file ?? null,
    changed: (view, history) => sent.push({ view: structuredClone(view), history }),
    log: () => {},
    fetch: f.fetch,
    now: over.now,
  });
  return { s, sent, calls: f.calls };
}

describe('trading wallboard config', () => {
  it('reads the environment with safe defaults', () => {
    expect(tradingConfig({})).toMatchObject({ url: null, token: null, floor: 1, pollMs: 7000, problem: null });
    expect(tradingConfig({ MONEYPRINT_WALLBOARD_URL: 'http://127.0.0.1:8765/status.json', CUBEFARM_TRADING_FLOOR: '3', CUBEFARM_TRADING_POLL_MS: '100' })).toMatchObject({ url: 'http://127.0.0.1:8765/status.json', floor: 3, pollMs: 5000 });
  });

  it('refuses URLs that are not plain http(s)', () => {
    expect(tradingConfig({ MONEYPRINT_WALLBOARD_URL: 'file:///etc/passwd' })).toMatchObject({ url: null, problem: expect.any(String) });
    expect(tradingConfig({ MONEYPRINT_WALLBOARD_URL: 'http://user:pw@host/x' })).toMatchObject({ url: null, problem: expect.any(String) });
    expect(tradingConfig({ MONEYPRINT_WALLBOARD_URL: 'not a url' }).url).toBeNull();
  });

  it('backs off after failures, up to a minute', () => {
    expect(nextDelay(7000, 0)).toBe(7000);
    expect(nextDelay(7000, 1)).toBe(14000);
    expect(nextDelay(7000, 9)).toBe(60000);
  });

  it('words errors without the URL', () => {
    const err = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    expect(readError(err)).not.toMatch(/127\.0\.0\.1|http/);
    expect(readError(new Error('HTTP 503'))).toBe('MoneyPrint antwortete mit HTTP 503');
  });
});

describe('trading wallboard feed', () => {
  it('only ever sends a GET, with the token as a header and never in what the tabs get', async () => {
    const { s, sent, calls } = service([STATUS], { token: 'sekret-token-123' });
    await s.poll();
    s.stop();
    expect(calls).toHaveLength(1);
    expect(calls[0].init).not.toHaveProperty('method');
    expect(calls[0].init).not.toHaveProperty('body');
    expect(calls[0].init.headers.authorization).toBe('Bearer sekret-token-123');
    expect(JSON.stringify(sent)).not.toContain('sekret-token-123');
    expect(JSON.stringify(s.current())).not.toContain('8765');
  });

  it('goes live on a read, then stale (keeping the numbers) when MoneyPrint goes away, and back', async () => {
    const { s, sent } = service([STATUS, new TypeError('fetch failed'), STATUS]);
    await s.poll();
    expect(s.current()).toMatchObject({ source: 'moneyprint', state: 'live', error: null });
    await s.poll();
    expect(s.current().state).toBe('stale');
    expect(s.current().error).toBe('MoneyPrint nicht erreichbar');
    expect(s.current().account.equity).toBe(10000);
    await s.poll();
    s.stop();
    expect(s.current().state).toBe('live');
    expect(sent.map((x) => x.view.state)).toEqual(['live', 'stale', 'live']);
  });

  it('is offline, with no numbers, when MoneyPrint was never reached', async () => {
    const { s } = service([new TypeError('fetch failed')]);
    await s.poll();
    s.stop();
    expect(s.current()).toMatchObject({ state: 'offline', fetchedAt: null, source: 'none' });
    expect(s.current().account.equity).toBeNull();
  });

  it('treats a garbled answer as a failed read', async () => {
    const { s } = service([{ nope: true }]);
    await s.poll();
    s.stop();
    expect(s.current().state).toBe('offline');
    expect(s.current().error).toMatch(/unbekannten Format/);
  });

  it('samples reported equity into a saved history, sending it only when it changed', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cubefarm-trading-'));
    const file = path.join(dir, 'trading-history.json');
    let now = Date.parse('2026-10-10T12:00:00Z');
    const { s, sent } = service([STATUS], { file, now: () => now });
    await s.poll();
    now += 5000;
    await s.poll();
    s.stop();
    expect(sent.map((x) => x.history)).toEqual([true, false]);
    expect(s.current().history['24h']).toEqual([{ timestamp: Date.parse('2026-10-10T12:00:00Z'), equity: 10000, source: 'moneyprint.report' }]);
    await new Promise((r) => setTimeout(r, 50));
    expect(JSON.parse(await fs.readFile(file, 'utf8'))).toHaveLength(1);
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 3 });
  });

  it('serves the mock, marked as such, without a URL', async () => {
    const sent: TradingView[] = [];
    const s = new TradingService({ config: { url: null, token: null, floor: 1, pollMs: 7000 }, file: null, changed: (v) => sent.push(v), log: () => {} });
    await s.poll();
    s.stop();
    expect(s.current()).toMatchObject({ source: 'mock', state: 'mock' });
    expect(s.current().history.all.every((p) => p.source === 'mock')).toBe(true);
    expect(s.current().recent_fills.length).toBe(10);
  });
});

describe('equity sampling', () => {
  const p = (timestamp: number, equity: number) => ({ timestamp, equity, source: 's' });
  it('adds a reading when equity moved (at most once a minute) or every ten minutes while flat', () => {
    expect(sample([], 100, 0, 's')).toEqual([p(0, 100)]);
    expect(sample([p(0, 100)], 101, 30_000, 's')).toHaveLength(1);
    expect(sample([p(0, 100)], 101, 60_000, 's')).toHaveLength(2);
    expect(sample([p(0, 100)], 100, 9 * 60_000, 's')).toHaveLength(1);
    expect(sample([p(0, 100)], 100, 10 * 60_000, 's')).toHaveLength(2);
    expect(sample([p(0, 100)], null, 10 * 60_000, 's')).toHaveLength(1);
    expect(sample([p(5, 100)], 120, 1, 's')).toHaveLength(1);
  });
});

describe('the wallboard stays read-only', () => {
  const root = path.resolve(import.meta.dirname, '..');
  const files = ['server/trading.ts', 'server/tradingSource.ts', 'server/tradingMock.ts', 'shared/trading.ts', 'client/src/world/TradingWall.tsx', 'client/src/world/tradingDraw.ts', 'client/src/world/tradingChart.ts', 'client/src/ui/TradingPanel.tsx'];

  it('has no broker endpoints, write methods or secrets in its code', async () => {
    for (const f of files) {
      const src = await fs.readFile(path.join(root, f), 'utf8');
      expect(src, f).not.toMatch(/alpaca\.markets|etoro\.com|\/v2\/orders/i);
      expect(src, f).not.toMatch(/method:\s*['"](POST|PUT|PATCH|DELETE)['"]/i);
      expect(src, f).not.toMatch(/APCA_|ALPACA_(API|SECRET)|paper\.env/);
    }
  });

  it('never fetches from the browser side', async () => {
    for (const f of files.filter((x) => x.startsWith('client/'))) {
      const src = await fs.readFile(path.join(root, f), 'utf8');
      expect(src, f).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket\(|MONEYPRINT_/);
    }
  });
});
