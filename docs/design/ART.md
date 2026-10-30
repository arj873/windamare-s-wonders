# ART: visual identity

Owner: art lane. Status: A3 (retheme to CARDS.md). Viewed once in headless Chrome via `art-dev.html` (A3);
layout renders. No colour-blind simulator run.

## Look

Ported from catan's **Sunfired** theme (`/home/blop/projects/catan/src/ui/theme/sunfired.css`):
terracotta panels, cobalt glaze, cream card paper, saffron highlights. Tokens live in
`src/ui/theme/tokens.css` (trimmed; catan's other five themes are not ported).

## Palette

| Token                 | Hex                   | Use                     |
| --------------------- | --------------------- | ----------------------- |
| `--page-bg`           | `#145a7d` → `#072638` | table background        |
| `--surface`           | `#96452a` → `#853b22` | terracotta panels       |
| `--card-paper` / `-2` | `#fbf3e2` / `#ecdcc0` | card face               |
| `--card-edge`         | `#3a1a0c`             | outlines, body text     |
| `--accent`            | `#f5b82e`             | saffron highlight, coin |
| `--cobalt`            | `#1f4fa0`             | points, titles          |

## Typography

Display: **Marcellus** (titles, card names, tracking 0.05em). UI/body/numbers: **Nunito Variable**.
Fonts come from `@fontsource` packages (`@fontsource/marcellus`, `@fontsource-variable/nunito`);
**Needs platform** to add them and import in `src/main.ts` or theme index.

## Card anatomy (200×280 viewBox, `public/art/card-frame.svg`)

| Zone (svg id) | Position                | Content                                    |
| ------------- | ----------------------- | ------------------------------------------ |
| `cost`        | top-left column         | goods/coin icons, one per unit             |
| `name`        | top bar, kind colour    | card name, Marcellus                       |
| `art`         | middle right            | art window (136×100)                       |
| `effect`      | below art               | effect text                                |
| `spend`       | dashed strip            | Spend band gains (R5): goods, coin, labour |
| `band`        | bottom bar, kind colour | kind shape icon + kind label               |

Frame is parametric: set `--kind-color` on the host and inline the SVG (as `art-dev.html`
does). Via `<img>` the CSS vars do not apply and fallbacks show. Season is not drawn on the
frame yet (open).

## Card kinds (CARDS.md, RULES.md R7)

Okabe-Ito colour-blind-safe hues, **assigned deliberately not to match the 7 Wonders
colour-to-role map** (ORIGINALITY §1.5, §6): no red military, green science, blue civic,
yellow commerce, purple late-scoring, brown/grey resources. **Colour is never the only cue:**
every kind has its own band silhouette and glyph, and the band prints the kind name.

| Kind     | Colour    | Shape       | Glyph          |
| -------- | --------- | ----------- | -------------- |
| Holding  | `#009e73` | house       | house in roof  |
| Hall     | `#e69f00` | arch        | columns        |
| Market   | `#cc79a7` | hexagon     | market basket  |
| Watch    | `#56b4e9` | banner      | tower          |
| Lore     | `#d55e00` | diamond     | cross-and-ring |
| Landmark | `#2b2d6e` | eight-burst | peak           |

Originality check against §1.5: Holding is green (7W: brown/grey), Hall amber (7W civic is
blue), Market rose (7W commerce is yellow), Watch sky blue (7W war is red), Lore vermillion
(7W science is green), Landmark indigo (7W guilds are purple). Sky-blue Watch vs 7W blue civic
is the nearest overlap; judged acceptable because Watch is also a banner shape. Needs human
eye. Colour-blind safety is by palette and shape only, no simulator run.

**Adding a kind:** add `--kind-<id>` and `--kind-<id>-ink` to `tokens.css`; copy a
`public/art/kinds/*.svg` and change the shape path and glyph. No frame change needed.

## Goods and counters (`public/art/goods/`, 32×32)

Goods per RULES.md "Goods (final names)", in goods order: **reed** (straw-green bundle of stalks),
**peat** (dark turf block), **salt** (white crystal cubes on pale blue), **wax** (yellow cake with
a wick), **horn** (ivory curved horn). Same pale rounded tile as before; each is distinguished by
silhouette, not only tile colour (salt vs horn vs wax are all pale). Drawn from scratch, none
reuses a Colonizers or 7 Wonders glyph. Then coin, **labour** (hammer-and-wedge disc), **Guard**
(tower), **Valour** (star), **Renown** (indigo hexagon). Not yet checked by a human or a
colour-blind simulator; at 22px (cost column) salt/horn are the likeliest to blur.

## Lore ranks, Raid, Great Work, Honours (`public/art/badges/`, `honours/`)

- `badges/lore-1..6.svg`: Lore diamond with the numeral and that many pips.
- `badges/raid-frame.svg` (200×280): dark card with a jagged top edge so a Raid is never mistaken
  for a normal card; slots `name`, `art`, `strength` (vermillion disc), `flavour`.
- `badges/great-work-track.svg` (500×170): four tier slots I to IV with a progress bar
  (`#progress` width 0 to 460 for labour). Thresholds are data; labels are drawn by the UI.
- `honours/*.svg`: eight rosette badges, one glyph each: warden, steward, patron, merchant, sage,
  master-builder, treasurer, broad-town.

## Great Work frame (`public/art/monument-frame.svg`, 160×300)

A slim tower of four stacked bands, ids `tier-1..4` (base first), numerals I to IV. Replaces the
old three-socket plinth (7 Wonders wonder-board look, "stage" ids; research O3). Pairs with
`badges/great-work-track.svg`, the horizontal progress bar.

## Table chrome (A2)

Fixed art in `public/art/table/`: `table-bg.svg` (cobalt table with faint diamond tile),
`seat-panel.svg` (terracotta, sockets avatar/name/tableau/plaque), `neighbour-strip.svg` (arrow
shows pass direction; mirror for the other side), `round-badge.svg` (timer ring: animate
`#ring-fill` `stroke-dashoffset`, circumference 251.3), `title-key-art.svg` (monument on a hill,
card fan). Live-layout equivalents are CSS in `src/ui/theme/chrome.css`
(`.table .seat .seat-me .neighbour .round-badge .timer-low`; `--timer` 0..1 drives the ring).
Seat identity: colour (`--seat`) plus a marker shape and the seat name, never colour alone.
Built from catan's patterns before UX.md/RULES.md landed; not yet reconciled with UX.md.

## Preview

`art-dev.html` renders every asset plus a sample card per type. Run under vite (platform) at
`/art-dev.html`. Rendered once under vite in headless Chrome (A3).

## Originality

No 7 Wonders iconography: no laurel-wreath coin, no tablet/cog/compass trio, no wonder-board
layout, no colour-to-role map (see kinds table). Glyphs are generic and drawn from scratch,
except goods glyphs, which are ours from Colonizers of Windamere.

## Open

- Reconcile table chrome with `docs/design/UX.md`.
- Season marker on the card frame; Spend band layout for 3+ gains.
- Card art illustrations: none yet, the art window is a flat placeholder.
