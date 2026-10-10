import { TranslatedLabel } from './TranslatedLabel';
import { t as tr, useT } from '../i18n';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { floorPrCounts, isBusy, pendingRequests, unreadMessages, useStore, type PhoneTab } from '../store';
import { CEO_ID, type AgentCli, type CliView, type EffortLevel, type HireRequestView, type PhoneMessage, type SwarmSettings } from '../../../shared/types';
import { Markdown } from './Markdown';
import { MessageBox } from './MessageBox';
import { MicButton } from './MicButton';
import { handsFreeProblem, setHandsFree } from './mic';
import { closeOverlay } from './Panel';
import { useDialogFocus } from './dialogFocus';
import { isKey } from './controls';
import { Key } from './Key';
import { Games, type GameId } from './games/Games';
import { HolidayStrip } from './HolidayStrip';
import { replayKind } from './voiceQueue';
import { CLAUDE_MODELS, effectiveModel, effortsFor, fitEffort } from '../../../shared/models';
import { EffortOptions, ModelNotice, ModelOptions, useModels } from './ModelPicker';

// The manager's phone: text the CEO, decide on team changes, see the whole company at a glance
// without walking anywhere, and play a game while the team works. Press P anywhere in the office.

async function attempt<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch {
    return undefined; // api() already toasted the error
  }
}

const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function Avatar({ name, color, size = 34 }: { name: string; color: string; size?: number }) {
  return (
    <span className="avatar" style={{ background: color, width: size, height: size, fontSize: size * 0.45 }}>
      {name[0]}
    </span>
  );
}

// ---------- team changes ----------

/** A coding agent's name, as the office lists it. */
export const cliLabel = (clis: CliView[], id: AgentCli) => clis.find((c) => c.id === id)?.label ?? id;

/** The coding agent a new agent will run: their own pick, else the office default; the Agent SDK runtime is Claude Code for everyone. */
export const hireCli = (cli: AgentCli | '', settings: Pick<SwarmSettings, 'runtime' | 'defaultCli'>): AgentCli =>
  settings.runtime !== 'terminal' ? 'claude' : cli || settings.defaultCli;

/** What the manager can set up on a new agent before hiring them: the CEO's picks to start with ('' = the office default). */
export interface HireSetup {
  name: string;
  cli: AgentCli | '';
  model: string;
  effort: EffortLevel | '';
}

export const setupOf = (r: HireRequestView): HireSetup => ({ name: r.name, cli: r.cli, model: r.model, effort: r.effort });

/** The approval's overrides: the setup as the manager left it, an emptied name back to the CEO's pick. */
export const hireOverrides = (r: HireRequestView, s: HireSetup) => ({ name: s.name.trim() || r.name, cli: s.cli, model: s.model.trim(), effort: s.effort });

/** "Claude Code · claude-opus-5-5 · medium effort": what they'll run, the office defaults filled in. */
export function setupLine(s: Pick<HireSetup, 'cli' | 'model' | 'effort'>, settings: SwarmSettings, clis: CliView[]) {
  const cli = hireCli(s.cli, settings);
  return `${cliLabel(clis, cli)} · ${effectiveModel(s.model, cli, settings, CLAUDE_MODELS[0]) || 'its default model'} · ${s.effort || settings.defaultEffort} effort`;
}

