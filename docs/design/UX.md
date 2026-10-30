# UX spec — Windamere's Wonders

Owner: ww-ui (card U0). Status: **draft v2, untested.** The draft table exists as a skeleton
(U1, toy ruleset); nothing has been playtested. Feel bar: colonist.io for Catan. Fast, clear,
satisfying online play.

This spec covers every screen from the home screen to the final scores, on desktop and phone.
Card content (kinds, costs, Spend bands, goods, scoring categories, Season length, hand size,
player range) is ww-design's (`docs/RULES.md`, `docs/design/CARDS.md`). Where the UI needs that
content, the spec leaves a **slot**, written `⟨like this⟩`. §14 lists every slot.

**Rules this spec follows** (human decision 2026-10-29; rule text lands as RULES.md D2c, and
numbers stay slots until then):

- **Single pick.** Each turn every town takes **one card** from its hand and uses it one way:
  **Build** it into the town (pay its cost) or **Spend** it for the goods, coins or labour on its
  Spend band. There is no third use; the **Great Work** never costs a pick (it rises with labour).
- **Goods are tokens in a store** (names ⟨goods⟩, new set TBD). Towns show what they hold, not
  what they "make".
- **Neighbour trade.** A missing good can be bought from a neighbour (coins go to them) or at the
  bank, at ⟨prices⟩.
- **Words** (ORIGINALITY.md §5): Season, town, Great Work, tier, store, coins, Renown, Raid,
  Guard, Lore, upgrade. 7 Wonders terms (Age, wonder stage, shield, science, guild, chain) and
  its numbers do not appear in the UI or in this spec (research R4 review, O4 and O12).

Most of the shell is a port of the Catan project's UI (`/home/blop/projects/catan/src/ui`, same
author, same stack). §14 maps each Catan module to its use here.

## Contents

1. Principles and feel budget
2. Wireframe legend
3. Screen map
4. Home screen (title)
5. Setup screen (offline: players, bots, mode)
6. Lobby (online: invite link)
7. Draft table (the main screen)
8. Pick → reveal → pass (the core moment)
9. Hotseat with several humans
10. End of a Season and final scoring
11. Overlays: menu, card detail, town sheet, toasts, dialogs, tutorial
12. Phone and tablet layouts
13. Accessibility
14. Slots for ww-design, needs from other lanes
15. Reuse map (Catan → here)
16. Open questions
17. Online client API (what `RoomClient` gives the UI)
18. Test hooks (qa playtest harness)
19. The fx seam (reveal animation and sound)

---

## 1. Principles and feel budget

**P1. Nobody waits on the UI.** Picks are simultaneous, so the only acceptable wait is another
player thinking. Animations never block input for the next pick, and every animation can be
skipped with a click or a key.

**P2. Always know what the game is waiting for.** The top bar always shows the Season, the pick
number, the pass direction, the timer, and who has not picked yet. There is never a screen where
the player asks "is it stuck?".

**P3. Two clicks to pick.** First click selects a card, second click chooses Build or Spend. A
power-user shortcut does it in one (drag to a target, or a double-click for the default use).
Use **undo, not confirm**: a locked pick can be changed until the reveal starts, so no "Are you
sure?" dialog is needed.

**P4. The reveal is the payoff.** Every pick ends with all cards flipping at once. That moment
gets the best animation and sound in the game, kept short (§8.3).

**P5. Public information is never more than one click away.** You always see both neighbours and
a summary row per player. Any town opens in full with one click.

**P6. Hidden information never leaks.** Your hand is visible only to you (hotseat: behind a pass
cover, §9). "Has picked" status is public; _what_ was picked is not, until the reveal. The UI
renders a per-seat view and never reads another seat's hand (Catan rule: render the `GameView`).

**P7. Explain disabled things.** A card you can't afford, or a use you can't take, says
why on hover or tap ("Missing ⟨good⟩ ×1"). This is Catan's `blockReasons` + `.why` bubble
pattern.

**Feel budget** (targets for U1, measured in playtest; all untested):

| Moment                                          | Target                                           |
| ----------------------------------------------- | ------------------------------------------------ |
| Click → visible response (select, hover, lock)  | < 100 ms                                         |
| Lock pick → card face-down on your staging slot | ≤ 200 ms                                         |
| Last pick locked → reveal done (all seats)      | ≤ 1.2 s, skippable                               |
| Pass animation (old hand out, new hand in)      | ≤ 400 ms                                         |
| UI overhead per pick, beyond thinking           | ≤ 2 s                                            |
| Bot "thinking" delay (Normal speed)             | 300 to 900 ms random, so status chips feel alive |
| Final score tally animation                     | ≤ 6 s total, skippable                           |

---

## 2. Wireframe legend

Wireframes show layout and information, not style. Colours, fonts, frames and icons belong to
ww-art (`src/ui/theme`, `public/art`, `docs/design/ART.md`).

| Mark        | Meaning                                                                          |
| ----------- | -------------------------------------------------------------------------------- |
| `⟨…⟩`       | slot: content comes from ww-design or the engine                                 |
| `▲ ● ■ ◆ ★` | placeholder card-kind icons, one shape per kind (kind is never colour-only, §13) |
| `g`         | coins (icon from ww-art)                                                         |
| `⟨a⟩3`      | goods in a store: ⟨good⟩ icon + count, in the rules' goods order                 |
| `~23`       | public Renown estimate (every input is public, ORIGINALITY.md §3 row 18)         |
| `▰▰▱▱`      | Great Work: tiers reached / ⟨tier count⟩                                         |
| `✓` / `⋯`   | seat has locked its pick / still thinking                                        |
| `▒▒▒`       | face-down card (a locked pick before the reveal)                                 |
| `[Label]`   | button; `(K)` = keyboard shortcut                                                |
| `◀ ▶`       | pass direction / neighbour side                                                  |

---

## 3. Screen map

```
                        ┌───────────────┐
   invite link ───────▶ │ Join card     │──────────────────────────┐
   (?room=CODE)         │ nickname→Join │                          │
                        └───────────────┘                          ▼
┌──────────────┐  Play vs bots   ┌───────────────┐  Start   ┌────────────────┐
│ Home (§4)    │───────────────▶ │ Setup (§5)    │────────▶ │ Draft table    │◀─┐
│              │                 └───────────────┘          │ (§7, §8)       │  │ next pick
│              │  Play online    ┌───────────────┐  Start   │                │──┘
│              │───────────────▶ │ Lobby (§6)    │────────▶ │                │
│              │  Join with code └───────────────┘          └───────┬────────┘
│              │──────────────────────▲                             │ last pick of a Season
│              │  Learn to play  ─────┼──▶ tutorial game (§11.6)    ▼
└──────┬───────┘                      │                     ┌────────────────┐
       │ unfinished save              │                     │ Season end     │──▶ next Season
       ▼                              │                     │ (§10.1)        │
┌──────────────┐                      │                     └───────┬────────┘
│ Welcome back │ Resume / New game    │                             │ last Season
│ (§4.2)       │                      │                             ▼
└──────────────┘                      │                     ┌────────────────┐
                                      │   Back to lobby     │ Final scoring  │──▶ Game stats
                                      └─────────────────────│ (§10.2)        │──▶ Rematch / New game
                                                            └────────────────┘
```

Every full screen has the menu (☰) top-left with Rules, Theme, Sound and (in a game) New game /
Leave room. Esc closes the top-most overlay.

---

## 4. Home screen (title)

Port of Catan's `HomeScreen` (`src/ui/online/home.ts`): one centred card on the themed page
background, theme picker bottom-right, feedback footer. It loads without the engine (first chunk
stays small).

