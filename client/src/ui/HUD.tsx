import { useT } from '../i18n';
import { useMemo } from 'react';
import { AgentCard } from './AgentCard';
import { floorPrCounts, repoOnFloor, usePhoneBadge, useStore } from '../store';
import { CEO_ID } from '../../../shared/types';
import { HeldHint } from './HeldHint';
import { CareerPeek } from './CareerCard';
import { CoinChip } from './CoinChip';
import './progressProbe';
import './doctorProbe';
import { eAction } from '../world/toys/sip';
import { stickyDrop } from '../world/boardHands';
import { WorkersPanel } from './WorkersPanel';
import { PresenceHud } from './PresenceHud';
import { officeUpdateChip } from '../officeUpdate';
import { useA11y } from './a11y';
import { useCameraView } from '../world/camera/rig';
import { CameraHud, OverviewButton } from './CameraHud';
import { useKeyName } from './controls';
import { Key, MoveKeys } from './Key';
import { ROOF } from '../world/layout';
import { useRoof } from '../world/roof/roofState';
import { RoofHud } from './RoofHud';
import { usageChip } from '../ops';
import { togglePhoto, usePhotoGate } from '../photo/gate';

/** While the office is on its way to updating itself (or restarting to do it); opens the console's Office row. */
function OfficeUpdateChip() {
  const t = useT();
  const text = useStore((s) => (s.restarting ? t("hud.officeRestarting") : officeUpdateChip(s.officeUpdate)));
  const overlay = useStore((s) => s.overlay);
  const openOverlay = useStore((s) => s.openOverlay);
  if (!text || overlay?.kind === 'manager') return null;
  return (
    <button className="office-chip" onClick={() => openOverlay({ kind: 'manager', tab: 'floors' })} title={t("hud.officeTip")}>
      {text}
    </button>
  );
}

/** While Claude's usage holds new work back (pacing or paused); opens Mission control at the usage meter. */
function UsageChip() {
  const t = useT();
  const usage = useStore((s) => s.usage);
  const sessions = useStore((s) => s.settings.pacingSessions);
  const overlay = useStore((s) => s.overlay);
  const openOverlay = useStore((s) => s.openOverlay);
  const text = usageChip(usage, sessions, Date.now());
  if (!text || overlay?.kind === 'manager') return null;
  return (
    <button className={`office-chip usage-chip usage-chip-${usage.state}`} onClick={() => openOverlay({ kind: 'manager', tab: 'ops', card: 'usage' })} title={t("hud.usageTip")}>
      {text}
    </button>
  );
}

/** The office doctor's findings (server/watchdog.ts); opens them in Mission control. */
function DoctorChip() {
  const t = useT();
  const count = useStore((s) => s.doctor.length);
  const overlay = useStore((s) => s.overlay);
  const openOverlay = useStore((s) => s.openOverlay);
  if (!count || overlay?.kind === 'manager') return null;
  return (
    <button className="office-chip doctor-chip" onClick={() => openOverlay({ kind: 'manager', tab: 'ops', card: 'doctor' })} title={t("hud.doctorTip")}>
      🩺 {t("hud.toCheck").replace("{count}", String(count))}
    </button>
  );
}

/** The phone in your pocket: always one key (or click) away, with a badge when the CEO is waiting on you. */
function PhoneButton() {
  const t = useT();
  const badge = usePhoneBadge();
  const started = useStore((s) => s.started);
  const overlay = useStore((s) => s.overlay);
  const openOverlay = useStore((s) => s.openOverlay);
  const ceo = useStore((s) => s.agents[CEO_ID]);
  const key = useKeyName('phone');
  if (!started || overlay?.kind === 'phone') return null;
  const busy = ceo?.status === 'working';
  return (
    <button className={`phone-btn ${badge ? 'phone-btn-ring' : ''}`} onClick={() => openOverlay({ kind: 'phone' })} title={t("hud.phoneTip").replace("{key}", key)}>
      <span className="phone-btn-icon">📱</span>
      {badge > 0 && <span className="badge phone-btn-badge">{badge}</span>}
      <span className="phone-btn-label">
        <Key action="phone" /> {badge ? t("hud.waiting").replace("{count}", String(badge)) : busy ? t("hud.ceoWorking").replace("{name}", ceo.name) : t("hud.phone")}
      </span>
    </button>
  );
}

