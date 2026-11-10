# Waypoint design language

One page on how Waypoint looks, moves and sounds. The tokens live in `src/styles.css`; the
enforced rules and the audit history are in `hig.md` and `src/test/design-system.test.ts`.

## Principles

1. **The trip is the product.** Every screen answers "what will this cost and what do I do next?" Real photos, real prices, real places beat decoration.
2. **Say it once.** A fact, a label or a note appears in one place. If the page already says it, cut it.
3. **Honest numbers.** Estimates are labeled "Estimated", live prices "Live price", unpublished prices "not listed". Nothing is called free unless the source says so. No fake urgency, reviews or social proof.
4. **Works signed out, on any screen.** Every page works without an account, from a 320px phone to a wide desktop.
5. **Quiet, then precise.** One accent, one type system, flat surfaces. Detail goes into spacing and wording, not effects.

## Brand

| Part       | Value                                                                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Mark       | A route drawn as a "W": hollow origin ring to a coral destination dot, on a blue tile (`Logo.tsx`; source of truth `public/favicon.svg`) |
| Brand blue | `#2457E6` (`--primary`), fixed across themes                                                                                             |
| Coral      | `#FF6B4A` (`--brand-coral`), only for "next / destination" cues and the logo                                                             |
| Name       | Waypoint. Owner and contact are in `src/lib/legal.ts`                                                                                    |

## Color

- **Light:** paper tinted from the brand blue, `oklch(0.968 0.008 255)`, with white cards and blue-black ink. Never cream, never pure white pages.
- **Dark:** deep navy `oklch(0.165 0.024 258)` with lifted navy cards, never pure black.
- **One accent.** Blue marks only what you can press or what is selected. Green (`go`) is for actions that move the trip forward. Warnings use `destructive`. Decorative icons and data stay gray.
- **Trip types keep a hue** (`--trip-road`, `-flight`, `-cruise`, `-rail`, `-home`), used as a light tint (5 to 16%), never white text on color.
- No gradients, glows or colored shadows. Violet is not used.

## Type

| Role                  | Face                                                  | Use                              |
| --------------------- | ----------------------------------------------------- | -------------------------------- |
| Headlines and amounts | Host Grotesk Variable, semibold 600, tracking -0.03em | `title-display`, `money-display` |
| Text and controls     | Instrument Sans Variable                              | everything else                  |
| Codes people copy     | system mono                                           | only that                        |

Both are self-hosted (OFL). No Inter, no Google Fonts request, no serif.

The scale has nine levels, each with its own size, line height, tracking and weight:
`text-display` (48 to 80px), `text-large-title` (32 to 48), `text-title-1` (26), `text-title-2` (22), `text-headline` (21), `text-body` (17), `text-footnote` (14), `text-caption` and `text-micro` (12). No one-off sizes. The smallest text is 12px. Page titles use `text-large-title`; only the Plan hero uses `text-display`.

## Space and layout

- **8px grid.** Multiples of 8 for padding, gaps and margins; 4px only inside a control.
- **Pages** sit in `page-container` (up to 1216px, 16/24/40px side padding) and split on the 12-column grid: `layout-main-aside` (8 + 4) or `layout-5-7`.
- **One app frame per screen size:** phones get a 48px top bar and a bottom tab bar (Plan, Overview, Budget, Days, More); tablets a left icon rail; laptops a 256px sidebar with the current trip.
- **Plan hero:** the question, promise and assistant bar on the left, three real destination photos on the right from 1280px; one centered column below that.
- Whitespace separates groups before a border does. Panels inside cards use a divider, never a box in a box.

## Shape

| Radius | Use                                        |
| ------ | ------------------------------------------ |
| 3px    | bars, swatches                             |
| 6px    | items inside a surface (tags, menu items)  |
| 12px   | controls: buttons, fields, chips, menus    |
| 18px   | surfaces: cards, photos, dialogs, sheets   |
| round  | only icon buttons, avatars, dots, switches |

Nothing is pill-shaped. Buttons are 44px tall (`sm` 32, `lg` 48), filled, and show `loading` on every slow action. Fields share one shape: 44px, 12px corners, filled, blue focus ring.

## Imagery

- Real photos only, through `Photo` (placeholder, fade-in, fallback). Better no photo than the wrong one: maps, flags and logos are never used as a place's picture.
- Text on photos uses `on-image`; labels on photos sit on a solid card chip, not a gradient.
- Decoration is line art in the brand's motif (`Illustrations.tsx`), no cartoon art, no sparkle or magic-wand icons.

## Motion

Springs (`src/lib/spring.ts`, `SPRINGS`) drive anything that moves; CSS uses the same curves. Content is simply there: no fade-ins on load or scroll, no parallax, no count-ups. Numbers spring only when the traveler changes them. UI transitions stay at 300ms or less. Presses answer on touch-down (`pressable`). Reduced motion keeps quick crossfades and stops movement.

## Voice

Plain, specific, short. Headlines name the thing; buttons are a verb and an object ("Plan trip", "Find real stops"). No em dashes anywhere in the UI, no machine-sounding filler, no "demo" in the UI. AI output is always labeled as unverified estimates.

## Checks

Run before shipping UI changes: `bun run check`, `npx impeccable detect http://127.0.0.1:PORT/<page>` (0 anti-patterns), and the axe-core audit in light, dark, mobile and with menus and dialogs open.
