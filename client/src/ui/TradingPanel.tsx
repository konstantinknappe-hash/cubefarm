// The trading wallboard up close (docs/trading-wallboard.md): opened from the wall on the trading floor (E or a
// click), it shows the same store numbers as the wall, with every range of the chart, every position and the last
// ten fills. Read-only: there is nothing here that could send an order or change MoneyPrint.
import { useEffect, useRef, useState } from 'react';
import { feedState, HISTORY_RANGES, maxDrawdownPct, price, qty, signedPct, signedUsd, sortPositions, usd, type HistoryRange } from '../../../shared/trading';
import { formatDate, formatTime, useT } from '../i18n';
import { useStore } from '../store';
import { chartGeometry, wallRange } from '../world/tradingChart';
import { axisUsd, STATE_COLOR, tickerItem, timeTick, tone } from '../world/tradingDraw';
import { Panel } from './Panel';

const VIEW = { w: 1000, h: 340 };
const BOX = { x: 10, y: 16, w: 880, h: 280 };

function Chart({ range }: { range: HistoryRange }) {
  const t = useT();
  const v = useStore((s) => s.trading);
  const pts = v.history[range];
  const g = chartGeometry(pts, range, v.fetchedAt ?? Date.now(), BOX);
  const right = BOX.x + BOX.w;
  return (
    <svg className="trading-chart" viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} role="img" aria-label={`${t('trading.chart')} · ${t(`trading.range.${range}`)} · ${t('trading.points', { count: pts.length })}`}>
      <defs>
        <linearGradient id="trading-up" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#22e39a" stopOpacity="0.3" />
          <stop offset="1" stopColor="#22e39a" stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id="trading-down" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff4d6d" stopOpacity="0.02" />
          <stop offset="1" stopColor="#ff4d6d" stopOpacity="0.3" />
        </linearGradient>
      </defs>
      {g.yTicks.map((tick) => (
        <g key={tick.value}>
          <line x1={BOX.x} x2={right} y1={tick.y} y2={tick.y} className="trading-grid" />
          <text x={right + 10} y={tick.y + 4} className="trading-axis">
            {axisUsd(tick.value)}
          </text>
        </g>
      ))}
      {g.xTicks.map((tick, i) => (
        <text key={i} x={tick.x} y={VIEW.h - 8} textAnchor={i === 0 ? 'start' : i === g.xTicks.length - 1 ? 'end' : 'middle'} className="trading-axis">
          {timeTick(tick.time, range)}
        </text>
      ))}
      {g.baseY !== null && <line x1={BOX.x} x2={right} y1={g.baseY} y2={g.baseY} className="trading-base" />}
      {g.baseY !== null &&
        g.strokes.map((s, i) => {
          const line = s.pts.map(([x, y], j) => `${j ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
          const area = `${line} L${s.pts[s.pts.length - 1][0].toFixed(1)},${g.baseY!.toFixed(1)} L${s.pts[0][0].toFixed(1)},${g.baseY!.toFixed(1)} Z`;
          return (
            <g key={i}>
              <path d={area} fill={`url(#trading-${s.up ? 'up' : 'down'})`} />
              <path d={line} className={s.up ? 'trading-line up' : 'trading-line down'} />
            </g>
          );
        })}
      {g.dots.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={2.5} className="trading-dot" />
      ))}
      {g.last && <circle cx={g.last.x} cy={g.last.y} r={5} className="trading-last" />}
      {!pts.length && (
        <text x={BOX.x + BOX.w / 2} y={BOX.y + BOX.h / 2} textAnchor="middle" className="trading-empty">
          {t('trading.noHistory')}
        </text>
      )}
    </svg>
  );
}

