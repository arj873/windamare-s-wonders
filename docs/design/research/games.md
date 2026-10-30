# Per-game notes (card R1)

Long notes behind `docs/design/RESEARCH.md`. Each entry: core loop, turn structure, economy,
interaction, scoring, length and counts, praise, complaints, and a takeaway for us.
Mechanics are paraphrased; no rulebook text or card lists are reproduced. _(unverified)_ marks
numbers from memory or one weak source.

---

## 7 Wonders (Antoine Bauza, Repos 2010; 2nd edition 2020)

- **Core loop:** draft a card, then use it one of three ways: build it into your city, put it
  under your wonder board as a wonder stage, or throw it away for coins.
- **Turn structure:** three ages. Each age everyone gets a fresh hand of seven; pick one in
  secret, reveal together, resolve, pass the rest. Six picks per age; the seventh card is thrown
  away. Pass direction flips in the middle age.
- **Economy:** cards cost resources or coins. Resources come from your own production cards and
  your wonder; you may buy a missing resource from either neighbour for coins, paid to them.
  Some commercial cards cut that price. Building a card's named predecessor makes it free.
  Resources are not spent: production is a per-turn capacity, not a stockpile.
- **Interaction:** only with the two neighbours: buying their resources (they get the coins),
  military comparison at each age end, a few cards that score from neighbours' cities, and
  hate-drafting the hand you pass.
- **Scoring:** at game end only: military tokens, coins, wonder stages, civic cards, commercial
  cards, guilds, science sets. Science scores super-linearly (per-symbol squares plus a set
  bonus), which makes a pure science player a runaway threat.
- **Counts and length:** 3-7 (2 with a dummy variant in 1st edition; removed in 2nd edition).
  ~30 minutes at every count. Card counts per age scale with player count (cards tagged with a
  minimum player count).
- **Praise:** scales to 7 with no added length; simultaneous play, no downtime; many viable
  strategies; quick once known. Kennerspiel des Jahres 2011 _(unverified year/award, check)_.
- **Complaints:** icon-heavy, steep first game; final scoring is a long tally and hard to follow
  mid-game; interaction is thin beyond neighbours ("multiplayer solitaire"); the 2-player variant
  is widely disliked; science can run away if neighbours don't block it; at 3 players the seat
  you get matters more.
- **Takeaway:** simultaneous pick-reveal-pass plus neighbour-only interaction is the backbone to
  keep. The exact age cadence, resource market, military table, science formula, wonder-tuck
  and colour taxonomy are what we must not copy (see RESEARCH.md section 4).

## 7 Wonders Duel (Bauza and Bruno Cathala, Repos 2015)

- **Core loop:** two players take turns picking cards from a shared layout. Each age deals its
  cards into an overlapping pattern with some face-down; you may only take a card that nothing
  covers, which can uncover cards for your opponent.
- **Economy:** missing resources are bought from the bank, and the price goes up with how much of
  that resource your opponent produces. So your production taxes your rival.
- **Interaction:** a shared military track: shields push a marker toward the opponent's side;
  reaching the end wins at once, and crossing zones costs the opponent coins. Science: matching
  pairs grant a pick from a small pool of permanent bonus tokens; collecting six distinct science
  symbols wins at once.
- **Wonders:** each player drafts four from eight before play; only seven can be built in total.
  Several give an extra turn.
- **Scoring:** military supremacy or science supremacy (instant), else points at the end.
- **Counts and length:** 2 only; ~30 min.
- **Praise:** the strongest 2-player answer in the family; tense, readable interaction;
  three visible ways to win make the leader race public.
