# UX spec — Windamere's Wonders

Owner: ww-ui (card U0). Status: **draft v1, untested** (no screen exists yet; nothing here has been
playtested). Feel bar: colonist.io for Catan. Fast, clear, satisfying online play.

This spec covers every screen from the home screen to the final scores, on desktop and phone.
Card content (types, costs, actions, scoring categories, era count, hand size, player range) is
not decided yet: ww-design owns it (`docs/RULES.md`, `docs/design/CARDS.md`). Where the UI needs
that content, the spec leaves a **slot**, written `⟨like this⟩`. §13 lists every slot.

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
10. End of era and final scoring
11. Overlays: menu, card detail, city sheet, toasts, dialogs, tutorial
12. Phone and tablet layouts
13. Accessibility
14. Slots for ww-design, needs from other lanes
15. Reuse map (Catan → here)
16. Open questions

---

## 1. Principles and feel budget

**P1. Nobody waits on the UI.** Picks are simultaneous, so the only acceptable wait is another
player thinking. Animations never block input for the next pick, and every animation can be
skipped with a click or a key.

**P2. Always know what the game is waiting for.** The top bar always shows the era, the pick
number, the pass direction, the timer, and who has not picked yet. There is never a screen where
the player asks "is it stuck?".

**P3. Two clicks to pick.** First click selects a card, second click chooses its action. A
power-user shortcut does it in one (drag to a target, or a double-click for the default action).
Use **undo, not confirm**: a locked pick can be changed until the reveal starts, so no "Are you
sure?" dialog is needed.

**P4. The reveal is the payoff.** Every pick ends with all cards flipping at once. That moment
gets the best animation and sound in the game, kept short (§8.3).

**P5. Public information is never more than one click away.** You always see both neighbours and
a summary row per player. Any city opens in full with one click.

**P6. Hidden information never leaks.** Your hand is visible only to you (hotseat: behind a pass
cover, §9). "Has picked" status is public; _what_ was picked is not, until the reveal. The UI
renders a per-seat view and never reads another seat's hand (Catan rule: render the `GameView`).

**P7. Explain disabled things.** A card you can't afford, or an action you can't take, says
why on hover or tap ("Missing ⟨resource⟩ ×1"). This is Catan's `blockReasons` + `.why` bubble
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
| `▲ ● ■ ◆ ★` | placeholder card-type icons, one shape per type (type is never colour-only, §13) |
| `g`         | placeholder currency (name and icon: ⟨currency⟩)                                 |
| `~23`       | public score estimate (only if design allows it, §16 Q2)                         |
| `▰▰▱▱`      | monument progress: tiers built / total                                           |
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
│              │──────────────────────▲                             │ last pick of era
│              │  Learn to play  ─────┼──▶ tutorial game (§11.6)    ▼
└──────┬───────┘                      │                     ┌────────────────┐
       │ unfinished save              │                     │ Era summary    │──▶ next era
       ▼                              │                     │ (§10.1)        │
