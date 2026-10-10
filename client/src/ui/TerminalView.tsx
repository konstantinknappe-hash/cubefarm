import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CareerCard } from './CareerCard';
import { api } from '../api';
import { isBusy, kanbanFor, agentsOnRepo, useStore } from '../store';
import { AgentSetup } from './AgentSettings';
import { confirmDialog } from './Confirm';
import { LiveTerminal } from './LiveTerminal';
import { effectiveModel } from '../../../shared/models';
import { assignChoices } from '../pocket/pocketData';
import { agentLabel, workerCli } from './floorRows';
import { MessageBox } from './MessageBox';
import { MicButton } from './MicButton';
import { closeOverlay, Panel } from './Panel';
import { loadScreenshot } from '../screenshot';
import { toolVerb } from '../world/draw';
import { followAgent } from '../world/camera/rig';
import { useT } from '../i18n';

export function StatusPill({ status }: { status: string }) {
  const t = useT();
  const STATUS_LABEL: Record<string, string> = {
    idle: t('terminal.status.idle'),
    preparing: t('terminal.status.preparing'),
    working: t('terminal.status.working'),
    done: t('terminal.status.done'),
    error: t('terminal.status.error'),
    stopped: t('terminal.status.stopped'),
  };
  return <span className={`status status-${status}`}>{STATUS_LABEL[status] ?? status}</span>;
}

