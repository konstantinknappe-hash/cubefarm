import { formatTime, t as tr, useT } from '../i18n';
import { LanguageSettings } from '../i18n/LanguageSettings';
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { TeamStats } from './CareerCard';
import { api } from '../api';
import { PreviewPill, PreviewSettings } from './AppViewer';
import { agentsOnRepo, pendingRequests, useStore, type ManagerTab } from '../store';
import { CEO_ID, DEFAULT_MAX_AGENTS, FLOOR_SEATS, type AgentCli, type EffortLevel, type OfficeUpdateView, type RepoView } from '../../../shared/types';
import { CLAUDE_MODELS, modelSuggestions } from '../../../shared/models';
import { CliOptions, CliSelect, cliName, EFFORTS, EffortSelect, LookEditor, LookSelect, ModelInput, NameInput, PromptPreview } from './AgentSettings';
import { canPostpone, canUpdateNow, drainDeadline, officeUpdateText } from '../officeUpdate';
import { confirmDialog } from './Confirm';
import { IssueForm } from './KanbanView';
import { LiveTerminal } from './LiveTerminal';
import { MicButton } from './MicButton';
import { OpsTab } from './MissionConsole';
import { NotifySettings } from './NotifySettings';
import { ProfileSettings } from './ProfileSettings';
import { Panel } from './Overlays';
import { Resume } from './Phone';
import { ProjectPicker } from './ProjectPicker';
import { StatusPill } from './TerminalView';
import { ThemeSettings } from './ThemeSettings';
import { TimeLapseTab } from './TimeLapse';
import { VoiceSettings } from './VoiceSettings';
import { AccessibilitySettings } from './AccessibilitySettings';
import { OutsideSettings } from './OutsideSettings';

async function attempt<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch {
    return undefined; // api() already toasted the error
  }
}

// ---------- floors ----------

const noLauncher = () => tr('ui.console.noLauncher');

/** The office itself: the commit it runs and its own update. Hidden on servers that can't update themselves. */
function OfficeRow({ update }: { update: OfficeUpdateView }) {
  const t = useT();
  const commit = useStore((s) => s.officeCommit);
  const autoUpdate = useStore((s) => s.settings.autoUpdate);
  const [busy, setBusy] = useState(false);
  const act = (action: 'now' | 'later') => {
    setBusy(true);
    void attempt(() => api.updateOffice(action)).finally(() => setBusy(false));
  };
  const deadline = drainDeadline(update);
  const pending = update.state !== 'none';
  const tone = update.state === 'failed' ? 'office-state-bad' : update.state === 'none' ? 'office-state-ok' : 'office-state-busy';
  const tip = (enabled: boolean, text: string) => (update.launcher ? (enabled ? text : undefined) : noLauncher());
  return (
    <div className="card office-card">
      <div className="row wrap">
        <span className="floor-badge office-badge" aria-hidden>
          🏢
        </span>
        <div className="grow">
          <b>{t("project.office")}</b> <span className="muted small">running {commit ? <code>{commit}</code> : t("project.unknownCommit")}</span>
          <div className={`small office-state ${tone}`} role="status">
            {officeUpdateText(update)}
          </div>
        </div>
        {pending && (
          <div className="office-actions" title={update.launcher ? undefined : noLauncher()}>
            <button
              className="btn btn-small btn-good"
              disabled={busy || !canUpdateNow(update)}
              title={tip(canUpdateNow(update), t('ui.console.updateNowTip'))}
              onClick={() => act('now')}
            >
              {t("project.updateNow")}
            </button>
            <button className="btn btn-small btn-ghost" disabled={busy || !canPostpone(update)} title={tip(canPostpone(update), t('ui.console.laterTip'))} onClick={() => act('later')}>
              {t("project.later")}
            </button>
          </div>
        )}
      </div>
      {update.detail && update.state !== 'failed' && <div className="muted small">{update.detail}</div>}
      {deadline && update.running > 0 && (
        <div className="muted small">{t('ui.console.deadline', { time: formatTime(deadline) })}</div>
      )}
      {!update.launcher && pending && <div className="muted small">{noLauncher()}</div>}
      {typeof autoUpdate === 'boolean' && (
        <label className="toggle" title={t('ui.console.autoUpdateTip')}>
          <input type="checkbox" checked={autoUpdate} onChange={(e) => void attempt(() => api.updateSettings({ autoUpdate: e.target.checked }))} /> {t("project.autoUpdate")}
        </label>
      )}
    </div>
  );
}