┌──────────────┐                      │                     └───────┬────────┘
│ Welcome back │ Resume / New game    │                             │ last era
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
│                         │  Draft cards. Grow a city.    │                   │
│                         │  Raise your monument.         │                   │
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
era 2, pick 3⟩" with **[New game]** and **[Resume]**. Tutorial saves read "Unfinished tutorial
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
│  ⟨toggle tiles from design, e.g. variants, monument choice: random / pick⟩         │
│                                                                                  │
│ ▸ More options:  seed [______]   monument assignment ⟨random | choose⟩             │
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
│☰│   ⟨Era⟩ 2 of ⟨3⟩ · Pick 3 of ⟨7⟩ · hands pass ◀ to Ana     ⏱ 0:38   ✓Ana ⋯Cy ✓Dee ⋯You │ ⇥ │ A
├─┴───────────────┬──────────────────────────────────────────────┬────────────────┬───────────┤
│ ◀ ANA (left)    │ YOUR CITY · Arjun                g 7   ~23   │ CY (right) ▶   │ TABLE  ‹  │
│ g 4   ~18   ✓   │ ▲3  ●2  ■1  ◆4  ★0          makes ⟨res icons⟩ │ g 9   ~20   ⋯  │ ↻ ◀◀◀◀    │ D
│ makes ⟨res⟩     │ ┌────┐┌────┐┌────┐  ┌────┐┌────┐  ┌────┐      │ makes ⟨res⟩    │ 1 Ana ✓ 4g│
│ ▲ ⟨name⟩        │ │▲   ││▲   ││▲   │  │●   ││●   │  │■   │ …    │ ▲ ⟨name⟩       │   ~18 ▰▰▱ │
│ ▲ ⟨name⟩        │ │⟨n⟩ ││⟨n⟩ ││⟨n⟩ │  │⟨n⟩ ││⟨n⟩ │  │⟨n⟩ │      │ ● ⟨name⟩       │ 2 Cy  ⋯ 9g│
│ ● ⟨name⟩        │ └────┘└────┘└────┘  └────┘└────┘  └────┘      │ ● ⟨name⟩       │   ~20 ▰▱▱ │
│ ■ ⟨name⟩        │  (cards grouped by type, in play order)       │ ◆ ⟨name⟩ …     │ 3 You ⋯ 7g│
│                 │                                              │                │   ~23 ▰▰▱ │
│ Monument ▰▰▱▱   │ MONUMENT ⟨name⟩  ▰▰▱▱  tier 2/4               │ Monument ▰▱▱   │ 4 Dee ✓ 2g│
│                 │ next tier: ⟨cost⟩ → ⟨effect⟩                   │                │   ~15 ▰▱▱ │
│                 │                ┌────────┐                    │                ├───────────┤
│                 │                │▒▒▒▒▒▒▒▒│ staged pick         │                │ LOG       │ E
│                 │                └────────┘                    │                │ Pick 2    │
├─────────────────┴──────────────────────────────────────────────┴────────────────┤ Ana ▲⟨n⟩  │
│ YOUR HAND · 5 cards                                    [↶ Change pick] (Z)       │ Cy  ●⟨n⟩  │ C
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐                      │ …         │
│  │⟨cost⟩ ▲ │ │⟨cost⟩ ● │ │⟨cost⟩ ■ │ │⟨cost⟩ ◆ │ │⟨cost⟩ ★ │                      ├───────────┤
│  │ ⟨name⟩  │ │ ⟨name⟩  │ │ ⟨name⟩  │ │ ⟨name⟩  │ │ ⟨name⟩  │                      │ CHAT      │ F
│  │⟨effect⟩ │ │⟨effect⟩ │ │⟨effect⟩ │ │⟨effect⟩ │ │⟨effect⟩ │                      │ (online)  │
│  │ ✓ can   │ │ ✓ can   │ │ ⇄ ⟨help⟩│ │ ✗ short │ │ ✓ can   │                      │           │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘                      │           │
└───────────────────────────────────────────────────────────────────────────────────┴───────────┘
  A top bar · B left neighbour · C your hand · D table summary · E log · F chat
  (centre: your city; right of it: right neighbour)