```
┌────────────────────────────────────────────────────────────────────────────┐
│                                                                            │
│                         ┌──────────────────────────────┐                   │
│                         │        ⟨logo / wordmark⟩      │                   │
│                         │      Windamere's Wonders      │                   │
│                         │  Draft cards. Grow a town.    │                   │
│                         │  Raise a Great Work.          │                   │
│                         │                              │                   │
│                         │  [◉ avatar] [Your nickname ] │                   │
│                         │                              │                   │
│                         │  [   Play vs bots          ] │  ← primary        │
│                         │  [   Play online           ] │  creates a room   │
│                         │  [ Code ____ ] [Join]        │  code or link     │
│                         │                              │                   │
│                         │  ? Learn to play  · Rules    │                   │
│                         │  ⟨error line, role=alert⟩     │                   │
│                         └──────────────────────────────┘                   │
│                                                                            │
│  feedback · credits                                       Theme ▾  Sound ▾ │
└────────────────────────────────────────────────────────────────────────────┘
```

- **Play vs bots** opens the setup screen (§5), defaulting to you + bots. Hotseat with several
  humans is a setting there, not a separate button.
- **Play online** creates a room and opens the lobby (§6) as host.
- **Join with code** accepts a room code or a pasted invite link (Catan `parseRoomCode`).
- The nickname is remembered (`localStorage`); the avatar chip opens the profile dialog (Catan
  `src/ui/profile`).
- First visit only: a dismissible "New here? Learn to play in ~10 minutes" card over the home card
  (Catan `offerTutorial`; not shown to players with a save or saved setup).

### 4.1 Invite-link landing (join card)

Same card, opened by `?room=CODE`: "Join ⟨host⟩'s table" + nickname + **[Join]** /
**[Watch]**. If a token for this room is stored, connect at once (reload or reconnect) with no
card. If the room is gone, a full-screen notice: "That room has closed" + **[Home]**.

### 4.2 Welcome back (resume)

Catan `showResumePrompt`: on load with an unfinished hotseat save, "Welcome back · ⟨4 players ·
⟨Season⟩, pick 3⟩" with **[New game]** and **[Resume]**. Tutorial saves read "Unfinished tutorial
game".

---

## 5. Setup screen (offline: players, bots, mode)

Port of Catan's `SetupScreen` (`src/ui/setup/screen.ts`): stacked sections in a scroll area and
a sticky footer with a one-line summary and **Start game**. The draft is saved on every change
(`saveSetup`), so the next game starts from the last setup.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ ⟨logo⟩  New game                                      [? Learn to play          ]│
│         Windamere's Wonders                           [  New here? Start here   ]│
│                                                                                  │
│ MODE ─────────────────────────────────────────────────────────────────────────── │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                              │
│  │ ◉ Standard   │ │ ○ ⟨variant⟩  │ │ ○ ⟨variant⟩  │   one tile per ruleset       │
│  │ ⟨1-line⟩     │ │ ⟨1-line⟩     │ │ ⟨1-line⟩     │   (from design / engine)     │
│  └──────────────┘ └──────────────┘ └──────────────┘                              │
│                                                                                  │
│ PLAYERS ──────────────────────────────────────────────── table order ↻ ──────── │
│  1 [◉] [Arjun          ] ● ● ● ● ● ● ● ●   [Human|Bot]                    [×]     │
│  2 [🤖] [Bot Ada        ] ● ● ● ● ● ● ● ●   [Human|Bot]  [Normal ▾]        [×]     │
│  3 [🤖] [Bot Brin       ] ● ● ● ● ● ● ● ●   [Human|Bot]  [Easy   ▾]        [×]     │
│  4 [🤖] [Bot Cass       ] ● ● ● ● ● ● ● ●   [Human|Bot]  [Hard   ▾]        [×]     │
│  [+ Add player]   ⟨3–7⟩ players · seats sit in this order around the table          │
│  ⓘ 2 humans on one device: you pass the device for every pick (§9).               │
│                                                                                  │
│ PICK TIMER ─────────────────────────────────────────────────────────────────────  │
│  [Off] [30 s] [45 s] [60 s] [90 s]       When time runs out: ⟨auto-pick rule⟩      │
│                                                                                  │
│ RULE OPTIONS ───────────────────────────────────────────────────────────────────  │
│  ⟨toggle tiles from design, e.g. variants, Great Work: choose 1 of 2 / random⟩     │
│                                                                                  │
│ ▸ More options:  seed [______]   Great Work assignment ⟨random | choose⟩           │
├──────────────────────────────────────────────────────────────────────────────────┤
│ Standard · 4 players (3 bots) · 45 s picks         Sound ▾  Theme ▾ [Start game] │
└──────────────────────────────────────────────────────────────────────────────────┘
```

- **Seats**: name, avatar (Catan `seatLookButton`), colour swatches (unique per seat; Catan
  `pickSeatColor`), Human/Bot segment, bot level (Catan `botLevelSelect`: Easy / Normal / Hard),
  × to remove, **+ Add player**. Min and max players: ⟨player range⟩. Seat order matters in a
  drafting game (neighbours), so the section title says "table order" and seats can be
  reordered by drag or ↑/↓ keys. A ↻ button shuffles the order.
- **Mode** tiles: one per ruleset ww-design ships. Until then: one "Standard" tile.
- **Pick timer**: off by default when there is one human (bots never need a timer); 45 s
  default online. What happens on time-out is a rule (⟨auto-pick rule⟩), shown under the timer.
- **Hotseat note**: appears when 2+ seats are Human, with the cost (one pass cover per human per
  pick, §9).
- **Footer summary**: Catan `renderSummary`. An invalid setup shows the reason (role=alert) and
  disables Start (Catan `setupError`).
- **Back to game** in the footer when a game is running (Catan `onBack`).

---

## 6. Lobby (online: invite link)

Port of Catan's `LobbyScreen` (`src/ui/online/lobby.ts` + pure `lobbyModel.ts`). Room logic
belongs to ww-net (`docs/MULTIPLAYER.md`); this section is the screen.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ ⟨logo⟩ Lobby · Room  K7QF                                              [Leave]   │
│                                                                                  │
│ INVITE ──────────────────────────────────  │ CHAT ───────────────────────────────│
│ [ https://…/?room=K7QF         ] [Copy link]│ Ana: hi!                            │
│ Anyone with the link joins and takes a seat.│ Cy joined                           │
│                                            │                                     │
│ SEATS (table order) ─────────────────────  │                                     │
│ ┌──────────────────────────────────────┐   │                                     │
│ │ ● Arjun (host, you)   ✓ connected    │   │                                     │
│ │   ● ● ● ● ● ● ● ●            [Stand] │   │                                     │
│ ├──────────────────────────────────────┤   │                                     │
│ │ ● Ana                 ✓ connected    │   │                                     │
│ ├──────────────────────────────────────┤   │                                     │
│ │ ● Open seat — a Normal bot plays it  │   │                                     │
│ │   [Normal ▾]               [Remove]  │   │                                     │
│ └──────────────────────────────────────┘   │                                     │
│ [+ Add bot]                                │ 👍 😂 😮 😢 👏 🤔 GG                 │
│                                            │ [Say something…            ] [Send] │
│ SETTINGS (host) ─────────────────────────  │                                     │
│ ⟨setup screen §5 sections: mode, timer,    │                                     │
│  options; inert + dimmed for guests⟩       │                                     │
├──────────────────────────────────────────────────────────────────────────────────┤
│ Standard · 3 players + 1 bot · 45 s picks                          [Start game]  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

- Same behaviour as Catan: joining auto-seats you; members sit, move, stand and pick a free
  colour; open seats are bots with a host-set level; host has **Add bot**, **Remove**, **Start**
  (needs someone seated); "Copy link" turns into "Copied!" in place; settings are the setup
  screen wrapped (seats, seed, footer hidden), `inert` for guests.
- A member without a seat sees "You're watching. [Sit here]" at the top.
- Online the pick timer is on by default (one slow player holds up everyone). Length: ⟨timer
  default⟩; ui proposes 45 s, net's N0 guessed 60 s. Design decides.
- Lobby again after a game: host's "Back to lobby" is the rematch path.

---

## 7. Draft table (the main screen)

The screen you spend the whole game on. Desktop reference size 1440×900; must work from 1280×720
up. Layout regions (CSS grid; the HUD regions follow Catan's `.hud-side` / `.hud-turn` /
`.hud-bottom` naming where it fits):

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│☰│  ⟨Season⟩ · Pick 3 of ⟨n⟩ · hands pass ◀ to Ana   Raid ⟨n⟩  ⏱ 0:38  ✓Ana ⋯Cy ✓Dee ⋯You  │ ⇥ │ A
├─┴───────────────┬──────────────────────────────────────────────┬────────────────┬───────────┤
│ ◀ ANA (left)    │ YOUR TOWN · Arjun                g 7   ~23   │ CY (right) ▶   │ TABLE  ‹  │
│ g 4   ~18   ✓   │ store ⟨a⟩3 ⟨b⟩0 ⟨c⟩2 ⟨d⟩1 ⟨e⟩0   Guard 4/⟨n⟩ │ g 9   ~20   ⋯  │ ↻ ◀◀◀◀    │ D
│ ⟨a⟩2 ⟨c⟩1 · G 3 │ ▲3  ●2  ■1  ◆4  ★0  …             Lore ⟨run⟩ │ ⟨b⟩3 ⟨d⟩1 · G 5│ 1 Ana ✓ 4g│
│ ▲ ⟨name⟩        │ ┌────┐┌────┐┌────┐  ┌────┐┌────┐  ┌────┐      │ ▲ ⟨name⟩       │   ~18 ▰▰▱ │
│ ▲ ⟨name⟩        │ │▲   ││▲   ││▲   │  │●   ││●   │  │■   │ …    │ ● ⟨name⟩       │ 2 Cy  ⋯ 9g│
│ ● ⟨name⟩        │ │⟨n⟩ ││⟨n⟩ ││⟨n⟩ │  │⟨n⟩ ││⟨n⟩ │  │⟨n⟩ │      │ ● ⟨name⟩       │   ~20 ▰▱▱ │
│ ■ ⟨name⟩        │ └────┘└────┘└────┘  └────┘└────┘  └────┘      │ ◆ ⟨name⟩ …     │ 3 You ⋯ 7g│
│                 │  (cards grouped by kind, in play order)       │                │   ~23 ▰▰▱ │
│ Great Work ▰▰▱▱ │ GREAT WORK ⟨name⟩  ▰▰▱▱  tier 2 of ⟨n⟩       │ Great Work ▰▱▱▱│ 4 Dee ✓ 2g│
│                 │ labour 5 → ⟨n⟩ for tier 3 · Perk: ⟨perk⟩     │                │   ~15 ▰▱▱ │
│                 │                ┌────────┐                    │                ├───────────┤
│                 │                │▒▒▒▒▒▒▒▒│ staged pick         │                │ LOG       │ E
│                 │                └────────┘                    │                │ Pick 2    │
├─────────────────┴──────────────────────────────────────────────┴────────────────┤ Ana ▲⟨n⟩  │
│ YOUR HAND · 5 cards                                    [↶ Change pick] (Z)       │ Cy +⟨a⟩2  │ C
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐                      │ …         │
│  │⟨cost⟩ ▲ │ │⟨cost⟩ ● │ │⟨cost⟩ ■ │ │⟨cost⟩ ◆ │ │⟨cost⟩ ★ │                      ├───────────┤
│  │ ⟨name⟩  │ │ ⟨name⟩  │ │ ⟨name⟩  │ │ ⟨name⟩  │ │ ⟨name⟩  │                      │ CHAT      │ F
│  │⟨effect⟩ │ │⟨effect⟩ │ │⟨effect⟩ │ │⟨effect⟩ │ │⟨effect⟩ │                      │ (online)  │
│  │→⟨spend⟩ │ │→⟨spend⟩ │ │→⟨spend⟩ │ │→⟨spend⟩ │ │→⟨spend⟩ │                      │           │
│  │ ✓ Build │ │ ✓ Build │ │ ⇄ trade │ │ ✗ Spend │ │ ✓ Build │                      │           │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘                      │           │
└───────────────────────────────────────────────────────────────────────────────────┴───────────┘
  A top bar · B left neighbour · C your hand · D table summary · E log · F chat
  (centre: your town; right of it: right neighbour). G = Guard. →⟨spend⟩ = the card's Spend band.
```

