// Pocket mode (docs/pocket.md): the office as a 2D app for a phone or any touch screen, on the same store, snapshot
// and REST as the 3D office. Five tabs: Company (each floor's pipeline), Chat (the CEO), Kanban, Team and Approvals.
// Nothing 3D loads here until "Open the 3D office".
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { formatTime, t as tr, useT } from '../i18n';
import { agentsOnRepo, kanbanFor, unreadMessages, useStore } from '../store';
import { CEO_ID } from '../../../shared/types';
import { officeUpdateChip } from '../officeUpdate';
import { KanbanView } from '../ui/KanbanView';
import { NotifySettings } from '../ui/NotifySettings';
import { AccessibilitySettings } from '../ui/AccessibilitySettings';
import { Panel } from '../ui/Panel';
import { Chat } from '../ui/Phone';
import { setMode } from './mode';
import { approvalsBadge, pipelineOf, waitingOnYou, type Pipeline } from './pocketData';
import { Approvals } from './PocketApprovals';
import { Team } from './PocketTeam';

// Opened from the Team and Kanban tabs; loaded when first opened (the terminal brings xterm.js).
const TerminalView = lazy(() => import('../ui/TerminalView').then((m) => ({ default: m.TerminalView })));
const AppViewer = lazy(() => import('../ui/AppViewer').then((m) => ({ default: m.AppViewer })));

export type PocketTab = 'company' | 'chat' | 'kanban' | 'team' | 'approvals';
const TABS: PocketTab[] = ['company', 'chat', 'kanban', 'team', 'approvals'];

/** The tab a link (a notification's ?tab=) asks for. */
function tabFrom(url: string | null | undefined): PocketTab | null {
  const t = url ? new URL(url, location.origin).searchParams.get('tab') : null;
  return TABS.includes(t as PocketTab) ? (t as PocketTab) : null;
}

const name = (fullName: string) => fullName.split('/')[1] ?? fullName;

function openOffice() {
  useStore.getState().openOverlay(null);
  setMode('office');
}

// ---------- company ----------

const STAGES: [keyof Pipeline, string, string][] = [
  ['building', '🔨', 'world.ops.building'],
  ['qa', '🔍', 'world.ops.inQa'],
  ['fixing', '🔧', 'world.ops.fixing'],
  ['ready', '✅', 'world.ops.ready'],
  ['needsYou', '⚠️', 'world.ops.needsYou'],
];

function Banners() {
  const connected = useStore((s) => s.connected);
  const loaded = useStore((s) => s.loaded);
  const usage = useStore((s) => s.usage);
  const update = useStore((s) => (s.restarting ? tr('hud.officeRestarting') : officeUpdateChip(s.officeUpdate)));
  const until = usage.until ? formatTime(usage.until) : null;
  return (
    <>
      {!connected && <div className="pk-banner pk-banner-bad">{loaded ? tr('ui.pocket.reconnecting') : tr('ui.pocket.connecting')}</div>}
      {usage.state === 'paused' && <div className="pk-banner pk-banner-bad">{tr('ui.pocket.paused')}{until ? tr('ui.pocket.until', { until }) : ''}.</div>}
      {usage.state === 'pacing' && <div className="pk-banner">{tr('ui.pocket.pacing')}{until ? tr('ui.pocket.until', { until }) : ''}.</div>}
      {update && <div className="pk-banner">{update}</div>}
    </>
  );
}

