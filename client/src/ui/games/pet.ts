// Desk Pet, the phone's Tamagotchi clone: a little cube-shaped office creature with food, fun and energy that run
// down in real time, even while the office is closed. It never dies: at worst it gets grumpy until you look after
// it again. Pure functions of (state, now); petStore.ts keeps it in the browser and Pet.tsx draws it.

import { t } from '../../../../shared/i18n';

export interface PetState {
  v: 1;
  name: string;
  color: string;
  born: number;
  /** When the stats below were last brought up to date. */
  at: number;
  /** 0-100 each. */
  food: number;
  fun: number;
  energy: number;
  asleep: boolean;
  /** Care points: every bit of looking after it counts toward its next promotion. */
  xp: number;
  coffeeAt: number;
  pettedAt: number;
  /** What it last said, and when. */
  say: { text: string; at: number } | null;
}

export type PetAction = 'snack' | 'coffee' | 'play' | 'nap' | 'pet';
export type Mood = 'asleep' | 'happy' | 'content' | 'hungry' | 'bored' | 'tired' | 'grumpy';

const HOUR = 3_600_000;
/** Longest absence that counts; after that it's simply as low as it gets. */
const MAX_AWAY = 30 * 24 * HOUR;
/** Change per hour. Awake it runs down; asleep it recharges until fully rested, then wakes up by itself. */
export const RATES = {
  awake: { food: -12, fun: -10, energy: -7 },
  asleep: { food: -5, fun: -3, energy: 35 },
};

export const NAMES = ['Cubey', 'Pixel', 'Widget', 'Sprocket', 'Nugget', 'Mochi', 'Byte', 'Tofu'];
export const COLORS = ['#ff8a5b', '#4fb3e8', '#8fd14f', '#c77dff', '#ffc93c', '#ff6fb5', '#2ec4b6'];
/** Job titles by care points: it grows (and dresses) up as you look after it. */
export const STAGES = [0, 12, 40, 90].map((xp, i) => ({
  xp,
  get title() {
    return t(`ui.pet.stage${i}`);
  },
}));

const clamp = (v: number) => Math.max(0, Math.min(100, v));

export function stage(xp: number): number {
  let i = 0;
  while (i + 1 < STAGES.length && xp >= STAGES[i + 1].xp) i++;
  return i;
}

/** A brand-new pet; r0 and r1 in [0, 1) pick its name and colour. */
export function hatch(now: number, r0: number, r1: number): PetState {
  const name = NAMES[Math.floor(r0 * NAMES.length) % NAMES.length];
  return {
    v: 1,
    name,
    color: COLORS[Math.floor(r1 * COLORS.length) % COLORS.length],
    born: now,
    at: now,
    food: 80,
    fun: 80,
    energy: 80,
    asleep: false,
    xp: 0,
    coffeeAt: 0,
    pettedAt: 0,
    say: { text: t('ui.pet.hello', { name }), at: now },
  };
}

/**
 * Brings the stats up to now. Piecewise, because the pet dozes off when its energy runs out and wakes up once rested.
 * Path independent: advancing in two hops lands where one hop would, so it's safe to call as often as you like.
 */
export function advance(p: PetState, now: number): PetState {
  let t = Math.min(Math.max(0, now - p.at), MAX_AWAY) / HOUR;
  let { food, fun, energy, asleep } = p;
  for (let guard = 0; t > 0 && guard < 1000; guard++) {
    const r = asleep ? RATES.asleep : RATES.awake;
    // Hours until it wakes up (asleep) or runs out of energy and nods off (awake).
    const until = asleep ? (100 - energy) / r.energy : energy / -r.energy;
    const dt = Math.min(t, until);
    food = clamp(food + r.food * dt);
    fun = clamp(fun + r.fun * dt);
    energy = clamp(energy + r.energy * dt);
    t -= dt;
    if (dt === until) asleep = !asleep;
  }
  return { ...p, at: Math.max(now, p.at), food, fun, energy, asleep };
}