function FloorRow({ repo, all }: { repo: RepoView; all: RepoView[] }) {
  const t = useT();
  const agents = useStore((s) => s.agents);
  const goToFloor = useStore((s) => s.goToFloor);
  const openOverlay = useStore((s) => s.openOverlay);
  // The office's own folder isn't fast-forwarded; its update is on the Office row instead.
  const officeFolder = useStore((s) => !!s.officeUpdate) && !!repo.folderSync?.startsWith('update ready');
  const team = agentsOnRepo(agents, repo.id);
  const others = all.filter((r) => r.id !== repo.id);
  const patch = (p: Parameters<typeof api.updateRepo>[1]) => void attempt(() => api.updateRepo(repo.id, p));
  return (
    <div className="card floor-card" style={{ ['--accent' as string]: repo.color }}>
      <div className="row">
        <span className="floor-badge">{repo.floor}</span>
        <div className="grow">
          <a href={repo.url} target="_blank" rel="noreferrer">
            <b>{repo.fullName}</b>
          </a>
          {repo.summary && <div className="small">🧠 {repo.summary}</div>}
          <div className="muted small">
            {t('ui.console.repoLine', { agents: team.length, issues: repo.issues.length, prs: repo.pulls.filter((p) => p.state === 'OPEN').length })} <code>{repo.defaultBranch}</code>
            {repo.cloneStatus !== 'ready' && ` · ${t('ui.console.checkout', { status: repo.cloneStatus })}`}
          </div>
          <div className="muted small" title={repo.localPath ? t('ui.console.ownFolder') : t('ui.console.managedClone')}>
            📁 <code>{repo.checkoutPath}</code>
            {officeFolder ? t('ui.console.officeFolder') : repo.folderSync && <span title={repo.folderSync}> · {repo.folderSync}</span>}{' '}
            <button className="btn btn-small btn-ghost" title={t('ui.console.syncTip')} onClick={() => void attempt(() => api.syncFolder(repo.id))}>
              ⟳ {t("project.syncNow")}
            </button>
          </div>
          {repo.cloneError && <div className="term-error small">{t('ui.console.cloneFailed', { error: repo.cloneError })}</div>}
          {repo.syncError && <div className="term-error small">{t('ui.console.syncFailed', { error: repo.syncError })}</div>}
        </div>
        <input type="color" value={repo.color} onChange={(e) => patch({ color: e.target.value })} title={t("project.floorColor")} aria-label={t('ui.console.colourAria', { n: repo.floor })} />
        <button className="btn btn-small" onClick={() => goToFloor(repo.floor)}>
          {t("project.visit")}
        </button>
      </div>
      <div className="row wrap">
        <label className="toggle">
          <input type="checkbox" checked={repo.autoAssign} onChange={(e) => patch({ autoAssign: e.target.checked })} /> ⚡ {t("project.autoAssign")}
        </label>
        <label className="toggle" title={t('ui.console.autoMergeTip')}>
          <input type="checkbox" checked={repo.autoMerge} onChange={(e) => patch({ autoMerge: e.target.checked })} /> 🔀 {t("project.autoMerge")}
        </label>
        <label className="toggle">
          <input type="checkbox" checked={repo.browserTesting} onChange={(e) => patch({ browserTesting: e.target.checked })} /> 🌐 {t("project.browserTesting")}
        </label>
        <span className="spacer" />
        <button
          className="btn btn-small btn-ghost"
          onClick={() => {
            void confirmDialog({
              tone: 'danger',
              title: t('ui.console.disconnectTitle', { name: repo.fullName }),
              body: repo.localPath ? t('ui.console.disconnectBodyLocal') : t('ui.console.disconnectBodyClone'),
              confirm: t('ui.console.disconnect'),
            }).then((ok) => ok && attempt(() => api.disconnectRepo(repo.id)));
          }}
        >
          {t("project.disconnect")}
        </button>
      </div>
      {others.length > 0 && (
        <div className="row wrap links">
          <span className="muted small">🔗 {t("project.readAccess")}</span>
          {others.map((o) => (
            <label key={o.id} className="toggle small">
              <input
                type="checkbox"
                checked={repo.links.includes(o.id)}
                onChange={(e) => patch({ links: e.target.checked ? [...repo.links, o.id] : repo.links.filter((l) => l !== o.id) })}
              />
              {o.fullName}
            </label>
          ))}
        </div>
      )}
      <details className="small preview-details">
        <summary>
          🖥️ {t("project.preview")} · <PreviewPill status={repo.preview.status} />
          {repo.previewConfig.command ? (
            <>
              {' '}
              <code>{repo.previewConfig.command}</code>
            </>
          ) : (
            t('ui.console.autoDetected')
          )}
        </summary>
        <PreviewSettings repo={repo} />
        <button className="btn btn-small" onClick={() => openOverlay({ kind: 'app', repoId: repo.id })}>
          {t("project.viewer")}
        </button>
      </details>
    </div>
  );
}

