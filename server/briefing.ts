// The desk briefing board's feed (docs/desk-briefing.md): like the trading wallboard, the office's server reads
// MoneyPrint's read-only /briefing.json on an interval and sends the result over /ws. The manager's questions are the
// one thing that goes the other way: each is written as a small JSON file into MoneyPrint's inquiry inbox folder
// (CUBEFARM_TRADING_INBOX), which the research team picks up; nothing else is ever written. Without a MoneyPrint URL
// (and in the demo) it serves a clearly marked mock that answers questions by itself.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { BRIEFING_SCHEMA, cleanQuestion, emptyBriefingView, parseBriefing, type BriefingView, type Inquiry } from '../shared/briefing.ts';
import { HttpError } from './httpError.ts';
import { readError, type Fetcher } from './trading.ts';

export interface BriefingConfig {
  url: string | null;
  token: string | null;
  /** MoneyPrint's inquiry inbox folder, or null when questions can't be sent. */
  inbox: string | null;
  pollMs: number;
}

const TIMEOUT_MS = 4000;
const MAX_BYTES = 1_000_000;

/** The board's settings: its URL defaults to the wallboard's host with /briefing.json. */
export function briefingConfig(env: NodeJS.ProcessEnv): BriefingConfig {
  let url = env.MONEYPRINT_BRIEFING_URL?.trim() || null;
  const wall = env.MONEYPRINT_WALLBOARD_URL?.trim();
  if (!url && wall) {
    try {
      const u = new URL(wall);
      u.pathname = '/briefing.json';
      u.search = '';
      url = u.toString();
    } catch {
      url = null;
    }
  }
  if (url) {
    try {
      const u = new URL(url);
      if ((u.protocol !== 'http:' && u.protocol !== 'https:') || u.username || u.password) url = null;
    } catch {
      url = null;
    }
  }
  const poll = Number(env.CUBEFARM_BRIEFING_POLL_MS ?? 60_000);
  return {
    url,
    token: env.MONEYPRINT_WALLBOARD_TOKEN?.trim() || null,
    inbox: env.CUBEFARM_TRADING_INBOX?.trim() || null,
    pollMs: Number.isFinite(poll) ? Math.min(600_000, Math.max(15_000, poll)) : 60_000,
  };
}

/** The inbox file MoneyPrint reads (moneyprint.analysts.briefing.read_inbox). */
export function inquiryFile(id: string, question: string, askedAt: number) {
  return { id, question, asked_by: 'manager', asked_at: new Date(askedAt).toISOString() };
}

export class BriefingService {
  private view: BriefingView = emptyBriefingView();
  private timer: NodeJS.Timeout | null = null;
  private failures = 0;
  private readonly mock: boolean;
  /** Questions sent from this office that MoneyPrint hasn't listed yet, newest first. */
  private sent: Inquiry[] = [];

  constructor(
    private o: {
      config: BriefingConfig;
      demo: boolean;
      changed: (view: BriefingView) => void;
      log: (line: string) => void;
      fetch?: Fetcher;
      now?: () => number;
    },
  ) {
    this.mock = o.demo || !o.config.url;
  }

  private now = () => this.o.now?.() ?? Date.now();

  current(): BriefingView {
    return this.view;
  }

