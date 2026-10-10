import { TranslatedLabel } from './TranslatedLabel';
import { useEffect, useMemo, useState } from 'react';
import { api, type FloorOptions } from '../api';
import { useStore } from '../store';
import type { GhRepoSummary, ProjectFolderView, RepoView } from '../../../shared/types';
import { confirmDialog } from './Confirm';
import { useT } from '../i18n';

// Add a project to the office: one of your own folders, a GitHub repo, or something brand new.
// Used by the setup wizard and by the Floors tab of the manager's console.

type Mode = 'folder' | 'github' | 'new';

async function attempt<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch {
    return undefined; // api() already toasted the error
  }
}

const sep = (p: string) => (p.includes('\\') ? '\\' : '/');

function FolderMode({ floor, onDone }: { floor: FloorOptions; onDone: (r: RepoView) => void }) {
  const t = useT();
  const projectsDir = useStore((s) => s.settings.projectsDir);
  const [dir, setDir] = useState(projectsDir);
  const [root, setRoot] = useState('');
  const [folders, setFolders] = useState<ProjectFolderView[] | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = (d?: string) => {
    setFolders(null);
    void attempt(() => api.folders(d)).then((res) => {
      setFolders(res?.folders ?? []);
      if (res) {
        setRoot(res.root);
        setDir(res.root);
      }
    });
  };
  useEffect(() => load(), []);

  const shown = useMemo(() => (folders ?? []).filter((f) => f.name.toLowerCase().includes(q.toLowerCase())), [folders, q]);
  const run = async (f: ProjectFolderView, fn: () => Promise<RepoView>) => {
    setBusy(f.path);
    const repo = await attempt(fn);
    setBusy(null);
    if (repo) onDone(repo);
    else load(root);
  };
  const publish = async (f: ProjectFolderView) => {
    const ok = await confirmDialog({
      icon: '🐙',
      title: t('picker.publishTitle').replace('{name}', f.name),
      body: (
        <>
          {t('picker.publishBody').replace('{name}', f.name)}
          {!f.git && t('picker.publishBodyNoGit')}
        </>
      ),
      confirm: t('picker.createPrivate'),
    });
    if (ok) void run(f, () => api.publishFolder({ path: f.path, visibility: 'private', ...floor }));
  };

  return (
    <div className="picker-mode">
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          load(dir.trim() || undefined);
        }}
      >
        <input value={dir} onChange={(e) => setDir(e.target.value)} placeholder={t('picker.projectFolder')} title={t('picker.projectFolderAria')} aria-label={t('picker.projectFolderAria')} />
        <button className="btn btn-small"><TranslatedLabel id="lookHere" /></button>
      </form>
      {root && root !== projectsDir && (
        <div className="row small">
          <span className="muted grow">{t('picker.newProjDir').replace('{dir}', projectsDir)}</span>
          <button className="btn btn-small btn-ghost" onClick={() => void attempt(() => api.updateSettings({ projectsDir: root }))}>
            {t('picker.useInstead').replace('{dir}', root)}
          </button>
        </div>
      )}
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('picker.filterFolders')} />
      <div className="repo-list folder-list">
        {folders === null && <div className="muted small">{t('picker.looking').replace('{dir}', dir || t('picker.projectFolderAria'))}</div>}
        {folders && shown.length === 0 && <div className="muted small">{q ? t('picker.noFoldersMatch') : t('picker.noFolders')}</div>}
        {shown.map((f) => (
          <div key={f.path} className="repo-row">
            <div style={{ minWidth: 0 }}>
              <b>📁 {f.name}</b>{' '}
              {f.floor != null ? (
                <span className="chip chip-good">{t('picker.floor').replace('{floor}', String(f.floor))}</span>
              ) : f.github ? (
                <span className="chip">🐙 {f.github}</span>
              ) : (
                <span className="chip chip-warn">{f.git ? t('picker.notOnGitHub') : t('picker.noGit')}</span>
              )}
            </div>
            {f.floor != null ? (
              <span className="muted small">{t('picker.inOffice')}</span>
            ) : f.github ? (
              <button className="btn btn-small btn-good" disabled={!!busy} onClick={() => run(f, () => api.connectFolder(f.path, floor))}>
                {busy === f.path ? t('picker.movingIn') : t('picker.addFloor')}
              </button>
            ) : (
              <button className="btn btn-small" disabled={!!busy} onClick={() => void publish(f)}>
                {busy === f.path ? t('picker.publishing') : t('picker.publishToGitHub')}
              </button>
            )}
          </div>
        ))}
      </div>
      <p className="muted small">{t('picker.folderTip')}</p>
    </div>
  );
}

