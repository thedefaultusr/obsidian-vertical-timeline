import { parseTimelineDate, TimelineDate } from "./dates";
import { findLinks, indexOutsideWikilinks, ParsedLink, replaceLinksWithDisplay } from "./links";

/**
 * Parser for the timeline code block language:
 *
 *   - [Date~Date] #color {Storyline} !2 Title | Description   event (the end date is optional)
 *       More description, indented under the event.         blank lines separate paragraphs
 *   @ [Date~Date] #color Label                                band: a background range
 *   = [Date] #color {Storyline} Label                         marker: a labelled line at a moment
 *   # comment
 *   > FLAG value
 *
 * `#color` is any CSS color: `#tomato`, `#1e90ff`, `#rgb(0 128 255 / 50%)`, `#var(--color-red)`.
 */

export interface TimelineEvent {
	id: string;
	start: TimelineDate;
	/** Present for spanning events; omitted for momentary ones. */
	end?: TimelineDate;
	title: string;
	/** Paragraphs separated by `\n\n`; line breaks within a paragraph are kept as `\n`. */
	description: string;
	/** A CSS color as written (hex colors are normalised to start with `#`). */
	color?: string;
	/** Name of the event's storyline; events without one go in the main lane. */
	storyline?: string;
	/** `!n`: higher priority cards stay visible longer when zooming out. */
	priority?: number;
	/** The first link in the title or description: the event's attachment. */
	link?: ParsedLink;
}

/** A colored background range. */
export interface TimelineBand {
	start: TimelineDate;
	end: TimelineDate;
	color?: string;
	label?: string;
}

/** A dashed line marking a moment, with an optional label. */
export interface TimelineMarker {
	id: string;
	at: TimelineDate;
	label?: string;
	color?: string;
	/** A marker in a storyline takes its color and counts toward its time extent. */
	storyline?: string;
}

/**
 * A `{Storyline}` used by at least one event or marker. Storylines with a `> STORYLINE` flag come
 * first.
 */
export interface TimelineStoryline {
	name: string;
	color?: string;
}

export interface TimelineFlags {
	/** Pixels, or `fill`: the visible height of the note. `undefined`: the plugin default. */
	height?: number | "fill";
	/** Initially visible range. */
	window?: { start: TimelineDate; end: TimelineDate };
	/** `undefined` means "use the plugin default". */
	minimap?: boolean;
	/** Card density. `undefined` means "use the plugin default". */
	density?: number;
}

export interface ParseError {
	line: number;
	text: string;
	message: string;
}

export interface ParseResult {
	events: TimelineEvent[];
	bands: TimelineBand[];
	markers: TimelineMarker[];
	storylines: TimelineStoryline[];
	flags: TimelineFlags;
	errors: ParseError[];
}

export interface ParseOptions {
	/** Decides whether a string is a valid CSS color. Defaults to `CSS.supports("color", value)`. */
	isColor?: (value: string) => boolean;
}