  async init() {
    await this.poll();
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  async poll(): Promise<void> {
    const now = this.now();
    try {
      const read = this.mock ? mockBriefing(now) : await this.fetchRead();
      this.failures = 0;
      const listed = new Set(read.inquiries.map((i) => i.id));
      this.sent = this.sent.filter((i) => !listed.has(i.id));
      const inquiries = this.mock ? this.mockAnswers(now) : [...this.sent, ...read.inquiries].slice(0, 10);
      this.view = { schema: BRIEFING_SCHEMA, state: this.mock ? 'mock' : 'live', fetchedAt: now, error: null, ...read, inquiries };
    } catch (err) {
      this.failures++;
      const error = readError(err);
      if (this.failures === 1 || this.failures % 20 === 0) this.o.log(`desk briefing: ${error}`);
      this.view = { ...this.view, state: this.view.fetchedAt === null ? 'offline' : 'stale', error };
    }
    this.o.changed(this.view);
    this.stop();
    this.timer = setTimeout(() => void this.poll(), Math.min(600_000, this.o.config.pollMs * 2 ** Math.min(this.failures, 3)));
    this.timer.unref?.();
  }

  private async fetchRead() {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (this.o.config.token) headers.authorization = `Bearer ${this.o.config.token}`;
    const res = await (this.o.fetch ?? (fetch as unknown as Fetcher))(this.o.config.url!, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (text.length > MAX_BYTES) throw new Error('unknown format: too large');
    return parseBriefing(JSON.parse(text) as unknown);
  }

  /** The manager's question to the research team: one file in MoneyPrint's inbox (temp file, then renamed). */
  async ask(raw: unknown): Promise<Inquiry> {
    const question = cleanQuestion(raw);
    if (!question) throw new HttpError(400, 'Bitte eine Frage mit 1 bis 1000 Zeichen eingeben.');
    if (this.sent.length >= 5) throw new HttpError(429, 'Es warten schon 5 Fragen; bitte erst deren Antworten abwarten.');
    const now = this.now();
    const id = crypto.randomBytes(8).toString('hex');
    const inquiry: Inquiry = { id, question, status: 'sent', askedAt: now, answeredAt: null, answer: null };
    if (!this.mock) {
      const inbox = this.o.config.inbox;
      if (!inbox) throw new HttpError(503, 'Kein Postfach für Fragen eingerichtet (CUBEFARM_TRADING_INBOX).');
      const temp = path.join(inbox, `.${id}.tmp`);
      try {
        await fs.writeFile(temp, JSON.stringify(inquiryFile(id, question, now)), { encoding: 'utf8', mode: 0o660 });
        await fs.rename(temp, path.join(inbox, `${id}.json`));
      } catch {
        await fs.rm(temp, { force: true, maxRetries: 3 }).catch(() => undefined);
        throw new HttpError(503, 'Die Frage konnte nicht ins Postfach gelegt werden.');
      }
    }
    this.sent = [inquiry, ...this.sent];
    this.view = { ...this.view, inquiries: [inquiry, ...this.view.inquiries.filter((i) => i.id !== id)].slice(0, 10) };
    this.o.changed(this.view);
    return inquiry;
  }

  /** The mock's research team answers after half a minute, clearly as a mock. */
  private mockAnswers(now: number): Inquiry[] {
    return this.sent.map((i) => (now - (i.askedAt ?? now) < 30_000 ? i : { ...i, status: 'answered', answeredAt: now, answer: mockAnswer(i.question) }));
  }
}

// ---------- the mock ----------

function mockAnswer(question: string) {
  return {
    answer: `MOCK-ANTWORT (keine echte Recherche) auf: ${question.slice(0, 120)}`,
    verdict: 'Mock: gestaffelt einsteigen',
    entry_plan: 'Mock: erste Tranche bei Rücksetzer, zweite nach bestätigtem Ausbruch.',
    exit_plan: 'Mock: Stop 8 % unter Einstieg, Ziel +15 %, nach 3 Monaten neu bewerten.',
    signals_to_watch: ['Mock: Realzinsen', 'Mock: Volumen am Ausbruch'],
    risks: ['Mock: starker Dollar'],
    watch_symbols: ['SLV'],
    sources: [],
    confidence: 0.4,
  };
}

export function mockBriefing(now: number) {
  return {
    briefingAt: now - 12 * 60_000,
    briefing: {
      headline: 'MOCK · Robotik-Lieferkette im Fokus, Krypto ruhig',
      what_changed: 'Mock-Daten: TER neu auf der Watchlist, BTC-Position unverändert.',
      watchlist: [
        { symbol: 'TER', stance: 'long', why: 'Mock: Testsysteme für Roboterarme', trigger: 'Kauf zur US-Eröffnung über 120 USD' },
        { symbol: 'SLV', stance: 'watch', why: 'Mock: Silber an Widerstand', trigger: 'Ausbruch über 32 USD' },
        { symbol: 'TWST', stance: 'watch', why: 'Mock: DNA-Synthese für Biocomputing', trigger: 'Umsatz-Guidance am Quartalstag' },
      ],
      positions: [{ symbol: 'BTC/USD', thesis: 'Mock: ETF-Zuflüsse', exit_plan: 'Stop 5 %, Ziel +8 %, spätestens Freitag prüfen' }],
      planned: [{ when: 'US-Eröffnung', symbol: 'TER', action: 'buy', because: 'Mock: Ausbruch bestätigt' }],
      sectors: [
        { sector: 'robotics', view: 'Mock: Aktuatoren und Getriebe knapp', symbols: ['TER', 'ROK'] },
        { sector: 'bioengineering', view: 'Mock: Werkzeuge statt Pure Plays', symbols: ['TWST', 'TMO'] },
        { sector: 'precious_metals', view: 'Mock: Silber seitwärts', symbols: ['SLV'] },
      ],
      risks: 'Mock: Zinsentscheid am Mittwoch',
    },
    history: [{ at: now - 72 * 60_000, headline: 'MOCK · Krypto-Desk baut BTC auf' }],
    inquiries: [],
    watchlist: [
      { symbol: 'TER', source: 'theme', note: 'Mock' },
      { symbol: 'SLV', source: 'inquiry', note: 'Mock' },
    ],
    activity: [
      { kind: 'decide', desk: 'news', status: 'running' as const, symbol: 'AMD', title: 'Mock: Q3-Zahlen über Erwartung, Prognose angehoben', since: now - 90_000 },
      { kind: 'research_theme', desk: 'robotics', status: 'running' as const, symbol: 'robotics', title: 'Mock: Aktuatoren und Getriebe', since: now - 300_000 },
      { kind: 'review_proposal', desk: 'insider_politics', status: 'queued' as const, symbol: 'NVDA', title: 'Mock: CFO-Verkauf nach 10b5-1-Plan', since: null },
    ],
    decisions: [
      { desk: 'news', at: now - 120_000, symbol: 'TMO', action: 'buy', confidence: 0.56, reason: 'Mock: Umsatz und EPS über Konsens' },
      { desk: 'positions', at: now - 600_000, symbol: 'LTC/USD', action: 'close', confidence: 0.99, reason: 'Mock: Zeitlimit abgelaufen' },
      { desk: 'news', at: now - 900_000, symbol: 'V', action: 'hold', confidence: 0.4, reason: 'Mock: keine bezifferten Effekte' },
    ],
  };
}
