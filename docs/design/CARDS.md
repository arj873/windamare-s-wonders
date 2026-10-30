# Card catalog (cards D4, D5)

Owner: design lane. Status: **D5, data in `src/content/windamere/`** (2026-10-29; D8 price
change 2026-10-30), rebuilt for D2c (new goods, single pick, neighbour trade) and research's
red-team review (`docs/design/research/originality-review.md`, R4). Every number here is a first
pass: **untested**, not simulated. Bots (B1) will tune it; the re-tune plan for single picks is
§9 item 8.

- **The data is the source of truth**: `src/content/windamere/cards.ts` (cards), `extras.ts`
  (Great Works, Raids, Honours), `tunables.ts` (RULES.md R16; the engine maps it in
  `src/engine/game/shipped.ts`, so keys and shapes stay put, values may change). The tables below were generated from that data; regenerated and compared row by
  row on 2026-10-30 (D8): no difference. If they ever disagree, the data wins. **Older copies of
  this file (9 cards per seat, goods L/B/W/G/O, `palisade`, `caravan`) are pre-D5: discard them.**
- Rules: `docs/RULES.md` (R-numbers below). Line: `docs/design/ORIGINALITY.md`.
- `src/content/windamere/content.test.ts` checks the data (§9).

## 1. Data spec

Types are in `src/content/windamere/types.ts`:

```ts
type Good = 'reed' | 'peat' | 'salt' | 'wax' | 'horn'; // R1.3, goods order
type Kind = 'holding' | 'hall' | 'market' | 'watch' | 'lore' | 'landmark';
type Season = 'spring' | 'summer' | 'autumn' | 'winter';
interface Gains {
  [key: string]: number;
} // keys: goods, coins, labour, any; {} = free

interface WwCardDef extends CardDef {
  // CardDef from ENGINE.md §8: id, name, kind, cost, effects
  kind: Kind;
  season: Season;
  cost: Gains; // goods and coins only
  upgrade?: { of: CardDefId[]; cost: Gains }; // R7.9
  spend: Gains; // the Spend band, R5
  effects: EffectSpec[]; // R13 vocabulary only (EFFECT_PARAMS)
  counts: [number, number, number, number, number]; // copies at 3-7 seats; 2 seats use [1]
}
interface GreatWorkDef {
  id;
  name;
  perk: EffectSpec[];
  tiers: { threshold; reward: EffectSpec[] }[];
}
interface RaidDef {
  id;
  name;
  season;
  strength;
}
interface HonourDef {
  id;
  name;
  measure: Measure;
} // R11.5
```

Example, as the data produces it:

```json
{
  "id": "long-mere-reedbeds",
  "name": "Long Mere Reedbeds",
  "kind": "holding",
  "season": "summer",
  "cost": { "peat": 2, "wax": 1 },
  "upgrade": { "of": ["reed-shallows"], "cost": { "peat": 1 } },
  "spend": { "reed": 2, "coins": 1 },
  "effects": [{ "type": "yield", "gains": { "reed": 1, "labour": 1 } }],
  "counts": [1, 1, 2, 2, 2]
}
```

**Table shorthand** (also the `g()` helper in `dsl.ts`). Goods: R reed, P peat, S salt, W wax,
H horn. `c` coins, `lab` labour, `any` any good. "—" free. Effects use R13 names: `yield 1R`,
`guard 2`, `renown 4`, `lore 3`, `income 1`, `exchange W`, `toll 1` (any kind) or
`toll hall 2`, `sell +1c` (`sellBonus`), `held +1c` (`heldBonus`), `per market 3c`
(`onBuildPerKind`), `on build 6c` (`onBuild`), `season end …` (`seasonEnd`), `score 2/hall`
(`scorePerKind`), `score 4/set`, `score 1/2 goods` (`scoreGoods`), `score 6 if watches ≥ 3`
(`scoreThreshold`), `score 2/Season with a hall` (`scoreSeasons`), `score 3/neighbour beaten on
halls` (`scoreBeat`). Counts: copies at 3, 4, 5, 6, 7 seats.

## 2. Deck sizes

Each Season deck holds exactly 6 cards per seat (R3.2): 18, 24, 30, 36, 42. Two seats deal 10
each from the 4-seat deck and leave 4 undealt (R14.1).