/** A new agent's settings, edited before they're created: the lobby's card and the phone's both use these. */
export function HireSetupFields({ value, onChange, disabled }: { value: HireSetup; onChange: (v: HireSetup) => void; disabled?: boolean }) {
  const t = useT();
  const settings = useStore((s) => s.settings);
  const clis = useStore((s) => s.clis);
  const id = useId();
  const sdk = settings.runtime !== 'terminal';
  const cli = hireCli(value.cli, settings);
  const model = effectiveModel(value.model, cli, settings, CLAUDE_MODELS[0]);
  const supported = effortsFor(cli, model, useModels(cli).catalog);
  const fallback = effectiveModel('', cli, settings, CLAUDE_MODELS[0]);
  // A model picked for one coding agent means nothing to another: switching agents goes back to the default.
  const set = (patch: Partial<HireSetup>) => onChange({ ...value, ...(patch.cli !== undefined && patch.cli !== value.cli ? { model: '', effort: '' } : {}), ...patch });
  return (
    <div className="hire-setup">
      <label className="field" htmlFor={`${id}-name`}>
        <span><TranslatedLabel id="name" /></span>
        <input id={`${id}-name`} value={value.name} maxLength={24} disabled={disabled} onChange={(e) => set({ name: e.target.value })} />
      </label>
      <label className="field" htmlFor={`${id}-cli`}>
        <span><TranslatedLabel id="codingAgent" /></span>
        <select
          id={`${id}-cli`}
          value={sdk ? '' : value.cli}
          disabled={disabled || sdk}
          title={sdk ? t('resume.sdkTitle') : undefined}
          onChange={(e) => set({ cli: e.target.value as AgentCli | '' })}
        >
          <option value="">{sdk ? 'Claude Code' : t('resume.defaultCli').replace('{cli}', cliLabel(clis, settings.defaultCli))}</option>
          {[...clis]
            .sort((a, b) => Number(b.installed) - Number(a.installed))
            .map((c) => (
              <option key={c.id} value={c.id} disabled={!c.installed}>
                {c.label}
                {c.installed ? '' : t('resume.notInstalled')}
              </option>
            ))}
        </select>
      </label>
      <label className="field" htmlFor={`${id}-model`}>
        <span><TranslatedLabel id="model" /></span>
        <select id={`${id}-model`} value={value.model} disabled={disabled} title={t('resume.emptyDefault')} onChange={(e) => set({ model: e.target.value })}>
          <option value="">{t('models.defaultOption', { model: fallback || t('resume.agentDefault') })}</option>
          <ModelOptions cli={cli} current={value.model} />
        </select>
      </label>
      <label className="field" htmlFor={`${id}-effort`}>
        <span><TranslatedLabel id="effort" /></span>
        <select id={`${id}-effort`} value={value.effort} disabled={disabled || (!supported.length && !value.effort)} onChange={(e) => set({ effort: e.target.value as EffortLevel | '' })}>
          <option value="">{t('resume.defaultEffort').replace('{effort}', fitEffort(settings.defaultEffort, supported) || t('models.noEffort'))}</option>
          <EffortOptions cli={cli} model={model} current={value.effort} />
        </select>
      </label>
      <ModelNotice cli={cli} model={model} />
    </div>
  );
}

/**
 * One team change as a card (the phone, the console, pocket mode): a new agent, with what they'll run and a way to
 * change it before hiring them, or an agent the CEO would let go. The CEO's reason either way.
 */
