import { describe, expect, it } from 'vitest';
import { cleanQuestion, parseBriefing } from './briefing.ts';

const sample = {
  schema: 'moneyprint.briefing/v1',
  briefing_at: '2026-11-18T12:00:00+00:00',
  briefing: {
    headline: 'NVDA zur Eröffnung',
    what_changed: 'BTC gehalten',
    watchlist: [{ symbol: 'NVDA', stance: 'long', why: 'KI-Capex', trigger: 'über 160 USD' }, { why: 'no symbol' }],
    positions: [{ symbol: 'BTC/USD', thesis: 'ETF', exit_plan: 'Stop 5 %' }],
    planned: [{ when: 'US-Eröffnung', symbol: 'NVDA', action: 'buy', because: 'Ausbruch' }],
    sectors: [{ sector: 'robotics', view: 'knapp', symbols: ['TER', 7] }],
    risks: 'Fed',
    extra: 'ignored',
  },
  history: [{ at: '2026-11-18T11:00:00+00:00', headline: 'früher' }],
  inquiries: [
    {
      id: 'abc123def456',
      question: 'Silber?',
      status: 'answered',
      asked_at: '2026-11-18T10:00:00+00:00',
      answered_at: 'nonsense',
      answer: { verdict: 'warten', confidence: 7, sources: ['https://ok.example/a', 'javascript:alert(1)', 'http://plain.example'] },
    },
  ],
  watchlist: [{ symbol: 'SLV', source: 'inquiry', note: 'Silber?' }],
};

describe('parseBriefing', () => {
  it('keeps bounded, typed fields and drops unsafe links', () => {
    const r = parseBriefing(sample);
    expect(r.briefingAt).toBe(Date.parse('2026-11-18T12:00:00+00:00'));
    expect(r.briefing?.watchlist).toEqual([{ symbol: 'NVDA', stance: 'long', why: 'KI-Capex', trigger: 'über 160 USD' }]);
    expect(r.briefing?.sectors[0].symbols).toEqual(['TER']);
    expect(r.briefing).not.toHaveProperty('extra');
    const [q] = r.inquiries;
    expect(q.answeredAt).toBeNull();
    expect(q.answer?.confidence).toBe(1);
    expect(q.answer?.sources).toEqual(['https://ok.example/a']);
    expect(r.watchlist.map((w) => w.symbol)).toEqual(['SLV']);
  });

  it('refuses another format and tolerates an empty briefing', () => {
    expect(() => parseBriefing({ schema: 'other' })).toThrow('unknown format');
    expect(parseBriefing({ schema: 'moneyprint.briefing/v1', briefing: null }).briefing).toBeNull();
  });
});

describe('cleanQuestion', () => {
  it('trims and bounds the manager question', () => {
    expect(cleanQuestion('  Wann   Silber? ')).toBe('Wann Silber?');
    expect(cleanQuestion('')).toBeNull();
    expect(cleanQuestion(42)).toBeNull();
    expect(cleanQuestion('x'.repeat(1001))).toBeNull();
  });
});
