/**
 * The draft table (UX.md §7, §8): top bar with round, status, timer and pick chips; both
 * neighbours; your town with the staging slot; your hand with the action popover; the table
 * summary, last reveal and log in the sidebar; the open prompt; the final scores.
 *
 * Draws a TableModel (model.ts) and reports intents; it never calls the engine. Clicks are
 * delegated from the root through `data-act`, so re-renders can patch the DOM in place
 * (patchChildren) without stale listeners. Card faces are text placeholders until art A3.
 */
import type { CardId, Json, Pick } from '../../engine';
import { openDialog } from '../dialog';
import { showToast } from '../toast';
import { h, patchChildren, type Child } from '../dom';
import {
  primaryOption,
  type HandCard,
  type PromptModel,
  type ResultModel,
  type SeatModel,
  type SeatStatus,
  type TableModel,
  type TableauCard,
  type UseOption,
} from './model';
import { tableAnchors, type TableAnchors } from './anchors';
import { fillSvg, svgText } from './art';
import type { FacePart, KindInfo, MonumentInfo, SeasonEndInfo, SeatStat } from './present';
import '../shell.css';
import '../theme/kinds.css';
import './table.css';

export interface DraftTableHandlers {
  pick(pick: Pick): void;
  unpick(): void;
  answer(prompt: number, answer: Json): void;
  /** Final scores: "New game" (absent hides the button). */
  newGame?(): void;
  /** "All cards" in the hand header (tutorial's card list; absent hides the button). */
  cards?(): void;
  /** Any click or key on the table: skip the reveal animation (UX.md §8.3). */
  skip?(): void;
  /** Hotseat cover: the named player has the device and wants their hand shown. */
  reveal?(): void;
  /** Final scores: same seats, new seed. */
  rematch?(): void;
  /** The Season-end card closed (Continue or its own timer): the clock may run again. */
  seasonClosed?(): void;
}

/** Who the device goes to next (hotseat). */
export interface CoverInfo {
  name: string;
  color: string;
}

export interface TimerState {
  remainingMs: number;
  totalMs: number;
  /** The viewer has locked a pick: the ring dims (UX.md §7.1). */
  locked: boolean;
}

/** Last seconds shown in red (UX.md §7.1, Catan TIMER_WARN_SEC). */
export const TIMER_WARN_SEC = 10;
/** Matches `.dt-pop` width in table.css (used before the popover has a layout). */
const POPOVER_W = 300;
/** The Season-end card closes by itself after this long (UX.md §10.1). */
export const SEASON_CARD_MS = 8000;

const STATUS_MARK: Record<SeatStatus, string> = { picked: '✓', thinking: '⋯', idle: '' };
const STATUS_TEXT: Record<SeatStatus, string> = {
  picked: 'picked',
  thinking: 'choosing',
  idle: 'waiting',
};

