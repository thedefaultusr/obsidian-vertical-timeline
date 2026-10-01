import { describe, expect, it } from "vitest";
import { formatTimelineRange, parseTimelineDate } from "../src/dates";
import { findLinks, indexOutsideWikilinks } from "../src/links";
import { parseTimeline } from "../src/parser";

// Node has no CSS.supports, so use a small stand-in that knows a few colors.
const NAMED = new Set(["red", "blue", "tomato", "rebeccapurple", "transparent"]);
const isColor = (value: string) =>
	NAMED.has(value.toLowerCase()) ||
	/^#[0-9a-f]{3,8}$/i.test(value) ||
	/^(rgb|rgba|hsl|hsla|oklch|color-mix|var)\(.*\)$/i.test(value);

const parse = (source: string) => parseTimeline(source, { isColor });

describe("dates", () => {
	it("parses every precision", () => {
		expect(parseTimelineDate("2020")!.precision).toBe("year");
		expect(parseTimelineDate("2020-02")!.precision).toBe("month");
		expect(parseTimelineDate("2020-02-28")!.precision).toBe("day");
		expect(parseTimelineDate("2020-02-28T12")!.precision).toBe("hour");
		expect(parseTimelineDate("2020-02-28T12:30")!.precision).toBe("minute");
		const full = parseTimelineDate("2020-02-28T12:30:09")!;
		expect(full.precision).toBe("second");
		expect(full.date.getFullYear()).toBe(2020);
		expect(full.date.getMonth()).toBe(1);
		expect(full.date.getSeconds()).toBe(9);
	});

	it("handles BCE and years below 100", () => {
		expect(parseTimelineDate("-550")!.date.getFullYear()).toBe(-550);
		expect(parseTimelineDate("45")!.date.getFullYear()).toBe(45);
		expect(formatTimelineRange(parseTimelineDate("-550")!, parseTimelineDate("-20")!)).toBe("550 BCE – 20 BCE");
	});

	it("rejects invalid dates", () => {
		expect(parseTimelineDate("2020-13")).toBeNull();
		expect(parseTimelineDate("2021-02-29")).toBeNull();
		expect(parseTimelineDate("2020-02-28T25")).toBeNull();
		expect(parseTimelineDate("yesterday")).toBeNull();
	});
});

describe("links", () => {
	it("finds wikilinks, embeds and markdown links", () => {
		const links = findLinks("see [[Folder/Note#Part|alias]] and ![[pic.png]] or [doc](files/My%20doc.pdf) ![x](https://e.com/a.jpg)");
		expect(links.map((l) => [l.target, l.display, l.external])).toEqual([
			["Folder/Note#Part", "alias", false],
			["pic.png", "pic.png", false],
			["files/My doc.pdf", "doc", false],
			["https://e.com/a.jpg", "x", true],
		]);
	});

	it("finds bare web addresses, but not the ones inside Markdown links", () => {
		const links = findLinks("Watch https://youtu.be/abc. Or [this](https://e.com/x) and http://e.org/a?b=1, ok");
		expect(links.map((l) => [l.raw, l.target, l.external])).toEqual([
			["https://youtu.be/abc", "https://youtu.be/abc", true],
			["[this](https://e.com/x)", "https://e.com/x", true],
			["http://e.org/a?b=1", "http://e.org/a?b=1", true],
		]);
	});

	it("ignores pipes inside wikilinks", () => {
		expect(indexOutsideWikilinks("Name [[a|b]] | desc", "|")).toBe(13);
	});
});