### 7.1 Top bar (A)

- **Menu** ☰ (§11.1).
- **Round pill** (centre; Catan `.hud-turn`): "⟨Season⟩ · Pick 3 of ⟨picks per Season⟩ · hands
  pass ◀ to Ana". The pass arrow and the neighbour's name change with the Season's pass
  direction (⟨pass direction rule⟩). The pill drops in only when its text changes (Catan lesson:
  don't replay the animation on every timer tick).
- **Raid badge** (if the rules keep Raids): this Season's Raid strength, public from the
  Season's start (ORIGINALITY.md §3 row 6), so everyone can plan Guard for it.
- **Timer** (only when a pick timer is on): ring + seconds. One shared round clock for all
  seats, owned by the server online (`docs/MULTIPLAYER.md` §2.1.1). Last 10 s: red + pulse
  (Catan `TIMER_WARN_SEC`). Once you lock, the ring dims and reads "✓ locked".
- **Pick status chips**: one per seat in table order, avatar ring + ✓ / ⋯. No card information.
  When you are the **last** seat still thinking, your chip and the hand header get a soft pulse
  after 5 s, "Everyone's waiting for you". No pulse in a game with no other humans (bots don't
  mind).
- **⇥** collapses the right sidebar (D–F).

### 7.2 Your town (centre)

- Header: name, coins, Renown estimate, your **store** (each ⟨good⟩ with its count, in the
  rules' goods order, zeros dimmed), Guard against this Season's Raid, your Lore run, counts per
  kind (`▲3 ●2 …`). The store is what you can pay with right now, so it sits next to the hand.
- Cards grouped by kind in columns, within a kind in play order (newest at the end, briefly
  highlighted after the reveal). Each tableau card shows kind icon + name + a 1-line effect
  summary at small size; hover or focus opens the card detail (§11.2). With many cards a kind
  column overlaps cards like a fanned stack (name strip visible), never scrolls. A card covered
  by an upgrade (⟨upgrade rule⟩) shows tucked under the card that replaced it, dimmed.
- **Great Work** strip: name, tier progress `▰▰▱▱`, labour toward the next tier, the Perk.
  It fills from labour (Spend bands, Holdings), never from a pick, so it has no button.
  Art: ww-art.
- **Staging slot**: where your locked pick sits face down until the reveal (§8). Empty while
  choosing.

### 7.3 Neighbours (B and right of centre)

Both neighbours are always shown: you can buy goods from them (neighbour trade), and ⟨neighbour
effects⟩ (e.g. Caravan-style income, Raid bounties) depend on them. Each panel: name + avatar +
status chip, coins, Renown estimate, their **store** (what they could sell you, with the price
⟨neighbour price⟩), Guard, their cards as a compact list grouped by kind (icon + name), Great
Work progress. The side matches the table: left neighbour on the left. Click the panel header →
full town sheet (§11.3).

### 7.4 Your hand (C)

- Cards at full size in one row (fan only when the hand does not fit). Hand size this pick:
  "5 cards".
- Each card shows its cost and its **Spend band** (`→⟨spend⟩`: what Spend gives), so both uses
  read at a glance.
- Each card carries a **Build badge** computed from the engine's legal picks, not re-derived in
  the UI:
  - `✓ Build` affordable from your store and coins (⟨free / paid⟩ shown on the badge),
  - `⇄ trade` affordable only by buying goods (from a neighbour or the bank),
  - `✗` can't Build (⟨why⟩ on hover/tap, P7: "short ⟨good⟩ ×1, no seller", "one per town").
    Spend is always possible, so `✗` dims the Build path only, never the card.
  - plus a marker when the card ⟨upgrades a card you own⟩.
- Select: click / tap / number key `1`–`9`. Selected card lifts; the **action popover** opens
  above it (§8.1).
- **Change pick** (Z) appears after you lock, until the reveal starts.

### 7.5 Table summary (D)

One row per seat, table order, you highlighted, neighbours marked ◀/▶:
avatar + name, status ✓/⋯, coins, Renown estimate, Great Work ▰▰▱, counts per kind, and the
⟨Honours⟩ each seat currently holds.
Above the rows, a **table ring** (↻ + arrows) shows seat order and this Season's pass direction,
so a 5+ player table stays readable. Click a row → that town's sheet (§11.3).
Collapsible like Catan's sidebar sections.

### 7.6 Log (E) and chat (F)

- **Log** (Catan `LogList` + `log.ts` parsing): grouped per pick: "Pick 3 · Ana built ▲⟨name⟩
  (bought ⟨a⟩ from you, +2g to you) · Cy spent ●⟨name⟩ (+⟨a⟩2) · You built ◆⟨name⟩", icons
  inline, unknown text stays text. Season-end events (the Raid) get a group of their own. Your
  own lines read "You".
- **Chat** (online only): Catan `ChatPanel` + quick reactions (👍 😂 😮 😢 👏 🤔 GG); reactions
  float briefly over the sender's seat chip.

### 7.7 Seat counts

Layout is designed for ⟨3–7⟩ seats and must not break at 2 or 8: the neighbour panels stay two;
the summary and status chips scale (chips become avatars only past 5 seats).

---

## 8. Pick → reveal → pass (the core moment)

Each pick runs this cycle. The UI follows the engine view's phase. It never assumes timing,
because online the server decides when the reveal happens.

```
 CHOOSING ──lock──▶ LOCKED ──all locked──▶ REVEAL ──done──▶ PASS ──new hand──▶ CHOOSING
    ▲  │              │ ▲                                                       (next pick)
    │  └─ timer out ──┼─┼──▶ ⟨auto-pick rule⟩ → LOCKED
    └──── change pick ┘ │                                    last pick of a Season ──▶ SEASON END
                        └─ (only until REVEAL starts)
```

### 8.1 Choosing

```
                 ┌──────────────────────────────────────┐
                 │ ⟨Card name⟩                    ▲ ⟨kind⟩│
                 │ ⟨effect text, full⟩                    │
                 │ Cost ⟨a⟩2 ⟨c⟩1 · you hold ⟨a⟩3 ⟨c⟩0    │
                 ├──────────────────────────────────────┤
                 │ [ Build          pay ⟨a⟩2 + 2g ]  (B)│  primary when legal
                 │   pay ⟨c⟩1: ◉ Ana 2g  ○ Cy 2g  ○ bank│  only if goods are short
                 │ [ Spend          +⟨spend band⟩ ]  (S)│
                 │   ✗ Build: ⟨why not⟩                 │  if Build is illegal
                 └───────────────────┬──────────────────┘
                              ┌──────┴──┐
                              │ ⟨card⟩  │ (lifted)
```

- Two uses, two buttons: **Build** (with what it costs you: goods from your store, coins, and
  any goods bought) and **Spend** (with what it gives: the card's Spend band). Spend is always
  legal; Build shows disabled with the engine's reason when it is not. Both come from the
  engine's legal picks for the viewer.
- **Trade row**: when Build needs goods you don't hold, the popover grows one row per missing
  good with the sellers: each neighbour who holds it (price ⟨neighbour price⟩, coins go to them)
  and the bank (⟨bank price⟩). The cheapest legal option is pre-selected (ties: the left
  neighbour), so most picks stay two clicks. Payment arrives at the engine as the pick's `args`.
  Whether a neighbour's goods are counted before or after their own pick resolves is a rules
  question (⟨trade timing⟩); the UI shows what the engine offers.
- **Fast paths**: drag a card onto your town (Build) or onto the Spend tray under the hand
  (Spend); double-click = Build when legal, else Spend. Keyboard: `1`–`9` select, `B` / `S`
  lock, `Esc` deselects.
- Hover over a hand card previews its effect on your town header (e.g. Spend "+⟨a⟩2", Renown
  "~23 → ~26" for Build) when the engine can compute it cheaply. Nice-to-have, not U1.

### 8.2 Locked

- The chosen card flips face down and slides to your staging slot (≤ 200 ms); the hand dims but
  stays readable. Your status chip turns ✓. Other players see only your ✓.
- **Change pick** (Z) puts the card back and returns to choosing. It is available until the
  reveal starts. Online, the server accepts a changed pick until the last seat locks
  (⟨engine/net: re-pick allowed?⟩, §16 Q3).
- Header text: "Waiting for Cy and Dee". With timer on, it shows their remaining time.

### 8.3 Reveal (the payoff)

When the last seat locks:

```
   t=0      staged cards flip face up together, one beat per seat (60 ms stagger, starting
            with you, then clockwise), with a short card-flip sound
   t≈350ms  built cards fly into their owner's town column (yours: your town; neighbours: their
            panels; others: their summary row pulses); spent cards fly to the discard and turn
            into their goods / coins / labour over the owner's store
   t≈600ms  effects as badges over the receiving seat: "+2g", "+⟨a⟩2", "Great Work tier 3";
            trade payments animate as coins sliding from buyer to seller
   t≤1.2s   done; the log gets the "Pick 3" group
```

- One click or any key skips to the end state. Reduced motion or "Animations: off" (Catan
  `motion.ts`): no flying, a 150 ms fade + badges only.
- Rapid bot-only reveals (all bots, fast speed) collapse to badges only, like Catan's production
  animation for rolls < 900 ms apart.
- The animation reads the engine's reveal result (who did what, what was paid, what changed)
  from the view or the log, never by diffing guesses. Needs: ⟨reveal events⟩ from engine (§14).

### 8.4 Pass

- The hand you kept slides out toward the pass direction (◀ or ▶) and the incoming hand slides
  in from the other side (≤ 400 ms total). The pill's pick number ticks up.
- New hand arrival plays a soft sound and, if the tab is hidden, sets the tab title to "(Your
  pick) Windamere's Wonders" (colonist-style attention cue).
- Last card of a hand: ⟨last-card rule⟩ (e.g. auto-played, discarded or kept). The UI shows a
  1-line notice if it is not a normal pick.

### 8.5 Timer runs out

⟨auto-pick rule⟩ picks for you (net's plan: the engine's `defaultPick`, MULTIPLAYER.md
§2.1.1). Toast: "Time's up: we picked ⟨card⟩ for you". Online, a disconnected seat shows the
offline icon on its status chip; after the grace period a bot plays it until the player
reconnects (Catan away → bot → reclaim). A returning player sees the bot's pending pick and may
change it (MULTIPLAYER.md §2.3).

---

## 9. Hotseat with several humans

Simultaneous picks on one screen need a pass cover so nobody sees another hand. Port Catan's
`coverScreen` ("Pass to ⟨name⟩ · I'm ⟨name⟩, show my cards").

```
CHOOSING (human 1) ─lock─▶ COVER "Pass to Ana" ─click─▶ CHOOSING (Ana) ─lock─▶ …
     … last human locks ─▶ REVEAL on a public screen (no hand visible) ─▶ COVER "Pass to human 1"
```

- **One human + bots (the default)**: no cover, ever.
- The cover hides everything except the round pill and status chips. It shows "Hotseat: hide
  your cards", the player colour, and **[I'm Ana, show my hand]**.
- The reveal plays on a **public screen**: towns, neighbours and summary, no hand bar. Then the
  cover for the first human of the next pick.
- Pick order among humans: table order starting from the seat after whoever picked first last
  time, so nobody always waits longest.
- Timer: paused while a cover is up (Catan `isCovered`), each human gets the full pick time.
- Cost: with H humans, each pick has H covers. The setup screen says so (§5).

---

## 10. End of a Season and final scoring

### 10.1 Season end

After the reveal of the last pick of a Season, an overlay card (table still visible behind a
light scrim). With Raids (ORIGINALITY.md §3 row 6) it reads like this:

```
┌──────────────────────────────────────────────────────────┐
│          End of ⟨Season⟩ · ⟨Raid name⟩, strength ⟨n⟩      │
│  ● Ana    Guard 5  held          +⟨n⟩ Valour  +1g bounty  │
│  ● Cy     Guard 2  fell short 3  −3g                      │
│  ● You    Guard 4  held          +⟨n⟩ Valour  +1g bounty  │
│  ● Dee    Guard 4  held          +⟨n⟩ Valour              │
│  ⟨other Season-end events, e.g. yields skipped in Winter⟩ │
│                                                          │
│  Next: ⟨Season⟩ · hands pass ▶ right                     │
│                         [Continue (4)]                   │
└──────────────────────────────────────────────────────────┘
```

- Lines animate in one by one (≤ 1.5 s); bounty coins slide from the town that fell to its
  neighbours that held. Exact results, wording and numbers: ⟨Season-end events⟩. If a Season
  has none, the card is just the "Next" line and closes by itself after 1.5 s.
- **Continue** shows a countdown (4 s) and auto-continues; hovering or focusing the card pauses
  the countdown. Online the server moves on; the card closes on the next view.
- The pass direction change is the most-missed rule in drafting games, so the card states it
  and the round pill flashes the new arrow.

### 10.2 Final scoring

The tally is the second payoff after the reveal. It is **not a score pad** (research R4, O12):
Renown is grouped into a few bands that follow how our game is played, each band a card per
town that fills up, with the detail one click away.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          Renown after the Winter Raid                         │
│                                                                              │
│   ● You  35 🏆        ● Ana  31          ● Cy  27           ● Dee  17         │
│   ┌──────────────┐    ┌──────────────┐   ┌──────────────┐   ┌──────────────┐  │
│   │ Town      14 │    │ Town      12 │   │ Town       9 │   │ Town       6 │  │
│   │ Great Work 9 │    │ Great Work 7 │   │ Great Work 5 │   │ Great Work 3 │  │
│   │ Raids      4 │    │ Raids      6 │   │ Raids      2 │   │ Raids      5 │  │
│   │ Lore       6 │    │ Lore       3 │   │ Lore       8 │   │ Lore       1 │  │
│   │ Honours    ★ │    │ Honours  ★★  │   │ Honours      │   │ Honours      │  │
│   │ Purse      1 │    │ Purse      2 │   │ Purse      3 │   │ Purse      2 │  │
│   └──────────────┘    └──────────────┘   └──────────────┘   └──────────────┘  │
│                          You win! (Arjun)                                    │
│                   ⟨tie-break note: most Great Work tiers, then coins⟩         │
│                                                                              │
│      [Game stats]   [Rematch]   [New game]          online: [Back to lobby]  │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Bands, not columns.** One card per town, best first. Bands in this order: Town (built
  cards: Halls, Holdings, Landmarks), Great Work, Raids (Valour), Lore, Honours (the badges a
  town holds, shown as the badges themselves, not a number row), Purse (coins). Band names,
  grouping and order are ⟨scoring bands⟩ from design; "Treasury" and a per-category icon row in
  the 7 Wonders order are out (O12). Click a band: the cards and rules behind it.
- **Animation**: bands fill one at a time, all towns together (~500 ms each, ≤ 4 s total; click
  skips). The running totals reorder the cards only at the end, so the lead can change late.
- The engine hands over categories (`GameResult.scores[].categories`); the UI groups them into
  bands with a design-owned map (⟨category → band⟩), so new categories never need a new layout.
- Winner card highlighted in their player colour; Catan `winnerScreen` styling for the winner
  line.
- **Rematch** (hotseat): same seats, same settings, new seed. Online: host's **Back to lobby**
  (Catan session actions). **Leave room** for guests.
- **Game stats** opens the stats panel (§10.3).

### 10.3 Game stats

Port of Catan's stats panel (`src/ui/stats/`: stateless panel, tabs, collapse chevron, pure
derivations in `model.ts`). Tabs:

| Tab              | Content                                                                                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview         | standings with Renown band chips, duration, picks played                                                                                                                |
| Draft history    | grid: rows = picks, columns = seats, each cell the card picked + Build/Spend. Hover a cell: "this hand came from ⟨seat⟩". The "what did I pass you" review players love |
| Renown over time | Renown estimate per seat per pick (SVG line chart, Catan Activity tab)                                                                                                  |
| Economy          | coins and store over time, trade payments between neighbours                                                                                                            |
| Great Work       | when each town reached each tier                                                                                                                                        |

Needs: per-pick history in state or log (§14).

---

## 11. Overlays: menu, card detail, town sheet, toasts, dialogs, tutorial

### 11.1 Menu (☰)

Catan `.hud-menu` items: **New game** (hotseat) / **Leave room** (online), **Learn to play**
(asks first while a game runs), **Rules** (opens `docs/RULES.md` rendered, or the rules page),
**Bot speed** (Slow / Normal / Fast / Instant, Catan `SPEED_PRESETS`), **Animations** (on / off),
**Performance** (Auto / High / Low power, Catan `power.ts`), **Theme**, **Sound**. Plus
**Confirm picks** (off by default): when on, the action button needs a second click.

### 11.2 Card detail

Opens on hover (desktop, 300 ms delay), focus + `Space`, right-click, or a 450 ms long-press on
touch (Catan dev-card info pattern; the click that ends a long-press is swallowed). Shows the card
large: name, kind, cost, Spend band, full effect text, ⟨upgrades⟩ and, for a card in a hand,
the Build line (what you would pay, from whom) and the reasons. Closes on Esc, a click outside,
or when the card leaves.

### 11.3 Town sheet

Click a neighbour panel header, a summary row or a status chip → a side sheet (desktop) / full
sheet (phone) with that seat's full town at tableau size, Great Work, coins, store, Guard, Lore
run, Honours, and their picks history this game (public). Arrow keys or swipe move to the next seat in table
order. Esc closes.

### 11.4 Toasts

Catan `showToast` (`src/game/overlays.ts`): bottom-centre above the hand, `role=status`, kinds
`info` / `error`, 4 s, at most 3 stacked. Used for: auto-picks, rejected actions ("Action
rejected: …"), a neighbour buying goods from you ("Ana bought ⟨a⟩1 from you: +2g"), a player
leaving or coming back, the Season-end headline if the card was skipped.
Never for anything the player must act on.

### 11.5 Dialogs and banners

- **Confirm dialog** only for destructive actions: leave a running game, start a new game over a
  running one, kick a seat.
- **Connection banner** (Catan `ConnectionBanner`): "Connection lost. Reconnecting… [Retry
  now]", top-centre, never blocks the table. The pick you locked before a drop stays locked
  (server-side).
- **Fatal screens** (room closed, version mismatch, replaced by another tab): Catan wording.

### 11.6 Learn to play (tutorial)

Port Catan's coach (`src/ui/tutorial`): a coach panel over a **normal** game against 2 Easy
bots with a fixed seed; nothing is rigged in the engine. Pure lessons (`when` / `doneWhen` /
`focus`), saved progress, the focused HUD element pulses. Lesson list (texts after the rules
are approved):

1. Goal: ⟨how you win⟩, ~⟨n⟩ minutes.
2. Your hand: everyone picks at the same time; nobody sees your pick.
3. Pick a card: Build it or Spend it. Every card is worth something either way.
4. The reveal: all picks flip together.
5. Passing: your remaining hand goes to ◀ Ana; you get Cy's.
6. Your store: goods you hold and spend; ⟨yield rule⟩.
7. Your Great Work: labour raises it, no pick needed.
8. Neighbours: buying goods from them, ⟨neighbour effects⟩.
9. End of a Season: the Raid, and the pass direction flips.
10. Final scoring: the Renown bands. Then "You're ready".

Entry points: home screen, setup screen header, menu.

---

## 12. Phone and tablet layouts

Breakpoints follow Catan's `hud.css`: wide > 1279 px (sidebar 360 px), 721–1279 px (sidebar
300 px, collapsible), ≤ 720 px phone (sidebar becomes a drawer).

