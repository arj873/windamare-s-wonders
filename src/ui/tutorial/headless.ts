/**
 * Play the whole tutorial game with no screen: bots play every seat, and a stand-in learner
 * (seat 0) reads each lesson the coach shows and presses Next at its next pick. Used by the tests
 * and the seed search to check that every lesson fires. Not shipped in the UI.
 */
import { pickFor, type BotLevel } from '../../bots';
import { TUTORIAL_OPTIONS } from './game';
import type { TutorialCtx, WwView } from './course';
import { windamere } from '../../game/windamere/content';
import { advance, next, newRun, type TutorialRun } from './machine';

export interface Playthrough {
  /** Lesson ids in the order they were shown. */
  shown: string[];
  recapped: string[];
  over: boolean;
  /** Picks the learner made. */
  picks: number;
}

export function playTutorial(
  seed: string,
  opts: { seats?: number; learner?: BotLevel; others?: BotLevel } = {},
): Playthrough {
  const { engine } = windamere();
  const n = opts.seats ?? 4;
  let state = engine.createGame({
    seed,
    seats: Array.from({ length: n }, (_, i) => ({ name: i === 0 ? 'You' : `Bot ${i}` })),
    options: TUTORIAL_OPTIONS,
  });
  let run: TutorialRun = newRun(seed, 0);
  let picks = 0;
  const ctx = (): TutorialCtx => ({ view: engine.viewFor(state, 0) as WwView, me: 0 });
  /**
   * A person reads each reading tip and presses Next, but acts at once when the coach says
   * "pick" (they never press Next to get past it). `all` = the game is over and they click
   * through what is left.
   */
  const coach = (read: 'none' | 'read' | 'all'): void => {
    run = advance(run, ctx());
    const reads = read === 'all' ? 20 : read === 'read' ? 20 : 0;
    for (let i = 0; i < reads && run.current !== null && run.current !== 'pick'; i++) {
      run = next(run, ctx());
    }
  };

  for (let guard = 0; state.phase.kind !== 'gameOver' && guard < 5000; guard++) {
    for (let seat = 0; seat < n; seat++) {
      const view = engine.viewFor(state, seat);
      const level = seat === 0 ? (opts.learner ?? 'medium') : (opts.others ?? 'easy');
      if (seat === 0) coach('read');
      const action = pickFor(engine, view, seat, { level });
      if (!action) continue;
      if (seat === 0 && action.type === 'pick') picks++;
      const r = engine.applyAction(state, action);
      if (!r.ok) continue;
      state = r.state;
      coach('none');
    }
  }
  coach('all');
  coach('all');
  return { shown: run.shown, recapped: run.recapped, over: state.phase.kind === 'gameOver', picks };
}
