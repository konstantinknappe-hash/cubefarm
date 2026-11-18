// The desk briefing board's picture (BriefingWall.tsx): the CEO's headline and what changed, the watchlist with why
// and trigger, the planned moves, the sectors and the latest question to the research team, in the trading wall's
// terminal style. Painted once per change; long text is cut to fit, the panel has all of it.
import type { BriefingState, BriefingView } from '../../../shared/briefing';
import { formatTime, t } from '../i18n';
import { roundRect, SANS } from './draw';
import { TC } from './tradingDraw';

export const BRIEFING_PX: [number, number] = [2000, 1000];

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

const stanceColor = (s: string) => (/long|buy|kauf/i.test(s) ? TC.green : /short|sell|close|reduce|verk/i.test(s) ? TC.red : TC.amber);

const KINDS = new Set(['decide', 'review_proposal', 'process_finding', 'assess_news_batch', 'research_news', 'research_crypto_news', 'research_earnings', 'research_disclosures', 'research_theme', 'review_positions', 'reflect_trade', 'desk_review', 'desk_briefing', 'inquiry']);
/** What a task kind means, in words; an unknown one shows as it is. */
export const kindLabel = (kind: string) =>
  KINDS.has(kind) ? t(`briefing.kind.${kind.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())}` as 'briefing.kind.decide') : kind;