| Kind (copies at 4 seats) | Spring | Summer | Autumn | Winter | Game |
| ------------------------ | ------ | ------ | ------ | ------ | ---- |
| Holding                  | 8      | 6      | 3      | 0      | 17   |
| Hall                     | 3      | 4      | 6      | 8      | 21   |
| Market                   | 4      | 4      | 4      | 3      | 15   |
| Watch                    | 4      | 3      | 4      | 4      | 15   |
| Lore                     | 5      | 5      | 4      | 4      | 18   |
| Landmark                 | 0      | 2      | 3      | 5      | 10   |
| **Total**                | 24     | 24     | 24     | 24     | 96   |

Shape of the year: Spring builds income, Summer upgrades it into labour, Autumn turns it into
Renown and lays in stores, Winter (no Yield) is big Halls, Landmarks and the last Lore ranks.
Landmarks start in Summer (R4 O13, O14). Lore ranks by Season: Spring 1-2, Summer 2-4, Autumn
3-5, Winter 5-6 (R10), so a full run needs all four. Watch Guard varies inside each Season
(R4 O9): Spring 1-2, Summer 2-3, Autumn 3-4, Winter 2-6.

## 3. Spring (Season 1)

| id               | Name           | Kind    | Cost     | Upgrades (cost) | Effects           | Spend   | 3   | 4   | 5   | 6   | 7   |
| ---------------- | -------------- | ------- | -------- | --------------- | ----------------- | ------- | --- | --- | --- | --- | --- |
| `reed-shallows`  | Reed Shallows  | Holding | 3c       |                 | yield 1R          | 2R      | 2   | 2   | 2   | 3   | 3   |
| `peat-hags`      | Peat Hags      | Holding | 3c       |                 | yield 1P          | 2P      | 1   | 2   | 2   | 3   | 3   |
| `brine-springs`  | Brine Springs  | Holding | 3c       |                 | yield 1S          | 2S      | 1   | 1   | 2   | 2   | 2   |
| `heather-hives`  | Heather Hives  | Holding | 3c       |                 | yield 1W          | 2W      | 1   | 1   | 2   | 2   | 2   |
| `fell-pasture`   | Fell Pasture   | Holding | 1R 1c    |                 | yield 1H          | 1H 1c   | 1   | 1   | 1   | 1   | 2   |
| `hewers-camp`    | Hewers' Camp   | Holding | 1P 1S    |                 | yield 1lab        | 1lab 1c | 1   | 1   | 1   | 1   | 2   |
| `moot-stone`     | Moot Stone     | Hall    | 1R 1P    |                 | renown 2          | 4c      | 1   | 2   | 3   | 3   | 3   |
| `ferry-steps`    | Ferry Steps    | Hall    | 1S 1W    |                 | renown 2          | 1lab 2c | 1   | 1   | 1   | 2   | 2   |
| `roadside-stall` | Roadside Stall | Market  | —        |                 | income 1          | 3c      | 1   | 1   | 2   | 2   | 3   |
| `wax-chandler`   | Wax Chandler   | Market  | 1W       |                 | exchange W        | 1W 2c   | 1   | 1   | 1   | 1   | 1   |
| `toll-bridge`    | Toll Bridge    | Market  | 1R       |                 | toll holding 1    | 4c      | 0   | 1   | 1   | 2   | 2   |
| `peddlers-cart`  | Peddlers' Cart | Market  | 2c       |                 | sell +1c          | 3c      | 1   | 1   | 1   | 1   | 2   |
| `hurdle-fence`   | Hurdle Fence   | Watch   | 1R       |                 | guard 1           | 1R 1c   | 1   | 2   | 2   | 3   | 3   |
| `beacon-hill`    | Beacon Hill    | Watch   | 1H       |                 | guard 1, held +1c | 1H 1c   | 1   | 1   | 1   | 1   | 2   |
| `ditch-and-bank` | Ditch and Bank | Watch   | 1P 1S 1c |                 | guard 2           | 1lab 2c | 1   | 1   | 2   | 2   | 2   |
| `tally-hut`      | Tally Hut      | Lore    | 1W       |                 | lore 1            | 1lab 1c | 2   | 3   | 3   | 4   | 4   |
| `rune-stone`     | Rune Stone     | Lore    | 1P 1c    |                 | lore 2            | 1P 1lab | 1   | 2   | 3   | 3   | 4   |

Intent: a Spring Holding costs 3 coins (was 2: research R4 D4, a turn-1 Holding now yields up
to 15 times), so with 5 starting coins turn 1 is "build one Holding" or "Spend for goods".
Roadside Stall is free on purpose. Peddlers' Cart pays when neighbours buy from you (R6.6).

