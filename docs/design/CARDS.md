# Card catalog draft (card D4)

Owner: design lane. Status: **draft for human review** (2026-10-29). Every number here is a
first pass: **untested**, not simulated. Bots (B1) will tune it. After the human approves, this
becomes data in `src/content/` (design lane) that the engine loads (ENGINE.md §8).

Rules: `docs/RULES.md` (R-numbers below). Line: `docs/design/ORIGINALITY.md` (every name below
was checked against its blocklist).

## 1. Data spec

```ts
type Good = 'lumber' | 'brick' | 'wool' | 'grain' | 'ore';
type Kind = 'holding' | 'hall' | 'market' | 'watch' | 'lore' | 'landmark';
type Season = 'spring' | 'summer' | 'autumn' | 'winter';
// Gains / costs: any subset of goods, plus coins, labour, any (R13). Costs use goods + coins only.
type Gains = Partial<Record<Good | 'coins' | 'labour' | 'any', number>>;

interface WwCardDef extends CardDef {
  // CardDef from ENGINE.md §8: id, name, kind, cost, effects
  kind: Kind;
  season: Season;
  cost: Gains; // {} = free
  upgrade?: { of: CardDefId[]; cost: Gains }; // R7.9
  spend: Gains; // the Spend band, R5
  effects: EffectSpec[]; // R13 vocabulary only
  counts: [number, number, number, number, number]; // copies at 3, 4, 5, 6, 7 seats; 2 seats use [0]
}

interface GreatWorkDef {
  id: string;
  name: string;
  perk: EffectSpec[]; // active from the reveal, R8.1
  tiers: { threshold: number; reward: EffectSpec[] }[]; // 4 tiers; `onBuild` = on completion
}
interface RaidDef {
  id: string;
  name: string;
  season: Season;
  strength: number;
}
interface HonourDef {
  id: string;
  name: string;
  measure: 'guard' | 'holdings' | 'halls' | 'markets' | 'loreRun' | 'tiers' | 'coins' | 'kinds';
}
```

Example, as it would sit in `src/content/`:

```json
{
  "id": "log-flume",
  "name": "Log Flume",
  "kind": "holding",
  "season": "summer",
  "cost": { "brick": 2, "wool": 1 },
  "upgrade": { "of": ["woodlot"], "cost": { "brick": 1 } },
  "spend": { "lumber": 2, "coins": 1 },
  "effects": [{ "type": "yield", "gains": { "lumber": 2 } }],
  "counts": [1, 2, 2, 3, 3]
}
```

**Table shorthand.** Goods: L lumber, B brick, W wool, G grain, O ore. `c` coins, `lab`
labour, `any` any good. "—" free. Effects use R13 names: `yield 2L`, `guard 2`,
`renown 4`, `lore 3`, `income 1`, `exchange W`, `caravan 1` (any kind) or `caravan hall 2`,
`held +1c` (`heldBonus`), `per market 3c` (`onBuildPerKind`), `on build 6c` (`onBuild`),
`season end …` (`seasonEnd`), `score 2/hall` (`scorePerKind`), `score 2/tier`,
`score 2/Valour`, `score 4/set`, `score 1/2 goods` (`scoreGoods`), `score 3/neighbour beaten
on halls` (`scoreBeat`). Counts: copies at 3, 4, 5, 6, 7 seats.

## 2. Deck sizes

Each Season deck holds exactly 9 cards per seat (R3.2): 27, 36, 45, 54, 63. Two seats use the
3-seat deck and leave 3 cards undealt (R14.1). Checked by script, §8.

| Kind (copies at 4 seats) | Spring | Summer | Autumn | Winter | Game |
| ------------------------ | ------ | ------ | ------ | ------ | ---- |
| Holding                  | 13     | 9      | 4      | 0      | 26   |
| Hall                     | 4      | 6      | 8      | 10     | 28   |
| Market                   | 5      | 6      | 6      | 4      | 21   |
| Watch                    | 6      | 5      | 6      | 7      | 24   |
| Lore                     | 8      | 10     | 8      | 7      | 33   |
| Landmark                 | 0      | 0      | 4      | 8      | 12   |
| **Total**                | 36     | 36     | 36     | 36     | 144  |

Shape of the year: Spring builds income, Summer upgrades it, Autumn turns it into Renown and
Landmarks appear, Winter (no Yield) is big Halls, Landmarks and the last Lore ranks. Lore ranks
by Season: Spring 1-2, Summer 2-4, Autumn 3-5, Winter 5-6 (R10), so a full run needs all four.