```

### 7.1 Top bar (A)

- **Menu** ☰ (§11.1).
- **Round pill** (centre; Catan `.hud-turn`): "⟨Era⟩ 2 of 3 · Pick 3 of 7 · hands pass ◀ to
  Ana". The pass arrow and the neighbour's name change with the era's pass direction
  (⟨pass direction rule⟩). The pill drops in only when its text changes (Catan lesson: don't
  replay the animation on every timer tick).
- **Timer** (only when a pick timer is on): ring + seconds. One shared round clock for all
  seats, owned by the server online (`docs/MULTIPLAYER.md` §2.1.1). Last 10 s: red + pulse
  (Catan `TIMER_WARN_SEC`). Once you lock, the ring dims and reads "✓ locked".
- **Pick status chips**: one per seat in table order, avatar ring + ✓ / ⋯. No card information.
  When you are the **last** seat still thinking, your chip and the hand header get a soft pulse
  after 5 s, "Everyone's waiting for you". No pulse in a game with no other humans (bots don't
  mind).
- **⇥** collapses the right sidebar (D–F).

### 7.2 Your city (centre)

- Header: name, ⟨currency⟩ count, public score estimate (if allowed), counts per type (`▲3 ●2
…`), and what the city produces ⟨resource icons⟩, so affordability is easy to read.
- Cards grouped by type in columns, within a type in play order (newest at the end, briefly
  highlighted after the reveal). Each tableau card shows type icon + name + a 1-line effect
  summary at small size; hover or focus opens the card detail (§11.2). With many cards a type
  column overlaps cards like a fanned stack (name strip visible), never scrolls.
- **Monument** strip: name, tier progress, next tier's cost and effect. Monument art: ww-art.
- **Staging slot**: where your locked pick sits face down until the reveal (§8). Empty while
  choosing.

### 7.3 Neighbours (B and right of centre)

Both neighbours are always shown, because ⟨neighbour interaction⟩ makes them the two most
relevant cities. Each panel: name + avatar + status chip, ⟨currency⟩, score estimate, what
they produce, their cards as a compact list grouped by type (icon + name), monument progress.
The side matches the table: left neighbour on the left. Click the panel header → full city
sheet (§11.3). What exactly a neighbour panel must surface depends on how neighbours interact
(⟨neighbour interaction⟩, e.g. their production if you can use it).

### 7.4 Your hand (C)

- Cards at full size in a row (fan only past 7 cards). Hand size this pick: "5 cards".
- Each card carries an **affordability badge** computed from the engine's legal actions, not
  re-derived in the UI:
  - `✓` can play now (⟨free / paid⟩ shown on the badge),
  - `⇄` can play with ⟨help⟩ (e.g. by paying someone, if the rules allow it),
  - `✗` can't play: "short ⟨resource⟩ ×1" on hover/tap (P7),
  - plus a marker when the card ⟨links to something you own⟩, if design has such links.
    A card you can't play is still pickable when the rules offer another action for it (e.g.
    ⟨action for unplayable cards⟩), so `✗` dims the "play" path only, never the card.
- Select: click / tap / number key `1`–`9`. Selected card lifts; the **action popover** opens
  above it (§8.1).
- **Change pick** (Z) appears after you lock, until the reveal starts.

### 7.5 Table summary (D)

One row per seat, table order, you highlighted, neighbours marked ◀/▶:
avatar + name, status ✓/⋯, ⟨currency⟩, score estimate, monument ▰▰▱, counts per type.
Above the rows, a **table ring** (↻ + arrows) shows seat order and this era's pass direction,
so a 5+ player table stays readable. Click a row → that city's sheet (§11.3).
Collapsible like Catan's sidebar sections.

### 7.6 Log (E) and chat (F)

- **Log** (Catan `LogList` + `log.ts` parsing): grouped per pick: "Pick 3 · Ana ▲⟨name⟩ · Cy
  ●⟨name⟩ (+2g) · You ◆⟨name⟩", icons inline, unknown text stays text. Era-end events get a
  group of their own. Your own lines read "You".
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
    └──── change pick ┘ │                                       last pick of era ──▶ ERA SUMMARY
                        └─ (only until REVEAL starts)
```

### 8.1 Choosing

```
                 ┌──────────────────────────────────────┐
                 │ ⟨Card name⟩                    ▲ ⟨type⟩│
                 │ ⟨effect text, full⟩                    │
                 │ Cost ⟨■ ■⟩  · you make ■ · short ■ ×1  │
                 ├──────────────────────────────────────┤
                 │ [ ⟨Play into city⟩    ⟨cost⟩ ]  (B)   │  primary
                 │ [ ⟨Build monument tier 3⟩    ]  (M)   │
                 │ [ ⟨Other action⟩      ⟨gain⟩ ]  (X)   │
                 │   ✗ ⟨action⟩: ⟨why not⟩               │  disabled + reason
                 └───────────────────┬──────────────────┘
                              ┌──────┴──┐
                              │ ⟨card⟩  │ (lifted)
```

- The popover lists **one button per legal action** for that card (from the engine's
  `legalActions` for the viewer), each with its cost or gain and a key. Illegal ones show
  disabled with the reason. Action names and the action set: ⟨card actions⟩.
- If an action needs a sub-choice (e.g. ⟨which payment / which resource⟩), the popover grows a
  second row with that choice. Default = the cheapest legal option, pre-selected, so most picks
  stay two clicks.
- **Fast paths**: drag a card onto your city / monument strip / ⟨other action target⟩; double-click
  = the primary action when it is legal. Keyboard: `1`–`9` select, the action key locks,
  `Esc` deselects.
- Hover over a hand card previews its effect on your city header (e.g. "+⟨res⟩", score
  estimate "~23 → ~26") when the engine can compute it cheaply. Nice-to-have, not U1.

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
   t≈350ms  each card flies into its owner's city column (yours: your city; neighbours: their
            panels; others: their summary row pulses)
   t≈600ms  effects as badges over the receiving seat: "+2g", "▰ tier 3", ⟨payments⟩ animate
            as coins/arrows between the seats involved
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
- The reveal plays on a **public screen**: cities, neighbours and summary, no hand bar. Then the
  cover for the first human of the next pick.
