/**
 * The seam between the game screen and the fx lane (src/ui/fx: reveal animation and sound).
 * play.ts calls the hook once per resolved action, after the table has re-rendered, with
 * everything fx needs to animate it: the viewer's engine view (E3 events via
 * `latestEvents(view)`), the table model (reveal lines, effect badges) and DOM anchors.
 * Nothing here draws; fx owns the look and the sound. Contract: UX.md §19.
 */
import type { DraftView } from '../engine';
import type { TableAnchors } from '../ui/table/anchors';
import type { TableModel } from '../ui/table/model';

export interface RevealMoment<S, T> {
  /** Changes with every action that logged anything (the same key the table uses). */
  key: string;
  view: DraftView<S, T>;
  model: TableModel;
  anchors: TableAnchors;
  /** prefers-reduced-motion or Animations: off. Fades only, no movement (UX.md §13). */
  reducedMotion: boolean;
}

export interface RevealHook<S, T> {
  /** Once, when the table is created (fx opts the root into its motion styles). */
  attach?(anchors: TableAnchors): void;
  /** A new action resolved and the table shows its result: animate and sound it. */
  onAction(moment: RevealMoment<S, T>): void;
  /** Skip whatever is playing (the player clicked or pressed a key). */
  skip?(): void;
  /** The table is leaving the screen. */
  dispose?(): void;
}