- **Complaints:** swingy instant wins; face-down card reveals add luck; analysis paralysis.
- **Takeaway:** for 2 players, drop hand passing and use an open, partly hidden layout. Visible
  tug-of-war beats summed-up military points. Taxing the rival via their own production is
  elegant (its exact formula is Duel's; do not copy).

## 7 Wonders Architects (Bauza, Repos 2021)

- **Core loop:** take one card per turn from three choices: the face-up top of the deck on your
  left, the face-up top of the deck on your right, or the blind top of a central deck.
- **Economy:** no costs on cards. Wonder stages need sets of resource cards (some number of
  identical or of different kinds); gold is wild.
- **Interaction:** decks are shared with neighbours; some cards push a shared war clock, and when
  it fills everyone fights both neighbours.
- **Scoring:** points from wonder, civic cards, military, science bonus tokens. Game ends when a
  wonder is finished.
- **Counts and length:** 2-7, ~25 min, aged 8+.
- **Praise:** very fast teach, family weight, good at 6-7.
- **Complaints:** luck of blind draws; low depth; replay value limited.
- **Takeaway:** a turn-based "pick from neighbours' piles" model is a valid lighter alternative
  to simultaneous passing, but it brings back downtime.

## Sushi Go! (Phil Walker-Harding, Gamewright 2013; Sushi Go Party 2016)

- **Core loop:** pick one card, reveal together, pass. Every card in the hand gets played.
- **Turn structure:** three rounds; hand size depends on player count (10/9/8/7 for 2/3/4/5).
- **Scoring:** each card type has its own small rule: pairs, triples, an increasing-returns
  stack, a multiplier that boosts the next card, a per-round majority, and one end-game majority
  where the leader gains and the last place loses.
- **Counts and length:** 2-5 (Party: 2-8); ~15 min.
- **Praise:** teaches in two minutes; hate-drafting is fun; Party's swappable menu keeps it fresh.
- **Complaints:** light and luck-driven; 2 players becomes pure denial; last pick of each round
  is forced.
- **Takeaway:** "every card type has one tiny scoring rule" is the most teachable design in the
  genre. A long-game majority with a penalty for last is a gentle, non-hostile catch-up tool.

## It's a Wonderful World (Frédéric Guérard, La Boîte de Jeu 2019)

- **Core loop:** draft seven cards; then, for each, either keep it under construction or recycle
  it now for one resource cube. Then produce.
- **Turn structure:** four rounds: draft, plan, produce. Production runs one resource type at a
  time in a fixed order; cubes go straight onto unfinished cards, so finishing a card early in
  the round lets it produce later in the same round.
- **Economy:** five resource types plus a wild crystal made by trading in cubes.
- **Interaction:** the draft, plus a bonus to whoever produces most of each resource type each
  round. Little else.
- **Scoring:** card points plus multipliers (per card type, per bonus token).
- **Counts and length:** 1-5 (solo mode); ~45 min.
- **Praise:** satisfying engine; no downtime; every card is useful because of the recycle option.
- **Complaints:** multiplayer solitaire; lots of cube shuffling; table space.
- **Takeaway:** "build it or burn it for a resource" dual-use makes bad hands still useful. The
  ordered production step is a fun timing puzzle and digitises well (the app does the cubes).

## Fairy Tale (Satoshi Nakamura, Yuhodo 2004; Z-Man English edition)

- **Core loop:** draft five, then play three and discard two.
- **Turn structure:** four rounds, twelve cards played in total.
- **Interaction:** many cards flip other cards face-down (yours or opponents'); face-down cards
  score nothing. Some cards turn cards back up.
- **Scoring:** sets and multipliers, end of game.
- **Counts and length:** 2-5 (basic rules 2-4, expert 2-5); ~20 min.
- **Praise:** tight decisions with very few cards; flipping makes the table matter; good art.
- **Complaints:** flip rules confuse at first; take-that can feel arbitrary.
- **Takeaway:** "draft more than you can play" makes every round a cut decision; a disable
  effect is cheap interaction but must stay rare and readable.

## Among the Stars (Vangelis Bagiartakis, Artipia 2012)

- **Core loop:** draft location cards and place them into a grid-shaped space station.
- **Economy:** credits; new locations need energy from a reactor within range, so layout is
  constrained. Discarding a card for credits is the fallback _(unverified amount)_.
- **Interaction:** low; an optional aggressive mode adds hostile cards.
- **Scoring:** mostly at placement, from adjacency and card abilities, plus objectives.
- **Counts and length:** 2-4 (expansions raise it); 30-60 min.
- **Praise:** spatial puzzle on top of a 7 Wonders-style draft.
- **Complaints:** reviewers call the draft derivative of 7 Wonders; a lot of card text.
- **Takeaway:** a spatial tableau (adjacency) is one way to make a city feel like a place, and to
  differ from 7 Wonders' flat tableau.

## Seasons (Régis Bonnessée, Libellud 2012)

- **Core loop:** pre-game draft of nine power cards, split into three packets of three, one
  packet unlocked per year. Main game: each round dice are rolled and drafted in turn order; dice
  give energy, crystals, card draws or summoning capacity; the last die left sets how far time
  advances.
- **Economy:** four energy types tied to seasons; their exchange rate changes by season.
- **Interaction:** take-that cards; dice denial.
- **Scoring:** crystals plus card points, minus penalties.
- **Counts and length:** 2-4; ~60 min.
- **Praise:** combos, art, the prelude draft as "build your deck before playing".
- **Complaints:** long card text; combos make turns long; steep learning curve; take-that.
- **Takeaway:** a pre-game draft that you plan around later is a strong hook, but text-heavy
  cards hurt a browser game's readability.

## Paper Tales (Masato Uesugi, Catch Up Games 2017)

- **Core loop:** simultaneous draft of units, then place them in a front and back row, then war,
  income, build, and aging.
- **Aging:** units collect an aging marker each round and die on the second, so the tableau keeps
  turning over.
- **Interaction:** war against both neighbours each round: compare front-row strength with each;
  win (ties count as wins for both) gives points.
- **Scoring:** points each round from war and buildings.
- **Counts and length:** 2-5 (reviews; one rulebook listing says more); ~30 min.
- **Praise:** aging stops runaway engines; neighbour war is clear; quick.
- **Complaints:** thinner replay value for some reviewers; 2p needs special rules.
- **Takeaway:** decay/aging is a good original lever to cap engines; per-round neighbour combat
  with "ties count for both" keeps it friendly.

## Ark Nova (Mathias Wigge, Feuerland 2021)

- **Core loop:** five action cards sit in slots 1 to 5; an action's strength equals its slot,
  and using it sends it back to slot 1. Play animals and sponsors from hand into a zoo board.
- **Scoring:** two tracks (appeal and conservation) start apart and move toward each other; the
  game ends when they meet; final score is how far past each other they got.
- **Counts and length:** 1-4; 90-150 minutes (first 4p game ~4 hours per one review).
- **Praise:** deep engine; huge card variety; elegant action strength mechanic.
- **Complaints:** long; low interaction; heavy card text; card draw luck.
- **Takeaway:** too heavy for our target, but two ideas travel: an action's strength rising the
  longer you wait, and a game end that players drive themselves.

---

## Still to add (deepening pass)

Between Two Cities (shared cities with both neighbours; your score is your lower city),
Draftosaurus, Res Arcana (opening draft), Blood Rage (draft into area control), Terraforming Mars
(draft-4 variant), Tides of Time (2-player draft), 7 Wonders expansions (Leaders, Cities, Armada).