/** Ids of fills that arrived while the panel is open, for a short highlight. */
function useArrivals(ids: string[]) {
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const key = ids.join('|');
  useEffect(() => {
    const now = new Set(ids);
    const before = seen.current;
    seen.current = now;
    if (!before) return;
    const added = ids.filter((id) => !before.has(id));
    if (!added.length) return;
    setFresh(new Set(added));
    const timer = setTimeout(() => setFresh(new Set()), 8000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return fresh;
}

export function TradingPanel() {
  const t = useT();
  const v = useStore((s) => s.trading);
  const [range, setRange] = useState<HistoryRange>(() => wallRange(v));
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);
  const state = feedState(v, clock);
  const a = v.account;
  const s = v.system;
  const na = t('trading.na');
  const or = (n: number | null | undefined, f: (n: number) => string) => (n == null ? na : f(n));
  const dd = maxDrawdownPct(v.history.all);
  const fresh = useArrivals(v.recent_fills.map((f) => f.order_id));
  const val = (k: string) => t(`trading.val.${k}`);
  const good = new Set(['active', 'connected', 'ok', 'off']);
  const bad = new Set(['halted', 'error', 'disconnected', 'on']);
  // last known values while the feed isn't current are greyed, so they don't read as the bot's state now
  const current = state === 'live' || state === 'mock';
  const look = (k: string) => (!current ? 'dim' : good.has(k) ? 'good' : bad.has(k) ? 'bad' : k === 'paused' ? 'warn' : 'dim');

  const kpis: [string, string, string][] = [
    [t('trading.equity'), or(a.equity, (n) => usd(n)), a.equity == null ? 'dim' : ''],
    [t('trading.dayPnl'), or(a.day_pnl, (n) => signedUsd(n)), a.day_pnl == null ? 'dim' : a.day_pnl >= 0 ? 'good' : 'bad'],
    [t('trading.totalPnl'), or(a.total_pnl, (n) => signedUsd(n)), a.total_pnl == null ? 'dim' : a.total_pnl >= 0 ? 'good' : 'bad'],
    [t('trading.totalReturn'), or(a.total_return_pct, (n) => signedPct(n)), a.total_return_pct == null ? 'dim' : a.total_return_pct >= 0 ? 'good' : 'bad'],
    [t('trading.cash'), or(a.cash, (n) => usd(n)), a.cash == null ? 'dim' : ''],
    [t('trading.invested'), or(a.invested, (n) => usd(n)), a.invested == null ? 'dim' : ''],
    [t('trading.buyingPower'), or(a.buying_power, (n) => usd(n)), a.buying_power == null ? 'dim' : ''],
    [t('trading.realized'), or(a.realized_pnl, (n) => signedUsd(n)), a.realized_pnl == null ? 'dim' : a.realized_pnl >= 0 ? 'good' : 'bad'],
    [`${t('trading.drawdown')}${dd == null ? '' : ` (${t('trading.drawdownOf', { count: v.history.all.length })})`}`, or(dd, (n) => signedPct(n)), dd == null ? 'dim' : dd < 0 ? 'bad' : ''],
  ];

  return (
    <Panel title={t('trading.panelTitle')} wide accent="#a77bff" className="trading-panel">
      <div className="trading-body">
        <div className="trading-top">
          <span className={s.trading_mode === 'live' ? 'trading-badge bad' : 'trading-badge paper'}>{s.trading_mode === 'live' ? t('trading.liveWarning') : t('trading.paper')}</span>
          <span className="trading-badge" style={{ color: STATE_COLOR[state], borderColor: STATE_COLOR[state] }}>
            <span className={state === 'live' || state === 'mock' ? 'trading-led pulse' : 'trading-led'} style={{ background: STATE_COLOR[state] }} />
            {t(`trading.state.${state}`)}
          </span>
          <span className="trading-muted">
            {v.fetchedAt ? t('trading.updated', { time: `${formatDate(v.fetchedAt, { day: '2-digit', month: '2-digit' })} ${formatTime(v.fetchedAt, { second: '2-digit' })}` }) : t('trading.never')}
            {s.trading_mode === 'unknown' ? ` · ${t('trading.modeUnreported')}` : ''}
          </span>
        </div>
        {v.source === 'mock' && <div className="trading-mock">{t('trading.mockBanner')}</div>}
        {v.error && state !== 'live' && <div className="trading-error">{t('trading.error', { error: v.error })}</div>}

        <div className="trading-kpis">
          {kpis.map(([label, value, cls]) => (
            <div key={label} className="trading-kpi">
              <div className="trading-kpi-label">{label}</div>
              <div className={`trading-kpi-value ${cls}`}>{value}</div>
            </div>
          ))}
        </div>

        <section className="trading-card">
          <div className="trading-card-head">
            <h3>{t('trading.chart')}</h3>
            <div className="trading-ranges" role="group" aria-label={t('trading.chart')}>
              {HISTORY_RANGES.map((r) => (
                <button key={r} className={r === range ? 'on' : ''} aria-pressed={r === range} onClick={() => setRange(r)}>
                  {t(`trading.range.${r}`)}
                </button>
              ))}
            </div>
          </div>
          <Chart range={range} />
        </section>

        <div className="trading-cols">
          <section className="trading-card">
            <h3>{t('trading.positions')}</h3>
            {v.positions.length ? (
              <table className="trading-table">
                <thead>
                  <tr>
                    <th>{t('trading.col.symbol')}</th>
                    <th>{t('trading.col.value')}</th>
                    <th>{t('trading.col.qty')}</th>
                    <th>{t('trading.col.entry')}</th>
                    <th>{t('trading.col.last')}</th>
                    <th>{t('trading.col.pnl')}</th>
                    <th>{t('trading.col.pct')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortPositions(v.positions).map((p) => (
                    <tr key={p.symbol}>
                      <td className="sym">{p.symbol}</td>
                      <td>{or(p.market_value ?? p.notional, (n) => usd(n))}</td>
                      <td>{or(p.quantity, qty)}</td>
                      <td>{or(p.avg_entry_price, price)}</td>
                      <td>{or(p.current_price, price)}</td>
                      <td style={{ color: tone(p.unrealized_pnl) }}>{or(p.unrealized_pnl, (n) => signedUsd(n))}</td>
                      <td style={{ color: tone(p.unrealized_pnl_pct) }}>{or(p.unrealized_pnl_pct, (n) => signedPct(n))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="trading-muted">{t('trading.noPositions')}</p>
            )}
          </section>

          <section className="trading-card">
            <h3>{t('trading.fills')}</h3>
            {v.recent_fills.length ? (
              <table className="trading-table">
                <thead>
                  <tr>
                    <th>{t('trading.col.side')}</th>
                    <th>{t('trading.col.symbol')}</th>
                    <th>{t('trading.col.qty')}</th>
                    <th>{t('trading.col.price')}</th>
                    <th>{t('trading.col.time')}</th>
                    <th>{t('trading.col.strategy')}</th>
                  </tr>
                </thead>
                <tbody>
                  {v.recent_fills.map((f) => (
                    <tr key={f.order_id} className={fresh.has(f.order_id) ? `fresh ${f.side}` : undefined}>
                      <td className={f.side === 'buy' ? 'good' : 'bad'}>{f.side === 'buy' ? t('trading.buy') : t('trading.sell')}</td>
                      <td className="sym">{f.symbol}</td>
                      <td>{qty(f.quantity)}</td>
                      <td>{price(f.fill_price)}</td>
                      <td>{f.filled_at ? `${formatDate(f.filled_at, { day: '2-digit', month: '2-digit' })} ${formatTime(f.filled_at, { second: '2-digit' })}` : na}</td>
                      <td className="trading-muted">{f.strategy_id ?? na}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="trading-muted">{t('trading.noFills')}</p>
            )}
          </section>
        </div>

        <div className="trading-cols">
          <section className="trading-card">
            <h3>{t('trading.sys.bot')}</h3>
            <dl className="trading-status">
              <dt>{t('trading.sys.bot')}</dt>
              <dd className={look(s.bot_status)}>{val(s.bot_status)}</dd>
              <dt>{t('trading.sys.broker')}</dt>
              <dd className={look(s.broker_connection)}>{val(s.broker_connection)}</dd>
              <dt>{t('trading.sys.risk')}</dt>
              <dd className={look(s.risk_status)}>{val(s.risk_status)}</dd>
              <dt>{t('trading.sys.kill')}</dt>
              <dd className={look(s.kill_switch)}>{val(s.kill_switch)}</dd>
              <dt>{t('trading.sys.strategies')}</dt>
              <dd className={s.active_strategies == null ? 'dim' : ''}>{s.active_strategies ?? na}</dd>
              <dt>{t('trading.sys.update')}</dt>
              <dd className={s.last_successful_update ? '' : 'dim'}>{s.last_successful_update ? formatTime(s.last_successful_update, { second: '2-digit' }) : na}</dd>
            </dl>
          </section>
          <section className="trading-card">
            <h3>Ticker</h3>
            {v.market_quotes.length ? (
              <ul className="trading-quotes">
                {v.market_quotes.map((q) => {
                  const it = tickerItem(q);
                  return (
                    <li key={q.symbol}>
                      <span className="sym">{it.symbol}</span>
                      <span>{it.price}</span>
                      <span style={{ color: it.color }}>{it.change || na}</span>
                      <span className="trading-muted">
                        {q.timestamp ? formatTime(q.timestamp) : na}
                        {q.feed ? ` · ${q.feed}` : ''}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="trading-muted">{t('trading.noQuotes')}</p>
            )}
          </section>
        </div>

        <p className="trading-muted small">
          🔒 {t('trading.readOnly')}
          {v.missing.length ? ` ${t('trading.missing', { fields: v.missing.join(', ') })}` : ''}
        </p>
      </div>
    </Panel>
  );
}
