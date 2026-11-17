import { useT } from '../i18n';

type LabelId = 'accessibility' | 'balls' | 'blasters' | 'blur' | 'building' | 'camera' | 'ceo' | 'chatter' | 'clip' | 'codingAgent' | 'coffee' | 'dayNight' | 'dog' | 'earlier' | 'effort' | 'filter' | 'focus' | 'graphics' | 'lookHere' | 'mission' | 'model' | 'movement' | 'name' | 'noRepos' | 'orbitBoard' | 'orbitGong' | 'outside' | 'phone' | 'photoClips' | 'projects' | 'replay' | 'rewards' | 'roll' | 'shot' | 'sound' | 'team' | 'views' | 'visitors' | 'voices' | 'volume' | 'whiteboard' | 'zoom';

export function TranslatedLabel({ id }: { id: LabelId }) {
  const t = useT();
  const values: Record<LabelId, string> = {
    accessibility: t('uiExtra.accessibility'),
    balls: t('uiExtra.balls'),
    blasters: t('uiExtra.blasters'),
    blur: t('uiExtra.blur'),
    building: t('uiExtra.building'),
    camera: t('uiExtra.camera'),
    ceo: t('uiExtra.ceo'),
    chatter: t('uiExtra.chatter'),
    clip: t('uiExtra.clip'),
    codingAgent: t('uiExtra.codingAgent'),
    coffee: t('uiExtra.coffee'),
    dayNight: t('uiExtra.dayNight'),
    dog: t('uiExtra.dog'),
    earlier: t('uiExtra.earlier'),
    effort: t('uiExtra.effort'),
    filter: t('uiExtra.filter'),
    focus: t('uiExtra.focus'),
    graphics: t('uiExtra.graphics'),
    lookHere: t('uiExtra.lookHere'),
    mission: t('uiExtra.mission'),
    model: t('uiExtra.model'),
    movement: t('uiExtra.movement'),
    name: t('uiExtra.name'),
    noRepos: t('uiExtra.noRepos'),
    orbitBoard: t('uiExtra.orbitBoard'),
    orbitGong: t('uiExtra.orbitGong'),
    outside: t('uiExtra.outside'),
    phone: t('uiExtra.phone'),
    photoClips: t('uiExtra.photoClips'),
    projects: t('uiExtra.projects'),
    replay: t('uiExtra.replay'),
    rewards: t('uiExtra.rewards'),
    roll: t('uiExtra.roll'),
    shot: t('uiExtra.shot'),
    sound: t('uiExtra.sound'),
    team: t('uiExtra.team'),
    views: t('uiExtra.views'),
    visitors: t('uiExtra.visitors'),
    voices: t('uiExtra.voices'),
    volume: t('uiExtra.volume'),
    whiteboard: t('uiExtra.whiteboard'),
    zoom: t('uiExtra.zoom'),
  };
  return <>{values[id]}</>;
}
