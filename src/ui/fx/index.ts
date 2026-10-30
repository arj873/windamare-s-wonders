/** Motion and sound hooks for the table (fx lane). ui calls these; see docs in each module. */
import { LEVEL_GAIN, SoundLimiter, sfx, type CueLevel } from '../../audio';
import type { SeatId } from '../../engine/core';
import type { WwEventEntry } from '../../engine/game/events';
import { playReveal, type RevealAnchors, type RevealOptions } from './reveal';

export * from './plan';
export * from './reveal';

export interface TableFx {
  /** Seats played on this screen (hotseat humans or the online seat): louder cues. */
  isLocal(seat: SeatId): boolean;
  /** Is `seat` a bot? Bots are quietest. */
  isBot?(seat: SeatId): boolean;
}

const limiter = new SoundLimiter();

/** Play one sound at the level its seat deserves, through the shared limiter. */
export function playCue(id: string, seat: SeatId | null, who: TableFx): void {
  const level: CueLevel =
    seat === null ? 'normal' : who.isLocal(seat) ? 'high' : who.isBot?.(seat) ? 'low' : 'normal';
  for (const c of limiter.admit([{ id, level }], performance.now()))
    sfx.play(c.id, LEVEL_GAIN[c.level]);
}

/**
 * The one call ui makes per resolved action: animate `latestEvents(view)` with sound.
 * Resolves when the last beat has played; ui should keep input blocked until then.
 */
export function playRevealWithSound(
  events: readonly WwEventEntry[],
  anchors: RevealAnchors,
  who: TableFx,
  opts: Omit<RevealOptions, 'onCue'> = {},
): Promise<void> {
  return playReveal(events, anchors, { ...opts, onCue: (cue, seat) => playCue(cue, seat, who) });
}
