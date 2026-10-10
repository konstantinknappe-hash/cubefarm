// The Settings tab's Voice section: who reads messages aloud, the ElevenLabs key (write-only), the voice, and a Test;
// then talking instead of typing: who turns speech into text, auto-send and hands-free. The key lives on the server;
// the browser only ever sees its last 4 characters.
import { useEffect, useId, useRef, useState } from 'react';
import { api } from '../api';
import { useStore } from '../store';
import { cacheLabel, clampKeepDays, KEEP_DAYS_MAX, KEEP_DAYS_MIN } from '../../../shared/voiceClips';
import { CEO_ID, type ListenProvider, type ListenSettings, type VoiceOption, type VoiceProvider, type VoiceSettings as Voice } from '../../../shared/types';
import { confirmDialog } from './Confirm';
import { micCaps, setHandsFree } from './mic';
import { cantListen } from './micText';
import { getAudioPrefs } from './sfx';
import { keyName } from './controls';
import { Key } from './Key';
import { browserVoices, searchVoices, voiceLabels, type BrowserVoice } from './voicePicker';
import { playClip, speakLine, stopVoice } from './voicePlayback';
import { t, useT } from '../i18n';

const DOCS = 'https://github.com/leonvanzyl/cubefarm/blob/main/docs/voice.md';

type Save = (patch: Partial<Voice>) => void;

/** What's playing: a voice's preview (its id), the Test line, or nothing. */
type Playing = string | null;

function hintMuted() {
  if (getAudioPrefs().muted) useStore.getState().pushToast('info', t('voice.mutedHint').replace('{key}', keyName('mute')));
}

/** The browser's voices, which arrive asynchronously; null where the browser can't speak. */
function useBrowserVoices(): BrowserVoice[] | null {
  const read = () => (typeof speechSynthesis === 'undefined' ? null : browserVoices(speechSynthesis.getVoices(), navigator.language));
  const [voices, setVoices] = useState(read);
  useEffect(() => {
    if (typeof speechSynthesis === 'undefined') return;
    const update = () => setVoices(read());
    speechSynthesis.addEventListener('voiceschanged', update);
    update();
    return () => speechSynthesis.removeEventListener('voiceschanged', update);
  }, []);
  return voices;
}

function ElevenLabsKey() {
  const t = useT();
  const keySet = useStore((s) => s.voiceKeySet);
  const hint = useStore((s) => s.voiceKeyHint);
  const [editing, setEditing] = useState(false);
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const errorId = useId();
  const save = async (value: string) => {
    setBusy(true);
    setError('');
    try {
      await api.setVoiceKey(value);
      setKey(''); // the key is never kept or shown again once it's saved
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  if (keySet && !editing)
    return (
      <div className="row wrap">
        <span className="grow">
          {t('voice.keySaved').replace('{hint}', hint ?? '')}
        </span>
        <button className="btn btn-small" onClick={() => setEditing(true)}>
          {t('voice.replace')}
        </button>
        <button
          className="btn btn-small btn-ghost"
          disabled={busy}
          onClick={() =>
            void confirmDialog({ tone: 'danger', title: t('voice.removeTitle'), body: t('voice.removeBody'), confirm: t('voice.removeConfirm') }).then(
              (ok) => {
                if (ok) void save('');
              },
            )
          }
        >
          {t('voice.remove')}
        </button>
      </div>
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (key.trim()) void save(key.trim());
      }}
    >
      <label className="field">
        <span>{t('voice.apiKey')}</span>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder={keySet ? t('voice.pasteNew') : t('voice.pasteYour')}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
        />
      </label>
      {error && (
        <div id={errorId} className="term-error small" role="alert">
          {error}
        </div>
      )}
      <div className="row">
        <button className="btn btn-small btn-good" disabled={busy || !key.trim()}>
          {busy ? t('voice.checking') : t('voice.saveKey')}
        </button>
        {editing && (
          <button
            type="button"
            className="btn btn-small btn-ghost"
            onClick={() => {
              setEditing(false);
              setKey('');
              setError('');
            }}
          >
            {t('voice.cancel')}
          </button>
        )}
      </div>
    </form>
  );
}

