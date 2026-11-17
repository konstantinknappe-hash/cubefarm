import { useMemo } from 'react';
import { blockers } from '../../../shared/issues';
import { agentsOnRepo, kanbanFor, useStore, type Agent, type KanbanCard } from '../store';
import { elapsedLabel } from '../qaCard';
import { bodyExcerpt, cardLabel, canPeel, locateCard } from '../world/whiteboard';
import type { Col } from '../world/stickies';
import { Key } from './Key';
import { Markdown } from './Markdown';
import { Panel } from './Panel';
import { useT } from '../i18n';

// One whiteboard card up close (E on a sticky): the issue and the first lines of its body, who has it and since when,
// what it waits for, and for a PR its QA round, QA's latest report and checks, and CI. It reads the office's state as
// it stands (and follows the card as it moves); nothing here asks the server for more.

const QA_ICON = { pass: '✓', fail: '✗', skip: '–' } as const;

const clock = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function Who({ agent, children }: { agent?: Agent; children: React.ReactNode }) {
  return (
    <div className="cardview-who">
      {agent && <span className="dot" style={{ background: agent.color }} />}
      <span>{children}</span>
    </div>
  );
}

export function CardView({ repoId, cardKey, number, pr }: { repoId: string; cardKey: string; number: number; pr: boolean }) {
  const t = useT();
  const repo = useStore((s) => s.repos.find((r) => r.id === repoId));
  const allAgents = useStore((s) => s.agents);
  const qaRecords = useStore((s) => s.qa);
  const agents = useMemo(() => agentsOnRepo(allAgents, repoId), [allAgents, repoId]);
  const cols = useMemo(() => (repo ? kanbanFor(repo, agents, qaRecords) : null), [repo, agents, qaRecords]);
  const at = cols ? locateCard(cols, cardKey, number, pr) : null;

  const COLUMN: Record<Col, string> = {
    backlog: t('card.col.backlog'),
    progress: t('card.col.progress'),
    qa: t('card.col.qa'),
    ready: t('card.col.ready'),
    merged: t('card.col.merged'),
  };

  const sinceStr = (ts: number | null | undefined) =>
    ts && Number.isFinite(ts) ? t('card.since', { time: clock(ts), elapsed: elapsedLabel(Date.now() - ts) }) : '';
  const agoStr = (iso: string | null | undefined) => {
    const ts = iso ? Date.parse(iso) : NaN;
    return Number.isFinite(ts) ? t('card.ago', { elapsed: elapsedLabel(Date.now() - ts) }) : '';
  };

  if (!repo || !at) {
    return (
      <Panel title={`📌 ${cardLabel({ number, pr })}`} className="cardview">
        <p className="muted">{t('card.gone')}</p>
      </Panel>
    );
  }
  const { card, col } = at;
  const pull = card.prNumber ? repo.pulls.find((p) => p.number === card.prNumber) : undefined;
  const issueNumber = pull ? pull.closesIssues[0] : card.number;
  const issue = issueNumber ? repo.issues.find((i) => i.number === issueNumber) : undefined;
  const open = new Set(repo.issues.map((i) => i.number));
  const waits = issue ? blockers(issue.body, open) : [];
  const waiters = issue ? repo.issues.filter((i) => blockers(i.body, open).includes(issue.number)).map((i) => i.number) : [];
  const excerpt = issue ? bodyExcerpt(issue.body) : null;
  const url = card.url ?? pull?.url ?? issue?.url;

  return (
    <Panel
      className="cardview"
      accent={repo.color}
      title={
        <span>
          📌 {cardLabel(card)} {card.title}
        </span>
      }
    >
      <div className="cardview-tags">
        <span className="pill">{COLUMN[col]}</span>
        {card.note && <span className={`pill ${card.tone ? `cardview-${card.tone}` : ''}`}>{card.note}</span>}
        {waits.length > 0 && <span className="pill cardview-warn">{t('ui.cardview.waitsFor', { list: waits.join(', #') })}</span>}
        {waiters.length > 0 && <span className="pill">{t('ui.cardview.waiters', { count: waiters.length, list: waiters.join(', #') })}</span>}
        {issue?.labels.map((l) => (
          <span key={l} className="pill cardview-label">
            {l}
          </span>
        ))}
      </div>

      <WhoHasIt card={card} col={col} filed={issue?.createdAt} opened={pull?.createdAt} mergedAt={pull?.mergedAt} sinceStr={sinceStr} agoStr={agoStr} t={t} />

      {pull && issue && (
        <h4 className="cardview-h">
          {t('card.closes', { n: String(issue.number), title: issue.title })}
        </h4>
      )}
      {excerpt?.text ? (
        <div className="cardview-body">
          <Markdown text={excerpt.text} />
          {excerpt.more && <div className="muted small">…</div>}
        </div>
      ) : (
        !pull && <p className="muted small">{t('card.noDesc')}</p>
      )}

      {card.prNumber && <PrDetails card={card} pull={pull} t={t} />}

      <div className="cardview-foot">
        {url && (
          <a href={url} target="_blank" rel="noreferrer">
            {t('card.openGitHub', { label: cardLabel(card) })}
          </a>
        )}
        {card.qa?.commentUrl && (
          <a href={card.qa.commentUrl} target="_blank" rel="noreferrer">
            {t('card.qaReport')}
          </a>
        )}
        <span className="spacer" />
        <span className="muted small">
          {canPeel(col, card) && (
            <>
              <Key action="drop" /> {t('card.dropHint')} ·{' '}
            </>
          )}
          <kbd>Esc</kbd> {t('card.esc')}
        </span>
      </div>
    </Panel>
  );
}

