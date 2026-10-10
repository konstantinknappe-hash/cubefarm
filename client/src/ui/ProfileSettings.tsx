// The Settings tab's Profile section: how you appear to everyone else viewing the office (shared presence). Saved in
// this browser only; the server cleans the name again before anyone sees it.
import { NAME_MAX, VISITOR_COLORS } from '../../../shared/presence';
import { useProfile } from '../world/presence/profile';
import { useT } from '../i18n';

export function ProfileSettings() {
  const t = useT();
  const { name, color, appear, set } = useProfile();
  return (
    <div className="card">
      <h3>{t('profile.title')}</h3>
      <p className="muted small">{t('profile.desc')}</p>
      <label className="field">
        <span>{t('profile.yourName')}</span>
        <input
          key={name}
          defaultValue={name}
          maxLength={NAME_MAX}
          placeholder={t('profile.visitor')}
          onBlur={(e) => e.target.value !== name && set({ name: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </label>
      <div className="field">
        <span>{t('profile.yourColor')}</span>
        <div className="row wrap">
          {VISITOR_COLORS.map((c) => (
            <button key={c} type="button" className={`swatch ${c === color ? 'swatch-on' : ''}`} style={{ background: c }} onClick={() => set({ color: c })} title={c} aria-label={`${t('profile.yourColor')} ${c}`} />
          ))}
          <input type="color" value={color} onChange={(e) => set({ color: e.target.value })} title={t('profile.anyColor')} aria-label={t('profile.anyColor')} />
        </div>
      </div>
      <label className="toggle block">
        <input type="checkbox" checked={appear} onChange={(e) => set({ appear: e.target.checked })} />
        <span>
          <b>{t('profile.appear')}</b>{t('profile.appearHint')}
        </span>
      </label>
    </div>
  );
}
