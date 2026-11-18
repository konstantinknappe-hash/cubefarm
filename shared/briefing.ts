// The desk briefing board's contract (docs/desk-briefing.md): MoneyPrint's CEO briefing (what the desk watches,
// holds and plans, and why), the manager's questions to the research team with their answers, and the watchlist.
// The server reads MoneyPrint's /briefing.json and sends this view over /ws; `parseBriefing` keeps only bounded,
// typed fields so nothing unexpected reaches a tab.

export const BRIEFING_SCHEMA = 'cubefarm.briefing/v1';
export const QUESTION_MAX = 1000;

export type BriefingState = 'live' | 'stale' | 'offline' | 'mock';

export interface WatchItem {
  symbol: string;
  stance: string;
  why: string;
  trigger: string;
}
export interface PositionPlan {
  symbol: string;
  thesis: string;
  exit_plan: string;
}
export interface PlannedMove {
  when: string;
  symbol: string;
  action: string;
  because: string;
}
export interface SectorView {
  sector: string;
  view: string;
  symbols: string[];
}
export interface Briefing {
  headline: string;
  what_changed: string;
  watchlist: WatchItem[];
  positions: PositionPlan[];
  planned: PlannedMove[];
  sectors: SectorView[];
  risks: string;
}
export interface InquiryAnswer {
  answer: string;
  verdict: string;
  entry_plan: string;
  exit_plan: string;
  signals_to_watch: string[];
  risks: string[];
  watch_symbols: string[];
  sources: string[];
  confidence: number;
}
export interface Inquiry {
  id: string;
  question: string;
  status: string;
  /** Epoch ms. */
  askedAt: number | null;
  answeredAt: number | null;
  answer: InquiryAnswer | null;
}
/** A task an analyst runs or is about to: what, on which symbol, about what. */
export interface ActivityItem {
  kind: string;
  desk: string;
  status: 'running' | 'queued';
  symbol: string;
  title: string;
  since: number | null;
}
/** A decider's latest verdict on a symbol, and why. */
export interface DecisionItem {
  desk: string;
  at: number | null;
  symbol: string;
  action: string;
  confidence: number | null;
  reason: string;
}
/** The research team's long-term monthly savings plan (separate from the trading desk). */
export interface SavingsPlan {
  month: string;
  stage: string;
  summary: string;
  lookingAt: { symbol: string; name: string; status: string; why: string }[];
  allocation: { symbol: string; name: string; isin: string; eur: number; why: string }[];
  changes: string;
  risks: string;
  sources: string[];
}
export interface WatchEntry {
  symbol: string;
  source: string;
  note: string;
}

export interface BriefingView {
  schema: typeof BRIEFING_SCHEMA;
  state: BriefingState;
  /** Epoch ms of the last good read, null before the first. */
  fetchedAt: number | null;
  error: string | null;
  /** Epoch ms of the briefing itself. */
  briefingAt: number | null;
  briefing: Briefing | null;
  history: { at: number | null; headline: string }[];
  inquiries: Inquiry[];
  watchlist: WatchEntry[];
  activity: ActivityItem[];
  decisions: DecisionItem[];
  savingsPlan: SavingsPlan | null;
  savingsPlanAt: number | null;
}

export const emptyBriefingView = (): BriefingView => ({
  schema: BRIEFING_SCHEMA,
  state: 'offline',
  fetchedAt: null,
  error: null,
  briefingAt: null,
  briefing: null,
  history: [],
  inquiries: [],
  watchlist: [],
  activity: [],
  decisions: [],
  savingsPlan: null,
  savingsPlanAt: null,
});