type TFn = ReturnType<typeof useT>;

function WhoHasIt({ card, col, filed, opened, mergedAt, sinceStr, agoStr, t }: { card: KanbanCard; col: Col; filed?: string; opened?: string; mergedAt?: string | null; sinceStr: (ts: number | null | undefined) => string; agoStr: (iso: string | null | undefined) => string; t: TFn }) {
  const a = card.agent;
  if (col === 'backlog') return <Who>{t('card.nobody')}{filed ? ` · ${t('card.filed', { ago: agoStr(filed) })}` : ''}</Who>;
  if (col === 'progress') return <Who agent={a}>{a ? t('card.hasIt', { name: a.name, since: sinceStr(a.startedAt) }) : t('card.someone')}</Who>;
  if (col === 'merged') {
    const parts = [mergedAt ? t('card.mergedAgo', { ago: agoStr(mergedAt) }) : t('card.merged')];
    if (a) parts.push(t('card.writtenBy', { name: a.name }));
    return <Who agent={a}>{parts.join(' · ')}</Who>;
  }
  if (card.qa?.status === 'testing') {
    return <Who agent={a}>{t('card.testing', { name: a?.name ?? 'QA', round: String(card.qa.round), since: sinceStr(card.qa.updatedAt) })}</Who>;
  }
  if (card.qa?.status === 'fixing') return <Who agent={a}>{t('card.fixing', { name: a?.name ?? 'An agent', since: sinceStr(card.qa.updatedAt) })}</Who>;
  const parts = [a ? t('card.wrote', { name: a.name }) : t('card.openedOutside')];
  if (opened) parts.push(t('card.opened', { ago: agoStr(opened) }));
  return <Who agent={a}>{parts.join(' · ')}</Who>;
}

function PrDetails({ card, pull, t }: { card: KanbanCard; pull?: { checks: string; failedChecks: { name: string; url: string | null }[]; pendingChecks: string[]; mergeable: string; isDraft: boolean }; t: TFn }) {
  const CHECKS_LABEL: Record<string, string> = {
    passing: t('card.allPass'),
    failing: t('card.checksFailing'),
    pending: t('card.checksRunning'),
    none: t('card.noChecks'),
  };
  const q = card.qa;
  return (
    <div className="cardview-pr">
      <div className="cardview-section">
        <h4 className="cardview-h">🔍 QA{q ? ` · round ${q.round}` : ''}</h4>
        {!q && <p className="muted small">{t('card.notSentQa')}</p>}
        {q?.summary && <Markdown text={q.summary} className="cardview-summary" />}
        {q && !q.summary && <p className="muted small">{q.status === 'testing' ? t('card.noReportTesting') : t('card.noReport')}</p>}
        {q && q.checks.length > 0 && (
          <ul className="cardview-checks">
            {q.checks.map((c, i) => (
              <li key={i} className={`cardview-check cardview-check-${c.result}`}>
                <b>{QA_ICON[c.result]}</b> {c.name}
                {c.details && <span className="muted"> · {c.details}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
      {pull && (
        <div className="cardview-section">
          <h4 className="cardview-h">⚙️ CI</h4>
          <div className="small">
            {CHECKS_LABEL[pull.checks] ?? pull.checks}
            {pull.mergeable === 'CONFLICTING' && <span className="cardview-bad-text"> · {t('card.conflicts')}</span>}
            {pull.isDraft && <span className="muted"> · {t('card.draft')}</span>}
          </div>
          {pull.failedChecks.length > 0 && (
            <ul className="cardview-checks">
              {pull.failedChecks.map((c) => (
                <li key={c.name} className="cardview-check cardview-check-fail">
                  <b>✗</b>{' '}
                  {c.url ? (
                    <a href={c.url} target="_blank" rel="noreferrer">
                      {c.name}
                    </a>
                  ) : (
                    c.name
                  )}
                </li>
              ))}
            </ul>
          )}
          {pull.pendingChecks.length > 0 && <div className="muted small">{t('card.running', { list: pull.pendingChecks.join(', ') })}</div>}
        </div>
      )}
    </div>
  );
}
