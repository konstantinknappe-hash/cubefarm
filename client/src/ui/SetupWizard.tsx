import { useState } from 'react';
import { api } from '../api';
import { useStore } from '../store';
import { requestLook } from '../world/Player';
import { CEO_ID, type RepoView } from '../../../shared/types';
import { Key } from './Key';
import { ProjectPicker } from './ProjectPicker';
import { useT } from '../i18n';

// First run: who you are, the company, your CEO and your first project. Every field has a default, so
// "Skip" (or just pressing Next) gets a working office.

const COMPANIES = ['Pixel & Pine', 'Byte Bakery', 'Night Owl Software', 'Tiny Rocket Co.', 'Moonbeam Works', 'Happy Path Inc.', 'Merge Conflict Ltd.', 'Quokka Labs', 'Blue Kettle Studio', 'Paper Plane Software'];
const CEO_NAMES = ['Morgan', 'Avery', 'Jordan', 'Riley', 'Quinn', 'Harper', 'Rowan', 'Sasha', 'Casey', 'Jamie', 'Alex', 'Robin'];
const TIES = ['#e63946', '#3a86ff', '#06d6a0', '#ffbe0b', '#9b5de5', '#fb5607'];
const STEPS = ['Welcome', 'You', 'Your CEO', 'First project', 'Ready'];

const pickOther = <T,>(list: T[], current: T) => {
  const rest = list.filter((x) => x !== current);
  return rest[Math.floor(Math.random() * rest.length)];
};

