// The desk briefing board's picture (BriefingWall.tsx): the CEO's headline and what changed, the watchlist with why
// and trigger, the planned moves, the sectors and the latest question to the research team, in the trading wall's
// terminal style. Painted once per change; long text is cut to fit, the panel has all of it.
import type { BriefingState, BriefingView } from '../../../shared/briefing';
import { formatTime, t } from '../i18n';
import { roundRect, SANS } from './draw';
import { TC } from './tradingDraw';

export const BRIEFING_PX: [number, number] = [1600, 900];

export const BRIEFING_STATE_COLOR: Record<BriefingState, string> = { live: TC.green, stale: TC.amber, offline: TC.red, mock: TC.violet };

function line(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, max: number, weight = 600) {
  ctx.font = `${weight} ${size}px ${SANS}`;
  ctx.fillStyle = color;
  let out = s;
  while (out.length > 2 && ctx.measureText(out).width > max) out = `${out.slice(0, -2)}…`;
  ctx.fillText(out, x, y);
}

/** Wraps text into at most `lines` lines of `max` px, the last one cut with an ellipsis. */
export function wrap(ctx: CanvasRenderingContext2D, s: string, max: number, lines: number): string[] {
  const words = s.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width <= max || !cur) cur = next;
    else {
      out.push(cur);
      cur = w;
      if (out.length === lines) break;
    }
  }
  if (out.length < lines && cur) out.push(cur);
  if (out.length === lines && words.join(' ') !== out.join(' ')) {
    let last = out[lines - 1];
    while (last.length > 2 && ctx.measureText(`${last}…`).width > max) last = last.slice(0, -1);
    out[lines - 1] = `${last}…`;
  }
  return out;
}

function card(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, title: string, accent: string) {
  roundRect(ctx, x, y, w, h, 16);
  ctx.fillStyle = TC.panel;
  ctx.fill();
  ctx.strokeStyle = TC.line;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.fillRect(x + 18, y + 16, 6, 26);
  line(ctx, title.toUpperCase(), x + 34, y + 38, 22, TC.dim, w - 50, 700);
}

const stanceColor = (s: string) => (/long|buy|kauf/i.test(s) ? TC.green : /short|sell|verk/i.test(s) ? TC.red : TC.amber);

export function drawBriefingWall(ctx: CanvasRenderingContext2D, w: number, h: number, v: BriefingView, state: BriefingState) {
  ctx.fillStyle = TC.bg;
  ctx.fillRect(0, 0, w, h);
  // header
  line(ctx, t('briefing.title'), 40, 66, 52, TC.text, 700, 800);
  line(ctx, t('briefing.subtitle'), 40, 104, 24, TC.dim, 900, 500);
  const color = BRIEFING_STATE_COLOR[state];
  ctx.font = `700 24px ${SANS}`;
  const label = t(`briefing.state.${state}`);
  const pw = ctx.measureText(label).width + 30;
  roundRect(ctx, w - 40 - pw, 40, pw, 40, 20);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();
  line(ctx, label, w - 40 - pw + 15, 68, 24, color, pw, 700);
  if (v.briefingAt) line(ctx, t('briefing.at', { time: formatTime(v.briefingAt) }), w - 40 - pw - 260, 68, 22, TC.dim, 240, 500);
  if (state === 'mock') line(ctx, t('briefing.mockBanner'), w / 2 - 260, 104, 22, TC.violet, 520, 700);

  const b = v.briefing;
  // the headline and what changed
  card(ctx, 30, 126, w - 60, 150, b?.headline || t('briefing.none'), TC.cyan);
  ctx.font = `500 26px ${SANS}`;
  wrap(ctx, b?.what_changed ? `${t('briefing.changed')}: ${b.what_changed}` : '', w - 120, 3).forEach((l, i) => line(ctx, l, 52, 186 + i * 32, 26, TC.text, w - 110, 500));

  // the watchlist: symbol, stance, why, trigger
  const colW = (w - 90) / 2;
  card(ctx, 30, 292, colW, 380, t('briefing.watchlist'), TC.green);
  (b?.watchlist ?? []).slice(0, 5).forEach((item, i) => {
    const y = 360 + i * 64;
    line(ctx, item.symbol, 52, y, 28, stanceColor(item.stance), 140, 800);
    line(ctx, item.why, 200, y - 4, 22, TC.text, colW - 190, 500);
    line(ctx, `${t('briefing.trigger')}: ${item.trigger}`, 200, y + 24, 20, TC.dim, colW - 190, 500);
  });
  // planned moves and positions
  const rx = 60 + colW;
  card(ctx, rx, 292, colW, 190, t('briefing.planned'), TC.amber);
  (b?.planned ?? []).slice(0, 3).forEach((m, i) => {
    const y = 360 + i * 40;
    line(ctx, `${m.when} · ${m.action.toUpperCase()} ${m.symbol}`, rx + 22, y, 24, stanceColor(m.action), 330, 700);
    line(ctx, `${t('briefing.because')} ${m.because}`, rx + 360, y, 20, TC.text, colW - 380, 500);
  });
  card(ctx, rx, 492, colW, 180, t('briefing.positions'), TC.cyan);
  (b?.positions ?? []).slice(0, 3).forEach((p, i) => {
    const y = 556 + i * 38;
    line(ctx, p.symbol, rx + 22, y, 24, TC.text, 150, 700);
    line(ctx, `${t('briefing.exit')}: ${p.exit_plan}`, rx + 180, y, 20, TC.dim, colW - 200, 500);
  });
  // sectors and the latest question
  card(ctx, 30, 688, colW, 186, t('briefing.sectors'), TC.violet);
  (b?.sectors ?? []).slice(0, 3).forEach((s, i) => {
    const y = 752 + i * 38;
    line(ctx, s.sector.replace(/_/g, ' '), 52, y, 22, TC.violet, 220, 700);
    line(ctx, s.view, 280, y, 20, TC.text, colW - 270, 500);
  });
  card(ctx, rx, 688, colW, 186, t('briefing.questions'), TC.amber);
  const q = v.inquiries[0];
  if (!q) line(ctx, t('briefing.noQuestions'), rx + 22, 760, 22, TC.dim, colW - 40, 500);
  else {
    line(ctx, `„${q.question}“`, rx + 22, 752, 22, TC.text, colW - 40, 600);
    const status = t(`briefing.status.${q.answer ? 'answered' : q.status === 'queued' ? 'queued' : 'sent'}`);
    line(ctx, q.answer ? `${t('briefing.verdict')}: ${q.answer.verdict}` : status, rx + 22, 792, 22, q.answer ? TC.green : TC.amber, colW - 40, 700);
    if (q.answer) line(ctx, `${t('briefing.entry')}: ${q.answer.entry_plan}`, rx + 22, 828, 20, TC.dim, colW - 40, 500);
  }
}