export function drawBriefingWall(ctx: CanvasRenderingContext2D, w: number, h: number, v: BriefingView, state: BriefingState) {
  ctx.fillStyle = TC.bg;
  ctx.fillRect(0, 0, w, h);
  // header
  line(ctx, t('briefing.title'), 40, 70, 56, TC.text, 700, 800);
  line(ctx, t('briefing.subtitle'), 40, 108, 24, TC.dim, 900, 500);
  const color = BRIEFING_STATE_COLOR[state];
  ctx.font = `700 26px ${SANS}`;
  const label = t(`briefing.state.${state}`);
  const pw = ctx.measureText(label).width + 32;
  roundRect(ctx, w - 40 - pw, 40, pw, 44, 22);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();
  line(ctx, label, w - 40 - pw + 16, 71, 26, color, pw, 700);
  if (v.briefingAt) line(ctx, t('briefing.at', { time: formatTime(v.briefingAt) }), w - 40 - pw - 280, 71, 24, TC.dim, 260, 500);
  if (state === 'mock') line(ctx, t('briefing.mockBanner'), 760, 71, 24, TC.violet, 600, 700);

  const b = v.briefing;
  // the CEO's headline and what changed
  card(ctx, 30, 126, w - 60, 120, b?.headline || t('briefing.none'), TC.cyan);
  ctx.font = `500 26px ${SANS}`;
  wrap(ctx, b?.what_changed ? `${t('briefing.changed')}: ${b.what_changed}` : '', w - 110, 2).forEach((l, i) => line(ctx, l, 54, 196 + i * 32, 26, TC.text, w - 100, 500));

  const gap = 20;
  const cw = (w - 60 - gap * 2) / 3;
  const cx = [30, 30 + cw + gap, 30 + (cw + gap) * 2];
  // row 1: watchlist · working on now · latest decisions
  const r1 = 262;
  const r1h = 420;
  card(ctx, cx[0], r1, cw, r1h, t('briefing.watchlist'), TC.green);
  (b?.watchlist ?? []).slice(0, 5).forEach((item, i) => {
    const y = r1 + 92 + i * 68;
    line(ctx, item.symbol, cx[0] + 22, y, 28, stanceColor(item.stance), 130, 800);
    line(ctx, item.why, cx[0] + 160, y - 6, 22, TC.text, cw - 180, 500);
    line(ctx, `${t('briefing.trigger')}: ${item.trigger}`, cx[0] + 160, y + 22, 20, TC.dim, cw - 180, 500);
  });
  card(ctx, cx[1], r1, cw, r1h, t('briefing.activity'), TC.amber);
  if (!v.activity.length) line(ctx, t('briefing.noActivity'), cx[1] + 22, r1 + 96, 22, TC.dim, cw - 40, 500);
  v.activity.slice(0, 6).forEach((a, i) => {
    const y = r1 + 92 + i * 54;
    ctx.fillStyle = a.status === 'running' ? TC.green : TC.dim;
    ctx.beginPath();
    ctx.arc(cx[1] + 30, y - 8, 7, 0, Math.PI * 2);
    ctx.fill();
    line(ctx, `${a.symbol || '—'} · ${kindLabel(a.kind)}`, cx[1] + 48, y - 2, 22, a.status === 'running' ? TC.text : TC.dim, cw - 70, 700);
    line(ctx, a.title, cx[1] + 48, y + 22, 18, TC.dim, cw - 70, 500);
  });
  card(ctx, cx[2], r1, cw, r1h, t('briefing.decisions'), TC.violet);
  v.decisions.slice(0, 5).forEach((d, i) => {
    const y = r1 + 92 + i * 68;
    const conf = d.confidence == null ? '' : ` ${Math.round(d.confidence * 100)} %`;
    line(ctx, `${d.action.toUpperCase()} ${d.symbol}${conf}`, cx[2] + 22, y - 6, 24, stanceColor(d.action), cw - 40, 800);
    line(ctx, d.reason, cx[2] + 22, y + 22, 19, TC.text, cw - 40, 500);
  });
  // row 2: planned moves · sectors · the latest question
  const r2 = r1 + r1h + 16;
  const r2h = h - r2 - 20;
  card(ctx, cx[0], r2, cw, r2h, t('briefing.planned'), TC.amber);
  (b?.planned ?? []).slice(0, 4).forEach((m, i) => {
    const y = r2 + 90 + i * 52;
    line(ctx, `${m.when} · ${m.action.toUpperCase()} ${m.symbol}`, cx[0] + 22, y - 4, 22, stanceColor(m.action), cw - 40, 700);
    line(ctx, `${t('briefing.because')} ${m.because}`, cx[0] + 22, y + 20, 18, TC.dim, cw - 40, 500);
  });
  // the research team's long-term savings plan (the sectors are in the panel)
  const sp = v.savingsPlan;
  card(ctx, cx[1], r2, cw, r2h, sp ? `${t('briefing.savings', { month: sp.month })} · ${t(`briefing.stage.${sp.stage === 'final' ? 'final' : sp.stage === 'research' ? 'research' : 'proposal'}`)}` : t('briefing.savings', { month: '' }), TC.green);
  if (!sp) line(ctx, t('briefing.savingsNone'), cx[1] + 22, r2 + 96, 20, TC.dim, cw - 40, 500);
  else if (sp.allocation.length)
    sp.allocation.slice(0, 4).forEach((a, i) => {
      const y = r2 + 90 + i * 52;
      line(ctx, `${a.symbol || a.name} · ${Math.round(a.eur).toLocaleString('de-DE')} €`, cx[1] + 22, y - 4, 22, TC.green, cw - 40, 700);
      line(ctx, [a.holdFor, a.exitPlan || a.why].filter(Boolean).join(' · ') || a.name, cx[1] + 22, y + 20, 18, TC.text, cw - 40, 500);
    });
  else
    sp.lookingAt.slice(0, 4).forEach((c, i) => {
      const y = r2 + 90 + i * 52;
      line(ctx, `${c.symbol || c.name} · ${c.status}`, cx[1] + 22, y - 4, 22, TC.green, cw - 40, 700);
      line(ctx, c.why, cx[1] + 22, y + 20, 18, TC.text, cw - 40, 500);
    });
  card(ctx, cx[2], r2, cw, r2h, t('briefing.questions'), TC.cyan);
  const q = v.inquiries[0];
  if (!q) line(ctx, t('briefing.noQuestions'), cx[2] + 22, r2 + 96, 22, TC.dim, cw - 40, 500);
  else {
    ctx.font = `600 22px ${SANS}`;
    wrap(ctx, `„${q.question}“`, cw - 44, 2).forEach((l, i) => line(ctx, l, cx[2] + 22, r2 + 88 + i * 28, 22, TC.text, cw - 40, 600));
    const status = t(`briefing.status.${q.answer ? 'answered' : q.status === 'queued' ? 'queued' : 'sent'}`);
    line(ctx, q.answer ? `${t('briefing.verdict')}: ${q.answer.verdict}` : status, cx[2] + 22, r2 + 158, 22, q.answer ? TC.green : TC.amber, cw - 40, 700);
    if (q.answer) {
      ctx.font = `500 19px ${SANS}`;
      wrap(ctx, `${t('briefing.entry')}: ${q.answer.entry_plan}`, cw - 44, 3).forEach((l, i) => line(ctx, l, cx[2] + 22, r2 + 192 + i * 24, 19, TC.dim, cw - 40, 500));
    }
  }
}
