import { useMemo, useState } from 'react';
import { api } from '../api';
import { agentsOnRepo, kanbanFor, useStore, type Agent, type KanbanCard } from '../store';
import { confirmDialog } from './Confirm';
import { Panel } from './Panel';
import { useT } from '../i18n';

/** Who has the card; "QA" while they're testing it. */
function AgentChip({ agent, card }: { agent?: Agent; card: KanbanCard }) {
  if (!agent) return null;
  return (
    <span className="agent-chip">
      <span className="dot" style={{ background: agent.color }} />
      {agent.name}
      {agent.task === 'qa' && card.prNumber != null && agent.prNumber === card.prNumber && <span className="chip">QA</span>}
    </span>
  );
}

export function IssueForm({ repoId, agents, onDone }: { repoId: string; agents: Agent[]; onDone?: () => void }) {
  const t = useT();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [assignTo, setAssignTo] = useState('');
  const [busy, setBusy] = useState(false);
  const free = agents.filter((a) => a.role !== 'ceo' && a.status !== 'working' && a.status !== 'preparing');
  return (
    <form
      className="issue-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        setBusy(true);
        try {
          await api.createIssue(repoId, title, body, assignTo || undefined);
          setTitle('');
          setBody('');
          setAssignTo('');
          onDone?.();
        } catch {
          // toasted
        } finally {
          setBusy(false);
        }
      }}
    >
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('kanban.issue.title')} aria-label={t('kanban.issue.titleAria')} autoFocus />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={t('kanban.issue.desc')} aria-label={t('kanban.issue.descAria')} rows={5} />
      <div className="row">
        <select value={assignTo} onChange={(e) => setAssignTo(e.target.value)} aria-label={t('kanban.issue.assignAria')}>
          <option value="">{free.length ? t('kanban.assignTo') : t('kanban.busy')}</option>
          {free.map((a) => (
            <option key={a.id} value={a.id}>
              {t('kanban.issue.giveNow').replace('{name}', a.name)}
            </option>
          ))}
        </select>
        <button className="btn btn-good" disabled={busy || !title.trim()}>
          {busy ? t('kanban.issue.filing') : t('kanban.issue.file')}
        </button>
      </div>
    </form>
  );
}

/** The board's frame: a panel over the office, or (in pocket mode) a plain section of the page. */
function Frame({ embedded, ...props }: Parameters<typeof Panel>[0] & { embedded?: boolean }) {
  if (!embedded) return <Panel {...props} />;
  return (
    <section className="kanban-embedded" style={{ ['--accent' as string]: props.accent }}>
      <h2 className="kanban-embedded-title">{props.title}</h2>
      {props.children}
    </section>
  );
}

function QaLink({ card }: { card: KanbanCard }) {
  const t = useT();
  if (!card.qa?.commentUrl) return null;
  return (
    <a className="small" href={card.qa.commentUrl} target="_blank" rel="noreferrer" title={card.qa.summary ?? ''}>
      {t('kanban.qaReport')}
    </a>
  );
}