export function mood(p: PetState): Mood {
  if (p.asleep) return 'asleep';
  const low = [p.food, p.fun, p.energy].filter((v) => v < 25).length;
  if (low >= 2 || Math.min(p.food, p.fun, p.energy) <= 0) return 'grumpy';
  if (p.food < 25) return 'hungry';
  if (p.energy < 25) return 'tired';
  if (p.fun < 25) return 'bored';
  if (p.food + p.fun + p.energy >= 210) return 'happy';
  return 'content';
}

/** What it says about itself when it has nothing new to say. */
export const moodLine = (m: Mood) => t(`ui.pet.mood.${m}`);

/** One of a few lines, by key: `ui.pet.<key>0`, `1`, `2`. */
const pick = (key: string, now: number) => t(`ui.pet.${key}${Math.floor(now / 1000) % 3}`);

/** Looks after the pet: brings it up to now, applies the action and notes what it says (and any promotion). */
export function act(before: PetState, action: PetAction, now: number): PetState {
  const p = advance(before, now);
  const next = apply(p, action, now);
  if (next === p) return p;
  const promoted = stage(next.xp) > stage(p.xp);
  return promoted ? { ...next, fun: clamp(next.fun + 10), say: { text: t('ui.pet.promoted', { title: STAGES[stage(next.xp)].title }), at: now } } : next;
}

function apply(p: PetState, action: PetAction, now: number): PetState {
  const say = (text: string) => ({ text, at: now });
  const change = (d: Partial<Record<'food' | 'fun' | 'energy' | 'xp', number>>, text: string): PetState => ({
    ...p,
    food: clamp(p.food + (d.food ?? 0)),
    fun: clamp(p.fun + (d.fun ?? 0)),
    energy: clamp(p.energy + (d.energy ?? 0)),
    xp: p.xp + (d.xp ?? 0),
    say: say(text),
  });
  if (action === 'nap') {
    if (p.asleep) return p.energy < 40 ? { ...change({ fun: -4 }, t('ui.pet.fiveMore')), asleep: false } : { ...change({}, t('ui.pet.morning')), asleep: false };
    if (p.energy >= 90) return change({}, t('ui.pet.notSleepy'));
    return { ...change({ xp: p.energy < 50 ? 1 : 0 }, t('ui.pet.napTime')), asleep: true };
  }
  if (p.asleep) return action === 'pet' ? p : change({}, t('ui.pet.stillAsleep'));
  switch (action) {
    case 'snack':
      if (p.food >= 90) return change({ fun: -2 }, t('ui.pet.stuffed'));
      return change({ food: 30, fun: 3, xp: 1 }, pick('snack', now));
    case 'coffee':
      if (now - p.coffeeAt < 10 * 60_000) return change({ energy: 5, fun: -6 }, t('ui.pet.tooMuchCoffee'));
      return { ...change({ energy: 25, food: 3, xp: 1 }, pick('coffee', now)), coffeeAt: now };
    case 'play':
      if (p.energy < 15) return change({}, t('ui.pet.tooTired'));
      return change({ fun: 25, energy: -10, food: -6, xp: 1 }, pick('play', now));
    case 'pet':
      if (now - p.pettedAt < 3000) return p;
      return { ...change({ fun: 3 }, pick('pet', now)), pettedAt: now };
  }
  return p;
}

/** Someone in the office finished a job: the pet cheers, and it lifts its spirits. */
export function cheer(before: PetState, text: string, now: number): PetState {
  const p = advance(before, now);
  return { ...p, fun: clamp(p.fun + 8), xp: p.xp + 1, say: { text, at: now } };
}

/** A pet read back from storage, or null when it isn't one (missing, corrupt or from an older version). */
export function parsePet(raw: unknown): PetState | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Partial<PetState>;
  const nums = [p.born, p.at, p.food, p.fun, p.energy, p.xp, p.coffeeAt, p.pettedAt];
  if (p.v !== 1 || typeof p.name !== 'string' || typeof p.color !== 'string' || typeof p.asleep !== 'boolean' || !nums.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  const say = p.say && typeof p.say.text === 'string' && typeof p.say.at === 'number' ? { text: p.say.text, at: p.say.at } : null;
  return { ...(p as PetState), food: clamp(p.food!), fun: clamp(p.fun!), energy: clamp(p.energy!), say };
}