export function Resume({ req, highlight }: { req: HireRequestView; highlight?: boolean }) {
  const t = useT();
  const repo = useStore((s) => s.repos.find((r) => r.id === req.repoId));
  const settings = useStore((s) => s.settings);
  const clis = useStore((s) => s.clis);
  const [setup, setSetup] = useState(() => setupOf(req));
  const [editing, setEditing] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (highlight) ref.current?.scrollIntoView({ block: 'center' });
  }, [highlight]);
  const pending = req.status === 'pending';
  const hire = req.kind === 'hire';
  const name = (hire && pending && setup.name.trim()) || req.name;
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    await attempt(fn);
    setBusy(false);
  };
  const outcome = req.status === 'approved' ? (hire ? t('resume.hired') : t('resume.left')) : hire ? t('resume.declined') : t('resume.kept');
  return (
    <div ref={ref} className={`resume ${hire ? '' : 'resume-letgo'} ${highlight ? 'resume-hot' : ''} ${pending ? '' : 'resume-done'}`}>
      <div className="resume-head">
        <Avatar name={name} color={req.color} size={42} />
        <div className="grow">
          <div className="resume-name">{hire ? name : t('resume.letGo').replace('{name}', req.name)}</div>
          <div className="resume-title">{hire ? t('resume.newAgent') : t('resume.leaving')}</div>
        </div>
        {!pending && <span className={`chip ${req.status === 'approved' ? 'chip-good' : ''}`}>{outcome}</span>}
      </div>
      <div className="resume-meta">
        <span className="chip" style={{ background: repo?.color }}>
          {t('resume.floor').replace('{floor}', String(repo?.floor ?? '?'))}
        </span>
        <span className="muted small">{repo?.fullName.split('/')[1] ?? t('resume.removedFloor')}</span>
      </div>
      {req.reason && <Markdown className="resume-reason" text={req.reason} />}
      {hire && (
        <div className="resume-meta small">
          <span className="grow">⚙️ {setupLine(pending ? setup : req, settings, clis)}</span>
          {pending && (
            <button className="linkish small" aria-expanded={editing} onClick={() => setEditing(!editing)}>
              {editing ? t('resume.done') : t('resume.change')}
            </button>
          )}
        </div>
      )}
      {hire && pending && editing && <HireSetupFields value={setup} onChange={setSetup} disabled={busy} />}
      {!pending && req.note && <div className="muted small">{t('resume.yourNote').replace('{note}', req.note)}</div>}
      {pending && !declining && (
        <div className="row">
          <button className="btn btn-small btn-ghost" disabled={busy} onClick={() => setDeclining(true)}>
            {hire ? t('resume.decline') : t('resume.keep')}
          </button>
          <span className="spacer" />
          <button className="btn btn-small btn-good" disabled={busy} onClick={() => act(() => api.approveRequest(req.id, hire ? hireOverrides(req, setup) : {}))}>
            {hire ? t('resume.hire').replace('{name}', name) : t('resume.doLetGo').replace('{name}', req.name)}
          </button>
        </div>
      )}
      {pending && declining && (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            void act(() => api.rejectRequest(req.id, note));
          }}
        >
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('resume.whyNot')} autoFocus />
          <button className="btn btn-small btn-bad" disabled={busy}>
            {hire ? t('resume.decline') : t('resume.keep')}
          </button>
        </form>
      )}
    </div>
  );
}

/** New agents waiting in the lobby to be set up and hired, with a way down to meet them (unless you're there already). */
function LobbyNudge() {
  const t = useT();
  const n = useStore((s) => pendingRequests(s.requests).filter((r) => r.kind === 'hire').length);
  const inLobby = useStore((s) => s.floor === 0);
  const goToFloor = useStore((s) => s.goToFloor);
  if (!n) return null;
  return (
    <div className="phone-nudge" role="status">
      <span>🪑</span>
      <span className="grow">
        {n === 1 ? t('phone.lobby.one').replace('{n}', String(n)) : t('phone.lobby.many').replace('{n}', String(n))}
      </span>
      {!inLobby && (
        <button className="btn btn-small" onClick={() => goToFloor(0)}>
          {t('phone.lobby.meet')}
        </button>
      )}
    </div>
  );
}

function TeamChanges({ focusId }: { focusId?: string }) {
  const t = useT();
  const requests = useStore((s) => s.requests);
  const demo = useStore((s) => s.demo);
  const pending = pendingRequests(requests);
  const decided = requests.filter((r) => r.status !== 'pending').slice(-8).reverse();
  return (
    <div className="phone-scroll">
      <h3 className="phone-h">👥 {t('phone.waitingOn')} {pending.length > 0 && <span className="badge">{pending.length}</span>}</h3>
      {pending.length === 0 && <p className="muted small phone-empty">{t('phone.nothingWaiting')}</p>}
      {pending.map((r) => (
        <Resume key={r.id} req={r} highlight={r.id === focusId} />
      ))}
      {demo && (
        <div className="row wrap">
          <span className="muted small">{t('phone.demo')}</span>
          <button className="btn btn-small btn-ghost" onClick={() => void attempt(() => api.demoPropose('hire'))}>
            {t('phone.grow')}
          </button>
          <button className="btn btn-small btn-ghost" onClick={() => void attempt(() => api.demoPropose('let-go'))}>
            {t('phone.shrink')}
          </button>
        </div>
      )}
      {decided.length > 0 && (
        <>
          <h3 className="phone-h"><TranslatedLabel id="earlier" /></h3>
          {decided.map((r) => (
            <Resume key={r.id} req={r} />
          ))}
        </>
      )}
    </div>
  );
}

