# Done When design system

The design contract for this app. Extend it; do not fork it. Tokens live in one file,
`src/styles/tokens.css`; components use tokens for colour, type, spacing and motion, never literal colours.

## Intent

**A finish line you can see coming.** Done When is a quiet, confident tracker for "when will
this be done?": someone counts progress or records estimates, and anyone with the link sees
the answer at a glance. The look is a printed progress chart on warm paper: ink-dark type, big
honest numbers, one vivid finish-line colour for the target and one calm teal for the forecast.
It should feel personal and a little playful, never like an operations console.

- **Users:** an owner tracking one thing (a count, a project, a set of them), and viewers who
  open a share link once or keep it on a screen.
- **Ordinary task:** open a link → read "how far, how fast, when". Second: add a measurement.
- **Not:** Custd's console look (dense, neutral, navigation-heavy) or a copy of done-when.com.

## Layout and density

- One centred column, `--width-page` wide, generous spacing. Item pages start with the title and
  one Share button beside it (it copies the view-only link; owners never share their owner
  link), then a one-time "Save your owner link" notice for the owner, then one summary card:
  the answer as a headline ("Likely done Nov 19"), one detail line, progress and pace. Then the
  owner's one common write (add a measurement or an estimate), then the chart and the live line.
- Item kinds: counter, project, model and dashboard share this page shape, the home page's
  "Or" cards, "My items", "Recent on this device" and dashboard tiles.
- Everything else sits behind `.more` disclosures (`<details>`): forecast detail, several
  measurements, forecast settings, runs, alerts, links and expiry. Share and owner pages read
  the same from the top.
- The home page holds the create-counter form itself: two fields (name, target) and "Create
  counter"; the free-text unit and everything else wait behind "More options". Below it: project,
  model and dashboard starts, then "Recent on this device".
- Header: wordmark (home link), "New counter", "New project", "My items", "API" (new dashboard
  starts from home). Skip link to `main`.
- Grids (`.card-grid`, `.field-row`) wrap with `auto-fit`, so narrow screens stack without breakpoints.

## Type

- Body and controls: `--font-body` (system UI stack). Headings and big numbers: `--font-display`
  (system serif stack) — the paper-chart character, with no font download.
- Numbers use `font-variant-numeric: tabular-nums` so live values do not jitter.
- Scale: `--text-sm`, `--text-base`, `--text-lg`, `--text-xl`, `--text-2xl`, `--text-hero`.

## Colour

Light (paper) is the default; dark (night sky ink) follows `prefers-color-scheme`.

| Token | Role |
| --- | --- |
| `--color-paper`, `--color-surface` | Page and card backgrounds |
| `--color-ink`, `--color-ink-muted` | Text; muted text still meets 4.5:1 on paper and surface |
| `--color-line` | Decorative borders and rules (cards, tables); form controls use `--color-ink-muted` for 3:1 |
| `--color-finish` | Target, primary action, focus ring — the finish line |
| `--color-forecast` | Forecast line, band and interval text |
| `--color-done`, `--color-warn`, `--color-stop` | Completed, stale / at risk, canceled / error |

Charts take their colours from the `--custd-chart-*` variables set on `.item`.

Colour is never the only signal: status badges carry a word and a glyph (✓ done, ● active,
✕ canceled, ! stale); progress bars carry their percentage as text; chart series carry labels.

## Depth and shape

Flat paper. Cards are `--color-surface` with a 1px `--color-line` border and `--radius`; no
heavy shadows. The progress bar is a thick rule with a finish tick at the target.

## Motion

- `--motion-fast` (120ms) for hover and press, `--motion-calm` (280ms) for progress changes,
  both on `--ease`.
- `prefers-reduced-motion: reduce` sets both to `0ms`; nothing animates on its own then.
- Celebrations (B6) are brief, can be turned off, and never block reading.

## Components

| Component | Rule |
| --- | --- |
| `Button` (`.button`, `.button--primary`, `.button--quiet`) | Real `<button>` or link; visible focus ring; disabled while a write is pending |
| `Field` (`.field`) | Label above control, hint and error below, error linked with `aria-describedby` and `aria-invalid` |
| `StatusBadge` | Word + glyph + colour |
| `Progress` | `<progress>`-equivalent with `role="progressbar"`, value text, finish tick |
| `CopyButton` | Copies text; result announced in a polite live region; shows the text too |
| `ItemHeader` | Title, status, the Share button, and the owner's one-time owner-link notice (dismissal kept on this device) |
| `RecentList` | Items opened in this browser, newest first, with "you can edit" or "view only"; "Clear this list" |
| Model components | `ModelEditor`, `QuantityHistogram`, `SensitivityView`, `MeasureNextPanel`, `ModelCalculator` from `@haakco/custd-react`; the app styles their markup through `data-custd-*` attributes |
| Charts | `@haakco/custd-react` `ForecastChart`, `ArrivalHistogram`, `ConvergenceStory` in `.chart`, coloured through the `--custd-chart-*` variables mapped to tokens; drawn smaller on phones so labels stay readable |
| `LiveLine` | One quiet line: "Updates by itself", or stale / offline with what happens next |
| `ItemStates` | Loading, not-here, read-only, write error and service-unavailable states, each with a next action |
| `.more` | Disclosure with a finish-colour chevron; 2.75rem tall summary |

## States

Item pages: loading (a status line naming what is loading), not found or expired (with "start a
new one"), read-only (owner tools absent, one line explaining the link is view-only), write
failed (plain-words error next to the form, draft kept), stale and offline (the live line says
the page shows what it had and retries), data service unavailable (reload). CSV import lists bad rows by line number and adds
nothing until the rows are fixed.

## Accessibility

Semantic landmarks and headings, real form labels, visible focus on every control, keyboard
operation, 4.5:1 text contrast and 3:1 for non-text marks in both themes, colour never alone.

## Share cards

`public/share-cards/*.svg` are 1200×630 templates with `{{field}}` placeholders, rendered to PNG
by Custd's share previews (A5). They use the same palette and the serif display type.

## Decisions

| Date | Decision |
| --- | --- |
| 2026-11-17 | Own look: warm paper, ink, vermilion finish line, teal forecast; system font stacks only. |
| 2026-11-17 | Plain CSS with tokens in `src/styles/tokens.css`; no CSS framework. |
| 2026-11-17 | Reduced motion zeroes every duration token rather than per-component overrides. |
| 2026-11-17 | Form control borders use `--color-ink-muted`, not `--color-line`, to meet 3:1 non-text contrast. |
| 2026-11-18 | Summary first, one share button, owner tools behind disclosures; the create-counter form lives on the home page. |
| 2026-11-18 | Share sits beside the title; the owner-link notice shows once per item per device; models are a first-class item kind. |
| 2026-11-18 | Grid children get `min-width: 0` and controls `width: 100%`, so long option text never widens the page at 400px. |
