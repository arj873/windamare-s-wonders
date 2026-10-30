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
import { h, patchChildren, type Child } from '../dom';
import type {
  HandCard,
  PromptModel,
  ResultModel,
  SeatModel,
  SeatStatus,
  TableModel,
  TableauCard,
  UseOption,
} from './model';
import type { SeatStat } from './present';
import '../shell.css';
import './table.css';

export interface DraftTableHandlers {
  pick(pick: Pick): void;
  unpick(): void;
  answer(prompt: number, answer: Json): void;
  /** Final scores: "New game" (absent hides the button). */
  newGame?(): void;
  /** Hotseat cover: the named player has the device and wants their hand shown. */
  reveal?(): void;
  /** Final scores: same seats, new seed. */
  rematch?(): void;
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

export class DraftTable {
  readonly element: HTMLElement;
  private model: TableModel | null = null;
  private selected: CardId | null = null;
  private readonly timerEl: HTMLElement;
  /** Choices changed inside a popover (another seller, no upgrade), by `card:use`. */
  private readonly overrides = new Map<string, Pick>();
  /** The pick turn the overrides belong to (stores and sellers change at every reveal). */
  private overridesFor = '';
  /** Hotseat pass cover (UX.md §9): while set, no hand is in the DOM at all. */
  private cover: CoverInfo | null = null;

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
    document.addEventListener('keydown', this.onKey);
    window.addEventListener('resize', this.placePopover);
  }