// ---------- chat ----------

/** Replays a CEO message from its saved clip (or the browser's voice); stops it while it plays. */
function ReplayButton({ m }: { m: PhoneMessage }) {
  const saved = useStore((s) => s.voiceCache.saved.includes(m.id));
  const playing = useStore((s) => s.voiceSpeaking === m.id);
  const kind = replayKind(m, saved, typeof speechSynthesis !== 'undefined');
  if (!kind) return null;
  const gone = kind === 'gone';
  return (
    <button
      type="button"
      className={`bubble-play ${playing ? 'bubble-play-on' : ''}`}
      disabled={gone && !playing}
      title={gone ? tr('ui.phone.noAudio') : undefined}
      aria-label={playing ? tr('ui.phone.stopMsg') : tr('ui.phone.playMsg')}
      onClick={() => void import('./voiceMessages').then((v) => (playing ? v.stopSpeaking() : kind !== 'gone' && v.replayMessage(m, kind)))}
    >
      {playing ? '⏹' : '▶'}
    </button>
  );
}

// QUICK messages resolved in Chat using t() since they need translation

/** The hands-free conversation's switch: after the CEO's spoken reply, the phone listens for up to 8 s. */
function HandsFreeToggle({ ceoName }: { ceoName: string }) {
  const t = useT();
  const listen = useStore((s) => s.settings.listen);
  useStore((s) => `${s.voiceKeySet}:${s.settings.voice.provider}`); // handsFreeProblem() follows the key and the voice
  if (!listen || listen.provider === 'off') return null;
  const on = listen.handsFree;
  const why = handsFreeProblem(ceoName);
  return (
    <button
      type="button"
      className={`hands-free ${on ? 'hands-free-on' : ''}`}
      aria-pressed={on}
      title={on ? t('phone.handsFreeTitle.on').replace('{ceo}', ceoName) : why || t('phone.handsFreeTitle.off').replace('{ceo}', ceoName)}
      onClick={() => void setHandsFree(!on, ceoName)}
    >
      🎧 {on ? t('phone.handsFreeOn') : t('phone.handsFreeTxt')}
    </button>
  );
}

function Bubble({ m, ceoName }: { m: PhoneMessage; ceoName: string }) {
  const req = useStore((s) => (m.requestId ? s.requests.find((r) => r.id === m.requestId) : undefined));
  if (m.from === 'office') return <div className="bubble-office">{m.text}</div>;
  const mine = m.from === 'manager';
  return (
    <div className={`bubble-row ${mine ? 'bubble-row-me' : ''}`}>
      <div className={`bubble ${mine ? 'bubble-me' : 'bubble-them'}`}>
        {!mine && <div className="bubble-from">{ceoName}</div>}
        {mine ? <div className="bubble-text">{m.text}</div> : <Markdown className="bubble-md" text={m.text} />}
        {req && req.status === 'pending' && m.from === 'ceo' && <Resume req={req} />}
        <div className="bubble-time">
          {!mine && <ReplayButton m={m} />}
          {clock(m.at)}
        </div>
      </div>
    </div>
  );
}

