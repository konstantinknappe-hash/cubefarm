// The trading wallboard's picture (TradingWall.tsx): a dark terminal-style screen with the TO THE MOON header and its
// rocket, the KPIs, the equity chart, the bot's status, the open positions and the latest fills; and the ticker strip
// under it, painted once per change and scrolled by the GPU. Every value that isn't there reads "n/a", never 0.
import { feedState, maxDrawdownPct, price, qty, signedPct, signedUsd, sortPositions, usd, type FeedState, type HistoryRange, type MarketQuote, type TradingView } from '../../../shared/trading';
import { formatDate, formatTime, t } from '../i18n';
import { MONO, roundRect, SANS } from './draw';
import { chartGeometry } from './tradingChart';

export const TC = {
  bg: '#0a0e16',
  panel: '#111827',
  line: '#1f2a3d',
  grid: 'rgba(120, 160, 220, 0.08)',
  text: '#f4f7fb',
  dim: '#8a97ad',
  green: '#22e39a',
  red: '#ff4d6d',
  cyan: '#38d6ff',
  violet: '#a77bff',
  amber: '#ffc04d',
};

export const STATE_COLOR: Record<FeedState, string> = { live: TC.green, stale: TC.amber, offline: TC.red, mock: TC.violet };

export const tone = (n: number | null | undefined) => (n == null ? TC.dim : n >= 0 ? TC.green : TC.red);
const na = () => t('trading.na');
const or = (n: number | null | undefined, f: (n: number) => string) => (n == null ? na() : f(n));

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, opts: { align?: CanvasTextAlign; weight?: number; font?: string; max?: number } = {}) {
  ctx.font = `${opts.weight ?? 600} ${size}px ${opts.font ?? SANS}`;
  ctx.fillStyle = color;
  ctx.textAlign = opts.align ?? 'left';
  let out = s;
  if (opts.max) while (out.length > 2 && ctx.measureText(out).width > opts.max) out = `${out.slice(0, -2)}…`;
  ctx.fillText(out, x, y);
  ctx.textAlign = 'left';
}

function pill(ctx: CanvasRenderingContext2D, label: string, x: number, y: number, size: number, color: string, filled = false) {
  ctx.font = `700 ${size}px ${SANS}`;
  const w = ctx.measureText(label).width + size * 1.1;
  const h = size * 1.6;
  roundRect(ctx, x - w, y - h / 2, w, h, h / 2);
  ctx.fillStyle = filled ? color : 'rgba(255,255,255,0.03)';
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  text(ctx, label, x - w / 2, y + 1, size, filled ? TC.bg : color, { align: 'center', weight: 700 });
  return w;
}

/** The stylised rocket: a body, a window, fins and a flame, pointing up and right. */
export function drawRocket(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI / 4);
  const flame = ctx.createLinearGradient(0, s * 0.5, 0, s * 1.25);
  flame.addColorStop(0, '#ffd166');
  flame.addColorStop(1, 'rgba(255, 77, 109, 0)');
  ctx.fillStyle = flame;
  ctx.beginPath();
  ctx.moveTo(-s * 0.16, s * 0.48);
  ctx.quadraticCurveTo(0, s * 1.3, s * 0.16, s * 0.48);
  ctx.fill();
  ctx.fillStyle = TC.violet;
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(sx * s * 0.2, s * 0.12);
    ctx.lineTo(sx * s * 0.42, s * 0.55);
    ctx.lineTo(sx * s * 0.2, s * 0.45);
    ctx.closePath();
    ctx.fill();
  }
  const body = ctx.createLinearGradient(-s * 0.22, 0, s * 0.22, 0);
  body.addColorStop(0, '#dfe7f5');
  body.addColorStop(1, '#8fa3c4');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.62);
  ctx.bezierCurveTo(s * 0.3, -s * 0.3, s * 0.24, s * 0.3, s * 0.18, s * 0.5);
  ctx.lineTo(-s * 0.18, s * 0.5);
  ctx.bezierCurveTo(-s * 0.24, s * 0.3, -s * 0.3, -s * 0.3, 0, -s * 0.62);
  ctx.fill();
  ctx.fillStyle = TC.cyan;
  ctx.beginPath();
  ctx.arc(0, -s * 0.1, s * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = TC.bg;
  ctx.lineWidth = s * 0.03;
  ctx.stroke();
  ctx.restore();
}