### 12.1 Phone portrait (reference 390×844)

```
┌──────────────────────────────────┐
│☰ ⟨Season⟩ · 3/⟨n⟩ · ◀ Ana ⏱0:38 ≡│  ≡ = drawer (table, log, chat)
│ ✓Ana  ⋯Cy  ✓Dee  ⋯You  Raid ⟨n⟩  │
├────────────────┬─────────────────┤
│◀ Ana   4g ~18 ✓│ Cy   9g ~20 ⋯  ▶│  tap → town sheet
│ ⟨a⟩2 ⟨c⟩1  ▰▰▱ │ ⟨b⟩3 ⟨d⟩1  ▰▱▱  │  their store (what you can buy)
├────────────────┴─────────────────┤
│ YOUR TOWN  7g  ~23       [Open ⤢]│
│ ⟨a⟩3 ⟨b⟩0 ⟨c⟩2 ⟨d⟩1 ⟨e⟩0  Guard 4 │  your store
│ ▲3  ●2  ■1  ◆4  ★0               │  counts; tap a kind → its cards
│ Great Work ▰▰▱▱ · labour 5/⟨n⟩    │
│            ┌──────┐              │
│            │▒▒▒▒▒▒│ staged        │
│            └──────┘              │
├──────────────────────────────────┤
│ HAND · 5                 ◀ swipe ▶│
│ ┌──────┐┌──────┐┌──────┐┌──────┐┌│
│ │⟨c⟩ ▲ ││⟨c⟩ ● ││⟨c⟩ ■ ││⟨c⟩ ◆ ││ │  ~96×134, horizontal scroll,
│ │⟨name⟩││⟨name⟩││⟨name⟩││⟨name⟩││ │  snap per card
│ │  ✓   ││  ✓   ││  ⇄   ││  ✗   ││ │
│ └──────┘└──────┘└──────┘└──────┘└│
├──────────────────────────────────┤
│ ⟨Card name⟩ ▲  ⟨effect, 1 line⟩   │  action sheet (slides up when
│ [Build  ⟨a⟩2+2g ] [Spend +⟨band⟩] │  a card is selected; ≥ 48 px)
│ pay ⟨c⟩1: ◉ Ana 2g ○ Cy ○ bank    │  trade row, only when short
└──────────────────────────────────┘
```