describe("parseTimeline", () => {
	it("parses events and comments", () => {
		const { events, errors } = parse(`
# comment
- [1789~1799] French Revolution
- [1776] Declaration | a description
- [2024-02-26] Game 1 | Austin
`);
		expect(errors).toEqual([]);
		expect(events.map((e) => [e.title, e.description, e.end?.text])).toEqual([
			["French Revolution", "", "1799"],
			["Declaration", "a description", undefined],
			["Game 1", "Austin", undefined],
		]);
		expect(events[0].end!.date.getFullYear()).toBe(1799);
	});

	it("parses bands: a range, an optional color and an optional label", () => {
		const { bands, events, errors } = parse(`
@ [-300~250] #red
@ [1914~1918] #rgb(255 0 0 / 30%)   The   Great War
@ [2000~2001]
@ [2000~2001] Named, no color
@ [2000~2001] #nope
@ [1440] #1e90ff Needs an end
`);
		expect(events).toEqual([]);
		expect(bands.map((b) => [b.start.text, b.end.text, b.color, b.label])).toEqual([
			["-300", "250", "red", undefined],
			["1914", "1918", "rgb(255 0 0 / 30%)", "The Great War"],
			["2000", "2001", undefined, undefined],
			["2000", "2001", undefined, "Named, no color"],
		]);
		expect(errors.map((e) => [e.line, e.message.split(" ").slice(0, 3).join(" ")])).toEqual([
			[5, "\"#nope\" is not"],
			[6, "A band needs"],
		]);
	});

	it("reads modifiers in any order, with or without spaces", () => {
		const { events } = parse(`
- [2000] #ff8800 {Team A} !2 Hex
- [2000] !-1 {Team B} #tomato Named
- [2000] #rgb(0, 128, 255) Functional with spaces
-[1892~1941]{Marina}#var(--color-red) Var
- [2000] #hashtag is not a color
- [2000] #red #blue One color per event
- [2000] !important stays in the title
- [2000] {unclosed brace
`);
		expect(events.map((e) => [e.color, e.storyline, e.priority, e.title])).toEqual([
			["#ff8800", "Team A", 2, "Hex"],
			["tomato", "Team B", -1, "Named"],
			["rgb(0, 128, 255)", undefined, undefined, "Functional with spaces"],
			["var(--color-red)", "Marina", undefined, "Var"],
			[undefined, undefined, undefined, "#hashtag is not a color"],
			["red", undefined, undefined, "#blue One color per event"],
			[undefined, undefined, undefined, "!important stays in the title"],
			[undefined, undefined, undefined, "{unclosed brace"],
		]);
	});

	it("extracts attachments from the title or the description", () => {
		const { events } = parse(`
- [2020] Meeting [[Notes/Meeting 1|the meeting]]
- [2021] Trip | photos ![[trip.jpg]]
- [2022] | [[Plan.pdf]]
- [2023] ![[scan.png]]
- [2024] Two [[A]] [[B]]
`);
		expect(events.map((e) => [e.title, e.description, e.link?.target])).toEqual([
			["Meeting the meeting", "", "Notes/Meeting 1"],
			["Trip", "photos", "trip.jpg"],
			["2022", "", "Plan.pdf"],
			["scan.png", "", "scan.png"],
			["Two A B", "", "A"],
		]);
	});

	it("reads descriptions from the indented lines below an event, in paragraphs", () => {
		const { events, errors } = parse(`
- [2020] Trip | First paragraph,
  still the first.

  Second paragraph. [[Itinerary]]


      Third,   deeper indented.
- [2021] No pipe
    Only continuation lines
@ [2020~2021] Band
- [2022] Last | one line
`);
		expect(errors).toEqual([]);
		expect(events.map((e) => [e.title, e.description, e.link?.target])).toEqual([
			["Trip", "First paragraph,\nstill the first.\n\nSecond paragraph.\n\nThird, deeper indented.", "Itinerary"],
			["No pipe", "Only continuation lines", undefined],
			["Last", "one line", undefined],
		]);
	});

	it("keeps events apart when the whole block is indented", () => {
		const { events } = parse(["  - [2020] A | a", "  - [2021] B | b", "    more b"].join("\n"));
		expect(events.map((e) => [e.title, e.description])).toEqual([
			["A", "a"],
			["B", "b\nmore b"],
		]);
	});

	it("reads markers: a moment, with optional color, storyline and label", () => {
		const { markers, storylines, errors } = parse(`
= [2008-09-15] #tomato {Crisis} Lehman Brothers collapses
= [2020] {Only markers}   Pandemic
= [1969-07-20]
= [2001] #notacolor stays in the label
= [2000~2001] A range
= [1999] !2 Priority isn't a marker modifier
`);
		expect(markers.map((m) => [m.at.text, m.color, m.storyline, m.label])).toEqual([
			["2008-09-15", "tomato", "Crisis", "Lehman Brothers collapses"],
			["2020", undefined, "Only markers", "Pandemic"],
			["1969-07-20", undefined, undefined, undefined],
			["2001", undefined, undefined, "#notacolor stays in the label"],
			["1999", undefined, undefined, "!2 Priority isn't a marker modifier"],
		]);
		// A storyline with only markers is still a storyline.
		expect(storylines.map((s) => s.name)).toEqual(["Crisis", "Only markers"]);
		expect(errors.map((e) => [e.line, e.message.split(":")[0]])).toEqual([[5, "A marker is a single moment"]]);
	});

	it("reads flags", () => {
		const { flags, errors } = parse(`
> height 250
> WINDOW -3000~3000
> MINIMAP off
> DENSITY 2.5
> BOGUS
> DENSITY lots
> WINDOW 2000
> MINIMAP maybe
`);
		expect(flags).toMatchObject({ height: 250, minimap: false, density: 2.5 });
		expect(flags.window!.start.date.getFullYear()).toBe(-3000);
		expect(flags.window!.end.date.getFullYear()).toBe(3000);
		expect(errors.map((e) => [e.line, e.message.split(" ").slice(0, 2).join(" ")])).toEqual([
			[5, "Unknown flag"],
			[6, "DENSITY needs"],
			[7, "WINDOW needs"],
			[8, "MINIMAP takes"],
		]);
		expect(parse("> HEIGHT Fill").flags.height).toBe("fill");
		expect(parse("> HEIGHT tall").errors[0].message).toMatch(/^HEIGHT needs/);
	});

	it("collects used storylines, with colors from STORYLINE flags", () => {
		const { storylines, errors } = parse(`
> STORYLINE {Cold War} #red
> STORYLINE {Space} #tomato
> STORYLINE {Unused} #red
> STORYLINE {Space} #nope
> STORYLINE Space #red
- [1957] {Space} Sputnik
- [1947] {Cold War} Truman Doctrine
- [1950] {Asia} Korean War
`);
		expect(storylines).toEqual([
			{ name: "Cold War", color: "red" },
			{ name: "Space", color: "tomato" },
			{ name: "Asia" },
		]);
		expect(errors.map((e) => e.line)).toEqual([4, 5]);
	});

	it("reports bad lines but keeps the good ones", () => {
		const { events, errors } = parse(`
- [2020] ok
- [2020-13] bad month
- [2024~2020] backwards
- [2020~2021~2022] two tildes
* [2020] not a line type
just text
`);
		expect(events).toHaveLength(1);
		expect(errors.map((e) => e.line)).toEqual([2, 3, 4, 5, 6]);
	});
});

