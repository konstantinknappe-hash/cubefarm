import { useEffect } from 'react';
import { api } from '../api';
import { fmtDuration, fmtPct, fmtUsd, usageMeter } from '../ops';
import { useStore } from '../store';
import type { DoctorFinding, DoctorFix, OpsAlarm, OpsNumbers, RepoView } from '../../../shared/types';
import { confirmDialog } from './Confirm';
import { t, useT } from '../i18n';

// The manager's console → Mission control: Claude's usage with "Resume full speed", what needs you (the alarms the
// lobby wall's beacon rings for), the office doctor's findings with their one-click fixes, and every floor's numbers
// from the wall as a table.

async function attempt<T>(fn: () => Promise<T>) {
  try {
    return await fn();
  } catch {
    return undefined; // api() already toasted the error
  }
}

/** "Resume full speed": asks first, then clears pacing. From the console's button and E on the lobby's usage meter. */
export async function confirmResume() {
  const { usage, settings } = useStore.getState();
  if (usage.state !== 'pacing') return;
  if (document.pointerLockElement) document.exitPointerLock();
  const m = usageMeter(usage, Date.now());
  const ok = await confirmDialog({
    icon: '⏩',
    tone: 'warn',
    title: t('ops.pauseTitle'),
    body: (
      <>
        <p>
          {t('ops.resumeConfirm.body1')
            .replace('{limit}', usage.warning ? ` (${m.limit})` : '')
            .replace('{resets}', m.resets ?? '')
            .replace('{n}', String(settings.pacingSessions))
            .replace('{s}', settings.pacingSessions === 1 ? '' : 's')}
        </p>
        <p>{t('ops.resumeConfirm.body2')}</p>
      </>
    ),
    confirm: t('ops.resumeConfirm.confirm'),
  });
  if (ok) await attempt(() => api.resumeFullSpeed());
}