## 3. Spring (Season 1)

| id                | Name            | Kind    | Cost  | Upgrades (cost) | Effects           | Spend   | 3   | 4   | 5   | 6   | 7   |
| ----------------- | --------------- | ------- | ----- | --------------- | ----------------- | ------- | --- | --- | --- | --- | --- |
| `woodlot`         | Woodlot         | Holding | 2c    |                 | yield 1L          | 2L      | 2   | 3   | 3   | 4   | 5   |
| `clay-bank`       | Clay Bank       | Holding | 2c    |                 | yield 1B          | 2B      | 2   | 3   | 3   | 4   | 5   |
| `sheepfold`       | Sheepfold       | Holding | 2c    |                 | yield 1W          | 2W      | 2   | 2   | 3   | 4   | 4   |
| `barley-strip`    | Barley Strip    | Holding | 2c    |                 | yield 1G          | 2G      | 2   | 2   | 3   | 4   | 4   |
| `ironstone-ledge` | Ironstone Ledge | Holding | 1L 1c |                 | yield 1O          | 1O 1c   | 1   | 2   | 3   | 3   | 4   |
| `hewers-camp`     | Hewers' Camp    | Holding | 1B 1G |                 | yield 1lab        | 1lab 1c | 1   | 1   | 2   | 2   | 3   |
| `moot-stone`      | Moot Stone      | Hall    | 1L 1B |                 | renown 2          | 4c      | 2   | 2   | 3   | 3   | 4   |
| `wayshrine`       | Wayshrine       | Hall    | 1W 1G |                 | renown 2          | 1lab 2c | 1   | 2   | 2   | 3   | 3   |
| `roadside-stall`  | Roadside Stall  | Market  | —     |                 | income 1          | 3c      | 1   | 2   | 2   | 3   | 3   |
| `wool-staple`     | Wool Staple     | Market  | 1W    |                 | exchange W        | 1W 2c   | 1   | 1   | 1   | 2   | 2   |
| `corn-exchange`   | Corn Exchange   | Market  | 1G    |                 | exchange G        | 1G 2c   | 1   | 1   | 1   | 1   | 2   |
| `toll-bridge`     | Toll Bridge     | Market  | 1L    |                 | caravan holding 1 | 4c      | 1   | 1   | 2   | 2   | 2   |
| `palisade`        | Palisade        | Watch   | 1L    |                 | guard 1           | 1L 1c   | 2   | 2   | 3   | 3   | 4   |
| `beacon-hill`     | Beacon Hill     | Watch   | 1O    |                 | guard 1, held +1c | 1O 1c   | 1   | 2   | 2   | 2   | 3   |
| `lookout`         | Lookout         | Watch   | 2c    |                 | guard 1           | 1lab 1c | 1   | 2   | 2   | 3   | 3   |
| `tally-hut`       | Tally Hut       | Lore    | 1W    |                 | lore 1            | 1lab 1c | 3   | 4   | 5   | 5   | 6   |
| `rune-stone`      | Rune Stone      | Lore    | 1B 1c |                 | lore 2            | 1lab 1B | 3   | 4   | 5   | 6   | 6   |

Intent: every Spring Holding costs about one Spend, so turn 1 is "Spend one card, build a
Holding with the goods or the starting coins". Roadside Stall is free on purpose: a safe first
build that pays 1 coin a turn until Winter.

## 4. Summer (Season 2)

