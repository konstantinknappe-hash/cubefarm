// The trading wallboard's feed (docs/trading-wallboard.md): the office's server reads MoneyPrint's read-only endpoint
// on a fixed interval (one GET, never anything else), keeps the result and sends it to the tabs over /ws, so no
// browser ever talks to MoneyPrint or a broker and no key leaves this process. A failed read keeps the last numbers
// but the view stops saying live; reads back off to at most a minute and carry on by themselves. Without a
// MONEYPRINT_WALLBOARD_URL (and always in the demo unless one is set) it serves the clearly marked mock instead.
// When MoneyPrint sends no equity history, the office samples the equity it reports into
// <SWARM_HOME>/trading-history.json: real readings with the time they were read, never filled in between.
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  emptyTradingView,
  HISTORY_RANGES,
  rangePoints,
  TRADING_SCHEMA,
  type EquityPoint,
  type HistoryRange,
  type TradingView,
} from '../shared/trading.ts';
import { TradingMock } from './tradingMock.ts';
import { readSource, type SourceRead } from './tradingSource.ts';

export interface TradingConfig {
  /** MoneyPrint's endpoint (http/https), or null for the mock. */
  url: string | null;
  /** Sent as a bearer token to MoneyPrint only; never to a tab, a log or the journal. */
  token: string | null;
  floor: number;
  pollMs: number;
}

const TIMEOUT_MS = 4000;
const MAX_BYTES = 2_000_000;
const MAX_BACKOFF_MS = 60_000;
/** The office's own samples: at most one a minute while equity moves, one every 10 minutes while it doesn't. */
const SAMPLE_MOVING_MS = 60_000;
const SAMPLE_FLAT_MS = 10 * 60_000;
const MAX_SAMPLES = 20_000;

/** The wallboard's settings from the environment; a URL that isn't plain http(s) is refused. */
export function tradingConfig(env: NodeJS.ProcessEnv): TradingConfig & { problem: string | null } {
  let url: string | null = env.MONEYPRINT_WALLBOARD_URL?.trim() || null;
  let problem: string | null = null;
  if (url) {
    try {
      const u = new URL(url);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('not http');
      if (u.username || u.password) throw new Error('credentials in the URL');
    } catch {
      problem = 'MONEYPRINT_WALLBOARD_URL must be an http(s) URL without credentials; the wallboard shows mock data';
      url = null;
    }
  }
  const floor = Number(env.CUBEFARM_TRADING_FLOOR ?? 1);
  const poll = Number(env.CUBEFARM_TRADING_POLL_MS ?? 7000);
  return {
    url,
    token: env.MONEYPRINT_WALLBOARD_TOKEN?.trim() || null,
    floor: Number.isInteger(floor) && floor >= 1 ? floor : 1,
    pollMs: Number.isFinite(poll) ? Math.min(60_000, Math.max(5000, poll)) : 7000,
    problem,
  };
}

/** The wait before the next read: the interval, doubled per failure in a row up to a minute. */
export const nextDelay = (pollMs: number, failures: number) => Math.min(MAX_BACKOFF_MS, pollMs * 2 ** Math.min(failures, 4));

/** A sample appended when equity moved (at most once a minute) or every 10 minutes while flat; `history` is sorted. */
export function sample(history: EquityPoint[], equity: number | null, at: number, source: string): EquityPoint[] {
  if (equity === null) return history;
  const last = history[history.length - 1];
  if (last && at <= last.timestamp) return history;
  if (last && (last.equity === equity ? at - last.timestamp < SAMPLE_FLAT_MS : at - last.timestamp < SAMPLE_MOVING_MS)) return history;
  const next = [...history, { timestamp: at, equity, source }];
  // Over the cap, every other point of the oldest half goes: what stays is still only measured points.
  if (next.length <= MAX_SAMPLES) return next;
  const half = Math.floor(next.length / 2);
  return [...next.slice(0, half).filter((_, i) => i % 2 === 0), ...next.slice(half)];
}

/** Why a read failed, in words safe to show: never the URL (it may carry a host the manager keeps private) or the token. */
export function readError(err: unknown): string {
  const e = err as Error & { cause?: { code?: string } };
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return 'MoneyPrint antwortet nicht (Zeitüberschreitung)';
  if (e?.cause?.code === 'ECONNREFUSED') return 'MoneyPrint nicht erreichbar (Verbindung abgelehnt)';
  if (e?.cause?.code || /fetch failed/i.test(e?.message ?? '')) return 'MoneyPrint nicht erreichbar';
  if (/^HTTP \d+$/.test(e?.message ?? '')) return `MoneyPrint antwortete mit ${e.message}`;
  if (/unknown format|JSON/i.test(e?.message ?? '')) return 'MoneyPrint antwortete in einem unbekannten Format';
  return 'MoneyPrint konnte nicht gelesen werden';
}

