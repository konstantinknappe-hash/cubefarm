import { lazy, Suspense } from 'react';
import { t } from './i18n';
import { useMode } from './pocket/mode';
import { Captions, LiveRegions } from './ui/CaptionStrip';
import { ConfirmDialog } from './ui/Confirm';

// Each loads only when it's shown: a phone in pocket mode never fetches three.js.
const Office = lazy(() => import('./Office'));
const Pocket = lazy(() => import('./pocket/Pocket'));

export function App() {
  const mode = useMode((s) => s.mode);
  return (
    <>
      <Suspense fallback={<div className="app-loading">{t('ui.loadingOffice')}</div>}>{mode === 'pocket' ? <Pocket /> : <Office />}</Suspense>
      <ConfirmDialog />
      <Captions />
      <LiveRegions />
    </>
  );
}