| id                  | Name                     | Kind    | Cost     | Upgrades (cost)         | Effects              | Spend      | 3   | 4   | 5   | 6   | 7   |
| ------------------- | ------------------------ | ------- | -------- | ----------------------- | -------------------- | ---------- | --- | --- | --- | --- | --- |
| `log-flume`         | Log Flume                | Holding | 2B 1W    | Woodlot (1B)            | yield 2L             | 2L 1c      | 1   | 2   | 2   | 3   | 3   |
| `kiln-row`          | Kiln Row                 | Holding | 2L 1O    | Clay Bank (1L)          | yield 2B             | 2B 1c      | 1   | 2   | 2   | 3   | 3   |
| `fulling-mill`      | Fulling Mill             | Holding | 2B 1G    | Sheepfold (1B)          | yield 2W             | 2W 1c      | 1   | 1   | 2   | 2   | 3   |
| `windmill`          | Windmill                 | Holding | 2L 1B    | Barley Strip (1L)       | yield 2G             | 2G 1c      | 1   | 1   | 2   | 2   | 3   |
| `smeltery`          | Smeltery                 | Holding | 2B 1L 1G | Ironstone Ledge (1B 1L) | yield 2O             | 2O         | 1   | 1   | 1   | 2   | 2   |
| `crofters-plot`     | Crofters' Plot           | Holding | 1L 1B    |                         | yield 1W 1G          | 1W 1G 1c   | 1   | 1   | 2   | 2   | 2   |
| `hewers-yard`       | Hewers' Yard             | Holding | 2O 1G 1L | Hewers' Camp (1O 1G)    | yield 2lab           | 2lab       | 1   | 1   | 1   | 1   | 2   |
| `moot-hall`         | Moot Hall                | Hall    | 2B 1L 1G | Moot Stone (1B 1G)      | renown 4             | 2lab 1c    | 2   | 2   | 3   | 3   | 4   |
| `chapel-four-winds` | Chapel of the Four Winds | Hall    | 2W 1O 1G | Wayshrine (1W 1O)       | renown 4             | 2lab 1c    | 1   | 2   | 2   | 3   | 3   |
| `hearth-hall`       | Hearth Hall              | Hall    | 2L 1W    |                         | renown 3             | 6c         | 1   | 1   | 2   | 2   | 2   |
| `bell-tower`        | Bell Tower               | Hall    | 2B 1O    |                         | renown 3             | 1lab 1O 1c | 1   | 1   | 1   | 2   | 2   |
| `drovers-market`    | Drovers' Market          | Market  | 1W 1G    |                         | per holding 2c       | 5c         | 1   | 1   | 2   | 2   | 2   |
| `timber-wharf`      | Timber Wharf             | Market  | 1L 1W    |                         | exchange L, income 1 | 2L 1c      | 1   | 1   | 1   | 1   | 2   |
| `assay-office`      | Assay Office             | Market  | 1O 1G    |                         | exchange O           | 1O 3c      | 1   | 1   | 1   | 1   | 1   |
| `counting-house`    | Counting House           | Market  | 2G 1B    |                         | income 2             | 6c         | 1   | 2   | 2   | 2   | 3   |
| `fairground`        | Fairground               | Market  | 2W 1L    |                         | caravan 1            | 5c         | 0   | 1   | 1   | 2   | 2   |
| `gatehouse`         | Gatehouse                | Watch   | 2B 1L    |                         | guard 2              | 2B 1c      | 2   | 2   | 3   | 3   | 4   |
| `militia-yard`      | Militia Yard             | Watch   | 2O 1L    | Palisade (1O 1L)        | guard 2              | 1O 1lab 1c | 1   | 2   | 2   | 3   | 3   |
| `watchfire-ridge`   | Watchfire Ridge          | Watch   | 1O 1G 1L | Beacon Hill (1O)        | guard 2, held +1c    | 1O 1G 1c   | 1   | 1   | 2   | 2   | 3   |
| `almanac-house`     | Almanac House            | Lore    | 1W 2c    |                         | lore 2               | 2lab       | 2   | 3   | 3   | 4   | 4   |
| `star-chamber`      | Star Chamber             | Lore    | 1G 1O 1W |                         | lore 3               | 2lab 1c    | 3   | 4   | 4   | 5   | 5   |
| `map-room`          | Map Room                 | Lore    | 2W 1O    |                         | lore 4               | 2lab 1c    | 2   | 3   | 4   | 4   | 5   |

Intent: the Spring Holdings each have a Summer upgrade that doubles the yield for about one good.
Upgrading spends a Build on +1 good a turn for 8 turns (Summer and Autumn) instead of on Renown.
Moot Stone → Moot Hall → Wend Council House → High Hall is the long Hall line (2 → 4 → 7 → 10).

## 5. Autumn (Season 3)

