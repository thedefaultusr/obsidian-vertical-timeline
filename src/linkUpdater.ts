/**
 * Obsidian doesn't index links inside code blocks, so it can't update them when a file is renamed.
 * This rewrites links inside timeline code blocks instead.
 */

import { isExternalTarget, safeDecode } from "./links";

/**
 * Given a link path (no `#subpath`), returns the new path to write, or `null` to leave it alone.
 */
export type LinkRewriter = (linkpath: string) => string | null;

const FENCE_RE = /^((?:\s*>)*\s*)(`{3,}|~{3,})\s*([\w-]*)/;
const WIKILINK_RE = /(!?\[\[)([^\[\]|#]*)((?:#[^\[\]|]*)?)((?:\|[^\[\]]*)?\]\])/g;
const MDLINK_RE = /(!?\[[^\[\]]*\]\(\s*)(<[^<>]+>|[^()\s]+)((?:\s+"[^"]*")?\s*\))/g;

/** Rewrites links inside ```language blocks. Returns `null` when nothing changed. */
export function updateLinksInMarkdown(markdown: string, language: string, rewrite: LinkRewriter): string | null {
	const lines = markdown.split("\n");
	let fence: string | null = null;
	let changed = false;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const match = FENCE_RE.exec(line);
		if (fence === null) {
			if (match && match[3].toLowerCase() === language) fence = match[2];
			continue;
		}
		if (match && match[2][0] === fence[0] && match[2].length >= fence.length && !match[3]) {
			fence = null;
			continue;
		}

		const updated = rewriteLine(line, rewrite);
		if (updated !== line) {
			lines[i] = updated;
			changed = true;
		}
	}

	return changed ? lines.join("\n") : null;
}

function rewriteLine(line: string, rewrite: LinkRewriter): string {
	const wikilinks = line.replace(WIKILINK_RE, (whole, open: string, path: string, subpath: string, close: string) => {
		const next = path.trim() ? rewrite(path.trim()) : null;
		return next === null ? whole : `${open}${next}${subpath}${close}`;
	});

	return wikilinks.replace(MDLINK_RE, (whole, open: string, target: string, close: string) => {
		const bracketed = target.startsWith("<");
		const raw = bracketed ? target.slice(1, -1) : target;
		if (isExternalTarget(raw)) return whole;

		const hash = raw.indexOf("#");
		const path = safeDecode(hash === -1 ? raw : raw.slice(0, hash));
		const subpath = hash === -1 ? "" : raw.slice(hash);
		const next = path ? rewrite(path) : null;
		if (next === null) return whole;
		const written = bracketed ? `<${next}${subpath}>` : `${next.replace(/ /g, "%20")}${subpath}`;
		return `${open}${written}${close}`;
	});
}