- Tap a card = select + action sheet; tap Build or Spend = lock. Long-press = card detail.
- No drag on phones (it fights scrolling). Double-tap = Build when legal, else Spend.
- Neighbours compress to one row each; the full town is a sheet (§11.3).
- Table summary, log and chat live in the drawer (Catan `.hud-side` drawer under 720 px). A dot
  on ≡ marks unread chat.
- The reveal on a phone: your staged card flips in place; neighbour rows flash their new card's
  icon; other seats only via status chips + log. Same ≤ 1.2 s budget.

### 12.2 Phone landscape and small tablets

Hand along the bottom (one row, no scroll while it fits), your town left, neighbours stacked on
the right, drawer for the rest.

### 12.3 Tablet / small laptop (721–1279 px)

Desktop layout with the sidebar at 300 px, collapsed by default under 1024 px; neighbour panels
switch to the compact list.

---

## 13. Accessibility

Target: WCAG 2.2 AA for everything in this spec. Owner of colours and contrast: ww-art
(tokens); owner of semantics and keyboard: ww-ui.

**Keyboard** (full game playable without a mouse):

| Key       | Action                                                                           |
| --------- | -------------------------------------------------------------------------------- |
| `1`–`9`   | select hand card N                                                               |
| `←` `→`   | move selection in the hand                                                       |
| `B` / `S` | lock the selected card: Build / Spend                                            |
| `Enter`   | lock with the default use (Build when legal, else Spend)                         |
| `Z`       | change pick (while locked)                                                       |
| `Space`   | card detail for the focused card                                                 |
| `Tab`     | regions in order: top bar → hand → your town → neighbours → summary → log → chat |
| `Esc`     | close the top overlay / deselect                                                 |
| `?`       | keyboard help                                                                    |