function VoiceRow({ v, chosen, playing, onChoose, onPreview }: { v: VoiceOption; chosen: boolean; playing: boolean; onChoose: () => void; onPreview: () => void }) {
  const t = useT();
  const labels = voiceLabels(v);
  return (
    <div className={`voice-row ${chosen ? 'voice-row-on' : ''}`}>
      <label className="toggle grow">
        <input type="radio" name="elevenlabs-voice" checked={chosen} onChange={onChoose} />
        <span>
          <b>{v.name}</b>
          {v.labels?.description && <span className="muted"> · {v.labels.description}</span>}
          {labels && <span className="muted small voice-labels">{labels}</span>}
        </span>
      </label>
      <button
        type="button"
        className="btn btn-small btn-ghost"
        aria-label={playing ? t('voice.stopPreviewAria').replace('{name}', v.name) : t('voice.previewAria').replace('{name}', v.name)}
        title={v.previewUrl ? undefined : t('voice.testFirst')}
        onClick={onPreview}
      >
        {playing ? t('voice.stopBtn') : t('voice.previewBtn')}
      </button>
    </div>
  );
}

function ElevenLabsVoices({ voice, save, playing, setPlaying }: { voice: Voice; save: Save; playing: Playing; setPlaying: (p: Playing) => void }) {
  const t = useT();
  const hint = useStore((s) => s.voiceKeyHint);
  const [list, setList] = useState<VoiceOption[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let live = true;
    setList(null);
    setFailed(false);
    api.voices().then(
      (l) => live && setList(l),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [hint]);
  // Show the chosen voice when the list arrives, even when it's far down.
  useEffect(() => {
    const el = listRef.current;
    const row = el?.querySelector<HTMLElement>('.voice-row-on');
    if (el && row) el.scrollTop = row.offsetTop - el.clientHeight / 2 + row.offsetHeight / 2;
  }, [list]);
  const preview = async (v: VoiceOption) => {
    if (playing === v.id) return stopVoice();
    hintMuted();
    setPlaying(v.id);
    try {
      // Library voices may have no preview of their own: then it's the test line, made once and cached.
      const ok = await playClip(v.previewUrl ?? (await api.voiceSample(v.id)));
      if (!ok) useStore.getState().pushToast('error', `Couldn't play ${v.name}'s preview`);
    } catch {
      // api already toasted the error
    } finally {
      setPlaying(null);
    }
  };
  if (failed) return <p className="muted small">{t('voice.loadFailed')}</p>;
  if (!list) return <p className="muted small">{t('voice.loading')}</p>;
  const { recommended, others } = searchVoices(list, query);
  const row = (v: VoiceOption) => (
    <VoiceRow key={v.id} v={v} chosen={voice.voiceId === v.id} playing={playing === v.id} onChoose={() => save({ voiceId: v.id, voiceName: v.name })} onPreview={() => void preview(v)} />
  );
  return (
    <>
      <label className="field">
        <span>
          {t('voice.voiceLabel')}{voice.voiceName && <span className="muted"> · {voice.voiceName}</span>}
        </span>
        <input type="search" aria-label={t('voice.searchAria')} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('voice.voiceSearch')} />
      </label>
      <div ref={listRef} className="voice-list" role="radiogroup" aria-label={t('voice.listAria')}>
        {recommended.length > 0 && <div className="voice-group">{t('voice.recommended')}</div>}
        {recommended.map(row)}
        {others.length > 0 && <div className="voice-group">{t('voice.allVoices')}</div>}
        {others.map(row)}
        {recommended.length + others.length === 0 && <div className="muted small">{t('voice.noMatch').replace('{query}', query)}</div>}
      </div>
    </>
  );
}

function BrowserVoices({ voice, save }: { voice: Voice; save: Save }) {
  const t = useT();
  const voices = useBrowserVoices();
  if (!voices) return <p className="muted small">{t('voice.browserCantSpeak')}</p>;
  const chosen = voices.some((v) => v.name === voice.voiceName) ? voice.voiceName : '';
  return (
    <label className="field">
      <span>{t('voice.browser')}</span>
      <select value={chosen} onChange={(e) => save({ voiceName: e.target.value })}>
        <option value="">{t('voice.browserDefault')}</option>
        {voices.map((v) => (
          <option key={v.name} value={v.name}>
            {v.name}
            {v.lang && ` (${v.lang})`}
          </option>
        ))}
      </select>
      {voices.length === 0 && <span className="muted small">{t('voice.browserNoVoices')}</span>}
    </label>
  );
}

