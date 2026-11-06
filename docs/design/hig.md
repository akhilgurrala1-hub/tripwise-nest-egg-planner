# Waypoint design system (after Apple's Human Interface Guidelines)

The tokens live in `src/styles.css`, the physics in `src/lib/spring.ts`, the motion
primitives in `src/components/app/motion.tsx`. `src/test/design-system.test.ts`
enforces the rules below, so a violation fails CI.

## Feel audit: what made the app feel generated (and what replaced it)

| #   | Flaw                                                                                                                                                    | Fix                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 28 one-off font sizes (`text-[26px]`, `text-[13px]`, `text-[10.5px]`...), no hierarchy you could name                                                   | A 9-level type scale with size, line height, tracking and weight per level (`text-display` … `text-micro`); Tailwind's own names map onto it                                                                  |
| 2   | Three voices fighting: a serif for titles, a mono "boarding pass" label on every section, a sans for the rest; italic blue "accent phrase" in headlines | One family: San Francisco on Apple devices, Inter elsewhere. Weight and size carry the hierarchy; accent words are colored, not italic. Mono only for codes people copy                                       |
| 3   | Off-grid spacing everywhere (20px card padding, 6px and 10px gaps, 2px nudges)                                                                          | Strict 8px grid (4px only inside controls); cards pad 24px; page margins 16/24/32                                                                                                                             |
| 4   | Ad-hoc layout columns (`minmax(0,1fr)_340px`, `_320px`, `1fr_1.4fr`)                                                                                    | A 12-column grid: `layout-main-aside` (8 + 4) and `layout-5-7`                                                                                                                                                |
| 5   | Every transition on a cubic-bezier with a hand-picked duration (150/200/300/500/700ms); interrupting one restarted it from zero velocity                | Springs: exact damped-oscillator solutions, retargetable mid-flight with velocity handoff; CSS uses the same springs as `linear()` easings                                                                    |
| 6   | Nothing could be grabbed: the segmented control only clicked; rails only scrolled                                                                       | The selection highlight drags 1:1, rubber-bands past the ends, and a flick projects to the option it was heading for (Apple's momentum projection); rails drag and glide with momentum and bounce at the ends |
| 7   | Press feedback eased in over 150ms, so a quick tap never showed it                                                                                      | `pressable`: the scale applies the instant the pointer goes down and springs back on release                                                                                                                  |
| 8   | Cards floated up on hover and arrows nudged sideways: hover theater that does nothing on touch                                                          | Removed; cards respond to the press instead                                                                                                                                                                   |
| 9   | Every tab switch replayed a staggered cascade of every card                                                                                             | One short crossfade-and-settle for the page; below-the-fold sections stage in as they scroll into view (scroll-driven, so they can't stutter)                                                                 |
| 10  | Flat opaque bars and menus, heavy 80% black dialog dimming                                                                                              | Materials: frosted glass (blur + saturation) with a lit top edge and hairline for bars, menus and popovers; dialogs dim to 40% with a light blur                                                              |
| 11  | Warm "paper" tint on every surface, layered warm shadows and borders on cards                                                                           | Neutral system grays: white cards on #f5f5f7, true black with elevated grays in dark mode; cards barely lift and have no outline                                                                              |
| 12  | Outlined secondary buttons and fields with heavy borders; 40px touch targets                                                                            | Filled tinted controls (HIG "gray" style), 44px minimum targets, fields filled with a hairline for 3:1 boundary contrast                                                                                      |
| 13  | Reduced motion switched every transition off, so state changes jumped                                                                                   | Reduced motion keeps quick crossfades (opacity and color only); nothing moves, nothing jumps                                                                                                                  |
| 14  | `cn()` dropped text colors next to custom sizes (a white button label turned black)                                                                     | tailwind-merge knows the type levels                                                                                                                                                                          |
| 15  | The header's glass silently didn't render in Chrome (the CSS minifier kept only `-webkit-backdrop-filter`)                                              | Materials use Tailwind's backdrop utilities, which emit both                                                                                                                                                  |

## Do

- **Type:** use the levels: `text-display` (hero numbers), `text-large-title` (page titles), `text-title-1` (sections), `text-title-2` (panel titles, card amounts), `text-headline` (emphasis), `text-body` (default), `text-footnote` (secondary), `text-caption`, `text-micro` (labels). Let the level set the weight and tracking.
- **Labels:** `eyebrow` for the small capitals above a title.
- **Space:** use multiples of 8px (`p-2/4/6/8`, `gap-2/4/6`, `mt-2/4/6/8/10`); use 4px (`*-1`) only inside a control (icon to text, label to value).
- **Layout:** wrap pages in `page-container`; split them with `layout-main-aside` or `layout-5-7` (12 columns). Let whitespace separate groups before you reach for a border.
- **Surfaces:** content goes on `surface-card`. Anything floating over content uses a material: `material-regular` for bars, `floating` for menus and popovers.
- **Motion:**
  - In CSS, use `spring-snappy` (controls), `spring-smooth` (surfaces) or `spring-bouncy` (after a flick).
  - In JS, use `springAt` / `createBoxSpring` / `useTweened`.
  - Use `pressable` on anything tappable.
- **Direct manipulation:** if something looks movable (a highlight, a rail), let it follow the pointer, rubber-band at the edges and keep its velocity on release.
- **Scroll:** stage below-the-fold sections with `reveal`; use `parallax` only on a hero photo.
- **Reduced motion:** test with it on. Changes must still crossfade.

## Don't

- **No one-off text sizes** (`text-[15px]`) or hand-set tracking (`tracking-tight`, `tracking-[...]`).
- **No odd or fractional spacing** (`p-5`, `gap-1.5`, `mt-3`) and no arbitrary pixel spacing.
- **No hand-tuned easing** (`cubic-bezier`, `ease-[...]`) and no transition durations picked by feel for things that move.
- **No hover lifts or nudges.** Nothing should do something on hover that a finger can't trigger.
- **No gradients, glows or colored shadows.** No pill-shaped chips: controls are rounded rectangles.
- **No serif, script or mono display type.** Mono only for codes people copy.
- **No staggered cascades on every navigation**, and no more than one moving thing competing for attention.
- **No borders on cards**, and no heavy dimming behind dialogs.

## Second pass: removing what still read as a template

| Tell                         | What it looked like                                                                                         | Now                                                                                                                   |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Two action colors            | Green "go" buttons next to the blue accent, coral dots and arrows                                           | One brand blue for every action and highlight; coral only inside the logo and the route art                           |
| Pure black / plain gray      | True black dark mode, flat #f5f5f7 page                                                                     | A cool off-white with a whisper of the brand, white cards; deep blue-gray dark mode                                   |
| Accent word in headlines     | "Where to **next?**", "Your trip is **planned.**" in blue                                                   | One-color headlines; weight carries the emphasis                                                                      |
| Default type                 | System font on Macs, Inter elsewhere (what every Tailwind template ships)                                   | A pairing, self-hosted: Schibsted Grotesk for headlines and big numbers, Instrument Sans for text                     |
| Icons at nine stroke weights | 1, 1.5, 1.6, 1.7, 1.8, 2, 2.5                                                                               | Every Lucide icon at 1.75                                                                                             |
| Decorative dots              | Floating coral dot and ring in the trip-ready card, a dot under the active tab, dots before labels          | The card shows the real route (home, each city with its nights, home); tabs use a highlight (desktop) or tint (phone) |
| Numbered steps               | Coral "01–06" beside each Plan section                                                                      | Plain section titles                                                                                                  |
| Equal boxes                  | Three style cards, a 2-column grid of destination cards, four "what you pay for" tiles, nine interest tiles | A segmented control; a grouped list with checkmarks; a grouped list with switches; tokens sized to their words        |
| Fading content               | Sections at 35% opacity until scrolled to                                                                   | Content is always fully visible; only the hero photo moves (parallax)                                                 |
| Broken photos                | Browser broken-image icon and alt text in a gray box                                                        | `Photo`: placeholder while loading, fade-in, then a designed fallback or no photo at all                              |
| Spinners and blank space     | "Checking the forecast…" spinner, nothing while the introduction loads                                      | Skeletons in the content's shape; designed error panel                                                                |
| Dead empty lists             | One centered line of text                                                                                   | `EmptyState`: icon, what will appear, the action that fills it                                                        |
| Errors only in text          | A red sentence under a normal-looking field                                                                 | The field itself turns red (border, fill, focus ring), with an icon message linked to it                              |

Apple patterns added:

- Grouped lists with inset separators.
- iOS switches whose knob stretches while held.
- iOS large titles that collapse into the bar.
- A tinted tab bar.
- A sliding toolbar highlight.
- Notification-style toasts on glass.
- Thicker glass for the bars.

`src/test/design-system.test.ts` now also fails on:

- an accent word in a headline
- coral in the UI
- a bare `<img>`
- Inter or Google Fonts
