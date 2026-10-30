/** Tutorial memory in localStorage: finished?, first-visit hint shown?, the run in progress. */
import { parseRun, type TutorialRun } from './machine';

export const TUTORIAL_KEY = 'ww:tutorial:v1';

export type TutorialStorage = Pick<Storage, 'getItem' | 'setItem'>;

export interface TutorialRecord {
  completed: boolean;
  offered: boolean;
  run: TutorialRun | null;
}

const EMPTY: TutorialRecord = { completed: false, offered: false, run: null };

export function defaultTutorialStorage(): TutorialStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadTutorial(store: TutorialStorage | null): TutorialRecord {
  try {
    const text = store?.getItem(TUTORIAL_KEY);
    if (!text) return EMPTY;
    const raw = JSON.parse(text) as Record<string, unknown> | null;
    if (!raw || typeof raw !== 'object') return EMPTY;
    return {
      completed: raw.completed === true,
      offered: raw.offered === true,
      run: parseRun(raw.run),
    };
  } catch {
    return EMPTY;
  }
}

export function saveTutorial(store: TutorialStorage | null, rec: TutorialRecord): void {
  try {
    store?.setItem(TUTORIAL_KEY, JSON.stringify(rec));
  } catch {
    /* quota / privacy mode: the tutorial just doesn't resume */
  }
}