function FloorsTab() {
  const t = useT();
  const repos = useStore((s) => s.repos);
  const officeUpdate = useStore((s) => s.officeUpdate);
  return (
    <div className="tab-grid">
      <div>
        {officeUpdate && <OfficeRow update={officeUpdate} />}
        <h3 className="section">🏢 {t("project.floors")}</h3>
        {repos.length === 0 && <p className="muted">{t("project.noFloors")}</p>}
        {[...repos].sort((a, b) => a.floor - b.floor).map((r) => (
          <FloorRow key={r.id} repo={r} all={repos} />
        ))}
      </div>
      <div className="card">
        <h3>➕ {t("project.addProject")}</h3>
        <ProjectPicker />
      </div>
    </div>
  );
}

// ---------- CEO ----------

function FloorBrief({ repo }: { repo: RepoView }) {
  const t = useT();
  const [mission, setMission] = useState(repo.mission);
  useEffect(() => setMission(repo.mission), [repo.mission]);
  return (
    <div className="card floor-card" style={{ ['--accent' as string]: repo.color }}>
      <div className="row">
        <span className="floor-badge">{repo.floor}</span>
        <div className="grow">
          <b>{repo.fullName}</b>
          <div className="muted small">{repo.summary ? `🧠 ${repo.summary}` : t("project.notStudied")}</div>
        </div>
        <button className="btn btn-small btn-ghost" onClick={() => void attempt(() => api.onboardFloor(repo.id))} title={t('ui.console.restudyTip')}>
          {t("project.restudy")}
        </button>
      </div>
      <textarea value={mission} onChange={(e) => setMission(e.target.value)} rows={2} placeholder={t("project.missionPlaceholder")} />
      <div className="row">
        <button className="btn btn-small" disabled={mission === repo.mission} onClick={() => void attempt(() => api.updateRepo(repo.id, { mission }))}>
          {t("project.saveBrief")}
        </button>
        <span className="spacer" />
        <button className="btn btn-small btn-good" disabled={!mission.trim()} onClick={() => void attempt(() => api.planFloor(repo.id, mission))}>
          🧠 {t("project.plan")}
        </button>
      </div>
      <details className="small">
        <summary>{t("project.qaBrief")}{repo.qaBrief ? "" : t("project.noneYet")}</summary>
        <textarea
          key={repo.qaBrief}
          rows={4}
          defaultValue={repo.qaBrief}
          placeholder={t("project.qaPlaceholder")}
          onBlur={(e) => e.target.value !== repo.qaBrief && void attempt(() => api.updateRepo(repo.id, { qaBrief: e.target.value }))}
        />
      </details>
    </div>
  );
}