export function KanbanView({ repoId, embedded }: { repoId: string; embedded?: boolean }) {
  const t = useT();
  const repo = useStore((s) => s.repos.find((r) => r.id === repoId));
  const allAgents = useStore((s) => s.agents);
  const qaRecords = useStore((s) => s.qa);
  const usageState = useStore((s) => s.usage.state);
  const openOverlay = useStore((s) => s.openOverlay);
  const agents = useMemo(() => agentsOnRepo(allAgents, repoId), [allAgents, repoId]);
  const cols = useMemo(() => (repo ? kanbanFor(repo, agents, qaRecords, { state: usageState }) : null), [repo, agents, qaRecords, usageState]);
  const [showForm, setShowForm] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  if (!repo || !cols) {
    return (
      <Frame title="Kanban" embedded={embedded}>
        <p className="muted">{t('kanban.noFloor')}</p>
      </Frame>
    );
  }

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setPending(key);
    try {
      await fn();
    } catch {
      // toasted
    } finally {
      setPending(null);
    }
  };
  const workers = agents.filter((a) => a.role !== 'ceo');
  const free = workers.filter((a) => a.status === 'idle' || a.status === 'done' || a.status === 'stopped' || a.status === 'error');
  const merge = async (c: KanbanCard) => {
    const passed = c.qa?.status === 'passed';
    const ok = await confirmDialog(
      passed
        ? {
            icon: '🎉',
            title: t('kanban.mergeTitle.passed').replace('{n}', String(c.number)),
            body: t('kanban.mergeBody.passed').replace('{title}', c.title).replace('{branch}', repo.defaultBranch),
            confirm: t('kanban.mergeConfirm.passed'),
          }
        : {
            tone: 'warn',
            title: t('kanban.mergeTitle.warn').replace('{n}', String(c.number)),
            body: t('kanban.mergeBody.warn').replace('{title}', c.title).replace('{branch}', repo.defaultBranch),
            confirm: t('kanban.mergeConfirm.warn'),
          },
    );
    if (ok) void act(c.key, () => api.mergePull(repo.id, c.number));
  };
  const sendBack = async (c: KanbanCard) => {
    let note = '';
    const ok = await confirmDialog({
      icon: '🔧',
      title: t('kanban.sendBackTitle').replace('{n}', String(c.number)),
      body: (
        <>
          <p>{t('kanban.sendBackBody')}</p>
          <input
            maxLength={1000}
            placeholder={t('kanban.sendBackNote')}
            aria-label={t('kanban.sendBackNoteAria')}
            ref={(el) => void (el && setTimeout(() => el.focus(), 0))}
            onChange={(e) => (note = e.target.value)}
          />
        </>
      ),
      confirm: t('kanban.sendBackConfirm'),
    });
    if (ok) void act(c.key, () => api.sendBack(repo.id, c.number, note.trim() || undefined));
  };
  const closePr = async (c: KanbanCard) => {
    const ok = await confirmDialog({
      tone: 'danger',
      title: t('kanban.closeTitle').replace('{n}', String(c.number)),
      body: t('kanban.closeBody').replace('{title}', c.title),
      confirm: t('kanban.closeConfirm'),
    });
    if (ok) void act(c.key, () => api.closePull(repo.id, c.number));
  };
  const closeButton = (c: KanbanCard) => (
    <button className="btn btn-small btn-ghost" disabled={pending === c.key} onClick={() => void closePr(c)}>
      {t('kanban.close')}
    </button>
  );
  const previewButton = (c: KanbanCard) => (
    <button className="btn btn-small" title={t('kanban.previewTitle').replace('{n}', String(c.number)).replace('{branch}', repo.defaultBranch)} onClick={() => openOverlay({ kind: 'app', repoId: repo.id, pr: c.number })}>
      {t('kanban.preview')}
    </button>
  );
  const terminalButton = (c: KanbanCard) =>
    c.agent && (
      <button className="btn btn-small" onClick={() => openOverlay({ kind: 'terminal', agentId: c.agent!.id })}>
        {t('kanban.terminal')}
      </button>
    );

  const column = (title: string, cls: string, cards: KanbanCard[], render: (c: KanbanCard) => React.ReactNode, empty: string) => (
    <div className={`kcol ${cls}`}>
      <div className="kcol-head">
        {title} <span className="count">{cards.length}</span>
      </div>
      <div className="kcol-body">
        {cards.length === 0 && <div className="muted small kempty">{empty}</div>}
        {cards.map((c) => (
          <div key={c.key} className={`kcard ${c.tone ? `kcard-${c.tone}` : ''}`}>
            <div className="kcard-title">
              {c.url ? (
                <a href={c.url} target="_blank" rel="noreferrer">
                  {c.prNumber ? 'PR ' : ''}#{c.number}
                </a>
              ) : (
                <b>#{c.number}</b>
              )}{' '}
              {c.title}
            </div>
            {render(c)}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <Frame
      embedded={embedded}
      wide
      accent={repo.color}
      title={
        <span>
          📋 {repo.fullName}{' '}
          <a className="small" href={repo.url} target="_blank" rel="noreferrer">
            GitHub ↗
          </a>
        </span>
      }
    >
      <div className="kanban-toolbar">
        <button className="btn btn-good" onClick={() => setShowForm((v) => !v)}>
          {showForm ? t('kanban.cancel') : t('kanban.newIssue')}
        </button>
        <label className="toggle">
          <input type="checkbox" checked={repo.autoAssign} onChange={(e) => void api.updateRepo(repo.id, { autoAssign: e.target.checked }).catch(() => undefined)} />
          {t('kanban.autoAssign')}
        </label>
        <label className="toggle" title={t('kanban.autoMergeTip')}>
          <input type="checkbox" checked={repo.autoMerge} onChange={(e) => void api.updateRepo(repo.id, { autoMerge: e.target.checked }).catch(() => undefined)} />
          {t('kanban.autoMerge')}
        </label>
        <span className="spacer" />
        <button className="btn" onClick={() => openOverlay({ kind: 'app', repoId: repo.id })} title={t('kanban.viewAppTitle')}>
          {t('kanban.viewApp')}
        </button>
        <span className="muted small">{repo.lastSync ? t('kanban.synced').replace('{time}', new Date(repo.lastSync).toLocaleTimeString()) : t('kanban.syncing')}</span>
        <button className="btn" disabled={pending === 'sync'} onClick={() => act('sync', () => api.syncRepo(repo.id))}>
          {t('kanban.sync')}
        </button>
      </div>
      {repo.syncError && <div className="term-error">⚠️ {repo.syncError}</div>}
      {showForm && <IssueForm repoId={repo.id} agents={workers} onDone={() => setShowForm(false)} />}

      <div className="kanban kanban-5">
        {column(
          t('kanban.backlog'),
          'kcol-backlog',
          cols.backlog,
          (c) => (
            <div className="kcard-foot">
              {c.note && <span className="muted small">{c.note}</span>}
              <select
                value=""
                disabled={pending === c.key || free.length === 0}
                onChange={(e) => e.target.value && act(c.key, () => api.assign(e.target.value, c.number))}
                aria-label={`${t('kanban.assignTo')} #${c.number}`}
              >
                <option value="">{free.length ? t('kanban.assignTo') : t('kanban.busy')}</option>
                {free.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          ),
          t('kanban.backlog.empty'),
        )}
        {column(
          t('kanban.progress'),
          'kcol-progress',
          cols.progress,
          (c) => (
            <div className="kcard-foot">
              <AgentChip agent={c.agent} card={c} />
              <span className="muted small">{c.note}</span>
              <span className="spacer" />
              {terminalButton(c)}
            </div>
          ),
          t('kanban.progress.empty'),
        )}
        {column(
          t('kanban.qa'),
          'kcol-qa',
          cols.qa,
          (c) => {
            const st = c.qa?.status;
            return (
              <div className="kcard-foot kcard-foot-wrap">
                <AgentChip agent={c.agent} card={c} />
                <span className="muted small">{c.note}</span>
                <span className="spacer" />
                <QaLink card={c} />
                {previewButton(c)}
                {(st === 'testing' || st === 'fixing') && terminalButton(c)}
                {(!st || st === 'needs-human') && (
                  <button className="btn btn-small btn-good" disabled={pending === c.key} onClick={() => act(c.key, () => api.sendToQa(repo.id, c.number))}>
                    {st === 'needs-human' ? t('kanban.retryQa') : t('kanban.sendToQa')}
                  </button>
                )}
                {(st === 'needs-human' || st === 'failed') && (
                  <button className="btn btn-small" disabled={pending === c.key} title={t('kanban.sendBackHint')} onClick={() => sendBack(c)}>
                    {t('kanban.sendBack')}
                  </button>
                )}
                {st === 'needs-human' && (
                  <button className="btn btn-small btn-ghost" disabled={pending === c.key} onClick={() => merge(c)}>
                    {t('kanban.mergeAnyway')}
                  </button>
                )}
                {closeButton(c)}
              </div>
            );
          },
          t('kanban.qa.empty'),
        )}
        {column(
          t('kanban.ready'),
          'kcol-review',
          cols.ready,
          (c) => {
            const pr = repo.pulls.find((p) => p.number === c.prNumber);
            return (
              <div className="kcard-foot kcard-foot-wrap">
                <AgentChip agent={c.agent} card={c} />
                <span className="muted small">
                  {c.note}
                  {pr ? ` · +${pr.additions} −${pr.deletions}` : ''}
                </span>
                <span className="spacer" />
                <QaLink card={c} />
                {previewButton(c)}
                <button className="btn btn-small btn-good" disabled={pending === c.key || pr?.isDraft} onClick={() => merge(c)}>
                  {t('kanban.merge')}
                </button>
                {closeButton(c)}
              </div>
            );
          },
          t('kanban.ready.empty'),
        )}
        {column(
          t('kanban.merged'),
          'kcol-merged',
          cols.merged,
          (c) => (
            <div className="kcard-foot">
              <AgentChip agent={c.agent} card={c} />
            </div>
          ),
          t('kanban.merged.empty'),
        )}
      </div>
    </Frame>
  );
}