/** How long ElevenLabs clips are kept for the phone's ▶, how much is saved now, and a way to clear it. */
function SavedClips({ voice, save }: { voice: Voice; save: Save }) {
  const t = useT();
  const cache = useStore((s) => s.voiceCache);
  const [days, setDays] = useState(String(voice.keepDays));
  const [busy, setBusy] = useState(false);
  useEffect(() => setDays(String(voice.keepDays)), [voice.keepDays]);
  const commit = () => {
    const n = clampKeepDays(days);
    setDays(String(n));
    if (n !== voice.keepDays) save({ keepDays: n });
  };
  const clear = async () => {
    const ok = await confirmDialog({
      tone: 'danger',
      title: t('voice.clearTitle'),
      body: t('voice.clearBody'),
      confirm: t('voice.clearConfirm'),
    });
    if (!ok) return;
    setBusy(true);
    await api.clearVoiceCache().catch(() => undefined);
    setBusy(false);
  };
  return (
    <div className="voice-clips">
      <label className="field">
        <span>{t('voice.keepClips')}</span>
        <span className="row">
          <input
            type="number"
            min={KEEP_DAYS_MIN}
            max={KEEP_DAYS_MAX}
            step={1}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && commit()}
            style={{ width: '5em' }}
          />
          <span>{t('voice.days')}</span>
        </span>
      </label>
      <div className="row wrap">
        <span className="grow small">
          💾 {cacheLabel(cache.clips, cache.bytes)}
          <span className="muted"> · {t('ui.voice.keepNewest')}</span>
        </span>
        <button className="btn btn-small btn-ghost" disabled={busy || cache.clips === 0} onClick={() => void clear()}>
          {t('voice.clearClips')}
        </button>
      </div>
    </div>
  );
}

export function VoiceSettings() {
  const t = useT();
  const voice = useStore((s) => s.settings.voice);
  const keySet = useStore((s) => s.voiceKeySet);
  const cache = useStore((s) => s.voiceCache);
  const [playing, setPlaying] = useState<Playing>(null);
  const radioName = useId();
  useEffect(() => stopVoice, []); // closing the console stops a preview
  const save: Save = (patch) => void api.updateSettings({ voice: { ...voice, ...patch } }).catch(() => undefined);
  const eleven = voice.provider === 'elevenlabs';
  const canTest = voice.provider === 'browser' || (eleven && keySet && !!voice.voiceId);
  const providers: [VoiceProvider, string, string][] = [
    ['off', t('voice.off'), ''],
    ['browser', t('voice.browser'), t('voice.browserNote')],
    ['elevenlabs', t('voice.elevenlabs'), t('voice.elevenNote')],
  ];
  const test = async () => {
    if (playing === 'test') return stopVoice();
    hintMuted();
    setPlaying('test');
    try {
      const ok = eleven ? await playClip(await api.voiceSample(voice.voiceId)) : await speakLine(t('ui.voice.sample'), voice.voiceName);
      if (!ok) useStore.getState().pushToast('error', eleven ? t('voice.cantPlayTest') : t('voice.browserCantTest'));
    } catch {
      // api already toasted the error
    } finally {
      setPlaying(null);
    }
  };
  return (
    <div className="card">
      <h3>{t('voice.title')}</h3>
      <p className="muted small">{t('voice.desc')}</p>
      <div role="radiogroup" aria-labelledby={`${radioName}-label`}>
        <div id={`${radioName}-label`} className="field">
          {t('voice.speak')}
        </div>
        {providers.map(([p, label, note]) => (
          <label key={p} className="toggle block">
            <input type="radio" name={radioName} checked={voice.provider === p} onChange={() => save({ provider: p })} />
            <span>
              <b>{label}</b>
              {note && ` (${note})`}
            </span>
          </label>
        ))}
      </div>
      {eleven && (
        <>
          {t('help.locale') === 'de' ? (
            <p className="muted small">
              Einen Schlüssel gibt es auf{' '}
              <a href="https://elevenlabs.io" target="_blank" rel="noreferrer">
                elevenlabs.io
              </a>{' '}
              (Developers → API Keys). Er bleibt auf diesem PC und wird nie wieder angezeigt. Kosten und Tipps zu Stimmen stehen in{' '}
              <a href={DOCS} target="_blank" rel="noreferrer">
                docs/voice.md
              </a>
              .
            </p>
          ) : (
            <p className="muted small">
              Get a key at{' '}
              <a href="https://elevenlabs.io" target="_blank" rel="noreferrer">
                elevenlabs.io
              </a>{' '}
              (Developers → API Keys). It stays on this PC and is never shown again. Costs and voice tips are in{' '}
              <a href={DOCS} target="_blank" rel="noreferrer">
                docs/voice.md
              </a>
              .
            </p>
          )}
          <ElevenLabsKey />
          {keySet && <ElevenLabsVoices voice={voice} save={save} playing={playing} setPlaying={setPlaying} />}
        </>
      )}
      {voice.provider === 'browser' && <BrowserVoices voice={voice} save={save} />}
      {voice.provider !== 'off' && (
        <>
          <label className="toggle">
            <input type="checkbox" checked={voice.speakOffice} onChange={(e) => save({ speakOffice: e.target.checked })} /> {t('voice.speakAlerts')}
          </label>
          <div className="row">
            <button className="btn btn-small" disabled={!canTest} onClick={() => void test()} title={canTest ? undefined : t('voice.testFirst')}>
              {playing === 'test' ? t('voice.stop') : t('voice.test')}
            </button>
            <span className="muted small">{t('voice.testNote')}</span>
          </div>
        </>
      )}
      {(eleven || cache.clips > 0) && <SavedClips voice={voice} save={save} />}
      <Listening keyShown={eleven} />
    </div>
  );
}

