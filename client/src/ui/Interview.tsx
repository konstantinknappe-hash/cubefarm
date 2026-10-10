import { useEffect, useState } from 'react';
import { api } from '../api';
import { useStore } from '../store';
import { CEO_ID } from '../../../shared/types';
import { Markdown } from './Markdown';
import { closeOverlay } from './Panel';
import { HireSetupFields, cliLabel, hireCli, hireOverrides, setupOf, type HireSetup } from './Phone';
import { CLAUDE_MODELS, effectiveModel } from '../../../shared/models';
import { useT } from '../i18n';

// A team change face to face (#227), as an office document: a new agent waiting in the lobby (E on them, world/
// Candidates.tsx), set up here before they're created (name, coding agent, model, effort), or the CEO's let-go note in
// the envelope on someone's desk. Hire / Decline (Let go / Keep) are the same decisions as the phone's and the
// console's, with a note the CEO reads. Deciding closes it, so the person's reaction plays out in front of you.

export function Interview({ requestId }: { requestId: string }) {
  const t = useT();
  const req = useStore((s) => s.requests.find((r) => r.id === requestId));
  const repo = useStore((s) => (req ? s.repos.find((r) => r.id === req.repoId) : undefined));
  const settings = useStore((s) => s.settings);
  const clis = useStore((s) => s.clis);
  const ceo = useStore((s) => s.agents[CEO_ID]?.name ?? 'the CEO');
  const [edited, setSetup] = useState<HireSetup | null>(null); // null: the CEO's picks, untouched
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      closeOverlay();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const company = settings.companyName || 'cubefarm';
  if (!req) {
    return (
      <div className="overlay interview-overlay" onMouseDown={(e) => e.target === e.currentTarget && closeOverlay()}>
        <div className="doc" role="dialog" aria-label={t('interview.aria.notFound')}>
          <div className="doc-head">
            <span>{t('interview.personnel').replace('{company}', company)}</span>
          </div>
          <p>{t('interview.noLonger')}</p>
          <div className="doc-actions">
            <span className="spacer" />
            <button className="btn btn-small" onClick={closeOverlay}>
              {t('interview.close')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const hire = req.kind === 'hire';
  const pending = req.status === 'pending';
  const setup = edited ?? setupOf(req);
  const name = (hire && pending && setup.name.trim()) || req.name;
  const repoName = repo?.fullName.split('/')[1] ?? repo?.fullName;
  const floor = repo && repoName
    ? t('interview.floorDesc').replace('{floor}', String(repo.floor)).replace('{name}', repoName)
    : t('interview.floorGone');
  const stamp = pending ? null : req.status === 'approved' ? (hire ? t('interview.stamp.hired') : t('interview.stamp.letGo')) : hire ? t('interview.stamp.declined') : t('interview.stamp.kept');
  const cli = hireCli(req.cli, settings);

  const decide = async (yes: boolean) => {
    setBusy(true);
    try {
      if (yes) await api.approveRequest(req.id, { ...(hire ? hireOverrides(req, setup) : {}), note: note.trim() });
      else await api.rejectRequest(req.id, note.trim());
      closeOverlay();
    } catch {
      setBusy(false); // api() already toasted why
    }
  };

  return (
    <div className="overlay interview-overlay" onMouseDown={(e) => e.target === e.currentTarget && closeOverlay()}>
      <div className={`doc ${hire ? '' : 'doc-letgo'}`} role="dialog" aria-label={hire ? t('interview.aria.hire').replace('{name}', name) : t('interview.aria.letGo').replace('{name}', req.name)}>
        <div className="doc-head">
          <span>{t('interview.personnel').replace('{company}', company)}</span>
          <span>{hire ? t('interview.newAgent') : t('interview.confidential')}</span>
        </div>
        <div className="doc-who">
          <span className="avatar" style={{ background: req.color, width: 48, height: 48, fontSize: 22 }}>
            {name[0]}
          </span>
          <div className="grow">
            <h2 className="doc-title">{hire ? name : t('resume.letGo').replace('{name}', req.name)}</h2>
            <div className="muted">{hire ? t('interview.joining').replace('{floor}', floor) : t('interview.on').replace('{floor}', floor)}</div>
          </div>
          <button className="panel-x" onClick={closeOverlay} aria-label={t('interview.close')}>
            ✕
          </button>
        </div>
        {stamp && <div className={`doc-stamp ${req.status === 'approved' ? 'doc-stamp-good' : 'doc-stamp-bad'}`}>{stamp}</div>}
        <h3 className="doc-h">{hire ? t('interview.whyCeo').replace('{ceo}', ceo) : t('interview.ceoNote').replace('{ceo}', ceo)}</h3>
        <Markdown className="doc-pitch" text={req.reason || t('interview.noReason')} />
        <div className="doc-sign">{t('interview.sign').replace('{ceo}', ceo)}</div>
        {hire && <h3 className="doc-h">{t('interview.theirSetup')}</h3>}
        {hire && pending && (
          <>
            <HireSetupFields value={setup} onChange={setSetup} disabled={busy} />
            <p className="muted small doc-tip">{t('interview.tip').replace('{name}', name)}</p>
          </>
        )}
        {hire && !pending && (
          <dl className="doc-fields">
            <dt>{t('interview.codingAgent')}</dt>
            <dd>{cliLabel(clis, cli)}</dd>
            <dt>{t('interview.model')}</dt>
            <dd>{effectiveModel(req.model, cli, settings, CLAUDE_MODELS[0]) || t('interview.defaultModel')}</dd>
            <dt>{t('interview.effort')}</dt>
            <dd>{req.effort || settings.defaultEffort}</dd>
          </dl>
        )}
        {pending ? (
          <>
            <h3 className="doc-h">{t('interview.yourNote')}</h3>
            <textarea
              className="doc-note"
              rows={2}
              maxLength={400}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={hire ? t('interview.placeholderHire').replace('{name}', name).replace('{ceo}', ceo) : t('interview.placeholderLetGo').replace('{ceo}', ceo)}
              aria-label={t('interview.noteAria')}
            />
            <div className="doc-actions">
              <button className="btn btn-bad" disabled={busy} onClick={() => void decide(false)}>
                {hire ? t('interview.decline') : t('interview.keepThem')}
              </button>
              <span className="spacer" />
              <button className="btn btn-good" disabled={busy} onClick={() => void decide(true)}>
                {hire ? t('interview.hireBtn').replace('{name}', name) : t('interview.letGoBtn').replace('{name}', req.name)}
              </button>
            </div>
          </>
        ) : (
          <div className="doc-actions">
            {req.note && <span className="muted small">{t('interview.yourNoteText').replace('{note}', req.note)}</span>}
            <span className="spacer" />
            <button className="btn btn-small" onClick={closeOverlay}>
              {t('interview.close')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
