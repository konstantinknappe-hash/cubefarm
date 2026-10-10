import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useStore } from '../store';
import { CEO_ID } from '../../../shared/types';
import { Key, MoveKeys } from './Key';
import { useT } from '../i18n';

// The first-run tour: a coach card in the corner that moves on by itself as you try each thing,
// with Next and Skip always there. Progress lives in settings.tutorialStep, so a refresh resumes it.

type S = ReturnType<typeof useStore.getState>;

interface Step {
  titleKey: string;
  body: (ceo: string, company: string, repo: string | null, de: boolean) => React.ReactNode;
  done?: (s: S) => boolean;
  minMs?: number; // show at least this long before a done() can move on
}

const STEPS: Step[] = [
  {
    titleKey: 'tutorial.step0.title',
    body: (_ceo, _company, _repo, de) =>
      de ? (
        <>
          Klicke in die Ansicht, um die Maus zu greifen und dich umzuschauen, dann laufe mit <MoveKeys />. Halte <Key action="run" /> zum Rennen. <kbd>Esc</kbd> gibt dir die Maus zurück. <Key action="overview" /> zeigt die ganze Etage von oben.
        </>
      ) : (
        <>
          Click the view to grab the mouse and look around, then walk with <MoveKeys />. Hold <Key action="run" /> to run. <kbd>Esc</kbd> gives you the mouse back. <Key action="overview" /> shows the whole floor from above.
        </>
      ),
    done: (s) => s.locked,
    minMs: 5000,
  },
  {
    titleKey: 'tutorial.step1.title',
    body: (ceo, _company, _repo, de) =>
      de ? (
        <>
          Drücke <Key action="phone" />. Dein Telefon ist die Art, wie du mit {ceo} von überall im Gebäude redest.
        </>
      ) : (
        <>
          Press <Key action="phone" />. Your phone is how you talk to {ceo} from anywhere in the building.
        </>
      ),
    done: (s) => s.overlay?.kind === 'phone',
  },
  {
    titleKey: 'tutorial.step2.title',
    body: (ceo, _company, _repo, de) =>
      de ? (
        <>
          💬 {ceo} schreibt dir hier, und du kannst zurückschreiben. 👥 <b>Team</b> zeigt die CEO-Teamänderungen, die auf dein OK warten. 📊 <b>Unternehmen</b> ist jedes Projekt auf einen Blick. Leg es weg mit <Key action="phone" />.
        </>
      ) : (
        <>
          💬 {ceo} texts you here, and you can text back. 👥 <b>Team</b> shows the CEO's team changes waiting for your OK. 📊 <b>Company</b> is every project at a glance. Put it away with <Key action="phone" />.
        </>
      ),
    done: (s) => s.overlay?.kind !== 'phone',
    minMs: 2500,
  },
  {
    titleKey: 'tutorial.step3.title',
    body: (ceo, _company, _repo, de) =>
      de ? (
        <>
          {ceo}s Eckbüro ist hinten rechts in der Lobby, unter dem lila Schild. Geh rein und drücke <Key action="interact" /> oder klicke auf den Schreibtisch, um zu sehen, was {ceo} tut.
        </>
      ) : (
        <>
          {ceo}'s corner office is at the back right of the lobby, under the purple sign. Walk in and press <Key action="interact" /> or click the desk to see what {ceo} is up to.
        </>
      ),
    done: (s) => (s.overlay?.kind === 'terminal' && s.overlay.agentId === CEO_ID) || (s.overlay?.kind === 'manager' && s.overlay.tab === 'ceo'),
  },
  {
    titleKey: 'tutorial.step4.title',
    body: (ceo, _company, _repo, de) =>
      de ? (
        <>
          Wenn {ceo} ein größeres Team möchte, wartet jeder neue Agent auf den grünen Stühlen an der Ostwand. Drücke <Key action="interact" /> oder klicke einen an, um zu sehen warum, ändere ggf. Coding-Agent, Modell oder Aufwand, und stelle ein oder lehne ab. Das alles geht auch vom Telefon.
        </>
      ) : (
        <>
          When {ceo} wants a bigger team, each new agent waits on the green chairs along the east wall. Press <Key action="interact" /> or click one to see why, change their coding agent, model or effort if you like, then hire or decline. It all works from your phone too.
        </>
      ),
    done: (s) => s.requests.some((r) => r.status !== 'pending' && r.decidedBy === 'manager'),
  },
  {
    titleKey: 'tutorial.step5.title',
    body: (_ceo, _company, repo, de) =>
      repo ? (
        de ? (
          <>
            {repo} hat eine eigene Etage. Gehe in den Fahrstuhl in der Mitte der Südwand und drücke <Key action="interact" /> auf dem Panel, oder drücke <Key action="interact" /> oder klicke das Verzeichnis daneben.
          </>
        ) : (
          <>
            {repo} has its own floor. Walk into the elevator in the middle of the south wall and press <Key action="interact" /> on its panel, or press <Key action="interact" /> or click the directory beside it.
          </>
        )
      ) : de ? (
        <>
          Jedes Projekt bekommt seine eigene Etage. Füge eines in deinem Büro hinzu (der Glasraum hinten links), dann nimm den Fahrstuhl in der Mitte der Südwand.
        </>
      ) : (
        <>
          Every project gets its own floor. Add one in your office (the glass room at the back left), then take the elevator in the middle of the south wall.
        </>
      ),
    done: (s) => s.floor > 0,
  },
  {
    titleKey: 'tutorial.step6.title',
    body: (_ceo, _company, _repo, de) =>
      de ? (
        <>
          Das Whiteboard vorne auf jeder Etage ist ihr Kanban-Board. Drücke <Key action="interact" /> oder klicke es, um Aufgaben zu verteilen, Pull Requests zu QA zu schicken und sie zu mergen.
        </>
      ) : (
        <>
          The whiteboard at the front of every floor is its Kanban board. Press <Key action="interact" /> or click it to hand out issues, send pull requests to QA and merge them.
        </>
      ),
    done: (s) => s.overlay?.kind === 'kanban',
  },
  {
    titleKey: 'tutorial.step7.title',
    body: (_ceo, _company, _repo, de) =>
      de ? (
        <>
          Gehe hinter jemanden, um seinen Bildschirm zu sehen, oder drücke <Key action="interact" /> oder klicke einen Schreibtisch für das volle Terminal. Jeder Pull Request wird von einem Agenten getestet, bevor du ihn mergst.
        </>
      ) : (
        <>
          Walk up behind anyone to watch their screen, or press <Key action="interact" /> or click a desk for their full terminal. Every pull request is tested by an agent before you merge it.
        </>
      ),
    done: (s) => s.overlay?.kind === 'terminal' && s.overlay.agentId !== CEO_ID,
  },
  {
    titleKey: 'tutorial.step8.title',
    body: (_ceo, company, _repo, de) =>
      de ? (
        <>
          Dein Glasbüro in der Lobby (hinten links) hat die Manager-Konsole: Projekte, das Team und die CEO-Einstellungen. Drücke <Key action="help" /> jederzeit für Hilfe. Viel Spaß beim Führen von {company}!
        </>
      ) : (
        <>
          Your glass office in the lobby (back left) has the manager's console: projects, the team, and the CEO's settings. Press <Key action="help" /> any time for help. Enjoy running {company}!
        </>
      ),
  },
];

