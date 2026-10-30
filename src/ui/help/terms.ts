/**
 * The glossary behind every tooltip (T2). One entry per term or icon. Text follows docs/RULES.md
 * (rule numbers in `rule`) in plain words; numbers marked † there are first-pass, so they are
 * left out here where they could go stale. ORIGINALITY.md §5 words are not used.
 */
export interface Term {
  id: string;
  label: string;
  /** One or two short sentences. */
  text: string;
  /** RULES.md rule, for the "more" line. */
  rule: string;
}

const T = (id: string, label: string, text: string, rule: string): Term => ({
  id,
  label,
  text,
  rule,
});

export const TERMS: readonly Term[] = [
  T('reed', 'Reed', 'A good: bundles of reed from the mere shallows. Kept in your store.', 'R1.3'),
  T('peat', 'Peat', 'A good: dark turves cut on the fells. Kept in your store.', 'R1.3'),
  T('salt', 'Salt', 'A good: white salt from the brine pans. Kept in your store.', 'R1.3'),
  T(
    'wax',
    'Wax',
    'A good: yellow cakes of wax from the heather hives. Kept in your store.',
    'R1.3',
  ),
  T('horn', 'Horn', 'A good: polished cattle horn. Kept in your store.', 'R1.3'),
  T('any', 'Any good', 'You choose which good you get when you pick this card.', 'R5.1'),
  T(
    'store',
    'Store',
    'Your town’s goods. Neighbours can buy from it. Goods score nothing at the end.',
    'R1.3',
  ),
  T(
    'coin',
    'Coin',
    'Pays for Builds, buying from neighbours and the bank. Every 4 coins left at the end is 1 Renown.',
    'R1.4',
  ),
  T('labour', 'Labour', 'Fills your Great Work. It only goes up and is never spent.', 'R1.5'),
  T('renown', 'Renown', 'Victory points. The most Renown after the Winter Raid wins.', 'R1.2'),
  T(
    'build',
    'Build',
    'Pay the card’s cost and put it in your town for the rest of the game.',
    'R4.1',
  ),
  T(
    'spend',
    'Spend',
    'Throw the card away and gain what its Spend band shows. Always allowed.',
    'R5',
  ),
  T('band', 'Spend band', 'What you gain if you Spend this card: goods, coins or labour.', 'R5.1'),
  T(
    'glean',
    'Glean',
    'On the fifth turn you hold two cards. You use one; the other is Spent for you.',
    'R3.5',
  ),
  T(
    'season',
    'Season',
    'Spring, Summer, Autumn, Winter. Each has 5 turns, a new hand and a Raid.',
    'R3',
  ),
  T(
    'yield',
    'Yield',
    'After each turn’s Builds your Holdings pay out. There is no Yield in Winter.',
    'R4.5',
  ),
  T('holding', 'Holding', 'Gives you goods, coins or labour every turn (the Yield).', 'R7.2'),
  T('hall', 'Hall', 'Worth Renown. Some Halls upgrade a cheaper Hall.', 'R7.3'),
  T('market', 'Market', 'Gives coins, Exchanges, Tolls and sale bonuses.', 'R7.4'),
  T('watch', 'Watch', 'Adds Guard against the Raid.', 'R7.5'),
  T('lore', 'Lore', 'Has a rank from 1 to 6. Runs of consecutive ranks score Renown.', 'R7.6'),
  T(
    'landmark',
    'Landmark',
    'Scores extra at the end for a shape of town. One of each per town.',
    'R7.8',
  ),
  T(
    'neighbour',
    'Neighbour',
    'The town on your left or right. You can buy from them and they can buy from you.',
    'R2.1',
  ),
  T(
    'buy',
    'Buying from a neighbour',
    'Takes a good out of their store into your Build. They get the coins. At most 2 goods from each neighbour a turn.',
    'R6.6',
  ),
  T(
    'price',
    'Market price',
    'Coins per good bought from a neighbour. It rises each Season.',
    'R6.6',
  ),
  T('bank', 'Bank', 'Sells a missing good at a high fixed price. Always the dearest way.', 'R6.3'),
  T(
    'exchange',
    'Exchange',
    'Pay 2 of one good instead of one missing good of another type.',
    'R6.3',
  ),
  T('toll', 'Toll', 'Pays you coins when a neighbour Builds.', 'R13'),
  T(
    'upgrade',
    'Upgrade',
    'Costs less if you own the card it upgrades. That card is then covered.',
    'R7.9',
  ),
  T('covered', 'Covered', 'Still shown, but has no effect, Renown, Guard or rank.', 'R7.9'),
  T(
    'greatwork',
    'Great Work',
    'Your personal monument. It has a Perk and four tiers that fill with labour.',
    'R8',
  ),
  T('perk', 'Perk', 'What your Great Work does from the start of the game.', 'R8.1'),
  T(
    'tier',
    'Tier',
    'A step of your Great Work. It completes by itself at its labour threshold and pays a reward.',
    'R8.3',
  ),
  T(
    'raid',
    'Raid',
    'Each Season ends with a Raid. Its strength is shown from the Season’s start.',
    'R9',
  ),
  T(
    'guard',
    'Guard',
    'Your defence. At Season end it is compared with the Raid’s strength.',
    'R9.2',
  ),
  T('held', 'Held', 'Your Guard met the Raid: you gain a Valour token.', 'R9.4'),
  T(
    'plundered',
    'Plundered',
    'Your Guard fell short: you lose 1 coin per point short, and neighbours that held may take a bounty.',
    'R9.5',
  ),
  T('bounty', 'Bounty', 'A town that held takes 1 coin from each plundered neighbour.', 'R9.6'),
  T('valour', 'Valour', 'A token for holding a Raid. Worth Renown, more in later Seasons.', 'R9.4'),
  T(
    'rank',
    'Lore rank',
    'A number from 1 to 6. A second card of a rank you own adds nothing.',
    'R10',
  ),
  T(
    'run',
    'Lore run',
    'Consecutive ranks you own. Longer runs score much more: 1, 3, 6, 10, 14, 18 Renown.',
    'R10.3',
  ),
  T(
    'honour',
    'Honour',
    'A public award. The town that leads its measure at the end gains Renown.',
    'R11',
  ),
  T('purse', 'Purse', 'Renown for coins left at the end: 1 per 4 coins.', 'R12.2'),
  T('burn', 'Burn', 'Two players only: throw a second card away unseen.', 'R14.2'),
];

const BY_ID = new Map(TERMS.map((t) => [t.id, t]));

export function termById(id: string): Term | undefined {
  return BY_ID.get(id);
}