/** A little portrait of the CEO in their suit, drawn to match the 3D office. */
function CeoPortrait({ color, look }: { color: string; look: 'feminine' | 'masculine' }) {
  return (
    <svg viewBox="0 0 120 120" className="ceo-portrait" aria-hidden="true">
      <circle cx="60" cy="60" r="58" fill="#e6dcff" stroke="#1f1d2b" strokeWidth="3" />
      {look === 'feminine' && <ellipse cx="60" cy="58" rx="27" ry="32" fill="#2b2118" stroke="#1f1d2b" strokeWidth="2.5" />}
      <path d="M22 118 C24 88 40 80 60 80 C80 80 96 88 98 118 Z" fill="#2b2d42" stroke="#1f1d2b" strokeWidth="3" />
      <path d="M50 81 L60 96 L70 81 Z" fill="#f8f9fa" />
      <path d="M57 84 L63 84 L65 108 L60 113 L55 108 Z" fill={color} stroke="#1f1d2b" strokeWidth="1.5" />
      <circle cx="60" cy="52" r="22" fill="#f1c27d" stroke="#1f1d2b" strokeWidth="3" />
      <path d="M38 50 C38 30 82 30 82 50 C74 40 46 40 38 50 Z" fill="#2b2118" stroke="#1f1d2b" strokeWidth="2" />
      <circle cx="52" cy="54" r="2.6" fill="#1f1d2b" />
      <circle cx="68" cy="54" r="2.6" fill="#1f1d2b" />
      <path d="M53 62 Q60 68 67 62" fill="none" stroke="#1f1d2b" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function SetupWizard() {
  const t = useT();
  const user = useStore((s) => s.user);
  const demo = useStore((s) => s.demo);
  const ghReady = useStore((s) => s.ghReady);
  const ghError = useStore((s) => s.ghError);
  const ceoAgent = useStore((s) => s.agents[CEO_ID]);
  const maxAgents = useStore((s) => s.settings.maxAgents);
  const start = useStore((s) => s.start);

  const [step, setStep] = useState(0);
  const [managerName, setManagerName] = useState('');
  const [companyName, setCompanyName] = useState(() => COMPANIES[Math.floor(Math.random() * COMPANIES.length)]);
  const [ceoName, setCeoName] = useState(ceoAgent?.name ?? 'Morgan');
  const [ceoLook, setCeoLook] = useState<'feminine' | 'masculine'>(ceoAgent?.look ?? 'masculine');
  const [ceoColor, setCeoColor] = useState(ceoAgent?.color ?? TIES[0]);
  const [scaling, setScaling] = useState<'approve' | 'auto'>('approve');
  const [project, setProject] = useState<RepoView | null>(null);
  const [busy, setBusy] = useState(false);

  const me = managerName.trim() || user || 'Boss';
  const ceo = ceoName.trim() || 'Morgan';
  const company = companyName.trim() || COMPANIES[0];

  const save = () => api.setup({ managerName: me, companyName: company, scaling, ceoName: ceo, ceoLook, ceoColor });
  const finish = async () => {
    setBusy(true);
    try {
      await save();
      await api.updateSettings({ setupDone: true, tutorialStep: 0 });
      start();
      requestLook();
    } catch {
      setBusy(false); // api() already toasted
    }
  };
  const next = async () => {
    if (step === 2) {
      setBusy(true);
      try {
        await save(); // so the CEO already knows everyone's names when they study the first project
      } catch {
        setBusy(false);
        return;
      }
      setBusy(false);
    }
    setStep(step + 1);
  };

  return (
    <div className="start">
      <div className="start-card wizard">
        <div className="wizard-steps">
          {STEPS.map((s, i) => (
            <span key={s} className={`wizard-dot ${i === step ? 'wizard-dot-on' : i < step ? 'wizard-dot-done' : ''}`} title={s} />
          ))}
        </div>

        {step === 0 && (
          <>
            <div className="start-logo">✻</div>
            <h1>cubefarm</h1>
            <p className="start-tag">{t('wizard.step0.tag')}</p>
            <ul className="start-list">
              <li>{t('wizard.step0.item1')}</li>
              <li>{t('wizard.step0.item2')}</li>
              <li>{t('wizard.step0.item3')}</li>
            </ul>
            {!ghReady && ghError && <div className="term-error small">⚠️ {ghError}</div>}
            <button className="btn btn-big" onClick={() => setStep(1)}>
              {t('wizard.step0.start')}
            </button>
            <div className="start-meta">
              <button className="linkish" onClick={finish} disabled={busy}>
                {t('wizard.step0.skip')}
              </button>
              {demo && <span className="pill pill-demo">DEMO MODE</span>}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div className="wizard-icon">🧑‍💼</div>
            <h2>{t('wizard.step1.title')}</h2>
            <p className="start-tag">{t('wizard.step1.tag')}</p>
            <label className="field">
              <span>{t('wizard.step1.yourName')}</span>
              <input value={managerName} onChange={(e) => setManagerName(e.target.value)} placeholder={user ?? 'Boss'} autoFocus />
            </label>
            <label className="field">
              <span>{t('wizard.step1.companyName')}</span>
              <div className="row" style={{ margin: 0 }}>
                <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder={COMPANIES[0]} />
                <button type="button" className="btn btn-small" title={t('wizard.step1.suggest')} onClick={() => setCompanyName(pickOther(COMPANIES, companyName))}>
                  🎲
                </button>
              </div>
            </label>
            <p className="muted small">{t('wizard.step1.nameTip')}</p>
          </>
        )}

        {step === 2 && (
          <>
            <h2>{t('wizard.step2.title')}</h2>
            <div className="ceo-setup">
              <CeoPortrait color={ceoColor} look={ceoLook} />
              <div className="grow">
                <label className="field">
                  <span>{t('wizard.ceoName')}</span>
                  <div className="row" style={{ margin: 0 }}>
                    <input value={ceoName} onChange={(e) => setCeoName(e.target.value)} placeholder="Morgan" autoFocus />
                    <button type="button" className="btn btn-small" title={t('wizard.step1.suggest')} onClick={() => setCeoName(pickOther(CEO_NAMES, ceoName))}>
                      🎲
                    </button>
                  </div>
                </label>
                <div className="row">
                  <label className="toggle">
                    <input type="radio" checked={ceoLook === 'feminine'} onChange={() => setCeoLook('feminine')} /> {t('wizard.step2.she')}
                  </label>
                  <label className="toggle">
                    <input type="radio" checked={ceoLook === 'masculine'} onChange={() => setCeoLook('masculine')} /> {t('wizard.step2.he')}
                  </label>
                  <span className="spacer" />
                  {TIES.map((c) => (
                    <button key={c} type="button" className={`swatch ${c === ceoColor ? 'swatch-on' : ''}`} style={{ background: c }} onClick={() => setCeoColor(c)} title={t('wizard.step2.tieColor')} />
                  ))}
                </div>
                <div className="muted small">{t('wizard.step2.info')}</div>
              </div>
            </div>
            <p className="start-tag" style={{ margin: '12px 0 6px' }}>
              {t('wizard.ceoDesc').replace('{ceo}', ceo)}
            </p>
            <label className="toggle block">
              <input type="radio" checked={scaling === 'approve'} onChange={() => setScaling('approve')} />
              <span>
                <b>{t('wizard.step2.approve')}</b> {t('wizard.step2.approveNote')}
              </span>
            </label>
            <label className="toggle block">
              <input type="radio" checked={scaling === 'auto'} onChange={() => setScaling('auto')} />
              <span>
                <b>{t('wizard.step2.auto').replace('{ceo}', ceo)}</b> {t('wizard.step2.autoNote').replace('{max}', String(maxAgents))}
              </span>
            </label>
          </>
        )}

        {step === 3 && (
          <>
            <h2>{t('wizard.step3.title')}</h2>
            {project ? (
              <div className="wizard-done">
                <div className="wizard-icon">🎉</div>
                <p>
                  <b>{project.fullName}</b> {t('wizard.step3.movedIn').replace('{repo}', '').replace('{floor}', String(project.floor)).trimStart()}
                </p>
                <p className="muted">{t('wizard.step3.studying').replace('{ceo}', ceo)}</p>
              </div>
            ) : (
              <>
                <p className="start-tag">{t('wizard.step3.pick')}</p>
                <ProjectPicker onConnected={setProject} />
              </>
            )}
          </>
        )}

        {step === 4 && (
          <>
            <div className="wizard-icon">🏢</div>
            <h2>{t('wizard.step4.title').replace('{company}', company)}</h2>
            <ul className="start-list">
              <li>
                🧠 {project ? t('wizard.studying').replace('{ceo}', ceo).replace('{project}', project.fullName.split('/')[1]) : t('wizard.waiting').replace('{ceo}', ceo)}{' '}
                {scaling === 'approve' ? t('wizard.approveChange') : t('wizard.autoChange').replace('{max}', String(maxAgents))}
              </li>
              <li>
                {t('help.locale') === 'de' ? (
                  <>📱 Drücke <Key action="phone" /> überall für dein Telefon: chatte mit {ceo}, genehmige Teamänderungen und sieh alle Projekte auf einen Blick.</>
                ) : (
                  <>📱 Press <Key action="phone" /> anywhere for your phone: chat with {ceo}, approve team changes, and see every project at a glance.</>
                )}
              </li>
              <li>
                {t('help.locale') === 'de' ? (
                  <>🧭 Eine kurze Tour startet beim Eintreten. Drücke <Key action="help" /> jederzeit für Hilfe.</>
                ) : (
                  <>🧭 A short tour starts when you walk in. Press <Key action="help" /> any time for help.</>
                )}
              </li>
            </ul>
            <button className="btn btn-big" onClick={finish} disabled={busy}>
              {busy ? t('wizard.step4.opening') : t('wizard.step4.enter')}
            </button>
          </>
        )}

        {step > 0 && step < 4 && (
          <div className="wizard-nav">
            <button className="btn btn-ghost" onClick={() => setStep(step - 1)} disabled={busy}>
              {t('wizard.back')}
            </button>
            <span className="spacer" />
            {step === 3 && !project && (
              <button className="linkish" onClick={() => setStep(4)}>
                {t('wizard.addLater')}
              </button>
            )}
            {(step !== 3 || project) && (
              <button className="btn btn-good" onClick={() => void next()} disabled={busy}>
                {t('wizard.next')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
