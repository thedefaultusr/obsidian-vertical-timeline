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
  and then hide as you zoom out. Hover the dot or bar of an event whose card is hidden to see its
  date and title. Click a dot, bar or card to select it: its card is then always shown in full.
- **Storylines** are sets of connected events, drawn as a rail from the first event to the last with
  the storyline's title down its side. Click the title to zoom to the storyline. Events without a
  storyline go in the main lane on the left.
- **Bands** are colored background ranges, such as eras.
- **Markers** are labelled dashed lines at a moment, such as "Lehman Brothers collapses".
- A **minimap** on the left shows the whole timeline.

## Syntax

| Line | Meaning |
|---|---|
| `- [date] Title \| Description` | Momentary event |
| `- [date~date] Title \| Description` | Spanning event |
| `@ [date~date] #color Label` | Band. The color and label are optional. |
| `= [date] #color {Storyline} Label` | Marker. The color, storyline and label are optional. |
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

**Descriptions** can go on for several paragraphs. Lines indented below an event, further than the
event itself, continue its description, as in a Markdown list item. A blank line starts a new
paragraph, and line breaks within a paragraph are kept:

```vtimeline
- [1969-07-20] Apollo 11 | The lunar module lands in the Sea of Tranquility.
  Armstrong steps out six hours later.

  Watch it: https://www.youtube.com/watch?v=S9HdPi9Ikhk
- [1969-07-24] Splashdown
```

Descriptions are plain text. Indented lines under an event are always part of its description, even
if they look like another event.

Bands are drawn at 15% opacity, unless their color has its own alpha, e.g. `#rgb(233 49 71 / 25%)`.

**Markers** take a single date and the same `#color` and `{Storyline}` modifiers as events. A marker's
line starts at its storyline's rail (or the main lane) and runs across the timeline, behind the
cards. A marker in a storyline takes the storyline's color and stretches its rail to include it.
Clicking a marker's label zooms in around it.

```vtimeline
= [2008-09-15] {Financial crisis} Lehman Brothers collapses
= [2020-03-11] #firebrick WHO declares a pandemic
```

### Attachments

The first link in an event's title or description is its attachment: a note, image, PDF, other file,
YouTube video or URL. Wikilinks (`[[note]]`, `[[note#Heading|alias]]`), embeds (`![[photo.jpg]]`) and Markdown links
(`[doc](files/a.pdf)`, `![](https://…/pic.png)`) all work. A link in the title shows its display
text; a link in the description is hidden.

An icon before the title shows what kind of attachment an event has. In a full card the title is a
link to the attachment: click it to open it (Cmd/Ctrl-click or middle-click opens a new tab; a note
that doesn't exist yet is created). In a compact card it isn't, so clicking anywhere on a compact
card expands it.

A linked **image**, **YouTube video** or **PDF** fills the top of a full card, edge to edge, above
the date and title:

- an image always spans the card's width, at its own height, up to a maximum height: 400px by
  default, changeable (or turned off) in settings. A taller image is cropped to it, keeping its
  middle. Give an image a size, as you would in a note, to set its own maximum: `![[photo.jpg|200]]`
  (200px), `![[photo.jpg|300x120]]` (120px: the second number is the height) or `![alt|200](url)`.
- a YouTube video plays in place, in a 16:9 frame. Links to `youtube.com/watch`, `youtu.be`, shorts, live streams and
  embeds all work, and a start time (`t=90`, `t=1m30s`) is kept. The player is removed when the card
  scrolls out of view or collapses, which stops the video.
- a PDF shows the top of a page, in a 16:9 frame: the first, or the one you link to with `[[report.pdf#page=3]]`.
  Pages are drawn with Obsidian's built-in PDF viewer and kept until the file changes.

A linked **note** is previewed below the card's text: the start of the note, or just the
`#heading` / `#^block` you linked. Links in the preview work.

When you rename or move a linked file, links inside timeline blocks are updated.

### Flags

| Flag | Effect |
|---|---|
| `> STORYLINE {name} #color` | Colors a storyline: its rail, its title, and its events and markers that have no color of their own. |
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
- Click a marker's label to zoom in around it.
- The buttons at the top right (shown on hover) fit all events and switch to full screen (Esc
  leaves it). Full screen isn't available on iPhone, which only allows videos to go full screen.
- When the timeline has focus: ↑ ↓ and Page Up / Down pan, + and - zoom, Esc clears the selection.

## Settings

Height, minimap and card density defaults; image max height; note previews, image previews, PDF previews, YouTube videos
and attachment icons on or off; updating links on rename on or off.

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
  `src/pdfPreview.ts` PDF pages and `src/youtube.ts` recognises YouTube links. `src/attachments.ts`
  resolves and opens links, and `src/linkUpdater.ts` rewrites links on rename.
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