/** Talking instead of typing: who turns speech into text, sending when you stop talking, and the hands-free phone. */
function Listening({ keyShown }: { keyShown: boolean }) {
  const t = useT();
  const listen = useStore((s) => s.settings.listen);
  const keySet = useStore((s) => s.voiceKeySet);
  const voiceOn = useStore((s) => s.settings.voice.provider !== 'off');
  const ceoName = useStore((s) => s.agents[CEO_ID]?.name ?? 'the CEO');
  const radioName = useId();
  if (!listen) return null;
  const save = (patch: Partial<ListenSettings>) => void api.updateSettings({ listen: { ...listen, ...patch } }).catch(() => undefined);
  const why = listen.provider === 'off' ? '' : cantListen(listen.provider, micCaps(), keySet || listen.provider !== 'elevenlabs');
  const listeners: [ListenProvider, string, string][] = [
    ['off', t('voice.listen.off'), t('voice.listen.offNote')],
    ['browser', t('voice.listen.browser'), t('voice.listen.browserNote')],
    ['elevenlabs', t('voice.listen.elevenlabs'), t('voice.listen.elevenNote')],
  ];
  return (
    <div className="listen-settings">
      <h4>{t('voice.listen')}</h4>
      {t('help.locale') === 'de' ? (
        <p className="muted small">
          Das 🎙️ neben Senden halten (oder <Key action="talk" /> im Nachrichtenfeld halten) und sprechen: Wörter füllen das Feld, zum Bearbeiten vor dem Senden. Ein kurzes Tippen hört zu, bis du aufhörst zu sprechen. <kbd>Esc</kbd> beendet das Zuhören.
        </p>
      ) : (
        <p className="muted small">
          Hold the 🎙️ next to Send (or hold <Key action="talk" /> in the message box) and speak: your words fill the box, to edit before you send. A quick tap listens until you stop talking. <kbd>Esc</kbd> stops listening.
        </p>
      )}
      <div role="radiogroup" aria-labelledby={`${radioName}-label`}>
        <div id={`${radioName}-label`} className="field">
          {t('voice.speechToText')}
        </div>
        {listeners.map(([p, label, note]) => (
          <label key={p} className="toggle block">
            <input type="radio" name={radioName} checked={listen.provider === p} onChange={() => save({ provider: p })} />
            <span>
              <b>{label}</b> ({note})
            </span>
          </label>
        ))}
      </div>
      {why && <p className="term-error small">{why}</p>}
      {listen.provider === 'elevenlabs' && (
        <>
          <p className="muted small">{t('voice.elevenInfo')}</p>
          {!keyShown && <ElevenLabsKey />}
        </>
      )}
      {listen.provider !== 'off' && (
        <>
          <label className="toggle">
            <input type="checkbox" checked={listen.autoSend} onChange={(e) => save({ autoSend: e.target.checked })} /> {t('voice.autoSend')}
          </label>
          <label className="toggle" title={voiceOn ? undefined : t('voice.handsFreeTitle').replace('{ceo}', ceoName)}>
            <input type="checkbox" checked={listen.handsFree} disabled={!voiceOn && !listen.handsFree} onChange={(e) => void setHandsFree(e.target.checked, ceoName)} /> {t('voice.handsFree').replace('{ceo}', ceoName)}{!voiceOn && <span className="muted"> {t('voice.handsFreeNeeds')}</span>}
          </label>
        </>
      )}
    </div>
  );
}