function elapsed(from: number | null, to: number | null) {
  if (!from) return '';
  const s = Math.max(0, Math.floor(((to ?? Date.now()) - from) / 1000));
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function TerminalView({ agentId }: { agentId: string }) {
  const t = useT();
  const agent = useStore((s) => s.agents[agentId]);
  const log = useStore((s) => s.logs[agentId]) ?? [];
  const shotAt = useStore((s) => s.screens[agentId]);
  const repo = useStore((s) => s.repos.find((r) => r.id === s.agents[agentId]?.repoId));
  const allAgents = useStore((s) => s.agents);
  const settings = useStore((s) => s.settings);
  const clis = useStore((s) => s.clis);
  const [text, setText] = useState('');
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [showCareer, setShowCareer] = useState(false);
  const [, tick] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  // The browser pane shows the last screenshot that loaded, never a broken image. The loaded <img> itself goes in
  // the pane, so showing it never asks the server again.
  const shotView = useRef<HTMLDivElement>(null);
  const [shot, setShot] = useState<{ agentId: string; img: HTMLImageElement } | null>(null);
  const shotTime = agent?.hasScreenshot ? (shotAt ?? agent.screenshotAt) : null;

  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(
    () =>
      loadScreenshot(agentId, shotTime, (img) => {
        img.alt = t('terminal.screenshot');
        setShot({ agentId, img });
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agentId, shotTime],
  );
  useEffect(() => {
    shotView.current?.replaceChildren(...(shot?.agentId === agentId ? [shot.img] : []));
  }, [shot, agentId, agent?.hasScreenshot]);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [log.length]);

  const qaRecords = useStore((s) => s.qa);
  const cols = useMemo(() => (repo ? kanbanFor(repo, agentsOnRepo(allAgents, repo.id), qaRecords) : null), [repo, allAgents, qaRecords]);
  // Any free agent takes either: an issue from the backlog, or a pull request waiting for QA.
  const choices = assignChoices(cols);
  const chosen = choices.find((c) => c.key === pick);

  if (!agent || !repo) {
    return (
      <Panel title="Terminal">
        <p className="muted">{t('terminal.gone')}</p>
      </Panel>
    );
  }

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch {
      // api() already toasted
    } finally {
      setBusy(false);
    }
  };
  const working = isBusy(agent);
  const cli = workerCli(agent, settings);
  const issueUrl = agent.issueNumber ? `https://github.com/${repo.fullName}/issues/${agent.issueNumber}` : null;
  const canMessage = working || (agent.task !== 'qa' && !!agent.branch && agent.status !== 'idle');
  const qaRec = agent.prNumber ? qaRecords[`${repo.id}#${agent.prNumber}`] : undefined;
  const send = (msg: string) => {
    const body = msg.trim();
    if (!body) return;
    setText('');
    void run(() => api.message(agent.id, body));
  };

  const placeholder = working
    ? t('terminal.tell', { name: agent.name, inTerminal: agent.terminal ? t('terminal.inTerminal') : '' })
    : canMessage
      ? t('terminal.ask', { name: agent.name })
      : t('terminal.give', { name: agent.name });

  return (
    <Panel
      wide
      accent={agent.color}
      title={
        <div className="term-title">
          <span className="avatar" style={{ background: agent.color }}>
            {agent.name[0]}
          </span>
          <span>{agent.name}</span>
          <span className="chip" title={t('terminal.theirAgent')}>
            ⌨️ {agentLabel(agent, settings, clis)}
          </span>
          <StatusPill status={agent.status} />
          {working && agent.currentTool && <span className="muted small">{toolVerb(agent.currentTool)}…</span>}
          <span className="spacer" />
          <button className="btn btn-small" title={t('terminal.followTitle', { name: agent.name })} onClick={() => followAgent(agent.id)}>
            {t('terminal.follow')}
          </button>
          {agent.career && (
            <button className={`btn btn-small setup-toggle ${showCareer ? 'setup-toggle-on' : ''}`} aria-expanded={showCareer} title={t('terminal.careerTitle', { name: agent.name })} onClick={() => setShowCareer((v) => !v)}>
              {t('terminal.career')}
            </button>
          )}
          <button
            className={`btn btn-small setup-toggle ${showSetup ? 'setup-toggle-on' : ''}`}
            aria-expanded={showSetup}
            aria-controls="agent-setup"
            title={t('terminal.setupTitle', { name: agent.name })}
            onClick={() => setShowSetup((v) => !v)}
          >
            {t('terminal.setup')}
          </button>
        </div>
      }
    >
      <div className="term-meta">
        {agent.task === 'qa' && agent.status !== 'idle' ? (
          <a href={agent.prUrl ?? '#'} target="_blank" rel="noreferrer">
            {t('terminal.testingPr', { n: String(agent.prNumber), title: agent.issueTitle ?? '' })}
          </a>
        ) : agent.task === 'fix' && agent.status !== 'idle' ? (
          <a href={agent.prUrl ?? '#'} target="_blank" rel="noreferrer">
            {t('terminal.fixingPr', { n: String(agent.prNumber), title: agent.issueTitle ?? '' })}
          </a>
        ) : agent.issueNumber && agent.status !== 'idle' ? (
          <a href={issueUrl!} target="_blank" rel="noreferrer">
            {t('terminal.issue', { n: String(agent.issueNumber), title: agent.issueTitle ?? '' })}
          </a>
        ) : (
          <span className="muted">{t('terminal.nothing')}</span>
        )}
        {agent.prUrl && agent.task === 'issue' && (
          <a href={agent.prUrl} target="_blank" rel="noreferrer" className="chip chip-good">
            PR #{agent.prNumber}
          </a>
        )}
        {qaRec && agent.status !== 'idle' && (
          <span className={`chip ${qaRec.status === 'passed' ? 'chip-good' : ''}`}>
            QA: {qaRec.status}
            {qaRec.round > 1 ? ` · round ${qaRec.round}` : ''}
          </span>
        )}
        {qaRec?.commentUrl && (
          <a href={qaRec.commentUrl} target="_blank" rel="noreferrer">
            {t('terminal.qaReport')}
          </a>
        )}
        {agent.branch && <code>{agent.branch}</code>}
        <span className="muted">
          {(agent.role === 'ceo' ? agent.model : effectiveModel(agent.model, cli, settings, 'claude-opus-5-5')) || t('terminal.defaultModel')} ·{' '}
          {agent.effort || settings.defaultEffort} {t('terminal.effort')}
        </span>
        {agent.startedAt && <span className="muted">⏱ {elapsed(agent.startedAt, working ? null : agent.endedAt)}</span>}
        {agent.turns > 0 && <span className="muted">{agent.turns} turns</span>}
        {agent.costUsd > 0 && <span className="muted" title="API-equivalent cost reported by the coding agent; subscription usage is billed by plan">≈${agent.costUsd.toFixed(2)}</span>}
      </div>
      {agent.lastError && agent.status !== 'working' && <div className="term-error">⚠️ {agent.lastError}</div>}
      {showCareer && <CareerCard agent={agent} />}
      {showSetup && (
        <div id="agent-setup" className="setup-wrap">
          <AgentSetup agent={agent} />
        </div>
      )}

      <div className={`term-split ${agent.hasScreenshot ? 'term-split-2' : ''}`}>
        {agent.terminal ? (
          <LiveTerminal agentId={agent.id} />
        ) : (
          <div
            className="term"
            ref={scroller}
            onScroll={(e) => {
              const el = e.currentTarget;
              stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
            }}
          >
            {log.length === 0 && <div className="term-line term-system">{t('terminal.noOutput')}</div>}
            {log.map((l) => (
              <div key={l.id} className={`term-line term-${l.kind}`}>
                {l.text || ' '}
              </div>
            ))}
            {working && (
              <div className="term-line term-spin">
                ✻ {agent.status === 'preparing' ? (agent.currentTool ?? t('terminal.setupWorktree')) : toolVerb(agent.currentTool) || t('terminal.thinking')}… ({elapsed(agent.startedAt, null)})
              </div>
            )}
          </div>
        )}
        {agent.hasScreenshot && (
          <div className="browser">
            <div className="browser-bar">🔒 {agent.browserUrl ?? 'about:blank'}</div>
            <div className="browser-view" ref={shotView} />
            <div className="muted small">{t('terminal.screenshot')}{agent.screenshotAt ? ` · ${new Date(agent.screenshotAt).toLocaleTimeString()}` : ''}</div>
          </div>
        )}
      </div>

      <form
        className="term-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <MessageBox
          value={text}
          onChange={setText}
          aria-label={`Message ${agent.name}`}
          title={t('terminal.enterSends')}
          placeholder={placeholder}
          disabled={!canMessage}
          autoFocus={!agent.terminal}
        />
        <MicButton kind="agent" value={text} onChange={setText} onSend={send} disabled={!canMessage} />
        <button className="btn" disabled={busy || !canMessage || !text.trim()}>
          {t('terminal.send')}
        </button>
      </form>

      <div className="term-actions">
        {working ? (
          <button className="btn btn-bad" disabled={busy} onClick={() => run(() => api.stop(agent.id))}>
            {t('terminal.stop')}
          </button>
        ) : (
          <>
            <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label={t('terminal.workAria')}>
              <option value="">{choices.length ? t('terminal.pick') : t('terminal.pickNone')}</option>
              {(['issue', 'qa'] as const).map((kind) => {
                const group = choices.filter((c) => c.kind === kind);
                return (
                  group.length > 0 && (
                    <optgroup key={kind} label={kind === 'qa' ? t('terminal.prsToTest') : t('terminal.issuesToBuild')}>
                      {group.map((c) => (
                        <option key={c.key} value={c.key}>
                          {kind === 'qa' ? 'PR ' : ''}#{c.number} {c.title}
                        </option>
                      ))}
                    </optgroup>
                  )
                );
              })}
            </select>
            <button
              className="btn btn-good"
              disabled={busy || !chosen}
              onClick={() =>
                chosen &&
                run(async () => {
                  if (chosen.kind === 'qa') await api.sendToQa(repo.id, chosen.number, agent.id);
                  else await api.assign(agent.id, chosen.number);
                  setPick('');
                })
              }
            >
              {chosen?.kind === 'qa' ? t('terminal.testPr', { n: String(chosen.number) }) : t('terminal.startIssue')}
            </button>
            {agent.status !== 'idle' && (
              <button className="btn" disabled={busy} onClick={() => run(() => api.reset(agent.id))}>
                {t('terminal.clearDesk')}
              </button>
            )}
          </>
        )}
        <span className="spacer" />
        <button
          className="btn btn-ghost"
          disabled={busy}
          onClick={() => {
            void run(async () => {
              const ok = await confirmDialog({
                tone: 'danger',
                icon: '👋',
                title: t('terminal.letGoTitle', { name: agent.name }),
                body: t('terminal.letGoBody'),
                confirm: t('terminal.letGoConfirm', { name: agent.name }),
              });
              if (!ok) return;
              await api.fireAgent(agent.id);
              closeOverlay();
            });
          }}
        >
          {t('terminal.letGo')}
        </button>
      </div>
    </Panel>
  );
}