- Pick order among humans: table order starting from the seat after whoever picked first last
  time, so nobody always waits longest.
- Timer: paused while a cover is up (Catan `isCovered`), each human gets the full pick time.
- Cost: with H humans, each pick has H covers. The setup screen says so (§5).

---

## 10. End of era and final scoring

### 10.1 Era summary

After the reveal of the last pick of an era, an overlay card (board still visible behind a light
scrim):

```
┌──────────────────────────────────────────────────────────┐
│               End of ⟨era⟩ 2                             │
│  ⟨era-end events from design, one line per seat:⟩        │
│  ● Ana    ⟨event⟩ ⟨result⟩       +⟨n⟩                     │
│  ● Cy     ⟨event⟩ ⟨result⟩       −⟨n⟩                     │
│  ● You    ⟨event⟩ ⟨result⟩       +⟨n⟩                     │
│  ● Dee    ⟨event⟩ ⟨result⟩        0                       │
│                                                          │
│  Next: ⟨era⟩ 3 · hands pass ▶ right                       │
│                         [Continue (4)]                   │
└──────────────────────────────────────────────────────────┘
```

- Lines animate in one by one (≤ 1.5 s). If the rules have no era-end events, the card is just
  the "Next" line and closes by itself after 1.5 s.
- **Continue** shows a countdown (4 s) and auto-continues; hovering or focusing the card pauses
  the countdown. Online the server moves on; the card closes on the next view.
- The pass direction change is the most-missed rule in drafting games, so the card states it
  and the round pill flashes the new arrow.

### 10.2 Final scoring