// ---------- parsing ----------

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const list = (v: unknown, max: number): unknown[] => (Array.isArray(v) ? v.slice(0, max) : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const strings = (v: unknown, max: number, len: number) => list(v, max).map((s) => str(s, len)).filter(Boolean);
const time = (v: unknown): number | null => {
  const t = typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : null;
};
/** Only https links survive: a tab opens them, so nothing like javascript: may get through. */
const httpsOnly = (urls: string[]) => urls.filter((u) => /^https:\/\/[^\s]+$/.test(u));

function parseBriefingBody(v: unknown): Briefing | null {
  const b = obj(v);
  if (!Object.keys(b).length) return null;
  return {
    headline: str(b.headline, 200),
    what_changed: str(b.what_changed, 600),
    watchlist: list(b.watchlist, 12).map((i) => {
      const o = obj(i);
      return { symbol: str(o.symbol, 20), stance: str(o.stance, 20), why: str(o.why, 400), trigger: str(o.trigger, 300) };
    }).filter((i) => i.symbol),
    positions: list(b.positions, 12).map((i) => {
      const o = obj(i);
      return { symbol: str(o.symbol, 20), thesis: str(o.thesis, 400), exit_plan: str(o.exit_plan, 300) };
    }).filter((i) => i.symbol),
    planned: list(b.planned, 12).map((i) => {
      const o = obj(i);
      return { when: str(o.when, 80), symbol: str(o.symbol, 20), action: str(o.action, 20), because: str(o.because, 300) };
    }).filter((i) => i.symbol),
    sectors: list(b.sectors, 12).map((i) => {
      const o = obj(i);
      return { sector: str(o.sector, 60), view: str(o.view, 400), symbols: strings(o.symbols, 8, 20) };
    }).filter((i) => i.sector),
    risks: str(b.risks, 500),
  };
}

function parseAnswer(v: unknown): InquiryAnswer | null {
  const a = obj(v);
  if (!Object.keys(a).length) return null;
  const confidence = typeof a.confidence === 'number' && Number.isFinite(a.confidence) ? Math.min(1, Math.max(0, a.confidence)) : 0;
  return {
    answer: str(a.answer, 3000),
    verdict: str(a.verdict, 200),
    entry_plan: str(a.entry_plan, 800),
    exit_plan: str(a.exit_plan, 600),
    signals_to_watch: strings(a.signals_to_watch, 8, 300),
    risks: strings(a.risks, 8, 300),
    watch_symbols: strings(a.watch_symbols, 8, 20),
    sources: httpsOnly(strings(a.sources, 10, 300)),
    confidence,
  };
}

function parseSavingsPlan(v: unknown): SavingsPlan | null {
  const p = obj(v);
  if (!Object.keys(p).length) return null;
  return {
    month: str(p.month, 20),
    stage: str(p.stage, 20),
    summary: str(p.summary, 1200),
    lookingAt: list(p.looking_at, 12).map((c) => {
      const o = obj(c);
      return { symbol: str(o.symbol, 20), name: str(o.name, 80), status: str(o.status, 20), why: str(o.why, 400) };
    }).filter((c) => c.symbol || c.name),
    allocation: list(p.allocation, 12).map((c) => {
      const o = obj(c);
      const eur = typeof o.eur === 'number' && Number.isFinite(o.eur) ? Math.max(0, o.eur) : 0;
      return { symbol: str(o.symbol, 20), name: str(o.name, 80), isin: str(o.isin, 20), eur, why: str(o.why, 400) };
    }).filter((c) => c.symbol || c.name),
    changes: str(p.changes, 600),
    risks: str(p.risks, 800),
    sources: httpsOnly(strings(p.sources, 12, 300)),
  };
}

/** MoneyPrint's `moneyprint.briefing/v1` answer as the board's fields; throws on another format. */
export function parseBriefing(raw: unknown): Pick<BriefingView, 'briefingAt' | 'briefing' | 'history' | 'inquiries' | 'watchlist' | 'activity' | 'decisions' | 'savingsPlan' | 'savingsPlanAt'> {
  const r = obj(raw);
  if (r.schema !== 'moneyprint.briefing/v1') throw new Error('unknown format');
  return {
    briefingAt: time(r.briefing_at),
    briefing: parseBriefingBody(r.briefing),
    history: list(r.history, 5).map((h) => ({ at: time(obj(h).at), headline: str(obj(h).headline, 200) })),
    inquiries: list(r.inquiries, 10).map((i) => {
      const o = obj(i);
      return {
        id: str(o.id, 64),
        question: str(o.question, QUESTION_MAX),
        status: str(o.status, 20),
        askedAt: time(o.asked_at),
        answeredAt: time(o.answered_at),
        answer: parseAnswer(o.answer),
      };
    }).filter((i) => i.id && i.question),
    watchlist: list(r.watchlist, 30).map((w) => {
      const o = obj(w);
      return { symbol: str(o.symbol, 20), source: str(o.source, 20), note: str(o.note, 200) };
    }).filter((w) => w.symbol),
    activity: list(r.activity, 10).map((a) => {
      const o = obj(a);
      return {
        kind: str(o.kind, 40),
        desk: str(o.desk, 40),
        status: o.status === 'running' ? ('running' as const) : ('queued' as const),
        symbol: str(o.symbol, 20),
        title: str(o.title, 160),
        since: time(o.since),
      };
    }).filter((a) => a.kind),
    decisions: list(r.decisions, 12).map((d) => {
      const o = obj(d);
      const c = typeof o.confidence === 'number' && Number.isFinite(o.confidence) ? Math.min(1, Math.max(0, o.confidence)) : null;
      return { desk: str(o.desk, 40), at: time(o.at), symbol: str(o.symbol, 20), action: str(o.action, 12), confidence: c, reason: str(o.reason, 400) };
    }).filter((d) => d.symbol),
    savingsPlan: parseSavingsPlan(r.savings_plan),
    savingsPlanAt: time(r.savings_plan_at),
  };
}

/** A question the manager may send: trimmed, 1 to QUESTION_MAX characters; null when it isn't one. */
export function cleanQuestion(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const q = v.replace(/\s+/g, ' ').trim();
  return q && q.length <= QUESTION_MAX ? q : null;
}
