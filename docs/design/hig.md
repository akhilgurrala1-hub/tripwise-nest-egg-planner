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

- **Type:** use the levels: `text-display` (hero headline, hero numbers), `text-large-title` (page titles), `text-title-1` (sections), `text-title-2` (panel titles, card amounts), `text-headline` (emphasis), `text-body` (default), `text-footnote` (secondary), `text-caption`, `text-micro` (labels). Let the level set the weight and tracking.
- **Labels:** `eyebrow` for the short line above a headline (sentence case). `link-chevron` for "Learn more ›" links.
- **Space:** use multiples of 8px (`p-2/4/6/8`, `gap-2/4/6`, `mt-2/4/6/8/10`); use 4px (`*-1`) only inside a control (icon to text, label to value).
- **Layout:** wrap pages in `page-container`; split them with `layout-main-aside` or `layout-5-7` (12 columns). Let whitespace separate groups before you reach for a border.
- **Surfaces:** content goes on `surface-card`. Anything floating over content uses a material: `material-regular` for bars, `floating` for menus and popovers.
- **Motion:**
  - In CSS, use `spring-snappy` (controls), `spring-smooth` (surfaces) or `spring-bouncy` (after a flick).
  - In JS, use `springAt` / `createBoxSpring` / `useTweened`.
  - Use `pressable` on anything tappable.
- **Direct manipulation:** if something looks movable (a highlight, a rail), let it follow the pointer, rubber-band at the edges and keep its velocity on release.
- **Scroll:** sections below the fold fade up once as they arrive (`useScrollReveal`, automatic in `AppShell`); use `parallax` only on a hero photo.
- **Reduced motion:** test with it on. Changes must still crossfade.

## Don't

- **No one-off text sizes** (`text-[15px]`) or hand-set tracking (`tracking-tight`, `tracking-[...]`).
- **No odd or fractional spacing** (`p-5`, `gap-1.5`, `mt-3`) and no arbitrary pixel spacing.
- **No hand-tuned easing** (`cubic-bezier`, `ease-[...]`) and no transition durations picked by feel for things that move.
- **No hover lifts or nudges.** Nothing should do something on hover that a finger can't trigger.
- **No gradients, glows or colored shadows.** Buttons are capsules; chips, tags and badges are rounded rectangles, never pills.
- **No script or mono display type, and no serif below headline size.** The serif (Newsreader) is for `title-display` headlines only; mono only for codes people copy.
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

## Third pass: apple.com

The app now takes its page structure and motion straight from apple.com, with every feature and the trip assistant unchanged.

| Before                                   | Now                                                                                                      |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| One tall header with tabs and a trip bar | A 44px global nav, then a sticky local nav for the trip with one capsule button for the page's next step |
| Phone tab bar at the bottom              | A menu button opens a full-screen menu; its links slide in one after another                             |
| Collapsing iOS large title               | Each page's title sits in a white band at apple.com sizes (up to 80px on the Plan hero)                  |
| Two typefaces                            | One family (Instrument Sans) at every size, like SF on apple.com                                         |
| Rounded-rectangle buttons                | Capsule buttons; "Learn more ›" chevron links for secondary paths                                        |
| Cards with soft shadows                  | Flat tiles (18px radius) on a light gray page                                                            |
| Everything on screen at once             | The hero rises in on load; later sections fade up once as they scroll in; key amounts count up when seen |
| Ideas as a plain rail                    | A gallery with paddles, drag and momentum                                                                |
| No footer                                | An apple.com footer: sources, breadcrumb, link columns, fine print                                       |

What stays: content already on screen is never hidden, reduced motion turns every movement into a plain crossfade or nothing, and printing shows everything.

## Fourth pass: fluid details

Checked against Apple's _Designing Fluid Interfaces_ and _Principles of Great Design_:

| Principle                         | What was missing                                                     | Now                                                                                               |
| --------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Respond on touch-down             | iPhone Safari never showed the press state (it needs a `touchstart`) | A passive `touchstart` listener; `touch-action: manipulation` removes the double-tap wait         |
| Interruptible, same path in/out   | The phone menu vanished on close and couldn't be turned around       | Transitions in and out along one path; tapping again mid-way reverses from where it is            |
| Scroll edge, not hard dividers    | A permanent line under the trip bar                                  | The hairline fades in only once content is passing under the bar                                  |
| No abrupt brightness jumps        | Light/dark switched in one frame                                     | A 280ms crossfade of the whole page (View Transitions, where supported)                           |
| Reduce Transparency / Contrast    | Glass stayed see-through                                             | Solid surfaces; with Increase Contrast also defined edges and darker secondary text               |
| Multimodal feedback, used sparely | None                                                                 | A light haptic tick on the same frame as a switch flip or a segmented snap (Vibration API phones) |

## Fifth pass: art direction (no AI defaults)

The five decisions, made concretely, so the site can't fall back on what every generated site looks like.

**1. Type, paired.**