| id                   | Name               | Kind     | Cost     | Upgrades (cost)                  | Effects                   | Spend     | 3   | 4   | 5   | 6   | 7   |
| -------------------- | ------------------ | -------- | -------- | -------------------------------- | ------------------------- | --------- | --- | --- | --- | --- | --- |
| `orchard-terraces`   | Orchard Terraces   | Holding  | 1L 1B 1W |                                  | yield 1G 1lab             | 2G 1lab   | 2   | 2   | 3   | 3   | 4   |
| `root-cellar`        | Root Cellar        | Holding  | 2B 1L    |                                  | season end 1L 1B 1W 1G 1O | 2any      | 1   | 2   | 2   | 3   | 3   |
| `wend-council-house` | Wend Council House | Hall     | 3B 2G 1O | Moot Hall (2G 1O)                | renown 7                  | 2lab 3c   | 2   | 2   | 3   | 3   | 4   |
| `windward-cathedral` | Windward Cathedral | Hall     | 3O 2L 1W | Chapel of the Four Winds (2O 1W) | renown 7                  | 3lab      | 2   | 2   | 3   | 3   | 4   |
| `players-green`      | Players' Green     | Hall     | 2W 2G 1L |                                  | renown 5                  | 2lab 3c   | 1   | 2   | 2   | 3   | 3   |
| `clock-house`        | Clock House        | Hall     | 2O 2B 1L |                                  | renown 5                  | 2O 1lab   | 1   | 2   | 2   | 3   | 3   |
| `merchants-row`      | Merchants' Row     | Market   | 2L 1W 1O |                                  | caravan 1, income 1       | 6c        | 1   | 2   | 2   | 3   | 3   |
| `harbour-exchange`   | Harbour Exchange   | Market   | 1B 1L 1G |                                  | exchange B, income 1      | 2B 2c     | 1   | 1   | 2   | 2   | 2   |
| `moneylenders`       | Moneylender's      | Market   | 2W 1O    |                                  | on build 10c              | 6c        | 1   | 1   | 1   | 2   | 2   |
| `pilgrims-inn`       | Pilgrims' Inn      | Market   | 2G 1W 1L |                                  | caravan hall 2            | 6c        | 1   | 2   | 2   | 2   | 3   |
| `rampart`            | Rampart            | Watch    | 3B 2O    | Gatehouse (2O)                   | guard 3                   | 2B 1O 1c  | 2   | 2   | 3   | 3   | 4   |
| `keep`               | Keep               | Watch    | 3O 1L 1G |                                  | guard 3                   | 2O 1lab   | 1   | 2   | 3   | 3   | 4   |
| `outriders`          | Outriders          | Watch    | 2W 1G 1O | Militia Yard (1W 1G)             | guard 2, held +2c         | 2W 1G     | 1   | 2   | 2   | 3   | 3   |
| `ferrymans-charts`   | Ferryman's Charts  | Lore     | 2W 1L    |                                  | lore 3                    | 2lab 2c   | 2   | 3   | 3   | 4   | 5   |
| `stargazers-loft`    | Stargazers' Loft   | Lore     | 2O 1W 1G |                                  | lore 4                    | 3lab      | 2   | 2   | 3   | 4   | 4   |
| `chronicle-house`    | Chronicle House    | Lore     | 2W 2O 1B |                                  | lore 5                    | 2lab 1any | 3   | 3   | 4   | 4   | 5   |
| `grain-spire`        | Grain Spire        | Landmark | 2G 2L 1B |                                  | score 2/holding           | 3any      | 1   | 2   | 2   | 2   | 3   |
| `hall-of-banners`    | Hall of Banners    | Landmark | 2O 2W 1L |                                  | score 2/Valour            | 2lab 3c   | 1   | 1   | 2   | 2   | 2   |
| `keystone-arch`      | Keystone Arch      | Landmark | 2B 2O 1G |                                  | score 2/tier              | 3lab      | 1   | 1   | 1   | 2   | 2   |

Intent: Root Cellar is the "lay in stores" card: it pays out at Autumn's end, just before the
Winter with no Yield (it also pays at Winter's end, when goods are worth nothing unless the town
has Winter Larder). Moneylender's turns goods into coins for the Treasury and Treasurer.

## 6. Winter (Season 4, no Yield)

