import { useT } from '../i18n';
import { TranslatedLabel } from './TranslatedLabel';
import { useState, useSyncExternalStore } from 'react';
import { useStore, type HelpTab } from '../store';
import { CEO_ID } from '../../../shared/types';
import { AppViewer } from './AppViewer';
import { CardView } from './CardView';
import { Catalogue, DecorBoxPanel } from './Catalogue';
import { ControlsSettings } from './ControlsSettings';
import { ElevatorPanel } from './ElevatorPanel';
import { FloorList } from './FloorList';
import { TradingPanel } from './TradingPanel';
import { Key, MoveKeys } from './Key';
import { Interview } from './Interview';
import { KanbanView } from './KanbanView';
import { ManagerConsole } from './ManagerConsole';
import { Panel } from './Panel';
import { Phone } from './Phone';
import { TerminalView } from './TerminalView';
import { getAudioPrefs, setAudioPrefs, subscribeAudio } from './sfx';
import { CHATTER_LEVELS, SOUND_GROUPS, type ChatterLevel, type SoundGroup } from './audioPrefs';
import type { DayMode } from '../world/sky/time';
import { setDayMode, useDayTime } from '../world/sky/useDayTime';
import { GRAPHICS_PRESETS, type GraphicsPreset } from '../world/gfx/quality';
import { effectiveTier, setGraphicsPreset, useGfx } from '../world/gfx/useGraphics';
import { setReplay, usePhotoGate } from '../photo/gate';

export { closeOverlay, Panel } from './Panel';

/** Office volume, mute and a level per kind of sound; saved in this browser. */
export function SoundControls() {
  const t = useT();
  const prefs = useSyncExternalStore(subscribeAudio, getAudioPrefs);
  const { volume, muted, soundtrack } = prefs;
  const SOUND_GROUP_LABELS: Record<SoundGroup, string> = { steps: t('sound.steps'), typing: t('sound.typing'), babble: t('sound.babble'), toys: t('sound.toys'), alerts: t('sound.alerts'), music: t('sound.music'), voice: t('sound.voice'), outside: t('sound.outside'), score: t('sound.score') };
  const SOUND_GROUP_TITLES: Partial<Record<SoundGroup, string>> = {
    babble: t('sound.babble.title'),
    alerts: t('sound.alerts.title'),
    music: t('sound.music.title'),
    voice: t('sound.voice.title'),
    outside: t('sound.outside.title'),
    score: t('sound.score.title'),
  };
  return (
    <div className="sound-controls">
      <div className="row wrap sound">
        <label className="toggle">
          <input type="checkbox" checked={!muted} onChange={(e) => setAudioPrefs({ muted: !e.target.checked })} /> {muted ? '🔇' : '🔊'} {t('sound.sound')}
        </label>
        <label className="toggle" title={SOUND_GROUP_TITLES.score}>
          <input type="checkbox" checked={soundtrack} onChange={(e) => setAudioPrefs({ soundtrack: e.target.checked })} /> 🎼 {t('sound.score')}
        </label>
        <label className="sound-volume">
          <span className="muted small"><TranslatedLabel id="volume" /></span>
          <input type="range" min={0} max={100} step={5} value={volume} disabled={muted} aria-label={t('sound.volume.aria')} onChange={(e) => setAudioPrefs({ volume: Number(e.target.value) })} />
          <span className="small sound-pct">{volume}%</span>
        </label>
      </div>
      <div className="sound-groups" role="group" aria-label={t('sound.groups.aria')}>
        {SOUND_GROUPS.map((g) => (
          <label key={g} className="sound-volume" title={SOUND_GROUP_TITLES[g]}>
            <span className="muted small sound-group-name">{SOUND_GROUP_LABELS[g]}</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={prefs[g]}
              disabled={muted || (g === 'score' && !soundtrack)}
              aria-label={`${SOUND_GROUP_LABELS[g]} ${t('sound.volume.aria')}`}
              aria-valuetext={`${prefs[g]}%`}
              onChange={(e) => setAudioPrefs({ [g]: Number(e.target.value) })}
            />
            <span className="small sound-pct">{prefs[g]}%</span>
          </label>
        ))}
      </div>
    </div>
  );
}

/** How much the agents say in their speech bubbles, and whether they babble it out loud; saved in this browser. */
function ChatterSettings() {
  const t = useT();
  const { chatter, silentBubbles } = useSyncExternalStore(subscribeAudio, getAudioPrefs);
  const CHATTER_LABELS: Record<ChatterLevel, string> = { off: t('chatter.off'), quiet: t('chatter.quiet'), lively: t('chatter.lively') };
  return (
    <div className="chatter-settings">
      <div className="day-settings" role="radiogroup" aria-label={t('chatter.agentChatter')}>
        <span>💬 {t('chatter.agentChatter')}</span>
        {CHATTER_LEVELS.map((l) => (
          <label key={l} className="toggle">
            <input type="radio" name="chatter-level" checked={chatter === l} onChange={() => setAudioPrefs({ chatter: l })} /> {CHATTER_LABELS[l]}
          </label>
        ))}
      </div>
      <div className="day-settings" role="radiogroup" aria-label={t('uiExtra.voices')}>
        <span><TranslatedLabel id="voices" /></span>
        <label className="toggle">
          <input type="radio" name="chatter-voice" checked={!silentBubbles} disabled={chatter === 'off'} onChange={() => setAudioPrefs({ silentBubbles: false })} /> {t('chatter.babble')}
        </label>
        <label className="toggle">
          <input type="radio" name="chatter-voice" checked={silentBubbles} disabled={chatter === 'off'} onChange={() => setAudioPrefs({ silentBubbles: true })} /> {t('chatter.silentOnly')}
        </label>
      </div>
    </div>
  );
}

/** How the sky outside moves: a fast day, the viewer's own clock or always afternoon; saved in this browser. */
function DaySettings() {
  const t = useT();
  const { mode } = useDayTime();
  const DAY_MODE_LABELS: Record<DayMode, string> = { cycle: t('day.30min'), clock: t('day.clock'), day: t('day.day') };
  return (
    <div className="day-settings" role="radiogroup" aria-label={t('uiExtra.dayNight')}>
      <span><TranslatedLabel id="dayNight" /></span>
      {(Object.keys(DAY_MODE_LABELS) as DayMode[]).map((m) => (
        <label key={m} className="toggle">
          <input type="radio" name="day-mode" checked={mode === m} onChange={() => setDayMode(m)} /> {DAY_MODE_LABELS[m]}
        </label>
      ))}
    </div>
  );
}

/** Graphics quality: Low, Medium, High or Auto (which shows the tier it has settled on); saved in this browser. */
function GraphicsSettings() {
  const t = useT();
  const preset = useGfx((s) => s.preset);
  const tier = useGfx(effectiveTier);
  const blocked = useGfx((s) => s.blocked);
  const GRAPHICS_LABELS: Record<GraphicsPreset, string> = { low: t('graphics.low'), medium: t('graphics.medium'), high: t('graphics.high'), auto: t('graphics.auto') };
  return (
    <div className="day-settings" role="radiogroup" aria-label={t('uiExtra.graphics')}>
      <span><TranslatedLabel id="graphics" /></span>
      {GRAPHICS_PRESETS.map((p) => (
        <label key={p} className="toggle">
          <input type="radio" name="graphics" checked={preset === p} onChange={() => setGraphicsPreset(p)} /> {GRAPHICS_LABELS[p]}
        </label>
      ))}
      {blocked ? (
        <span className="muted small">{t('graphics.blocked').replace('{reason}', blocked)}</span>
      ) : (
        preset === 'auto' && <span className="muted small">{t('graphics.now').replace('{level}', GRAPHICS_LABELS[tier])}</span>
      )}
    </div>
  );
}

