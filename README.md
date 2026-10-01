# Vertical Timeline for Obsidian

> [!WARNING]  
> The entire repo was generated 100% with Claude Code and has only received a very brief review. Use at your own risk.

Vertical timelines in your notes, written as Markdown code blocks and rendered by
[@defaultusr/vertical-timeline](https://github.com/thedefaultusr/vertical-timeline). Time runs down
the page and each event has a card next to its date.

````markdown
```vtimeline
> STORYLINE {Job} #royalblue

@ [2024-01~2024-03] #royalblue Project Atlas

- [2024-01-08~2024-02-20] {Job} !2 Planning | [[Atlas]]
- [2024-02-14] #seagreen {Home} Moved flats | new place ![[new flat.png]]
- [2024-03-01~2024-03-20] {Job} Contract | signed copy [[contract.pdf]]
- [2024-04-10] {Home} Birthday | cake
- [2024-05-12] Launch party [photos](https://example.com)
```
````

The command palette has **Insert timeline** and **Insert empty timeline**.

## What you get

- **Events** are momentary (a date: a dot) or spanning (a range: a bar).
- **Cards** show an event's date, title and description. They make room for each other, and shrink
  and then hide as you zoom out. Click a dot, bar or card to select it: its card is then always
  shown in full.
- **Storylines** are sets of connected events, drawn as a rail from the first event to the last with
  the storyline's title down its side. Click the title to zoom to the storyline. Events without a
  storyline go in the main lane on the left.
- **Bands** are colored background ranges, such as eras.
- A **minimap** on the left shows the whole timeline.

## Syntax

| Line | Meaning |
|---|---|
| `- [date] Title \| Description` | Momentary event |
| `- [date~date] Title \| Description` | Spanning event |
| `@ [date~date] #color Label` | Band. The color and label are optional. |
| `# text` | Comment |
| `> FLAG value` | Flag (see below) |

**Dates** are `YYYY[-MM[-DD[Thh[:mm[:ss]]]]]`; only the year is required. Use a negative year for
BCE (`[-550~-20]`). Ranges use `~`, not `-`.

**Modifiers** go between an event's date and its title, in any order:

- `#color`: any CSS color, such as `#red`, `#1e90ff`, `#rgb(0 128 255)`, `#oklch(70% 0.1 200)` or a
  theme variable like `#var(--color-green)`. An event has one color; any other `#word` is part of
  the title, so tags still work. Events without a color take their storyline's color, then the
  theme's accent color.
- `{Storyline}`: puts the event in a storyline.
- `!n`: priority, a whole number (default 0). When zoomed out, cards of higher-priority events
  stay visible longer.

Bands are drawn at 15% opacity, unless their color has its own alpha, e.g. `#rgb(233 49 71 / 25%)`.

### Attachments

The first link in an event's title or description is its attachment: a note, image, other file or
URL. Wikilinks (`[[note]]`, `[[note#Heading|alias]]`), embeds (`![[photo.jpg]]`) and Markdown links
(`[doc](files/a.pdf)`, `![](https://…/pic.png)`) all work. A link in the title shows its display
text; a link in the description is hidden.

The card's title then links to the attachment: click it to open it (Cmd/Ctrl-click or middle-click
opens a new tab; a note that doesn't exist yet is created). In a full card:

- a linked **note** is previewed: the start of the note, or just the `#heading` / `#^block` you
  linked. Links in the preview work.
- a linked **image** fills the card as its background, with the text on top.

When you rename or move a linked file, links inside timeline blocks are updated.

### Flags

| Flag | Effect |
|---|---|
| `> STORYLINE {name} #color` | Colors a storyline: its rail, its title, and its events that have no color of their own. |
| `> HEIGHT 600` | Height in pixels (default 500, changeable in settings). |
| `> HEIGHT fill` | As tall as the visible part of the note, following the pane as it's resized. |
| `> WINDOW 1900~2000` | The range shown at first. Default: all events and bands. |
| `> MINIMAP on\|off` | Shows or hides the minimap (default: on, changeable in settings). |
| `> DENSITY 2` | Card density: how many cards to show at a given zoom (default 1.25). Higher shows more cards and lets them push each other further from their dates. |

Lines that can't be read are listed under the timeline, with the reason.

## Navigation

- Scroll or drag to pan; drags have inertia. Once the timeline can't scroll further, the note
  scrolls instead.
- Ctrl/Cmd + scroll, or pinch, to zoom.
- Click or drag in the minimap to jump.
- The buttons at the top right (shown on hover) fit all events and switch to full screen (Esc
  leaves it). Full screen isn't available on iPhone, which only allows videos to go full screen.
- When the timeline has focus: ↑ ↓ and Page Up / Down pan, + and - zoom, Esc clears the selection.

## Settings

Height, minimap and card density defaults; note previews and image cards on or off; updating links
on rename on or off.

## Development

```bash
npm install
npm run dev       # watch build to main.js
npm run build     # typecheck + production build
npm test          # parser, date and link-rewriting tests
npm run harness   # bundle harness/ (serve the repo root, open harness/index.html)
```

- `src/parser.ts` reads a code block; `src/timelineBlock.ts` turns the result into a
  vertical-timeline instance and renders its cards. `src/notePreview.ts` renders note previews,
  `src/attachments.ts` resolves and opens links, and `src/linkUpdater.ts` rewrites links on rename.
- The canvas can't use CSS variables, so Obsidian theme colors (and colors like
  `#var(--color-red)`) are resolved to RGBA (`src/colors.ts`) and passed as vertical-timeline's
  `theme`. Card colors come from the `--vt-*` variables in `styles.css`. Timelines are rebuilt when
  the theme changes.
- `harness/` is a browser page that runs timeline blocks against a small mock of the Obsidian API.
- `test-vault/` is a sample vault with this plugin symlinked in. Open it with "Open folder as vault".

## Releasing

Releases are built by [.github/workflows/release.yml](.github/workflows/release.yml), following
[Obsidian's guide](https://docs.obsidian.md/Plugins/Releasing/Release+your+plugin+with+GitHub+Actions).

1. Once per repository: Settings → Actions → General → Workflow permissions → **Read and write**.
2. Bump the version. This updates `package.json`, `manifest.json` and `versions.json`, commits, and
   creates a tag without a `v` prefix, which is what Obsidian expects:
   ```bash
   npm version patch   # or minor / major
   ```
3. Push the commit and the tag:
   ```bash
   git push --follow-tags
   ```
4. The workflow checks the tag matches `manifest.json`, runs the tests, builds, attests `main.js`,
   `manifest.json` and `styles.css`, and attaches them to a **draft** release. Add release notes
   on GitHub and publish it.

To change the minimum Obsidian version, edit `minAppVersion` in `manifest.json` before running
`npm version`.

## Licence

[MIT](LICENSE). Bundles [@defaultusr/vertical-timeline](https://github.com/thedefaultusr/vertical-timeline)
(MIT) and [d3-scale](https://github.com/d3/d3-scale) (ISC).