| id                  | Name                   | Kind     | Cost           | Upgrades (cost)            | Effects                           | Spend      | 3   | 4   | 5   | 6   | 7   |
| ------------------- | ---------------------- | -------- | -------------- | -------------------------- | --------------------------------- | ---------- | --- | --- | --- | --- | --- |
| `high-hall`         | High Hall of Windamere | Hall     | 3O 3B 2W       | Wend Council House (2O 2W) | renown 10                         | 3lab 3c    | 3   | 3   | 4   | 4   | 5   |
| `snowlight-hall`    | Snowlight Hall         | Hall     | 2W 2G 2O       |                            | renown 7                          | 3any       | 2   | 3   | 4   | 4   | 5   |
| `long-barrow`       | Long Barrow            | Hall     | 3B 1O          |                            | renown 5                          | 2B 1lab 1c | 2   | 2   | 3   | 4   | 4   |
| `mere-gate-hall`    | Mere Gate Hall         | Hall     | 3L 2B 1W       |                            | renown 7                          | 3L 2c      | 1   | 2   | 2   | 3   | 4   |
| `midwinter-fair`    | Midwinter Fair         | Market   | 2W 1G          |                            | per market 3c                     | 8c         | 2   | 2   | 3   | 3   | 4   |
| `strongroom`        | Strongroom             | Market   | 2O 1B          |                            | renown 1, on build 6c             | 2O 2c      | 1   | 2   | 2   | 3   | 3   |
| `citadel`           | Citadel                | Watch    | 3O 3B 1L       | Rampart or Keep (2O 1B)    | guard 4                           | 2O 1B 1lab | 2   | 3   | 4   | 5   | 5   |
| `muster-field`      | Muster Field           | Watch    | 2W 2G 1O       |                            | guard 3, held +2c                 | 2W 2G      | 2   | 2   | 3   | 3   | 4   |
| `ice-moat`          | Ice Moat               | Watch    | 2L 1O          |                            | guard 2, renown 2                 | 2L 1c      | 1   | 2   | 2   | 3   | 3   |
| `sealed-archive`    | Sealed Archive         | Lore     | 2W 2O 1G       |                            | lore 5                            | 3lab 1c    | 2   | 3   | 3   | 4   | 5   |
| `orrery`            | Orrery of Windamere    | Lore     | 3O 2W 1B       |                            | lore 6                            | 3lab 2c    | 3   | 4   | 5   | 6   | 7   |
| `long-table`        | The Long Table         | Landmark | 2G 2W 2L       |                            | score 2/hall                      | 3any       | 1   | 2   | 2   | 3   | 3   |
| `market-cross`      | Market Cross           | Landmark | 2B 2L 1O       |                            | score 2/market                    | 3any       | 1   | 1   | 2   | 2   | 3   |
| `watchers-cairn`    | Watchers' Cairn        | Landmark | 3B 2O          |                            | score 2/watch                     | 3any       | 1   | 1   | 2   | 2   | 2   |
| `ancestors-walk`    | Ancestors' Walk        | Landmark | 1L 1B 1W 1G 1O |                            | score 4/set                       | 3any       | 1   | 2   | 2   | 2   | 3   |
| `winter-larder`     | Winter Larder          | Landmark | 2G 1L 1B       |                            | score 1/2 goods                   | 4any       | 1   | 1   | 1   | 2   | 2   |
| `pride-of-the-wend` | Pride of the Wend      | Landmark | 2O 2W 1G       |                            | score 3/neighbour beaten on halls | 3any       | 1   | 1   | 1   | 1   | 1   |

Intent: Winter Spend bands are the largest (3 to 4 units, often "any") because nothing yields.
A town arrives in Winter with its Autumn store and lives on Spends; leftovers score nothing
except through Winter Larder.

## 7. Great Works (pool of 14)

Thresholds are the standard 3 / 7 / 12 / 18 labour (R8.1) unless the row says otherwise. Each
tier lists its reward; `on build` in a tier means "when the tier completes" (R8.4).