export function clockText(ms: number): string {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

/** The tutorial coach's focus mark (tutorial.css) on the Raid banner fact. */
function tutMark(b: SeatStat): Record<string, string> {
  return b.term === 'raid' ? { 'data-tut': 'raid' } : {};
}

export class DraftTable {
  readonly element: HTMLElement;
  /** DOM lookups and an overlay layer for the fx lane's reveal (anchors.ts, UX.md §19). */
  readonly anchors: TableAnchors;
  private model: TableModel | null = null;
  private selected: CardId | null = null;
  private readonly timerEl: HTMLElement;
  /** Choices changed inside a popover (another seller, no upgrade), by `card:use`. */
  private readonly overrides = new Map<string, Pick>();
  /** The pick turn the overrides belong to (stores and sellers change at every reveal). */
  private overridesFor = '';
  /** Hotseat pass cover (UX.md §9): while set, no hand is in the DOM at all. */
  private cover: CoverInfo | null = null;
  /** Phones: the sidebar drawer is open (R6 #3). */
  private drawerOpen = false;
  /** fx draws its reveal here: kept as the root's last child across renders. */
  private readonly fxLayer: HTMLElement;
  /** The Season-end card (UX.md §10.1): the action it was closed for, and its auto-close. */
  private seasonSeen: string | null = null;
  private seasonUp = false;
  private seasonTimerFor: string | null = null;
  private seasonTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly handlers: DraftTableHandlers) {
    this.timerEl = h('div', {
      class: 'round-badge dt-timer',
      attrs: { role: 'timer', 'aria-label': 'Pick timer' },
    });
    this.timerEl.hidden = true;
    this.element = h('div', {
      class: 'ww-shell table dt',
      attrs: { role: 'main', 'aria-label': 'Draft table' },
      on: { click: (e) => this.onClick(e), dblclick: (e) => this.onDoubleClick(e) },
    });
    this.fxLayer = h('div', { class: 'dt-fx-layer', attrs: { 'aria-hidden': 'true' } });
    this.anchors = tableAnchors(this.element, this.fxLayer);
    document.addEventListener('keydown', this.onKey);
    window.addEventListener('resize', this.placePopover);
  }

  /** Stop listening to the keyboard (the table left the screen). */
  destroy(): void {
    document.removeEventListener('keydown', this.onKey);
    window.removeEventListener('resize', this.placePopover);
    if (this.seasonTimer !== null) clearTimeout(this.seasonTimer);
    this.element.remove();
  }

  update(model: TableModel): void {
    this.model = model;
    if (model.round !== this.overridesFor) {
      this.overrides.clear();
      this.overridesFor = model.round;
    }
    if (this.selected !== null && !model.hand.some((c) => c.id === this.selected)) {
      this.selected = null;
    }
    this.render();
  }

  /** Any click or key skips the reveal animation (UX.md §8.3: skippable; fx plays it). */
  private skipEffects(): void {
    this.handlers.skip?.();
  }

  /** A use as the player set it up in the popover: their changed pick, re-checked, else the default. */
  private optionFor(card: HandCard, use: string): UseOption | undefined {
    const base = card.options.find((o) => o.use.id === use);
    const changed = this.overrides.get(`${card.id}:${use}`);
    const refined = changed && base?.pick ? this.model?.refine(changed) : null;
    return refined?.pick ? refined : base;
  }

  /** The selected hand card (its action popover is open), for tests. */
  get selection(): CardId | null {
    return this.selected;
  }

  /** Only the timer ring changes (called every tick, between renders). */
  setTimer(t: TimerState | null): void {
    const el = this.timerEl;
    el.hidden = t === null;
    if (!t) return;
    const left = t.remainingMs / 1000;
    el.style.setProperty(
      '--timer',
      String(t.totalMs > 0 ? Math.max(0, t.remainingMs / t.totalMs) : 0),
    );
    el.classList.toggle('timer-low', !t.locked && left <= TIMER_WARN_SEC);
    el.classList.toggle('is-locked', t.locked);
    el.textContent = t.locked ? '✓' : clockText(t.remainingMs);
    el.setAttribute('aria-label', t.locked ? 'Pick locked' : `${clockText(t.remainingMs)} left`);
  }

  select(card: CardId | null): void {
    this.selected = card;
    this.render();
  }

  /** Show or drop the hotseat pass cover. */
  setCover(cover: CoverInfo | null): void {
    const was = this.cover?.name;
    this.cover = cover;
    if (cover) this.selected = null;
    this.render();
    if (cover && cover.name !== was) this.focusKey('reveal');
  }

  get covered(): boolean {
    return this.cover !== null;
  }

  /** The Season-end card is on screen (R7 #1: the turn clock waits while it is read). */
  get seasonOpen(): boolean {
    return this.seasonUp;
  }

  // ---- intents -----------------------------------------------------------

  private onClick(e: MouseEvent): void {
    this.skipEffects();
    const el = (e.target as Element | null)?.closest<HTMLElement>('[data-act]');
    if (!el || (el instanceof HTMLButtonElement && el.disabled)) return;
    this.run(el.dataset.act ?? '', el);
  }

  /** Double-click a hand card = its primary use (UX.md §8.1 fast path; never a bank-only Build). */
  private onDoubleClick(e: MouseEvent): void {
    const el = (e.target as Element | null)?.closest<HTMLElement>('[data-act^="select:"]');
    const card = this.model?.hand.find((c) => `select:${c.id}` === el?.dataset.act);
    const first =
      card && primaryOption(card.options.map((o) => this.optionFor(card, o.use.id) ?? o));
    if (card && first) this.pickUse(card.id, first.use.id);
  }

  private run(act: string, el?: HTMLElement): void {
    const [verb, a = '', b = '', c = '', d = ''] = act.split(':');
    const m = this.model;
    switch (verb) {
      case 'choose': {
        // choose:<card>:<use>:<row>:<option>
        const card = m?.hand.find((x) => x.id === Number(a));
        const chosen = card && this.optionFor(card, b)?.choices[Number(c)]?.options[Number(d)];
        if (card && chosen && !chosen.why) {
          this.overrides.set(`${card.id}:${b}`, chosen.pick);
          this.render();
        }
        break;
      }
      case 'select':
        this.select(this.selected === Number(a) ? null : Number(a));
        break;
      case 'deselect':
        this.select(null);
        break;
      case 'pick':
        this.pickUse(Number(a), b);
        break;
      case 'unpick':
        if (m?.canUnpick) this.handlers.unpick();
        break;
      case 'answer': {
        const answer = m?.prompt?.answers[Number(a)];
        if (m?.prompt && answer) this.handlers.answer(m.prompt.id, answer.answer);
        break;
      }
      case 'new':
        this.handlers.newGame?.();
        break;
      case 'reveal':
        this.handlers.reveal?.();
        break;
      case 'season-ok':
        this.closeSeasonCard();
        break;
      case 'recall':
        if (m) this.openRecall(m);
        break;
      case 'catalog':
        this.handlers.cards?.();
        break;
      case 'drawer':
        this.drawerOpen = !this.drawerOpen;
        this.render();
        break;
      case 'explain': {
        // R6 #7: a tap says what a number is (touch has no hover).
        const text = el?.dataset.explain;
        if (text) showToast(text, 'info', 2500);
        break;
      }
      case 'rematch':
        this.handlers.rematch?.();
        break;
    }
  }

  private pickUse(card: CardId, use: string): void {
    const hc = this.model?.hand.find((c) => c.id === card);
    const option = hc && this.optionFor(hc, use);
    if (!option?.pick) return;
    this.select(null);
    this.handlers.pick(option.pick);
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    const m = this.model;
    if (!m || !this.element.isConnected || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target instanceof Element ? e.target : null;
    if (t?.closest('input, textarea, select, [contenteditable="true"], .ww-menu')) return;
    this.skipEffects();
    if (document.querySelector('.ww-scrim')) return;
    const key = e.key.toLowerCase();
    const digit = /^[1-9]$/.test(key) ? Number(key) - 1 : -1;
    if (m.prompt) {
      const answer = m.prompt.answers[digit];
      if (answer) {
        e.preventDefault();
        this.handlers.answer(m.prompt.id, answer.answer);
      }
      return;
    }
    if (digit >= 0) {
      const card = m.hand[digit];
      if (card) {
        e.preventDefault();
        this.select(card.id);
        this.focusKey(`card-${card.id}`);
      }
      return;
    }
    if (key === 'escape' && this.selected !== null) {
      e.preventDefault();
      this.select(null);
      return;
    }
    if (key === 'z' && m.canUnpick) {
      e.preventDefault();
      this.handlers.unpick();
      return;
    }
    if (this.selected !== null) {
      const card = m.hand.find((c) => c.id === this.selected);
      const option = card?.options.find((o) => o.use.key === key);
      if (card && option?.pick) {
        e.preventDefault();
        this.pickUse(card.id, option.use.id);
      }
    }
  };

  // ---- rendering ---------------------------------------------------------

  private focusKey(key: string): void {
    this.element.querySelector<HTMLElement>(`[data-k="${key}"]`)?.focus();
  }

  private render(): void {
    const m = this.model;
    if (!m) return;
    const focused = document.activeElement?.getAttribute('data-k');
    // Test hooks (UX.md §18): what the table shows, readable without parsing text.
    this.element.dataset.phase = this.cover ? 'cover' : m.phase;
    this.element.dataset.viewer = m.viewer === null ? '' : String(m.viewer);
    this.seasonUp =
      !m.result && !this.cover && m.seasonEnd !== null && m.actionKey !== this.seasonSeen;
    patchChildren(this.element, [
      this.top(m),
      this.neighbour(m.left, 'left', m),
      this.town(m),
      this.neighbour(m.right, 'right', m),
      this.cover ? this.hiddenHand() : this.hand(m),
      this.side(m),
      ...(m.result
        ? [this.result(m.result)]
        : this.cover
          ? [this.coverScreen(this.cover)]
          : this.seasonUp && m.seasonEnd
            ? [this.seasonCard(m.seasonEnd)]
            : []),
      this.fxLayer,
    ]);
    if (focused && !this.element.contains(document.activeElement)) this.focusKey(focused);
    this.placePopover();
    // R6 #10: the newest log line is always in view.
    const log = this.element.querySelector('.dt-log ol');
    if (log) log.scrollTop = log.scrollHeight;
  }

  /**
   * The popover is `position: fixed` (the hand row scrolls sideways, which would clip it):
   * centre it above the selected card. Phones ignore this and show a bottom sheet.
   */
  private readonly placePopover = (): void => {
    const pop = this.element.querySelector<HTMLElement>('.dt-pop');
    const card = pop?.parentElement?.querySelector('.dt-card');
    if (!pop || !card) return;
    const r = card.getBoundingClientRect();
    const w = pop.offsetWidth || POPOVER_W;
    const x = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
    pop.style.setProperty('--pop-x', `${Math.round(x)}px`);
    // The card is still rising (translateY -10px) when this runs: leave room for the lift.
    pop.style.setProperty('--pop-y', `${Math.round(window.innerHeight - r.top + 22)}px`);
  };

  private top(m: TableModel): HTMLElement {
    // R7 #3: phones keep only the arrow; the words are for wider screens and screen readers.
    const pass =
      m.pass &&
      h(
        'span',
        { class: 'dt-pass' },
        ' · ',
        h('span', { class: 'dt-pass-words' }, 'hands pass '),
        m.pass.arrow,
        h('span', { class: 'dt-pass-words' }, ` to ${m.pass.to}`),
      );
    return h(
      'header',
      { class: 'dt-top' },
      h('div', { class: 'dt-round' }, m.round, pass),
      h(
        'div',
        { class: 'dt-banners' },
        ...m.banner
          .filter((b) => !b.group)
          .map((b) => h('div', { class: 'dt-banner', attrs: tutMark(b) }, this.stat(b))),
      ),
      h('div', { class: 'dt-status', attrs: { 'aria-live': 'polite' } }, m.status),
      this.timerEl,
      // R6 #3: on phones the Table list, reveal and log live in a drawer.
      h(
        'button',
        {
          class: 'btn btn-sm dt-drawer-btn',
          attrs: {
            'data-act': 'drawer',
            'data-k': 'drawer',
            'aria-expanded': String(this.drawerOpen),
            'aria-controls': 'dt-side',
          },
        },
        'Table & log',
      ),
      h(
        'ol',
        { class: 'dt-chips', attrs: { 'aria-label': 'Pick status' } },
        ...m.seats.map((s) =>
          h(
            'li',
            {
              class: `dt-chip is-${s.status}${s.you ? ' is-you' : ''}`,
              style: { '--seat': s.color },
              attrs: {
                'aria-label': `${s.you ? 'You' : s.name}: ${STATUS_TEXT[s.status]}`,
                'data-seat': String(s.seat),
                'data-status': s.status,
              },
            },
            h('span', { class: 'dt-dot', attrs: { 'aria-hidden': 'true' } }),
            h('span', { class: 'dt-chip-name' }, s.you ? 'You' : s.name),
            h(
              'span',
              { class: 'dt-chip-st', attrs: { 'aria-hidden': 'true' } },
              STATUS_MARK[s.status],
            ),
          ),
        ),
      ),
    );
  }

  /** One number with its icon. A tap explains it (R6 #7: touch has no hover titles). */
  private stat(st: SeatStat, labelled = false): HTMLElement {
    return h(
      'span',
      {
        class: `dt-stat is-${st.id}${st.dim ? ' is-dim' : ''}`,
        title: st.label,
        attrs: {
          'aria-label': `${st.label}: ${st.value}`,
          'data-act': 'explain',
          'data-explain': `${st.label}: ${st.value}`,
          ...(st.term ? { 'data-term': st.term } : {}),
        },
      },
      st.icon &&
        h('img', { class: 'dt-icon', attrs: { src: st.icon, alt: '', 'aria-hidden': 'true' } }),
      labelled && st.short && h('span', { class: 'dt-stat-label' }, st.short),
      st.value,
    );
  }

  /**
   * A seat's numbers. 'labelled' (your town) shows the short labels; 'compact' (you and your
   * neighbours in the Table list, whose panels show everything) keeps only the first number.
   */
  private stats(s: SeatModel, mode: 'full' | 'labelled' | 'compact' = 'full'): HTMLElement {
    if (mode === 'compact') {
      const first = s.stats.find((st) => st.id === 'score') ?? s.stats[0];
      return h('div', { class: 'dt-stats' }, first && this.stat(first));
    }
    const store = s.stats.filter((st) => st.group === 'store');
    return h(
      'div',
      { class: 'dt-stats' },
      ...s.stats.filter((st) => !st.group).map((st) => this.stat(st, mode === 'labelled')),
      store.length > 0 &&
        h(
          'div',
          { class: 'dt-store', attrs: { 'aria-label': 'Store' } },
          ...store.map((st) => this.stat(st)),
        ),
      ...s.counts.map((c) =>
        h(
          'span',
          {
            class: 'dt-count',
            title: c.kind.label,
            attrs: { 'aria-label': `${c.n} ${c.kind.label}` },
          },
          this.kindMark(c.kind),
          c.n,
        ),
      ),
    );
  }

  private zones(s: SeatModel): Child {
    const shown = s.zones.filter((z) => z.count > 0);
    if (shown.length === 0) return null;
    return h(
      'div',
      { class: 'dt-zones' },
      ...shown.map((z) =>
        h(
          'div',
          { class: 'dt-zone' },
          h('span', { class: 'dt-zone-label' }, `${z.label} ${z.count}`),
          ...(z.cards
            ? z.cards.map((c) => this.mini(c))
            : [h('span', { class: 'muted' }, z.count ? '(hidden)' : '')]),
        ),
      ),
    );
  }

  private neighbour(s: SeatModel | null, side: 'left' | 'right', m: TableModel): HTMLElement {
    const area = `dt-nb dt-${side}`;
    if (!s) return h('section', { class: `${area} is-empty`, attrs: { 'aria-hidden': 'true' } });
    const arrow = side === 'left' ? '◀' : '▶';
    const passing = m.pass?.dir === side;
    return h(
      'section',
      {
        class: `${area} seat`,
        style: { '--seat': s.color },
        attrs: {
          'aria-label': `${side === 'left' ? 'Left' : 'Right'} neighbour: ${s.name}`,
          'data-seat': String(s.seat),
          'data-tut': 'neighbours',
        },
      },
      h(
        'header',
        { class: 'dt-nb-head' },
        h(
          'span',
          {
            class: `dt-arrow${passing ? ' is-pass' : ''}`,
            title: passing ? 'Your hand goes here' : '',
          },
          arrow,
        ),
        h('span', { class: 'seat-mark', attrs: { 'aria-hidden': 'true' } }),
        h('span', { class: 'seat-name' }, s.name),
        s.bot && h('span', { class: 'dt-tag' }, 'bot'),
        h(
          'span',
          { class: `dt-chip-st is-${s.status}`, attrs: { 'aria-label': STATUS_TEXT[s.status] } },
          STATUS_MARK[s.status],
        ),
      ),
      this.stats(s),
      this.monument(s.monument, 'small'),
      h(
        'ul',
        { class: 'dt-list' },
        ...s.columns.flatMap((col) => col.cards.map((c) => h('li', {}, this.mini(c)))),
      ),
      s.columns.length === 0 && h('p', { class: 'muted dt-empty' }, 'No cards yet'),
      this.zones(s),
    );
  }

  private town(m: TableModel): HTMLElement {
    const me = m.me;
    if (!me) return h('section', { class: 'dt-town' }, h('p', { class: 'muted' }, 'Watching'));
    return h(
      'section',
      {
        class: 'dt-town',
        attrs: { 'aria-label': 'Your town', 'data-seat': String(me.seat), 'data-tut': 'town' },
      },
      h(
        'header',
        { class: 'dt-town-head' },
        h('h2', {}, 'Your town'),
        h('span', { class: 'dt-town-name' }, me.name),
        this.stats(me, 'labelled'),
      ),
      this.monument(me.monument, 'large'),
      me.columns.length
        ? h(
            'div',
            { class: 'dt-cols' },
            ...me.columns.map((col) =>
              h(
                'div',
                { class: 'dt-col' },
                h(
                  'div',
                  { class: 'dt-col-head' },
                  this.kindMark(col.kind),
                  `${col.kind.label} ${col.cards.length}`,
                ),
                ...col.cards.map((c) => this.mini(c)),
              ),
            ),
          )
        : h('p', { class: 'muted dt-empty' }, 'Cards you build land here.'),
      this.zones(me),
      this.stage(m),
    );
  }

  /** The face-down slot where your locked pick waits for the reveal (UX.md §7.2, §8.2). */
  /** The hand row while a pass cover is up: no cards, no names, nothing to peek at. */
  private hiddenHand(): HTMLElement {
    return h(
      'section',
      { class: 'dt-hand is-hidden', attrs: { 'aria-label': 'Hand hidden' } },
      h('header', { class: 'dt-hand-head' }, h('h2', {}, 'Hand hidden')),
      h('div', { class: 'dt-cards' }),
    );
  }

  /** UX.md §9: "Pass to Ana", then Ana shows her own hand. Port of catan's coverScreen. */
  /** UX.md §10.1: each town's Raid result and bounties, then the next Season's pass direction. */
  private seasonCard(s: SeasonEndInfo): HTMLElement {
    const key = this.model?.actionKey ?? '';
    if (this.seasonTimerFor !== key) {
      this.seasonTimerFor = key;
      if (this.seasonTimer !== null) clearTimeout(this.seasonTimer);
      this.seasonTimer = setTimeout(() => this.closeSeasonCard(), SEASON_CARD_MS);
      queueMicrotask(() => this.focusKey('season-ok'));
    }
    return h(
      'div',
      { class: 'ww-scrim dt-season-scrim' },
      h(
        'div',
        {
          class: 'ww-dialog dt-season',
          attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'dt-season-title' },
        },
        h('h2', { id: 'dt-season-title' }, s.title),
        h(
          'ul',
          { class: 'dt-season-lines' },
          ...s.lines.map((l) =>
            h(
              'li',
              {
                class: `is-${l.tone}`,
                attrs: l.seat === null ? {} : { 'data-seat': String(l.seat) },
              },
              l.text,
            ),
          ),
        ),
        s.next && h('p', { class: 'dt-season-next' }, s.next),
        h(
          'div',
          { class: 'ww-dialog-actions' },
          h(
            'button',
            { class: 'btn btn-primary', attrs: { 'data-act': 'season-ok', 'data-k': 'season-ok' } },
            'Continue',
          ),
        ),
      ),
    );
  }

  /** R15.8: the cards the viewer saw in each hand it passed this Season. */
  private openRecall(m: TableModel): void {
    openDialog({
      title: 'Seen this Season',
      className: 'is-wide dt-list-dialog',
      body: [
        h('p', { class: 'muted' }, 'The hands you passed on, as you last saw them.'),
        ...m.recall.map((r) =>
          h(
            'section',
            { class: 'dt-recall' },
            h('h3', {}, r.title),
            h('div', { class: 'dt-recall-cards' }, ...r.cards.map((c) => this.mini(c))),
          ),
        ),
      ],
      actions: [{ label: 'Close', primary: true }],
    });
  }

  private closeSeasonCard(): void {
    if (this.seasonTimer !== null) clearTimeout(this.seasonTimer);
    this.seasonTimer = null;
    this.seasonSeen = this.model?.actionKey ?? null;
    this.render();
    this.handlers.seasonClosed?.();
  }

  private coverScreen(c: CoverInfo): HTMLElement {
    return h(
      'div',
      { class: 'ww-scrim dt-cover' },
      h(
        'div',
        {
          class: 'ww-dialog dt-cover-card',
          style: { '--seat': c.color },
          attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'dt-cover-title' },
        },
        h('p', { class: 'muted' }, 'Hotseat: hide your cards'),
        h('h2', { id: 'dt-cover-title' }, h('span', { class: 'dt-dot' }), ` Pass to ${c.name}`),
        h(
          'div',
          { class: 'ww-dialog-actions' },
          h(
            'button',
            {
              class: 'btn btn-primary btn-lg',
              attrs: { 'data-act': 'reveal', 'data-k': 'reveal' },
            },
            `I'm ${c.name}, show my hand`,
          ),
        ),
      ),
    );
  }

  private stage(m: TableModel): HTMLElement {
    const st = this.cover ? null : m.staged;
    return h(
      'div',
      { class: `dt-stage${st ? ' is-full' : ''}` },
      st
        ? h(
            'div',
            {
              class: 'dt-back',
              attrs: { 'aria-label': `Locked: ${st.use?.label ?? ''} ${st.card.face.name}` },
            },
            h('span', {}, '✓'),
          )
        : h('div', { class: 'dt-back is-empty', attrs: { 'aria-hidden': 'true' } }),
      h(
        'div',
        { class: 'dt-stage-text' },
        st
          ? `Locked: ${st.use?.label ?? 'pick'} ${st.card.face.name}`
          : m.phase === 'pick' && m.me?.status === 'thinking'
            ? 'Your pick waits here face down until everyone has picked.'
            : '',
      ),
      st &&
        h(
          'button',
          {
            class: 'btn btn-sm btn-ghost',
            attrs: { 'data-act': 'unpick', 'data-k': 'unpick', 'aria-keyshortcuts': 'Z' },
          },
          '↶ Change pick ',
          h('kbd', {}, 'Z'),
        ),
    );
  }

  private mini(c: TableauCard): HTMLElement {
    return h(
      'span',
      {
        class: `dt-mini${c.fresh ? ' is-fresh' : ''}`,
        title: `${c.face.name}: ${c.face.text}`,
        attrs: { 'data-card': String(c.id), 'data-kind': c.kind.id },
      },
      this.kindMark(c.kind),
      h('span', { class: 'dt-mini-name' }, c.face.name),
    );
  }

  /** Amounts as icon + number (R6 #5); each carries its words for hover and screen readers. */
  private parts(parts: readonly FacePart[]): HTMLElement[] {
    return parts.map((p) =>
      h(
        'span',
        { class: 'dt-part', title: p.label, attrs: p.term ? { 'data-term': p.term } : {} },
        p.icon &&
          h('img', { class: 'dt-icon', attrs: { src: p.icon, alt: '', 'aria-hidden': 'true' } }),
        p.text,
      ),
    );
  }

  /**
   * Art A8's kind badge: a CSS shape in the kind's colour (kinds.css), so kinds differ by
   * silhouette at 12-14 px; the kind's name is always printed nearby. Never colour alone.
   */
  private kindMark(kind: KindInfo): HTMLElement {
    return h('span', {
      class: 'kind-badge dt-kind',
      attrs: {
        'data-kind': kind.id,
        'aria-hidden': 'true',
        ...(kind.term ? { 'data-term': kind.term } : {}),
      },
    });
  }

  /** Inline SVG art; with `tiers`, the layers above that many completed tiers fade. */
  private art(url: string, cls: string, tiers?: number): HTMLElement {
    const el = h('span', { class: `dt-art ${cls}`, attrs: { 'aria-hidden': 'true' } });
    const text = svgText(url, () => this.render());
    if (text) fillSvg(el, text, tiers);
    return el;
  }

  /** The Great Work strip (UX.md §7.2): art, tiers, labour, Perk. */
  private monument(mo: MonumentInfo | null, size: 'large' | 'small'): Child {
    if (!mo) return null;
    return h(
      'div',
      {
        class: `dt-monument is-${size}`,
        attrs: {
          'aria-label': `${mo.name}: ${mo.tiers} of ${mo.total} tiers. ${mo.progress}`,
          // The tutorial coach points at your own Great Work (the large one, in your town).
          ...(size === 'large' ? { 'data-tut': 'monument' } : {}),
        },
      },
      mo.art && this.art(mo.art, 'dt-monument-art', mo.tiers),
      h(
        'div',
        { class: 'dt-monument-text' },
        h('span', { class: 'dt-monument-name' }, `${mo.name} · ${mo.tiers}/${mo.total}`),
        h('span', { class: 'dt-monument-progress' }, mo.progress),
        size === 'large' && mo.perk && h('span', { class: 'dt-monument-perk' }, `Perk: ${mo.perk}`),
      ),
    );
  }

  private hand(m: TableModel): HTMLElement {
    if (m.prompt) return this.prompt(m.prompt);
    const head = h(
      'header',
      { class: 'dt-hand-head' },
      h('h2', {}, `Your hand · ${m.hand.length} card${m.hand.length === 1 ? '' : 's'}`),
      m.hand.length > 0 &&
        h('span', { class: 'muted dt-keys' }, 'Keys: 1–9 select · letter = use · Esc'),
      h(
        'span',
        { class: 'dt-hand-tools' },
        // R15.8 Recall and R6 #8 the card list: one click away, never hover-only.
        m.recall.length > 0 &&
          h(
            'button',
            { class: 'btn btn-sm btn-ghost', attrs: { 'data-act': 'recall', 'data-k': 'recall' } },
            `Seen this Season (${m.recall.length})`,
          ),
        this.handlers.cards &&
          h(
            'button',
            {
              class: 'btn btn-sm btn-ghost',
              attrs: { 'data-act': 'catalog', 'data-k': 'catalog' },
            },
            'All cards',
          ),
      ),
    );
    return h(
      'section',
      {
        class: `dt-hand${m.staged ? ' is-locked' : ''}`,
        attrs: { 'aria-label': 'Your hand', 'data-tut': 'hand' },
      },
      head,
      h(
        'div',
        { class: 'dt-cards' },
        ...m.hand.map((c, i) => this.handCard(c, i)),
        m.hand.length === 0 &&
          h('p', { class: 'muted dt-empty' }, m.phase === 'gameOver' ? '' : 'No cards in hand'),
      ),
    );
  }

  private handCard(c: HandCard, i: number): HTMLElement {
    const open = this.selected === c.id;
    return h(
      'div',
      { class: `dt-slot${open ? ' is-open' : ''}` },
      h(
        'button',
        {
          class: `dt-card${c.playable ? '' : ' is-unplayable'}${c.staged ? ' is-staged' : ''}`,
          attrs: {
            'data-act': `select:${c.id}`,
            'data-k': `card-${c.id}`,
            'data-card': String(c.id),
            'data-def': c.def,
            'data-playable': String(c.playable),
            'aria-pressed': String(open),
            'aria-keyshortcuts': i < 9 ? String(i + 1) : '',
            'aria-label': `${c.face.name}, ${c.kind.label}${c.face.cost ? `, costs ${c.face.cost}` : ''}: ${c.face.text}${c.face.alt ? `. ${c.face.alt}` : ''}${c.badge ? `. ${c.badge.text}` : ''}${c.staged ? '. Your locked pick' : ''}`,
            'data-afford': c.badge?.tone ?? '',
          },
        },
        h(
          'span',
          // Art A8: the header band takes the kind's colour.
          { class: 'dt-card-band kind-head', attrs: { 'data-kind': c.kind.id } },
          h('span', { class: 'dt-card-name' }, c.face.name),
        ),
        c.face.art &&
          h('img', {
            class: 'dt-card-art',
            attrs: { src: c.face.art, alt: '', 'aria-hidden': 'true', loading: 'lazy' },
          }),
        c.face.costParts?.length
          ? h('span', { class: 'dt-card-cost' }, ...this.parts(c.face.costParts))
          : c.face.cost && h('span', { class: 'dt-card-cost' }, c.face.cost),
        h('span', { class: 'dt-card-text' }, c.face.text),
        c.face.altParts?.length
          ? h(
              'span',
              { class: 'dt-card-alt' },
              h('span', { class: 'dt-card-alt-label' }, 'Spend'),
              ...this.parts(c.face.altParts),
            )
          : c.face.alt && h('span', { class: 'dt-card-alt' }, c.face.alt),
        // R6 #1: can I build this, and what does it cost? Before the tap.
        c.badge &&
          !c.staged &&
          h(
            'span',
            { class: `dt-card-afford is-${c.badge.tone}`, attrs: { 'aria-hidden': 'true' } },
            c.badge.text,
          ),
        h('span', { class: 'dt-card-kind' }, this.kindMark(c.kind), ` ${c.kind.label}`),
        h(
          'span',
          { class: 'dt-card-badge', attrs: { 'aria-hidden': 'true' } },
          c.staged ? '✓ locked' : i < 9 ? `${i + 1}` : '',
        ),
      ),
      open && this.popover(c),
    );
  }

  /**
   * One button per use with what it costs or gives; under a legal use, its choice rows (who to
   * buy a good from, upgrade or not). Impossible uses stay visible, disabled, with the reason.
   */
  private popover(c: HandCard): HTMLElement {
    const options = c.options.map((o) => this.optionFor(c, o.use.id) ?? o);
    const best = primaryOption(options);
    const primary = best ? options.indexOf(best) : -1;
    return h(
      'div',
      { class: 'dt-pop', attrs: { role: 'group', 'aria-label': `${c.face.name}: choose a use` } },
      h('div', { class: 'dt-pop-title' }, c.face.name),
      h('div', { class: 'dt-pop-text' }, c.face.text),
      ...options.map((o, i) =>
        o.pick
          ? h(
              'div',
              { class: 'dt-use-ok' },
              h(
                'button',
                {
                  class: `btn ${i === primary ? 'btn-primary' : ''} dt-use`,
                  attrs: {
                    'data-act': `pick:${c.id}:${o.use.id}`,
                    'data-k': `use-${c.id}-${o.use.id}`,
                    'data-use': o.use.id,
                    'data-card': String(c.id),
                    'aria-keyshortcuts': o.use.key.toUpperCase(),
                    ...(o.use.term ? { 'data-term': o.use.term } : {}),
                  },
                },
                h(
                  'span',
                  { class: 'dt-use-main' },
                  h('span', { class: 'dt-use-label' }, o.use.label),
                  o.detail && h('span', { class: 'dt-use-detail' }, o.detail),
                  o.purse &&
                    h(
                      'span',
                      { class: `dt-use-purse${o.purse.warn ? ' is-warn' : ''}` },
                      `Coins ${o.purse.before} → ${o.purse.after}`,
                      o.purse.warn ? ' · bank' : '',
                    ),
                ),
                h('kbd', {}, o.use.key.toUpperCase()),
              ),
              ...o.choices.map((row, r) => this.choiceRow(c, o, row, r)),
            )
          : h(
              'div',
              { class: 'dt-use-no' },
              h(
                'button',
                {
                  class: 'btn dt-use',
                  disabled: true,
                  attrs: {
                    'data-k': `use-${c.id}-${o.use.id}`,
                    'data-use': o.use.id,
                    'data-card': String(c.id),
                    'aria-describedby': `why-${c.id}-${o.use.id}`,
                  },
                },
                o.use.label,
              ),
              h('span', { class: 'why', id: `why-${c.id}-${o.use.id}` }, o.why ?? ''),
            ),
      ),
    );
  }

  private choiceRow(c: HandCard, o: UseOption, row: UseOption['choices'][number], r: number) {
    return h(
      'div',
      {
        class: 'dt-choice',
        attrs: { role: 'radiogroup', 'aria-label': row.label, 'data-choice': row.key },
      },
      h('span', { class: 'dt-choice-label' }, row.label),
      h(
        'span',
        { class: 'seg' },
        ...row.options.map((opt, k) =>
          h(
            'button',
            {
              class: `seg-btn${opt.selected ? ' is-on' : ''}${opt.warn ? ' is-warn' : ''}`,
              disabled: opt.why !== null,
              title: opt.why ?? '',
              attrs: {
                role: 'radio',
                'aria-checked': String(opt.selected),
                'data-act': `choose:${c.id}:${o.use.id}:${r}:${k}`,
                'data-k': `choice-${c.id}-${o.use.id}-${r}-${k}`,
                'data-option': opt.key,
              },
            },
            opt.label,
          ),
        ),
      ),
    );
  }

  /**
   * The viewer's open prompt in the hand row: one card-like button per answer. Answers to a
   * group prompt (the Great Work choice) stay hidden and changeable until everyone has chosen.
   */
  private prompt(p: PromptModel): HTMLElement {
    const chosen = p.answers.find((a) => a.chosen);
    return h(
      'section',
      { class: 'dt-hand dt-prompt', attrs: { 'aria-label': p.title, 'data-tut': 'hand' } },
      h(
        'header',
        { class: 'dt-hand-head' },
        h('h2', {}, p.title),
        h(
          'span',
          { class: 'muted dt-keys' },
          chosen ? `You chose ${chosen.label}. You can still change it.` : p.hint,
        ),
      ),
      h(
        'div',
        { class: 'dt-answers', attrs: { role: 'radiogroup', 'aria-label': p.title } },
        ...p.answers.map((a, i) =>
          h(
            'button',
            {
              class: `btn dt-answer${a.chosen ? ' is-chosen' : ''}${
                !p.answered && i === 0 ? ' btn-primary' : ''
              }`,
              attrs: {
                role: 'radio',
                'aria-checked': String(a.chosen),
                'data-act': `answer:${i}`,
                'data-k': `answer-${i}`,
                'data-answer': typeof a.answer === 'string' ? a.answer : JSON.stringify(a.answer),
                'aria-keyshortcuts': i < 9 ? String(i + 1) : '',
              },
            },
            h(
              'span',
              { class: 'dt-answer-head' },
              h('span', { class: 'dt-answer-label' }, a.chosen ? `✓ ${a.label}` : a.label),
              i < 9 && h('kbd', {}, String(i + 1)),
            ),
            a.art && this.art(a.art, 'dt-answer-art', 4),
            a.detail && h('span', { class: 'dt-answer-detail' }, a.detail),
          ),
        ),
      ),
    );
  }

  private side(m: TableModel): HTMLElement {
    const neighbour = (s: SeatModel) =>
      s.seat === m.left?.seat ? '◀' : s.seat === m.right?.seat ? '▶' : '';
    const shownElsewhere = (s: SeatModel) =>
      s.you || s.seat === m.left?.seat || s.seat === m.right?.seat;
    return h(
      'aside',
      { class: `dt-side${this.drawerOpen ? ' is-open' : ''}`, id: 'dt-side' },
      // Phones only (CSS): the drawer closes from inside itself.
      h(
        'div',
        { class: 'dt-drawer-head' },
        h(
          'button',
          { class: 'btn btn-sm', attrs: { 'data-act': 'drawer', 'data-k': 'drawer-close' } },
          'Close',
        ),
      ),
      h(
        'section',
        { class: 'dt-sum', attrs: { 'aria-label': 'Table' } },
        h(
          'h2',
          {},
          'Table',
          m.pass && h('span', { class: 'muted dt-ring' }, ` · hands pass ${m.pass.arrow}`),
        ),
        h(
          'ol',
          { class: 'dt-rows' },
          ...m.seats.map((s) =>
            h(
              'li',
              {
                class: `dt-row${s.you ? ' is-you' : ''}`,
                style: { '--seat': s.color },
                attrs: { 'data-seat': String(s.seat), 'data-status': s.status },
              },
              h('span', { class: 'dt-dot', attrs: { 'aria-hidden': 'true' } }),
              h(
                'span',
                { class: 'dt-row-name' },
                s.you ? `${s.name} (you)` : s.name,
                s.bot && h('span', { class: 'dt-tag' }, 'bot'),
              ),
              h('span', { class: 'dt-nbmark', attrs: { 'aria-hidden': 'true' } }, neighbour(s)),
              h(
                'span',
                {
                  class: `dt-chip-st is-${s.status}`,
                  attrs: { 'aria-label': STATUS_TEXT[s.status] },
                },
                STATUS_MARK[s.status],
              ),
              // R6 #7: your town and your neighbours' panels already show every number.
              this.stats(s, shownElsewhere(s) ? 'compact' : 'full'),
              s.monument &&
                !shownElsewhere(s) &&
                h(
                  'span',
                  { class: 'dt-row-work', title: s.monument.name },
                  `${s.monument.name} ${s.monument.tiers}/${s.monument.total}`,
                ),
            ),
          ),
        ),
        ...m.banner
          .filter((b) => b.group === 'side')
          .map((b) => h('p', { class: 'dt-side-fact', attrs: tutMark(b) }, this.stat(b))),
      ),
      m.reveal &&
        h(
          'section',
          {
            class: 'dt-reveal',
            attrs: { 'aria-label': 'Last reveal' },
          },
          h('h2', {}, m.reveal.title),
          h(
            'ul',
            {},
            ...m.reveal.lines.map((l) =>
              h(
                'li',
                { attrs: { 'data-seat': String(l.seat) } },
                h('b', {}, l.you ? 'You' : l.name),
                ` ${l.verb} `,
                this.kindMark(l.kind),
                ` ${l.face.name}`,
              ),
            ),
          ),
          // R6 #4: the interaction (purchases, tolls, Raids, bounties), not just the cards.
          m.reveal.happenings.length > 0 &&
            h('ul', { class: 'dt-happenings' }, ...m.reveal.happenings.map((t) => h('li', {}, t))),
        ),
      h(
        'section',
        { class: 'dt-log', attrs: { 'aria-label': 'Log' } },
        h('h2', {}, 'Log'),
        h('ol', {}, ...m.log.map((l) => h('li', { attrs: { 'data-k': `log-${l.key}` } }, l.text))),
      ),
    );
  }

  private result(r: ResultModel): HTMLElement {
    return h(
      'div',
      { class: 'ww-scrim dt-result-scrim' },
      h(
        'div',
        {
          class: 'ww-dialog is-wide dt-result',
          attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'dt-result-title' },
        },
        h('h2', { id: 'dt-result-title' }, 'Final scores'),
        // UX.md §10.2: one card per town, best first, its score in bands (not a score pad).
        h(
          'ol',
          { class: 'dt-bands' },
          ...r.columns.map((c, i) =>
            h(
              'li',
              {
                class: `dt-band-card${c.winner ? ' is-winner' : ''}`,
                style: { '--seat': c.color },
                attrs: {
                  'aria-label': `${c.rank}. ${c.you ? 'You' : c.name}: ${c.total}`,
                  'data-seat': String(c.seat),
                },
              },
              h(
                'div',
                { class: 'dt-band-head' },
                h('span', { class: 'dt-band-rank' }, `${c.rank}.`),
                h('span', { class: 'dt-dot' }),
                h('span', { class: 'dt-band-name' }, c.you ? 'You' : c.name),
                h('span', { class: 'dt-band-total' }, c.total),
              ),
              h(
                'dl',
                {},
                ...r.rows.flatMap((row) => [
                  h('dt', {}, row.label),
                  h('dd', {}, row.values[i] ?? 0),
                ]),
              ),
            ),
          ),
        ),
        h('p', { class: 'dt-headline' }, r.headline),
        h(
          'div',
          { class: 'ww-dialog-actions' },
          this.handlers.rematch &&
            h(
              'button',
              { class: 'btn', attrs: { 'data-act': 'rematch', 'data-k': 'rematch' } },
              'Rematch',
            ),
          this.handlers.newGame &&
            h(
              'button',
              { class: 'btn btn-primary', attrs: { 'data-act': 'new', 'data-k': 'new' } },
              'New game',
            ),
        ),
      ),
    );
  }
}
