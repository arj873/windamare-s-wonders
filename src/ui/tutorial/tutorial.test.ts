// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { windamere } from '../../game/windamere/content';
import type { TutorialCtx, WwView } from './course';
import { TutorialCoach, type CoachHost } from './coach';
import { tutorialConfig, TUTORIAL_SEED } from './game';
import { LESSONS } from './lessons';
import { advance, back, newRun, next, panelView, parseRun, skip } from './machine';
import type { TutorialStorage } from './store';

const BLOCKED = /\b(age|stage|shield|science|guild|chain|caravan|treasury)\b/i;

function fresh(): WwView {
  const { engine } = windamere();
  const state = engine.createGame({
    seed: TUTORIAL_SEED,
    seats: tutorialConfig().players.map((p) => ({ name: p.name })),
  });
  return engine.viewFor(state, 0) as WwView;
}

const ctxOf = (view: WwView): TutorialCtx => ({ view, me: 0 });

describe('lessons', () => {
  it('have unique ids, valid prerequisites and our words only', () => {
    const ids = new Set(LESSONS.map((l) => l.id));
    expect(ids.size).toBe(LESSONS.length);
    for (const l of LESSONS) {
      for (const a of l.after ?? []) expect(ids.has(a), `${l.id} after ${a}`).toBe(true);
      expect(`${l.title} ${l.text(ctxOf(fresh()), true)}`).not.toMatch(BLOCKED);
    }
  });
});

describe('machine', () => {
  it('starts with the welcome lesson, then pages with Next and Back', () => {
    const c = ctxOf(fresh());
    let run = advance(newRun(TUTORIAL_SEED, 0), c);
    expect(run.current).toBe('welcome');
    run = next(run, c);
    expect(run.done).toContain('welcome');
    run = back(run);
    expect(panelView(run, c).live).toBe(false);
    expect(panelView(run, c).lesson?.id).toBe('welcome');
  });
  it('skip ends the run, and a run survives a save round trip', () => {
    const c = ctxOf(fresh());
    const run = advance(newRun(TUTORIAL_SEED, 0), c);
    expect(parseRun(JSON.parse(JSON.stringify(run)))).toEqual(run);
    expect(skip(run).over).toBe(true);
    expect(parseRun({ nonsense: true })).toBeNull();
  });
});

describe('coach', () => {
  it('draws the panel for a game of its seed and ignores other games', () => {
    const mem = new Map<string, string>();
    const store: TutorialStorage = {
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => void mem.set(k, v),
    };
    let view: WwView | null = fresh();
    let seed = TUTORIAL_SEED;
    const paces: (number | null)[] = [];
    const host: CoachHost = {
      view: () => view,
      seed: () => (view ? seed : null),
      start: () => undefined,
      newGame: () => undefined,
      pace: (ms) => void paces.push(ms),
    };
    const root = document.createElement('div');
    const coach = new TutorialCoach(root, host, store);
    coach.begin();
    coach.update();
    expect(coach.active).toBe(true);
    expect(root.querySelector('.tut-title')?.textContent).toBe('Welcome to Windamere');
    expect(paces[0]).toBeGreaterThan(0);
    expect(root.hasAttribute('data-tut-active')).toBe(true);
    expect(root.style.getPropertyValue('--tut-h')).not.toBe('');

    // A different game replaced it: the coach goes away.
    seed = 'other';
    const { engine } = windamere();
    view = engine.viewFor(
      engine.createGame({ seed: 'other', seats: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] }),
      0,
    ) as WwView;
    coach.update();
    expect(coach.active).toBe(false);
    expect(root.querySelector('.tut-panel')?.hasAttribute('hidden')).toBe(true);
    expect(paces.at(-1)).toBeNull();
    expect(root.hasAttribute('data-tut-active')).toBe(false);
  });
});
