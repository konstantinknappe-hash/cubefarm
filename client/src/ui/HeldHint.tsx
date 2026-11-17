import { useEffect, useRef } from 'react';
import { useT } from '../i18n';
import { useStore } from '../store';
import { CHARGE, chargePower } from '../world/toys/hands';
import { BlasterHud } from './BlasterHud';
import { decorInSentence } from '../world/decor/actions';
import { Key } from './Key';
import { PongHud } from './PongHud';

/** The throw meter under the crosshair. Animates itself while charging; hidden during the first moments of a tap. */
function ChargeMeter({ at }: { at: number }) {
  const meter = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const ms = performance.now() - at;
      const p = chargePower(ms);
      if (meter.current) meter.current.className = `charge ${ms > CHARGE.tap ? 'charge-on' : ''} ${p >= 1 ? 'charge-full' : ''}`;
      if (fill.current) fill.current.style.transform = `scaleX(${p})`;
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [at]);
  return (
    <div ref={meter} className="charge">
      <div ref={fill} className="charge-fill" />
    </div>
  );
}

/** What you can do with what's in your hands. */
export function HeldHint() {
  const t = useT();
  const held = useStore((s) => s.held);
  const chargeAt = useStore((s) => s.chargeAt);
  if (!held) return null;
  if (held.kind === 'blaster') return <BlasterHud held={held} />;
  if (held.kind === 'sausage') {
    return (
      <div className="hud-hint hud-held">
        🌭 {t('ui.held.bites', { count: held.bites })}{held.charred ? t('ui.held.charred') : ''} · <Key action="interact" /> {t('ui.held.eat')} · <Key action="drop" /> {t('ui.held.drop')}
      </div>
    );
  }
  if (held.kind === 'decor') {
    return (
      <div className="hud-hint hud-held">
        📦 {t('ui.held.carrying', { name: decorInSentence(held.item) })} · <Key action="interact" /> {t('ui.held.places')} · <Key action="drop" /> {t('ui.held.putsBack')}
      </div>
    );
  }
  if (held.kind === 'paddle') return <PongHud />;
  if (held.kind === 'sticky') {
    return (
      <div className="hud-hint hud-held">
        📌 {held.pr ? `PR #${held.number}` : `#${held.number}`} · {held.pr ? t('ui.held.stickyPr') : t('ui.held.sticky')} <Key action="interact" /> · <Key action="drop" /> {t('ui.held.elsewhere')}
      </div>
    );
  }
  if (held.kind === 'mug') {
    return (
      <div className="hud-hint hud-held">
        ☕ {held.sips > 0 ? t('ui.held.sips', { count: held.sips }) : t('ui.held.emptyMug')} · <Key action="drop" /> {t('ui.held.drop')}
      </div>
    );
  }
  return (
    <>
      {chargeAt !== null && <ChargeMeter at={chargeAt} />}
      <div className="hud-hint hud-held">
        <kbd>{t('ui.held.click')}</kbd> / <Key action="throw" /> {t('ui.held.throw')} · {t('ui.held.charge')} · <Key action="drop" /> {t('ui.held.drop')}
      </div>
    </>
  );
}
