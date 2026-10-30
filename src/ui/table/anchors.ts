/**
 * Where things are on the draft table, for the fx lane's reveal animation and sound
 * (src/ui/fx): an overlay layer to draw in, plus live DOM lookups that stay right after every
 * re-render. A lookup returns null when that thing is not on screen.
 */
import type { CardId, SeatId } from '../../engine';

export interface TableAnchors {
  /** The table's root (`.dt`). */
  root: HTMLElement;
  /** Fixed overlay over the table, pointer-events: none; fx's sprites go here. */
  layer: HTMLElement;
  /** The hand row. */
  hand(): HTMLElement | null;
  /** A card in the viewer's hand. */
  card(id: CardId): HTMLElement | null;
  /** The viewer's face-down staging slot. */
  stage(): HTMLElement | null;
  /** The biggest panel showing a seat: your town, a neighbour panel, else its summary row. */
  town(seat: SeatId): HTMLElement | null;
  /** A seat's number in that panel: 'coins', 'score', 'guard', 'labour', 'good-<good id>'. */
  stat(seat: SeatId, id: string): HTMLElement | null;
  /** A seat's Great Work picture (your town and neighbours only). */
  monument(seat: SeatId): HTMLElement | null;
  /** A built card in a seat's tableau, when that tableau is on screen. */
  built(seat: SeatId, id: CardId): HTMLElement | null;
  /** The final scores' total per town, best first (empty until the game is over). */
  scoreTotals(): { seat: SeatId; el: HTMLElement }[];
}

export function tableAnchors(root: HTMLElement, layer: HTMLElement): TableAnchors {
  const q = (el: ParentNode | null, sel: string) =>
    (el?.querySelector(sel) as HTMLElement | null) ?? null;
  const town = (seat: SeatId): HTMLElement | null =>
    q(root, `.dt-town[data-seat="${seat}"]`) ??
    q(root, `.dt-nb[data-seat="${seat}"]`) ??
    q(root, `.dt-row[data-seat="${seat}"]`);
  return {
    root,
    layer,
    hand: () => q(root, '.dt-cards'),
    card: (id) => q(root, `.dt-card[data-card="${id}"]`),
    stage: () => q(root, '.dt-stage .dt-back'),
    town,
    stat: (seat, id) => q(town(seat), `.dt-stat.is-${id}`),
    monument: (seat) => q(town(seat), '.dt-monument-art'),
    built: (seat, id) => q(town(seat), `.dt-mini[data-card="${id}"]`),
    scoreTotals: () =>
      [...root.querySelectorAll<HTMLElement>('.dt-band-card[data-seat]')].flatMap((card) => {
        const el = q(card, '.dt-band-total');
        return el ? [{ seat: Number(card.dataset.seat), el }] : [];
      }),
  };
}
