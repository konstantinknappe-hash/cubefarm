// Settings → Notifications (docs/pocket.md): which events, the office URL messages link to, this device (desktop
// notifications, Web Push) and ntfy. Its topic URL and token are write-only: the browser sees a hint of them.
import { useEffect, useId, useState } from 'react';
import { api } from '../api';
import { useStore } from '../store';
import { NOTIFY_EVENTS } from '../../../shared/notify';
import type { NotifyChannel, NotifySettings as Notify, NotifyWebhook } from '../../../shared/types';
import { confirmDialog } from './Confirm';
import { showTestNote } from '../notifications';
import { currentPush, disablePush, enablePush, pushSupport } from '../pwa';
import { useT } from '../i18n';

const DOCS = 'https://github.com/leonvanzyl/cubefarm/blob/main/docs/pocket.md';

type Field = { key: string; label: string; placeholder: string; secret: boolean; optional?: boolean };

type Save = (patch: Partial<Notify>) => void;

/** A Test button's answer, shown beside it. */
function useTest(channel: NotifyChannel) {
  const t = useT();
  const [state, setState] = useState<{ busy: boolean; result: string | null; ok: boolean }>({ busy: false, result: null, ok: false });
  const run = async () => {
    setState({ busy: true, result: null, ok: false });
    try {
      await api.testNotify(channel);
      setState({ busy: false, result: t('notify.sent'), ok: true });
    } catch (err) {
      setState({ busy: false, result: err instanceof Error ? err.message : String(err), ok: false });
    }
  };
  return { ...state, run };
}

function TestResult({ result, ok }: { result: string | null; ok: boolean }) {
  if (!result) return null;
  return (
    <span className={`small ${ok ? 'notify-ok' : 'term-error'}`} role="status">
      {result}
    </span>
  );
}

