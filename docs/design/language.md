> **Superseded in part (2026-11-11):** the owner asked for a more readable look. Waypoint now uses Inter only, light by default, bold headlines, sentence-case labels, 12px corners and small photo thumbnails. The notes below describe the earlier editorial system.

# Waypoint design language

Waypoint wears the language of the owner's own site, [argcoresolutions.com](https://argcoresolutions.com),
with the craft of apple.com: sharp type, hairlines, restraint, and motion that earns its place.
Tokens live in `src/styles.css`; `src/test/design-system.test.ts` enforces the rules below.
(`hig.md` is the history of the earlier Apple-style system this one replaced.)

## Principles

1. **The trip is the product.** Every screen answers what it costs and what to do next.
2. **Say it once.** A fact, label or note appears in one place.
3. **Honest copy.** Only what the app really does: no invented metrics, quotes, customers or testimonials. Estimates are labeled, unpublished prices say "not listed".
4. **Works signed out, on any screen,** from a 320px phone to a wide desktop, in dark and light.
5. **Editorial restraint.** One accent, one signature moment per screen, hairlines instead of boxes.

## Color

| Role                      | Dark (default)           | Light                 |
| ------------------------- | ------------------------ | --------------------- |
| Ground                    | `#08100d`                | `#f5f1e8` cream paper |
| Card                      | `#0c1411`                | `#fbf8f1`             |
| Raised                    | `#101816`                | `#ece6d8`             |
| Ink                       | `#f5f1e8`                | `#0c1411`             |
| Muted text                | `#958f82` (AA on raised) | `#5f5a4f`             |
| Hairline                  | cream at 8 to 12%        | ink at 10 to 14%      |
| Button fill               | emerald `#1f7a5a`        | emerald `#1f7a5a`     |
| Accent text, links, focus | `#2fa074`                | `#155440`             |

Emerald is the only accent. No gradients, no glows. Data colors (`--trip-*`, `--cat-*`) stay for charts and chips.

## Type

- **Fraunces** (display): light 300, optical size on. `<em>` inside a title is the one italic emerald word. Amounts use it too (`money-display`).
- **Inter** (text and controls), 400 and 500.
- **JetBrains Mono** (labels): small uppercase, tracked. `label-mono` has none.
- Scale: display 52 to 128px, page title 40 to 76, title 30 and 24, headline 19, body 17, footnote 14, caption 12 (the smallest).
- Fonts are self-hosted, the four above-the-fold files are preloaded, and metric-matched fallbacks stop the swap shifting layout.

## Shape and space

- Buttons are **pills**: one emerald primary per screen, outlined hairline pills for the rest.
- Fields are 8px; surfaces and photos are 4px. Radii come from the token scale.
- 8px spacing grid. Content is up to 1328px with 24, 32 and 48px side padding.

## Frame

- From 1024px: a sticky translucent top nav (logo with the mono tagline, sections, Spending, theme, account, "Plan a trip"), a scroll-progress line and underlines that draw in. Below: a slim top bar and a bottom tab bar.
- Pages open with the title with its last word italic emerald, the trip bar and the page's actions.
- The footer is the brand as a huge light wordmark over a mono legal row.

## Motion

- One authored moment per screen. The hero's words rise in once; everything that holds content back is under a second.
- Entrance animations play only in the first seconds of a visit, then never replay when you open a tab.
- Nothing moves because the page scrolled (the taste skill bans scroll-linked reveals); only the nav progress line follows scroll. Bars grow, the main number counts up once, the FAQ opens with a height animation, the marquee drifts slowly and has a Pause button.
- Exponential ease-out or the spring tokens. No bounce, no cursor effects, no scroll hijacking. Everything is off for reduced motion.

## Voice

Plain, specific, short. Headlines name the thing. Buttons are a verb and an object. No em dashes in the UI, no buzzwords, no fake urgency.

## Detector

`npx impeccable detect http://localhost:PORT/<page>` is clean except one rule the owner's brand pins on purpose, ignored in `.impeccable/config.json`: `italic-serif-display` (the italic emerald word).