## 4. Summer (Season 2)

| id                   | Name               | Kind     | Cost     | Upgrades (cost)      | Effects                    | Spend      | 3   | 4   | 5   | 6   | 7   |
| -------------------- | ------------------ | -------- | -------- | -------------------- | -------------------------- | ---------- | --- | --- | --- | --- | --- |
| `long-mere-reedbeds` | Long Mere Reedbeds | Holding  | 2P 1W    | Reed Shallows (1P)   | yield 1R 1lab              | 2R 1c      | 1   | 1   | 2   | 2   | 2   |
| `blackmoss-cuttings` | Blackmoss Cuttings | Holding  | 2R 1H    | Peat Hags (1R)       | yield 1P 1lab              | 2P 1c      | 1   | 1   | 1   | 2   | 2   |
| `saltcote-flats`     | Saltcote Flats     | Holding  | 1R 2P    | Brine Springs (1R)   | yield 1S 1lab              | 2S 1c      | 0   | 1   | 1   | 1   | 2   |
| `bee-garth`          | Bee Garth          | Holding  | 2R 1S    | Heather Hives (1S)   | yield 1W 1lab              | 2W 1c      | 0   | 1   | 1   | 1   | 2   |
| `high-fell-herd`     | High Fell Herd     | Holding  | 1R 2P 1S | Fell Pasture (1R 1P) | yield 1H 1lab              | 2H         | 1   | 1   | 1   | 1   | 2   |
| `crofters-plot`      | Crofters' Plot     | Holding  | 1R 1P    |                      | yield 1S 1W                | 1S 1W 1c   | 1   | 1   | 2   | 2   | 2   |
| `moot-hall`          | Moot Hall          | Hall     | 1R 2P 1S | Moot Stone (1P 1S)   | renown 4                   | 2lab 1c    | 1   | 2   | 2   | 2   | 3   |
| `boathouse`          | Boathouse          | Hall     | 2R 1W 1H | Ferry Steps (1R 1H)  | renown 5                   | 2lab 1c    | 1   | 1   | 1   | 2   | 2   |
| `hearth-hall`        | Hearth Hall        | Hall     | 2R 1W    |                      | renown 3                   | 6c         | 1   | 1   | 2   | 2   | 2   |
| `drovers-market`     | Drovers' Market    | Market   | 1S 1W    |                      | per holding 2c             | 5c         | 1   | 1   | 2   | 2   | 2   |
| `salt-weigh-house`   | Salt Weigh-house   | Market   | 1P 1S    |                      | exchange S, income 1       | 2S 1c      | 1   | 1   | 1   | 1   | 1   |
| `counting-house`     | Counting House     | Market   | 1P 2S    |                      | income 2                   | 6c         | 1   | 1   | 1   | 2   | 2   |
| `fairground`         | Fairground         | Market   | 1R 2W    |                      | toll 1                     | 5c         | 1   | 1   | 1   | 1   | 1   |
| `gatehouse`          | Gatehouse          | Watch    | 1R 2P    |                      | guard 2                    | 2P 1c      | 1   | 1   | 1   | 2   | 2   |
| `militia-yard`       | Militia Yard       | Watch    | 1R 2H    | Hurdle Fence (1R 1H) | guard 3                    | 1H 1lab 1c | 1   | 1   | 2   | 2   | 2   |
| `watchfire-ridge`    | Watchfire Ridge    | Watch    | 1R 1S 1H | Beacon Hill (1H)     | guard 2, held +1c          | 1S 1H 1c   | 1   | 1   | 1   | 1   | 2   |
| `almanac-house`      | Almanac House      | Lore     | 1W 2c    |                      | lore 2                     | 2lab       | 1   | 1   | 1   | 2   | 2   |
| `star-chamber`       | Star Chamber       | Lore     | 1S 1W 1H |                      | lore 3                     | 2lab 1c    | 1   | 2   | 3   | 3   | 3   |
| `map-room`           | Map Room           | Lore     | 2W 1H    |                      | lore 4                     | 2lab 1c    | 1   | 2   | 2   | 3   | 3   |
| `wayfarers-cross`    | Wayfarers' Cross   | Landmark | 2R 1P 1S |                      | score 2/Season with a hall | 1lab 3c    | 1   | 1   | 1   | 1   | 2   |
| `mustering-stone`    | Mustering Stone    | Landmark | 2P 1H    |                      | score 6 if watches ≥ 3     | 2lab 1c    | 0   | 1   | 1   | 1   | 1   |