/** Instant replay, off by default (photo/instantReplay.ts); saved in this browser. */
function ReplaySetting() {
  const t = useT();
  const on = usePhotoGate((s) => s.replay);
  const parts = t('replay.label').split('{key}');
  return (
    <label className="toggle">
      <input type="checkbox" checked={on} onChange={(e) => setReplay(e.target.checked)} /> {parts[0]}<Key action="saveReplay" />{parts[1]}
    </label>
  );
}

function Help({ tab: initial }: { tab?: HelpTab }) {
  const t = useT();
  const [tab, setTab] = useState<HelpTab>(initial ?? 'office');
  return (
    <Panel title={t('help.title')}>
      <div className="tabs">
        <button className={`tab ${tab === 'office' ? 'tab-on' : ''}`} onClick={() => setTab('office')}>
          {t('help.tab.office')}
        </button>
        <button className={`tab ${tab === 'controls' ? 'tab-on' : ''}`} onClick={() => setTab('controls')}>
          {t('help.tab.controls')}
        </button>
      </div>
      {tab === 'controls' ? (
        <ControlsSettings />
      ) : (
        <div className="help">
          <h3><TranslatedLabel id="movement" /></h3>
          {t('help.locale') === 'de' ? (
            <>
<p>
        Mit <MoveKeys /> oder den Pfeiltasten bewegst du dich.
        <Key action="run" /> lässt dich rennen, mit der Maus schaust du dich um.
        Mit <Key action="interact" /> oder einem Linksklick interagierst du mit dem anvisierten Gegenstand.
        Der erste Klick aktiviert zunächst nur die Maussteuerung.
        Mit <kbd>Esc</kbd> gibst du die Maus frei und legst einen gehaltenen Gegenstand ab.
        Beim Schließen eines Fensters oder beim Etagenwechsel wird die Maussteuerung wieder aktiviert.
        Auch ein Gamepad wird unterstützt. Alle Eingaben kannst du unter
        {' '}<button className="linkish" onClick={() => setTab('controls')}>Steuerung</button>{' '}
        anpassen.
      </p>
            </>
          ) : (
            <>
<p>
            <MoveKeys /> (or the arrow keys) walk · <Key action="run" /> run · mouse to look · <Key action="interact" /> or left click interacts with whatever the crosshair is on (the first click only grabs the mouse) ·{' '}
            <kbd>Esc</kbd> frees the mouse and drops whatever you're holding. Closing a panel or changing floor grabs it again. A gamepad works too. Every key, the mouse and the gamepad are set up in{' '}
            <button className="linkish" onClick={() => setTab('controls')}>
              Controls
            </button>
            .
          </p>
            </>
          )}
          <h3><TranslatedLabel id="views" /></h3>
          {t('help.locale') === 'de' ? (
            <>
<p>
        Mit <Key action="overview" /> oder der Kartenschaltfläche 🗺️ wechselst du in die Etagenübersicht.
        Du siehst die ganze Etage ohne störende Decke und Vorderwände.
        Über den Schreibtischen zeigen Markierungen, wer arbeitet, prüft, Fehler behebt oder gerade frei ist.
        Ziehe die Ansicht mit der Maus, zoome mit dem Mausrad und drehe sie mit
        {' '}<Key action="rotateLeft" /> und <Key action="rotateRight" />.
        Klicke auf Personen, Schreibtische, das Whiteboard oder den Bildschirm, um sie zu öffnen.
        Mit <Key action="overview" /> kehrst du zu deinem Standort zurück.
        Drückst du die Taste zweimal schnell, erscheint die Gebäudeübersicht mit allen Etagen.
        Klicke eine Etage an, um dorthin zu wechseln.
        Mit „🎥 Folgen" in einer Mitarbeiteransicht folgt die Kamera der jeweiligen Person.
        Eine Bewegungstaste oder <kbd>Esc</kbd> beendet das Folgen.
      </p>
            </>
          ) : (
            <>
<p>
            <Key action="overview" /> (or the 🗺️ button) flies up to the overview: the whole floor at once, ceiling and near walls cut away, with a chip over every desk saying who is working, testing, fixing, stuck or free.
            Drag to pan, scroll to zoom, <Key action="rotateLeft" /> and <Key action="rotateRight" /> turn it a quarter. Click a person, a desk, the whiteboard or the app screen to open it. <Key action="overview" />{' '}
            again flies you back to where you were standing. Press it twice quickly for the building: every floor stacked, each with its live summary; click one to go there. In an agent's panel, <b>🎥 Follow</b>{' '}
            trails them with the camera as they go about the office; any movement key or <kbd>Esc</kbd> gives you the controls back.
          </p>
            </>
          )}
          <h3><TranslatedLabel id="balls" /></h3>
          {t('help.locale') === 'de' ? (
            <>
<p>
        Laufe gegen einen Ball, um ihn anzustoßen, oder visiere ihn an und drücke
        {' '}<Key action="interact" />, um ihn aufzuheben.
        Mit einem Klick oder <Key action="throw" /> wirfst du ihn.
        Kurzes Drücken ergibt einen leichten Wurf, längeres Halten einen kräftigeren.
        Mit <Key action="drop" /> legst du den Ball ab.
        Auch mit einem Ball in der Hand kannst du Schreibtische, Whiteboards und Aufzüge bedienen.
        Beim Öffnen eines Fensters wird der Ball abgelegt.
        Wenn du einen anderen Ball aufhebst, werden beide getauscht.
      </p>
      <p>
        Auf jeder Etage gibt es einen Basketballkorb an der Südwand.
        Der passende Ball liegt darunter.
        Ziele auf das markierte Rechteck am Brett und lade die Wurfstärke ungefähr
        zur Hälfte bis zu drei Vierteln auf.
        Ein kurzer Wurf bleibt zu kurz, ein voll aufgeladener fliegt zu weit.
        Getroffene Mitarbeiter reagieren auf Bälle und Pfeile.
        Visiere den Saugroboter an und drücke <Key action="interact" />,
        damit er sich fröhlich dreht.
      </p>
            </>
          ) : (
            <>
<p>
            Walk into a ball to push it, or aim at one and press <Key action="interact" /> (or click) to pick it up. Click or press <Key action="throw" /> to throw: a tap lobs it, holding charges a harder throw.{' '}
            <Key action="drop" /> drops it at your feet. With a ball in hand, <Key action="interact" /> still works on desks, boards and the elevator (the ball drops when a panel opens), and <Key action="interact" /> on another
            ball swaps them.
          </p>
          <p>
            Every floor has a basketball hoop on the south wall, with its ball waiting underneath. Aim at the painted square on the backboard and fill the throw meter about half to three quarters of the way: the ball
            arcs up and drops through the rim. A tap falls short and a full charge flies long. Hit someone with a ball or a dart and they react. Aim at the roomba and press <Key action="interact" /> for a happy spin.
          </p>
            </>
          )}
          <h3>{t('help.pingpong')}</h3>
          {t('help.locale') === 'de' ? (
            <>
<p>
        Auf jeder Büroetage steht südlich der Schreibtische eine Tischtennisplatte.
        Drücke an einer der beiden Seiten <Key action="interact" />, um einen Schläger aufzunehmen.
        Die Kamera wechselt hinter deine Spielfeldhälfte und ein freier Mitarbeiter kommt zum Spielen.
        Mit der Maus oder dem rechten Gamepad-Stick bewegst du den Schläger.
        Bewegungen nach vorne erzeugen Topspin, nach hinten Rückwärtsdrall und
        seitliche Bewegungen einen seitlichen Effet.
        Mit Klick oder <Key action="throw" /> wirfst du den Ball zum Aufschlag hoch.
        Gespielt wird bis 11, mit zwei Punkten Vorsprung.
        Ergebnisse erscheinen auf der Bestenliste.
        Mit <Key action="drop" /> oder <kbd>Esc</kbd> legst du den Schläger ab.
        Spielen gerade zwei Mitarbeiter, kannst du mit <Key action="interact" /> einsteigen.
      </p>
            </>
          ) : (
            <>
<p>
            Every office floor has a ping-pong table south of the desks. Press <Key action="interact" /> at either end to pick up a paddle: the view moves behind your end, and someone free on the floor comes over to
            play you. The mouse (or the right stick) moves the paddle, up being towards the net; swing it through the ball for pace, forwards for topspin, back for backspin, sideways to curve it. Click (or{' '}
            <Key action="throw" />) to toss and serve. Games go to 11, won by 2, and land on the floor's leaderboard on the wall. <Key action="drop" /> or <kbd>Esc</kbd> puts the paddle down at any time. Now and then two
            idle teammates play each other: press <Key action="interact" /> at an end to step in.
          </p>
            </>
          )}
          <h3><TranslatedLabel id="dog" /></h3>
          {t('help.locale') === 'de' ? (
            <>
<p>
        Ein Bürohund läuft durch das gesamte Gebäude und benutzt gelegentlich den Aufzug.
        Visiere ihn an und drücke <Key action="interact" />, um ihn zu streicheln.
        Er freut sich und folgt dir eine Weile, sogar in den Aufzug.
        Wenn du einen Ball hältst, beobachtet er ihn gespannt.
        Wirfst du den Ball, apportiert er ihn.
        In ruhigen Momenten schläft er auf dem Sofa oder einem Teppich.
        Mitarbeitern mit Problemen leistet er Gesellschaft und nach einem erfolgreichen
        Merge feiert er mit. In den Einstellungen kannst du ihn umbenennen.
      </p>
            </>
          ) : (
            <>
<p>
            One dog roams the whole building, taking the elevator between floors now and then. Aim at it and press <Key action="interact" /> to pet it: it wiggles and follows you for a while (into the elevator
            too). Hold a ball and it watches it eagerly; throw it and it fetches it back to your feet. It naps on the couch or a rug when the floor is quiet, sits with anyone having a hard time (red checks, a third
            round of fixes, or a PR stuck for a human) and celebrates a merge with its author. Rename it in Settings.
          </p>
            </>
          )}
          <h3><TranslatedLabel id="blasters" /></h3>
          {t('help.locale') === 'de' ? (
            <>
<p>
        Auf jeder Etage steht an der Südwand ein Ständer mit Schaumstoff-Blastern.
        Visiere ihn an und drücke <Key action="interact" />, um einen aufzunehmen.
        <b>Schießen:</b> Klicken oder <Key action="throw" />.
        Das Magazin enthält 12 Pfeile; maximal vier Schüsse pro Sekunde.
        <b>Nachladen:</b> <Key action="reload" />.
        <b>Ablegen:</b> <Key action="drop" />.
        Mit <Key action="interact" /> kannst du den Blaster wieder aufheben.
        Pfeile bleiben bei geraden Treffern an Wänden, Whiteboards und Bildschirmen haften,
        sonst prallen sie ab. Sie öffnen keine Fenster.
        Beim Etagenwechsel kommen die Blaster zurück in den Ständer.
      </p>
            </>
          ) : (
            <>
<p>
            Every floor has a rack of foam blasters by the south wall: aim at it and press <Key action="interact" /> to take one. <b>Fire</b>: click or <Key action="throw" /> (12 darts, up to four a second). <b>Reload</b>:{' '}
            <Key action="reload" />. <b>Drop</b>: <Key action="drop" />, then <Key action="interact" /> picks it up again. Darts stick to walls, boards and screens when they hit square on and bounce off everything else. They
            never open anything, and the blasters go back on the rack when you change floors.
          </p>
            </>
          )}
          <h3><TranslatedLabel id="coffee" /></h3>
          {t('help.locale') === 'de' ? (
            <>
<p>
        Jede Büroetage hat eine Küchenzeile mit Kaffeemaschine und Tassenautomat.
        Visiere den Tassenautomaten an und drücke <Key action="interact" />,
        um eine Tasse zu nehmen.
        Stelle sie mit <Key action="interact" /> unter den Auslauf der Maschine
        und drücke anschließend ihren runden Knopf.
        Nach einigen Sekunden ist der Kaffee fertig und die Maschine piept.
        Visiere die Tasse an und nimm sie mit <Key action="interact" /> wieder auf.
        Du kannst sie auch vorzeitig herausnehmen.
      </p>
      <p>
        Mit Kaffee in der Hand trinkst du über <Key action="interact" /> einen Schluck,
        außer wenn du gerade die Maschine anvisierst.
        Eine volle Tasse reicht für drei Schlucke; der letzte ist besonders groß.
        Mit <Key action="drop" /> lässt du die Tasse jederzeit fallen.
        Tassen können nicht geworfen werden.
        Eine heruntergefallene Tasse kannst du samt Inhalt wieder aufnehmen.
        Nicht volle Tassen lassen sich an der Maschine nachfüllen.
      </p>
            </>
          ) : (
            <>
<p>
            Every office floor's kitchenette has a coffee machine with a mug dispenser beside it. Aim at the dispenser and press <Key action="interact" /> to take a mug, aim at the machine's drip tray and press{' '}
            <Key action="interact" /> to put it under the spout, then press <Key action="interact" /> on the machine's round button. After a few seconds of grinding and gurgling it beeps: aim at the mug and press{' '}
            <Key action="interact" /> to take your coffee. You can take the mug out early (it keeps what it has).
          </p>
          <p>
            With coffee in hand, <Key action="interact" /> takes a sip wherever you're looking (except at the machine). A full mug is three sips: the last is one big gulp, and then you drop the empty mug.{' '}
            <Key action="drop" /> drops your mug at any time, and mugs can't be thrown. Aim at a dropped mug and press <Key action="interact" /> to pick it up again, coffee and all. Any mug that isn't full can go back under
            the machine for a refill.
          </p>
            </>
          )}
          <h3><TranslatedLabel id="sound" /></h3>
          {t('help.locale') === 'de' ? (
            <>

          <p>
            Das Büro spielt Benachrichtigungstöne, wenn ein Pull Request zur
            Zusammenführung bereitsteht, eine Qualitätsprüfung fehlschlägt oder
            erfolgreich zusammengeführt wurde. Auch bei Fehlern und neuen
            Mitarbeitern ertönt ein Signal.
          </p>
          <p>
            Wird auf deiner Etage ein Pull Request zusammengeführt, schlägt
            der Gong neben dem Whiteboard und die Mitarbeiter jubeln.
            Mit <Key action="interact" /> kannst du den Gong selbst schlagen.
          </p>
          <p>
            Jede Etage hat eine Jukebox. Mit <Key action="interact" /> wechselst
            du zum nächsten Lied. Über den roten Knopf startest oder stoppst
            du die Musik. Die Fokus-Taste aktiviert ruhige Lo-Fi-Musik und
            Hintergrundklänge zum konzentrierten Arbeiten.
          </p>
          <p>
            Mit <Key action="volumeDown" /> und <Key action="volumeUp" />,
            dem Mausrad oder den Lautstärketasten der Jukebox regelst du die
            Lautstärke. Jede Etage merkt sich ihre eigene Einstellung.
            Bei Benachrichtigungen, Sprache und Gongschlägen wird die Musik
            automatisch leiser. Das gilt auch für geöffnete Fenster,
            das Telefon und den Aufzug.
          </p>
          <p>
            Außerhalb der Reichweite einer Jukebox passt sich die
            Hintergrundmusik der Stimmung im Büro an: ruhig bei wenig
            Betrieb, lebhafter während der Arbeit, angespannter bei
            Problemen und langsamer in der Nacht. Erfolgreiche
            Zusammenführungen werden musikalisch gefeiert.
          </p>
          <p>
            Auch die Raumakustik unterscheidet sich: Lobby, Büros,
            Küche, Aufzug und Balkone haben ihren eigenen Klang.
            Geräusche hinter Wänden werden gedämpft.
            Mit <Key action="mute" /> schaltest du den Ton ein oder aus.
          </p>
          <p>
            Unter der Gesamtlautstärke kannst du Schritte, Tippen,
            Mitarbeitergespräche, Spielzeug, Benachrichtigungen, Musik,
            vorgelesene Nachrichten, Außengeräusche und die
            Hintergrundmusik einzeln einstellen.
            Außengeräusche umfassen beispielsweise Wind, Stadtverkehr,
            Vögel, Grillen, Regen und Gewitter.
            Alle Toneinstellungen werden in diesem Browser gespeichert.
          </p>

            </>
          ) : (
            <>
<p>
            The office chimes when a PR is ready to merge, fails QA or gets merged, when someone hits an error and when a new teammate arrives. A merge on the floor you're on bangs its gong (by the whiteboard) and the
            whole floor cheers; press <Key action="interact" /> at the gong to bang it yourself. Every floor's jukebox plays in its corner: <Key action="interact" /> on it skips to the next song, and its red button
            stops or starts the music. Its Focus button switches the floor to the Focus station (lo-fi beats and ambient tracks for heads-down work) and back to all songs. While you look at it,{' '}
            <Key action="volumeDown" /> and <Key action="volumeUp" />, the mouse wheel or its own − and + buttons set its volume, from quiet background up to music that fills the whole floor; the meter on its card
            shows the level, and each floor keeps its own volume and station. The music dips under the gong, alerts and voices, and goes quiet while a panel or the phone is open and in the elevator. Wherever no
            jukebox can be heard, a quiet soundtrack follows the office's mood: soft and calm, a gentle pulse when the team is busy, darker under a red CI or a PR that needs you, slower at night, and a little
            fanfare after a merge (a bigger one on a streak). Every space sounds like itself, from the glassy lobby and the carpeted floors to the tiled kitchenette, the boxy elevator and the open balconies, and
            sounds behind a wall come through muffled. <Key action="mute" /> mutes or unmutes anywhere. Under the master volume, turn footsteps (yours and everyone's), typing (and the team's sighs and cheers), chatter (their babble voices), toys (balls,
            blasters, coffee and the roomba), alerts (the phone, the elevator, the gong and these cues), music (the jukebox), voice (messages read aloud), outside (wind, the city, birds by day and crickets at night,
            rain and thunder and the world's goings-on, heard out on a balcony or through an open side door, and the rain on the windows) and the soundtrack up or down on their own, or switch the soundtrack off. Your settings are saved in this browser.
          </p>
            </>
          )}
          <SoundControls />
          <h3><TranslatedLabel id="chatter" /></h3>
          {t('help.locale') === 'de' ? (
            <>
          <p>
            Das Team redet bei der Arbeit: Sprechblasen zu dem, was wirklich los ist (ein PR wartet auf die QA, jemand wird zum Testen gebeten,
            Tests werden grün, ein Merge-Konflikt, ein Merge und ein „Gut gemacht!“ aus dem Team, Kaffee am Wasserspender), in einer niedlichen
            Plapperstimme, die bei jedem Besuch gleich klingt; die des CEO ist tiefer und gewichtiger. Höchstens drei sprechen gleichzeitig, die
            Nächsten haben Vorrang. „Leise“ meldet nur Neuigkeiten, „Lebhaft“ plaudert auch über die aktuelle Arbeit. Ziele auf jemanden ohne
            Aufgabe und drücke <Key action="interact" />, um Hallo zu sagen (ziele auf den Schreibtisch, um ihn zu öffnen). Der Regler
            „Geplauder“ oben bestimmt, wie laut geplappert wird.
          </p>
            </>
          ) : (
            <>
<p>
            The team talks as they work: speech bubbles about what's really going on (a PR up for QA, a teammate asked to test it, tests going green, a merge conflict, a merge and a teammate's "Nice
            one!", coffee at the cooler) in a cute babble voice of their own, the same on every visit; the CEO's is lower and grander. At most three speak at once and the nearest win. Quiet says the news;
            lively also chats about what they're doing. Aim at someone with nothing to do and press <Key action="interact" /> to say hi (aim at their desk to open it). The Chatter slider above sets how loud
            they babble.
          </p>
            </>
          )}
          <ChatterSettings />
          <h3><TranslatedLabel id="outside" /></h3>
          {t('help.locale') === 'de' ? (
            <>
          <p>Der Himmel vor den Fenstern hat seinen eigenen Tag: ein ganzer alle 30 Minuten, die Zeit deiner eigenen Uhr oder immer ein sonniger Nachmittag.</p>
          <p>
            Es gibt auch Wetter: Regen, der an den Scheiben herunterläuft, Pfützen auf den Balkonen, Gewitter, Nebel und Schnee. In der
            Managerkonsole wählst du unter <b>Einstellungen → Wetter</b> einen ruhigen eigenen Wetterzyklus (meist schön), dein echtes Wetter vor
            Ort oder gar keins. Und ab und zu passiert draußen etwas, vom Flugzeug oder Luftschiff mit den Büro-News bis zum Feuerwerk in der
            Nacht, einem UFO oder ganz selten einem freundlichen Kaiju; freie Teammitglieder laufen dann zum Zuschauen an die Fenster.
            <b> Einstellungen → Weltereignisse</b> bestimmt, wie oft, oder hält es ruhig.
          </p>
            </>
          ) : (
            <>
<p>The sky outside the windows has its own day: a whole one every 30 minutes, the time on your own clock, or always a sunny afternoon.</p>
          <p>
            It has weather too: rain running down the glass and puddles on the balconies, thunderstorms, fog and snow. In the manager's console, <b>Settings → Weather</b> picks a calm cycle of its own (mostly fair), your
            real local weather or none. And now and then something happens outside, from a plane or a blimp with the office's news to fireworks at night, a UFO or, very rarely, a friendly kaiju; idle teammates run to the
            windows to watch. <b>Settings → World events</b> sets how often, or keeps it calm.
          </p>
            </>
          )}
          <DaySettings />
          <h3><TranslatedLabel id="graphics" /></h3>
          {t('help.locale') === 'de' ? (
            <>
          <p>
            <b>Niedrig</b> ist der schlichte Comic-Look und schont deinen Laptop am meisten. <b>Mittel</b> ergänzt Leuchten: Bildschirme, Lampen,
            die Jukebox und nach Einbruch der Dunkelheit die Fenster der Stadt und den Mond; nachts beleuchten die Monitore Schreibtische und
            Gesichter. <b>Hoch</b> ergänzt weiche Schatten, wo Dinge den Boden berühren, und Farben, die der Tageszeit folgen. <b>Auto</b> startet
            auf Hoch und schaltet herunter, wenn die Bilder ruckeln, und wieder hoch, sobald Luft ist. Wird in diesem Browser gespeichert.
          </p>
            </>
          ) : (
            <>
<p>
            <b>Low</b> is the plain cartoon look and the lightest on your laptop. <b>Medium</b> adds glow: screens, lamps, the jukebox and, after dark, the city's windows and the moon, and the monitors light up desks
            and faces at night. <b>High</b> adds soft shadows where things meet the floor and colour that follows the time of day. <b>Auto</b> starts on High and steps down when frames get slow, then back up once
            there's room. Saved in this browser.
          </p>
            </>
          )}
          <GraphicsSettings />
          <h3><TranslatedLabel id="building" /></h3>
          {t('help.locale') === 'de' ? (
            <>
          <p>
            Das Erdgeschoss ist die Lobby: Dein Büro ist der Glasraum hinten links, das Eckbüro des CEO liegt hinten rechts, und neue Agenten,
            die der CEO möchte, warten auf den Stühlen an der Glastür. Geh zu einem hin und drücke <Key action="interact" />, um ihn
            kennenzulernen: warum der CEO ihn möchte, dazu Programmieragent, Modell und Denkaufwand, die du vor der Einstellung ändern kannst.
            Stellst du ihn ein, gibt er dir die Hand und fährt mit dem Aufzug zu seiner Etage für eine Begrüßungsrunde; lehnst du ab, geht er
            durch die Tür. Wünscht sich der CEO ein kleineres Team, liegt ein Umschlag auf dem Schreibtisch der Person, die gehen soll. Jedes
            verbundene GitHub-Repo bekommt eine eigene Etage. Zum Wechseln gehst du in den Aufzug in der Mitte der Südwand und drückst
            <Key action="interact" /> an seinem Panel. In der Lobby funktioniert auch das Verzeichnis daneben.
          </p>
          <p>
            Der oberste Halt des Aufzugs ist die Dachterrasse (<kbd>R</kbd> am Panel). Entspann dich im Liegestuhl (<Key action="interact" />;
            laufen oder <Key action="interact" /> zum Aufstehen), grill eine Wurst (<Key action="interact" /> legt eine auf und wendet sie,
            <Key action="interact" /> nimmt sie, sobald sie fertig ist, dann isst <Key action="interact" /> sie Bissen für Bissen) oder schau durch
            das Teleskop (<Key action="interact" />; die Maus zielt, das Mausrad zoomt): tagsüber auf die Plakate auf den Dächern, nachts auf den
            Mond und die Sternbilder. In der Dämmerung gehen die Lichterketten an. Freie Teammitglieder machen dort ab und zu Pause, und der CEO
            telefoniert oben.
          </p>
            </>
          ) : (
            <>
<p>
            The ground floor is the lobby: your office is the glass room at the back left, the CEO's corner office is at the back right, and new agents the CEO wants wait on the chairs by the glass door. Walk up
            to one and press <Key action="interact" /> to meet them: why the CEO wants them, and their coding agent, model and effort, which you can change before you hire them. Hire them and they shake your hand
            and take the elevator up to their floor for a welcome tour; decline and they leave by the door. When the CEO wants a smaller team, an envelope waits on the desk of whoever it picked to leave. Every
            connected GitHub repo gets its own floor. To travel, walk into the elevator in the middle of the south wall and press <Key action="interact" /> on its panel. In the lobby, the directory beside it works too.
          </p>
          <p>
            The elevator's top stop is the roof terrace (<kbd>R</kbd> on its panel). Sit back in a deck chair (<Key action="interact" />; walk or press <Key action="interact" /> to get up), grill a sausage at the barbecue (<Key action="interact" /> puts one on and turns it, 
            <Key action="interact" /> again takes it once it's done, then <Key action="interact" /> eats it a bite at a time), or look through the telescope (<Key action="interact" />; the mouse aims and the wheel zooms): the billboards on the rooftops by day, the moon and the
            constellations at night. The string lights come on at dusk. Idle teammates go up for a break now and then, and the CEO takes calls up there.
          </p>
            </>
          )}
          <h3><TranslatedLabel id="mission" /></h3>
          {t('help.locale') === 'de' ? (
            <>
          <p>
            Die geschwungene Bildschirmwand hinter dem Empfang zeigt das ganze Unternehmen auf einen Blick: die Pipeline (Issues bereit, in Arbeit,
            in QA, in Korrektur, bereit zum Mergen, brauchen dich), Merges heute und in den letzten 24 Stunden, Durchlaufzeit, QA-Wartezeit und CI,
            wer beschäftigt ist, und eine Schätzung der heutigen Kosten. Das Teamschild jeder Etage hat eine kurze Zeile mit ihren eigenen Zahlen.
            Der mittlere untere Bildschirm ist Claudes Nutzungsanzeige: Während das Büro nach einer Nutzungswarnung gedrosselt arbeitet, drücke
            <Key action="interact" /> darauf, um wieder mit voller Geschwindigkeit zu arbeiten (wenn du aufgestockt hast oder deine Nutzung
            zurückgesetzt wurde). Braucht dich ein PR oder hängt jemand seit 10 Minuten an einem Fehler, dreht sich das Warnlicht oben (und das am
            Schild der Etage) mit einem sanften Signal: Drücke <Key action="interact" /> darauf, um die Konsole bei dieser Karte zu öffnen. Die
            Managerkonsole zeigt all das ebenfalls unter Missionskontrolle.
          </p>
            </>
          ) : (
            <>
<p>
            The curved bank of screens behind reception shows the whole company at a glance: the pipeline (issues ready, being built, in QA, being fixed, ready to merge, needing you), merges today and over the
            last 24 hours, lead time, QA wait and CI, who's busy, and an estimate of today's cost. Each floor's team sign has a short line of its own numbers. The bottom middle screen is Claude's usage meter: while
            the office paces itself after a usage warning, press <Key action="interact" /> on it to resume full speed (if you've topped up or your usage was reset). When a PR needs you, or someone has been stuck on
            an error for 10 minutes, the beacon on top spins (and the one on that floor's sign) with a calm chime: press <Key action="interact" /> on it to open the console at that card. The manager's console has it
            all too, under Mission control.
          </p>
            </>
          )}
          <h3>{t('help.timelapse')}</h3>
          {t('help.locale') === 'de' ? (
            <>
          <p>
            Den Tag verpasst? Managerkonsole → 📼 Zeitraffer (oder der Bildschirm beim Basketballkorb der Lobby) spielt ihn hier im Büro mit bis
            zu 600-facher Geschwindigkeit ab, oder nur, was passiert ist, während du weg warst. Merges schlagen auch dann den Gong. Während der
            Wiedergabe gibt <kbd>Esc</kbd> die Maus frei, und ein weiteres <kbd>Esc</kbd> führt zurück ins Live-Büro.
          </p>
            </>
          ) : (
            <>
<p>
            Missed the day? The manager's console → 📼 Time-lapse (or the screen by the lobby's hoop) replays it right here in the office at up to 600× speed, or just what happened while you were away. Merges still
            bang the gong. While it plays, <kbd>Esc</kbd> frees the mouse and <kbd>Esc</kbd> again goes back to the live office.
          </p>
            </>
          )}
          <h3><TranslatedLabel id="phone" /></h3>
          {t('help.locale') === 'de' ? (
            <>
          <p>
            Drücke überall <Key action="phone" />, um dein Telefon herauszuholen. Schreib dem CEO, genehmige oder lehne Teamänderungen ab, sieh
            alle Projekte auf einen Blick, oder spiel Cubetris, Kabelschlange oder kümmere dich um dein Schreibtisch-Haustier, während das Team
            arbeitet. Das rote Abzeichen zählt Entscheidungen und Nachrichten, die auf dich warten. Im Chat und im Terminal eines Agenten sendet
            <kbd>Enter</kbd>, und <kbd>Shift</kbd>+<kbd>Enter</kbd> beginnt eine neue Zeile. Um zu sprechen statt zu tippen, halte das 🎙️ neben
            „Senden“ oder halte <Key action="talk" /> im Nachrichtenfeld und sprich: Deine Worte füllen das Feld, damit du sie vor dem Senden
            bearbeiten kannst (ein kurzes Tippen auf 🎙️ hört zu, bis du aufhörst zu sprechen, und <kbd>Esc</kbd> beendet das Zuhören). Mit 🎧
            Freisprechen hört das Telefon nach der gesprochenen Antwort des CEO ein paar Sekunden zu und sendet, was du sagst. Unter
            Einstellungen → Stimme wählst du die Spracherkennung des Browsers oder ElevenLabs.
          </p>
            </>
          ) : (
            <>
<p>
            Press <Key action="phone" /> anywhere to pull out your phone. Text the CEO, approve or decline their team changes, see every project at a glance, or play Cubetris, Cable Snake or look after your
            Desk Pet while the team works. The red badge counts decisions and messages waiting for you. In the chat, and in an agent's terminal, <kbd>Enter</kbd> sends and <kbd>Shift</kbd>+<kbd>Enter</kbd> starts a
            new line. To talk instead of type, hold the 🎙️ next to Send, or hold <Key action="talk" /> in the message box, and speak: your words fill the box to edit before you send (a tap of the 🎙️ listens until you
            stop talking, and <kbd>Esc</kbd> stops listening). With 🎧 Hands-free on, the phone listens for a few seconds after the CEO's spoken reply and sends what you say. Settings → Voice picks the browser's
            speech recognition or ElevenLabs.
          </p>
            </>
          )}
          <h3><TranslatedLabel id="photoClips" /></h3>
          {t('help.locale') === 'de' ? (
            <>
          <p>
            Drücke <Key action="photo" /> (oder 📷 oben rechts), um das Büro einzufrieren und eine eigene Kamera zu fliegen: Klicke in die Ansicht
            zum Steuern, <MoveKeys /> zum Fliegen, <kbd>Space</kbd> und <kbd>C</kbd> für hoch und runter, <Key action="rotateLeft" /> und
            <Key action="rotateRight" /> zum Neigen und das Mausrad zum Zoomen. Wähle einen Filter, füge Tiefenschärfe, das Logo, Etage und Datum
            hinzu oder schiebe die Sonne in die goldene Stunde; dann speichert <kbd>Enter</kbd> ein PNG (bis zu 4× deine Bildschirmgröße) und
            kopiert es. <kbd>V</kbd> nimmt einen Clip mit dem Ton des Büros auf, auf Wunsch mit langsamer Kreisfahrt um den Gong, das Whiteboard
            oder eine Person. Hebe das Einfrieren auf (<kbd>F</kbd>), um das Büro live zu filmen. Die Arbeit läuft weiter, während du fotografierst,
            und <Key action="photo" /> bringt dich genau dorthin zurück, wo du warst. Fotos und Clips bleiben in der Galerie dieses Tabs und landen
            in deinen Downloads, nie im Internet.
          </p>
            </>
          ) : (
            <>
<p>
            Press <Key action="photo" /> (or 📷 at the top right) to freeze the office and fly a camera of your own: click the view to steer, <MoveKeys /> to fly, <kbd>Space</kbd> and <kbd>C</kbd> up and down,{' '}
            <Key action="rotateLeft" /> and <Key action="rotateRight" /> to roll and the wheel to zoom. Pick a filter, add depth of field, the logo, the floor and date, or move the sun to golden hour, then{' '}
            <kbd>Enter</kbd> saves a PNG (up to 4× your screen) and copies it. <kbd>V</kbd> records a clip with the office's sound, optionally slowly circling the gong, the whiteboard or someone. Unfreeze (
            <kbd>F</kbd>) to film the office live. The work carries on while you shoot, and <Key action="photo" /> puts you back exactly where you were. Shots and clips are kept in this tab's gallery and saved to your
            downloads, never uploaded.
          </p>
            </>
          )}
          <ReplaySetting />
          <h3>{t('help.workers')}</h3>
          {t('help.locale') === 'de' ? (
            <>
          <p>
            Die Liste oben rechts zeigt alle, die gerade arbeiten (auf dieser Etage oder, aus der Lobby, auf allen Etagen), mit ihrem neuesten
            Gedanken, ihrer neuesten Antwort oder ihrem neuesten Werkzeugaufruf. Klicke jemanden an, um den Bildschirm zu sehen.
            <Key action="workers" /> blendet die Liste ein oder aus.
          </p>
            </>
          ) : (
            <>
<p>
            The list at the top right shows everyone who is working right now (on this floor, or on every floor from the lobby) with their latest thought, reply or tool call. Click someone to watch their screen.{' '}
            <Key action="workers" /> shows or hides it.
          </p>
            </>
          )}
          <h3><TranslatedLabel id="visitors" /></h3>
          {t('help.locale') === 'de' ? (
            <>
          <p>
            Alle anderen, die das Büro geöffnet haben (ein weiterer Tab, eine Kollegin, dein Handy), laufen als Besucher mit Schlüsselband,
            Namensschild und einem sanften Leuchten in ihrer Farbe herum und sehen dich genauso. Halte <Key action="emote" /> für das Emote-Rad:
            zeige auf Winken, Daumen hoch, Klatschen, Zeigen oder Lachen und lass los (kurzes Tippen winkt, <kbd>1</kbd>–<kbd>5</kbd> wählen
            direkt). Ein Mittelklick oder <Key action="ping" /> zu Fuß setzt einen Ping dorthin, wohin du zielst, sichtbar für alle auf der Etage.
            Die Besucher stehen oben in der Liste der Arbeitenden: <b>Folgen</b> verfolgt jemanden mit der Kamera, auch im Aufzug. Dein Name, deine
            Farbe und <b>Für andere sichtbar</b> stehen in der Managerkonsole unter Einstellungen → Profil; bevor du das Büro betrittst, wird nichts
            über dich geteilt.
          </p>
            </>
          ) : (
            <>
<p>
            Everyone else with the office open (another tab, a colleague, your phone) walks about in it as a visitor with a lanyard, a name tag and a soft glow in their colour, and sees you the same way. Hold{' '}
            <Key action="emote" /> for the emote wheel: point at wave, thumbs up, clap, point or laugh and let go (a quick tap waves, <kbd>1</kbd>–<kbd>5</kbd> pick straight away). Middle-click, or{' '}
            <Key action="ping" /> on foot, drops a ping where you aim for everyone on the floor to see. The visitors are at the top of the who's-working list: <b>Follow</b> trails one with the camera, by
            elevator too. Your name and colour, and <b>Appear to others</b>, are in the manager's console under Settings → Profile; nothing about you is shared before you enter the office.
          </p>
            </>
          )}
          <h3><TranslatedLabel id="ceo" /></h3>
          {t('help.locale') === 'de' ? (
            <>
          <p>
            Der CEO untersucht jede neue Etage, schreibt ihr QA-Briefing, macht aus deinen Projektbeschreibungen Issues und legt die Teamgröße
            jeder Etage anhand ihrer Arbeit fest. Neue Agenten und Entlassungen warten auf deine Zustimmung, außer du lässt Teamänderungen sofort
            übernehmen (Managerkonsole, Einstellungen), und keine Etage wächst über ihre maximale Agentenzahl hinaus.
          </p>
            </>
          ) : (
            <>
<p>
            The CEO studies every new floor, writes its QA brief, turns your project briefs into issues and sets each floor's team size from its work. New agents and let-gos wait for your approval unless you
            set team changes to apply straight away (manager's console, Settings), and no floor grows past its most agents per floor.
          </p>
            </>
          )}
          <h3><TranslatedLabel id="team" /></h3>
          {t('help.locale') === 'de' ? (
            <>
          <p>
            Jeder Agent ist ein echter Programmieragent in seinem eigenen Terminal und arbeitet in seinem eigenen Git-Worktree. Alle sind dieselbe
            Art Arbeitskraft: Jeder freie Agent nimmt, was als Nächstes auf dem Board steht – ein Issue zum Umsetzen, einen Pull Request zum Testen
            oder einen zum Korrigieren. Stell dich hinter jemanden, um auf den Laptop zu schauen, oder drücke <Key action="interact" /> (oder
            klicke) auf einen Schreibtisch, um das Terminal zu öffnen: live zusehen, hineintippen, Anweisungen schicken, anhalten oder ein Issue
            bzw. einen PR zum Testen übergeben. Ziele auf einen freien Schreibtisch und drücke <Key action="interact" />, um einen Agenten
            hinzuzufügen, oder klicke darauf und bestätige.
          </p>
          <p>
            Jeder Pull Request wird vor dem Mergen getestet, in einer frischen Sitzung und, wenn möglich, von einem anderen Agenten als dem Autor:
            Er führt die Tests aus, klickt sich in einem echten Browser durch die Änderung und postet einen Bericht mit Screenshots im PR. Schlägt
            er fehl, korrigiert ihn der Autor (oder ein freier Agent), und er wird erneut getestet.
          </p>
          <p>
            <b>⚙️ Einstellungen</b> oben in ihrer Ansicht ändert Name, Aussehen, Programmieragent, Modell und Denkaufwand. Änderungen gelten ab der
            nächsten Aufgabe, nichts wird unterbrochen. Öffne dort <b>Was sie bekommen</b>, um zu lesen, was das Büro jedem Agenten für
            jede Art von Aufgabe mitgibt. Modell, Denkaufwand und Prompt des CEO findest du im CEO-Tab der Konsole.
          </p>
            </>
          ) : (
            <>
<p>
            Each agent is a real coding agent running in its own terminal, working in its own git worktree. They're all the same kind of worker: any free agent takes whatever is next on the board, an issue to
            build, a pull request to test or one to fix. Walk up behind them to read their laptop, or press <Key action="interact" /> (or click) on a desk to open their terminal: watch it live, type into it, send
            them instructions, stop them or hand them an issue or a PR to test. Aim at an empty desk and press <Key action="interact" /> to add an agent, or click it and confirm.
          </p>
          <p>
            Every pull request is tested before it can be merged, in a fresh session, by an agent other than its author when one is free: they run the tests, click through the change in a real browser, and post a
            report with screenshots on the PR. If it fails, its author (or any free agent) fixes it and it's tested again.
          </p>
          <p>
            <b>⚙️ Setup</b>, at the top of their panel, changes their name, look, coding agent, model and effort. Changes apply from their next task, so nothing is interrupted. Open <b>What they're told</b> there
            to read what the office tells every agent on each kind of task. The CEO's model, effort and prompt are in the console's CEO tab.
          </p>
            </>
          )}
          <h3><TranslatedLabel id="rewards" /></h3>
          {t('help.locale') === 'de' ? (
            <>
          <p>
            Jeder gemergte PR bringt seiner Etage Münzen (🪙 oben rechts): 10 pro Merge, 5 extra, wenn die QA im ersten Anlauf bestanden wurde,
            5, wenn die Checks im ersten Anlauf grün waren, und 10 für den dritten Merge einer Etage innerhalb einer Stunde. Münzen kosten nur
            im Katalog etwas. Gib sie am Katalog-Kiosk in der Lobby aus; was du kaufst, wartet in der 📦 Dekokiste der Etage beim Aufzug. Nimm
            etwas heraus, geh zu einem leuchtenden Platz und drücke <Key action="interact" />: Es rastet ein. <Key action="interact" /> auf einer
            platzierten Deko hebt sie zum Verschieben auf, und die Kiste räumt Dinge weg. Der Spielautomat spielt die Spiele deines Telefons.
            Erfolge füllen das Trophäenregal in der Lobby: <Key action="interact" /> auf einer Trophäe sagt, wofür und wann es sie gab.
          </p>
          <p>
            Schreibtische erzählen die Geschichte ihrer Besitzer: eine Plakette am Monitor für jeden gemergten PR, ein goldener Stern für zehn
            QA-Erfolge im ersten Anlauf, und eine Pflanze, ein Foto und ein Schreibtischspielzeug, die mit der Zeit im Team dazukommen. Schau kurz
            auf einen Schreibtisch, um seine Karrierekarte zu sehen (oder öffne <b>🏅 Karriere</b> in der Ansicht); der Team-Tab der Konsole
            vergleicht alle.
          </p>
            </>
          ) : (
            <>
<p>
            Every merged PR earns its floor coins (🪙 at the top right): 10 a merge, 5 more when QA passed it first time, 5 when its checks were green first time, and 10 for the third merge on a floor within an hour.
            Nothing ever costs coins but the catalogue. Spend them at the catalogue kiosk in the lobby; what you buy waits in the floor's 📦 decor box by its elevator. Take something out, walk to a glowing spot and
            press <Key action="interact" />: it snaps in. <Key action="interact" /> on a placed decoration picks it up to move it, and the box puts things away. The arcade cabinet plays your phone's games.
            Achievements fill the trophy shelf in the lobby: <Key action="interact" /> on a trophy says what it was for and when.
          </p>
          <p>
            Desks tell their owner's story: a plaque on the monitor for every merged PR, a gold star for ten first-time QA passes, and a plant, a photo and a desk toy that arrive with time on the team.
            Look at a desk for a moment to see its career card (or open <b>🏅 Career</b> in their panel); the console's Team tab compares everyone.
          </p>
            </>
          )}
          <h3><TranslatedLabel id="whiteboard" /></h3>
          {t('help.locale') === 'de' ? (
            <>
          <p>
            <b>Backlog</b>: offene Issues, die noch niemand übernommen hat. <b>In Arbeit</b>: Agenten setzen Issues um. <b>In QA</b>: wird
            getestet oder korrigiert. <b>Bereit zum Mergen</b>: QA bestanden, wartet auf dich. Drücke <Key action="interact" /> oder klicke auf
            das Board, um zuzuweisen, zur QA zu schicken, zu mergen und neue Issues anzulegen. Wird ein PR gemergt, regnet Konfetti über dem
            Schreibtisch des Agenten, der ihn geschrieben hat.
          </p>
          <p>
            Ziele auf einen Haftzettel, und er hebt sich vom Board: <Key action="interact" /> (oder ein Klick) liest ihn aus der Nähe.
            <Key action="drop" /> oder ein gehaltener Klick löst einen Backlog-Zettel ab: Trag ihn zum Schreibtisch eines freien Agenten und
            drücke <Key action="interact" />, dann beginnt er mit diesem Issue (der Zettel landet an seinem Monitor). Ein PR, der auf die QA
            wartet, lässt sich genauso zu einem freien Agenten tragen, der ihn dann testet. Überall sonst legt <Key action="drop" /> ihn zurück.
            Rote Fäden verbinden ein Issue mit dem, von dem es abhängt, bis dieses geschlossen ist, und die Ecke des Boards zählt die heutigen
            Merges, die Zeit vom Issue bis zum Merge, die QA-Warteschlange und alles, was dich braucht.
          </p>
          <p>
            Der große Bildschirm links vom Whiteboard zeigt die App der Etage, sobald ihre Vorschau läuft: Drücke <Key action="interact" /> oder
            klicke darauf, um die App zu öffnen. Bei offenen PRs hat die untere Leiste für jeden einen Kanal: Ziele auf einen und drücke
            <Key action="interact" />, um diesen PR neben der Haupt-App laufen zu lassen (höchstens zwei PR-Vorschauen gleichzeitig). Im App-Fenster
            stellt <b>Mit main vergleichen</b> beide nebeneinander, und Checks und QA-Bericht des PRs stehen daneben.
          </p>
            </>
          ) : (
            <>
<p>
            <b>Backlog</b>: open issues nobody has picked up. <b>In progress</b>: agents building issues. <b>In QA</b>: being tested or fixed. <b>Ready to merge</b>: QA passed, waiting for you. Press{' '}
            <Key action="interact" /> or click the board to assign, send to QA, merge and file new issues. When a PR merges, confetti bursts over the desk of the agent who wrote it.
          </p>
          <p>
            Aim at a sticky and it lifts off the board: <Key action="interact" /> (or a click) reads it up close. <Key action="drop" />, or holding the click, peels a Backlog sticky off: carry it to a free
            agent's desk and press <Key action="interact" /> and they start that issue (the sticky goes on their monitor). A PR waiting for QA can be carried to a free agent's desk the same way, and they test it.
            Anywhere else,{' '}
            <Key action="drop" /> puts it back. Red strings join an issue to the one it depends on until that one closes, and the corner of the board counts today's merges, the time from issue to merge, the QA queue
            and anything that needs you.
          </p>
          <p>
            The big screen to the left of the whiteboard shows the floor's app once its preview is running: press <Key action="interact" /> or click it to open the app. With PRs open, its bottom row
            has a channel for each: aim at one and press <Key action="interact" /> to run that PR beside the main app (at most two PR previews run at once). In the viewer, <b>Compare with main</b> puts
            them side by side, and the PR's checks and QA report sit beside it.
          </p>
            </>
          )}
          <HelpAccess />
        </div>
      )}
    </Panel>
  );
}

function HelpAccess() {
  const t = useT();
  const openOverlay = useStore((s) => s.openOverlay);
  return (
    <>
      <h3><TranslatedLabel id="accessibility" /></h3>
      {t('help.locale') === 'de' ? (
            <>
      <p>
        Untertitel für die Stimme des CEO und wichtige Geräusche, farbenblindfreundliche Statusfarben mit Formen, Bewegungskomfort (Sichtfeld,
        kein Kopfwippen, reduzierte Bewegung, ein Mittelpunkt), eine größere Oberfläche, eine legasthenikerfreundliche Schrift und hoher Kontrast
        findest du im Tab „Barrierefreiheit“ der Konsole. Alles funktioniert mit der Tastatur: <Key action="phone" /> öffnet dein Telefon,
        dessen Tab „Unternehmen“ jedes Fenster öffnet, und die Listenansicht zeigt eine Etage ohne 3D.
      </p>
            </>
          ) : (
            <>
<p>
        Captions for the CEO's voice and important sounds, colour-blind-safe status colours with shapes, motion comfort (field of view, no head bob, reduced motion, a centre dot), a bigger UI, a dyslexia-friendly font
        and high contrast are all in the console's Accessibility tab. Everything works from the keyboard: <Key action="phone" /> opens your phone, whose Company tab opens every panel, and the list view shows a floor without the 3D.
      </p>
            </>
          )}
          <div className="row wrap">
        <button className="btn btn-small" onClick={() => openOverlay({ kind: 'manager', tab: 'access' })}>
          {t('help.access.btn')}
        </button>
        <button className="btn btn-small" onClick={() => openOverlay({ kind: 'floorList' })}>
          {t('help.floorList.btn')}
        </button>
      </div>
    </>
  );
}

export function Overlays() {
  const overlay = useStore((s) => s.overlay);
  if (!overlay) return null;
  switch (overlay.kind) {
    case 'terminal':
      return overlay.agentId === CEO_ID ? <ManagerConsole initialTab="ceo" /> : <TerminalView agentId={overlay.agentId} />;
    case 'phone':
      return <Phone tab={overlay.tab} requestId={overlay.requestId} />;
    case 'kanban':
      return <KanbanView repoId={overlay.repoId} />;
    case 'card':
      return <CardView repoId={overlay.repoId} cardKey={overlay.key} number={overlay.number} pr={overlay.pr} />;
    case 'app':
      return <AppViewer repoId={overlay.repoId} pr={overlay.pr} />;
    case 'elevator':
      return <ElevatorPanel />;
    case 'manager':
      return <ManagerConsole initialTab={overlay.tab} initialRepo={overlay.repoId} card={overlay.card} />;
    case 'interview':
      return <Interview requestId={overlay.requestId} />;
    case 'help':
      return <Help tab={overlay.tab} />;
    case 'catalogue':
      return <Catalogue repoId={overlay.repoId} />;
    case 'decor-box':
      return <DecorBoxPanel repoId={overlay.repoId} />;
    case 'floorList':
      return <FloorList />;
    case 'trading':
      return <TradingPanel />;
  }
}