/** The thread with the CEO; pocket mode shows it as its Chat tab, where the keyboard waits for a tap. */
export function Chat({ autoFocus = true }: { autoFocus?: boolean }) {
  const t = useT();
  const messages = useStore((s) => s.messages);
  const readAt = useStore((s) => s.phoneReadAt);
  const ceo = useStore((s) => s.agents[CEO_ID]);
  const info = useStore((s) => s.ceo);
  const settings = useStore((s) => s.settings);
  const running = useStore((s) => Object.values(s.agents).filter(isBusy).length);
  const [text, setText] = useState('');
  const scroller = useRef<HTMLDivElement>(null);

  // Reading the thread marks it read.
  useEffect(() => {
    const last = [...messages].reverse().find((m) => m.from === 'ceo');
    if (last && last.at > readAt) void attempt(() => api.phoneRead(last.at));
  }, [messages, readAt]);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, info.job?.kind]);

  if (!ceo) return <p className="muted phone-empty">{t('ceo.empty')}</p>;
  const send = (msg: string) => {
    const body = msg.trim();
    if (!body) return;
    setText('');
    void attempt(() => api.messageCeo(body));
  };
  const replying = ceo.status === 'working' && info.job?.kind === 'chat';
  const chatQueued = info.queue.some((j) => j.kind === 'chat');
  const presence =
    ceo.status === 'working'
      ? replying
        ? t('ceo.status.typing')
        : t('ceo.status.busy').replace('{label}', info.job?.label ?? 'working')
      : chatQueued
        ? settings.sessionLimit && running >= settings.sessionLimit
          ? t('ceo.status.slotFull').replace('{running}', String(running)).replace('{max}', String(settings.sessionLimit))
          : t('ceo.status.reading')
        : info.queue.length
          ? t('ceo.status.nextUp').replace('{label}', info.queue[0].label)
          : t('ceo.status.available');
  const QUICK = [t('phone.quick1'), t('phone.quick2'), t('phone.quick3')];

  return (
    <div className="phone-chat">
      <div className="chat-head">
        <Avatar name={ceo.name} color={ceo.color} />
        <div className="grow">
          <b>{ceo.name}</b> <span className="muted small">CEO</span>
          <div className={`small ${ceo.status === 'working' ? 'presence-busy' : 'muted'}`}>{presence}</div>
        </div>
        <HandsFreeToggle ceoName={ceo.name} />
      </div>
      <div className="chat-log" ref={scroller} aria-label={tr('ui.phone.messagesWith', { name: ceo.name })} tabIndex={0}>
        {messages.length === 0 && (
          <p className="muted small phone-empty">
            {t('phone.sayHi').replace('{name}', ceo.name).replace('{name}', ceo.name)}
          </p>
        )}
        {messages.map((m) => (
          <Bubble key={m.id} m={m} ceoName={ceo.name} />
        ))}
        {replying && (
          <div className="bubble-row">
            <div className="bubble bubble-them bubble-typing">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
      </div>
      <div className="quick">
        {QUICK.map((q) => (
          <button key={q} className="quick-chip" onClick={() => send(q)}>
            {q}
          </button>
        ))}
      </div>
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <MessageBox value={text} onChange={setText} placeholder={t('ceo.message').replace('{name}', ceo.name)} aria-label={t('ceo.message').replace('{name}', ceo.name)} autoFocus={autoFocus} />
        <MicButton kind="phone" value={text} onChange={setText} onSend={send} />
        <button className="btn btn-small btn-good" disabled={!text.trim()}>
          {t('phone.send')}
        </button>
      </form>
    </div>
  );
}

// ---------- company at a glance ----------

function useCompany() {
  const t = useT();
  const repos = useStore((s) => s.repos);
  const agents = useStore((s) => s.agents);
  const qa = useStore((s) => s.qa);
  const requests = useStore((s) => s.requests);
  const settings = useStore((s) => s.settings);
  const info = useStore((s) => s.ceo);
  return useMemo(() => {
    const staff = Object.values(agents).filter((a) => a.role !== 'ceo');
    const ceo = agents[CEO_ID];
    const running = Object.values(agents).filter(isBusy).length;
    const floors = repos.map((r) => {
      const team = staff.filter((a) => a.repoId === r.id);
      const counts = floorPrCounts(r, qa);
      return {
        repo: r,
        team: team.length,
        working: team.filter(isBusy).length,
        idle: team.filter((a) => !isBusy(a)).length,
        issues: r.issues.length,
        prs: r.pulls.filter((p) => p.state === 'OPEN').length,
        inQa: counts.inQa,
        ready: counts.ready,
        stuck: counts.needsYou,
        merged: r.pulls.filter((p) => p.state === 'MERGED').length,
      };
    });
    const sum = (k: 'issues' | 'prs' | 'ready' | 'stuck' | 'inQa') => floors.reduce((n, f) => n + f[k], 0);
    const pending = pendingRequests(requests).length;

    // The report: a few plain sentences, most urgent first.
    const report: { icon: string; text: string; tone?: 'good' | 'warn' }[] = [];
    const readyList = floors.filter((f) => f.ready > 0);
    if (readyList.length)
      report.push({
        icon: '✅',
        text: t('phone.report.ready', { count: sum('ready'), n: sum('ready'), detail: readyList.map((f) => `${f.repo.fullName.split('/')[1]}: ${f.ready}`).join(', ') }),
        tone: 'good',
      });
    if (sum('stuck')) report.push({ icon: '⚠️', text: t('phone.report.stuck', { count: sum('stuck'), n: sum('stuck') }), tone: 'warn' });
    if (pending) report.push({ icon: '👥', text: t('phone.report.pending', { count: pending, n: pending }), tone: 'warn' });
    report.push({
      icon: '⚙️',
      text: settings.sessionLimit
        ? running
          ? t('phone.report.sessions.limitedBusy').replace('{running}', String(running)).replace('{max}', String(settings.sessionLimit))
          : t('phone.report.sessions.limitedIdle').replace('{max}', String(settings.sessionLimit))
        : running
          ? t('phone.report.sessions.busy', { count: running, n: running })
          : t('phone.report.sessions.idle'),
    });
    for (const f of floors) {
      if (f.issues > 0 && !f.repo.autoAssign && f.working === 0 && f.idle > 0) {
        report.push({ icon: '💤', text: t('phone.report.autoOff', { count: f.issues, n: f.issues, name: f.repo.fullName.split('/')[1] }) });
      }
    }
    const busiest = [...floors].sort((a, b) => b.issues + b.prs - (a.issues + a.prs))[0];
    if (busiest && busiest.issues + busiest.prs > 0 && floors.length > 1) {
      report.push({ icon: '🔥', text: t('phone.report.busiest').replace('{name}', busiest.repo.fullName.split('/')[1]).replace('{issues}', String(busiest.issues)).replace('{prs}', String(busiest.prs)) });
    }
    if (ceo) {
      report.push({
        icon: '🧠',
        text:
          ceo.status === 'working'
            ? t('phone.report.ceo.working').replace('{name}', ceo.name).replace('{job}', (info.job?.label ?? 'working').replace(/^\w/, (c) => c.toLowerCase()))
            : info.nextReviewAt
              ? t('phone.report.ceo.review').replace('{name}', ceo.name).replace('{time}', clock(info.nextReviewAt))
              : t('phone.report.ceo.off').replace('{name}', ceo.name),
      });
    }
    if (floors.length === 0) report.splice(0, report.length, { icon: '👋', text: t('phone.report.empty') });
    return { floors, staff: staff.length, running, max: settings.sessionLimit, issues: sum('issues'), prs: sum('prs'), report };
  }, [repos, agents, qa, requests, settings, info]);
}

/** Every panel, a key press away: the phone is where keyboard and screen reader users reach the rest of the office. */
function Shortcuts() {
  const t = useT();
  const openOverlay = useStore((s) => s.openOverlay);
  const repoId = useStore((s) => s.repos.find((r) => r.floor === s.floor)?.id);
  return (
    <nav className="phone-links" aria-label={tr('ui.phone.openPanel')}>
      <button className="btn btn-small" onClick={() => openOverlay({ kind: 'manager' })}>
        {t('phone.console')}
      </button>
      {repoId && (
        <button className="btn btn-small" onClick={() => openOverlay({ kind: 'kanban', repoId })}>
          📋 Kanban
        </button>
      )}
      <button className="btn btn-small" onClick={() => openOverlay({ kind: 'floorList' })}>
        {t('phone.floorList')}
      </button>
      <button className="btn btn-small" onClick={() => openOverlay({ kind: 'help' })}>
        {t('phone.helpBtn')}
      </button>
      <button className="btn btn-small" onClick={() => openOverlay({ kind: 'manager', tab: 'access' })}>
        {t('phone.accessBtn')}
      </button>
    </nav>
  );
}

function Company() {
  const t = useT();
  const c = useCompany();
  const goToFloor = useStore((s) => s.goToFloor);
  const projectLabel = t('phone.tile.projects', { count: c.floors.length });
  const tiles: [string, string | number, string][] = [
    ['🏢', c.floors.length, projectLabel],
    ['📋', c.issues, t('phone.tile.issues')],
    ['🔀', c.prs, t('phone.tile.prs')],
    ['👥', c.staff, t('phone.tile.staff')],
    ['⚙️', c.max ? `${c.running}/${c.max}` : `${c.running}`, t('phone.tile.working')],
  ];
  return (
    <div className="phone-scroll">
      <div className="tiles">
        {tiles.map(([icon, value, label]) => (
          <div key={label} className="tile">
            <div className="tile-value">
              {icon} {value}
            </div>
            <div className="tile-label">{label}</div>
          </div>
        ))}
      </div>
      <Shortcuts />
      <h3 className="phone-h">{t('phone.report')}</h3>
      <ul className="report">
        {c.report.map((r, i) => (
          <li key={i} className={r.tone ? `report-${r.tone}` : ''}>
            <span>{r.icon}</span>
            <span>{r.text}</span>
          </li>
        ))}
      </ul>
      {c.floors.length > 0 && <h3 className="phone-h"><TranslatedLabel id="projects" /></h3>}
      {c.floors.map((f) => (
        <div key={f.repo.id} className="proj" style={{ ['--accent' as string]: f.repo.color }}>
          <div className="row">
            <span className="floor-badge">{f.repo.floor}</span>
            <div className="grow" style={{ minWidth: 0 }}>
              <b className="proj-name">{f.repo.fullName.split('/')[1]}</b>
              <div className="muted small proj-sum">{f.repo.summary || f.repo.description || f.repo.fullName}</div>
            </div>
            <button className="btn btn-small" onClick={() => goToFloor(f.repo.floor)}>
              {t('phone.go')}
            </button>
          </div>
          <div className="proj-stats small">
            <span>
              👥 {f.team}
              {f.working ? ` ${t('phone.busy').replace('{n}', String(f.working))}` : ''}
            </span>
            <span>📋 {f.issues}</span>
            <span>🔍 {f.inQa}</span>
            <span className={f.ready ? 'proj-ready' : ''}>✅ {f.ready}</span>
            <span>🎉 {f.merged}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- the phone ----------

// Put the phone away mid-game and it opens on that (paused) game next time, unless something new came in meanwhile.
let resumeGames: { game: GameId | null; waiting: number } | null = null;

const waitingNow = () => {
  const s = useStore.getState();
  return pendingRequests(s.requests).length + unreadMessages(s.messages, s.phoneReadAt);
};

export function Phone({ tab: initialTab, requestId }: { tab?: PhoneTab; requestId?: string }) {
  const t = useT();
  const [tab, setTab] = useState<PhoneTab>(() =>
    resumeGames && !requestId && waitingNow() <= resumeGames.waiting ? 'games' : (initialTab ?? (requestId ? 'hires' : 'chat')),
  );
  const [game, setGame] = useState<GameId | null>(() => (tab === 'games' ? (resumeGames?.game ?? null) : null));
  const where = useRef({ tab, game });
  useEffect(() => {
    where.current = { tab, game };
  });
  useEffect(
    () => () => {
      resumeGames = where.current.tab === 'games' ? { game: where.current.game, waiting: waitingNow() } : null;
    },
    [],
  );
  const openOverlay = useStore((s) => s.openOverlay);
  const box = useRef<HTMLDivElement>(null);
  useDialogFocus(box);
  const requests = useStore((s) => s.requests);
  const messages = useStore((s) => s.messages);
  const readAt = useStore((s) => s.phoneReadAt);
  const ceoName = useStore((s) => s.agents[CEO_ID]?.name ?? 'CEO');
  const listenOn = useStore((s) => (s.settings.listen?.provider ?? 'off') !== 'off');
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(t);
  }, []);
  // Keep the overlay's tab in sync so new messages know whether the chat is on screen (during a game it isn't,
  // so the CEO's texts still pop up).
  useEffect(() => {
    openOverlay({ kind: 'phone', tab, requestId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
      if (e.key === 'Escape' || (!typing && isKey('phone', e.code))) {
        e.preventDefault();
        closeOverlay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pending = pendingRequests(requests).length;
  const unread = unreadMessages(messages, readAt);
  const tabs: [PhoneTab, string, string, number][] = [
    ['chat', '💬', ceoName, tab === 'chat' ? 0 : unread],
    ['hires', '👥', t('phone.tabTeam'), pending],
    ['company', '📊', t('phone.tabCompany'), 0],
    ['games', '🎮', t('phone.tabGames'), 0],
  ];
  return (
    <div className="overlay phone-overlay" onMouseDown={(e) => e.target === e.currentTarget && closeOverlay()}>
      <div className="phone" ref={box} role="dialog" aria-modal="true" aria-label={t('phone.aria')} tabIndex={-1}>
        <div className="phone-status" aria-hidden>
          <span>{clock(now)}</span>
          <span className="phone-notch" />
          <span>📶 🔋</span>
        </div>
        <HolidayStrip />
        <div className="phone-screen">
          {tab !== 'games' && <LobbyNudge />}
          {tab === 'chat' && <Chat />}
          {tab === 'hires' && <TeamChanges focusId={requestId} />}
          {tab === 'company' && <Company />}
          {tab === 'games' && <Games game={game} onGame={setGame} />}
        </div>
        <nav className="phone-tabs" role="tablist" aria-label={tr('uiExtra.phone')}>
          {tabs.map(([k, icon, label, badge]) => (
            // Tapping Games again while in a game goes back to the list.
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              aria-label={badge > 0 ? t('phone.aria.newBadge').replace('{label}', label).replace('{badge}', String(badge)) : label}
              className={`phone-tab ${tab === k ? 'phone-tab-on' : ''}`}
              onClick={() => (k === 'games' && tab === 'games' ? setGame(null) : setTab(k))}
            >
              <span className="phone-tab-icon" aria-hidden>
                {icon}
                {badge > 0 && <span className="badge badge-dot">{badge}</span>}
              </span>
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="phone-hint">
          {tab === 'chat' && (
            <>
              <kbd>Shift</kbd>+<kbd>Enter</kbd> {t('phone.newLine')} ·{' '}
              {listenOn && (
                <>
                  <Key action="talk" /> {t('phone.toTalk')} ·{' '}
                </>
              )}
            </>
          )}
          {tab === 'games' && game && (
            <>
              <kbd>Backspace</kbd> {t('phone.gamesBack')} ·{' '}
            </>
          )}
          <Key action="phone" /> {t('phone.putAway')}
        </div>
      </div>
    </div>
  );
}
