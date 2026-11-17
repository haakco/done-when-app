# Done When design system

The design contract for this app. Extend it; do not fork it. Tokens live in one file,
`src/styles/tokens.css`; components use tokens, never literal colours or sizes.

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

- One centred column, `--width-page` wide, generous spacing. Item pages lead with the answer:
  name → status → the big number and progress → forecast sentence → chart.
- Owner tools (add measurement, import, links, lifecycle) sit below the answer in plain
  sections with headings, so share and owner pages read the same from the top.
- Header: wordmark (home link), "New", "My items", "API". Skip link to `main`.
- Below 40rem everything stacks; forms are one column.

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
| `--color-line` | Borders and rules |
| `--color-finish` | Target, primary action, focus ring — the finish line |
| `--color-forecast` | Forecast line, band and interval text |
| `--color-done`, `--color-warn`, `--color-stop` | Completed, stale / at risk, canceled / error |

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
| `CopyLinkButton` | Copies a link; result announced in a polite live region; shows the link as text too |
| Chart slots | `<figure>` with a caption naming the chart; reserved height so live updates do not shift layout |
| `StateMessage` | Loading, not-found, read-only and error states with a next action |

## States

Item pages: loading (skeleton text, not a spinner alone), not found or expired (with "start a
new one"), read-only (owner tools absent, one line explaining the link is view-only), write
failed (error next to the form, draft kept). CSV import lists bad rows by line number and adds
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
