/** A link found in timeline item text: `[[note]]`, `![[image.png]]`, `[text](path)` or `![alt](https://…)`. */
export interface ParsedLink {
	/** The link exactly as written. */
	raw: string;
	/** The link target (note path with optional `#subpath`, or URL). */
	target: string;
	/** Text to show in place of the link. */
	display: string;
	/** Whether the target is an external URL rather than a vault path. */
	external: boolean;
}

const WIKILINK_RE = /!?\[\[([^\[\]|]+?)(?:\|([^\[\]]*))?\]\]/g;
const MDLINK_RE = /!?\[([^\[\]]*)\]\(\s*(<[^<>]+>|[^()\s]+)(?:\s+"[^"]*")?\s*\)/g;
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

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

/** Finds all links in `text`, in source order. */
export function findLinks(text: string): (ParsedLink & { index: number })[] {
	const links: (ParsedLink & { index: number })[] = [];

	for (const match of text.matchAll(WIKILINK_RE)) {
		const target = match[1].trim();
		const alias = match[2]?.trim();
		links.push({
			raw: match[0],
			index: match.index!,
			target,
			display: alias || defaultLinkDisplay(target),
			external: false,
		});
	}

	for (const match of text.matchAll(MDLINK_RE)) {
		// Skip markdown-looking text inside a wikilink, e.g. `[[a [b](c)]]` (unlikely, but cheap to guard).
		if (links.some((l) => match.index! > l.index && match.index! < l.index + l.raw.length)) continue;
		let target = match[2];
		if (target.startsWith("<")) target = target.slice(1, -1);
		const external = isExternalTarget(target);
		if (!external) target = safeDecode(target);
		links.push({
			raw: match[0],
			index: match.index!,
			target,
			display: match[1].trim() || (external ? target : defaultLinkDisplay(target)),
			external,
		});
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