  /** Stop listening to the keyboard (the table left the screen). */
  destroy(): void {
    document.removeEventListener('keydown', this.onKey);
    window.removeEventListener('resize', this.placePopover);
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

  // ---- intents -----------------------------------------------------------

  private onClick(e: MouseEvent): void {
    const el = (e.target as Element | null)?.closest<HTMLElement>('[data-act]');
    if (!el || (el instanceof HTMLButtonElement && el.disabled)) return;
    this.run(el.dataset.act ?? '');
  }

  /** Double-click a hand card = its first legal use (UX.md §8.1 fast path). */
  private onDoubleClick(e: MouseEvent): void {
    const el = (e.target as Element | null)?.closest<HTMLElement>('[data-act^="select:"]');
    const card = this.model?.hand.find((c) => `select:${c.id}` === el?.dataset.act);
    const first = card?.options.find((o) => o.pick);
    if (card && first) this.pickUse(card.id, first.use.id);
  }

  private run(act: string): void {
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
    patchChildren(this.element, [
      this.top(m),
      this.neighbour(m.left, 'left', m),
      this.town(m),
      this.neighbour(m.right, 'right', m),
      this.cover ? this.hiddenHand() : this.hand(m),
      this.side(m),
      ...(m.result ? [this.result(m.result)] : this.cover ? [this.coverScreen(this.cover)] : []),
    ]);
    if (focused && !this.element.contains(document.activeElement)) this.focusKey(focused);
    this.placePopover();
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
    const pass = m.pass && ` · hands pass ${m.pass.arrow} to ${m.pass.to}`;
    return h(
      'header',
      { class: 'dt-top' },
      h('div', { class: 'dt-round' }, m.round, pass),
      ...m.banner
        .filter((b) => !b.group)
        .map((b) => h('div', { class: 'dt-banner' }, this.stat(b))),
      h('div', { class: 'dt-status', attrs: { 'aria-live': 'polite' } }, m.status),
      this.timerEl,
      h(
        'ol',
        { class: 'dt-chips', attrs: { 'aria-label': 'Pick status' } },
        ...m.seats.map((s) =>
          h(
            'li',
            {
              class: `dt-chip is-${s.status}${s.you ? ' is-you' : ''}`,
              style: { '--seat': s.color },
              attrs: { 'aria-label': `${s.you ? 'You' : s.name}: ${STATUS_TEXT[s.status]}` },
            },
            h('span', { class: 'dt-dot', attrs: { 'aria-hidden': 'true' } }),
            s.you ? 'You' : s.name,
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

  private stat(st: SeatStat): HTMLElement {
    return h(
      'span',
      {
        class: `dt-stat is-${st.id}${st.dim ? ' is-dim' : ''}`,
        title: st.label,
        attrs: { 'aria-label': `${st.label}: ${st.value}` },
      },
      st.value,
    );
  }

  private stats(s: SeatModel): HTMLElement {
    const store = s.stats.filter((st) => st.group === 'store');
    return h(
      'div',
      { class: 'dt-stats' },
      ...s.stats.filter((st) => !st.group).map((st) => this.stat(st)),
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
          h('span', { class: 'dt-mark', attrs: { 'aria-hidden': 'true' } }, c.kind.mark),
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
        attrs: { 'aria-label': `${side === 'left' ? 'Left' : 'Right'} neighbour: ${s.name}` },
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
      { class: 'dt-town', attrs: { 'aria-label': 'Your town' } },
      h(
        'header',
        { class: 'dt-town-head' },
        h('h2', {}, 'Your town'),
        h('span', { class: 'dt-town-name' }, me.name),
        this.stats(me),
      ),
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
                  h('span', { class: 'dt-mark', attrs: { 'aria-hidden': 'true' } }, col.kind.mark),
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
      { class: `dt-mini${c.fresh ? ' is-fresh' : ''}`, title: `${c.face.name}: ${c.face.text}` },
      h('span', { class: 'dt-mark', attrs: { 'aria-hidden': 'true' } }, c.kind.mark),
      h('span', { class: 'dt-mini-name' }, c.face.name),
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
    );
    return h(
      'section',
      { class: `dt-hand${m.staged ? ' is-locked' : ''}`, attrs: { 'aria-label': 'Your hand' } },
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
            'aria-pressed': String(open),
            'aria-keyshortcuts': i < 9 ? String(i + 1) : '',
            'aria-label': `${c.face.name}, ${c.kind.label}${c.face.cost ? `, costs ${c.face.cost}` : ''}: ${c.face.text}${c.face.alt ? `. ${c.face.alt}` : ''}${c.staged ? '. Your locked pick' : ''}`,
          },
        },
        h(
          'span',
          { class: 'dt-card-band' },
          h('span', { class: 'dt-mark' }, c.kind.mark),
          h('span', { class: 'dt-card-name' }, c.face.name),
        ),
        c.face.cost && h('span', { class: 'dt-card-cost' }, c.face.cost),
        h('span', { class: 'dt-card-text' }, c.face.text),
        c.face.alt && h('span', { class: 'dt-card-alt' }, c.face.alt),
        h('span', { class: 'dt-card-kind' }, c.kind.label),
        h(
          'span',
          { class: 'dt-card-badge', attrs: { 'aria-hidden': 'true' } },
          c.staged ? '✓ locked' : c.playable ? `${i + 1}` : '✗',
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
    const primary = options.findIndex((x) => x.pick);
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
                    'aria-keyshortcuts': o.use.key.toUpperCase(),
                  },
                },
                h(
                  'span',
                  { class: 'dt-use-main' },
                  h('span', { class: 'dt-use-label' }, o.use.label),
                  o.detail && h('span', { class: 'dt-use-detail' }, o.detail),
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
      { class: 'dt-choice', attrs: { role: 'radiogroup', 'aria-label': row.label } },
      h('span', { class: 'dt-choice-label' }, row.label),
      h(
        'span',
        { class: 'seg' },
        ...row.options.map((opt, k) =>
          h(
            'button',
            {
              class: `seg-btn${opt.selected ? ' is-on' : ''}`,
              disabled: opt.why !== null,
              title: opt.why ?? '',
              attrs: {
                role: 'radio',
                'aria-checked': String(opt.selected),
                'data-act': `choose:${c.id}:${o.use.id}:${r}:${k}`,
                'data-k': `choice-${c.id}-${o.use.id}-${r}-${k}`,
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
      { class: 'dt-hand dt-prompt', attrs: { 'aria-label': p.title } },
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
                'aria-keyshortcuts': i < 9 ? String(i + 1) : '',
              },
            },
            h(
              'span',
              { class: 'dt-answer-head' },
              h('span', { class: 'dt-answer-label' }, a.chosen ? `✓ ${a.label}` : a.label),
              i < 9 && h('kbd', {}, String(i + 1)),
            ),
            a.detail && h('span', { class: 'dt-answer-detail' }, a.detail),
          ),
        ),
      ),
    );
  }

  private side(m: TableModel): HTMLElement {
    const neighbour = (s: SeatModel) =>
      s.seat === m.left?.seat ? '◀' : s.seat === m.right?.seat ? '▶' : '';
    return h(
      'aside',
      { class: 'dt-side' },
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
              { class: `dt-row${s.you ? ' is-you' : ''}`, style: { '--seat': s.color } },
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
              this.stats(s),
            ),
          ),
        ),
        ...m.banner
          .filter((b) => b.group === 'side')
          .map((b) => h('p', { class: 'dt-side-fact' }, this.stat(b))),
      ),
      m.reveal &&
        h(
          'section',
          { class: 'dt-reveal', attrs: { 'aria-label': 'Last reveal' } },
          h('h2', {}, m.reveal.title),
          h(
            'ul',
            {},
            ...m.reveal.lines.map((l) =>
              h(
                'li',
                {},
                h('b', {}, l.you ? 'You' : l.name),
                ` ${l.verb} `,
                h('span', { class: 'dt-mark', attrs: { 'aria-hidden': 'true' } }, l.kind.mark),
                ` ${l.face.name}`,
              ),
            ),
          ),
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
                attrs: { 'aria-label': `${c.rank}. ${c.you ? 'You' : c.name}: ${c.total}` },
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
