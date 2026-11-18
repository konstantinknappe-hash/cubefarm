// The desk briefing board up close (docs/desk-briefing.md): the CEO's latest briefing in full (what changed, the
// watchlist with why and trigger, each position's thesis and exit plan, the planned moves, the sectors, the risks),
// the earlier headlines, the watchlist, and the manager's questions to the research team with their answers. The
// question box is the only thing here that sends anything: one question into MoneyPrint's inbox, never an order.
import { useEffect, useState } from 'react';
import { QUESTION_MAX, type Inquiry } from '../../../shared/briefing';
import { api } from '../api';
import { formatDate, formatTime, useT } from '../i18n';
import { useStore } from '../store';
import { BRIEFING_STATE_COLOR } from '../world/briefingDraw';
import { briefingState } from '../world/BriefingWall';
import { Panel } from './Panel';

const when = (ms: number | null) => (ms ? `${formatDate(ms, { day: '2-digit', month: '2-digit' })} ${formatTime(ms)}` : '');

function Answer({ q }: { q: Inquiry }) {
  const t = useT();
  const a = q.answer;
  const status = a ? 'answered' : q.status === 'queued' ? 'queued' : 'sent';
  return (
    <li className="briefing-question">
      <p className="briefing-q">
        „{q.question}“ <span className={`briefing-status ${status}`}>{t(`briefing.status.${status}`)}</span>
        <span className="trading-muted"> · {when(q.askedAt)}</span>
      </p>
      {a && (
        <div className="briefing-answer">
          <p>
            <b>{t('briefing.verdict')}:</b> {a.verdict} <span className="trading-muted">· {t('briefing.confidence', { pct: Math.round(a.confidence * 100) })}</span>
          </p>
          <p>{a.answer}</p>
          {a.entry_plan && (
            <p>
              <b>{t('briefing.entry')}:</b> {a.entry_plan}
            </p>
          )}
          {a.exit_plan && (
            <p>
              <b>{t('briefing.exit')}:</b> {a.exit_plan}
            </p>
          )}
          {!!a.signals_to_watch.length && (
            <p>
              <b>{t('briefing.signals')}:</b> {a.signals_to_watch.join(' · ')}
            </p>
          )}
          {!!a.risks.length && (
            <p>
              <b>{t('briefing.risks')}:</b> {a.risks.join(' · ')}
            </p>
          )}
          {!!a.sources.length && (
            <p className="briefing-sources">
              <b>{t('briefing.sources')}:</b>{' '}
              {a.sources.map((u, i) => (
                <a key={u} href={u} target="_blank" rel="noreferrer noopener">
                  [{i + 1}]
                </a>
              ))}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function AskBox() {
  const t = useT();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const send = async () => {
    const q = text.trim();
    if (!q || busy) return;
    setBusy(true);
    try {
      await api.askResearch(q);
      setText('');
      setSent(true);
    } catch {
      // the api already shows the error as a toast
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="trading-card briefing-ask">
      <h3>{t('briefing.ask')}</h3>
      <p className="trading-muted">{t('briefing.askHint')}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          value={text}
          maxLength={QUESTION_MAX}
          rows={2}
          placeholder={t('briefing.askPlaceholder')}
          aria-label={t('briefing.ask')}
          onChange={(e) => {
            setText(e.target.value);
            setSent(false);
          }}
          onKeyDown={(e) => {
            e.stopPropagation(); // typing here must not walk the player
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button type="submit" disabled={busy || !text.trim()}>
          {busy ? t('briefing.sending') : t('briefing.send')}
        </button>
      </form>
      {sent && <p className="briefing-sent">{t('briefing.sent')}</p>}
    </section>
  );
}

export function BriefingPanel() {
  const t = useT();
  const v = useStore((s) => s.briefing);
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const state = briefingState(v, clock);
  const b = v.briefing;
  const none = <p className="trading-muted">{t('briefing.empty')}</p>;
  return (
    <Panel title={t('briefing.title')} wide accent="#38d6ff" className="trading-panel briefing-panel">
      <div className="trading-body">
        <div className="trading-top">
          <span className="trading-badge paper">{t('trading.paper')}</span>
          <span className="trading-badge" style={{ color: BRIEFING_STATE_COLOR[state], borderColor: BRIEFING_STATE_COLOR[state] }}>
            {t(`briefing.state.${state}`)}
          </span>
          {v.briefingAt && <span className="trading-muted">{t('briefing.at', { time: when(v.briefingAt) })}</span>}
          {v.error && <span className="trading-muted">{t('briefing.error', { error: v.error })}</span>}
        </div>
        {state === 'mock' && <p className="trading-mock">{t('briefing.mockBanner')}</p>}

        <section className="trading-card">
          <h3>{b?.headline || t('briefing.none')}</h3>
          {b?.what_changed && (
            <p>
              <b>{t('briefing.changed')}:</b> {b.what_changed}
            </p>
          )}
          {b?.risks && (
            <p>
              <b>{t('briefing.risks')}:</b> {b.risks}
            </p>
          )}
        </section>

        <AskBox />

        <div className="trading-cols">
          <section className="trading-card">
            <h3>{t('briefing.watchlist')}</h3>
            {b?.watchlist.length ? (
              <ul className="briefing-list">
                {b.watchlist.map((w) => (
                  <li key={w.symbol}>
                    <span className="sym">{w.symbol}</span> <span className="briefing-stance">{w.stance}</span> {w.why}
                    {w.trigger && <span className="trading-muted"> · {t('briefing.trigger')}: {w.trigger}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              none
            )}
            {!!v.watchlist.length && <p className="trading-muted">{v.watchlist.map((w) => w.symbol).join(' · ')}</p>}
          </section>
          <section className="trading-card">
            <h3>{t('briefing.planned')}</h3>
            {b?.planned.length ? (
              <ul className="briefing-list">
                {b.planned.map((m, i) => (
                  <li key={i}>
                    <b>{m.when}</b> · <span className="sym">{m.action.toUpperCase()} {m.symbol}</span> {t('briefing.because')} {m.because}
                  </li>
                ))}
              </ul>
            ) : (
              none
            )}
            <h3>{t('briefing.positions')}</h3>
            {b?.positions.length ? (
              <ul className="briefing-list">
                {b.positions.map((p) => (
                  <li key={p.symbol}>
                    <span className="sym">{p.symbol}</span> {p.thesis}
                    <span className="trading-muted"> · {t('briefing.exit')}: {p.exit_plan}</span>
                  </li>
                ))}
              </ul>
            ) : (
              none
            )}
          </section>
        </div>

        <div className="trading-cols">
          <section className="trading-card">
            <h3>{t('briefing.sectors')}</h3>
            {b?.sectors.length ? (
              <ul className="briefing-list">
                {b.sectors.map((s) => (
                  <li key={s.sector}>
                    <b>{s.sector.replace(/_/g, ' ')}</b>: {s.view}
                    {!!s.symbols.length && <span className="trading-muted"> · {s.symbols.join(', ')}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              none
            )}
          </section>
          <section className="trading-card">
            <h3>{t('briefing.history')}</h3>
            {v.history.length ? (
              <ul className="briefing-list">
                {v.history.map((h, i) => (
                  <li key={i}>
                    <span className="trading-muted">{when(h.at)}</span> {h.headline}
                  </li>
                ))}
              </ul>
            ) : (
              none
            )}
          </section>
        </div>

        <section className="trading-card">
          <h3>{t('briefing.questions')}</h3>
          {v.inquiries.length ? <ul className="briefing-questions">{v.inquiries.map((q) => <Answer key={q.id} q={q} />)}</ul> : none}
        </section>
        <p className="trading-muted small">🔒 {t('briefing.paper')}</p>
      </div>
    </Panel>
  );
}
