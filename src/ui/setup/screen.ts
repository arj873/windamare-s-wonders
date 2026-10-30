/**
 * The new-game setup screen (UX.md §5; port of catan's ui/setup/screen.ts): stacked sections
 * (mode, players, pick timer, more options) in a scroll area and a sticky footer with the
 * summary and Start. Owns its draft, saves it on every change, emits a `NewGameConfig`.
 */
import { h, type Child } from '../dom';
import { browserStorage } from '../prefs';
import {
  addSeat,
  BOT_LEVELS,
  buildConfig,
  DEFAULT_BOT_LEVEL,
  humanCount,
  loadSetup,
  MAX_PLAYERS,
  MIN_PLAYERS,
  MODES,
  moveSeat,
  NAME_MAX,
  pickSeatColor,
  removeSeat,
  saveSetup,
  SEAT_COLORS,
  SEED_MAX,
  setBotLevel,
  setController,
  setMode,
  setSeatName,
  setSeed,
  withPlayerName,
  setClock,
  setFirstGame,
  setupError,
  shuffleSeats,
  summaryLine,
  CLOCKS,
  clockScale,
  type BotLevel,
  type NewGameConfig,
  type SetupDraft,
  type SetupStorage,
} from './model';
import '../shell.css';
import './setup.css';

export interface SetupScreenOptions {
  onStart: (cfg: NewGameConfig) => void;
  /** A button in the footer that leaves the screen ("Back to game" unless `backLabel`). */
  onBack?: () => void;
  backLabel?: string;
  /** The home screen's nickname: names the first human seat while it has a default name. */
  playerName?: string;
  /** What a clock option means in this game ("45 s on a fresh hand, 25 s at the end"). */
  clockHint?: (scale: number) => string;
  /** The game offers a First game (RULES.md R19): show its toggle, with this one-line summary. */
  firstGame?: { hint: string };
  /** "Learn to play" in the header (UX.md §11.6); absent hides it. */
  onTutorial?: () => void;
  /** Where the draft is remembered (default localStorage; null = nowhere). */
  storage?: SetupStorage | null;
  /** Shuffle source for ↻ (tests inject one). */
  random?: () => number;
}

export class SetupScreen {
  readonly element: HTMLElement;
  private draft: SetupDraft;
  private readonly storage: SetupStorage | null;
  private readonly inner: HTMLElement;
  private readonly summary: HTMLElement;
  private readonly startBtn: HTMLButtonElement;
  /** "More options" stays open across re-renders. */
  private moreOpen = false;

  constructor(private readonly opts: SetupScreenOptions) {
    this.storage = opts.storage === undefined ? browserStorage() : opts.storage;
    this.draft = withPlayerName(loadSetup(this.storage), opts.playerName);
    this.inner = h('div', { class: 'su-inner' });
    this.summary = h('div', { class: 'su-summary', attrs: { 'data-k': 'summary' } });
    this.startBtn = h(
      'button',
      {
        class: 'btn btn-primary btn-lg su-start',
        attrs: { 'data-k': 'start' },
        on: { click: () => this.start() },
      },
      'Start game',
    );
    this.element = h(
      'div',
      { class: 'ww-shell setup', attrs: { role: 'dialog', 'aria-label': 'New game setup' } },
      h('div', { class: 'su-scroll' }, this.inner),
      h(
        'div',
        { class: 'su-footer' },
        h(
          'div',
          { class: 'su-footer-in' },
          this.summary,
          opts.onBack &&
            h(
              'button',
              {
                class: 'btn btn-ghost',
                attrs: { 'data-k': 'back' },
                on: { click: () => opts.onBack?.() },
              },
              opts.backLabel ?? 'Back to game',
            ),
          this.startBtn,
        ),
      ),
    );
    this.render();
  }

  /** Current draft, for tests and debugging. */
  get state(): SetupDraft {
    return this.draft;
  }

  private start(): void {
    if (setupError(this.draft)) return;
    saveSetup(this.storage, this.draft);
    this.opts.onStart(buildConfig(this.draft));
  }

