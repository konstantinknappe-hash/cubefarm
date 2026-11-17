// Pocket mode's Approvals tab: everything waiting on the manager's decision. Team changes (new agents and let-gos, the
// phone's cards), stuck PRs with the Kanban's Retry QA / Send back / Merge / Close, and passed PRs on floors that don't
// merge on their own.
import { useState } from 'react';
import { api } from '../api';
import { t } from '../i18n';
import { useStore } from '../store';
import type { QaView, RepoView } from '../../../shared/types';
import { qaCardNote } from '../qaCard';
import { confirmDialog } from '../ui/Confirm';
import { Resume } from '../ui/Phone';
import { waitingOnYou } from './pocketData';

function PrCard({ repo, qa, ready }: { repo: RepoView; qa: QaView; ready?: boolean }) {
  const author = useStore((s) => (qa.devAgentId ? s.agents[qa.devAgentId] : undefined));
  const [busy, setBusy] = useState(false);
  const pr = repo.pulls.find((p) => p.number === qa.prNumber);
  if (!pr) return null;
  const { note, tone } = qaCardNote(qa, pr, repo.autoMerge);
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch {
      // api() already toasted
    } finally {
      setBusy(false);
    }
  };
  const merge = async () => {
    const ok = await confirmDialog(
      ready
        ? { icon: '🎉', title: t('kanban.mergeTitle.passed', { n: pr.number }), body: t('kanban.mergeBody.passed', { title: pr.title, branch: repo.defaultBranch }), confirm: t('kanban.mergeConfirm.passed') }
        : { tone: 'warn', title: t('kanban.mergeTitle.warn', { n: pr.number }), body: t('kanban.mergeBody.warn', { title: pr.title, branch: repo.defaultBranch }), confirm: t('kanban.mergeConfirm.warn') },
    );
    if (ok) await act(() => api.mergePull(repo.id, pr.number));
  };
  const sendBack = async () => {
    let text = '';
    const ok = await confirmDialog({
      icon: '🔧',
      title: t('kanban.sendBackTitle', { n: pr.number }),
      body: (
        <>
          <p>{t('kanban.sendBackBody')}</p>
          <input maxLength={1000} placeholder={t('ui.pocket.notePlaceholder')} aria-label={t('kanban.sendBackNoteAria')} onChange={(e) => (text = e.target.value)} />
        </>
      ),
      confirm: t('kanban.sendBackConfirm'),
    });
    if (ok) await act(() => api.sendBack(repo.id, pr.number, text.trim() || undefined));
  };
  const close = async () => {
    const ok = await confirmDialog({ tone: 'danger', title: t('kanban.closeTitle', { n: pr.number }), body: t('ui.pocket.closeBody', { title: pr.title }), confirm: t('kanban.closeConfirm') });
    if (ok) await act(() => api.closePull(repo.id, pr.number));
  };
  return (
    <div className={`pk-card pk-pr kcard-${tone ?? 'plain'}`} style={{ ['--accent' as string]: repo.color }}>
      <div className="pk-pr-head">
        <span className="floor-badge">{repo.floor}</span>
        <div className="grow">
          <a href={pr.url} target="_blank" rel="noreferrer">
            <b>PR #{pr.number}</b>
          </a>{' '}
          {pr.title}
          <div className="muted small">
            {repo.fullName.split('/')[1]}
            {author ? ` · ${t('ui.pocket.by', { name: author.name })}` : ''} · {t('ui.qa.round', { round: qa.round })} · {note}
          </div>
        </div>
      </div>
      {qa.summary && <div className="small pk-pr-summary">{qa.summary}</div>}
      {qa.commentUrl && (
        <a className="small" href={qa.commentUrl} target="_blank" rel="noreferrer">
          {t('kanban.qaReport')}
        </a>
      )}
      <div className="pk-actions">
        {!ready && (
          <button className="btn btn-small btn-good" disabled={busy} onClick={() => void act(() => api.sendToQa(repo.id, pr.number))}>
            {t('kanban.retryQa')}
          </button>
        )}
        {!ready && (
          <button className="btn btn-small" disabled={busy} onClick={() => void sendBack()}>
            {t('kanban.sendBackConfirm')}
          </button>
        )}
        <button className={`btn btn-small ${ready ? 'btn-good' : ''}`} disabled={busy || pr.isDraft} onClick={() => void merge()}>
          {ready ? t('kanban.merge') : t('kanban.mergeAnyway')}
        </button>
        <button className="btn btn-small btn-ghost" disabled={busy} onClick={() => void close()}>
          {t('kanban.close')}
        </button>
      </div>
    </div>
  );
}

export function Approvals() {
  const repos = useStore((s) => s.repos);
  const qa = useStore((s) => s.qa);
  const requests = useStore((s) => s.requests);
  const w = waitingOnYou(repos, qa, requests);
  const nothing = w.requests.length + w.stuck.length + w.ready.length === 0;
  return (
    <div className="pk-page">
      {nothing && <p className="pk-empty">{t('ui.pocket.nothing')}</p>}
      {w.requests.length > 0 && <h3 className="pk-h">{t('ui.pocket.teamChanges')}</h3>}
      {w.requests.map((r) => (
        <Resume key={r.id} req={r} />
      ))}
      {w.stuck.length > 0 && <h3 className="pk-h">{t('ui.pocket.stuck')}</h3>}
      {w.stuck.map((s) => (
        <PrCard key={`${s.repo.id}#${s.qa.prNumber}`} repo={s.repo} qa={s.qa} />
      ))}
      {w.ready.length > 0 && <h3 className="pk-h">{t('world.board.ready')}</h3>}
      {w.ready.map((s) => (
        <PrCard key={`${s.repo.id}#${s.qa.prNumber}`} repo={s.repo} qa={s.qa} ready />
      ))}
    </div>
  );
}