function CeoTab() {
  const t = useT();
  const ceo = useStore((s) => s.agents[CEO_ID]);
  const log = useStore((s) => s.logs[CEO_ID]) ?? [];
  const info = useStore((s) => s.ceo);
  const repos = useStore((s) => s.repos);
  const requests = useStore((s) => s.requests);
  const openOverlay = useStore((s) => s.openOverlay);
  const [text, setText] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log.length]);
  if (!ceo) return <p className="muted">{t("ceo.empty")}</p>;
  const working = ceo.status === 'working';
  const pending = pendingRequests(requests);
  const send = (t: string) => {
    if (!t.trim()) return;
    setText('');
    void attempt(() => api.messageCeo(t));
  };
  const decided = requests.filter((r) => r.status !== 'pending').slice(-6).reverse();
  return (
    <div className="tab-grid">
      <div>
        <div className="card">
          <div className="row">
            <span className="avatar" style={{ background: ceo.color }}>
              {ceo.name[0]}
            </span>
            <NameInput agent={ceo} style={{ maxWidth: 140, fontWeight: 700 }} />
            <span className="muted small">CEO</span>
            <StatusPill status={ceo.status} />
            <span className="spacer" />
            <ModelInput agent={ceo} style={{ maxWidth: 150 }} />
            <EffortSelect agent={ceo} style={{ width: 'auto' }} />
          </div>
          <div className="small">
            <b>{t("ceo.now")}</b> {working ? info.job?.label : t("ceo.free")}
            {info.queue.length > 0 && (
              <>
                {' '}
                · <b>{t("ceo.next")}</b> {info.queue.map((j) => j.label).join(' → ')}
              </>
            )}
          </div>
          <div className="muted small">
            {info.nextReviewAt ? t("ceo.nextReview").replace("{time}", formatTime(info.nextReviewAt)) : t("ceo.reviewsOff")}
          </div>
          <PromptPreview agent={ceo} />
          {ceo.terminal ? (
            <LiveTerminal agentId={ceo.id} className="ceo-term" />
          ) : (
            <div className="term ceo-term" ref={scroller}>
              {log.length === 0 && <div className="term-line term-system">{t("ceo.nothing")}</div>}
              {log.map((l) => (
                <div key={l.id} className={`term-line term-${l.kind}`}>
                  {l.text || ' '}
                </div>
              ))}
            </div>
          )}
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              send(text);
            }}
          >
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t("ceo.message").replace("{name}", ceo.name)} />
            <MicButton kind="console" value={text} onChange={setText} onSend={send} />
            <button className="btn" disabled={!text.trim()}>
              {t("ceo.send")}
            </button>
          </form>
          <div className="row">
            {working && (
              <button className="btn btn-small btn-bad" onClick={() => void attempt(() => api.stop(ceo.id))}>
                {t("ceo.stop")}
              </button>
            )}
            <button className="btn btn-small" disabled={repos.length === 0} onClick={() => void attempt(() => api.ceoReview())}>
              {t("ceo.review")}
            </button>
            <button className="btn btn-small" onClick={() => openOverlay({ kind: 'phone', tab: 'chat' })}>
              {t("ceo.phone")}
            </button>
          </div>
        </div>
      </div>
      <div>
        <h3 className="section">📄 {t("ceo.team")} {pending.length > 0 && <span className="badge">{pending.length}</span>}</h3>
        {pending.length === 0 && <p className="muted small">{t("ceo.noRequests")}</p>}
        {pending.map((r) => (
          <Resume key={r.id} req={r} />
        ))}
        {decided.length > 0 && (
          <details className="small" style={{ marginBottom: 12 }}>
            <summary>{t("ceo.decisions")}</summary>
            {decided.map((r) => (
              <Resume key={r.id} req={r} />
            ))}
          </details>
        )}
        <h3 className="section">🗺️ {t("ceo.projects")}</h3>
        {repos.length === 0 && <p className="muted small">{t("ceo.connect")}</p>}
        {[...repos].sort((a, b) => a.floor - b.floor).map((r) => (
          <FloorBrief key={r.id} repo={r} />
        ))}
      </div>
    </div>
  );
}

// ---------- team ----------

interface NewAgent {
  name: string;
  cli: AgentCli | '';
  model: string;
  effort: EffortLevel | '';
}

const NO_SETUP: NewAgent = { name: '', cli: '', model: '', effort: '' };