function Company({ go }: { go: (tab: PocketTab, repoId?: string) => void }) {
  const repos = useStore((s) => s.repos);
  const agents = useStore((s) => s.agents);
  const qa = useStore((s) => s.qa);
  const requests = useStore((s) => s.requests);
  const ceoInfo = useStore((s) => s.ceo);
  const demo = useStore((s) => s.demo);
  const version = useStore((s) => s.version);
  const ceo = agents[CEO_ID];
  const floors = useMemo(
    () =>
      repos.map((repo) => {
        const team = agentsOnRepo(agents, repo.id);
        return { repo, team: team.length, busy: team.filter((a) => a.status === 'working' || a.status === 'preparing').length, p: pipelineOf(kanbanFor(repo, team, qa)) };
      }),
    [repos, agents, qa],
  );
  const waiting = approvalsBadge(waitingOnYou(repos, qa, requests));
  return (
    <div className="pk-page">
      <Banners />
      {waiting > 0 && (
        <button className="pk-callout" onClick={() => go('approvals')}>
          <span>
            ⚠️ {tr('ui.pocket.decisions', { count: waiting })}
          </span>
          <span>{tr('ui.pocket.approvals')} →</span>
        </button>
      )}
      {ceo && (
        <div className="pk-card pk-ceo">
          <span className="avatar" style={{ background: ceo.color }}>
            {ceo.name[0]}
          </span>
          <div className="grow">
            <b>{ceo.name}</b> <span className="muted small">CEO</span>
            <div className="small">{ceo.status === 'working' ? (ceoInfo.job?.label ?? tr('ui.status.working')) : ceoInfo.queue.length ? tr('world.ceoBoard.next', { next: ceoInfo.queue[0].label }) : tr('ui.pocket.free')}</div>
          </div>
          <button className="btn btn-small" onClick={() => go('chat')}>
            💬 {tr('ui.pocket.chat')}
          </button>
        </div>
      )}
      {floors.length === 0 && <p className="muted">{tr('ui.pocket.noProjects')}</p>}
      {floors.map(({ repo, team, busy, p }) => (
        <div key={repo.id} className="pk-card pk-floor" style={{ ['--accent' as string]: repo.color }}>
          <div className="pk-floor-head">
            <span className="floor-badge">{repo.floor}</span>
            <div className="grow">
              <b className="pk-floor-name">{name(repo.fullName)}</b>
              <div className="muted small pk-ellipsis">{repo.summary || repo.description || repo.fullName}</div>
            </div>
          </div>
          <div className="pk-pipeline" role="list" aria-label={tr('ui.pocket.pipelineAria', { n: repo.floor })}>
            {STAGES.map(([k, icon, label]) => (
              <div key={k} role="listitem" className={`pk-stage ${p[k] ? '' : 'pk-stage-zero'} ${k === 'needsYou' && p[k] ? 'pk-stage-hot' : ''}`}>
                <span className="pk-stage-n">
                  <span className="pk-stage-icon" aria-hidden>
                    {icon}
                  </span>
                  {p[k]}
                </span>
                <span className="pk-stage-label">{tr(label)}</span>
              </div>
            ))}
          </div>
          <div className="pk-floor-foot small">
            <span className="muted">
              {tr('ui.pocket.floorFoot', { team, busy, backlog: p.backlog })}
            </span>
            <span className="spacer" />
            <button className="btn btn-small" onClick={() => go('kanban', repo.id)}>
              {tr('ui.pocket.board')}
            </button>
            <button className="btn btn-small" onClick={() => go('team', repo.id)}>
              {tr('ui.pocket.team')}
            </button>
          </div>
        </div>
      ))}
      <button className="btn pk-wide" onClick={openOffice}>
        {tr('ui.pocket.open3d')}
      </button>
      {demo && <div className="pk-center small muted">{tr('ui.demoMode')}</div>}
      {version && <div className="pk-center small muted">cubefarm {version}</div>}
    </div>
  );
}

// ---------- kanban ----------

function Board({ repoId, pick }: { repoId: string | null; pick: (id: string) => void }) {
  const repos = useStore((s) => s.repos);
  const id = repos.some((r) => r.id === repoId) ? repoId! : repos[0]?.id;
  if (!id) return <p className="muted pk-page">{tr('ui.pocket.noProjectsShort')}</p>;
  return (
    <div className="pk-page">
      {repos.length > 1 && (
        <div className="pk-chips" role="tablist" aria-label={tr('ui.career.floorCol')}>
          {repos.map((r) => (
            <button key={r.id} role="tab" aria-selected={r.id === id} className={`pk-chip ${r.id === id ? 'pk-chip-on' : ''}`} style={{ ['--accent' as string]: r.color }} onClick={() => pick(r.id)}>
              {r.floor} · {name(r.fullName)}
            </button>
          ))}
        </div>
      )}
      <KanbanView key={id} repoId={id} embedded />
    </div>
  );
}

// ---------- the shell ----------