/** Photo mode (K by default); a red dot while instant replay keeps the last 15 s (I saves them). */
function PhotoButton() {
  const t = useT();
  const started = useStore((s) => s.started);
  const replay = usePhotoGate((s) => s.replay);
  const photoKey = useKeyName('photo');
  const replayKey = useKeyName('saveReplay');
  if (!started) return null;
  return (
    <button className="pill pill-photo" onClick={togglePhoto} title={replay ? t('hud.photoReplay').replace('{key}', photoKey).replace('{replay}', replayKey) : t('hud.photoMode').replace('{key}', photoKey)}>
      📷 <kbd>{photoKey}</kbd>
      {replay && <span className="pill-photo-rec" aria-label={t("hud.replayOn")} />}
    </button>
  );
}

/** On the phone icon while a message is read aloud (ui/voiceMessages.ts); a click stops it. */
function VoiceIndicator() {
  const t = useT();
  const speaking = useStore((s) => s.voiceSpeaking);
  const started = useStore((s) => s.started);
  if (!started || speaking === null) return null;
  return (
    <button className="voice-speaking" onClick={() => void import('./voiceMessages').then((v) => v.stopSpeaking())} title={t("hud.voiceTip")} aria-label={t("hud.voiceStop")}>
      🔊
    </button>
  );
}