export type Fetcher = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export class TradingService {
  private view: TradingView;
  private history: EquityPoint[] = [];
  private historyKey = '';
  private timer: NodeJS.Timeout | null = null;
  private failures = 0;
  private mock: TradingMock | null = null;
  private saving: Promise<void> = Promise.resolve();

  constructor(
    private o: {
      config: TradingConfig;
      /** Where sampled history is kept; null keeps it in memory only (the demo, tests). */
      file: string | null;
      /** A new view (every read); `historyChanged` when its history isn't the one sent last. */
      changed: (view: TradingView, historyChanged: boolean) => void;
      log: (line: string) => void;
      fetch?: Fetcher;
      now?: () => number;
    },
  ) {
    this.view = emptyTradingView(o.config.floor);
    if (!o.config.url) this.mock = new TradingMock(this.now);
  }

  private now = () => this.o.now?.() ?? Date.now();

  current(): TradingView {
    return this.view;
  }

  async init() {
    if (this.o.file && this.o.config.url) {
      try {
        const raw = JSON.parse(await fs.readFile(this.o.file, 'utf8')) as unknown;
        this.history = (Array.isArray(raw) ? raw : [])
          .filter((p): p is EquityPoint => !!p && typeof p.timestamp === 'number' && typeof p.equity === 'number' && Number.isFinite(p.equity))
          .map((p) => ({ timestamp: p.timestamp, equity: p.equity, source: typeof p.source === 'string' ? p.source.slice(0, 48) : 'moneyprint.report' }))
          .sort((a, b) => a.timestamp - b.timestamp);
      } catch {
        // nothing sampled yet
      }
    }
    await this.poll();
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(ms: number) {
    this.stop();
    this.timer = setTimeout(() => void this.poll(), ms);
    this.timer.unref?.();
  }

  /** One read of MoneyPrint (or the mock), then the next is scheduled. Never throws. */
  async poll(): Promise<void> {
    const now = this.now();
    try {
      const read = this.mock ? this.mock.read() : await this.fetchRead(now);
      this.failures = 0;
      this.apply(read, now);
    } catch (err) {
      this.failures++;
      const error = readError(err);
      if (this.failures === 1 || this.failures % 20 === 0) this.o.log(`trading wallboard: ${error}`);
      this.view = { ...this.view, state: this.view.fetchedAt === null ? 'offline' : 'stale', error };
      this.o.changed(this.view, false);
    }
    this.schedule(nextDelay(this.o.config.pollMs, this.failures));
  }

  private async fetchRead(now: number): Promise<SourceRead> {
    const { url, token } = this.o.config;
    const headers: Record<string, string> = { accept: 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await (this.o.fetch ?? (fetch as unknown as Fetcher))(url!, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (text.length > MAX_BYTES) throw new Error('unknown format: too large');
    return readSource(JSON.parse(text) as unknown, now);
  }

  private apply(read: SourceRead, now: number) {
    let history: EquityPoint[];
    if (read.equity_history) history = read.equity_history;
    else {
      history = sample(this.history, read.account.equity, now, 'moneyprint.report');
      if (history !== this.history) this.save(history);
    }
    this.history = history;
    const key = `${history.length}:${history[history.length - 1]?.timestamp ?? 0}:${history[0]?.timestamp ?? 0}`;
    const historyChanged = key !== this.historyKey;
    const ranges = historyChanged ? (Object.fromEntries(HISTORY_RANGES.map((r) => [r, rangePoints(history, r, now)])) as Record<HistoryRange, EquityPoint[]>) : this.view.history;
    this.historyKey = key;
    this.view = {
      schema: TRADING_SCHEMA,
      source: this.mock ? 'mock' : 'moneyprint',
      state: this.mock ? 'mock' : 'live',
      floor: this.o.config.floor,
      fetchedAt: now,
      error: null,
      account: read.account,
      history: ranges,
      positions: read.positions,
      recent_fills: read.recent_fills,
      market_quotes: read.market_quotes,
      system: read.system,
      missing: read.missing,
    };
    this.o.changed(this.view, historyChanged);
  }

  /** Written to a temp file and renamed (Windows: no half-written file on a crash), one write at a time. */
  private save(history: EquityPoint[]) {
    const file = this.o.file;
    if (!file) return;
    this.saving = this.saving
      .then(async () => {
        await fs.mkdir(path.dirname(file), { recursive: true });
        const tmp = `${file}.tmp`;
        await fs.writeFile(tmp, JSON.stringify(history));
        await fs.rename(tmp, file);
      })
      .catch((err) => this.o.log(`trading wallboard: could not save the equity history (${(err as Error).message})`));
  }
}