  private set(next: SetupDraft): void {
    this.draft = next;
    saveSetup(this.storage, next);
    this.render();
  }

  /** Update without rebuilding the DOM (typing would lose focus). */
  private patch(next: SetupDraft): void {
    this.draft = next;
    saveSetup(this.storage, next);
    this.renderSummary();
  }

  private renderSummary(): void {
    const error = setupError(this.draft);
    this.summary.replaceChildren(
      h('strong', {}, summaryLine(this.draft)),
      error ? h('span', { class: 'su-error', attrs: { role: 'alert' } }, error) : '',
    );
    this.startBtn.disabled = error !== null;
  }

  private render(): void {
    const active = document.activeElement;
    const focusKey = active && this.element.contains(active) ? active.getAttribute('data-k') : null;
    this.inner.replaceChildren(
      this.header(),
      this.modeSection(),
      this.seatsSection(),
      ...(this.opts.firstGame ? [this.rulesSection()] : []),
      this.timerSection(),
      this.moreSection(),
    );
    this.renderSummary();
    if (focusKey) this.element.querySelector<HTMLElement>(`[data-k="${focusKey}"]`)?.focus();
  }

  private section(title: string, id: string, ...children: Child[]): HTMLElement {
    return h(
      'section',
      { class: 'su-sec', attrs: { 'aria-labelledby': `su-h-${id}` } },
      h('h2', { id: `su-h-${id}` }, title),
      ...children,
    );
  }

  private header(): HTMLElement {
    return h(
      'header',
      { class: 'su-head' },
      h('div', {}, h('h1', {}, 'New game'), h('p', { class: 'muted' }, "Windamere's Wonders")),
      this.opts.onTutorial &&
        h(
          'button',
          {
            class: 'btn su-learn',
            title: 'A guided first game against three Easy bots',
            attrs: { 'data-k': 'learn' },
            on: { click: () => this.opts.onTutorial?.() },
          },
          h('span', { class: 'su-learn-q', attrs: { 'aria-hidden': 'true' } }, '?'),
          h('span', {}, h('b', {}, 'Learn to play'), h('small', {}, 'New here? Start with this')),
        ),
    );
  }

  /** One tile per ruleset (UX.md §5 Mode). A single mode still shows, so players see it. */
  private modeSection(): HTMLElement {
    return this.section(
      'Mode',
      'mode',
      h(
        'div',
        { class: 'su-tiles', attrs: { role: 'radiogroup', 'aria-label': 'Mode' } },
        ...MODES.map((m) =>
          h(
            'button',
            {
              class: `su-tile${m.id === this.draft.mode ? ' is-on' : ''}`,
              attrs: {
                role: 'radio',
                'aria-checked': String(m.id === this.draft.mode),
                'data-k': `mode-${m.id}`,
              },
              on: { click: () => this.set(setMode(this.draft, m.id)) },
            },
            h('strong', {}, m.name),
            h('small', {}, m.blurb),
          ),
        ),
      ),
    );
  }