| id                       | Name                    | Perk                              | Tier I         | Tier II         | Tier III         | Tier IV        | Thresholds |
| ------------------------ | ----------------------- | --------------------------------- | -------------- | --------------- | ---------------- | -------------- | ---------- |
| `the-mere-bridge`        | The Mere Bridge         | caravan holding 1                 | on build 4c    | renown 3        | income 2         | renown 7       | 3/7/12/18  |
| `the-wind-organ`         | The Wind Organ          | spend Lore: +1lab                 | renown 2       | lore 3          | renown 4         | renown 7       | 3/7/12/18  |
| `the-beacon-crown`       | The Beacon Crown        | guard 1                           | guard 1        | renown 3        | held +2c         | renown 7       | 3/7/12/18  |
| `the-grain-stair`        | The Grain Stair         | yield 1G                          | on build 2W    | renown 3        | yield 1W         | renown 7       | 3/7/12/18  |
| `the-stonewrights-spire` | The Stonewright's Spire | yield 1lab                        | renown 2       | renown 4        | renown 6         | renown 9       | 4/9/15/22  |
| `the-hall-of-echoes`     | The Hall of Echoes      | build Hall: +2c                   | on build 3c    | renown 3        | discount hall 1  | score 2/hall   | 3/7/12/18  |
| `the-harvest-wheel`      | The Harvest Wheel       | discount holding 1                | on build 1L 1B | renown 3        | score 1/holding  | renown 6       | 3/7/12/18  |
| `the-ice-lantern`        | The Ice Lantern         | season end 1O 1W                  | renown 2       | score 1/3 goods | renown 4         | renown 7       | 3/7/12/18  |
| `the-wolf-gate`          | The Wolf Gate           | held +2c                          | guard 1        | guard 1         | renown 4         | score 2/Valour | 3/7/12/18  |
| `the-tide-mill`          | The Tide Mill           | exchange G                        | yield 1G       | renown 3        | exchange O       | renown 7       | 3/7/12/18  |
| `the-lantern-market`     | The Lantern Market      | income 1                          | on build 3c    | renown 3        | caravan market 2 | renown 7       | 3/7/12/18  |
| `the-ring-of-oaths`      | The Ring of Oaths       | score 2/neighbour beaten on guard | guard 1        | renown 3        | guard 1          | renown 7       | 3/7/12/18  |
| `the-coinwell`           | The Coinwell            | spend Market: +2c                 | renown 2       | income 1        | renown 4         | renown 7       | 3/7/12/18  |
| `the-fourfold-gate`      | The Fourfold Gate       | score 2/set                       | on build 3c    | renown 3        | renown 4         | score 3/set    | 3/7/12/18  |

Intent: each Great Work points at one way to play (trade, Lore, Guard, yield, labour, Halls,
Holdings, Winter stores, Valour, exchange, coins, beating neighbours, sets). A tier IV is worth
about 6 to 9 Renown; a whole track about 15 to 21 plus the Perk. The Stonewright's Spire gets
labour every Yield, so its thresholds are higher.

## 8. Raids and Honours

**Raids** (R9): one per Season is drawn at setup; its strength is public from that Season's
start.

| id                    | Name                   | Season | Strength |
| --------------------- | ---------------------- | ------ | -------- |
| `raid-wolf-pack`      | Wolf Pack              | Spring | 1        |
| `raid-hill-reivers`   | Hill Reivers           | Spring | 2        |
| `raid-fen-thieves`    | Fen Thieves            | Spring | 2        |
| `raid-marsh-raiders`  | Marsh Raiders          | Summer | 3        |
| `raid-broken-company` | The Broken Company     | Summer | 3        |
| `raid-salt-corsairs`  | Saltcoast Corsairs     | Summer | 4        |
| `raid-grey-host`      | The Grey Host          | Autumn | 5        |
| `raid-boglords-levy`  | The Bog-lord's Levy    | Autumn | 6        |
| `raid-iron-riders`    | Iron Riders            | Autumn | 6        |
| `raid-frost-wights`   | Frost Wights           | Winter | 7        |
| `raid-pale-march`     | The Pale March         | Winter | 8        |
| `raid-long-night`     | Host of the Long Night | Winter | 9        |

Intent: one Watch card per Season (Guard 1, +2, +3, +4) holds every Raid. That is a quarter of
a town's builds for up to 10 Valour plus bounties; skipping Watch costs coins and Valour.

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

Checked 2026-10-29 by a throwaway script that parses this file's tables (not committed; the
content tests in `src/content/` should repeat these checks on the real data): each Season deck
sums to 27, 36, 45, 54, 63 copies at 3-7 seats; the kind totals in §2 match the tables; every
upgrade target exists and comes from an earlier Season; all 75 card ids are unique.

Not checked (needs B1 bots and qa playtests):

1. **Economy curve.** Whether Spring Holdings (about 12 goods over a game for 2 coins) are too
   strong next to Spring Halls (2 Renown). Watch for Holding-only towns winning.
2. **Labour supply.** If most towns finish tier IV, raise thresholds (R16).
3. **Caravans.** `caravan 1` (any kind) on Fairground and Merchants' Row pays up to 2 coins a
   turn; may be too strong at 7 seats where neighbours always build.
4. **Lore at 4 seats** is 33 of 144 cards. Many will be Spent for labour, which is intended; check
   that Lore runs of 5-6 are reachable but not routine.
5. **Winter goods.** Whether towns can afford Winter cards (5-8 goods) without the bank; if not,
   lower costs or raise Root Cellar's payout.
6. **Card count.** 75 cards and 14 Great Works. Art needs a frame per kind, not per card;
   illustrations per card are not needed for the first playable.