Intent: each Spring Holding has a Summer upgrade named for a place (R4 O8) that keeps its good
and adds 1 labour a Yield, instead of doubling the good. Upgrading trades a Build for up to 10
labour over Summer and Autumn. Two Hall lines: Moot Stone → Moot Hall → Wend Council House →
High Hall (2 → 4 → 6 → 9), and Ferry Steps → Boathouse → Ice Fair Hall (2 → 5 → 8), which skips
Autumn (R4 O6).

## 5. Autumn (Season 3)

| id                   | Name               | Kind     | Cost     | Upgrades (cost)      | Effects                       | Spend      | 3   | 4   | 5   | 6   | 7   |
| -------------------- | ------------------ | -------- | -------- | -------------------- | ----------------------------- | ---------- | --- | --- | --- | --- | --- |
| `orchard-terraces`   | Orchard Terraces   | Holding  | 1R 1P 1W |                      | yield 1S 1lab                 | 2S 1lab    | 1   | 1   | 2   | 3   | 3   |
| `root-cellar`        | Root Cellar        | Holding  | 1R 2P    |                      | season end 1R 1P 1S 1W 1H     | 2any       | 1   | 2   | 2   | 2   | 3   |
| `wend-council-house` | Wend Council House | Hall     | 3P 2S 1H | Moot Hall (2S 1H)    | renown 6                      | 2lab 3c    | 1   | 2   | 2   | 3   | 3   |
| `players-green`      | Players' Green     | Hall     | 1R 2S 2W |                      | renown 5                      | 2lab 3c    | 1   | 2   | 2   | 2   | 3   |
| `clock-house`        | Clock House        | Hall     | 1R 2P 2H |                      | renown 5                      | 2H 1lab    | 1   | 1   | 2   | 2   | 2   |
| `bell-tower`         | Bell Tower         | Hall     | 2P 1H    |                      | renown 4                      | 1H 1lab 1c | 1   | 1   | 1   | 1   | 1   |
| `merchants-row`      | Merchants' Row     | Market   | 2R 1W 1H |                      | toll 1, income 1              | 6c         | 1   | 1   | 2   | 2   | 2   |
| `peat-staithe`       | Peat Staithe       | Market   | 1R 1P 1S |                      | exchange P, income 1          | 2P 2c      | 1   | 1   | 1   | 1   | 2   |
| `pilgrims-inn`       | Pilgrims' Inn      | Market   | 1R 2S 1W |                      | toll hall 2                   | 6c         | 1   | 1   | 1   | 1   | 1   |
| `factors-house`      | Factor's House     | Market   | 1S 2W    |                      | sell +1c, income 1            | 5c         | 1   | 1   | 2   | 2   | 2   |
| `ring-dyke`          | Ring Dyke          | Watch    | 3P 2H    | Gatehouse (2H)       | guard 4                       | 2P 1H 1c   | 1   | 2   | 2   | 2   | 3   |
| `keep`               | Keep               | Watch    | 1R 1S 3H |                      | guard 3                       | 2H 1lab    | 1   | 1   | 2   | 2   | 2   |
| `outriders`          | Outriders          | Watch    | 1S 2W 1H | Militia Yard (1S 1W) | guard 4, held +1c             | 1S 2W      | 1   | 1   | 1   | 1   | 2   |
| `ferrymans-charts`   | Ferryman's Charts  | Lore     | 1R 1W    |                      | lore 3                        | 2lab 2c    | 1   | 1   | 1   | 2   | 2   |
| `skywatch-loft`      | Skywatch Loft      | Lore     | 1S 1W 1H |                      | lore 4                        | 3lab       | 1   | 1   | 2   | 3   | 3   |
| `chronicle-house`    | Chronicle House    | Lore     | 1P 2W 1H |                      | lore 5                        | 2lab 1any  | 1   | 2   | 2   | 3   | 3   |
| `hall-of-banners`    | Hall of Banners    | Landmark | 1R 2W 2H |                      | score 6 if valour ≥ 3         | 2lab 3c    | 1   | 1   | 1   | 1   | 1   |
| `keystone-arch`      | Keystone Arch      | Landmark | 2P 1S 2H |                      | score 8 if tiers ≥ 3          | 3lab       | 0   | 1   | 1   | 1   | 2   |
| `harvest-home`       | Harvest Home       | Landmark | 2R 1P 2S |                      | score 2/Season with a holding | 3any       | 1   | 1   | 1   | 2   | 2   |

