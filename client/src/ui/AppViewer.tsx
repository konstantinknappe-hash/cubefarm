import { useEffect, useRef, useState, type Ref } from 'react';
import { api } from '../api';
import { qaKey, useStore } from '../store';
import type { PreviewStatus, PreviewView, PullInfo, QaView, RepoView } from '../../../shared/types';
import { atPath, channelLabel, channelLed, channelPulls, comparePath, newPathSync, prAsPreview, qaBadge, qaShotUrl, relayPath, type Channel, type Side } from './channels';
import { Markdown } from './Markdown';
import { Panel } from './Panel';
import { tuneChannel, useChannel, useWatch } from './theatre';
import { useT } from '../i18n';

const ACTIVE: PreviewStatus[] = ['preparing', 'installing', 'starting', 'running'];

// The last width picked, so reopening the viewer keeps it.
let lastWidth: 'desktop' | 'phone' = 'desktop';

// A cross-origin frame never tells us it was refused, so this only catches frames that don't load at all.
const SLOW_LOAD_MS = 12_000;

export function PreviewPill({ status }: { status: PreviewStatus }) {
  const t = useT();
  const STATUS_LABEL: Record<PreviewStatus, string> = {
    unconfigured: t('app.status.unconfigured'),
    stopped: t('app.status.stopped'),
    preparing: t('app.status.preparing'),
    installing: t('app.status.installing'),
    starting: t('app.status.starting'),
    running: t('app.status.running'),
    error: t('app.status.error'),
  };
  return <span className={`status status-${status}`}>{STATUS_LABEL[status]}</span>;
}

// ---------- run settings (also used on the manager's console) ----------

const envText = (env: Record<string, string>) =>
  Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

/** Parse "KEY=value" lines; blank lines and # comments are skipped. */
function parseEnv(text: string, errorLine: (n: number) => string, errorKey: (n: number, key: string) => string): { env: Record<string, string>; error: string | null } {
  const env: Record<string, string> = {};
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    const key = eq > 0 ? line.slice(0, eq).trim() : '';
    if (!key) return { env, error: errorLine(i + 1) };
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return { env, error: errorKey(i + 1, key) };
    env[key] = line.slice(eq + 1).trim();
  }
  return { env, error: null };
}

export function PreviewSettings({ repo, saveLabel, onSaved }: { repo: RepoView; saveLabel?: string; onSaved?: () => void }) {
  const t = useT();
  const saved = { command: repo.previewConfig.command ?? '', env: envText(repo.previewConfig.env) };
  const [command, setCommand] = useState(saved.command);
  const [env, setEnv] = useState(saved.env);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setCommand(saved.command);
    setEnv(saved.env);
  }, [saved.command, saved.env]);

  const dirty = command.trim() !== saved.command || env.trim() !== saved.env;
  const unconfigured = repo.preview.status === 'unconfigured';
  const effectiveSaveLabel = saveLabel ?? t('notify.save');
  return (
    <form
      className="preview-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const parsed = parseEnv(
          env,
          (n) => t('app.parseError', { n: String(n) }),
          (n, key) => t('app.parseErrorKey', { n: String(n), key }),
        );
        if (parsed.error) return setError(parsed.error);
        setError(null);
        setBusy(true);
        try {
          await api.updateRepo(repo.id, { previewCommand: command.trim() || null, previewEnv: parsed.env });
          onSaved?.();
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="field">
        <span>{t('app.runCommand')}</span>
        <input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder={unconfigured ? t('ui.app.commandExample') : t('ui.app.autoDetected')}
          spellCheck={false}
        />
      </label>
      <label className="field">
        <span>{t('app.envLabel')}</span>
        <textarea value={env} onChange={(e) => setEnv(e.target.value)} rows={3} placeholder={'API_URL=http://localhost:{port}/api\nDATA_DIR={tmp}'} spellCheck={false} />
      </label>
      <p className="muted small">
        {t('help.locale') === 'de' ? (
          <>
            Läuft vom Repo-Root im eigenen Vorschau-Worktree der Etage. <code>{'{port}'}</code> ist der Port dieser Etage ({repo.preview.port}) und <code>PORT</code> ist immer gesetzt;{' '}
            <code>{'{tmp}'}</code> ist ein temporärer Ordner.{!unconfigured && ' ' + t('app.autoDetect')}
          </>
        ) : (
          <>
            Runs from the repo root in the floor's own preview worktree. <code>{'{port}'}</code> is this floor's port ({repo.preview.port}) and <code>PORT</code> is always set;{' '}
            <code>{'{tmp}'}</code> is a scratch folder.{!unconfigured && ' ' + t('app.autoDetect')}
          </>
        )}
      </p>
      {error && <div className="term-error">⚠️ {error}</div>}
      <div className="row">
        <button className="btn btn-small btn-good" disabled={busy || (!dirty && !onSaved) || (unconfigured && !command.trim())}>
          {busy ? t('app.saving') : effectiveSaveLabel}
        </button>
        {dirty && (
          <button
            type="button"
            className="btn btn-small btn-ghost"
            onClick={() => {
              setCommand(saved.command);
              setEnv(saved.env);
              setError(null);
            }}
          >
            {t('app.undo')}
          </button>
        )}
      </div>
    </form>
  );
}