**Screen readers**

- Hand cards are buttons labelled "⟨name⟩, ⟨kind⟩, cost ⟨…⟩, Spend gives ⟨…⟩, ⟨effect⟩, ⟨Build
  badge⟩".
- Status chips: "Ana has picked" / "Cy is choosing".
- One `aria-live="polite"` region announces each reveal as one sentence: "Pick 3: Ana built
  ⟨name⟩, Cy spent ⟨name⟩ for 2 ⟨good⟩, you built ⟨name⟩ and paid Ana 2 coins." Plus "New
  hand, 4 cards" after the pass, and the Season-end lines.
- The log is `role=log` (Catan `sidebar.ts`), chat `role=log` (Catan `chat.ts`).

**Colour and shape**

- Card kind = icon shape + colour + name in text, never colour alone.
- Player = colour + avatar + name; status chips carry ✓/⋯ glyphs, not just a tint.
- Build badges = glyph (✓ ⇄ ✗) + text on hover/focus.
- Player colour set must pass a colour-blind check (ww-art; §14).

**Motion, timing, text**

- `prefers-reduced-motion` and the Animations menu item: no flying cards, fades only (Catan
  `motion.ts`, `html.is-low-power`).
- Timer warning is announced once at 10 s. Hotseat and bot games default to no timer.
- Layout holds at 200 % browser zoom (cards shrink to the compact size before anything
  overflows). Touch targets ≥ 44×44 px for actions (48 on the phone action sheet). Dense
  pickers (8 colour swatches in one phone row) may go to 32 px, above WCAG 2.5.8's 24 px.
- No information is hover-only: everything with a hover has a focus and a long-press path.

---

## 14. Slots for ww-design, needs from other lanes

### 14.1 Slots (ww-design fills; the UI renders whatever arrives)