Intent: Root Cellar is the "lay in stores" card: it pays out at Autumn's end, just before the
Winter with no Yield (and at Winter's end, when goods are worth nothing unless the town has
Winter Larder). Autumn Lore costs 2-4 goods, less than Autumn Halls (R4 D4). Factor's House and
the Spring Peddlers' Cart reward selling: a full store earns more as neighbours drain it.

## 6. Winter (Season 4, no Yield)

| id                  | Name                   | Kind     | Cost           | Upgrades (cost)            | Effects                           | Spend      | 3   | 4   | 5   | 6   | 7   |
| ------------------- | ---------------------- | -------- | -------------- | -------------------------- | --------------------------------- | ---------- | --- | --- | --- | --- | --- |
| `high-hall`         | High Hall of Windamere | Hall     | 2P 2W 2H       | Wend Council House (2W 1H) | renown 9                          | 3lab 3c    | 1   | 2   | 2   | 3   | 3   |
| `ice-fair-hall`     | Ice Fair Hall          | Hall     | 2R 1S 2W       | Boathouse (1R 1S)          | renown 8                          | 3R 2c      | 1   | 1   | 2   | 2   | 2   |
| `snowlight-hall`    | Snowlight Hall         | Hall     | 2S 2W 1H       |                            | renown 6                          | 3any       | 1   | 2   | 2   | 3   | 3   |
| `long-barrow`       | Long Barrow            | Hall     | 3P 1H          |                            | renown 5                          | 2P 1lab 1c | 1   | 2   | 2   | 2   | 3   |
| `mere-gate-hall`    | Mere Gate Hall         | Hall     | 3R 2P 1W       |                            | renown 6                          | 3R 2c      | 1   | 1   | 1   | 2   | 2   |
| `midwinter-fair`    | Midwinter Fair         | Market   | 1S 2W          |                            | per market 3c                     | 8c         | 1   | 1   | 2   | 2   | 2   |
| `strongroom`        | Strongroom             | Market   | 1P 2H          |                            | renown 1, on build 6c             | 2H 2c      | 1   | 1   | 1   | 2   | 2   |
| `ice-road-traders`  | Ice Road Traders       | Market   | 1R 1S 1W       |                            | sell +2c                          | 6c         | 1   | 1   | 1   | 1   | 2   |
| `citadel`           | Citadel                | Watch    | 1R 2P 2H       | Ring Dyke or Keep (1P 1H)  | guard 6                           | 1P 2H 1lab | 1   | 2   | 2   | 2   | 3   |
| `muster-field`      | Muster Field           | Watch    | 2S 2W 1H       |                            | guard 3, held +2c                 | 2S 2W      | 1   | 1   | 2   | 2   | 2   |
| `ice-moat`          | Ice Moat               | Watch    | 2R 1H          |                            | guard 2, renown 2                 | 2R 1c      | 1   | 1   | 1   | 2   | 2   |
| `sealed-archive`    | Sealed Archive         | Lore     | 1S 2W 1H       |                            | lore 5                            | 3lab 1c    | 1   | 1   | 2   | 2   | 3   |
| `orrery`            | Orrery of Windamere    | Lore     | 1P 2W 2H       |                            | lore 6                            | 3lab 2c    | 2   | 3   | 3   | 4   | 5   |
| `long-table`        | The Long Table         | Landmark | 2R 2S 2W       |                            | score 2/hall                      | 3any       | 1   | 1   | 2   | 2   | 2   |
| `market-cross`      | Market Cross           | Landmark | 2R 2P 1H       |                            | score 8 if markets ≥ 3            | 3any       | 0   | 1   | 1   | 1   | 1   |
| `watchers-cairn`    | Watchers' Cairn        | Landmark | 3P 2H          |                            | score 2/Season with a watch       | 3any       | 1   | 1   | 1   | 1   | 1   |
| `ancestors-walk`    | Ancestors' Walk        | Landmark | 1R 1P 1S 1W 1H |                            | score 4/set                       | 3any       | 1   | 1   | 1   | 1   | 2   |
| `winter-larder`     | Winter Larder          | Landmark | 1R 1P 2S       |                            | score 1/2 goods                   | 4any       | 0   | 0   | 1   | 1   | 1   |
| `pride-of-the-wend` | Pride of the Wend      | Landmark | 1S 2W 2H       |                            | score 3/neighbour beaten on halls | 3any       | 1   | 1   | 1   | 1   | 1   |

