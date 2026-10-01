import { App, loadPdfJs, TFile } from "obsidian";

/** Width a page is drawn at, in CSS pixels: about vertical-timeline's widest card. */
const RENDER_WIDTH = 560;
/** Rendered pages kept, so cards scrolling back into view don't draw them again. */
const CACHE_SIZE = 40;

/** Rendered pages as image URLs, least recently used first. */
const cache = new Map<string, Promise<string>>();

/** The page a PDF link points at (`#page=3`), or 1. */
export function pageOf(subpath: string): number {
	const match = /[#&]page=(\d+)/.exec(subpath);
	return match ? Math.max(1, parseInt(match[1], 10)) : 1;
}

/**
 * An image URL of one page of a PDF in the vault. Pages are drawn once with Obsidian's PDF.js and
 * cached until the file changes.
 */
export function renderPdfPage(app: App, file: TFile, page: number): Promise<string> {
	const key = `${file.path}\n${file.stat.mtime}\n${page}`;
	let url = cache.get(key);
	if (url) {
		cache.delete(key); // Most recently used goes last.
	} else {
		url = drawPage(app, file, page);
		url.catch(() => cache.delete(key));
	}
	cache.set(key, url);
	if (cache.size > CACHE_SIZE) {
		const [oldest, old] = cache.entries().next().value!;
		cache.delete(oldest);
		old.then(URL.revokeObjectURL, () => {});
	}
	return url;
}

async function drawPage(app: App, file: TFile, pageNumber: number): Promise<string> {
	const pdfjs = await loadPdfJs();
	const data = await app.vault.readBinary(file);
	// Obsidian bundles its own PDF.js; only APIs every recent version has are used here.
	const task = pdfjs.getDocument({ data: new Uint8Array(data) });
	try {
		const doc = await task.promise;
		const page = await doc.getPage(Math.min(pageNumber, doc.numPages));
		const scale = (RENDER_WIDTH * Math.min(2, window.devicePixelRatio || 1)) / page.getViewport({ scale: 1 }).width;
		const viewport = page.getViewport({ scale });
		const canvas = document.createElement("canvas");
		canvas.width = Math.ceil(viewport.width);
		canvas.height = Math.ceil(viewport.height);
		// Newer PDF.js takes `canvas`, older takes `canvasContext`; each ignores the other.
		await page.render({ canvas, canvasContext: canvas.getContext("2d"), viewport }).promise;
		const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve));
		if (!blob) throw new Error(`Couldn't encode page ${pageNumber} of ${file.path}`);
		return URL.createObjectURL(blob);
	} finally {
		void task.destroy();
	}
}