| Slot                                                        | Used in                                       |
| ----------------------------------------------------------- | --------------------------------------------- |
| ⟨player range⟩                                              | setup, lobby, layout limits (§5, §7.7)        |
| Season names and count, ⟨picks per Season⟩, hand size       | round pill, Season end (§7.1, §10.1)          |
| ⟨pass direction rule⟩ per Season                            | round pill, ring, pass animation (§7.1, §8.4) |
| Card kinds: names, icon shapes, order                       | tableau columns, counts, badges (§7.2)        |
| ⟨goods⟩: names, icons, goods order (new set, TBD)           | stores, costs, Spend bands, trade row         |
| ⟨neighbour price⟩, ⟨bank price⟩, ⟨trade timing⟩             | trade row (§8.1), neighbour panels (§7.3)     |
| ⟨neighbour effects⟩ beyond trade (Caravans, bounties)       | neighbour panels (§7.3), log                  |
| ⟨upgrade rule⟩: what an upgrade covers                      | tableau, card detail, hand markers            |
| Great Work: tiers, labour thresholds, Perks, assignment     | Great Work strip, setup option                |
| ⟨yield rule⟩ (Holdings, Winter)                             | store animation, tutorial                     |
| ⟨auto-pick rule⟩ on time-out                                | setup, §8.5                                   |
| ⟨last-card rule⟩ for the final card of a hand               | §8.4                                          |
| ⟨Season-end events⟩ (the Raid: strength, Valour, bounty)    | Raid badge, Season end (§7.1, §10.1)          |
| ⟨scoring bands⟩: category → band map, band order, tie-break | final scoring (§10.2)                         |
| ⟨Honours⟩: names, badges                                    | summary rows, town sheet, final scoring       |
| Whether a running public Renown estimate is allowed         | `~23` everywhere (§16 Q2)                     |
| Rule variants for the setup screen                          | §5 mode / options                             |

### 14.2 Needs (to be written under `Needs:` in the ui status file)

- **engine (E1 done, E2)**: E1's `viewFor` covers own hand, `submitted[]`, own staged pick,
  public tableaux, round / turn / pass direction, `lastReveal`, the log and `GameResult`
  (U1 renders all of it). Still needed from E2: Build legal picks that carry the payment
  (`args`: goods from the store, goods bought and from whom) with a bounded set of options and
  the cheapest first; a why-not reason per illegal Build (`validatePick` text, short, for
  players); per-pick reveal effects (coins paid to whom, goods gained, tier reached) in
  `lastReveal` or the log's `data`; per-pick history for stats.
- **net (N1)**: §17 lists what `RoomClient` must give the UI.
- **art**: a check that the frame reads at tableau size ~72×100 and phone hand ~96×134; a
  one-line "strip" variant for stacked tableau columns; a face-down card back; Great Work tier
  states (empty / reached / next); goods icons for the new set; kind colours that avoid the
  7 Wonders role map (ORIGINALITY.md §1.5); 8 player colours that survive a colour-blind check;
  motion tokens (durations) for §1's budget.
- **design**: the slots above, starting with D2c (single pick, trade prices and timing, goods).

---

## 15. Reuse map (Catan → here)

