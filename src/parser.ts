import { parseTimelineDate, TimelineDate } from "./dates";
import { findLinks, indexOutsideWikilinks, ParsedLink, replaceLinksWithDisplay } from "./links";

/**
 * Parser for the timeline code block language:
 *
 *   - [Date~Date] #color {Storyline} !2 Title | Description   event (the end date is optional)
 *   @ [Date~Date] #color Label                                band: a background range
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

/** A `{Storyline}` used by at least one event. Storylines with a `> STORYLINE` flag come first. */
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
	storylines: TimelineStoryline[];
	flags: TimelineFlags;
	errors: ParseError[];
}

export interface ParseOptions {
	/** Decides whether a string is a valid CSS color. Defaults to `CSS.supports("color", value)`. */
	isColor?: (value: string) => boolean;
}

const LINE_RE = /^([-@])\s*\[([^\]]*)\]\s*(.*)$/;
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
	const fail = (line: number, message: string) => errors.push({ line, text: lines[line].trim(), message });

	lines.forEach((raw, line) => {
		const text = raw.trim();
		if (!text || text.startsWith("#")) return;
		if (text.startsWith(">")) {
			const error = parseFlag(text.slice(1).trim(), flags, storylines, isColor);
			if (error) fail(line, error);
			return;
		}

		const match = LINE_RE.exec(text);
		if (!match) {
			fail(line, "Unrecognised line. Events start with - and bands with @, followed by [date].");
			return;
		}
		const range = parseRange(match[2]);
		if (typeof range === "string") {
			fail(line, range);
			return;
		}
		const { start, end } = range;

		if (match[1] === "@") {
			if (!end) {
				fail(line, "A band needs a start and an end date: @ [start~end]");
				return;
			}
			const rest = match[3].trim();
			const color = readColor(rest, isColor);
			if (!color && rest.startsWith("#")) {
				fail(line, `"${rest.split(/\s/)[0]}" is not a color.`);
				return;
			}
			const label = collapseSpaces(color ? color.rest : rest);
			bands.push({ start, end, color: color?.color, label: label || undefined });
			return;
		}

		const event: TimelineEvent = { id: `event-${events.length}`, start, end, title: "", description: "" };
		let rest = match[3];
		for (;;) {
			rest = rest.trimStart();
			if (rest.startsWith("{") && rest.includes("}")) {
				const close = rest.indexOf("}");
				event.storyline = rest.slice(1, close).trim() || undefined;
				rest = rest.slice(close + 1);
				continue;
			}
			const priority = PRIORITY_RE.exec(rest);
			if (priority) {
				event.priority = parseInt(priority[1], 10);
				rest = rest.slice(priority[0].length);
				continue;
			}
			// One color per event; a further #word is part of the title (e.g. a tag).
			const color = event.color ? null : readColor(rest, isColor);
			if (!color) break;
			event.color = color.color;
			rest = color.rest;
		}
		if (event.storyline && !storylines.has(event.storyline)) storylines.set(event.storyline, { name: event.storyline });

		const pipe = indexOutsideWikilinks(rest, "|");
		const title = (pipe === -1 ? rest : rest.slice(0, pipe)).trim();
		let description = pipe === -1 ? "" : rest.slice(pipe + 1).trim();

		const titleLink = findLinks(title)[0];
		const descriptionLink = titleLink ? undefined : findLinks(description)[0];
		event.link = titleLink ?? descriptionLink;
		// A link in the description is an attachment only; its path isn't shown.
		if (descriptionLink) description = description.replace(descriptionLink.raw, " ");

		event.title = collapseSpaces(replaceLinksWithDisplay(title)) || start.text + (end ? ` ~ ${end.text}` : "");
		event.description = collapseSpaces(replaceLinksWithDisplay(description));
		events.push(event);
	});

	// A storyline flag for a storyline no event uses would draw an empty storyline.
	const used = new Set(events.map((event) => event.storyline));
	return {
		events,
		bands,
		storylines: [...storylines.values()].filter((storyline) => used.has(storyline.name)),
		flags,
		errors,
	};
}

function collapseSpaces(text: string): string {
	return text.replace(/\s+/g, " ").trim();
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
