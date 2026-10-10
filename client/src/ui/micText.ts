// The words around the 🎙 (mic.ts): tidying a transcript, putting it in the message box, and one friendly line for
// each way listening can fail. Pure, so it's tested without a browser.
import { t } from '../../../shared/i18n';
import type { ListenProvider } from '../../../shared/types';

/** A transcript tidied for the message box: single spaces, no "(laughter)" or "[music]" tags, a capital first letter. */
export function cleanTranscript(raw: string, capital = true): string {
  const t = raw
    .replace(/[([](?:laughter|laughs|music|applause|noise|silence|inaudible|cough(?:ing)?|background noise|sound)[)\]]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return capital ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

/** The message box with what was heard after what was already there: one space between, a capital after a full stop. */
export function withTranscript(before: string, heard: string): string {
  const kept = before.replace(/\s+$/, '');
  const words = cleanTranscript(heard, !kept || /[.!?]$/.test(kept));
  if (!words) return before;
  return kept ? `${kept} ${words}` : words;
}

/** One phrase of the browser's recognition: its best guess, and whether it's settled. */
export interface Phrase {
  transcript: string;
  final: boolean;
}

/** The browser's results as one transcript, and whether it's still hearing words (an unsettled phrase). */
export function phrasesText(phrases: readonly Phrase[]): { text: string; speaking: boolean } {
  return { text: phrases.map((p) => p.transcript.trim()).filter(Boolean).join(' '), speaking: phrases.some((p) => !p.final && p.transcript.trim()) };
}

/**
 * A recognition or microphone error in one friendly line, or null when it needs none (stopped on purpose, nothing
 * said). Codes are SpeechRecognition's `error` or getUserMedia's DOMException names.
 */
export function micErrorLine(code: string): string | null {
  switch (code) {
    case 'aborted':
    case 'no-speech':
    case 'AbortError':
      return null;
    case 'not-allowed':
    case 'service-not-allowed':
    case 'NotAllowedError':
    case 'SecurityError':
      return t('ui.mic.blocked');
    case 'audio-capture':
    case 'NotFoundError':
    case 'NotReadableError':
    case 'OverconstrainedError':
      return t('ui.mic.noMic');
    case 'network':
      return t('ui.mic.network');
    case 'language-not-supported':
      return t('ui.mic.language');
    default:
      return t('ui.mic.stopped', { code });
  }
}

/** What this browser can do: recognise speech itself, and record audio for ElevenLabs. */
export interface MicCaps {
  recognition: boolean;
  recorder: boolean;
}

/** Why the 🎙 can't listen here, in one line, or '' when it can. */
export function cantListen(provider: ListenProvider, caps: MicCaps, keySet: boolean): string {
  if (provider === 'browser' && !caps.recognition) return t('ui.mic.noRecognition');
  if (provider === 'elevenlabs' && !caps.recorder) return t('ui.mic.noRecorder');
  if (provider === 'elevenlabs' && !keySet) return t('ui.mic.noKey');
  return '';
}