Intent: Winter Spend bands are the largest (3 to 4 units, often "any") because nothing yields.
A town arrives in Winter with its Autumn store and lives on Spends, its glean and purchases at
the year's dearest price (5 coins). Landmark conditions vary (R4 O13): one per-kind count (Long
Table), thresholds, Season spreads, sets, stored goods and a neighbour comparison. No printed 7
on any card (R4 O15).

## 7. Great Works (pool of 14)

Thresholds are the standard 3 / 6 / 10 / 15 labour (R8.1) unless the row says otherwise. Each
tier lists its reward; `on build` in a tier means "when the tier completes" (R8.4). Every tier
pays some Renown, no tier pays a plain 3 or 7, and no tier gives a Lore rank (R4 O7; a test
enforces all three).

| id                       | Name                    | Perk                              | Tier I                   | Tier II                   | Tier III                | Tier IV                  | Thresholds |
| ------------------------ | ----------------------- | --------------------------------- | ------------------------ | ------------------------- | ----------------------- | ------------------------ | ---------- |
| `the-mere-bridge`        | The Mere Bridge         | toll holding 1                    | renown 1, on build 4c    | renown 2, income 1        | renown 4                | renown 8                 | 3/6/10/15  |
| `the-wind-organ`         | The Wind Organ          | spend lore: +1lab                 | renown 2                 | renown 2, on build 2W     | renown 5                | renown 2, score 2/lore   | 3/6/10/15  |
| `the-beacon-crown`       | The Beacon Crown        | guard 1                           | renown 1, guard 1        | renown 2, held +2c        | renown 4, guard 1       | renown 6                 | 3/6/10/15  |
| `the-salt-stair`         | The Salt Stair          | yield 1S                          | renown 1, on build 2W    | renown 2, yield 1W        | renown 4                | renown 8                 | 3/6/10/15  |
| `the-stonewrights-spire` | The Stonewright's Spire | yield 1lab                        | renown 2                 | renown 4                  | renown 6                | renown 9                 | 4/8/13/19  |
| `the-hall-of-echoes`     | The Hall of Echoes      | build hall: +2c                   | renown 1, on build 3c    | renown 2, discount hall 1 | renown 4                | renown 2, score 2/hall   | 3/6/10/15  |
| `the-harvest-wheel`      | The Harvest Wheel       | discount holding 1                | renown 1, on build 1R 1P | renown 2, score 1/holding | renown 5                | renown 6                 | 3/6/10/15  |
| `the-ice-lantern`        | The Ice Lantern         | season end 1W 1H                  | renown 2                 | renown 2, score 1/3 goods | renown 4                | renown 8                 | 3/6/10/15  |
| `the-wolf-gate`          | The Wolf Gate           | held +2c                          | renown 1, guard 1        | renown 2, guard 1         | renown 4                | renown 2, score 2/Valour | 3/6/10/15  |
| `the-tide-mill`          | The Tide Mill           | exchange S                        | renown 1, yield 1S       | renown 2, exchange H      | renown 4                | renown 8                 | 3/6/10/15  |
| `the-lantern-market`     | The Lantern Market      | income 1                          | renown 1, on build 3c    | renown 2, sell +1c        | renown 4, toll market 2 | renown 6                 | 3/6/10/15  |
| `the-ring-of-oaths`      | The Ring of Oaths       | score 2/neighbour beaten on guard | renown 1, guard 1        | renown 2                  | renown 4, guard 1       | renown 8                 | 3/6/10/15  |
| `the-coinwell`           | The Coinwell            | spend market: +2c                 | renown 2                 | renown 2, income 1        | renown 4                | renown 8                 | 3/6/10/15  |
| `the-fourfold-gate`      | The Fourfold Gate       | score 2/set                       | renown 1, on build 3c    | renown 2                  | renown 5                | renown 4, score 1/set    | 3/6/10/15  |

Intent: each Great Work points at one way to play (Holdings, Lore, Guard, yield, labour, Halls,
Winter stores, Valour, exchange, selling, beating neighbours, coins, sets). A full track is worth
about 13 to 21 Renown plus the Perk and effects. The Stonewright's Spire gets labour every Yield,
so its thresholds are higher.

## 8. Raids and Honours

**Raids** (R9): one per Season is drawn at setup; its strength is public from that Season's
start.

