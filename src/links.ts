/** A link in timeline text: `[[note]]`, `![[image.png]]`, `[text](path)`, `![alt](https://…)` or a bare `https://…`. */
export interface ParsedLink {
	/** The link exactly as written. */
	raw: string;
	/** The link target (note path with optional `#subpath`, or URL). */
	target: string;
	/** Text to show in place of the link. */
	display: string;
	/** Whether the target is an external URL rather than a vault path. */
	external: boolean;
	/**
	 * Height in pixels from an embed's size, as in `![[photo.jpg|200]]`, `![[photo.jpg|300x200]]` or
	 * `![alt|200](url)`: the most an image is shown at; a taller one is cropped to it.
	 */
	height?: number;
}

const WIKILINK_RE = /!?\[\[([^\[\]|]+?)(?:\|([^\[\]]*))?\]\]/g;
const MDLINK_RE = /!?\[([^\[\]]*)\]\(\s*(<[^<>]+>|[^()\s]+)(?:\s+"[^"]*")?\s*\)/g;
/** A bare web address. Trailing punctuation is trimmed off separately. */
const BARE_URL_RE = /\bhttps?:\/\/[^\s<>()[\]|]+/g;
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
/** An embed's size: `200` (one number) or `300x200` (width x height). */
const SIZE_RE = /^(\d+)(?:x(\d+))?$/;

export function isExternalTarget(target: string): boolean {
	return SCHEME_RE.test(target) && !/^[a-z]:[\\/]/i.test(target);
}

/** The name Obsidian would show for an unaliased link, e.g. `folder/Note#Heading` → `Note > Heading`. */
function defaultLinkDisplay(target: string): string {
	const hash = target.indexOf("#");
	const path = hash === -1 ? target : target.slice(0, hash);
	const subpath = hash === -1 ? "" : target.slice(hash);
	const name = path.split("/").pop()!.replace(/\.md$/i, "");
	const heading = subpath.replace(/^#\^?/, "").split("#").filter(Boolean).join(" > ");
	if (!name) return heading;
	return heading ? `${name} > ${heading}` : name;
}

export function safeDecode(value: string): string {
	try {
		return decodeURI(value);
	} catch {
		return value;
	}
}

/**
 * Splits an embed's size off its alias or alt text: `200` → no text, height 200; `alt|300x200` →
 * `alt`, height 200. Anything else is all text.
 */
function splitSize(text: string): { text: string; height?: number } {
	const bar = text.lastIndexOf("|");
	const size = SIZE_RE.exec(text.slice(bar + 1).trim());
	if (!size) return { text };
	return { text: bar === -1 ? "" : text.slice(0, bar), height: Number(size[2] ?? size[1]) };
}

/** Finds all links in `text`, in source order. */
export function findLinks(text: string): (ParsedLink & { index: number })[] {
	const links: (ParsedLink & { index: number })[] = [];

	for (const match of text.matchAll(WIKILINK_RE)) {
		const target = match[1].trim();
		// Only embeds have a size, as in Obsidian: `[[Year review|2024]]` shows "2024".
		const { text: alias, height } = match[0].startsWith("!") ? splitSize(match[2] ?? "") : { text: match[2] ?? "" };
		links.push({
			raw: match[0],
			index: match.index!,
			target,
			display: alias.trim() || defaultLinkDisplay(target),
			external: false,
			height,
		});
	}

	for (const match of text.matchAll(MDLINK_RE)) {
		// Skip markdown-looking text inside a wikilink, e.g. `[[a [b](c)]]` (unlikely, but cheap to guard).
		if (links.some((l) => match.index! > l.index && match.index! < l.index + l.raw.length)) continue;
		let target = match[2];
		if (target.startsWith("<")) target = target.slice(1, -1);
		const external = isExternalTarget(target);
		if (!external) target = safeDecode(target);
		const { text: alt, height } = match[0].startsWith("!") ? splitSize(match[1]) : { text: match[1] };
		links.push({
			raw: match[0],
			index: match.index!,
			target,
			display: alt.trim() || (external ? target : defaultLinkDisplay(target)),
			external,
			height,
		});
	}

	for (const match of text.matchAll(BARE_URL_RE)) {
		// The address of a Markdown link isn't a link of its own.
		if (links.some((l) => match.index! >= l.index && match.index! < l.index + l.raw.length)) continue;
		// A sentence ending in a link: the full stop isn't part of it.
		const target = match[0].replace(/[.,;:!?'"]+$/, "");
		links.push({ raw: target, index: match.index!, target, display: target, external: true });
	}

	return links.sort((a, b) => a.index - b.index);
}

/** Replaces every link in `text` with its display text. */
export function replaceLinksWithDisplay(text: string): string {
	let result = "";
	let cursor = 0;
	for (const link of findLinks(text)) {
		result += text.slice(cursor, link.index) + link.display;
		cursor = link.index + link.raw.length;
	}
	return result + text.slice(cursor);
}

/**
 * Returns the index of the first `separator` that is not inside a `[[…]]` wikilink
 * (wikilink aliases use `|` too), or -1.
 */
export function indexOutsideWikilinks(text: string, separator: string): number {
	let depth = 0;
	for (let i = 0; i < text.length; i++) {
		if (text.startsWith("[[", i)) {
			depth++;
			i++;
		} else if (depth > 0 && text.startsWith("]]", i)) {
			depth--;
			i++;
		} else if (depth === 0 && text[i] === separator) {
			return i;
		}
	}
	return -1;
}