The tally is the second payoff after the reveal: categories count up row by row, then the
winner.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              Final scores                                    │
│                  ● Ana    ● Cy     ● You    ● Dee                            │
│  ⟨category 1⟩      12       8       10        6     ← rows reveal top-down,  │
│  ⟨category 2⟩       4       9        7        3       numbers count up,       │
│  ⟨category 3⟩       6       2        8        5       column leader glows     │
│  ⟨monument⟩         7       5        9        3                               │
│  ⟨currency⟩         2       3        1        0                               │
│  ⟨…⟩                                                                          │
│  ─────────────────────────────────────────────                               │
│  Total             31      27       35       17                              │
│                                    🏆                                         │
│                          You win! (Arjun)                                    │
│                   ⟨tie-break note, if one was used⟩                           │
│                                                                              │
│      [Game stats]   [Rematch]   [New game]          online: [Back to lobby]  │
└──────────────────────────────────────────────────────────────────────────────┘
```

- Rows ⟨scoring categories⟩ from design, in the rulebook's scoring order. Each row ~400 ms;
  total ≤ 6 s; click skips to the full table.
- Columns in final rank order once the tally ends (they slide), winner column highlighted in
  their player colour; Catan `winnerScreen` styling for the winner line.
- **Rematch** (hotseat): same seats, same settings, new seed. Online: host's **Back to lobby**
  (Catan session actions). **Leave room** for guests.
- **Game stats** opens the stats panel (§10.3).

### 10.3 Game stats

Port of Catan's stats panel (`src/ui/stats/`: stateless panel, tabs, collapse chevron, pure
derivations in `model.ts`). Tabs:

| Tab             | Content                                                                                                                                                                     |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview        | standings with score breakdown chips, duration, picks played                                                                                                                |
| Draft history   | grid: rows = picks, columns = seats, each cell the card picked + action. Hover a cell: "this hand came from ⟨seat⟩". The "what did I pass you" review drafting players love |
| Score over time | score estimate per seat per pick (SVG line chart, Catan Activity tab)                                                                                                       |
| Economy         | ⟨currency⟩ over time, payments between seats (if any)                                                                                                                       |
| Monument        | which tier each seat built when                                                                                                                                             |

Needs: per-pick history in state or log (§14).

---

## 11. Overlays: menu, card detail, city sheet, toasts, dialogs, tutorial

### 11.1 Menu (☰)

Catan `.hud-menu` items: **New game** (hotseat) / **Leave room** (online), **Learn to play**
(asks first while a game runs), **Rules** (opens `docs/RULES.md` rendered, or the rules page),
**Bot speed** (Slow / Normal / Fast / Instant, Catan `SPEED_PRESETS`), **Animations** (on / off),
**Performance** (Auto / High / Low power, Catan `power.ts`), **Theme**, **Sound**. Plus
**Confirm picks** (off by default): when on, the action button needs a second click.

### 11.2 Card detail

Opens on hover (desktop, 300 ms delay), focus + `Space`, right-click, or a 450 ms long-press on
touch (Catan dev-card info pattern; the click that ends a long-press is swallowed). Shows the card
large: name, type, cost, full effect text, ⟨links / chains⟩ and, for a card in a hand, the
affordability line and the reasons. Closes on Esc, a click outside, or when the card leaves.

### 11.3 City sheet

Click a neighbour panel header, a summary row or a status chip → a side sheet (desktop) / full
sheet (phone) with that seat's full city at tableau size, monument, ⟨currency⟩, production, and
their picks history this game (public). Arrow keys or swipe move to the next seat in table
order. Esc closes.

### 11.4 Toasts

Catan `showToast` (`src/game/overlays.ts`): bottom-centre above the hand, `role=status`, kinds
`info` / `error`, 4 s, at most 3 stacked. Used for: auto-picks, rejected actions ("Action
rejected: …"), a player leaving or coming back, era-end headline if the summary was skipped.
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
3. Pick a card: the action popover and costs.
4. The reveal: all picks flip together.
5. Passing: your remaining hand goes to ◀ Ana; you get Cy's.
6. Your city and what it makes.
7. Your monument.
8. Neighbours: ⟨neighbour interaction⟩.
9. End of era: ⟨era-end events⟩ and the pass direction flips.
10. Final scoring: ⟨scoring categories⟩. Then "You're ready".

Entry points: home screen, setup screen header, menu.

---

## 12. Phone and tablet layouts

Breakpoints follow Catan's `hud.css`: wide > 1279 px (sidebar 360 px), 721–1279 px (sidebar
300 px, collapsible), ≤ 720 px phone (sidebar becomes a drawer).

### 12.1 Phone portrait (reference 390×844)

```
┌──────────────────────────────────┐
│☰ ⟨Era⟩2 · 3/7 · ◀ Ana  ⏱0:38   ≡│  ≡ = drawer (table, log, chat)
│ ✓Ana  ⋯Cy  ✓Dee  ⋯You            │
├────────────────┬─────────────────┤
│◀ Ana   4g ~18 ✓│ Cy   9g ~20 ⋯  ▶│  tap → city sheet
│ ▲3 ●1 ■2  ▰▰▱  │ ▲2 ●2 ■1  ▰▱▱   │
├────────────────┴─────────────────┤
│ YOUR CITY  7g  ~23       [Open ⤢]│
│ ▲3  ●2  ■1  ◆4  ★0               │  counts; tap a type → its cards
│ makes ⟨res icons⟩                 │
│ Monument ▰▰▱▱ · next ⟨cost⟩       │
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
│ [⟨Play⟩ ⟨cost⟩] [⟨Monument⟩] [⋯]  │  a card is selected; ≥ 48 px)
└──────────────────────────────────┘
```

- Tap a card = select + action sheet; tap an action = lock. Long-press = card detail.
- No drag on phones (it fights scrolling). Double-tap = primary action.
- Neighbours compress to one row each; the full city is a sheet (§11.3).
- Table summary, log and chat live in the drawer (Catan `.hud-side` drawer under 720 px). A dot
  on ≡ marks unread chat.
- The reveal on a phone: your staged card flips in place; neighbour rows flash their new card's
  icon; other seats only via status chips + log. Same ≤ 1.2 s budget.

### 12.2 Phone landscape and small tablets

Hand along the bottom (one row, no scroll up to 7 cards), your city left, neighbours stacked on
the right, drawer for the rest.

### 12.3 Tablet / small laptop (721–1279 px)

Desktop layout with the sidebar at 300 px, collapsed by default under 1024 px; neighbour panels
switch to the compact list.

---

## 13. Accessibility

Target: WCAG 2.2 AA for everything in this spec. Owner of colours and contrast: ww-art
(tokens); owner of semantics and keyboard: ww-ui.

**Keyboard** (full game playable without a mouse):

| Key               | Action                                                                           |
| ----------------- | -------------------------------------------------------------------------------- |
| `1`–`9`           | select hand card N                                                               |
| `←` `→`           | move selection in the hand                                                       |
| `B` / `M` / ⟨key⟩ | lock with action (letters follow the action names, ⟨card actions⟩)               |
| `Enter`           | lock with the primary action                                                     |
| `Z`               | change pick (while locked)                                                       |
| `Space`           | card detail for the focused card                                                 |
| `Tab`             | regions in order: top bar → hand → your city → neighbours → summary → log → chat |
| `Esc`             | close the top overlay / deselect                                                 |
| `?`               | keyboard help                                                                    |

**Screen readers**

- Hand cards are buttons labelled "⟨name⟩, ⟨type⟩, cost ⟨…⟩, ⟨effect⟩, ⟨affordability⟩".
- Status chips: "Ana has picked" / "Cy is choosing".
- One `aria-live="polite"` region announces each reveal as one sentence: "Pick 3: Ana played
  ⟨name⟩, Cy played ⟨name⟩ and gained 2 ⟨currency⟩, you played ⟨name⟩." Plus "New hand, 4
  cards" after the pass, and the era summary lines.
- The log is `role=log` (Catan `sidebar.ts`), chat `role=log` (Catan `chat.ts`).

**Colour and shape**

- Card type = icon shape + colour + name in text, never colour alone.
- Player = colour + avatar + name; status chips carry ✓/⋯ glyphs, not just a tint.
- Affordability badges = glyph (✓ ⇄ ✗) + text on hover/focus.
- Player colour set must pass a colour-blind check (ww-art; §14).

**Motion, timing, text**

- `prefers-reduced-motion` and the Animations menu item: no flying cards, fades only (Catan
  `motion.ts`, `html.is-low-power`).
- Timer warning is announced once at 10 s. Hotseat and bot games default to no timer.
- Layout holds at 200 % browser zoom (cards shrink to the compact size before anything
  overflows). Touch targets ≥ 44×44 px (48 on the phone action sheet).
- No information is hover-only: everything with a hover has a focus and a long-press path.

---

## 14. Slots for ww-design, needs from other lanes

### 14.1 Slots (ww-design fills; the UI renders whatever arrives)

| Slot                                                              | Used in                                       |
| ----------------------------------------------------------------- | --------------------------------------------- |
| ⟨player range⟩                                                    | setup, lobby, layout limits (§5, §7.7)        |
| ⟨era⟩ name and count, picks per era, hand size                    | round pill, era summary (§7.1, §10.1)         |
| ⟨pass direction rule⟩ per era                                     | round pill, ring, pass animation (§7.1, §8.4) |
| ⟨card types⟩: names, icon shapes, order                           | tableau columns, counts, badges (§7.2)        |
| ⟨card actions⟩: the actions a pick can take, their names and keys | action popover (§8.1)                         |
| ⟨currency⟩ and ⟨resources⟩: names, icons                          | headers, costs, badges                        |
| ⟨neighbour interaction⟩: what neighbours do to each other         | neighbour panels (§7.3), ⇄ badge              |
| ⟨links / chains⟩ between cards, if any                            | card detail, hand markers                     |
| ⟨monument⟩: tiers, costs, effects, assignment (random / choose)   | monument strip, setup option                  |
| ⟨auto-pick rule⟩ on time-out                                      | setup, §8.5                                   |
| ⟨last-card rule⟩ for the final card of a hand                     | §8.4                                          |
| ⟨era-end events⟩                                                  | era summary (§10.1)                           |
| ⟨scoring categories⟩ in order, tie-break                          | final scoring (§10.2)                         |
| Whether a running public score is allowed                         | `~23` everywhere (§16 Q2)                     |
| Rule variants for the setup screen                                | §5 mode / options                             |

### 14.2 Needs (to be written under `Needs:` in the ui status file)

- **engine (E1/E2)**: a per-seat view with: own hand; every seat's pick status (`choosing` /
  `locked`, never the card); own staged pick; public cities; era, pick index, pass direction;
  legal actions per hand card incl. cost breakdown, payment options and why-not reasons;
  a reveal result per pick (who did what, payments, gains) for §8.3; per-pick history (stats);
  final score breakdown by category; whether a locked pick may change before the reveal.
- **net (N1)**: N0's plan already covers most of this (`submitted[]`, `withdraw`, round clock,
  own pending pick on reconnect, MULTIPLAYER.md §2). Still needed: the reveal result in the
  `game` message after a round resolves, so §8.3 can animate it.
- **art (after A1)**: A1 gives a parametric card frame (200×280 viewBox, 5:7, the sizes below
  keep that ratio), type shapes, resource / coin / points icons and a monument frame. Still
  needed: a check that the frame reads at tableau size ~72×100 and phone hand ~96×134; a
  one-line "strip" variant for stacked tableau columns; a face-down card back; monument tier
  states (empty / built / next); 8 player colours that survive a colour-blind check; motion
  tokens (durations) for §1's budget.
- **platform (P1/P4)**: Catan theme tokens + fonts ported (P4); the DOM helper (`h`,
  `patchChildren`) in a shared place or ported by ui.
- **design**: the slots above.

---

## 15. Reuse map (Catan → here)

Port order after P1 lands (the inbox's "game-agnostic shell"), then U1.

| Catan module                                                          | Use here                           | Change                                                                 |
| --------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------- |
| `ui/dom.ts` (`h`, `patchChildren`)                                    | all screens                        | none                                                                   |
| `game/overlays.ts` (`showToast`, `showResumePrompt`, `SPEED_PRESETS`) | §4.2, §11.4, menu                  | wording                                                                |
| `ui/setup/screen.ts` + `model.ts`                                     | setup (§5)                         | drop map / expansions / Catan rules; add timer, order, monument option |
| `ui/botLevel.ts`                                                      | seat bot level                     | none                                                                   |
| `ui/online/home.ts`                                                   | home (§4)                          | buttons and copy                                                       |
| `ui/online/lobby.ts`, `lobbyModel.ts`, `configPanel.ts`               | lobby (§6)                         | seat card copy; config bridge to the new setup                         |
| `ui/online/chat.ts`, `banner.ts`, `messages.ts`                       | chat, reactions, connection banner | none / wording                                                         |
| `ui/hud.ts` (menu, cover, winner card, sidebar shell)                 | §7 shell, §9 cover, §11.1          | the hand / build bar / dice parts are not reused                       |
| `ui/sidebar.ts`, `ui/log.ts`                                          | log (§7.6)                         | new log grammar (per pick)                                             |
| `ui/stats/`                                                           | game stats (§10.3)                 | new tabs and derivations                                               |
| `ui/tutorial/` (machine, coach, store)                                | learn to play (§11.6)              | new lessons                                                            |
| `ui/profile/`                                                         | avatars, nickname                  | none                                                                   |
| `ui/motion.ts`, `ui/power.ts`, `ui/sound.ts`                          | animations, performance, sound     | new cues                                                               |
| `ui/costView.ts`                                                      | cost pieces in popover / detail    | resource set                                                           |
| `ui/theme/`                                                           | **ww-art's** (consumed, not owned) | —                                                                      |

Not reused: `render/` board (Pixi hex board), production fly animation (pattern only), trade
composer, spot prompts.

**Rendering choice (proposal for U1, to settle with platform in `docs/ARCHITECTURE.md`):** cards,
cities and hands as DOM/CSS, not Pixi. They are text-heavy, need crisp type at many sizes, and
need real buttons for keyboard and screen readers. Pixi stays available for a background table
and reveal particles if art wants them. Untested; revisit if DOM reveal animation misses the
budget on low-end phones.

---

## 16. Open questions

- **Q1.** Player range and hand size decide whether 7 hand cards fit one row at 1280 px (they
  do at ~120 px wide with gaps; 9+ needs the fan). Waiting on ww-design.
- **Q2.** Public running score: helpful for new players, but it can make the game feel solved.
  Proposal: show it, labelled "~" (estimate), with a setup toggle. Design's call.
- **Q3.** Change a locked pick: allowed until the last lock (proposal; net's N0 plan assumes the
  same with `withdraw`) or never? A rules question for design.
- **Q4.** Era-end auto-continue: 4 s is a guess. Measure in playtest.
- **Q5.** Hotseat with 3+ humans is slow (covers per pick). Do we cap hotseat humans, or accept
  it with the warning? Proposal: no cap, warn.
- **Q6.** Monument choice at setup (pick one of two, or random): a design question; the setup
  screen has a slot for it either way.
- **Q7.** Terminology ("era", "monument", "tier", "pick") is a working vocabulary for this spec.
  Final names follow `docs/RULES.md` and `docs/design/ORIGINALITY.md`.