function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div className="toasts">
      {toasts.slice(-2).map((t) => (
        <div key={t.id} className={`toast toast-${t.level}`} onClick={() => dismiss(t.id)}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

/** Panels the tabs open over the page: an agent's terminal and a floor's app. */
function PocketOverlay() {
  const overlay = useStore((s) => s.overlay);
  if (overlay?.kind === 'terminal' && overlay.agentId !== CEO_ID) return <TerminalView agentId={overlay.agentId} />;
  if (overlay?.kind === 'app') return <AppViewer repoId={overlay.repoId} />;
  return null;
}

function Settings({ onClose }: { onClose: () => void }) {
  return (
    <Panel title={tr('ui.pocket.settingsTitle')} onClose={onClose} className="pk-settings">
      <NotifySettings />
      <AccessibilitySettings pocket />
      <div className="card">
        <h3>{tr('ui.pocket.modeTitle')}</h3>
        <p className="muted small">
          {tr('ui.pocket.modeText')} <a href="https://github.com/leonvanzyl/cubefarm/blob/main/docs/pocket.md">docs/pocket.md</a>.
        </p>
        <button className="btn" onClick={openOffice}>
          {tr('ui.pocket.open3d')}
        </button>
      </div>
    </Panel>
  );
}

export default function Pocket() {
  useT(); // the whole pocket office reads its words in render: a language change renders it again
  const [tab, setTab] = useState<PocketTab>(() => tabFrom(location.href) ?? 'company');
  const [repoId, setRepoId] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const company = useStore((s) => s.settings.companyName);
  const loaded = useStore((s) => s.loaded);
  const setupDone = useStore((s) => s.settings.setupDone);
  const unread = useStore((s) => unreadMessages(s.messages, s.phoneReadAt));
  const waiting = useStore((s) => approvalsBadge(waitingOnYou(s.repos, s.qa, s.requests)));
  const ceoName = useStore((s) => s.agents[CEO_ID]?.name ?? 'CEO');
  const usage = useStore((s) => s.usage.state);
  const connected = useStore((s) => s.connected);

  const go = (t: PocketTab, repo?: string) => {
    if (repo) setRepoId(repo);
    setTab(t);
  };
  // A tapped notification (here, or through the service worker) opens what it's about.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const t = tabFrom((e as CustomEvent<string>).detail);
      if (t) setTab(t);
    };
    window.addEventListener('cubefarm:open', onOpen);
    return () => window.removeEventListener('cubefarm:open', onOpen);
  }, []);
  // While the chat is on screen, new CEO messages don't toast (the store reads this as the phone's chat being open).
  useEffect(() => {
    const s = useStore.getState();
    if (tab === 'chat') s.openOverlay({ kind: 'phone', tab: 'chat' });
    else if (s.overlay?.kind === 'phone') s.openOverlay(null);
  }, [tab]);
  useEffect(() => {
    document.title = `${company || 'cubefarm'} · pocket`;
    return () => void (document.title = 'cubefarm');
  }, [company]);

  const tabs: [PocketTab, string, string, number][] = [
    ['company', '📊', tr('ui.pocket.company'), 0],
    ['chat', '💬', ceoName, tab === 'chat' ? 0 : unread],
    ['kanban', '📋', 'Kanban', 0],
    ['team', '👥', tr('ui.pocket.team'), 0],
    ['approvals', '✋', tr('ui.pocket.approvals'), waiting],
  ];
  return (
    <div className="pocket">
      <header className="pk-head">
        <span className="pk-logo" aria-hidden>
          ✻
        </span>
        <b className="pk-title">{company || 'cubefarm'}</b>
        <span className={`pk-dot ${connected ? 'pk-dot-on' : ''}`} title={connected ? tr('ui.pocket.connected') : tr('ui.pocket.notConnected')} />
        <span className="spacer" />
        {usage !== 'normal' && <span className="chip chip-warn">{usage === 'paused' ? tr('ui.store.paused') : tr('ui.pocket.pacingChip')}</span>}
        <button className="pk-icon-btn" onClick={() => setSettings(true)} aria-label={tr('ui.pocket.settings')} title={tr('ui.pocket.settings')}>
          ⚙️
        </button>
      </header>
      <main className={`pk-main ${tab === 'chat' ? 'pk-main-chat' : ''}`}>
        {loaded && !setupDone ? (
          <div className="pk-page">
            <p>{tr('ui.pocket.notSetUp')}</p>
            <button className="btn" onClick={openOffice}>
              {tr('ui.pocket.open3d')}
            </button>
          </div>
        ) : (
          <>
            {tab === 'company' && <Company go={go} />}
            {tab === 'chat' && <Chat autoFocus={false} />}
            {tab === 'kanban' && <Board repoId={repoId} pick={setRepoId} />}
            {tab === 'team' && <Team focusRepo={repoId} />}
            {tab === 'approvals' && <Approvals />}
          </>
        )}
      </main>
      <nav className="pk-tabs" aria-label={tr('ui.pocket.navAria')}>
        {tabs.map(([k, icon, label, badge]) => (
          <button key={k} className={`pk-tab ${tab === k ? 'pk-tab-on' : ''}`} aria-current={tab === k ? 'page' : undefined} onClick={() => setTab(k)}>
            <span className="pk-tab-icon">
              {icon}
              {badge > 0 && <span className="badge badge-dot">{badge}</span>}
            </span>
            <span className="pk-tab-label">{label}</span>
          </button>
        ))}
      </nav>
      <Toasts />
      <Suspense fallback={null}>
        <PocketOverlay />
      </Suspense>
      {settings && <Settings onClose={() => setSettings(false)} />}
    </div>
  );
}