function WebhookRow({ hook, notify, save }: { hook: { id: NotifyWebhook; label: string; help: string; fields: Field[] }; notify: Notify; save: Save }) {
  const t = useT();
  const view = useStore((s) => s.notifyChannels.webhooks[hook.id]);
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const test = useTest(hook.id);
  const errorId = useId();
  const store = async (body: Record<string, string>) => {
    setBusy(true);
    setError('');
    try {
      await api.setWebhook(hook.id, body);
      setValues({}); // never kept or shown again once saved
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  const on = notify.channels[hook.id];
  return (
    <div className="notify-hook">
      <div className="row wrap">
        <b className="grow">{hook.label}</b>
        {view.set && (
          <label className="toggle small">
            <input type="checkbox" checked={on} onChange={(e) => save({ channels: { ...notify.channels, [hook.id]: e.target.checked } })} /> {t('notify.on')}
          </label>
        )}
      </div>
      {view.set && !editing ? (
        <div className="row wrap">
          <span className="grow small">
            {t('notify.saved')} <code>{view.hint}</code>
          </span>
          <button className="btn btn-small" disabled={test.busy} onClick={() => void test.run()}>
            {test.busy ? t('notify.sending') : t('notify.testBtn')}
          </button>
          <button className="btn btn-small btn-ghost" onClick={() => setEditing(true)}>
            {t('notify.replace')}
          </button>
          <button
            className="btn btn-small btn-ghost"
            disabled={busy}
            onClick={() =>
              void confirmDialog({ tone: 'danger', title: t('notify.removeTitle').replace('{hook}', hook.label), body: t('notify.removeBody'), confirm: t('notify.removeConfirm') }).then((ok) => {
                if (ok) void store({});
              })
            }
          >
            {t('notify.remove')}
          </button>
          <TestResult result={test.result} ok={test.ok} />
        </div>
      ) : (
        <form
          className="notify-form"
          onSubmit={(e) => {
            e.preventDefault();
            void store(values);
          }}
        >
          <p className="muted small">{hook.help}</p>
          {hook.fields.map((f) => (
            <label key={f.key} className="field">
              <span>{f.label}</span>
              <input
                type={f.secret ? 'password' : 'text'}
                value={values[f.key] ?? ''}
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                placeholder={f.placeholder}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={!!error}
                aria-describedby={error ? errorId : undefined}
              />
            </label>
          ))}
          {error && (
            <div id={errorId} className="term-error small" role="alert">
              {error}
            </div>
          )}
          <div className="row">
            <button className="btn btn-small btn-good" disabled={busy || hook.fields.some((f) => !f.optional && !values[f.key]?.trim())}>
              {busy ? t('notify.saving') : t('notify.save')}
            </button>
            {editing && (
              <button
                type="button"
                className="btn btn-small btn-ghost"
                onClick={() => {
                  setEditing(false);
                  setValues({});
                  setError('');
                }}
              >
                {t('notify.cancel')}
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

const permissionNow = (): NotificationPermission | 'unsupported' => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);

/** Desktop notifications and Web Push, for the device this page is open on. */
function ThisDevice({ notify, save }: { notify: Notify; save: Save }) {
  const t = useT();
  const devices = useStore((s) => s.notifyChannels.pushDevices);
  const [permission, setPermission] = useState(permissionNow);
  const [here, setHere] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pushTest = useTest('push');
  const support = typeof window === 'undefined' ? 'unsupported' : pushSupport();
  useEffect(() => {
    if (support === 'ok') void currentPush().then((s) => setHere(!!s), () => setHere(false));
  }, [support, devices]);
  const allow = async () => setPermission(await Notification.requestPermission());
  const togglePush = async (on: boolean) => {
    setBusy(true);
    setError('');
    try {
      if (on) await enablePush();
      else await disablePush();
      setHere(on);
      setPermission(permissionNow());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="notify-hook">
        <div className="row wrap">
          <b className="grow">{t('notify.desktop')}</b>
          <label className="toggle small">
            <input type="checkbox" checked={notify.channels.desktop} onChange={(e) => save({ channels: { ...notify.channels, desktop: e.target.checked } })} /> {t('notify.on')}
          </label>
        </div>
        <p className="muted small">{t('notify.desktopDesc')}</p>
        <div className="row wrap">
          {permission === 'granted' && <span className="small grow">{t('notify.allowed')}</span>}
          {permission === 'denied' && <span className="small grow term-error">{t('notify.denied')}</span>}
          {permission === 'unsupported' && <span className="small grow muted">{t('notify.unsupported')}</span>}
          {permission === 'default' && (
            <button className="btn btn-small btn-good" onClick={() => void allow()}>
              {t('notify.allowBtn')}
            </button>
          )}
          {permission === 'granted' && (
            <button className="btn btn-small" onClick={() => void showTestNote()}>
              {t('notify.testBtn')}
            </button>
          )}
        </div>
      </div>
      <div className="notify-hook">
        <div className="row wrap">
          <b className="grow">{t('notify.push')}</b>
          <label className="toggle small">
            <input type="checkbox" checked={notify.channels.push} onChange={(e) => save({ channels: { ...notify.channels, push: e.target.checked } })} /> {t('notify.on')}
          </label>
        </div>
        <p className="muted small">
          {t('notify.pushDesc')} {devices ? t('notify.pushDevices', { count: devices }) : t('notify.pushNone')}
        </p>
        {support === 'insecure' && (
          <p className="small term-error">
            {t('notify.pushInsecure')} <a href={DOCS}>docs/pocket.md</a>.
          </p>
        )}
        {support === 'unsupported' && <p className="small muted">{t('notify.pushUnsupported')}</p>}
        {support === 'dev' && <p className="small muted">{t('notify.pushDev')}</p>}
        {support === 'ok' && (
          <div className="row wrap">
            {here ? (
              <button className="btn btn-small btn-ghost" disabled={busy} onClick={() => void togglePush(false)}>
                {t('notify.pushStop')}
              </button>
            ) : (
              <button className="btn btn-small btn-good" disabled={busy || here === null} onClick={() => void togglePush(true)}>
                {busy ? t('notify.pushSigning') : t('notify.pushStart')}
              </button>
            )}
            <button className="btn btn-small" disabled={pushTest.busy || !devices} onClick={() => void pushTest.run()}>
              {t('notify.sendTest')}
            </button>
            <TestResult result={pushTest.result} ok={pushTest.ok} />
          </div>
        )}
        {error && (
          <div className="term-error small" role="alert">
            {error}
          </div>
        )}
      </div>
    </>
  );
}

export function NotifySettings() {
  const t = useT();
  const notify = useStore((s) => s.settings.notify);
  const [url, setUrl] = useState(notify.officeUrl);
  useEffect(() => setUrl(notify.officeUrl), [notify.officeUrl]);
  const save: Save = (patch) => void api.updateSettings({ notify: { ...notify, ...patch } }).catch(() => undefined);

  const webhooks: { id: NotifyWebhook; label: string; help: string; fields: Field[] }[] = [
    {
      id: 'ntfy',
      label: 'ntfy',
      help: t('notify.ntfy.help'),
      fields: [
        { key: 'url', label: t('notify.ntfy.urlLabel'), placeholder: 'https://ntfy.sh/my-office-7f3k9q', secret: true },
        { key: 'token', label: t('notify.ntfy.tokenLabel'), placeholder: 'tk_…', secret: true, optional: true },
      ],
    },
  ];

  return (
    <div className="card notify-settings">
      <h3>{t('notify.title')}</h3>
      <p className="muted small">{t('notify.desc')}</p>
      <div className="notify-events" role="group" aria-label={t('notify.tellMeWhen')}>
        {NOTIFY_EVENTS.map((e) => (
          <label key={e.id} className="toggle block">
            <input type="checkbox" checked={notify.events[e.id]} onChange={(ev) => save({ events: { ...notify.events, [e.id]: ev.target.checked } })} />
            <span>{e.label}</span>
          </label>
        ))}
      </div>
      <label className="field">
        <span>{t('notify.officeUrl')}</span>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={() => url.trim() !== notify.officeUrl && save({ officeUrl: url.trim() })}
          placeholder="https://office.your-tailnet.ts.net"
          inputMode="url"
        />
      </label>
      <h4 className="notify-h">{t('notify.thisDevice')}</h4>
      <ThisDevice notify={notify} save={save} />
      <h4 className="notify-h">{t('notify.phoneApp')}</h4>
      {webhooks.map((h) => (
        <WebhookRow key={h.id} hook={h} notify={notify} save={save} />
      ))}
      <p className="muted small">
        {t('notify.docsNote')} <a href={DOCS}>docs/pocket.md</a>.
      </p>
    </div>
  );
}