describe("updateLinksInMarkdown", () => {
	it("rewrites links only inside timeline blocks", async () => {
		const { updateLinksInMarkdown } = await import("../src/linkUpdater");
		const source = [
			"Outside [[Old]] stays",
			"```vtimeline",
			"- [2020] A [[Old#Part|alias]] | ![[Old]]",
			"- [2021] B [x](Old.md) [y](<Old.md#h>) [z](https://Old)",
			"```",
			"> ~~~vtimeline",
			"> - [2022] [[Other]] [[Old]]",
			"> ~~~",
			"```js",
			"[[Old]]",
			"```",
		].join("\n");
		const rewrite = (path: string) => (path === "Old" ? "New Name" : path === "Old.md" ? "New Name.md" : null);
		expect(updateLinksInMarkdown(source, "vtimeline", rewrite)!.split("\n")).toEqual([
			"Outside [[Old]] stays",
			"```vtimeline",
			"- [2020] A [[New Name#Part|alias]] | ![[New Name]]",
			"- [2021] B [x](New%20Name.md) [y](<New Name.md#h>) [z](https://Old)",
			"```",
			"> ~~~vtimeline",
			"> - [2022] [[Other]] [[New Name]]",
			"> ~~~",
			"```js",
			"[[Old]]",
			"```",
		]);
		expect(updateLinksInMarkdown(source, "vtimeline", () => null)).toBeNull();
	});
});
