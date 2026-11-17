import { useT } from '../i18n';
import { usePhoneBadge, useStore } from '../store';
import { requestLook } from '../world/Player';
import { setMode } from '../pocket/mode';
import { CEO_ID } from '../../../shared/types';
import { keyName, useKeyName } from './controls';
import { Key } from './Key';
import { SetupWizard } from './SetupWizard';
import { unlockAudio } from './sfx';
import { announce } from './announce';

export function StartScreen() {
  const t = useT();
  const started = useStore((s) => s.started);
  const loaded = useStore((s) => s.loaded);
  const connected = useStore((s) => s.connected);
  const demo = useStore((s) => s.demo);
  const version = useStore((s) => s.version);
  const repos = useStore((s) => s.repos);
  const agents = useStore((s) => s.agents);
  const settings = useStore((s) => s.settings);
  const start = useStore((s) => s.start);
  const waiting = usePhoneBadge();
  const phoneKey = useKeyName('phone');
  if (started) return null;
  if (loaded && !settings.setupDone) return <SetupWizard />;

  const enter = () => {
    start();
    unlockAudio();
    requestLook();
    announce(t('ui.start.announce', { phone: keyName('phone'), help: keyName('help') }));
  };
  const ceo = agents[CEO_ID];
  const staff = Object.values(agents).filter((a) => a.role !== 'ceo').length;

  return (
    <div className="start">
      <div className="start-card">
        <div className="start-logo">✻</div>
        <h1>{settings.companyName || 'cubefarm'}</h1>
        <p className="start-tag">{settings.managerName ? t('ui.start.welcome', { name: settings.managerName }) : t('ui.start.tagline')}</p>
        <ul className="start-list">
          <li>
            🏢 {t('ui.start.projects', { count: repos.length })}, {t('ui.start.staff', { count: staff })}
            {ceo ? t('ui.start.ceo', { name: ceo.name }) : ''}.
          </li>
          <li>{waiting ? t('ui.start.waiting', { count: waiting, key: phoneKey }) : t('ui.start.phone', { key: phoneKey })}</li>
          <li>
            💻 {t('ui.start.walk')} <Key action="interact" /> {t('ui.start.use')} <Key action="help" /> {t('ui.start.help')}
          </li>
        </ul>
        <button className="btn btn-big" onClick={enter} disabled={!loaded}>
          {loaded ? t('ui.start.enter') : connected ? t('ui.start.loading') : t('ui.start.connecting')}
        </button>
        <div className="start-meta">
          <button className="linkish start-pocket" onClick={() => setMode('pocket')} title={t('ui.start.pocketTitle')}>
            {t('ui.start.pocket')}
          </button>
          {demo && <span className="pill pill-demo">{t('ui.demoMode')}</span>}
          {version && <span className="small">cubefarm {version}</span>}
        </div>
      </div>
    </div>
  );
}
