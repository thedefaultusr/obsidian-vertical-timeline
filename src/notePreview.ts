import { App, Component, MarkdownRenderer, resolveSubpath, TFile } from "obsidian";

/** Class of the note preview inside a card; timelines inside it aren't rendered (see TimelineBlock). */
export const NOTE_PREVIEW_CLASS = "vtl-card-note";

/** Most of a note worth rendering: cards clip previews to a few lines anyway. */
const MAX_PREVIEW_CHARS = 3000;

/** The part of a note a link points at: its `#heading` or `#^block`, or the whole note without frontmatter. */
async function readExcerpt(app: App, file: TFile, subpath: string): Promise<string> {
	let markdown = await app.vault.cachedRead(file);
	const cache = app.metadataCache.getFileCache(file);
	const section = subpath && cache ? resolveSubpath(cache, subpath) : null;
	if (section) {
		markdown = markdown.slice(section.start.offset, section.end?.offset ?? undefined);
	} else if (cache?.frontmatterPosition) {
		markdown = markdown.slice(cache.frontmatterPosition.end.offset);
	}
	markdown = markdown.trim();
	return markdown.length > MAX_PREVIEW_CHARS ? `${markdown.slice(0, MAX_PREVIEW_CHARS)}…` : markdown;
}

/**
 * Renders a preview of `file` into `el`. Cards are mounted and unmounted as the timeline scrolls,
 * so this returns a cleanup that also stops a render still in progress.
 */
export function renderNotePreview(
	app: App,
	el: HTMLElement,
	file: TFile,
	subpath: string,
	openLink: (linktext: string, sourcePath: string, event: MouseEvent) => void,
): () => void {
	const component = new Component();
	component.load();
	let cancelled = false;

	void (async () => {
		const markdown = await readExcerpt(app, file, subpath);
		if (cancelled) return;
		if (!markdown) {
			el.createDiv({ cls: "vtl-card-empty", text: "This note is empty." });
			return;
		}
		await MarkdownRenderer.render(app, markdown, el, file.path, component);
		if (cancelled) return;
		// Rendered outside a note view, internal links have no click handler of their own.
		el.querySelectorAll<HTMLAnchorElement>("a.internal-link").forEach((a) => {
			a.addEventListener("click", (event) => {
				event.preventDefault();
				event.stopPropagation();
				const href = a.getAttribute("data-href") ?? a.getAttribute("href");
				if (href) openLink(href, file.path, event);
			});
		});
	})();

	return () => {
		cancelled = true;
		component.unload();
	};
}