export function HUD() {
  const t = useT();
  const floor = useStore((s) => s.floor);
  const repos = useStore((s) => s.repos);
  const agents = useStore((s) => s.agents);
  const settings = useStore((s) => s.settings);
  const connected = useStore((s) => s.connected);
  const restarting = useStore((s) => s.restarting);
  const replaying = useStore((s) => s.replaying);
  const demo = useStore((s) => s.demo);
  const user = useStore((s) => s.user);
  const ghReady = useStore((s) => s.ghReady);
  const ghError = useStore((s) => s.ghError);
  const focus = useStore((s) => s.focus);
  const held = useStore((s) => s.held);
  // With coffee in hand, E sips whatever you aim at (except the coffee machine).
  const sip = eAction(held, focus?.action.kind ?? null) === 'sip';
  // With a sticky in hand, the hint says what E does with it here.
  const drop = stickyDrop(focus);
  const dropLabel = !drop || drop.kind === 'none' ? null : drop.kind === 'refuse' ? `⚠️ ${drop.label}` : drop.label;
  const overlay = useStore((s) => s.overlay);
  const locked = useStore((s) => s.locked);
  const started = useStore((s) => s.started);
  const travel = useStore((s) => s.travel);
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  const centerDot = useA11y((s) => s.prefs.centerDot);
  // In the overview, the building view and the follow cam there's no crosshair to aim (camera/rig.ts).
  const onFoot = useCameraView((s) => s.mode) === 'first';

  const roof = floor === ROOF;
  const scope = useRoof((s) => s.telescope); // the telescope's eyepiece has its own crosshair
  const repo = floor === 0 || roof ? null : repoOnFloor(repos, floor);
  const running = useMemo(() => Object.values(agents).filter((a) => a.status === 'working' || a.status === 'preparing').length, [agents]);
  const floorAgents = repo ? Object.values(agents).filter((a) => a.repoId === repo.id) : [];
  const qa = useStore((s) => s.qa);
  const prs = useMemo(() => (repo ? floorPrCounts(repo, qa) : null), [repo, qa]);

  return (
    <div className="hud">
      <div className="hud-floor" style={{ ['--accent' as string]: roof ? '#7cc6fe' : (repo?.color ?? '#ff8a5b') }}>
        <div className="floor-num">{roof ? 'R' : repo ? repo.floor : 'G'}</div>
        <div>
          <div className="floor-name">{roof ? `${settings.companyName || 'cubefarm'} · ${t('hud.roof')}` : repo ? repo.fullName : `${settings.companyName || 'cubefarm'} · ${t('hud.lobby')}`}</div>
          <div className="floor-sub">
            {roof
              ? t("hud.roofInfo")
              : repo && prs
                ? t("hud.floorInfo")
                  .replace("{agents}", String(floorAgents.length))
                  .replace("{working}", String(floorAgents.filter((a) => a.status === 'working' || a.status === 'preparing').length))
                  .replace("{qa}", String(prs.inQa))
                  .replace("{ready}", String(prs.ready))
                  + (prs.needsYou ? t("hud.needsYou").replace("{count}", String(prs.needsYou)) : "")
                : t("hud.connectedFloors").replace("{count}", String(repos.length))}
          </div>
        </div>
        <OverviewButton />
      </div>

      <div className="hud-status">
        {demo && <span className="pill pill-demo">{t('ui.demoShort')}</span>}
        <span className={`pill ${replaying ? 'pill-replay' : connected ? 'pill-ok' : restarting ? 'pill-demo' : 'pill-bad'}`}>{replaying ? t("hud.replay") : connected ? t("hud.live") : restarting ? t("hud.restarting") : t("hud.reconnecting")}</span>
        <span className="pill">
          ⚙️ {settings.sessionLimit ? `${running}/${settings.sessionLimit}` : running} {t("hud.sessions")}
        </span>
        <CoinChip />
        {user && <span className="pill">🐙 {user}</span>}
        <PhotoButton />
      </div>

      <WorkersPanel />
      <div className="hud-chips">
        <OfficeUpdateChip />
        <UsageChip />
        <DoctorChip />
      </div>

      {!ghReady && ghError && <div className="hud-banner">⚠️ {ghError}</div>}

      {/* the centre dot (Settings → Accessibility) is a bolder crosshair that stays through the elevator's fade too */}
      {started && !overlay && (!travel || centerDot) && onFoot && !scope && held?.kind !== 'paddle' && <div className={`crosshair ${focus ? 'crosshair-hot' : ''} ${centerDot ? 'crosshair-dot' : ''}`} />}
      {started && !overlay && !travel && onFoot && <RoofHud />}
      {/* the cards for whoever you're looking at, docked at the left edge: the middle is their screen */}
      <div className="aim-cards">
        <AgentCard />
        {started && !overlay && !travel && onFoot && <CareerPeek />}
      </div>
      {started && !overlay && onFoot && (focus || sip) && (
        <div className="hud-hint">
          <Key action="interact" /> {!held && <>/ <kbd>Click</kbd> </>}
          {sip ? (held?.kind === 'sausage' ? t("hud.bite") : t("hud.coffee")) : (dropLabel ?? focus?.label)}
          {!held && focus?.action.kind === 'card' && focus.action.peel && (
            <>
              {' '}
              · <Key action="drop" /> / {t('hud.hold')} <kbd>Click</kbd> {t('hud.takeIt')}
            </>
          )}
          {!sip && focus?.action.kind === 'jukebox' && (
            <>
              {' '}
              · <Key action="volumeDown" /> <Key action="volumeUp" /> / <kbd>Scroll</kbd> {t('hud.volume')}
            </>
          )}
        </div>
      )}
      {started && !overlay && !travel && onFoot && <HeldHint />}
      {started && !overlay && !locked && !travel && onFoot && <div className="hud-resume">{t("hud.lookAround")}</div>}
      {started && !(settings.setupDone && settings.tutorialStep >= 0) && (
        <div className="hud-help">
          <MoveKeys joined /> {t('hud.move')} · <Key action="run" /> {t('hud.run')} · <Key action="interact" /> / <kbd>Click</kbd> {t('hud.interact')} · <Key action="phone" /> {t('hud.phone')} · <Key action="emote" /> {t('hud.emote')} · <Key action="ping" /> {t('hud.ping')} · <Key action="photo" /> {t('hud.photo')} ·{' '}
          <Key action="overview" /> {t('hud.overview')} · <Key action="workers" /> {t('hud.workers')} · <Key action="mute" /> {t('hud.mute')} · <Key action="help" /> {t('hud.help')} · <kbd>Esc</kbd> {t('hud.freeMouse')}
        </div>
      )}

      <div className={`fade ${travel?.phase === 'closing' ? 'fade-in' : ''}`}>
        {travel && <div className="fade-label">{travel.to === 0 ? t("hud.lobby") : travel.to === ROOF ? t("hud.roof") : `${t("hud.floor")} ${travel.to}`}</div>}
      </div>

      <CameraHud />
      <PresenceHud />
      <PhoneButton />
      <VoiceIndicator />
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.level}`} onClick={() => dismiss(t.id)}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