- Headlines: Newsreader Variable (Production Type, OFL, self-hosted with its optical-size axis), weight 500, through `title-display`. Display 48 to 80px, line-height 1.05, tracking -0.015em; large title 32 to 48px / 1.08; title-1 28 to 40px / 1.1.
- Text, controls and every number: Instrument Sans Variable. Body 17px / 1.47 at -0.022em; footnote 14px / 1.43; caption 12px / 1.33. Amounts (`money-display`) stay in the sans, weight 600, -0.015em, so figures read cleanly.

**2. Color as tokens, one accent in one role.**

- Warm ink `oklch(0.218 0.012 70)` on warm paper `oklch(0.968 0.008 75)`, with white bands and tiles (`--card`); dark mode is deep navy `oklch(0.165 0.024 258)` with navy tiles.
- One accent, brand blue `#2457E6` (`--primary`), in one role: what you can press, or what's selected. Decorative icons and data (rain chances, a holiday marker) are gray; warnings use `--destructive`. A test fails on blue icons or blue plain text.
- No decorative gradients (tested in components). The only gradients are photo scrims, defined once in `styles.css` (`photo-scrim`, `card-scrim`).

**3. Layout, structural and asymmetric.**

- Plan hero on a 12-column grid: eyebrow, headline, subhead and the assistant left-aligned in columns 1 to 7.
- The destination's photo fills columns 8 to 12 and runs off the window's right edge and down to the band's bottom.
- Below it, the gray content area changes rhythm: the Ideas gallery (8 columns) beside the trip preview (4).
- On phones the photo follows the assistant as a 16:10 crop, so the first screen still has one thing to do.

**4. Motion, specified.**

- One orchestrated entrance: `hero-in`, each line rising 24px and fading in over 1s on the smooth spring, staggered 110ms after an 80ms start.
- One scroll behavior: sections below the fold rise 32px and fade in once (opacity 0.9s ease-out, transform 1.1s on the smooth spring).
- Hovers only change color, never position.
- Reduced motion keeps crossfades only.

**5. Real assets, art-directed.**

- The hero photo is the trip's real destination from Wikipedia, at 1280px where Wikimedia has it.
- It is hard-cropped (`object-cover`), with no box around it on large screens, and its name sits on a strip of glass (`material-thin`) with the credit link.
- No placeholder art: while it loads, a skeleton in its shape; if there's no photo, nothing.

## Sixth pass: photo-led

The site still read as gray boxes, so the destination's photo now leads:

- **Plan hero:** the photo fills the hero edge to edge (up to 92% of the screen's height). The question is in white over a scrim that darkens the left and bottom. The assistant sits on a pane of glass, and the credit is bottom right.
- **Ideas:** tall 3:4 photo cards with the name in the serif, distance and the estimate in white.
- **Overview:** the destination photo runs edge to edge under the title.
- **Color:** warm paper instead of cool gray in light mode; deep navy instead of black in dark mode.

## Seventh pass: product-team polish

An audit against a "shipped by a mature product team" checklist:

| Check                        | Found                                                                                       | Now                                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| One radius family            | Seven radius steps plus hand-set 3, 5, 10, 18, 20 and 24px corners                          | Four roles: 3px bars, 6px items inside surfaces, 12px controls, 18px surfaces; buttons are capsules (tested)   |
| One field family             | Text input 44px on a fill; text area and select 36px, transparent, with a drop shadow       | All three: 44px, 12px corners, fill, the same blue focus ring, no shadow (tested)                              |
| Shadows with a purpose       | Stray `shadow-sm` on fields, toggles and the menubar; a generic `shadow` on cards           | Tiles are flat; only things that float carry the lift shadow                                                   |
| Loading on every slow action | "Plan trip" (looks places up first), "Update" on the itinerary had no feedback              | `Button loading`: spinner in place of the icon, label kept, pressed once; all three Plan trip buttons share it |
| No novelty icons             | Sparkles beside suggestions, a magic wand for AI planning                                   | A calendar for planning days, a message bubble for "refine"; sparkles and wands fail a test                    |
| Copy                         | "unlock real routes and places"                                                             | "save trips and plan with real routes and places"                                                              |
| Clean console                | Every page logged a React hydration mismatch (the scroll reveal wrote attributes too early) | The reveal uses Web Animations only, never attributes: no mismatch                                             |

## Eighth pass: legal pages and the anti-slop checklist

- **Legal:** a Privacy Policy and Terms of Service written from what the app really does, linked from the footer and the sign-up form.
- **Checked and already clean:** purple-to-blue gradients, gradient headline text, glowing orbs, three feature cards in a row, fake testimonials, terminal windows, emoji in headings, em dashes, empty bento grids, three-tier pricing, cursor beams, vague button labels, broken embeds, forms that ask too much (sign-up is email and password).
- **Fixed:**

  | Item                        | Change                                                                                        |
  | --------------------------- | --------------------------------------------------------------------------------------------- |
  | Everything fades in         | No fade-ins on cards, sections, pages; no count-ups; the Plan hero alone fades in (240ms)     |
  | Labels above headlines      | Removed from every page title and the hero                                                    |
  | Icons everywhere            | The trip bar is plain text; sparkles and wands were already gone                              |
  | Glass everywhere            | Glass only for the two bars and floating menus; the hero panel and photo labels are solid     |
  | Untouched shadcn/ui         | 34 unused stock components deleted; dialog and accordion restyled                             |
  | Buzzword copy               | "smart budgets" and "unlock" replaced with what the app does; a test bans the usual buzzwords |
  | Cream "tasteful AI" palette | Light paper now comes from the brand blue                                                     |
  | Box inside a box            | Panels inside cards use a divider line                                                        |
  | Small and low-contrast text | Smallest text 12px; muted text and placeholders meet 4.5:1                                    |
  | Keyboard and forms          | The sign-up password field states its rule (6 characters), linked with `aria-describedby`     |

- **Verified:** Impeccable's detector reports 0 anti-patterns on every page of the running app.

## Ninth pass: the three installed skills

**Impeccable** (critique run in one context: its two reviewer subagents hit the usage limit; detector on source and every page: 0 findings)

- No label above a heading anywhere: the itinerary day's date moved under its title, the shared trip's "A trip shared with you" under the place.
- Section headings on a fixed 32px (app surfaces don't use fluid headings); the form's step titles are `h3` under "Or plan it yourself".
- The sample-trip banner is a notice (sans, 21px), not a second display headline under the page title.
- Browser surfaces wear the palette: caret, native controls (`accent-color`) and scrollbars.

**Emil Kowalski** (review table in the PR)

- No `transition-all`; nothing grows from `scale(0)` (logo intro and travel-scene arrival start at 0.6).
- UI transitions at 300ms or less: springs 250 to 300ms, press release 200ms, progress bars and color changes 200ms.
- The switch slides without bouncing; the travel scenes no longer loop while idle; the logo has no hover ripple.

**Taste skill** (its checker on the Plan page: credit-wall and copy-headline now pass)

- The h1 says what Waypoint does: "Plan your trip, priced to the dollar."
- No caption on the hero photo; the footer carries one credit line linking to the full list in the Terms (Open-Meteo added there).
- No fade-in or parallax on the hero.
- Quick starts are actions ("Plan a mountain weekend for 2"); idea-card photos zoom 1.03 inside their frame on hover.
- Not applied, on purpose: its landing-page rules (one section per screen, at most two actions in the hero, a 2px card lift on hover) don't fit an app's working screens, and the lift conflicts with Emil's rules and our hover test.

## Tenth pass: clean travel app (November 2026)

The owner picked a "clean travel app" direction over the magazine look, because the site still felt "chopped". Changes:

- **One face.** Newsreader is gone. Headlines are Instrument Sans at 650 with tight tracking, so the app reads as one product instead of a magazine with app controls in it. `title-1` is now 26px and `title-2` 22px, and page titles stop at `text-large-title`.
- **Home screen.** The dark full-bleed photo hero is replaced by a white band with "Where to next?" and one wide search-style bar (with a "Plan" button), quick starts as small centered chips. One question and one input, the pattern people know from travel apps.
- **Listing cards.** Ideas show the photo on top and the facts under it in normal text: no white text on scrims, nothing to fight for legibility. Fallback without a photo is a gray tile with a gray trip icon.
- **Layout.** The ideas row runs the full width. The manual form stacks headings over controls instead of a 160px label column that squeezed the trip-type picker into wrapping.
- **Smaller numbers where they're secondary.** The emergency fund figure on the Budget page drops from display size to large title. The Overview keeps one big number (left to spend).

Checked with Impeccable's detector (0 findings on every page) and axe in light, dark and mobile (clean).

## Eleventh pass: an app frame for every screen (November 2026)

The owner said the site still looked bad on every device and that the passes kept "doing the same thing". They had: each pass changed tokens, type and the hero but kept a marketing-website frame (a 44px global nav, a second local nav bar, a white title band, an apple.com footer) squeezed or stretched to fit. This pass changes the frame itself:

- **Phones:** a slim top bar and a bottom tab bar (Plan, Overview, Budget, Days, More). More is a sheet above the tabs with the trip, every section and the account and legal links. Pinned bars sit above the tabs (`--tabbar`).
- **Tablets:** an icon rail with labels down the left.
- **Laptops and desktops:** a sidebar with the current trip, the sections and the account, always in view. Content sits beside it at up to 1216px.
- **Page headers:** title, trip facts and actions on the page itself, with the next step as a capsule. No banner and no second bar.
- **Footer:** one quiet block instead of link columns.

Checked at 360, 390, 820, 1280 and 1920px wide (no sideways overflow), axe in light, dark and mobile (clean), and Impeccable on seven pages (0 findings).