function UsageCard({ hot }: { hot: boolean }) {
  const t = useT();
  const usage = useStore((s) => s.usage);
  const sessions = useStore((s) => s.settings.pacingSessions);
  const demo = useStore((s) => s.demo);
  const m = usageMeter(usage, Date.now());
  const why =
    usage.state === 'pacing'
      ? t('ops.pacing').replace('{resets}', m.resets ?? '').replace('{n}', String(sessions)).replace('{s}', sessions === 1 ? '' : 's')
      : usage.state === 'paused'
        ? t('ops.paused').replace('{resets}', m.resets ?? '')
        : t('ops.normal');
  return (
    <div id="ops-card-usage" className={`card usage-card usage-${m.tone} ${hot ? 'ops-card-hot' : ''}`}>
      <div className="row wrap">
        <b>{t('ops.usage')}</b>
        <span className={`pill usage-pill-${m.tone}`}>{m.state}</span>
        <span className="spacer" />
        <button
          className="btn btn-small btn-good"
          disabled={usage.state !== 'pacing'}
          title={usage.state === 'paused' ? t('ops.cantClear') : usage.state === 'normal' ? t('ops.atFullSpeed') : t('ops.stopPacing')}
          onClick={() => void confirmResume()}
        >
          {t('ops.resume')}
        </button>
      </div>
      <div className="usage-gauge" role="meter" aria-label={t('ops.gauge.aria')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={m.pct ?? 0}>
        <div style={{ width: `${Math.min(100, m.pct ?? 0)}%`, background: (m.pct ?? 0) >= 90 ? 'var(--bad)' : (m.pct ?? 0) >= 75 ? 'var(--warn)' : 'var(--good)' }} />
      </div>
      <div className="small">
        <b>{m.limit}</b>
        {m.resets && ` · resets ${m.resets}`}
      </div>
      <div className="muted small">{why}</div>
      {demo && (
        <div className="row wrap">
          <span className="muted small">{t('phone.demo')}</span>
          <button className="btn btn-small btn-ghost" onClick={() => void attempt(() => api.simulateUsage('warning'))}>
            {t('ops.demo.simWarn')}
          </button>
          <button className="btn btn-small btn-ghost" onClick={() => void attempt(() => api.simulateUsage('limit'))}>
            {t('ops.demo.simLimit')}
          </button>
        </div>
      )}
    </div>
  );
}

function AlarmCard({ alarm, repo, hot }: { alarm: OpsAlarm; repo: RepoView | undefined; hot: boolean }) {
  const t = useT();
  const openOverlay = useStore((s) => s.openOverlay);
  const goToFloor = useStore((s) => s.goToFloor);
  const pr = alarm.prNumber !== null ? repo?.pulls.find((p) => p.number === alarm.prNumber) : undefined;
  return (
    <div id={`ops-card-${alarm.id}`} className={`card floor-card alarm-card ${hot ? 'ops-card-hot' : ''}`} style={{ ['--accent' as string]: repo?.color ?? '#ef476f' }}>
      <div className="row">
        <span className="floor-badge">{alarm.floor}</span>
        <div className="grow">
          <b>🚨 {alarm.text}</b>
          <div className="muted small">
            {repo?.fullName ?? alarm.repoId}
            {pr ? ` · ${pr.title}` : ''} · {t('ops.since').replace('{time}', new Date(alarm.since).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}
          </div>
        </div>
      </div>
      <div className="row wrap">
        {alarm.kind === 'pr' && alarm.prNumber !== null ? (
          <>
            <button className="btn btn-small" onClick={() => openOverlay({ kind: 'kanban', repoId: alarm.repoId })}>
              {t('ops.kanban')}
            </button>
            <button className="btn btn-small btn-good" onClick={() => void attempt(() => api.sendToQa(alarm.repoId, alarm.prNumber!))}>
              {t('ops.retryQa')}
            </button>
            <button className="btn btn-small" title={t('ops.sendBackHint')} onClick={() => void attempt(() => api.sendBack(alarm.repoId, alarm.prNumber!))}>
              {t('ops.sendBack')}
            </button>
            {pr && (
              <a className="small" href={pr.url} target="_blank" rel="noreferrer">
                {t('ops.prGitHub')}
              </a>
            )}
          </>
        ) : (
          alarm.agentId && (
            <>
              <button className="btn btn-small" onClick={() => openOverlay({ kind: 'terminal', agentId: alarm.agentId! })}>
                {t('ops.terminal')}
              </button>
              <button className="btn btn-small btn-good" title={t('ops.clearDeskHint')} onClick={() => void attempt(() => api.reset(alarm.agentId!))}>
                {t('ops.clearDesk')}
              </button>
            </>
          )
        )}
        <span className="spacer" />
        <button className="btn btn-small btn-ghost" onClick={() => goToFloor(alarm.floor)}>
          {t('ops.visitFloor').replace('{floor}', String(alarm.floor))}
        </button>
      </div>
    </div>
  );
}

async function applyFix(f: DoctorFinding, fix: DoctorFix) {
  if (fix === 'close-issue') {
    if (document.pointerLockElement) document.exitPointerLock();
    const ok = await confirmDialog({
      icon: '🩺',
      tone: 'warn',
      title: t('ops.close.title').replace('{n}', String(f.issueNumber)),
      body: <p>{t('ops.close.body').replace('{pr}', String(f.prNumber))}</p>,
      confirm: t('ops.close.confirm'),
    });
    if (!ok) return;
  }
  await attempt(() => api.doctorFix(f.id, fix));
}

function DoctorCard({ finding: f, repo }: { finding: DoctorFinding; repo: RepoView | undefined }) {
  const t = useT();
  const fixes: Record<DoctorFix, [string, string]> = {
    clear: [t('ops.fix.clear'), t('ops.clearDeskHint')],
    stop: [t('ops.fix.stop'), t('ops.fix.stopHint')],
    requeue: [t('ops.fix.requeue'), t('ops.fix.requeueHint')],
    'retry-qa': [t('ops.fix.retryQa'), t('ops.retryQa')],
    'send-back': [t('ops.fix.sendBack'), t('ops.fix.sendBackHint')],
    'close-issue': [t('ops.fix.closeIssue'), t('ops.fix.closeIssueHint')],
  };
  const openOverlay = useStore((s) => s.openOverlay);
  return (
    <div id={`ops-card-doctor-${f.id}`} className="card floor-card alarm-card doctor-card" style={{ ['--accent' as string]: repo?.color ?? '#7c6cf0' }}>
      <div className="row">
        <span className="floor-badge">{repo?.floor ?? '?'}</span>
        <div className="grow">
          <b>🩺 {f.text}</b>
          <div className="muted small">
            {repo?.fullName ?? f.repoId} · {t('ops.since').replace('{time}', new Date(f.since).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}
          </div>
        </div>
      </div>
      <div className="row wrap">
        {f.fixes.map((fix, i) => (
          <button key={fix} className={`btn btn-small ${i === 0 ? 'btn-good' : ''}`} title={fixes[fix][1]} onClick={() => void applyFix(f, fix)}>
            {fixes[fix][0]}
          </button>
        ))}
        {f.agentId && (
          <button className="btn btn-small" onClick={() => openOverlay({ kind: 'terminal', agentId: f.agentId! })}>
            {t('ops.terminal')}
          </button>
        )}
        <span className="spacer" />
        <button className="btn btn-small btn-ghost" title={t('ops.fix.ignoreHint')} onClick={() => void attempt(() => api.doctorIgnore(f.id))}>
          {t('ops.fix.ignore')}
        </button>
      </div>
    </div>
  );
}

async function demoDoctor(action: Parameters<typeof api.demoDoctor>[0]) {
  const r = await attempt(() => api.demoDoctor(action));
  if (r) useStore.getState().pushToast('info', r.text);
}

function DoctorSection({ hot }: { hot: boolean }) {
  const t = useT();
  const doctor = useStore((s) => s.doctor);
  const repos = useStore((s) => s.repos);
  const demo = useStore((s) => s.demo);
  return (
    <div id="ops-card-doctor" className={hot ? 'ops-card-hot' : ''}>
      <h3 className="section">{t('ops.doctor')} {doctor.length > 0 && <span className="badge">{doctor.length}</span>}</h3>
      {doctor.length === 0 && (
        <p className="muted small">{t('ops.doctorOk')}</p>
      )}
      {doctor.map((f) => (
        <DoctorCard key={f.id} finding={f} repo={repos.find((r) => r.id === f.repoId)} />
      ))}
      {demo && (
        <div className="row wrap">
          <span className="muted small">{t('phone.demo')}</span>
          <button className="btn btn-small btn-ghost" title={t('ops.demo.restartHint')} onClick={() => void demoDoctor('restart')}>
            {t('ops.demo.restart')}
          </button>
          <button className="btn btn-small btn-ghost" title={t('ops.demo.stuckHint')} onClick={() => void demoDoctor('stuck')}>
            {t('ops.demo.stuck')}
          </button>
          <button className="btn btn-small btn-ghost" title={t('ops.demo.laterHint')} onClick={() => void demoDoctor('later')}>
            {t('ops.demo.later')}
          </button>
          <button className="btn btn-small btn-ghost" title={t('ops.demo.unclosedHint')} onClick={() => void demoDoctor('unclosed')}>
            {t('ops.demo.unclosed')}
          </button>
        </div>
      )}
    </div>
  );
}

function OpsTable() {
  const t = useT();
  const ops = useStore((s) => s.ops);
  const repos = useStore((s) => s.repos);
  const columns: [string, (n: OpsNumbers) => string, string?][] = [
    [t('ops.col.ready'), (n) => String(n.ready), t('ops.col.readyHint')],
    [t('ops.col.building'), (n) => String(n.building)],
    [t('ops.col.inQa'), (n) => String(n.inQa)],
    [t('ops.col.fixing'), (n) => String(n.fixing), t('ops.col.fixingHint')],
    [t('ops.col.toMerge'), (n) => String(n.toMerge)],
    [t('ops.col.needsYou'), (n) => `${n.needsYou}${n.triage ? ` (+${n.triage} 🧭)` : ''}`, t('ops.col.needsYouHint')],
    [t('ops.col.mergedToday'), (n) => t('ops.col.mergedToday.value').replace('{today}', String(n.mergedToday)).replace('{hour}', String(n.mergedHour))],
    [t('ops.col.leadTime'), (n) => fmtDuration(n.leadMs), t('ops.col.leadTimeHint')],
    [t('ops.col.qaWait'), (n) => fmtDuration(n.qaWaitMs), t('ops.col.qaWaitHint')],
    [t('ops.col.ci'), (n) => (n.ciRuns ? `${fmtPct(n.ciPass)} · ${fmtDuration(n.ciMs)}` : '—'), t('ops.col.ciHint')],
    [t('ops.col.team'), (n) => t('ops.col.team.value').replace('{busy}', String(n.busy)).replace('{idle}', String(n.idle)) + (n.errors ? t('ops.col.team.errors').replace('{errors}', String(n.errors)) : '')],
    [t('ops.col.cost'), (n) => `~${fmtUsd(n.costToday)}`, t('ops.col.costHint')],
  ];
  const rows: [string, string, OpsNumbers][] = [
    ...ops.floors.map((f): [string, string, OpsNumbers] => {
      const r = repos.find((x) => x.id === f.repoId);
      return [`${f.floor} · ${r?.fullName.split('/')[1] ?? f.repoId}`, r?.color ?? '#ccc', f];
    }),
    [t('ops.allFloors'), '#1f1d2b', ops.total],
  ];
  return (
    <div className="ops-table-wrap">
      <table className="ops-table">
        <thead>
          <tr>
            <th />
            {rows.map(([name, color]) => (
              <th key={name} style={{ ['--accent' as string]: color }} className="ops-col">
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {columns.map(([label, value, tip]) => (
            <tr key={label}>
              <th title={tip}>{label}</th>
              {rows.map(([name, , n]) => (
                <td key={name}>{value(n)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {ops.ceoCostToday > 0 && <div className="muted small">{t('ops.ceoCost').replace('{cost}', fmtUsd(ops.ceoCostToday))}</div>}
    </div>
  );
}

export function OpsTab({ card }: { card?: string }) {
  const t = useT();
  const alarms = useStore((s) => s.ops.alarms);
  const repos = useStore((s) => s.repos);
  useEffect(() => {
    if (card) document.getElementById(`ops-card-${card}`)?.scrollIntoView({ block: 'center' });
  }, [card]);
  return (
    <div className="tab-grid">
      <div>
        <UsageCard hot={card === 'usage'} />
        <h3 className="section">{t('ops.alarms')} {alarms.length > 0 && <span className="badge">{alarms.length}</span>}</h3>
        {alarms.length === 0 && <p className="muted small">{t('ops.allClear')}</p>}
        {alarms.map((a) => (
          <AlarmCard key={a.id} alarm={a} repo={repos.find((r) => r.id === a.repoId)} hot={a.id === card} />
        ))}
        <DoctorSection hot={card === 'doctor'} />
      </div>
      <div>
        <h3 className="section">{t('ops.numbers')}</h3>
        <OpsTable />
      </div>
    </div>
  );
}
