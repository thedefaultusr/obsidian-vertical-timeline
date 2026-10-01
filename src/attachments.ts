import { App, Keymap, Notice, PaneType, parseLinktext, TFile } from "obsidian";
import type { ParsedLink } from "./links";

export type AttachmentKind = "note" | "image" | "file" | "url";

export interface Attachment {
	kind: AttachmentKind;
	link: ParsedLink;
	/** The vault file, when the link resolves to one. */
	file: TFile | null;
	/** Heading / block reference, including the leading `#`. */
	subpath: string;
	/** A `src` usable in an `<img>`, for images. */
	src: string | null;
	/** File name or URL, for display. */
	name: string;
}

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "bmp", "svg", "webp", "avif", "ico", "tif", "tiff"]);
const NOTE_EXTENSIONS = new Set(["md", ""]);

function extensionOf(path: string): string {
	const name = path.split(/[/?#]/).filter(Boolean).pop() ?? "";
	const dot = name.lastIndexOf(".");
	return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** Works out what a link points to: a note, image or other file in the vault, or a URL. */
export function resolveAttachment(app: App, link: ParsedLink, sourcePath: string): Attachment {
	if (link.external) {
		let pathname = link.target;
		try {
			pathname = new URL(link.target).pathname;
		} catch {
			// Not a parseable URL; use the raw target.
		}
		const image = IMAGE_EXTENSIONS.has(extensionOf(pathname));
		return {
			kind: image ? "image" : "url",
			link,
			file: null,
			subpath: "",
			src: image ? link.target : null,
			name: link.target,
		};
	}

	const { path: linkpath, subpath } = parseLinktext(link.target);
	const file = app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
	const extension = file ? file.extension.toLowerCase() : extensionOf(linkpath);
	const kind: AttachmentKind = NOTE_EXTENSIONS.has(extension) ? "note" : IMAGE_EXTENSIONS.has(extension) ? "image" : "file";

	return {
		kind,
		link,
		file,
		subpath,
		src: kind === "image" && file ? app.vault.getResourcePath(file) : null,
		name: file ? file.name : linkpath.split("/").pop() || linkpath,
	};
}

/** Where to open a link for a click, following Obsidian's conventions (Cmd/Ctrl or middle click → new tab…). */
export function paneTypeForEvent(event: MouseEvent | KeyboardEvent | null): PaneType | boolean {
	return event ? Keymap.isModEvent(event) : false;
}

interface AppWithPrivates extends App {
	viewRegistry?: { isExtensionRegistered(extension: string): boolean };
	openWithDefaultApp?(path: string): void;
}

/** Opens an attachment: notes and supported files inside Obsidian, everything else in the system app. */
export async function openAttachment(
	app: App,
	attachment: Attachment,
	sourcePath: string,
	newLeaf: PaneType | boolean = false,
): Promise<void> {
	if (attachment.link.external) {
		window.open(attachment.link.target, "_blank");
		return;
	}

	const privateApp = app as AppWithPrivates;
	const { file } = attachment;

	if (!file) {
		if (attachment.kind === "note") {
			// Same as clicking an unresolved link: Obsidian creates the note.
			await app.workspace.openLinkText(attachment.link.target, sourcePath, newLeaf);
		} else {
			new Notice(`Timeline: "${attachment.name}" was not found in the vault.`);
		}
		return;
	}

	const openable = privateApp.viewRegistry?.isExtensionRegistered(file.extension) ?? true;
	if (!openable && privateApp.openWithDefaultApp) {
		privateApp.openWithDefaultApp(file.path);
		return;
	}
	await app.workspace.openLinkText(attachment.link.target, sourcePath, newLeaf);
}