| id                    | Name                   | Season | Strength |
| --------------------- | ---------------------- | ------ | -------- |
| `raid-wolf-pack`      | Wolf Pack              | Spring | 1        |
| `raid-hill-reivers`   | Hill Reivers           | Spring | 1        |
| `raid-fen-thieves`    | Fen Thieves            | Spring | 2        |
| `raid-marsh-raiders`  | Marsh Raiders          | Summer | 2        |
| `raid-broken-company` | The Broken Company     | Summer | 3        |
| `raid-salt-corsairs`  | Saltcoast Corsairs     | Summer | 3        |
| `raid-grey-host`      | The Grey Host          | Autumn | 4        |
| `raid-boglords-levy`  | The Bog-lord's Levy    | Autumn | 5        |
| `raid-iron-riders`    | Iron Riders            | Autumn | 6        |
| `raid-frost-wights`   | Frost Wights           | Winter | 6        |
| `raid-pale-march`     | The Pale March         | Winter | 8        |
| `raid-long-night`     | Host of the Long Night | Winter | 8        |

Intent (fixes R4 D2): the weakest fresh (not upgraded) Watch each Season has Guard 1, 2, 3, 2,
so a town that builds one a Season has Guard 1, 3, 6, 8 and holds every Raid except the Fen
Thieves. A stronger Watch or a second one holds that too. A test checks this.

**Honours** (R11): 3 of these 8 per game.

| id                      | Name           | Measure    |
| ----------------------- | -------------- | ---------- |
| `honour-warden`         | Warden         | `guard`    |
| `honour-steward`        | Steward        | `holdings` |
| `honour-patron`         | Patron         | `halls`    |
| `honour-merchant`       | Merchant       | `markets`  |
| `honour-sage`           | Sage           | `loreRun`  |
| `honour-master-builder` | Master Builder | `tiers`    |
| `honour-treasurer`      | Treasurer      | `coins`    |
| `honour-broad-town`     | Broad Town     | `kinds`    |

## 9. Checks and open issues

`src/content/windamere/content.test.ts` checks, on every gate run:

- each Season deck holds 6 cards per seat at 3-7 seats; 2 seats can deal 10 each from the 4-seat
  deck; the cadence leaves one card to glean; the §2 kind totals; counts never fall as seats rise;
- unique ids; R13 vocabulary for every cost, Spend band and effect (keys, params, kinds,
  measures, goods, Lore ranks 1-6); costs use goods and coins only; "any" only in Spend bands and
  card `onBuild` (R13.4);
- upgrades cover an existing card of the same kind from an earlier Season, for less;
- kind rules (one Lore rank per Lore card, Guard on every Watch, a score effect on every
  Landmark, no Winter Holdings) and the Lore ranks by Season (§2);
- Great Works: 14, four rising tiers, R13 vocabulary, Renown in every tier, no 3 or 7, no Lore
  rank; Raids: three per Season, the D2 property (§8); Honours: 8, valid measures;
- the ORIGINALITY.md §5 blocklist against every card, Great Work, Raid and Honour name and id,
  and our goods against the banned goods.

Not checked (needs B1 bots and qa playtests):

1. **Economy curve.** A turn-1 Spring Holding yields up to 15 goods (R4 D4). Watch for
   Holding-only towns winning; next lever is Spring Holding cost or a store cap (R4 D5).
2. **Labour supply.** The Summer upgrades give up to 10 labour each. If most towns finish tier IV,
   raise thresholds (R16) or cut the upgrade labour.
3. **Trade.** Whether the Season price (1, 3, 4, 5; bank 6) and the limit of 2 per neighbour
   make buying the default; target: most Builds need at most one purchase. Bots should report
   goods bought per town and the share of score from neighbours (RULES.md design note, R4 D1).
4. **Tolls.** `toll 1` (any kind) on Fairground and Merchants' Row pays up to 2 coins a turn; may
   be strong at 7 seats where neighbours always build.
5. **Lore at 4 seats** is 18 of 96 cards. Check that runs of 5-6 are reachable but not routine.
6. **Winter goods.** Whether towns can afford Winter cards (5-6 goods) from stores, gleans and
   purchases at 5 coins; if not, lower costs or raise Root Cellar's payout. Linked to N1: Winter
   stock can be bought out by neighbours (RULES.md "planned tuning").
7. **Teach load** (R4 D9): 23 effect types now. A "first game" option that turns off Honours and
   upgrades is card D7 (after the first sim numbers).
