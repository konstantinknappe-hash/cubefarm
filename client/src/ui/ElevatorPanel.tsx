import { useEffect } from 'react';
import { useT } from '../i18n';
import { useStore } from '../store';
import { ROOF } from '../world/layout';
import { Panel } from './Overlays';

export function ElevatorPanel() {
  const repos = useStore((s) => s.repos);
  const agents = useStore((s) => s.agents);
  const floor = useStore((s) => s.floor);
  const goToFloor = useStore((s) => s.goToFloor);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'g' || e.key === '0') goToFloor(0);
      else if (e.key.toLowerCase() === 'r') goToFloor(ROOF);
      else if (/^[1-9]$/.test(e.key) && repos.some((r) => r.floor === Number(e.key))) goToFloor(Number(e.key));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [repos, goToFloor]);

  const t = useT();
  const floors = [...repos].sort((a, b) => b.floor - a.floor);
  return (
    <Panel title={t('ui.elevator.title')}>
      <div className="elevator">
        {/* the roof: always the top stop, however many floors there are */}
        <button className={`floor-btn ${floor === ROOF ? 'floor-btn-here' : ''}`} style={{ ['--accent' as string]: '#7cc6fe' }} onClick={() => goToFloor(ROOF)}>
          <span className="floor-btn-num">R</span>
          <span className="floor-btn-name">{t('world.roof.terrace')}</span>
          <span className="floor-btn-meta">{t('ui.elevator.roofMeta')}</span>
        </button>
        {floors.map((r) => {
          const team = Object.values(agents).filter((a) => a.repoId === r.id);
          const busy = team.filter((a) => a.status === 'working' || a.status === 'preparing').length;
          const prs = r.pulls.filter((p) => p.state === 'OPEN').length;
          return (
            <button key={r.id} className={`floor-btn ${r.floor === floor ? 'floor-btn-here' : ''}`} style={{ ['--accent' as string]: r.color }} onClick={() => goToFloor(r.floor)}>
              <span className="floor-btn-num">{r.floor}</span>
              <span className="floor-btn-name">{r.fullName}</span>
              <span className="floor-btn-meta">
                {t('ui.elevator.meta', { busy, team: team.length, issues: r.issues.length, prs })}
              </span>
            </button>
          );
        })}
        <button className={`floor-btn ${floor === 0 ? 'floor-btn-here' : ''}`} style={{ ['--accent' as string]: '#ff8a5b' }} onClick={() => goToFloor(0)}>
          <span className="floor-btn-num">G</span>
          <span className="floor-btn-name">{t('world.lobby.ground')}</span>
          <span className="floor-btn-meta">{t('ui.elevator.lobbyMeta')}</span>
        </button>
        {repos.length === 0 && <p className="muted">{t('ui.elevator.noFloors')}</p>}
        <p className="muted small">{t('ui.elevator.tip')}</p>
      </div>
    </Panel>
  );
}