// ---------- a preview on stage ----------

const IFRAME_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-pointer-lock';

/**
 * One preview in the viewer: the app in a frame while it runs, else how it's getting on, why it didn't run (with the
 * last lines of its log), or how to start it.
 */
function PreviewStage({
  repo,
  preview,
  label,
  src,
  width,
  reloads,
  busy,
  onStart,
  frameRef,
  compact,
}: {
  repo: RepoView;
  preview: PreviewView;
  label: string; // "main", "PR #212": what it is, for titles and buttons
  src: string | null; // the address to load: the preview's, a path on it, or its sync proxy
  width: 'desktop' | 'phone';
  reloads: number;
  busy: boolean;
  onStart: () => void;
  frameRef?: Ref<HTMLIFrameElement>;
  compact?: boolean;
}) {
  const t = useT();

  const STEPS: { status: PreviewStatus; label: string }[] = [
    { status: 'preparing', label: t('app.step.prepare') },
    { status: 'installing', label: t('app.step.install') },
    { status: 'starting', label: t('app.step.start') },
  ];

  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const running = preview.status === 'running' && !!src;
  const frameKey = `${src}|${preview.startedAt}|${reloads}`;
  useEffect(() => {
    setLoaded(false);
    setSlow(false);
    if (!running) return;
    const timer = setTimeout(() => setSlow(true), SLOW_LOAD_MS);
    return () => clearTimeout(timer);
  }, [frameKey, running]);

  if (running) {
    return (
      <div className={`app-stage ${width === 'phone' ? 'app-stage-phone' : ''}`}>
        <iframe
          key={frameKey}
          ref={frameRef}
          className="app-frame"
          src={src}
          title={`${repo.fullName.split('/')[1]} app (${label})`}
          sandbox={IFRAME_SANDBOX}
          allow="clipboard-read; clipboard-write; fullscreen; autoplay"
          onLoad={() => setLoaded(true)}
          onError={() => setSlow(true)}
        />
        {slow && !loaded && (
          <div className="app-frame-hint" role="status">
            <b>{t('app.frameHint').split('.')[0]}.</b> {t('app.frameHint').split('. ').slice(1).join('. ')}{' '}
            <a href={src} target="_blank" rel="noreferrer">
              {t('app.openNewTab')}
            </a>
          </div>
        )}
      </div>
    );
  }
  if (ACTIVE.includes(preview.status)) {
    const at = STEPS.findIndex((x) => x.status === preview.status);
    return (
      <div className={`app-state ${compact ? 'app-state-compact' : ''}`} role="status">
        <div className="app-state-icon app-spin">⚙️</div>
        <h3>{t('app.starting', { label })}</h3>
        <ol className="app-steps">
          {STEPS.map((s, i) => (
            <li key={s.status} className={i < at ? 'app-step-done' : i === at ? 'app-step-now' : ''}>
              {i < at ? '✓' : i === at ? '●' : '○'} {s.label}
              {s.status === 'starting' && preview.port ? ` on port ${preview.port}` : ''}
            </li>
          ))}
        </ol>
        {preview.logTail.length > 0 && <pre className="term app-log">{preview.logTail.slice(-8).join('\n')}</pre>}
      </div>
    );
  }
  if (preview.status === 'error') {
    return (
      <div className={`app-state app-state-left ${compact ? 'app-state-compact' : ''}`}>
        <h3>⚠️ {t('app.didntRun', { label })}</h3>
        <div className="term-error">{preview.error ?? t('app.appStopped')}</div>
        <pre className="term app-log" aria-label={t('ui.app.lastOutput')}>
          {preview.logTail.length ? preview.logTail.join('\n') : t('app.noOutput')}
        </pre>
        <div className="row wrap">
          <button className="btn btn-good" disabled={busy} onClick={onStart}>
            {t('app.tryAgain')}
          </button>
          <button className="btn" aria-expanded={showSettings} onClick={() => setShowSettings((v) => !v)}>
            {t('app.runSettings')}
          </button>
        </div>
        {showSettings && <PreviewSettings repo={repo} />}
      </div>
    );
  }
  if (preview.status === 'unconfigured') {
    return (
      <div className="app-state app-state-left">
        <h3>{t('app.unconfigTitle')}</h3>
        <p className="muted">{preview.error ?? t('app.noPackageJson')} {t('ui.app.giveCommand')}</p>
        <PreviewSettings repo={repo} saveLabel={t('app.saveStart')} onSaved={onStart} />
      </div>
    );
  }
  return (
    <div className={`app-state ${compact ? 'app-state-compact' : ''}`}>
      <div className="app-state-icon">🖥️</div>
      <h3>{t('app.notRunning', { label })}</h3>
      <p className="muted">
        {preview.pr
          ? t('app.startPr', { branch: repo.defaultBranch })
          : t('app.startMain', { port: String(preview.port) })}
      </p>
      <button className="btn btn-good" disabled={busy} onClick={onStart}>
        {t('app.start', { label })}
      </button>
      {!preview.pr && !compact && (
        <>
          <button className="btn btn-ghost btn-small" aria-expanded={showSettings} onClick={() => setShowSettings((v) => !v)}>
            {t('app.runSettings')}
          </button>
          {showSettings && (
            <div className="app-state-left app-settings">
              <PreviewSettings repo={repo} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------- the PR theatre: channels, compare, QA ----------

/** main, then every open PR on the floor; picking a PR starts its preview. */
function ChannelBar({ repo, channel, onPick }: { repo: RepoView; channel: Channel; onPick: (pr: Channel) => void }) {
  const t = useT();
  const prPreviews = useStore((s) => s.prPreviews);
  const qa = useStore((s) => s.qa);
  const pulls = channelPulls(repo.pulls);
  return (
    <div className="channels" role="tablist" aria-label={t('app.channelsAria')}>
      <button role="tab" aria-selected={channel == null} className={`channel ${channel == null ? 'channel-on' : ''}`} onClick={() => onPick(null)} title={t('app.mainTitle', { branch: repo.defaultBranch })}>
        <span className={`led led-${channelLed(repo.preview.status)}`} aria-hidden /> {repo.defaultBranch}
      </button>
      {pulls.map((p) => {
        const lbl = channelLabel(p, qa[qaKey(repo.id, p.number)]);
        return (
          <button key={p.number} role="tab" aria-selected={channel === p.number} className={`channel ${channel === p.number ? 'channel-on' : ''}`} onClick={() => onPick(p.number)} title={lbl}>
            <span className={`led led-${channelLed(prPreviews[qaKey(repo.id, p.number)]?.status)}`} aria-hidden /> {lbl}
          </button>
        );
      })}
      {pulls.length === 0 && <span className="muted small channels-empty">{t('app.noPrs', { branch: repo.defaultBranch })}</span>}
    </div>
  );
}

const CHECK_ICON = { pass: '✅', fail: '❌', skip: '⏭️' } as const;

/** The PR beside its app: GitHub's checks, and QA's latest report with its screenshots. */
function QaPanel({ repo, pull, qa }: { repo: RepoView; pull: PullInfo; qa?: QaView }) {
  const t = useT();
  const CHECKS_LABEL: Record<PullInfo['checks'], string> = {
    passing: t('ui.app.checksPassing'),
    failing: t('ui.app.checksFailing'),
    pending: t('ui.app.checksRunning'),
    none: t('ui.app.checksNone'),
  };
  const shots = qa?.shots ?? [];
  return (
    <aside className="qa-side" aria-label={t('ui.app.qaSide', { n: pull.number })}>
      <h4 className="qa-side-title">
        <a href={pull.url} target="_blank" rel="noreferrer">
          PR #{pull.number} ↗
        </a>{' '}
        {pull.title}
      </h4>
      <div className="qa-side-meta small">
        <span>
          +{pull.additions} −{pull.deletions}
        </span>
        <a href={`${pull.url}/checks`} target="_blank" rel="noreferrer">
          {t('app.checksLabel')} {CHECKS_LABEL[pull.checks]}
        </a>
        {pull.isDraft && <span>draft</span>}
      </div>
      {pull.failedChecks.length > 0 && (
        <ul className="qa-failed small">
          {pull.failedChecks.map((c) => (
            <li key={c.name}>
              {c.url ? (
                <a href={c.url} target="_blank" rel="noreferrer">
                  ❌ {c.name}
                </a>
              ) : (
                `❌ ${c.name}`
              )}
            </li>
          ))}
        </ul>
      )}
      {qa ? (
        <>
          <div className="qa-side-status">
            <span className={`qa-badge qa-badge-${qa.status}`}>{qaBadge(qa)}</span>
            <span className="muted small">round {qa.round}</span>
            {qa.commentUrl && (
              <a className="small" href={qa.commentUrl} target="_blank" rel="noreferrer">
                {t('app.fullReport')}
              </a>
            )}
          </div>
          {qa.summary ? <Markdown className="qa-summary" text={qa.summary} /> : <p className="muted small">{qa.status === 'testing' ? t('app.qaTesting') : t('app.qaNoReport')}</p>}
          {qa.checks.length > 0 && (
            <ul className="qa-checks">
              {qa.checks.map((c, i) => (
                <li key={i} className={`qa-check qa-check-${c.result}`}>
                  <span aria-label={c.result}>{CHECK_ICON[c.result]}</span>
                  <div>
                    <b>{c.name}</b>
                    {c.details && <div className="muted small">{c.details}</div>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {shots.length > 0 && (
            <div className="qa-shots">
              {shots.map((s, i) => {
                const url = qaShotUrl(repo.id, pull.number, i, qa.updatedAt);
                return (
                  <a key={i} className="qa-shot" href={url} target="_blank" rel="noreferrer" title={s.page ?? s.caption}>
                    <img src={url} alt={s.caption} loading="lazy" />
                    <span className="small">{s.caption}</span>
                  </a>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <p className="muted small">{t('app.qaNotTested')}</p>
      )}
    </aside>
  );
}

// Remembered while the page is open, like the width.
let lastSync = true;

/** A sync proxy's address in front of a running preview while syncing (a new one after every restart: the old one closed with the app). */
function useSyncProxy(repoId: string, pr: number | null, p: PreviewView, on: boolean): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setUrl(null);
    if (!on || p.status !== 'running') return;
    let alive = true;
    api
      .previewSync(repoId, pr)
      .then((r) => alive && setUrl(r.url))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [repoId, pr, on, p.status, p.startedAt]);
  return url;
}

/**
 * main on the left, the PR on the right, the same path in both. Synced scrolling shows each side through a sync
 * proxy (server/syncProxy.ts) whose script reports scrolling and navigation; the other side follows.
 */
function CompareView({
  repo,
  main,
  pr,
  width,
  reloads,
  busy,
  onStartMain,
  onStartPr,
}: {
  repo: RepoView;
  main: PreviewView;
  pr: PreviewView;
  width: 'desktop' | 'phone';
  reloads: number;
  busy: boolean;
  onStartMain: () => void;
  onStartPr: () => void;
}) {
  const t = useT();
  const [path, setPath] = useState('/');
  const [draft, setDraft] = useState('/');
  const [opened, setOpened] = useState(0); // "Open on both" reloads both sides, even on the path they started on
  const [sync, setSync] = useState(lastSync);
  const [where, setWhere] = useState<Record<Side, string | null>>({ main: null, pr: null }); // the path each side reports
  const mainFrame = useRef<HTMLIFrameElement>(null);
  const prFrame = useRef<HTMLIFrameElement>(null);
  const frames = { main: mainFrame, pr: prFrame };
  const driven = useRef<Record<Side, number>>({ main: 0, pr: 0 }); // until when a side's scrolling is our own echo
  const paths = useRef(newPathSync());

  const proxy: Record<Side, string | null> = { main: useSyncProxy(repo.id, null, main, sync), pr: useSyncProxy(repo.id, pr.pr, pr, sync) };

  // Each side's script says where it is; the other side follows while syncing. What we asked a side to do echoes back:
  // that isn't passed on again.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { cubefarmSync?: unknown; x?: unknown; y?: unknown; path?: unknown } | null;
      if (!d || (d.cubefarmSync !== 'scroll' && d.cubefarmSync !== 'path')) return;
      const from: Side | null = e.source && e.source === frames.main.current?.contentWindow ? 'main' : e.source && e.source === frames.pr.current?.contentWindow ? 'pr' : null;
      if (!from) return;
      const to: Side = from === 'main' ? 'pr' : 'main';
      if (typeof d.path === 'string') setWhere((x) => (x[from] === d.path ? x : { ...x, [from]: d.path as string }));
      if (!sync) return;
      const target = frames[to].current?.contentWindow;
      const now = Date.now();
      if (d.cubefarmSync === 'scroll' && now > driven.current[from]) {
        driven.current[to] = now + 250;
        target?.postMessage({ cubefarmSyncTo: 'scroll', x: d.x, y: d.y }, '*');
      } else if (d.cubefarmSync === 'path' && typeof d.path === 'string' && relayPath(paths.current, from, d.path, now)) {
        target?.postMessage({ cubefarmSyncTo: 'path', path: d.path }, '*');
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // frames are refs: stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sync]);

  const src = (p: PreviewView, side: Side) => (p.url ? atPath((sync && proxy[side]) || p.url, path) : null);
  const sideLabel = (p: PreviewView, side: Side) => (
    <div className="compare-label">
      <b>{side === 'main' ? repo.defaultBranch : p.ref}</b>
      {p.commit && <code>{p.commit}</code>}
      {where[side] && <span className="muted">{where[side]}</span>}
      {sync && where[side] !== null && <span className="compare-synced">{t('app.synced')}</span>}
    </div>
  );
  return (
    <div className="compare">
      <form
        className="compare-bar"
        onSubmit={(e) => {
          e.preventDefault();
          const next = comparePath(draft);
          setDraft(next);
          setPath(next);
          setOpened((n) => n + 1);
        }}
      >
        <label className="compare-path">
          <span className="muted small">{t('app.path')}</span>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} aria-label={t('app.pathAria')} />
        </label>
        <button className="btn btn-small">{t('app.openOnBoth')}</button>
        <label className="toggle small" title={t('ui.app.syncTip')}>
          <input
            type="checkbox"
            checked={sync}
            onChange={(e) => {
              lastSync = e.target.checked;
              setSync(e.target.checked);
              setWhere({ main: null, pr: null }); // the frames reload, through the proxies or straight
              paths.current = newPathSync();
            }}
          />{' '}
          {t('app.syncScrolling')}
        </label>
      </form>
      <div className="compare-sides">
        <div className="compare-side">
          {sideLabel(main, 'main')}
          <PreviewStage repo={repo} preview={main} label={repo.defaultBranch} src={src(main, 'main')} width={width} reloads={reloads + opened} busy={busy} onStart={onStartMain} frameRef={frames.main} compact />
        </div>
        <div className="compare-side">
          {sideLabel(pr, 'pr')}
          <PreviewStage repo={repo} preview={pr} label={pr.ref ?? 'the PR'} src={src(pr, 'pr')} width={width} reloads={reloads + opened} busy={busy} onStart={onStartPr} frameRef={frames.pr} compact />
        </div>
      </div>
    </div>
  );
}

// ---------- the viewer ----------

// Remembered while the page is open, so reopening the viewer keeps them.
let lastCompare = false;
let lastQa = true;

/** The floor's app on the big screen, up close: main or one of its open PRs, alone or beside main. */
export function AppViewer({ repoId, pr }: { repoId: string; pr?: number | null }) {
  const t = useT();
  const repo = useStore((s) => s.repos.find((r) => r.id === repoId));
  const prPreviews = useStore((s) => s.prPreviews);
  const qaRecords = useStore((s) => s.qa);
  const channel = useChannel(repoId);
  const [width, setWidth] = useState(lastWidth);
  const [compare, setCompare] = useState(lastCompare);
  const [showQa, setShowQa] = useState(lastQa);
  const [busy, setBusy] = useState(false);
  const [reloads, setReloads] = useState(0);
  const toolbar = useRef<HTMLDivElement>(null);

  // Opened on a channel (a chip on the big screen, a Kanban PR card): tune to it.
  useEffect(() => {
    if (pr !== undefined) tuneChannel(repoId, pr);
  }, [repoId, pr]);
  useWatch(repoId, channel);

  // Start with focus on the toolbar, so Esc closes the panel until the app itself is clicked.
  useEffect(() => {
    toolbar.current?.querySelector<HTMLElement>('button')?.focus();
  }, []);

  if (!repo) {
    return (
      <Panel title="App">
        <p className="muted">{t('app.gone')}</p>
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
  const main = repo.preview;
  const prView = channel == null ? null : prAsPreview(prPreviews[qaKey(repo.id, channel)], channel);
  const current = prView ?? main;
  const pull = channel == null ? undefined : repo.pulls.find((p) => p.number === channel);
  const startMain = () => run(() => api.startPreview(repo.id));
  const startPr = (restart = false) => channel != null && run(() => api.startPrPreview(repo.id, channel, restart));
  const pickWidth = (w: typeof width) => {
    lastWidth = w;
    setWidth(w);
  };
  const active = ACTIVE.includes(current.status);
  const label = channel == null ? repo.defaultBranch : `PR #${channel}`;
  const name = repo.fullName.split('/')[1];
  const comparing = compare && prView != null;

  return (
    <Panel
      wide
      className="panel-app"
      accent={repo.color}
      title={
        <span className="app-title">
          <span className="app-title-name">🖥️ {name}</span>
          <PreviewPill status={current.status} />
          {current.ref && current.status !== 'stopped' && current.status !== 'unconfigured' && (
            <span className="muted small app-title-ref">
              {current.ref}
              {current.commit ? ` · ${current.commit}` : ''}
            </span>
          )}
        </span>
      }
    >
      <div ref={toolbar}>
        <ChannelBar repo={repo} channel={channel} onPick={(n) => tuneChannel(repo.id, n)} />
        <div className="app-toolbar" role="toolbar" aria-label={t('ui.app.controls')}>
          {active ? (
            <>
              <button className="btn btn-small" disabled={busy} onClick={() => void (channel == null ? startMain() : startPr(true))} title={channel == null ? t('app.restartTitle', { label }) : t('app.restartTitlePr', { label })}>
                {t('app.restart')}
              </button>
              <button className="btn btn-small btn-bad" disabled={busy} onClick={() => void run(() => (channel == null ? api.stopPreview(repo.id) : api.stopPrPreview(repo.id, channel)))}>
                {t('app.stop')}
              </button>
            </>
          ) : (
            <button className="btn btn-small btn-good" disabled={busy || current.status === 'unconfigured'} onClick={() => void (channel == null ? startMain() : startPr())}>
              {t('app.startBtn')}
            </button>
          )}
          {prView && (
            <button
              className={`btn btn-small ${comparing ? 'btn-on' : ''}`}
              aria-pressed={comparing}
              onClick={() => {
                lastCompare = !compare;
                setCompare(!compare);
              }}
              title={t('app.compareTitle', { main: repo.defaultBranch, n: String(channel) })}
            >
              {t('app.compare', { branch: repo.defaultBranch })}
            </button>
          )}
          <button className="btn btn-small" disabled={current.status !== 'running' && !(comparing && main.status === 'running')} onClick={() => setReloads((n) => n + 1)} title={t('app.reloadTitle')}>
            {t('app.reload')}
          </button>
          <div className="seg" role="group" aria-label={t('app.widthAria')}>
            <button className={`seg-btn ${width === 'desktop' ? 'seg-on' : ''}`} aria-pressed={width === 'desktop'} onClick={() => pickWidth('desktop')}>
              {t('app.desktop')}
            </button>
            <button className={`seg-btn ${width === 'phone' ? 'seg-on' : ''}`} aria-pressed={width === 'phone'} onClick={() => pickWidth('phone')} title={t('app.phoneTitle')}>
              {t('app.phone')}
            </button>
          </div>
          <span className="spacer" />
          {prView && (
            <button
              className={`btn btn-small ${showQa ? 'btn-on' : ''}`}
              aria-pressed={showQa}
              onClick={() => {
                lastQa = !showQa;
                setShowQa(!showQa);
              }}
            >
              {t('app.qa')}
            </button>
          )}
          {current.url ? (
            <a className="btn btn-small" href={current.url} target="_blank" rel="noreferrer">
              {t('app.openTab')}
            </a>
          ) : (
            <button className="btn btn-small" disabled>
              {t('app.openTab')}
            </button>
          )}
        </div>
      </div>

      <div className="app-body">
        <div className="app-main">
          {comparing ? (
            <CompareView repo={repo} main={main} pr={prView} width={width} reloads={reloads} busy={busy} onStartMain={() => void startMain()} onStartPr={() => void startPr()} />
          ) : (
            <PreviewStage repo={repo} preview={current} label={label} src={current.url} width={width} reloads={reloads} busy={busy} onStart={() => void (channel == null ? startMain() : startPr())} />
          )}
        </div>
        {prView && showQa && pull && <QaPanel repo={repo} pull={pull} qa={qaRecords[qaKey(repo.id, pull.number)]} />}
      </div>
      {current.status === 'running' && (
        <p className="muted small app-foot">
          {t('ui.app.footBlank')} <b>{t('app.openTab')}</b>{t('ui.app.footKeys')} <kbd>Esc</kbd> {t('ui.app.footEsc')} <b>✕</b> {t('ui.app.footAlways')}
          {prView && ` ${t('ui.app.footPr')}`}
        </p>
      )}
    </Panel>
  );
}