const LINE_RE = /^([-@=])\s*\[([^\]]*)\]\s*(.*)$/;
const PRIORITY_RE = /^!(-?\d+)(?=\s|$)/;
const HEX_RE = /^(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const DATE_FORMAT_HINT = "Use YYYY[-MM[-DD[Thh[:mm[:ss]]]]], negative years for BCE.";

function defaultIsColor(value: string): boolean {
	return typeof CSS === "undefined" || CSS.supports("color", value);
}

/**
 * Reads a leading `#color` from `text`. Returns `null` when `text` doesn't start with one (a
 * `#tag` isn't a color). Functional colors such as `rgb(0, 128, 255)` may contain spaces, so
 * balanced parentheses are read whole.
 */
function readColor(text: string, isColor: (value: string) => boolean): { color: string; rest: string } | null {
	if (!/^#[^\s#]/.test(text)) return null;
	let token: string | undefined;
	if (/^#[a-z-]+\(/i.test(text)) {
		let depth = 0;
		for (let i = text.indexOf("("); i < text.length && !token; i++) {
			if (text[i] === "(") depth++;
			else if (text[i] === ")" && --depth === 0) token = text.slice(1, i + 1);
		}
	} else {
		token = /^#([^\s{#|]+)/.exec(text)?.[1];
	}
	if (!token) return null;
	const color = HEX_RE.test(token) && isColor(`#${token}`) ? `#${token}` : isColor(token) ? token : null;
	return color ? { color, rest: text.slice(token.length + 1) } : null;
}

interface Modifiers {
	color?: string;
	storyline?: string;
	priority?: number;
}

/**
 * Reads the `#color`, `{Storyline}` and (if `withPriority`) `!n` modifiers at the start of an event
 * or marker, in any order. Returns them and the text after them.
 */
function readModifiers(
	text: string,
	isColor: (value: string) => boolean,
	withPriority: boolean,
): { modifiers: Modifiers; rest: string } {
	const modifiers: Modifiers = {};
	let rest = text;
	for (;;) {
		rest = rest.trimStart();
		if (rest.startsWith("{") && rest.includes("}")) {
			const close = rest.indexOf("}");
			modifiers.storyline = rest.slice(1, close).trim() || undefined;
			rest = rest.slice(close + 1);
			continue;
		}
		const priority = withPriority ? PRIORITY_RE.exec(rest) : null;
		if (priority) {
			modifiers.priority = parseInt(priority[1], 10);
			rest = rest.slice(priority[0].length);
			continue;
		}
		// One color each; a further #word is text (e.g. a tag).
		const color = modifiers.color ? null : readColor(rest, isColor);
		if (!color) return { modifiers, rest };
		modifiers.color = color.color;
		rest = color.rest;
	}
}

/** Parses `[start~end]`; returns an error message if it isn't one or two valid dates. */
function parseRange(text: string): { start: TimelineDate; end?: TimelineDate } | string {
	const dates = text.split("~");
	if (dates.length > 2) return "Use a single ~ between the start and end date.";
	const start = parseTimelineDate(dates[0]);
	const end = dates.length === 2 ? parseTimelineDate(dates[1]) : undefined;
	if (!start || end === null) return `Invalid date "${text}". ${DATE_FORMAT_HINT}`;
	if (end && end.date.getTime() < start.date.getTime()) return "The end date is before the start date.";
	return { start, end };
}

export function parseTimeline(source: string, options: ParseOptions = {}): ParseResult {
	const isColor = options.isColor ?? defaultIsColor;
	const lines = source.split(/\r?\n/);
	const flags: TimelineFlags = {};
	const storylines = new Map<string, TimelineStoryline>();
	const errors: ParseError[] = [];
	const events: TimelineEvent[] = [];
	const bands: TimelineBand[] = [];
	const markers: TimelineMarker[] = [];
	const fail = (line: number, message: string) => errors.push({ line, text: lines[line].trim(), message });

	for (let line = 0; line < lines.length; line++) {
		const raw = lines[line];
		const text = raw.trim();
		if (!text || text.startsWith("#")) continue;
		if (text.startsWith(">")) {
			const error = parseFlag(text.slice(1).trim(), flags, storylines, isColor);
			if (error) fail(line, error);
			continue;
		}

		const match = LINE_RE.exec(text);
		if (!match) {
			fail(line, "Unrecognised line. Events start with -, bands with @ and markers with =, followed by [date].");
			continue;
		}
		const range = parseRange(match[2]);
		if (typeof range === "string") {
			fail(line, range);
			continue;
		}
		const { start, end } = range;

		if (match[1] === "@") {
			if (!end) {
				fail(line, "A band needs a start and an end date: @ [start~end]");
				continue;
			}
			const rest = match[3].trim();
			const color = readColor(rest, isColor);
			if (!color && rest.startsWith("#")) {
				fail(line, `"${rest.split(/\s/)[0]}" is not a color.`);
				continue;
			}
			const label = collapseSpaces(color ? color.rest : rest);
			bands.push({ start, end, color: color?.color, label: label || undefined });
			continue;
		}

		if (match[1] === "=") {
			if (end) {
				fail(line, "A marker is a single moment: = [date] Label");
				continue;
			}
			const { modifiers, rest } = readModifiers(match[3], isColor, false);
			const label = collapseSpaces(replaceLinksWithDisplay(rest));
			markers.push({ id: `marker-${markers.length}`, at: start, label: label || undefined, ...modifiers });
			if (modifiers.storyline && !storylines.has(modifiers.storyline)) {
				storylines.set(modifiers.storyline, { name: modifiers.storyline });
			}
			continue;
		}

		const { modifiers, rest } = readModifiers(match[3], isColor, true);
		const event: TimelineEvent = {
			id: `event-${events.length}`,
			start,
			end,
			title: "",
			description: "",
			...modifiers,
		};
		if (event.storyline && !storylines.has(event.storyline)) storylines.set(event.storyline, { name: event.storyline });

		const pipe = indexOutsideWikilinks(rest, "|");
		const title = (pipe === -1 ? rest : rest.slice(0, pipe)).trim();
		const descriptionLines = pipe === -1 ? [] : [rest.slice(pipe + 1)];
		// The description continues on the lines below that are indented further than the event,
		// like a Markdown list item. Blank lines between them separate paragraphs.
		const indent = indentOf(raw);
		for (let next = line + 1; next < lines.length; next++) {
			if (!lines[next].trim()) continue;
			if (indentOf(lines[next]) <= indent) break;
			descriptionLines.push(...lines.slice(line + 1, next + 1));
			line = next;
		}
		let description = descriptionLines.join("\n");

		const titleLink = findLinks(title)[0];
		const descriptionLink = titleLink ? undefined : findLinks(description)[0];
		event.link = titleLink ?? descriptionLink;
		// A link in the description is an attachment only; its path isn't shown.
		if (descriptionLink) description = description.replace(descriptionLink.raw, " ");

		event.title = collapseSpaces(replaceLinksWithDisplay(title)) || start.text + (end ? ` ~ ${end.text}` : "");
		event.description = paragraphs(replaceLinksWithDisplay(description));
		events.push(event);
	}

	// A storyline flag for a storyline nothing uses would draw an empty storyline.
	const used = new Set([...events, ...markers].map((item) => item.storyline));
	return {
		events,
		bands,
		markers,
		storylines: [...storylines.values()].filter((storyline) => used.has(storyline.name)),
		flags,
		errors,
	};
}

function collapseSpaces(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

function indentOf(line: string): number {
	return /^\s*/.exec(line)![0].length;
}

/** Normalises description text: paragraphs separated by `\n\n`, lines within them by `\n`. */
function paragraphs(text: string): string {
	return text
		.split(/\n\s*\n/)
		.map((paragraph) => paragraph.split("\n").map(collapseSpaces).filter(Boolean).join("\n"))
		.filter(Boolean)
		.join("\n\n");
}

/** Applies one flag line (without the leading `>`). Returns an error message, if any. */
function parseFlag(
	text: string,
	flags: TimelineFlags,
	storylines: Map<string, TimelineStoryline>,
	isColor: (value: string) => boolean,
): string | null {
	const [, rawName = "", rawValue = ""] = /^(\S+)\s*(.*)$/.exec(text) ?? [];
	const value = rawValue.trim();
	const lower = value.toLowerCase();

	switch (rawName.toUpperCase()) {
		case "HEIGHT": {
			const height = lower === "fill" ? "fill" : parseInt(value, 10);
			if (height !== "fill" && !(height > 0)) return "HEIGHT needs a number of pixels or fill, e.g. > HEIGHT 600";
			flags.height = height;
			return null;
		}

		case "WINDOW": {
			const range = parseRange(value);
			if (typeof range === "string") return `WINDOW: ${range}`;
			if (!range.end || range.end.date.getTime() === range.start.date.getTime()) {
				return "WINDOW needs a start and an end date, e.g. > WINDOW 1900~2000";
			}
			flags.window = { start: range.start, end: range.end };
			return null;
		}

		case "MINIMAP":
			if (lower !== "on" && lower !== "off") return "MINIMAP takes on or off.";
			flags.minimap = lower === "on";
			return null;

		case "DENSITY": {
			const density = parseFloat(value);
			if (!/^\d*\.?\d+$/.test(value) || !(density > 0)) return "DENSITY needs a positive number, e.g. > DENSITY 2";
			flags.density = density;
			return null;
		}

		case "STORYLINE": {
			// > STORYLINE {name} #color
			const match = /^\{([^}]*)\}\s*(.*)$/.exec(value);
			const name = match?.[1].trim();
			const color = match ? readColor(match[2].trim(), isColor) : null;
			if (!name || !color || color.rest.trim()) return "STORYLINE needs a {name} and a color, e.g. > STORYLINE {Europe} #royalblue";
			storylines.set(name, { name, color: color.color });
			return null;
		}

		default:
			return rawName ? `Unknown flag "${rawName}".` : "Empty flag.";
	}
}