  private seatsSection(): HTMLElement {
    const d = this.draft;
    const n = d.seats.length;
    const humans = humanCount(d);
    return this.section(
      'Players',
      'seats',
      h(
        'div',
        { class: 'su-seats-head' },
        h('span', { class: 'muted' }, 'Seats sit in this order around the table.'),
        h(
          'button',
          {
            class: 'btn btn-sm btn-ghost',
            title: 'Shuffle the table order',
            attrs: { 'data-k': 'shuffle' },
            on: {
              click: () => this.set(shuffleSeats(this.draft, this.opts.random ?? Math.random)),
            },
          },
          '↻ Shuffle order',
        ),
      ),
      h(
        'ol',
        { class: 'su-seats', attrs: { 'aria-label': 'Seats in table order' } },
        ...d.seats.map((seat, i) =>
          h(
            'li',
            { class: 'su-seat', style: { '--pc': seat.color } },
            h('span', { class: 'su-seat-no', attrs: { 'aria-hidden': 'true' } }, String(i + 1)),
            h('input', {
              class: 'input su-name',
              value: seat.name,
              maxLength: NAME_MAX,
              placeholder: `Player ${i + 1}`,
              attrs: { 'aria-label': `Seat ${i + 1} name`, 'data-k': `name-${i}` },
              on: {
                input: (e) =>
                  this.patch(setSeatName(this.draft, i, (e.target as HTMLInputElement).value)),
              },
            }),
            h(
              'div',
              {
                class: 'su-swatches',
                attrs: { role: 'group', 'aria-label': `Seat ${i + 1} colour` },
              },
              ...SEAT_COLORS.map((c) =>
                h('button', {
                  class: `swatch${c.color === seat.color ? ' is-on' : ''}`,
                  title: c.name,
                  style: { '--sw': c.color },
                  attrs: {
                    'aria-label': `${c.name} for seat ${i + 1}`,
                    'aria-pressed': String(c.color === seat.color),
                    'data-k': `color-${i}-${c.name}`,
                  },
                  on: { click: () => this.set(pickSeatColor(this.draft, i, c.color)) },
                }),
              ),
            ),
            h(
              'div',
              { class: 'seg', attrs: { role: 'group', 'aria-label': `Seat ${i + 1} player` } },
              ...(['human', 'bot'] as const).map((c) =>
                h(
                  'button',
                  {
                    class: `seg-btn${seat.controller === c ? ' is-on' : ''}`,
                    attrs: {
                      'aria-pressed': String(seat.controller === c),
                      'data-k': `ctl-${i}-${c}`,
                    },
                    on: { click: () => this.set(setController(this.draft, i, c)) },
                  },
                  c === 'human' ? 'Human' : 'Bot',
                ),
              ),
            ),
            this.levelSelect(
              i,
              seat.controller === 'bot' ? (seat.botLevel ?? DEFAULT_BOT_LEVEL) : null,
            ),
            h(
              'div',
              { class: 'su-seat-tools' },
              this.tool('↑', `Move seat ${i + 1} up`, `up-${i}`, i === 0, () =>
                this.set(moveSeat(this.draft, i, -1)),
              ),
              this.tool('↓', `Move seat ${i + 1} down`, `down-${i}`, i === n - 1, () =>
                this.set(moveSeat(this.draft, i, 1)),
              ),
              this.tool('×', `Remove seat ${i + 1}`, `remove-${i}`, n <= MIN_PLAYERS, () =>
                this.set(removeSeat(this.draft, i)),
              ),
            ),
          ),
        ),
      ),
      h(
        'div',
        { class: 'su-seats-foot' },
        h(
          'button',
          {
            class: 'btn btn-sm',
            disabled: n >= MAX_PLAYERS,
            attrs: { 'data-k': 'add-seat' },
            on: { click: () => this.set(addSeat(this.draft)) },
          },
          '+ Add player',
        ),
        h('span', { class: 'muted' }, `${MIN_PLAYERS}–${MAX_PLAYERS} players`),
      ),
      humans >= 2 &&
        h(
          'p',
          { class: 'su-note', attrs: { 'data-k': 'hotseat-note' } },
          `ⓘ ${humans} humans on one device: you pass the device for every pick, so each pick shows ${humans} hand-over screens.`,
        ),
    );
  }

  /** Bot difficulty; a human seat keeps the slot (row alignment) but shows nothing. */
  private levelSelect(i: number, level: BotLevel | null): HTMLSelectElement {
    const hidden = level === null;
    const value = level ?? DEFAULT_BOT_LEVEL;
    return h(
      'select',
      {
        class: `input su-level${hidden ? ' is-hidden' : ''}`,
        title: BOT_LEVELS.find((l) => l.id === value)?.hint ?? '',
        attrs: {
          'aria-label': `Seat ${i + 1} bot difficulty`,
          'data-k': `level-${i}`,
          ...(hidden ? { disabled: '', 'aria-hidden': 'true', tabindex: '-1' } : {}),
        },
        on: {
          change: (e) => {
            const picked = BOT_LEVELS.find((l) => l.id === (e.target as HTMLSelectElement).value);
            if (picked) this.set(setBotLevel(this.draft, i, picked.id));
          },
        },
      },
      ...BOT_LEVELS.map((l) =>
        h(
          'option',
          { attrs: { value: l.id, ...(l.id === value ? { selected: '' } : {}) } },
          l.label,
        ),
      ),
    );
  }