export function Tutorial() {
  const t = useT();
  const step = useStore((s) => s.settings.tutorialStep);
  const setupDone = useStore((s) => s.settings.setupDone);
  const started = useStore((s) => s.started);
  const company = useStore((s) => s.settings.companyName);
  const ceo = useStore((s) => s.agents[CEO_ID]?.name ?? 'the CEO');
  const repo = useStore((s) => s.repos[0]?.fullName.split('/')[1] ?? null);
  const [cheer, setCheer] = useState(false);
  const moving = useRef(false);
  const shownAt = useRef(Date.now());
  const de = t('help.locale') === 'de';

  const active = started && setupDone && step >= 0 && step < STEPS.length;
  const go = (to: number) => {
    if (moving.current) return;
    moving.current = true;
    void api
      .updateSettings({ tutorialStep: to >= STEPS.length ? -1 : to })
      .catch(() => undefined)
      .finally(() => {
        moving.current = false;
        setCheer(false);
      });
  };

  useEffect(() => {
    shownAt.current = Date.now();
    setCheer(false);
  }, [step]);

  // Move on by itself once the thing the step asks for has happened.
  useEffect(() => {
    if (!active) return;
    const s = STEPS[step];
    if (!s.done) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = () => {
      if (timer || moving.current) return;
      const st = useStore.getState();
      if (!s.done!(st)) return;
      const wait = Math.max(0, (s.minMs ?? 0) - (Date.now() - shownAt.current));
      timer = setTimeout(() => {
        if (!s.done!(useStore.getState())) {
          timer = null;
          return;
        }
        setCheer(true);
        timer = setTimeout(() => go(step + 1), 900);
      }, wait);
    };
    check();
    const unsub = useStore.subscribe(check);
    const poll = setInterval(check, 1000); // locked / minMs can flip without a store change we see
    return () => {
      unsub();
      clearInterval(poll);
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, step]);

  if (!active) return null;
  const s = STEPS[step];
  const last = step === STEPS.length - 1;
  const title = t(s.titleKey as Parameters<typeof t>[0]);
  return (
    <div className={`tour ${cheer ? 'tour-cheer' : ''}`}>
      <div className="tour-head">
        <span className="tour-count">
          {t('tutorial.count', { n: String(step + 1), total: String(STEPS.length) })}
        </span>
        <span className="spacer" />
        <button className="linkish small" onClick={() => go(STEPS.length)}>
          {t('tutorial.skip')}
        </button>
      </div>
      <div className="tour-title">{cheer ? `✅ ${title}` : title}</div>
      <div className="tour-body">{s.body(ceo, company || (de ? 'das Unternehmen' : 'the company'), repo, de)}</div>
      <div className="tour-nav">
        {step > 0 && (
          <button className="btn btn-small btn-ghost" onClick={() => go(step - 1)}>
            {t('tutorial.back')}
          </button>
        )}
        <span className="spacer" />
        <button className="btn btn-small btn-good" onClick={() => go(step + 1)}>
          {last ? t('tutorial.finish') : s.done ? t('tutorial.skipStep') : t('tutorial.next')}
        </button>
      </div>
    </div>
  );
}