function GithubMode({ floor, onDone }: { floor: FloorOptions; onDone: (r: RepoView) => void }) {
  const t = useT();
  const repos = useStore((s) => s.repos);
  const projectsDir = useStore((s) => s.settings.projectsDir);
  const [list, setList] = useState<GhRepoSummary[] | null>(null);
  const [owner, setOwner] = useState('');
  const [q, setQ] = useState('');
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const load = (o?: string) => {
    setList(null);
    void attempt(() => api.githubRepos(o)).then((r) => setList(r ?? []));
  };
  useEffect(() => load(), []);
  const connected = new Set(repos.map((r) => r.id.toLowerCase()));
  const shown = (list ?? []).filter((r) => !connected.has(r.nameWithOwner.toLowerCase()) && r.nameWithOwner.toLowerCase().includes(q.toLowerCase())).slice(0, 60);
  const connect = async (name: string) => {
    setBusy(name);
    const repo = await attempt(() => api.connectRepo(name, floor));
    setBusy(null);
    if (repo) onDone(repo);
  };
  return (
    <div className="picker-mode">
      <div className="row">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('picker.filterRepos')} />
        <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder={t('picker.orgOptional')} style={{ maxWidth: 160 }} />
        <button className="btn btn-small" onClick={() => load(owner.trim() || undefined)}>
          {t('picker.list')}
        </button>
      </div>
      <div className="repo-list folder-list">
        {list === null && <div className="muted small">{t('picker.askingGitHub')}</div>}
        {list && shown.length === 0 && <div className="muted small"><TranslatedLabel id="noRepos" /></div>}
        {shown.map((r) => (
          <div key={r.nameWithOwner} className="repo-row">
            <div style={{ minWidth: 0 }}>
              <b>{r.nameWithOwner}</b> <span className="chip">{r.visibility.toLowerCase()}</span>
              {r.description && <div className="muted small">{r.description}</div>}
            </div>
            <button className="btn btn-small btn-good" disabled={!!busy} onClick={() => connect(r.nameWithOwner)}>
              {busy === r.nameWithOwner ? t('picker.movingIn') : t('picker.addFloor')}
            </button>
          </div>
        ))}
      </div>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (manual.trim()) void connect(manual.trim());
        }}
      >
        <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder={t('picker.orTypeName')} />
        <button className="btn btn-small" disabled={!manual.trim() || !!busy}>
          {t('picker.addFloor')}
        </button>
      </form>
      <p className="muted small">
        {t('picker.repoUsed').replace(/{dir}/g, projectsDir || t('picker.projectFolderAria'))}{sep(projectsDir)}&lt;name&gt;
      </p>
    </div>
  );
}

function NewMode({ floor, onDone }: { floor: FloorOptions; onDone: (r: RepoView) => void }) {
  const t = useT();
  const projectsDir = useStore((s) => s.settings.projectsDir);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [busy, setBusy] = useState(false);
  const slug = name.trim().replace(/[^A-Za-z0-9._-]+/g, '-');
  return (
    <form
      className="picker-mode"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!slug) return;
        setBusy(true);
        const repo = await attempt(() => api.createRepo({ name: slug, description, visibility, ...floor }));
        setBusy(false);
        if (repo) onDone(repo);
      }}
    >
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('picker.projectName')} autoFocus />
      <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('picker.projectDesc')} />
      <div className="row">
        <label className="toggle">
          <input type="radio" checked={visibility === 'private'} onChange={() => setVisibility('private')} /> {t('picker.private')}
        </label>
        <label className="toggle">
          <input type="radio" checked={visibility === 'public'} onChange={() => setVisibility('public')} /> {t('picker.public')}
        </label>
        <span className="spacer" />
        <button className="btn btn-good" disabled={busy || !slug}>
          {busy ? t('picker.creating') : t('picker.createProject')}
        </button>
      </div>
      <p className="muted small">
        {t('picker.createTip')
          .replace('{path}', slug ? `${projectsDir}${sep(projectsDir)}${slug}` : `${projectsDir}${sep(projectsDir)}…`)
          .replace('{vis}', visibility)}
      </p>
    </form>
  );
}

export function ProjectPicker({ onConnected, initial = 'folder' }: { onConnected?: (repo: RepoView) => void; initial?: Mode }) {
  const t = useT();
  const [mode, setMode] = useState<Mode>(initial);
  const [mission, setMission] = useState('');
  const [autoAssign, setAutoAssign] = useState(true);
  const floor: FloorOptions = { mission, autoAssign };
  const done = (repo: RepoView) => {
    setMission('');
    onConnected?.(repo);
  };
  const modes: [Mode, string][] = [
    ['folder', t('picker.folder')],
    ['github', t('picker.github')],
    ['new', t('picker.new')],
  ];
  return (
    <div className="picker">
      <div className="picker-tabs">
        {modes.map(([k, label]) => (
          <button key={k} className={`picker-tab ${mode === k ? 'picker-tab-on' : ''}`} onClick={() => setMode(k)}>
            {label}
          </button>
        ))}
      </div>
      <textarea
        value={mission}
        onChange={(e) => setMission(e.target.value)}
        rows={2}
        placeholder={mode === 'new' ? t('picker.missionNew') : t('picker.missionOpt')}
      />
      <label className="toggle small">
        <input type="checkbox" checked={autoAssign} onChange={(e) => setAutoAssign(e.target.checked)} />
        {t('picker.autoStart')}
      </label>
      {mode === 'folder' && <FolderMode floor={floor} onDone={done} />}
      {mode === 'github' && <GithubMode floor={floor} onDone={done} />}
      {mode === 'new' && <NewMode floor={floor} onDone={done} />}
    </div>
  );
}