  private tool(
    label: string,
    aria: string,
    key: string,
    disabled: boolean,
    onClick: () => void,
  ): HTMLButtonElement {
    return h(
      'button',
      {
        class: 'su-tool',
        title: aria,
        disabled,
        attrs: { 'aria-label': aria, 'data-k': key },
        on: { click: onClick },
      },
      label,
    );
  }

  /** RULES.md R15.3: Off / Relaxed / Normal / Fast; the game says what each means in seconds. */
  /** UX.md §5 Rule options: today the First game (R19), with what it changes. */
  private rulesSection(): HTMLElement {
    const on = this.draft.firstGame;
    return this.section(
      'Rule options',
      'rules',
      h(
        'div',
        { class: 'seg', attrs: { role: 'group', 'aria-label': 'First game' } },
        h(
          'button',
          {
            class: `seg-btn${on ? '' : ' is-on'}`,
            attrs: { 'aria-pressed': String(!on), 'data-k': 'first-game-off' },
            on: { click: () => this.set(setFirstGame(this.draft, false)) },
          },
          'Full game',
        ),
        h(
          'button',
          {
            class: `seg-btn${on ? ' is-on' : ''}`,
            attrs: { 'aria-pressed': String(on), 'data-k': 'first-game-on' },
            on: { click: () => this.set(setFirstGame(this.draft, true)) },
          },
          'First game',
        ),
      ),
      h('p', { class: 'muted su-hint' }, this.opts.firstGame?.hint ?? ''),
    );
  }

  private timerSection(): HTMLElement {
    const d = this.draft;
    const hint = d.clock === 'off' ? '' : (this.opts.clockHint?.(clockScale(d.clock)) ?? '');
    return this.section(
      'Turn clock',
      'timer',
      h(
        'div',
        { class: 'seg su-timer', attrs: { role: 'group', 'aria-label': 'Turn clock' } },
        ...CLOCKS.map((c) =>
          h(
            'button',
            {
              class: `seg-btn${c.id === d.clock ? ' is-on' : ''}`,
              attrs: { 'aria-pressed': String(c.id === d.clock), 'data-k': `clock-${c.id}` },
              on: { click: () => this.set(setClock(this.draft, c.id)) },
            },
            c.label,
          ),
        ),
      ),
      h(
        'p',
        { class: 'muted su-hint' },
        d.clock === 'off'
          ? 'No clock: the table waits for every human. Bots never need one.'
          : `${hint ? `${hint}. ` : ''}One clock for the whole table; when it runs out, a card is picked for whoever has not picked yet.`,
      ),
    );
  }

  /** Seed (and later: rule options from docs/RULES.md, UX.md §5 slots). */
  private moreSection(): HTMLElement {
    const more = h(
      'details',
      {
        class: 'su-more',
        attrs: this.moreOpen ? { open: '' } : {},
        on: { toggle: () => (this.moreOpen = more.open) },
      },
      h('summary', { attrs: { 'data-k': 'more' } }, 'More options'),
      h(
        'label',
        { class: 'su-field' },
        h('span', {}, 'Seed'),
        h('input', {
          class: 'input su-seed',
          value: this.draft.seed,
          maxLength: SEED_MAX,
          placeholder: 'random',
          attrs: { 'data-k': 'seed', 'aria-describedby': 'su-seed-hint' },
          on: {
            input: (e) => this.patch(setSeed(this.draft, (e.target as HTMLInputElement).value)),
          },
        }),
        h(
          'small',
          { class: 'muted', id: 'su-seed-hint' },
          'Same seed and seats = same deal. Not remembered between games.',
        ),
      ),
    );
    return more;
  }
}
