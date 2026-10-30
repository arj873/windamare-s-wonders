/**
 * The guided first game (T3): lessons the coach shows as their moments come up. Lessons are
 * pure: every predicate reads only the learner's view of the game, so a reload picks up where it
 * was (machine.ts keeps the progress as plain data). Ported from catan's coach, one course.
 */
import type { DraftView, SeatId } from '../../engine';
import type { WwSeat, WwTable } from '../../engine';

export type WwView = DraftView<WwSeat, WwTable>;

export interface TutorialCtx {
  readonly view: WwView;
  /** The learner's seat. */
  readonly me: SeatId;
}

export interface LessonDef {
  id: string;
  title: string;
  /** 1-3 short sentences. `live` = about the current moment (false when paging back). */
  text: (c: TutorialCtx, live: boolean) => string;
  /** Lessons that must be finished first. */
  after?: readonly string[];
  /** Its moment: it may show now. */
  when: (c: TutorialCtx) => boolean;
  /** Closes by itself once this holds (the player did it, or the moment passed). Else: Next. */
  doneWhen?: (c: TutorialCtx) => boolean;
  /** Not shown yet and no longer useful: finished without showing. */
  stale?: (c: TutorialCtx) => boolean;
  /** The player must act now: it pushes a reading lesson off the panel. */
  urgent?: boolean;
  /** Event lesson: if its event never comes up, it shows as a recap before the end. */
  recap?: boolean;
  /** A live "your move" line while the lesson is up. */
  todo?: (c: TutorialCtx) => string | null;
  /** Table element to point at: set as `data-tut-focus` on the table root (tutorial.css). */
  focus?: string;
}

export interface Course {
  id: string;
  name: string;
  lessons: readonly LessonDef[];
  /** The last lesson: shown at the wrap-up, never by `when`. */
  finish: string;
  /** Time to show recaps and finish. */
  wrapUp(c: TutorialCtx, done: ReadonlySet<string>): boolean;
}

// ---------------------------------------------------------------------------
// Reading the game (helpers for lessons)
// ---------------------------------------------------------------------------

export const mySeat = (c: TutorialCtx) => c.view.seats[c.me];
export const picking = (c: TutorialCtx): boolean => c.view.phase.kind === 'pick';
export const over = (c: TutorialCtx): boolean => c.view.phase.kind === 'gameOver';
/** The learner holds a hand and has not picked yet. */
export const mustPick = (c: TutorialCtx): boolean =>
  picking(c) && (mySeat(c)?.hand.length ?? 0) > 0 && !c.view.view.submitted[c.me];
/** Turns played so far: Season index × turns per Season + turn (0-based, a pick phase). */
export const turnsDone = (c: TutorialCtx): number => c.view.round * 5 + c.view.turn;
/** The last turn of a Season: two cards in hand (R3.5). */
export const gleanTurn = (c: TutorialCtx): boolean => picking(c) && c.view.turn === 4;
