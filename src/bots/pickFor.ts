import type { DraftAction, DraftEngine, DraftView, SeatId } from '../engine';
import { Rng } from '../engine';
import { createRandomBot } from './random';
import { windamereRules } from './windamere';
import { createWindamereBot } from './windamereBots';

/**
 * Bot strength. easy = uniform over legal moves; medium = level 2, hard = level 3 (Windamere only;
 * another ruleset falls back to easy). See docs/BOTS.md §4.
 */
export type BotLevel = 'easy' | 'medium' | 'hard';

export interface PickForOptions {
  level?: BotLevel;
  /** Mixed into the decision RNG, e.g. a per-room bot seed. Default 0. */
  salt?: number;
}

/**
 * The entry point for net and ui: one action for `seat`, computed from that seat's view only.
 * Stateless and deterministic: the same view, seat, level and salt always give the same action
 * (the RNG is derived from public view fields), so a server restart or a replay agrees.
 * Returns null if the seat has nothing to do (not waited on, or game over).
 *
 * Works for a pick or an open prompt. Never returns `unpick`.
 */
export function pickFor<S, T>(
  engine: DraftEngine<S, T>,
  view: DraftView<S, T>,
  seat: SeatId,
  options: PickForOptions = {},
): DraftAction | null {
  const rng = new Rng(hash([options.salt ?? 0, seat, view.seq, view.round, view.turn]));
  const level = options.level ?? 'easy';
  if (level !== 'easy' && isWindamere(engine)) {
    const bot = createWindamereBot(level === 'medium' ? 2 : 3);
    return bot.act({ engine, view, seat, rng } as never);
  }
  return createRandomBot<S, T>().act({ engine, view, seat, rng });
}

/** Small integer hash (FNV-1a over the numbers) into a nonzero uint32. */
function hash(nums: number[]): number {
  let h = 0x811c9dc5;
  for (const n of nums) {
    h = Math.imul(h ^ (n >>> 0), 0x01000193) >>> 0;
  }
  return h || 1;
}

/** True for the shipped Windamere engine (same card catalog as the one the bots rate). */
function isWindamere(engine: {
  ruleset: { id: string; cards: readonly { id: string }[] };
}): boolean {
  const cards = windamereRules.content.cards;
  return (
    engine.ruleset.id === 'windamere' &&
    engine.ruleset.cards.length === cards.length &&
    engine.ruleset.cards.every((c, i) => c.id === cards[i]?.id)
  );
}