function stars(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (let i = 0; i < 70; i++) {
    const x = (i * 337) % w;
    const y = (i * 211) % h;
    const r = i % 7 === 0 ? 2 : 1.2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A titled dark card. */
function card(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, title?: string, accent = TC.cyan) {
  roundRect(ctx, x, y, w, h, 14);
  ctx.fillStyle = 'rgba(17, 24, 39, 0.92)';
  ctx.fill();
  ctx.strokeStyle = TC.line;
  ctx.lineWidth = 2;
  ctx.stroke();
  if (title) {
    ctx.fillStyle = accent;
    ctx.fillRect(x + 18, y + 22, 5, 26);
    text(ctx, title.toUpperCase(), x + 34, y + 36, 26, TC.dim, { weight: 700 });
  }
}

/** Ticks on the time axis: hours within a day, else day and month. */
export const timeTick = (ms: number, range: HistoryRange) => (range === '24h' ? formatTime(ms) : formatDate(ms, { day: '2-digit', month: '2-digit' }));

/** Compact USD for axes: "$102.4k". */
export const axisUsd = (v: number) => (Math.abs(v) >= 10_000 ? `$${(v / 1000).toFixed(1)}k` : `$${Math.round(v)}`);

export interface WallExtras {
  now: number;
  range: HistoryRange;
  /** Order ids of fills to highlight (just arrived). */
  fresh: ReadonlySet<string>;
}

export const WALL_PX = [2048, 960] as const;
/** The chart's box on the wall canvas, so TradingWall can put its pulsing dot on the last point. */
export const WALL_CHART = { x: 60, y: 410, w: 1180, h: 460 };

export function drawTradingWall(ctx: CanvasRenderingContext2D, w: number, h: number, v: TradingView, x: WallExtras) {
  const state = feedState(v, x.now);
  ctx.textBaseline = 'middle';
  ctx.fillStyle = TC.bg;
  ctx.fillRect(0, 0, w, h);
  const glowL = ctx.createRadialGradient(240, 80, 10, 240, 80, 700);
  glowL.addColorStop(0, 'rgba(167, 123, 255, 0.20)');
  glowL.addColorStop(1, 'rgba(167, 123, 255, 0)');
  ctx.fillStyle = glowL;
  ctx.fillRect(0, 0, w, h);
  const glowR = ctx.createRadialGradient(w - 200, h - 120, 10, w - 200, h - 120, 600);
  glowR.addColorStop(0, 'rgba(56, 214, 255, 0.12)');
  glowR.addColorStop(1, 'rgba(56, 214, 255, 0)');
  ctx.fillStyle = glowR;
  ctx.fillRect(0, 0, w, h);
  stars(ctx, w, h);

  // ---------- header ----------
  drawRocket(ctx, 98, 74, 104);
  const title = ctx.createLinearGradient(170, 0, 760, 0);
  title.addColorStop(0, '#ffffff');
  title.addColorStop(1, '#cdb8ff');
  ctx.font = `700 88px ${SANS}`;
  ctx.fillStyle = title;
  ctx.fillText(t('trading.title'), 172, 70);
  text(ctx, t('trading.subtitle'), 176, 128, 28, TC.dim, { weight: 500 });

  let px = w - 48;
  const stateLabel = t(`trading.state.${state}`);
  px -= pill(ctx, `● ${stateLabel}`, px, 64, 30, STATE_COLOR[state], state === 'mock') + 18;
  const mode = v.system.trading_mode;
  if (mode === 'live') pill(ctx, t('trading.liveWarning'), px, 64, 30, TC.red, true);
  else pill(ctx, t('trading.paper'), px, 64, 30, TC.cyan);
  const stamp = v.fetchedAt ? t('trading.updated', { time: formatTime(v.fetchedAt) }) : t('trading.never');
  text(ctx, mode === 'unknown' ? `${stamp} · ${t('trading.modeUnreported')}` : stamp, w - 48, 124, 26, state === 'live' || state === 'mock' ? TC.dim : STATE_COLOR[state], { align: 'right', weight: 500 });

  if (v.source === 'mock') {
    roundRect(ctx, 820, 34, 560, 66, 12);
    ctx.fillStyle = 'rgba(167, 123, 255, 0.18)';
    ctx.fill();
    ctx.strokeStyle = TC.violet;
    ctx.lineWidth = 3;
    ctx.stroke();
    text(ctx, t('trading.mockBanner'), 1100, 68, 32, '#e6dcff', { align: 'center', weight: 700 });
  } else if (state !== 'live' && v.error) {
    text(ctx, v.error, 1100, 68, 28, STATE_COLOR[state], { align: 'center', weight: 600, max: 640 });
  }

  // ---------- KPIs ----------
  const a = v.account;
  const dd = maxDrawdownPct(v.history.all);
  card(ctx, 40, 160, 1220, 220);
  text(ctx, t('trading.equity').toUpperCase(), 70, 200, 26, TC.dim, { weight: 700 });
  text(ctx, or(a.equity, (n) => usd(n)), 66, 262, 74, TC.text, { weight: 700 });
  text(ctx, `${t('trading.dayPnl')}  ${or(a.day_pnl, (n) => signedUsd(n))}`, 70, 336, 30, tone(a.day_pnl), { weight: 600 });
  const kpis: [string, string, string][] = [
    [t('trading.totalPnl'), or(a.total_pnl, (n) => signedUsd(n)), tone(a.total_pnl)],
    [t('trading.totalReturn'), or(a.total_return_pct, (n) => signedPct(n)), tone(a.total_return_pct)],
    [t('trading.drawdown'), or(dd, (n) => signedPct(n)), dd == null ? TC.dim : dd < 0 ? TC.red : TC.text],
    [t('trading.cash'), or(a.cash, (n) => usd(n, 0)), a.cash == null ? TC.dim : TC.text],
    [t('trading.invested'), or(a.invested, (n) => usd(n, 0)), a.invested == null ? TC.dim : TC.text],
    [t('trading.buyingPower'), or(a.buying_power, (n) => usd(n, 0)), a.buying_power == null ? TC.dim : TC.text],
  ];
  kpis.forEach(([label, value, color], i) => {
    const kx = 560 + (i % 3) * 232;
    const ky = 214 + Math.floor(i / 3) * 96;
    text(ctx, label.toUpperCase(), kx, ky, 22, TC.dim, { weight: 700, max: 220 });
    text(ctx, value, kx, ky + 42, 36, color, { weight: 700, max: 222 });
  });

  // ---------- chart ----------
  card(ctx, 40, 396, 1220, 500);
  const pts = v.history[x.range];
  const box = WALL_CHART;
  const g = chartGeometry(pts, x.range, x.now, { x: box.x + 10, y: box.y + 60, w: box.w - 150, h: box.h - 110 });
  text(ctx, `${t('trading.chart').toUpperCase()} · ${t(`trading.range.${x.range}`)}`, 74, 432, 26, TC.dim, { weight: 700 });
  text(ctx, t('trading.points', { count: pts.length }), 1236, 432, 22, TC.dim, { align: 'right', weight: 500 });
  // the moon, behind the line
  const moon = ctx.createRadialGradient(1120, 520, 4, 1120, 520, 70);
  moon.addColorStop(0, 'rgba(230, 230, 255, 0.22)');
  moon.addColorStop(1, 'rgba(230, 230, 255, 0)');
  ctx.fillStyle = moon;
  ctx.beginPath();
  ctx.arc(1120, 520, 70, 0, Math.PI * 2);
  ctx.fill();
  drawChart(ctx, g, x.range, box.x + 10 + box.w - 150);
  if (!pts.length) text(ctx, t('trading.noHistory'), box.x + box.w / 2 - 60, box.y + box.h / 2, 32, TC.dim, { align: 'center' });
  if (v.source === 'mock') {
    ctx.save();
    ctx.globalAlpha = 0.07;
    text(ctx, 'MOCK', 650, 660, 220, TC.violet, { align: 'center', weight: 700 });
    ctx.restore();
  }

  // ---------- status ----------
  const sx = 1290;
  const sw = w - sx - 40;
  card(ctx, sx, 160, sw, 236, undefined);
  const s = v.system;
  const val = (k: string) => t(`trading.val.${k}`);
  // last known values while the feed isn't current: shown, but greyed so they don't read as the bot's state now
  const current = state === 'live' || state === 'mock';
  const statusTone: Record<string, string> = current
    ? { active: TC.green, connected: TC.green, ok: TC.green, off: TC.green, paused: TC.amber, halted: TC.red, error: TC.red, disconnected: TC.red, on: TC.red, unknown: TC.dim }
    : {};
  const rows: [string, string, string][] = [
    [t('trading.sys.bot'), val(s.bot_status), statusTone[s.bot_status] ?? TC.dim],
    [t('trading.sys.broker'), val(s.broker_connection), statusTone[s.broker_connection] ?? TC.dim],
    [t('trading.sys.risk'), val(s.risk_status), statusTone[s.risk_status] ?? TC.dim],
    [t('trading.sys.kill'), val(s.kill_switch), statusTone[s.kill_switch] ?? TC.dim],
    [t('trading.sys.strategies'), s.active_strategies == null ? na() : String(s.active_strategies), s.active_strategies == null ? TC.dim : TC.text],
    [t('trading.sys.update'), s.last_successful_update ? formatTime(s.last_successful_update) : na(), s.last_successful_update && current ? TC.text : TC.dim],
  ];
  rows.forEach(([label, value, color], i) => {
    const cx = sx + 28 + (i % 2) * (sw / 2);
    const cy = 200 + Math.floor(i / 2) * 70;
    text(ctx, label.toUpperCase(), cx, cy, 21, TC.dim, { weight: 700 });
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx + 8, cy + 34, 7, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, value, cx + 24, cy + 35, 28, color, { weight: 700, max: sw / 2 - 60 });
  });

  // ---------- positions ----------
  card(ctx, sx, 410, sw, 220, t('trading.positions'), TC.violet);
  const pos = sortPositions(v.positions).slice(0, 4);
  if (!pos.length) text(ctx, t('trading.noPositions'), sx + 34, 500, 26, TC.dim);
  pos.forEach((p, i) => {
    const py = 486 + i * 38;
    const value = p.market_value ?? p.notional;
    text(ctx, p.symbol, sx + 34, py, 27, TC.text, { weight: 700, font: MONO, max: 150 });
    text(ctx, or(value, (n) => usd(n, 0)), sx + 330, py, 26, value == null ? TC.dim : TC.text, { align: 'right', weight: 600, font: MONO });
    text(ctx, or(p.unrealized_pnl, (n) => signedUsd(n, 0)), sx + 520, py, 26, tone(p.unrealized_pnl), { align: 'right', weight: 600, font: MONO });
    text(ctx, or(p.unrealized_pnl_pct, (n) => signedPct(n, 1)), sx + sw - 26, py, 26, tone(p.unrealized_pnl_pct), { align: 'right', weight: 600, font: MONO });
  });

  // ---------- fills ----------
  card(ctx, sx, 644, sw, 252, t('trading.fills'), TC.green);
  const fills = v.recent_fills.slice(0, 5);
  if (!fills.length) text(ctx, t('trading.noFills'), sx + 34, 730, 26, TC.dim);
  fills.forEach((f, i) => {
    const fy = 718 + i * 36;
    const buy = f.side === 'buy';
    if (x.fresh.has(f.order_id)) {
      roundRect(ctx, sx + 14, fy - 17, sw - 28, 34, 8);
      ctx.fillStyle = buy ? 'rgba(34, 227, 154, 0.22)' : 'rgba(255, 77, 109, 0.22)';
      ctx.fill();
    }
    text(ctx, buy ? t('trading.buy') : t('trading.sell'), sx + 34, fy, 22, buy ? TC.green : TC.red, { weight: 700 });
    text(ctx, f.symbol, sx + 160, fy, 25, TC.text, { weight: 700, font: MONO, max: 140 });
    text(ctx, `${qty(f.quantity)} @ ${price(f.fill_price)}`, sx + 310, fy, 23, TC.text, { weight: 500, font: MONO, max: 270 });
    text(ctx, f.filled_at ? formatTime(f.filled_at) : na(), sx + sw - 26, fy, 23, TC.dim, { align: 'right', weight: 500, font: MONO });
  });

  // a thin neon rule above the ticker
  const rule = ctx.createLinearGradient(0, 0, w, 0);
  rule.addColorStop(0, TC.violet);
  rule.addColorStop(0.5, TC.cyan);
  rule.addColorStop(1, TC.green);
  ctx.fillStyle = rule;
  ctx.fillRect(0, h - 6, w, 6);
}

/** The chart's grid, axes, area and strokes into a canvas. `right` is where the value axis' labels start. */
function drawChart(ctx: CanvasRenderingContext2D, g: ReturnType<typeof chartGeometry>, range: HistoryRange, right: number) {
  ctx.strokeStyle = TC.grid;
  ctx.lineWidth = 2;
  for (const tick of g.yTicks) {
    ctx.beginPath();
    ctx.moveTo(g.xTicks[0]?.x ?? 0, tick.y);
    ctx.lineTo(right, tick.y);
    ctx.stroke();
    text(ctx, axisUsd(tick.value), right + 14, tick.y, 22, TC.dim, { weight: 500, font: MONO });
  }
  const bottom = Math.max(...g.yTicks.map((y) => y.y), 0) + 40;
  for (const tick of g.xTicks) text(ctx, timeTick(tick.time, range), tick.x, Math.min(bottom, 868), 22, TC.dim, { align: 'center', weight: 500, font: MONO });
  if (g.baseY !== null) {
    ctx.setLineDash([8, 10]);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.moveTo(g.xTicks[0].x, g.baseY);
    ctx.lineTo(right, g.baseY);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for (const s of g.strokes) {
    if (s.pts.length < 2 || g.baseY === null) continue;
    const color = s.up ? TC.green : TC.red;
    const area = ctx.createLinearGradient(0, Math.min(...s.pts.map((p) => p[1])), 0, g.baseY);
    area.addColorStop(0, s.up ? 'rgba(34, 227, 154, 0.28)' : 'rgba(255, 77, 109, 0.04)');
    area.addColorStop(1, s.up ? 'rgba(34, 227, 154, 0.02)' : 'rgba(255, 77, 109, 0.28)');
    ctx.fillStyle = area;
    ctx.beginPath();
    ctx.moveTo(s.pts[0][0], g.baseY);
    for (const [px, py] of s.pts) ctx.lineTo(px, py);
    ctx.lineTo(s.pts[s.pts.length - 1][0], g.baseY);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 4.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    s.pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (const [px, py] of g.dots) {
    ctx.beginPath();
    ctx.arc(px, py, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  if (g.last) {
    roundRect(ctx, right - 4, g.last.y - 20, 150, 40, 8);
    ctx.fillStyle = TC.cyan;
    ctx.fill();
    text(ctx, axisUsd(g.last.equity), right + 71, g.last.y + 1, 24, TC.bg, { align: 'center', weight: 700, font: MONO });
  }
}

/** One quote as the ticker says it: "BTC/USD  $63,980.00  +1.25%". */
export function tickerItem(q: MarketQuote): { symbol: string; price: string; change: string; color: string } {
  return { symbol: q.symbol, price: q.price == null ? na() : price(q.price), change: q.change_pct == null ? '' : signedPct(q.change_pct), color: tone(q.change_pct) };
}

export const TICKER_PX = [2048, 56] as const;

/** The ticker strip: the quotes laid out once across the texture (it repeats as it scrolls). */
export function drawTicker(ctx: CanvasRenderingContext2D, w: number, h: number, quotes: readonly MarketQuote[], symbols: readonly string[], mock: boolean, now: number) {
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#05070c';
  ctx.fillRect(0, 0, w, h);
  const items = quotes.length ? quotes.map(tickerItem) : null;
  if (!items) {
    const line = `${symbols.join('   ·   ')}   —   ${t('trading.noQuotes')}`;
    text(ctx, line, w / 2, h / 2 + 1, 26, TC.dim, { align: 'center', weight: 600, font: MONO });
    return;
  }
  const slot = w / items.length;
  items.forEach((it, i) => {
    const cx = i * slot + 24;
    const q = quotes[i];
    const old = q.timestamp != null && now - q.timestamp > 15 * 60_000;
    text(ctx, it.symbol, cx, h / 2 + 1, 26, TC.cyan, { weight: 700, font: MONO });
    ctx.font = `700 26px ${MONO}`;
    const sw = ctx.measureText(it.symbol).width;
    text(ctx, it.price, cx + sw + 16, h / 2 + 1, 26, TC.text, { weight: 600, font: MONO });
    ctx.font = `600 26px ${MONO}`;
    const pw = ctx.measureText(it.price).width;
    const extra = `${it.change}${old && q.timestamp ? ` · ${formatTime(q.timestamp)}` : ''}${mock ? ' · mock' : ''}`;
    text(ctx, extra, cx + sw + pw + 30, h / 2 + 1, 24, old ? TC.amber : it.color, { weight: 600, font: MONO, max: slot - sw - pw - 50 });
  });
}
