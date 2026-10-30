/**
 * The guided first game's coach. ui owns the game; the coach only reads it:
 *   const coach = new TutorialCoach(tableRoot, host, defaultTutorialStorage());
 *   coach.begin();      // "Learn to play": ui starts tutorialConfig() with TUTORIAL_OPTIONS
 *   coach.update();     // after every render of the game (and after resuming a save)
 */
import { h } from '../dom';
import type { NewGameConfig } from '../setup/model';
import type { TutorialCtx, WwView } from './course';
import { TUTORIAL_ME, TUTORIAL_PACE_MS, TUTORIAL_SEED, tutorialConfig } from './game';
import {
  advance,
  back,
  newRun,
  next,
  panelView,
  setCollapsed,
  skip,
  type TutorialRun,
} from './machine';
import { renderPanel } from './panel';
import { loadTutorial, saveTutorial, type TutorialRecord, type TutorialStorage } from './store';
import './tutorial.css';

export interface CoachHost {
  /** The learner's view of the game on screen; null before the first game. */
  view(): WwView | null;
  /** The seed of the game on screen (views hide the real one, so ui says); null = none. */
  seed(): string | null;
  /** Start the tutorial game (with TUTORIAL_OPTIONS as ruleset options). */
  start(cfg: NewGameConfig): void;
  /** Open the new-game screen. */
  newGame(): void;
  /** Bots move at least this slowly (ms per move); null = the player's own bot speed again. */
  pace(ms: number | null): void;
}

/** Set on the root while the panel is open (not minimized); `--tut-h` is its height plus a gap. */
export const ACTIVE_ATTR = 'data-tut-active';
export const HEIGHT_VAR = '--tut-h';

/** Attribute on the table root naming the element to point at (tutorial.css). */
export const FOCUS_ATTR = 'data-tut-focus';

export class TutorialCoach {
  readonly panel: HTMLElement;
  private record: TutorialRecord;
  private paced = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly host: CoachHost,
    private readonly store: TutorialStorage | null,
  ) {
    this.record = loadTutorial(store);
    this.panel = h('section', {
      class: 'tut-panel',
      attrs: { 'aria-label': 'Tutorial', 'aria-live': 'polite', hidden: '' },
    });
    root.append(this.panel);
  }

  get active(): boolean {
    const run = this.record.run;
    const view = this.host.view();
    return run !== null && !run.over && view !== null && this.belongs(run, view);
  }

  /** The learner finished or skipped the tutorial once. */
  get completed(): boolean {
    return this.record.completed;
  }

  /** "Learn to play": a fresh tutorial game with the coach from the first lesson. */
  begin(): void {
    this.save({ ...this.record, offered: true, run: newRun(TUTORIAL_SEED, TUTORIAL_ME) });
    this.setPace(true);
    this.host.start(tutorialConfig());
  }

  /** After every render of the game. */
  update(): void {
    const view = this.host.view();
    let run = this.record.run;
    if (view && run && !run.over && !this.belongs(run, view)) {
      // Another game replaced the tutorial game: the run is gone.
      this.save({ ...this.record, run: null });
      this.setPace(false);
      run = null;
    }
    if (!run || run.over || !view) return this.hide();
    this.setPace(true);
    const ctx: TutorialCtx = { view, me: run.me };
    this.set(advance(run, ctx), ctx);
  }

  hide(): void {
    this.panel.hidden = true;
    this.panel.replaceChildren();
    this.root.removeAttribute(FOCUS_ATTR);
    this.root.removeAttribute(ACTIVE_ATTR);
    this.root.style.removeProperty(HEIGHT_VAR);
  }

  private belongs(run: TutorialRun, view: WwView): boolean {
    return view !== null && this.host.seed() === run.seed;
  }

  private press(step: (run: TutorialRun, ctx: TutorialCtx) => TutorialRun): void {
    const run = this.record.run;
    const view = this.host.view();
    if (!run || !view) return;
    const ctx: TutorialCtx = { view, me: run.me };
    this.set(step(run, ctx), ctx);
  }

  private set(run: TutorialRun, ctx: TutorialCtx): void {
    if (run.over) {
      this.save({ ...this.record, completed: true, run: null });
      this.setPace(false);
      return this.hide();
    }
    if (run !== this.record.run) this.save({ ...this.record, run });
    const view = panelView(run, ctx);
    this.panel.hidden = false;
    renderPanel(this.panel, view, {
      next: () => this.press(next),
      back: () => this.press((r) => back(r)),
      skip: () => this.press((r) => skip(r)),
      collapse: (c) => this.press((r) => setCollapsed(r, c)),
      newGame: () => {
        this.press(next);
        this.host.newGame();
      },
    });
    if (view.collapsed) {
      this.root.removeAttribute(ACTIVE_ATTR);
      this.root.style.removeProperty(HEIGHT_VAR);
    } else {
      this.root.setAttribute(ACTIVE_ATTR, '');
      this.root.style.setProperty(HEIGHT_VAR, `${this.panel.offsetHeight + 20}px`);
    }
    if (view.focus && !view.collapsed) this.root.setAttribute(FOCUS_ATTR, view.focus);
    else this.root.removeAttribute(FOCUS_ATTR);
  }

  private setPace(on: boolean): void {
    if (on === this.paced) return;
    this.paced = on;
    this.host.pace(on ? TUTORIAL_PACE_MS : null);
  }

  private save(rec: TutorialRecord): void {
    this.record = rec;
    saveTutorial(this.store, rec);
  }
}

/** First visit: a small dismissible "New here?" card, shown once. Returns it or null. */
export function offerTutorial(
  parent: HTMLElement,
  store: TutorialStorage | null,
  returning: boolean,
  onLearn: () => void,
): HTMLElement | null {
  const rec = loadTutorial(store);
  if (rec.offered || rec.completed || returning) return null;
  saveTutorial(store, { ...rec, offered: true });
  const card = h(
    'aside',
    { class: 'tut-hint', attrs: { role: 'note', 'aria-label': 'Learn to play' } },
    h('p', {}, h('b', {}, 'New to the game? '), 'Learn the rules while you play your first game.'),
    h(
      'div',
      { class: 'tut-hint-actions' },
      h(
        'button',
        {
          class: 'btn btn-ghost btn-sm',
          attrs: { 'data-k': 'tut-hint-close' },
          on: { click: () => card.remove() },
        },
        'Not now',
      ),
      h(
        'button',
        {
          class: 'btn btn-primary btn-sm',
          attrs: { 'data-k': 'tut-hint-learn' },
          on: {
            click: () => {
              card.remove();
              onLearn();
            },
          },
        },
        'Learn to play',
      ),
    ),
  );
  parent.append(card);
  return card;
}