8. **Re-tune for single picks** (research N4). Costs and Spend bands here were first sized when
   each Build had a Spend beside it; now a turn is a Build or a Spend, so fuel per Build roughly
   halves. D5 only made first moves (Spring Holdings 3c, cheaper Lore, Spend bands of 2-4 units).
   Plan (also in RULES.md "planned tuning"): run B1 on this data, then adjust **Spend bands
   first, costs second, Spring first**, until every card is built 5-60% of the times it is
   picked (balance target S5), Spend picks stay at most about a third of picks in Spring to
   Autumn (P3, restated for single picks), and most Builds need at most one purchase.
9. **Forced sales** (research N1): see item 6. First lever if bots show planned Builds broken by
   sales: neighbours may not buy a town's last 1 of each good.

## 10. Research R4 findings: what was done

| Id  | Finding (short)                             | Status                                                                                                                                                              |
| --- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O1  | Card-type colours are 7W's map              | Art lane (Needs). ORIGINALITY row 8 waits for art's final map.                                                                                                      |
| O2  | Glass and cloth icons                       | Art lane (Needs): icons for reed, peat, salt, wax, horn (RULES.md goods table).                                                                                     |
| O3  | Monument frame with stage sockets           | Art lane (Needs): a 4-tier track.                                                                                                                                   |
| O4  | UX placeholders on 7W cadence               | UI lane (Needs): hand 6, one card with a role, purchase picker.                                                                                                     |
| O5  | `palisade`                                  | **Fixed**: Hurdle Fence.                                                                                                                                            |
| O6  | Shrine → Chapel → Cathedral (2 → 4 → 7)     | **Fixed**: Ferry Steps → Boathouse → Ice Fair Hall (2 → 5 → 8), lakeside, skips Autumn. The Moot line is 2 → 4 → 6 → 9.                                             |
| O7  | Great Work "3, special, 7"                  | **Fixed**: Renown in every tier, no 3 or 7, no Lore rank (tested).                                                                                                  |
| O8  | Single → double producers, industry names   | **Fixed**: upgrades named by place and add labour, not a doubled good.                                                                                              |
| O9  | Rampart; Guard = Season number              | **Fixed**: Ring Dyke; Guard varies inside each Season (§2).                                                                                                         |
| O10 | Moneylender's, Harbour, Stargazers', Timber | **Fixed**: removed or renamed (Peat Staithe, Skywatch Loft).                                                                                                        |
| O11 | "Caravan"                                   | **Fixed**: `toll` (R13).                                                                                                                                            |
| O12 | Seven score categories, "Treasury"          | **Fixed** in rules: six groups, Purse (R12.2). UI tally: ui lane.                                                                                                   |
| O13 | One Landmark per kind                       | **Fixed**: varied conditions, Landmarks from Summer.                                                                                                                |
| O14 | Deck curve                                  | **Partly**: Summer Landmarks. **Kept** no Winter Holdings: Winter has no Yield (R3.7), so a Holding there would do nothing.                                         |
| O15 | Printed 7s                                  | **Fixed** on cards and tiers. **Kept** 7 seats (the player count).                                                                                                  |
| O16 | Discard last card, alternating passes       | **Kept** passes (genre-common); the last card is now a glean, not a discard.                                                                                        |
| D1  | Multiplayer solitaire                       | **Fixed (estimate)**: neighbour trade, bounty paid by the plundered town, sale bonuses. RULES.md design note: 20-35% of score (arithmetic, untested). Bots measure. |
| D2  | One Watch a Season doesn't hold the Raids   | **Fixed**: new strengths (§8), tested.                                                                                                                              |
| D3  | Pair-pick option count                      | **Obsolete**: single pick (at most 6 cards × 2 roles, plus payment choices).                                                                                        |
| D4  | Dominated builds (Holdings, weak Lore)      | **Partly**: Spring Holdings 3c, cheaper Autumn/Winter Lore. Lore scores unchanged. Bots measure.                                                                    |
| D5  | Runaway engine                              | **Partly**: neighbours can now buy a leader's stock. No store cap yet. Bots measure.                                                                                |
| D6  | Dead Winter turns                           | **Measure** (bots): Spends per Season.                                                                                                                              |
| D7  | 2-player Burn is deducible                  | **Noted** in R14.3 and ORIGINALITY row 16.                                                                                                                          |
| D8  | Honour ties at 5-7 seats                    | **Measure** (bots).                                                                                                                                                 |
| D9  | Teach load                                  | **Kept** for now; "first game" option proposed (§9.7).                                                                                                              |
