# ART: visual identity

Owner: art lane. Status: A1 first pass. **Not yet viewed in a browser** (no dev server existed
when written); SVGs pass `xmllint` only.

## Look
Ported from catan's **Sunfired** theme (`/home/blop/projects/catan/src/ui/theme/sunfired.css`):
terracotta panels, cobalt glaze, cream card paper, saffron highlights. Tokens live in
`src/ui/theme/tokens.css` (trimmed; catan's other five themes are not ported).

## Palette
| Token | Hex | Use |
|---|---|---|
| `--page-bg` | `#145a7d` → `#072638` | table background |
| `--surface` | `#96452a` → `#853b22` | terracotta panels |
| `--card-paper` / `-2` | `#fbf3e2` / `#ecdcc0` | card face |
| `--card-edge` | `#3a1a0c` | outlines, body text |
| `--accent` | `#f5b82e` | saffron highlight, coin |
| `--cobalt` | `#1f4fa0` | points, titles |

## Typography
Display: **Marcellus** (titles, card names, tracking 0.05em). UI/body/numbers: **Nunito Variable**.
Fonts come from `@fontsource` packages (`@fontsource/marcellus`, `@fontsource-variable/nunito`);
**Needs platform** to add them and import in `src/main.ts` or theme index.

## Card anatomy (200×280 viewBox, `public/art/card-frame.svg`)
| Zone (svg id) | Position | Content |
|---|---|---|
| `cost` | top-left column | resource/coin icons, one per unit |
| `name` | top bar, type colour | card name, Marcellus |
| `art` | middle right | art window (136×100) |
| `effect` | below art | effect text + effect icons |
| `band` | bottom bar, type colour | type shape icon + type label |

Frame is parametric: set `--type-color` / `--type-ink` on the host and inline the SVG (as in
`art-dev.html`). Via `<img>` the CSS vars do not apply and fallbacks show.

## Card-type colour coding (provisional, ww-design owns the final list)
Colours follow the Okabe-Ito colour-blind-safe set. **Colour is never the only cue:** every type
has a unique band silhouette and glyph, and the band always prints the type name.

| Type | Colour | Shape | Glyph |
|---|---|---|---|
| raw | `#8a5a2b` | hexagon | sapling |
| craft | `#6b6f78` | square | hammer |
| civic | `#0072b2` | circle | columns |
| trade | `#e69f00` | diamond | exchange arrows |
| military | `#d55e00` | triangle | post/banner |
| science | `#009e73` | pentagon | sparkle dial |
| guild | `#cc79a7` | star | cross mark |

Caveat: raw (brown) vs craft (grey) vs trade (orange) are close for some deficiencies; shape
and label carry the distinction. Not tested with a simulator yet.

**Adding a type:** add `--type-<id>` and `--type-<id>-ink` to `tokens.css`, copy a
`public/art/types/*.svg` and change shape path + glyph. No frame change needed.

## Icons (`public/art/icons/`, 32×32)
Resources: timber, stone, clay, grain, glass, cloth. Currency: coin. Score: points. Each is a
coloured disc (or star) with a white glyph and dark outline, so they read on any card. The
resource set is a placeholder until design fixes the resource list.

## Monument (`public/art/monument-frame.svg`, 480×220)
Stepped plinth with three stage sockets (`stage-1..3`) and a saffron capstone. Stage count is
not final; duplicate or remove sockets to match RULES.md.

## Preview
`art-dev.html` renders every asset plus a sample card per type. Run under vite (platform) at
`/art-dev.html`. Untested until a dev server exists.

## Originality
No 7 Wonders iconography: no laurel-wreath coin, no tablet/cog/compass science trio, no
wonder-board layout. Glyphs here are generic and drawn from scratch.

## Open
- Final type and resource lists (design).
- Card art illustrations: none yet, art window is a flat placeholder.
- Fonts packages (platform).
