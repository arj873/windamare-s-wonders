/** The UI shell (UX.md): DOM helpers, toasts, dialogs, menu, setup screen. */
export { h, patchChildren, type Child, type Props } from './dom';
export { showToast, type ToastKind } from './toast';
export {
  confirmDialog,
  openDialog,
  showResumePrompt,
  type DialogAction,
  type DialogHandle,
  type DialogOptions,
} from './dialog';
export { Menu, type MenuAction, type MenuChoice, type MenuItem } from './menu';
export {
  BOT_SPEEDS,
  loadAnimations,
  loadBotSpeed,
  motionOn,
  prefersReducedMotion,
  saveAnimations,
  saveBotSpeed,
  type BotSpeed,
} from './prefs';
export { SetupScreen, type SetupScreenOptions } from './setup/screen';
export type { NewGameConfig, SeatConfig } from './setup/model';
