/** The card list: every card by Season and kind, from src/content (R6 #8). */
import { CARDS, KINDS, SEASONS, type Season, type WwCardDef } from '../../content/windamere';
import { effectsText, gainsText, kindMany, kindOne } from '../../game/windamere/text';
import { windamere } from '../../game/windamere/content';
import { h } from '../dom';
import { openDialog, type DialogHandle } from '../dialog';
import { helpTerm } from './tooltips';
import './help.css';

export const SEASON_LABEL: Record<Season, string> = {
  spring: 'Spring',
  summer: 'Summer',
  autumn: 'Autumn',
  winter: 'Winter',
};

/** Cards of one Season, grouped by kind in KINDS order; empty kinds are left out. */
export function cardsBySeasonAndKind(
  season: Season,
  cards: readonly WwCardDef[] = CARDS,
): { kind: (typeof KINDS)[number]; cards: WwCardDef[] }[] {
  return KINDS.map((kind) => ({
    kind,
    cards: cards.filter((c) => c.season === season && c.kind === kind),
  })).filter((g) => g.cards.length > 0);
}

function row(card: WwCardDef): HTMLElement {
  const { rules } = windamere();
  const cost = gainsText(rules, card.cost) || 'Free';
  const spend = gainsText(rules, card.spend) || 'nothing';
  const upgrade = card.upgrade
    ? ` Upgrade (covers ${card.upgrade.of
        .map((id) => CARDS.find((c) => c.id === id)?.name ?? id)
        .join(' or ')}): ${gainsText(rules, card.upgrade.cost) || 'free'}.`
    : '';
  return h(
    'li',
    { class: 'ww-card-row' },
    h('strong', {}, card.name),
    h('span', { class: 'muted' }, ` Cost: ${cost}. Spend: ${spend}.${upgrade}`),
    h('div', {}, effectsText(rules, card.effects)),
  );
}

export function renderCardList(season: Season): HTMLElement {
  return h(
    'div',
    { class: 'ww-card-list' },
    ...cardsBySeasonAndKind(season).flatMap((g) => [
      h(
        'h4',
        {},
        helpTerm(g.kind, kindMany(g.kind)),
        ` (${g.cards.length} ${kindOne(g.kind)} cards)`,
      ),
      h('ul', {}, ...g.cards.map(row)),
    ]),
  );
}

export function openCardList(opts: { season?: Season; onClose?: () => void } = {}): DialogHandle {
  let season: Season = opts.season ?? 'spring';
  const list = h('div');
  const tabs = h('div', { class: 'ww-help-tabs', attrs: { role: 'tablist' } });
  const paint = (): void => {
    tabs.replaceChildren(
      ...SEASONS.map((s) =>
        h(
          'button',
          {
            class: `btn btn-ghost${s === season ? ' is-on' : ''}`,
            attrs: { role: 'tab', 'aria-selected': String(s === season) },
            on: {
              click: () => {
                season = s;
                paint();
              },
            },
          },
          SEASON_LABEL[s],
        ),
      ),
    );
    list.replaceChildren(renderCardList(season));
  };
  paint();
  return openDialog({
    title: 'All cards',
    className: 'is-wide',
    body: [tabs, h('div', { class: 'ww-help-doc' }, list)],
    actions: [{ label: 'Close', primary: true }],
    ...(opts.onClose ? { onClose: opts.onClose } : {}),
  });
}
