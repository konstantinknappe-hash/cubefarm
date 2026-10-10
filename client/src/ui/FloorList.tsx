// The list view (Settings → Accessibility, or the phone): a floor as a table of who is there, their status and what
// they're doing, with the panels you'd otherwise walk to. For anyone who can't use the 3D view; works by keyboard
// and screen reader. In the lobby it lists the CEO and every floor.
import { useMemo, useState } from 'react';
import { agentsOnRepo, floorPrCounts, useStore } from '../store';
import { CEO_ID } from '../../../shared/types';
import { floorRows, type FloorRow } from './floorRows';
import { Panel } from './Panel';
import { useT } from '../i18n';

function People({ rows, caption }: { rows: FloorRow[]; caption: string }) {
  const t = useT();
  const openOverlay = useStore((s) => s.openOverlay);
  if (!rows.length) return <p className="muted">{t('floorlist.nobody')}</p>;
  return (
    <table className="floor-table">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col">{t('floorlist.name')}</th>
          <th scope="col">{t('floorlist.agent')}</th>
          <th scope="col">{t('floorlist.status')}</th>
          <th scope="col">{t('floorlist.doing')}</th>
          <th scope="col">
            <span className="sr-only">{t('floorlist.actions')}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <th scope="row">{r.name}</th>
            <td>{r.agent}</td>
            <td>
              <span className={`status-kind status-kind-${r.kind}`}>
                <span aria-hidden>{r.icon}</span> {r.status}
              </span>
            </td>
            <td>{r.doing}</td>
            <td>
              <button className="btn btn-small" onClick={() => openOverlay({ kind: 'terminal', agentId: r.id })} aria-label={t('floorlist.terminalAria').replace('{name}', r.name)}>
                {t('floorlist.terminal')}
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function FloorList() {
  const t = useT();
  const floor = useStore((s) => s.floor);
  const repos = useStore((s) => s.repos);
  const agents = useStore((s) => s.agents);
  const qa = useStore((s) => s.qa);
  const settings = useStore((s) => s.settings);
  const clis = useStore((s) => s.clis);
  const openOverlay = useStore((s) => s.openOverlay);
  const goToFloor = useStore((s) => s.goToFloor);
  const [shown, setShown] = useState(floor);
  const repo = repos.find((r) => r.floor === shown) ?? null;
  const rows = useMemo(
    () => floorRows(repo ? agentsOnRepo(agents, repo.id) : agents[CEO_ID] ? [agents[CEO_ID]] : [], settings, clis),
    [repo, agents, settings, clis],
  );
  const counts = repo ? floorPrCounts(repo, qa) : null;
  const busy = rows.filter((r) => r.kind === 'busy' || r.kind === 'waiting').length;

  return (
    <Panel title={repo ? t('floorlist.title.floor').replace('{floor}', String(repo.floor)).replace('{repo}', repo.fullName) : t('floorlist.title.lobby')} className="floor-list">
      <div className="row wrap">
        <label className="field-inline">
          <span>{t('floorlist.floor')}</span>
          <select value={shown} onChange={(e) => setShown(Number(e.target.value))}>
            <option value={0}>{t('floorlist.lobby')}</option>
            {repos.map((r) => (
              <option key={r.id} value={r.floor}>
                {t('floorlist.goFloor').replace('{floor}', String(r.floor)).replace('{repo}', r.fullName)}
              </option>
            ))}
          </select>
        </label>
        <span className="spacer" />
        {shown !== floor && (
          <button className="btn btn-small" onClick={() => goToFloor(shown)}>
            {t('floorlist.goThere')}
          </button>
        )}
        {repo && (
          <>
            <button className="btn btn-small" onClick={() => openOverlay({ kind: 'kanban', repoId: repo.id })}>
              {t('floorlist.kanban')}
            </button>
            <button className="btn btn-small" onClick={() => openOverlay({ kind: 'app', repoId: repo.id })}>
              {t('floorlist.app')}
            </button>
          </>
        )}
      </div>
      {repo && counts && (
        <p className="floor-summary">
          {t('floorlist.people', { count: rows.length })}, {busy} busy · {t('floorlist.openIssues', { count: repo.issues.length })} · {t('floorlist.inQa').replace('{n}', String(counts.inQa))} · {t('floorlist.readyToMerge').replace('{n}', String(counts.ready))}
          {counts.needsYou ? ' ' + t('floorlist.needsYou', { count: counts.needsYou }) : ''}
        </p>
      )}
      <People rows={rows} caption={repo ? t('floorlist.caption.floor').replace('{floor}', String(repo.floor)) : t('floorlist.caption.lobby')} />
      {!repo && repos.length > 0 && (
        <>
          <h3>{t('floorlist.floors')}</h3>
          <ul className="floor-floors">
            {repos.map((r) => {
              const team = agentsOnRepo(agents, r.id);
              const working = team.filter((a) => a.status === 'working' || a.status === 'preparing').length;
              return (
                <li key={r.id}>
                  <button className="linkish" onClick={() => setShown(r.floor)}>
                    {t('floorlist.goFloor').replace('{floor}', String(r.floor)).replace('{repo}', r.fullName)}
                  </button>{' '}
                  <span className="muted">
                    · {t('floorlist.teamDetail').replace('{count}', String(team.length)).replace('{working}', String(working))}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Panel>
  );
}
