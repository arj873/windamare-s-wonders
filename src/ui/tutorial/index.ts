/** The guided first game ("Learn to play"): a coach panel over a normal hotseat game. */
export {
  TutorialCoach,
  offerTutorial,
  ACTIVE_ATTR,
  FOCUS_ATTR,
  HEIGHT_VAR,
  type CoachHost,
} from './coach';
export { TUTORIAL_OPTIONS, TUTORIAL_PACE_MS, TUTORIAL_SEED, tutorialConfig } from './game';
export { defaultTutorialStorage, type TutorialStorage } from './store';
export type { WwView } from './course';