Port order after P1 lands (the inbox's "game-agnostic shell"), then U1.

| Catan module                                                          | Use here                           | Change                                                                   |
| --------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------ |
| `ui/dom.ts` (`h`, `patchChildren`)                                    | all screens                        | none                                                                     |
| `game/overlays.ts` (`showToast`, `showResumePrompt`, `SPEED_PRESETS`) | §4.2, §11.4, menu                  | wording                                                                  |
| `ui/setup/screen.ts` + `model.ts`                                     | setup (§5)                         | drop map / expansions / Catan rules; add timer, order, Great Work option |
| `ui/botLevel.ts`                                                      | seat bot level                     | none                                                                     |
| `ui/online/home.ts`                                                   | home (§4)                          | buttons and copy                                                         |
| `ui/online/lobby.ts`, `lobbyModel.ts`, `configPanel.ts`               | lobby (§6)                         | seat card copy; config bridge to the new setup                           |
| `ui/online/chat.ts`, `banner.ts`, `messages.ts`                       | chat, reactions, connection banner | none / wording                                                           |
| `ui/hud.ts` (menu, cover, winner card, sidebar shell)                 | §7 shell, §9 cover, §11.1          | the hand / build bar / dice parts are not reused                         |
| `ui/sidebar.ts`, `ui/log.ts`                                          | log (§7.6)                         | new log grammar (per pick)                                               |
| `ui/stats/`                                                           | game stats (§10.3)                 | new tabs and derivations                                                 |
| `ui/tutorial/` (machine, coach, store)                                | learn to play (§11.6)              | new lessons                                                              |
| `ui/profile/`                                                         | avatars, nickname                  | none                                                                     |
| `ui/motion.ts`, `ui/power.ts`, `ui/sound.ts`                          | animations, performance, sound     | new cues                                                                 |
| `ui/costView.ts`                                                      | cost pieces in popover / detail    | resource set                                                             |
| `ui/theme/`                                                           | **ww-art's** (consumed, not owned) | —                                                                        |

Not reused: `render/` board (Pixi hex board), production fly animation (pattern only), trade
composer, spot prompts.

**Rendering choice (U1 does this; to settle with platform in `docs/ARCHITECTURE.md`):** cards,
towns and hands as DOM/CSS, not Pixi. They are text-heavy, need crisp type at many sizes, and
need real buttons for keyboard and screen readers. Pixi stays available for a background table
and reveal particles if art wants them. Untested; revisit if DOM reveal animation misses the
budget on low-end phones.

---

## 16. Open questions

- **Q1.** Hand size decides whether the opening hand fits one row at 1280 px (8 cards do at
  ~118 px wide with gaps, measured in U1's dev page; more needs the fan). Waiting on D2c.
- **Q2.** Public running Renown estimate: helpful for new players, but it can make the game feel
  solved. ORIGINALITY.md §3 row 18 says show it. Proposal: show it, labelled "~", with a setup
  toggle. Design's call.
- **Q3.** Change a locked pick: allowed until the last lock (the engine supports `unpick`; net's
  protocol has it) or never? A rules question for design. U1 offers it.
- **Q4.** Season-end auto-continue: 4 s is a guess. Measure in playtest.
- **Q5.** Hotseat with 3+ humans is slow (covers per pick). Do we cap hotseat humans, or accept
  it with the warning? Proposal: no cap, warn.
- **Q6.** Great Work at setup (choose 1 of 2, or random): the setup screen has a slot either way.
  Choosing needs a hidden simultaneous decision before the first pick (an engine prompt).
- **Q7.** Trade during a pick: if a neighbour's store changes in the same reveal (they Spend for
  the good you are buying), does your purchase see the old or the new store? ⟨trade timing⟩.
  The UI can only offer what the engine's legal picks offer.

---

## 17. Online client API (what `RoomClient` gives the UI)

For net (MULTIPLAYER.md; Catan's `src/net/client.ts` is the model). The UI renders online games
from this object alone; it never opens a socket or parses a message. Names are proposals; the
shape is what matters. Types not defined here are the engine's (`DraftView`, `DraftAction`,
`Pick`, `SeatId`, `Json`) or net's protocol (`RoomInfo`, `ChatEntry`, `Reaction`, `ErrorCode`).

### 17.1 State (getters, always current)

| Getter     | Type                                                   | UI use                                      |
| ---------- | ------------------------------------------------------ | ------------------------------------------- |
| `status`   | `'connecting' \| 'open' \| 'reconnecting' \| 'closed'` | connection banner (§11.5)                   |
| `attempts` | `number` (reconnect attempts so far)                   | banner "Reconnecting… (3)"                  |
| `fatal`    | `{ code: ErrorCode; message } \| null`                 | fatal screens; no auto-reconnect after it   |
| `you`      | `{ member: string; token: string } \| null`            | who am I                                    |
| `room`     | `RoomInfo \| null`                                     | lobby (§6), seat chips (away / bot / human) |
| `me`       | `MemberInfo \| null`                                   | name, seat                                  |
| `mySeat`   | `SeatId \| null` (null = watching)                     | viewer for the table                        |
| `isHost`   | `boolean`                                              | lobby settings, Start, Back to lobby        |
| `game`     | `GameSnapshot \| null` (below)                         | the draft table                             |
| `chat`     | `readonly ChatEntry[]`                                 | chat panel, unread dot                      |

```ts
interface GameSnapshot {
  seq: number; // engine seq
  view: DraftView; // viewFor(this member): own hand, own pending pick, submitted[]
  legal: DraftAction[]; // own legal actions ([] when watching)
  waiting: SeatId[]; // seats the game waits for (picks or a prompt)
  timer: { remainingMs: number; totalMs: number } | null; // as received
  receivedAt: number; // clock.now() at arrival: the UI counts down from here
}
```

`timerLeftMs(now?)`: remaining time computed from `receivedAt`, so the ring ticks without
messages (Catan). Everything the table draws comes from `game.view` through the same
`tableModel` as offline play (U1), so online and hotseat render identically.

### 17.2 Events (`on(cb) → unsubscribe`)

| Event                                          | When                                            | UI reaction                                        |
| ---------------------------------------------- | ----------------------------------------------- | -------------------------------------------------- |
| `{ type: 'status', status }`                   | connection state changes                        | banner on / off                                    |
| `{ type: 'room', room }`                       | lobby or seat change (join, leave, away, bot)   | lobby re-render; chip icons                        |
| `{ type: 'game', game, prev }`                 | every new view                                  | table re-render; `prev` lets the UI see what moved |
| `{ type: 'reveal', reveal }`                   | the view's `lastReveal` changed (once per pick) | the reveal animation (§8.3); derived client-side   |
| `{ type: 'chat', entry }`                      | chat line                                       | chat panel; unread dot on the phone drawer         |
| `{ type: 'reaction', member, seat, reaction }` | quick reaction                                  | float over the seat chip (§7.6)                    |
| `{ type: 'error', code, message, ref? }`       | server refused an intent                        | toast; restore the hand if it was a pick           |
| `{ type: 'fatal', code, message }`             | closed for good (kicked, replaced, expired)     | fatal screen                                       |

`reveal` can be derived by the client from `prev.view.lastReveal` vs `game.view.lastReveal`; no
new server message is needed (MULTIPLAYER.md §3 already marks a `reveal` message optional).

### 17.3 Actions (each returns `false` when it could not be sent)

| Method                           | Sends                  | Notes                                                            |
| -------------------------------- | ---------------------- | ---------------------------------------------------------------- |
| `start()` / `close()`            | connect / leave        | `close()` forgets nothing; `leave()` also drops the token        |
| `retryNow()`                     | reconnect at once      | banner's [Retry now]                                             |
| `pick(pick: Pick)`               | `pick`                 | optimistic: the UI shows "locked" at once, rolls back on `error` |
| `unpick()`                       | `unpick`               | Change pick (Z)                                                  |
| `answer(prompt, answer)`         | `answer`               | prompts                                                          |
| `setName(name)`                  | `setName`              | home / lobby                                                     |
| `takeSeat(seat)` / `leaveSeat()` | seat moves             | lobby                                                            |
| `configure(config: RoomConfig)`  | host settings          | lobby settings panel                                             |
| `kick(member)`                   | host                   | confirm dialog first                                             |
| `startGame()` / `rematch()`      | host                   | lobby Start, Back to lobby                                       |
| `chatSend(text)` / `react(r)`    | chat / reaction        | chat panel                                                       |
| `sync()`                         | ask for a fresh `game` | after a long tab sleep                                           |

### 17.4 Options and guarantees

- Options: `roomId`, `connect` (transport factory), `clock`, token `store` (key
  `windamere.mp.token.<room>`, null = none), `name`, `backoff`, `random` (jitter), `pingMs`,
  `deadMs`; the same as Catan's `RoomClientOptions` minus avatars.
- After a reconnect the first `game` event carries the member's own pending pick in the view,
  so the hand shows it as locked again (MULTIPLAYER.md §2.3). The UI never resends picks.
- The client never holds other seats' hands or picks: it only stores what the server sent.
- A test double (`LocalNet` + fake clock, as Catan) so ui tests can drive lobby and table
  without a server.

---

## 18. Test hooks (qa playtest harness)

Stable hooks for scripts that drive a browser game (qa Q2). Implemented in U4; changing one is a
breaking change for qa: say so in the status file.

**Start.** `/?debug=1[&seats=N][&seed=S]` skips the setup screen and starts a game with N human
seats (default 4, clamped to the player range), named `P1`…`PN`, no pick timer and **no pass
covers**: the table shows whichever seat the game waits for, so a script plays each seat in turn.
In debug mode only, `window.ww` is the app handle (`ww.play.game.state` = the full state, for
assertions; never read it to choose moves). Without `debug=1` nothing of this exists.

**Attributes** (the table's root is `.dt`):

| Element                     | Attributes                                                                        |
| --------------------------- | --------------------------------------------------------------------------------- |
| table root `.dt`            | `data-phase` = `pick` / `prompt` / `gameOver` / `cover`; `data-viewer` = seat     |
| status chip, summary row    | `data-seat`, `data-status` = `picked` / `thinking` / `idle`                       |
| neighbour panel             | `data-seat`                                                                       |
| hand card (button)          | `data-card` (card id), `data-def` (catalog id), `data-playable`                   |
| Build / Spend button        | `data-use` = `build` / `spend`, `data-card`; disabled when not legal              |
| choice row (in the popover) | `data-choice` = `cover` or `pay-<i>-<good>`                                       |
| choice option (button)      | `data-option` = `cover-<cardId>`, `full`, `buy-<seat>`, `exchange-<good>`, `bank` |
| prompt answer (Great Work)  | `data-answer` = the answer (a Great Work id)                                      |
| final scores                | `.dt-band-card` per town, best first                                              |

**Flow for one pick:** click the hand card → click `[data-option]` buttons to change sellers (each
option is re-checked by the engine; disabled ones carry the reason in `title`) → click
`[data-use="build"]` or `[data-use="spend"]`. Keyboard works too (`1`–`9`, `B`, `S`, `Z`, `Esc`).

---

## 19. The fx seam (reveal animation and sound)

The reveal (§8.3) and all game sound belong to the **fx** lane (`src/ui/fx`, `src/audio`). The
table and the game screen are ui's. They meet at one hook, `RevealHook` in `src/game/fx.ts`:

```ts
interface RevealHook<S, T> {
  onAction(moment: RevealMoment<S, T>): void; // once per resolved action, after the re-render
  skip?(): void; // the player clicked or pressed a key on the table
  dispose?(): void; // the table left the screen
}
interface RevealMoment<S, T> {
  key: string; // new per action (the last log entry's seq)
  view: DraftView<S, T>; // the viewer's view: E3 events via latestEvents(view)
  model: TableModel; // reveal lines, seats (bot / you), viewer
  anchors: TableAnchors; // DOM lookups, below
  reducedMotion: boolean; // prefers-reduced-motion or Animations: off → fades only
}
```

- **When:** after the table shows the new state, never for the first render, never while a hotseat
  pass cover is up. Bots' picks that do not resolve anything log nothing, so they call nothing.
- **Anchors** (`src/ui/table/anchors.ts`, live lookups, null when not on screen): `layer` (a
  fixed overlay, `pointer-events: none`, kept as the table's last child across renders), `hand()`,
  `card(id)` (a hand card), `stage()` (your face-down slot), `town(seat)` (your town, a neighbour
  panel, else the summary row), `stat(seat, id)` (`coins`, `score`, `guard`, `labour`,
  `good-<good>`), `monument(seat)` (Great Work picture), `built(seat, cardId)` (a tableau card).
  fx draws in its own layer over these; it never edits the table's DOM (the next render would
  undo it).
- **Wiring (Windamere):** `src/game/windamere/fx.ts` implements the hook with fx's
  `playRevealWithSound(latestEvents(view), anchors, { isLocal, isBot }, { label, instant,
cancelled })`; the game binding carries it. `main.ts` calls `sfx.installUnlock(document)` once.
  Input is never blocked (P1): a click or key cancels the rest of the reveal. The table draws no
  reveal of its own.
