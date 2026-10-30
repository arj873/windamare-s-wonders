/** The guided first game's lessons, in the order they come up. Plain words, our terms only. */
import { CARDS, GREAT_WORKS } from '../../content/windamere';
import type { Course, LessonDef, TutorialCtx } from './course';
import { gleanTurn, mustPick, mySeat, over, picking, turnsDone } from './course';

const owns = (c: TutorialCtx, kind: string): boolean =>
  (mySeat(c)?.tableau ?? []).some((card) => CARDS.find((d) => d.id === card.def)?.kind === kind);
const picked = (c: TutorialCtx): boolean => c.view.view.submitted[c.me] === true;
const greatWorkName = (c: TutorialCtx): string =>
  GREAT_WORKS.find((g) => g.id === mySeat(c)?.data.greatWork)?.name ?? 'Great Work';

export const LESSONS: readonly LessonDef[] = [
  {
    id: 'welcome',
    title: 'Welcome to Windamere',
    text: () =>
      'You run a town on the Wend. Four Seasons, five turns each. Most Renown after the Winter Raid wins. I will point things out as they matter.',
    when: () => true,
  },
  {
    id: 'greatwork',
    title: 'Your Great Work',
    text: (c) =>
      `${greatWorkName(c)} is your personal monument. Its Perk works from now on. Labour from the cards you Spend fills its tiers.`,
    after: ['welcome'],
    when: (c) => mySeat(c)?.data.greatWork != null,
    focus: 'monument',
  },
  {
    id: 'pick',
    title: 'Pick one card',
    text: () =>
      'Everyone picks one card at the same time, in secret. Choose one from your hand, then choose Build or Spend.',
    after: ['build'],
    when: mustPick,
    stale: (c) => turnsDone(c) >= 1,
    doneWhen: picked,
    urgent: true,
    todo: (c) => (picked(c) ? null : 'Pick a card and a way to use it.'),
    focus: 'hand',
  },
  {
    id: 'spend',
    title: 'Spend gives fuel',
    text: () =>
      'Spend throws the card away for the goods, coins or labour on its Spend band. It is always allowed. Early on you have no goods, so Spending is how you start.',
    after: ['greatwork'],
    when: (c) => mustPick(c) && turnsDone(c) === 0,
    stale: (c) => turnsDone(c) >= 1,
    doneWhen: (c) => turnsDone(c) >= 1,
    focus: 'hand',
  },
  {
    id: 'build',
    title: 'Build to keep',
    text: () =>
      'Build pays the card’s cost and puts it in your town for the rest of the game. A Holding pays out goods every turn; a Hall is worth Renown.',
    after: ['spend'],
    when: (c) => mustPick(c) && turnsDone(c) === 0,
    stale: (c) => turnsDone(c) >= 1,
    doneWhen: (c) => turnsDone(c) >= 1,
    focus: 'town',
  },
  {
    id: 'reveal',
    title: 'Picks are shown together',
    text: () =>
      'When the last town has picked, every pick is shown at once and resolves. Then you pass the rest of your hand to a neighbour and take theirs.',
    after: ['build'],
    when: (c) => turnsDone(c) >= 1 && picking(c),
  },
  {
    id: 'yield',
    title: 'Holdings pay out',
    text: (_c, live) =>
      (live ? '' : 'You did not build a Holding this game. ') +
      'After every turn your Holdings give you their Yield. Build them early and they pay many times. Winter has no Yield.',
    when: (c) => owns(c, 'holding'),
    recap: true,
    focus: 'town',
  },
  {
    id: 'buy',
    title: 'Buy from a neighbour',
    text: (_c, live) =>
      (live ? '' : 'You did not need a neighbour’s goods this game. ') +
      'Missing a good for a Build? Buy it from a neighbour: it leaves their store and the coins go to them. At most 2 from each neighbour a turn, and the price rises every Season.',
    after: ['reveal'],
    when: (c) => turnsDone(c) >= 3 && picking(c),
    recap: true,
    focus: 'neighbours',
  },
  {
    id: 'glean',
    title: 'The last turn: glean',
    text: () =>
      'You hold two cards. Use one as usual. The other is your glean: it is Spent for you, and its gains can pay for this turn’s Build.',
    when: gleanTurn,
    urgent: true,
    focus: 'hand',
  },
  {
    id: 'raid',
    title: 'The Season’s Raid',
    text: () =>
      'Each Season ends with a Raid. Its strength is shown from the start. Meet it with Guard from Watches and you win a Valour token. Fall short and you lose coins.',
    after: ['reveal'],
    when: (c) => turnsDone(c) >= 2 && picking(c),
    focus: 'raid',
  },
  {
    id: 'season2',
    title: 'A new Season',
    text: (c) =>
      `Season ${c.view.round + 1} of 4. A new hand, a new direction to pass, and dearer goods to buy. Check the Raid.`,
    when: (c) => picking(c) && c.view.round >= 1,
    stale: (c) => c.view.round >= 2,
    focus: 'raid',
  },
  {
    id: 'lore',
    title: 'Lore runs',
    text: (_c, live) =>
      (live ? '' : 'You built no Lore this game. ') +
      'Lore cards have a rank from 1 to 6. Consecutive ranks score as a run, and longer runs score far more. A second card of the same rank adds nothing.',
    when: (c) => owns(c, 'lore'),
    recap: true,
  },
  {
    id: 'winter',
    title: 'Winter: no Yield',
    text: () =>
      'Holdings stop paying. Spend what you stored, buy what you lack, and get your Guard up for the last Raid.',
    when: (c) => picking(c) && c.view.round === 3,
    focus: 'raid',
  },
  {
    id: 'finish',
    title: 'Final score',
    text: () =>
      'Renown comes from your town, Great Work, Valour, Lore runs and spare coins. Check the sheet to see where each point came from. You are ready for a full game.',
    when: () => false,
  },
];

export const COURSE: Course = {
  id: 'first',
  name: 'Learn to play',
  lessons: LESSONS,
  finish: 'finish',
  wrapUp: (c) => over(c),
};
