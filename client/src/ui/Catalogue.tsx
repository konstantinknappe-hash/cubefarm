// The lobby kiosk's decoration catalogue (#210): a floor's coins buy decorations for it, which wait in the floor's
// decor box; and the decor box's own panel, to take one out to place, or move or put away what's placed.
import { useState } from 'react';
import { CATALOGUE, COINS, DECOR_SLOTS, priceOf, slotsOfKind, stored, type DecorItem, type DecorKind, type FloorProgressView } from '../../../shared/progress';
import { api } from '../api';
import { t } from '../i18n';
import { useStore } from '../store';
import { carry, decorBlurb, decorName, kaching } from '../world/decor/actions';
import { slotName } from '../world/decor/decor';
import { Key } from './Key';
import { Panel } from './Overlays';

const EMPTY: FloorProgressView = { coins: 0, earned: 0, merges: 0, owned: {}, placed: {}, firstPr: null };

/** How many decorations of a kind the floor owns, against how many slots it has for them. */
function room(floor: FloorProgressView, kind: DecorKind) {
  const owned = CATALOGUE.filter((c) => c.kind === kind).reduce((n, c) => n + (floor.owned[c.id] ?? 0), 0);
  return slotsOfKind(kind) - owned;
}

export function Catalogue({ repoId }: { repoId?: string }) {
  const repos = useStore((s) => s.repos);
  const floors = useStore((s) => s.progress.floors);
  const [pick, setPick] = useState(repoId ?? repos[0]?.id ?? '');
  const [busy, setBusy] = useState<DecorItem | null>(null);
  const repo = repos.find((r) => r.id === pick) ?? repos[0];
  const floor = (repo && floors[repo.id]) || EMPTY;
  const buy = async (item: DecorItem) => {
    if (!repo) return;
    setBusy(item);
    try {
      await api.buyDecor(repo.id, item);
      kaching();
      useStore.getState().pushToast('success', t('ui.shop.bought', { name: decorName(item), floor: repo.floor }));
    } catch {
      // api toasted it
    } finally {
      setBusy(null);
    }
  };
  return (
    <Panel title={t('ui.shop.title')} accent={repo?.color} className="catalogue">
      {!repo ? (
        <p className="muted">{t('ui.shop.noRepo')}</p>
      ) : (
        <>
          <div className="tabs catalogue-floors">
            {repos.map((r) => (
              <button key={r.id} className={`tab ${r.id === repo.id ? 'tab-on' : ''}`} onClick={() => setPick(r.id)} style={{ ['--accent' as string]: r.color }}>
                <span className="floor-badge">{r.floor}</span> {r.fullName.split('/')[1]} · 🪙 {floors[r.id]?.coins ?? 0}
              </button>
            ))}
          </div>
          <div className="catalogue-purse">
            <b className="catalogue-coins">🪙 {floor.coins}</b>
            <span className="muted small">
              {t('ui.shop.purse', { count: floor.merges, earned: floor.earned, merge: COINS.merge, firstQa: COINS.firstQa, greenCi: COINS.greenCi, streak: COINS.streak })}
            </span>
          </div>
          <div className="catalogue-grid">
            {CATALOGUE.map((c) => {
              const owned = floor.owned[c.id] ?? 0;
              const price = priceOf(c.id, owned);
              const full = room(floor, c.kind) <= 0;
              const poor = floor.coins < price;
              return (
                <div key={c.id} className={`catalogue-item ${full || poor ? 'catalogue-off' : ''}`}>
                  <div className="catalogue-icon">{c.icon}</div>
                  <b>{decorName(c.id)}</b>
                  <div className="muted small">{decorBlurb(c.id)}</div>
                  <div className="small">
                    {owned ? t('ui.shop.owned', { n: owned, box: stored(floor, c.id) }) : <span className="muted">{t(`ui.shop.kind.${c.kind}`)}</span>}
                  </div>
                  <button className="btn btn-small btn-good" disabled={full || poor || busy !== null} onClick={() => void buy(c.id)} title={full ? t('ui.shop.full') : poor ? t('ui.shop.poor') : undefined}>
                    {busy === c.id ? '…' : full ? t('ui.shop.noRoom') : `🪙 ${price}`}
                  </button>
                </div>
              );
            })}
          </div>
          <p className="muted small">
            {t('ui.shop.help1')} <Key action="interact" />{t('ui.shop.help2')} <Key action="interact" /> {t('ui.shop.help3')} <Key action="drop" /> {t('ui.shop.help4')}
          </p>
        </>
      )}
    </Panel>
  );
}

export function DecorBoxPanel({ repoId }: { repoId: string }) {
  const repo = useStore((s) => s.repos.find((r) => r.id === repoId));
  const floor = useStore((s) => s.progress.floors[repoId]) ?? EMPTY;
  const [busy, setBusy] = useState(false);
  if (!repo) return null;
  const inBox = CATALOGUE.filter((c) => stored(floor, c.id) > 0);
  const placed = DECOR_SLOTS.filter((d) => floor.placed[d.id]);
  const putAway = async (slot: string, item: DecorItem) => {
    setBusy(true);
    try {
      await api.placeDecor(repo.id, { item, slot: null, from: slot });
    } catch {
      // api toasted it
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title={t('ui.shop.boxTitle', { floor: repo.floor })} accent={repo.color} className="decor-box">
      <h3>{t('ui.shop.inBox')}</h3>
      {inBox.length === 0 ? (
        <p className="muted small">{t('ui.shop.emptyBox', { coins: floor.coins })}</p>
      ) : (
        <div className="decor-list">
          {inBox.map((c) => (
            <div key={c.id} className="decor-row">
              <span className="catalogue-icon small-icon">{c.icon}</span>
              <span className="grow">
                {decorName(c.id)} {stored(floor, c.id) > 1 && <span className="muted">×{stored(floor, c.id)}</span>}
              </span>
              <button className="btn btn-small btn-good" onClick={() => carry(c.id, null)}>
                {t('ui.shop.carry')}
              </button>
            </div>
          ))}
        </div>
      )}
      <h3>{t('ui.shop.onFloor')}</h3>
      {placed.length === 0 ? (
        <p className="muted small">{t('ui.shop.nothingPlaced')}</p>
      ) : (
        <div className="decor-list">
          {placed.map((d) => {
            const item = floor.placed[d.id];
            return (
              <div key={d.id} className="decor-row">
                <span className="catalogue-icon small-icon">{CATALOGUE.find((c) => c.id === item)?.icon}</span>
                <span className="grow">
                  {decorName(item)} <span className="muted small">· {slotName(d.id)}</span>
                </span>
                <button className="btn btn-small" onClick={() => carry(item, d.id)}>
                  {t('ui.shop.move')}
                </button>
                <button className="btn btn-small btn-ghost" disabled={busy} onClick={() => void putAway(d.id, item)}>
                  {t('ui.shop.putAway')}
                </button>
              </div>
            );
          })}
        </div>
      )}
      <p className="muted small">
        {t('ui.shop.carrying1')} <Key action="interact" />. <Key action="drop" /> {t('ui.shop.carrying2')}
      </p>
    </Panel>
  );
}