/** A floor's "+ Agent": an optional name and their coding agent, model and effort ('' = the office's defaults). */
function AddAgent({ repo, size }: { repo: RepoView; size: number }) {
  const t = useT();
  const settings = useStore((s) => s.settings);
  const clis = useStore((s) => s.clis);
  const [draft, setDraft] = useState<NewAgent>(NO_SETUP);
  const [busy, setBusy] = useState(false);
  const terminal = settings.runtime === 'terminal';
  const cli = terminal ? draft.cli || settings.defaultCli : 'claude';
  const full = size >= settings.maxAgents;
  const edit = (p: Partial<NewAgent>) => setDraft({ ...draft, ...p });
  const add = () => {
    setBusy(true);
    const { name, ...setup } = draft;
    void attempt(() => api.hireAgent(repo.id, { ...setup, name: name.trim() || undefined }))
      .then((a) => a && setDraft(NO_SETUP))
      .finally(() => setBusy(false));
  };
  return (
    <div className="row wrap">
      <input value={draft.name} onChange={(e) => edit({ name: e.target.value })} placeholder={t("team.nameOptional")} maxLength={24} aria-label={`${t("team.newName")} ${repo.floor}`} style={{ maxWidth: 150 }} />
      {terminal && (
        <select value={draft.cli} onChange={(e) => edit({ cli: e.target.value as AgentCli | '' })} aria-label={t("team.newCli")} style={{ width: 'auto' }}>
          <option value="">{cliName(clis, settings.defaultCli)} ({t("team.default")})</option>
          <CliOptions clis={clis} />
        </select>
      )}
      <input value={draft.model} onChange={(e) => edit({ model: e.target.value })} list={`new-agent-models-${repo.floor}`} placeholder={t("team.defaultModel")} aria-label={t("team.newModel")} style={{ maxWidth: 150 }} />
      <datalist id={`new-agent-models-${repo.floor}`}>
        {modelSuggestions(cli).map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <select value={draft.effort} onChange={(e) => edit({ effort: e.target.value as EffortLevel | '' })} aria-label={t("team.newEffort")} style={{ width: 'auto' }}>
        <option value="">{t("team.defaultEffort")} ({settings.defaultEffort})</option>
        {EFFORTS.map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </select>
      <span title={full ? t("team.floorFull").replace("{floor}", String(repo.floor)).replace("{max}", String(settings.maxAgents)) : undefined}>
        <button className="btn btn-small btn-good" disabled={busy || full} onClick={add}>
          {t("team.add")}
        </button>
      </span>
    </div>
  );
}

function TeamTab() {
  const t = useT();
  const repos = useStore((s) => s.repos);
  const agents = useStore((s) => s.agents);
  const settings = useStore((s) => s.settings);
  const openOverlay = useStore((s) => s.openOverlay);
  const terminal = settings.runtime === 'terminal';
  const [openLook, setOpenLook] = useState<string | null>(null);
  if (repos.length === 0) return <p className="muted">{t("team.noRepo")}</p>;
  return (
    <div>
      <TeamStats />
      {[...repos].sort((a, b) => a.floor - b.floor).map((repo) => {
        const team = agentsOnRepo(agents, repo.id).filter((a) => a.role !== 'ceo');
        return (
          <div key={repo.id} className="card floor-card" style={{ ['--accent' as string]: repo.color }}>
            <div className="row wrap">
              <span className="floor-badge">{repo.floor}</span>
              <b className="grow">{repo.fullName}</b>
              <span className="muted small">
                {t("team.agentCount").replace("{count}", String(team.length)).replace("{max}", String(settings.maxAgents))}
              </span>
            </div>
            <AddAgent repo={repo} size={team.length} />
            {team.length === 0 && <div className="muted small">{t("team.empty")}</div>}
            <table className="team">
              <tbody>
                {team.map((a) => (
                  <Fragment key={a.id}>
                  <tr>
                    <td>
                      <span className="dot" style={{ background: a.color }} />
                    </td>
                    <td>
                      <NameInput agent={a} />
                    </td>
                    <td>
                      <button className="btn btn-small btn-ghost" aria-expanded={openLook === a.id} title={t("team.appearance").replace("{name}", a.name)} onClick={() => setOpenLook(openLook === a.id ? null : a.id)}>
                        🎨
                      </button>
                    </td>
                    <td>
                      <StatusPill status={a.status} />
                    </td>
                    <td className="small">{a.status === 'idle' ? <span className="muted">—</span> : a.task === 'qa' ? t("team.testing").replace("{number}", String(a.prNumber)) : a.task === 'fix' ? t("team.fixing").replace("{number}", String(a.prNumber)) : `#${a.issueNumber ?? ''} ${a.issueTitle ?? ''}`.slice(0, 40)}</td>
                    {terminal && (
                      <td>
                        <CliSelect agent={a} style={{ width: 112 }} />
                      </td>
                    )}
                    <td>
                      <ModelInput agent={a} style={{ minWidth: 110 }} />
                    </td>
                    <td>
                      <EffortSelect agent={a} style={{ width: 124 }} />
                    </td>
                    <td className="nowrap">
                      <button className="btn btn-small" onClick={() => openOverlay({ kind: 'terminal', agentId: a.id })}>
                        {t("team.terminal")}
                      </button>{' '}
                      <button
                        className="btn btn-small btn-ghost"
                        onClick={() =>
                          void confirmDialog({ tone: 'danger', icon: '👋', title: t("team.letGoTitle").replace("{name}", a.name), body: t("team.letGoBody"), confirm: t("team.letGoConfirm").replace("{name}", a.name) }).then(
                            (ok) => ok && attempt(() => api.fireAgent(a.id)),
                          )
                        }
                      >
                        {t("team.letGo")}
                      </button>
                    </td>
                  </tr>
                  {openLook === a.id && (
                    <tr>
                      <td />
                      <td colSpan={terminal ? 8 : 7}>
                        <label className="row small">
                          <span>{t("team.drawnAs")}</span>
                          <LookSelect agent={a} />
                        </label>
                        <LookEditor agent={a} />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

// ---------- issues ----------

function IssuesTab({ initialRepo }: { initialRepo?: string }) {
  const t = useT();
  const repos = useStore((s) => s.repos);
  const allAgents = useStore((s) => s.agents);
  const [repoId, setRepoId] = useState(initialRepo ?? repos[0]?.id ?? '');
  const repo = repos.find((r) => r.id === repoId);
  const agents = useMemo(() => agentsOnRepo(allAgents, repoId), [allAgents, repoId]);
  if (repos.length === 0) return <p className="muted">{t("issues.connect")}</p>;
  return (
    <div className="tab-grid">
      <div className="card">
        <h3>📝 {t("issues.newIssue")}</h3>
        <select value={repoId} onChange={(e) => setRepoId(e.target.value)} aria-label={t("issues.floor")}>
          {repos.map((r) => (
            <option key={r.id} value={r.id}>
              {t("issues.floor")} {r.floor} · {r.fullName}
            </option>
          ))}
        </select>
        {repo && <IssueForm key={repo.id} repoId={repo.id} agents={agents} />}
      </div>
      <div className="card">
        <h3>{t("issues.openIssues").replace("{repo}", repo?.fullName ?? "")}</h3>
        <div className="repo-list tall">
          {repo?.issues.length === 0 && <div className="muted small">{t("issues.none")}</div>}
          {repo?.issues.map((i) => {
            const holder = agents.find((a) => a.role !== 'ceo' && a.task !== 'qa' && a.issueNumber === i.number && a.status !== 'idle');
            return (
              <div key={i.number} className="repo-row">
                <div>
                  <a href={i.url} target="_blank" rel="noreferrer">
                    #{i.number}
                  </a>{' '}
                  {i.title}
                  {i.labels.length > 0 && <div className="muted small">{i.labels.join(', ')}</div>}
                </div>
                <span className="repo-row-actions">
                  {holder ? (
                    <span className="agent-chip">
                      <span className="dot" style={{ background: holder.color }} />
                      {holder.name}
                    </span>
                  ) : (
                    <select value="" onChange={(e) => e.target.value && void attempt(() => api.assign(e.target.value, i.number))} aria-label={t("issues.assignLabel").replace("{number}", String(i.number))}>
                      <option value="">{t("issues.assign")}</option>
                      {agents
                        .filter((a) => a.role !== 'ceo' && a.status !== 'working' && a.status !== 'preparing')
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                    </select>
                  )}
                  <button
                    className="btn btn-small btn-ghost"
                    title={t("issues.closeTip")}
                    onClick={() =>
                      void confirmDialog({
                        tone: 'danger',
                        title: t("issues.closeTitle").replace("{number}", String(i.number)),
                        body: t("issues.closeBody")
                          .replace("{title}", i.title)
                          .replace("{suffix}", holder
                            ? t("issues.stopSuffix").replace("{name}", holder.name)
                            : ""),
                        confirm: t("issues.closeIssue"),
                      }).then((ok) => ok && attempt(() => api.closeIssue(repo.id, i.number)))
                    }
                  >
                    {t("issues.close")}
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------- settings ----------

function SettingsTab() {
  const t = useT();
  const settings = useStore((s) => s.settings);
  const clis = useStore((s) => s.clis);
  const user = useStore((s) => s.user);
  const machinesRoot = useStore((s) => s.machinesRoot);
  const demo = useStore((s) => s.demo);
  const version = useStore((s) => s.version);
  const commit = useStore((s) => s.officeCommit);
  const set = (p: Parameters<typeof api.updateSettings>[0]) => void attempt(() => api.updateSettings(p));
  const terminal = settings.runtime === 'terminal';
  const defaultCli = terminal ? settings.defaultCli : 'claude';
  return (
    <div className="tab-grid">
      <LanguageSettings />
      <div className="card">
        <h3>🧠 {t('settings.agents')}</h3>
        {terminal && (
          <label className="field">
            <span>{t('settings.defaultCli')}</span>
            <select value={settings.defaultCli} onChange={(e) => set({ defaultCli: e.target.value as AgentCli })}>
              <CliOptions clis={clis} />
            </select>
          </label>
        )}
        <label className="field">
          <span>{t('settings.defaultModel')}{terminal ? `${t('settings.modelFor')}${cliName(clis, settings.defaultCli)}` : ''}</span>
          <input
            key={`${settings.defaultCli}:${settings.defaultModel}`}
            list={defaultCli === 'claude' ? 'models-s' : undefined}
            defaultValue={settings.defaultModel}
            placeholder={t('settings.modelPlaceholder')}
            onBlur={(e) => e.target.value !== settings.defaultModel && set({ defaultModel: e.target.value })}
          />
          <datalist id="models-s">
            {CLAUDE_MODELS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>
        <label className="field">
          <span>{t('settings.defaultEffort')}</span>
          <select value={settings.defaultEffort} onChange={(e) => set({ defaultEffort: e.target.value as EffortLevel })}>
            {EFFORTS.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
        <p className="muted small">
          {terminal
            ? t('settings.terminalInfo')
            : t('settings.sdkInfo')}
        </p>
        <label className="field">
          <span>{t('settings.sessionLimit')}</span>
          <input type="number" min={0} placeholder={t('settings.noLimit')} defaultValue={settings.sessionLimit || ''} onBlur={(e) => set({ sessionLimit: Number(e.target.value) || 0 })} />
        </label>
        <p className="muted small">
          {t('settings.sessionInfo')}
        </p>
        <label className="field">
          <span>{t('settings.pacingSessions')}</span>
          <input
            key={settings.pacingSessions}
            type="number"
            min={1}
            max={32}
            defaultValue={settings.pacingSessions}
            onBlur={(e) => Number(e.target.value) !== settings.pacingSessions && set({ pacingSessions: Number(e.target.value) || 3 })}
          />
        </label>
        <p className="muted small">{t('settings.pacingInfo')}</p>
        <label className="field">
          <span>{t('settings.maxAgents')}</span>
          <input
            key={settings.maxAgents}
            type="number"
            min={1}
            max={FLOOR_SEATS}
            defaultValue={settings.maxAgents}
            onBlur={(e) => {
              const n = Math.min(FLOOR_SEATS, Math.max(1, Math.round(Number(e.target.value)) || DEFAULT_MAX_AGENTS));
              if (n !== settings.maxAgents) set({ maxAgents: n });
            }}
          />
        </label>
        <p className="muted small">{t('settings.floorInfo').replace('{FLOOR_SEATS}', String(FLOOR_SEATS))}</p>
        <h3>🧠 {t('settings.ceo')}</h3>
        <div role="radiogroup" aria-label={t('settings.teamChanges')}>
          <div className="small">
            <b>{t('settings.teamChanges')}</b>
          </div>
          <label className="toggle block">
            <input type="radio" name="scaling" checked={settings.scaling === 'approve'} onChange={() => set({ scaling: 'approve' })} />
            <span>
              <b>{t('settings.approve')}</b>{t('settings.approveInfo')}
            </span>
          </label>
          <label className="toggle block">
            <input type="radio" name="scaling" checked={settings.scaling === 'auto'} onChange={() => set({ scaling: 'auto' })} />
            <span>
              <b>{t('settings.automatic')}</b>{t('settings.autoInfo')}
            </span>
          </label>
        </div>
        <label className="field">
          <span>{t('settings.ceoReview')}</span>
          <input type="number" min={0} max={1440} defaultValue={settings.ceoHeartbeatMin} onBlur={(e) => set({ ceoHeartbeatMin: Number(e.target.value) })} />
        </label>
        <p className="muted small">{t('settings.reviewInfo')}</p>
      </div>
      <div className="card">
        <h3>⌨️ {t('settings.runtime')}</h3>
        <label className="toggle block">
          <input type="radio" checked={settings.runtime === 'terminal'} onChange={() => set({ runtime: 'terminal' })} />
          <span>
            <b>{t('settings.terminals')}</b> {t('settings.terminalModeInfo')}
          </span>
        </label>
        <label className="toggle block">
          <input type="radio" checked={settings.runtime === 'sdk'} onChange={() => set({ runtime: 'sdk' })} />
          <span>
            <b>{t('settings.sdk')}</b>{t('settings.sdkModeInfo')}
          </span>
        </label>
        <p className="muted small">
          {t('settings.runtimeInfo')}
        </p>
        <h3>🏢 {t('settings.company')}</h3>
        <label className="field">
          <span>{t('settings.yourName')}</span>
          <input defaultValue={settings.managerName} placeholder={user ?? 'Boss'} onBlur={(e) => e.target.value !== settings.managerName && set({ managerName: e.target.value })} />
        </label>
        <label className="field">
          <span>{t('settings.companyName')}</span>
          <input defaultValue={settings.companyName} placeholder="cubefarm" onBlur={(e) => e.target.value !== settings.companyName && set({ companyName: e.target.value })} />
        </label>
        <label className="field">
          <span>{t('settings.dogName')}</span>
          <input key={settings.dogName} defaultValue={settings.dogName} placeholder="Biscuit" maxLength={24} onBlur={(e) => e.target.value.trim() !== settings.dogName && set({ dogName: e.target.value })} />
        </label>
        <label className="field">
          <span>{t('settings.projectsDir')}</span>
          <input key={settings.projectsDir} defaultValue={settings.projectsDir} onBlur={(e) => e.target.value.trim() && e.target.value !== settings.projectsDir && set({ projectsDir: e.target.value })} />
        </label>
        <label className="field">
          <span>{t('settings.idleDesks')}</span>
          <input
            key={settings.trimIdleDesksMin}
            type="number"
            min={0}
            max={10080}
            defaultValue={settings.trimIdleDesksMin}
            onBlur={(e) => e.target.value !== '' && Number(e.target.value) !== settings.trimIdleDesksMin && set({ trimIdleDesksMin: Number(e.target.value) })}
          />
        </label>
        <p className="muted small">{t('settings.idleInfo')}</p>
        <div className="row">
          <button className="btn btn-small" onClick={() => set({ tutorialStep: 0 })}>
            🧭 {t('settings.tour')}
          </button>
        </div>
        <h3>ℹ️ {t('settings.environment')}</h3>
        <div className="small">
          cubefarm: <b>{version ?? t('settings.unknown')}</b>
          {commit && (
            <>
              {' '}
              (<code>{commit}</code>)
            </>
          )}
          <br />
          GitHub: <b>{user ?? t('settings.notSignedIn')}</b>
          {demo && t('settings.demo')}
          <br />
          {t('settings.machines')} <code>{machinesRoot}</code>
        </div>
      </div>
      <ProfileSettings />
      <VoiceSettings />
      <OutsideSettings />
      <NotifySettings />
      <ThemeSettings />
    </div>
  );
}

/** card: open Mission control at this card (an alarm's id, or 'usage'). */
export function ManagerConsole({ initialTab, initialRepo, card }: { initialTab?: ManagerTab; initialRepo?: string; card?: string }) {
  const t = useT();
  const [tab, setTab] = useState<ManagerTab>(initialTab ?? 'floors');
  const pending = useStore((s) => pendingRequests(s.requests).length);
  const alarms = useStore((s) => s.ops.alarms.length + s.doctor.length);
  const tabs: [ManagerTab, string][] = [
    ['floors', t('ui.console.tabFloors')],
    ['ops', `${t('ui.console.tabOps')}${alarms ? ` (${alarms})` : ''}`],
    ['ceo', `🧠 CEO${pending ? ` (${pending})` : ''}`],
    ['team', t('ui.console.tabTeam')],
    ['issues', t('ui.console.tabIssues')],
    ['settings', t('ui.console.tabSettings')],
    ['timelapse', t('ui.console.tabTimelapse')],
    ['access', t('ui.console.tabAccess')],
  ];
  return (
    <Panel wide title={t('ui.console.title')}>
      <div className="tabs" role="tablist" aria-label={t('ui.console.aria')}>
        {tabs.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`tab ${tab === k ? 'tab-on' : ''}`} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>
      <div className="tab-body" role="tabpanel" aria-label={tabs.find(([k]) => k === tab)?.[1]}>
        {tab === 'floors' && <FloorsTab />}
        {tab === 'ops' && <OpsTab card={card} />}
        {tab === 'ceo' && <CeoTab />}
        {tab === 'team' && <TeamTab />}
        {tab === 'issues' && <IssuesTab initialRepo={initialRepo} />}
        {tab === 'settings' && <SettingsTab />}
        {tab === 'timelapse' && <TimeLapseTab />}
        {tab === 'access' && (
          <div className="tab-grid a11y-grid">
            <AccessibilitySettings />
          </div>
        )}
      </div>
    </Panel>
  );
}
