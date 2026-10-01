import {
	VerticalTimeline,
	type CardLod,
	type TimelineItem,
	type TimelineTheme,
} from "@defaultusr/vertical-timeline";
import { App, MarkdownRenderChild, moment, setIcon, setTooltip } from "obsidian";
import { Attachment, AttachmentKind, openAttachment, paneTypeForEvent, resolveAttachment } from "./attachments";
import { ColorResolver } from "./colors";
import { formatTimelineRange, type TimelineDate } from "./dates";
import { NOTE_PREVIEW_CLASS, renderNotePreview } from "./notePreview";
import { pageOf, renderPdfPage } from "./pdfPreview";
import { parseTimeline, type ParseResult, type TimelineEvent } from "./parser";
import type { TimelineSettings } from "./settings";

export interface TimelineHost {
	app: App;
	settings: TimelineSettings;
	addBlock(block: TimelineBlock): void;
	removeBlock(block: TimelineBlock): void;
}

const ATTACHMENT_ICONS: Record<AttachmentKind, string> = {
	note: "file-text",
	image: "image",
	pdf: "file-type",
	youtube: "play-circle",
	file: "paperclip",
	url: "globe",
};

/** Opacity of bands, unless their color has its own alpha. */
const BAND_OPACITY = 0.15;

/**
 * Card height guesses, so the first layout (and when vertical-timeline reveals each card) is close
 * to the measured one: a card with one line of description, plus what its attachment shows. Media
 * (an image, video or PDF page) is 16:9 at a typical card width.
 */
const ESTIMATED_HEIGHT = { text: 72, media: 300, note: 250 };
/** Extra height per description line beyond the first, and per paragraph break. */
const LINE_HEIGHT = 19;
const PARAGRAPH_GAP = 6;
/** Characters that fit on a line of a typical card. */
const LINE_CHARS = 60;

/** Space left around a `> HEIGHT fill` timeline, so the note's edges stay visible. */
const FILL_MARGIN = 48;
const MIN_FILL_HEIGHT = 200;

const MINIMAP_WIDTH = 48;

/** Space between the toolbar and Obsidian's "edit source" button, in pixels. */
const TOOLBAR_GAP = 4;

/** Renders one timeline code block and owns its vertical-timeline instance. */
export class TimelineBlock extends MarkdownRenderChild {
	private readonly result: ParseResult;
	private timeline: VerticalTimeline | null = null;
	/** Events by item id, with their attachment. */
	private readonly events = new Map<string, { event: TimelineEvent; attachment: Attachment | null }>();
	/** Stops waiting for the block to be attached to the document. */
	private stopWaiting: (() => void) | null = null;
	/** Undoes what the current timeline set up outside itself. */
	private readonly teardown: (() => void)[] = [];
	private fullscreenButton: HTMLElement | null = null;

	constructor(
		private readonly host: TimelineHost,
		containerEl: HTMLElement,
		source: string,
		private readonly sourcePath: string,
		/** Line of the opening fence in the note, for error messages. */
		private readonly firstLine: number | null,
	) {
		super(containerEl);
		this.result = parseTimeline(source);
	}

	onload(): void {
		this.containerEl.addClass("vertical-timeline");
		this.host.addBlock(this);
		this.render();
		// Canvas colors are resolved once, so redraw when the theme or accent color changes.
		this.registerEvent(this.host.app.workspace.on("css-change", () => this.render()));
		this.registerDomEvent(this.containerEl.ownerDocument, "fullscreenchange", () => this.updateFullscreenButton());
	}

	onunload(): void {
		this.host.removeBlock(this);
		this.destroyTimeline();
	}

	/** Rebuilds the timeline, keeping the visible range. Called for theme and settings changes. */
	render(): void {
		// Reading view runs code block processors before the element is in the document. Theme colors
		// and sizes can only be read once it is, so wait for that.
		// (Obsidian's `onNodeInserted` isn't reliable here: it never fires for Live Preview widgets.)
		if (!this.containerEl.isConnected) {
			this.waitForConnection();
			return;
		}

		const viewport = this.timeline?.viewport;
		const range: [number, number] | null = viewport ? [viewport.t0, viewport.t1] : null;
		this.destroyTimeline();
		this.containerEl.empty();

		if (this.containerEl.closest(`.${NOTE_PREVIEW_CLASS}`)) {
			// A card previewing a note that contains a timeline would otherwise nest timelines endlessly.
			this.containerEl.createDiv({ cls: "vtl-empty", text: "Timeline (not shown in previews)" });
			return;
		}
		if (!this.result.events.length && !this.result.bands.length && !this.result.markers.length) {
			this.containerEl.createDiv({
				cls: "vtl-empty",
				text: "This timeline has no events yet. Add one like: - [2024-05-01] Something happened",
			});
		} else {
			this.createTimeline(range);
		}
		if (this.result.errors.length) this.renderErrors();
	}

	/** Checks once per frame for the block to be attached, then renders. Cancelled on unload. */
	private waitForConnection(): void {
		if (this.stopWaiting) return;
		const frame = window.requestAnimationFrame(() => {
			this.stopWaiting = null;
			if (this.containerEl.isConnected) this.render();
			else this.waitForConnection();
		});
		this.stopWaiting = () => window.cancelAnimationFrame(frame);
	}

	private destroyTimeline(): void {
		this.stopWaiting?.();
		this.stopWaiting = null;
		this.teardown.splice(0).forEach((undo) => undo());
		this.fullscreenButton = null;
		this.timeline?.destroy();
		this.timeline = null;
	}

	private createTimeline(initialRange: [number, number] | null): void {
		const { app, settings } = this.host;
		const { flags } = this.result;
		const doc = this.containerEl.ownerDocument;

		// The canvas can't use `var(--…)`, so every color is resolved against the theme first. The
		// probe element lives in the container, so it's cleaned up by the next `render()`.
		const colors = new ColorResolver(this.containerEl);
		const theme = canvasTheme(colors, this.containerEl);
		// Uncolored events are left to vertical-timeline: their storyline's color, then the accent color.
		const resolve = (color: string | undefined) => (color ? colors.css(color, theme.item) : undefined);

		const frame = this.containerEl.createDiv({ cls: "vtl-frame" });
		const height = flags.height ?? settings.height;
		if (height === "fill") this.fillNoteHeight(frame);
		else frame.style.height = `${height}px`;
		const showMinimap = flags.minimap ?? settings.showMinimap;
		frame.toggleClass("vtl-no-minimap", !showMinimap);

		const items: TimelineItem[] = [];
		this.events.clear();
		for (const event of this.result.events) {
			const attachment = event.link ? resolveAttachment(app, event.link, this.sourcePath) : null;
			this.events.set(event.id, { event, attachment });
			items.push({
				id: event.id,
				title: event.title,
				start: event.start.date,
				end: event.end?.date,
				storyline: event.storyline,
				color: resolve(event.color),
				priority: event.priority,
				estimatedHeight: estimatedHeight(event.description, this.cardPreview(attachment), this.imageMaxHeight(attachment)),
			});
		}

		const timeline = new VerticalTimeline(frame, {
			items,
			storylines: this.result.storylines.map(({ name, color }) => ({ id: name, title: name, color: resolve(color) })),
			bands: this.result.bands.map((band) => {
				const color = resolve(band.color) ?? theme.item;
				// A color with its own alpha (`#rgb(255 0 0 / 40%)`) keeps it; others are made translucent.
				const opaque = (colors.rgba(color)?.[3] ?? 1) === 1;
				return {
					start: band.start.date,
					end: band.end.date,
					color: opaque ? colors.css(color, color, BAND_OPACITY) : color,
					label: band.label,
				};
			}),
			markers: this.result.markers.map(({ id, at, label, storyline, color }) => ({
				id,
				at: at.date,
				label,
				storyline,
				color: resolve(color),
			})),
			renderCard: (item, el, lod) => this.renderCard(item.id, el, lod),
			theme,
			colorScheme: doc.body.hasClass("theme-dark") ? "dark" : "light",
			// Axis labels in Obsidian's language, like the card dates.
			locale: moment.locale(),
			minimapWidth: showMinimap ? MINIMAP_WIDTH : 0,
			cardDensity: flags.density ?? settings.density,
			estimatedFullHeight: ESTIMATED_HEIGHT.text,
		});
		this.timeline = timeline;
		copyLibraryStyles(doc);

		const [start, end] = initialRange ?? this.initialRange();
		timeline.setWindow(start, end);

		// Obsidian shows a tooltip for anything with an aria-label, so label the timeline indirectly.
		const label = frame.createSpan({ cls: "vtl-sr-only", text: "Timeline" });
		label.id = `vtl-label-${Math.random().toString(36).slice(2)}`;
		frame.querySelector(".vt-root")?.setAttribute("aria-labelledby", label.id);

		// Clicking a marker's label zooms in around it, as far as its date is precise.
		timeline.on("markerclick", (id) => {
			const marker = this.result.markers.find((m) => m.id === id);
			if (!marker) return;
			const at = marker.at.date.getTime();
			const padding = singleDatePadding(marker.at);
			timeline.setWindow(at - padding, at + padding);
		});

		this.chainWheelToNote(frame, timeline);
		this.renderToolbar(frame);
	}

	/** `> HEIGHT fill`: as tall as the visible part of the note, following the pane as it's resized. */
	private fillNoteHeight(frame: HTMLElement): void {
		const scroller = this.containerEl.closest<HTMLElement>(".markdown-preview-view, .cm-scroller");
		const win = this.containerEl.ownerDocument.defaultView ?? window;
		const fit = () => {
			const visible = scroller ? scroller.clientHeight : win.innerHeight;
			frame.style.height = `${Math.max(MIN_FILL_HEIGHT, visible - FILL_MARGIN)}px`;
		};
		fit();
		if (scroller) {
			const observer = new ResizeObserver(fit);
			observer.observe(scroller);
			this.teardown.push(() => observer.disconnect());
		} else {
			win.addEventListener("resize", fit);
			this.teardown.push(() => win.removeEventListener("resize", fit));
		}
	}

	/** What an event's full card shows besides its text, if anything. */
	private cardPreview(attachment: Attachment | null): CardPreview | null {
		const { settings } = this.host;
		if (attachment?.kind === "image" && attachment.src && settings.showImages) return "image";
		if (attachment?.kind === "note" && attachment.file && settings.showNotePreviews) return "note";
		if (attachment?.kind === "youtube" && settings.showVideos) return "video";
		if (attachment?.kind === "pdf" && attachment.file && settings.showPdfPreviews) return "pdf";
		return null;
	}

	/** `> WINDOW`, or all events, bands and markers plus a little padding. */
	private initialRange(): [number, number] {
		const { window: initial } = this.result.flags;
		if (initial) return [initial.start.date.getTime(), initial.end.date.getTime()];

		let min = Infinity;
		let max = -Infinity;
		const { events, bands, markers } = this.result;
		const dated: { start: TimelineDate; end?: TimelineDate }[] = [
			...events,
			...bands,
			...markers.map(({ at }) => ({ start: at })),
		];
		for (const { start, end } of dated) {
			min = Math.min(min, start.date.getTime());
			max = Math.max(max, (end ?? start).date.getTime());
		}
		const padding = max > min ? (max - min) * 0.05 : singleDatePadding(dated[0].start);
		return [min - padding, max + padding];
	}

	private renderCard(id: string, el: HTMLElement, lod: CardLod): (() => void) | void {
		const rendered = this.events.get(id);
		if (!rendered) return;
		const { event, attachment } = rendered;
		const preview = lod === "full" ? this.cardPreview(attachment) : null;

		// An image, video or PDF page fills the top of the card, above its text.
		if (preview && preview !== "note") {
			el.addClass("vtl-card--media");
			const media = el.createDiv({ cls: "vtl-card-media" });
			if (preview === "image") this.renderImage(media, attachment!, () => el.removeClass("vtl-card--media"));
			else if (preview === "video") this.renderVideo(media, attachment!, event.title);
			else this.renderPdfPage(media, attachment!);
		}

		if (lod === "full") {
			el.createDiv({
				cls: "vt-card__date",
				text: formatTimelineRange(event.start, event.end, moment.locale()),
			});
		}
		const title = el.createDiv({ cls: "vt-card__title" });
		// Only a full card's title is a link. A compact card is mostly title, and vertical-timeline
		// leaves clicks on links alone, so a link there would open the attachment instead of
		// letting the click select the event and expand its card.
		let titleEl: HTMLElement = title;
		if (attachment && lod === "full") {
			const link = title.createEl("a", { cls: "vtl-card-link", href: attachment.link.target });
			link.toggleClass("is-unresolved", !attachment.link.external && !attachment.file);
			if (attachment.kind !== "note") setTooltip(link, attachment.name);
			const open = (e: MouseEvent) => {
				e.preventDefault();
				e.stopPropagation();
				void openAttachment(this.host.app, attachment, this.sourcePath, paneTypeForEvent(e));
			};
			link.addEventListener("click", open);
			link.addEventListener("auxclick", (e) => e.button === 1 && open(e));
			titleEl = link;
		}
		if (attachment && this.host.settings.showAttachmentIcons) {
			setIcon(titleEl.createSpan({ cls: "vtl-card-icon" }), ATTACHMENT_ICONS[attachment.kind]);
		}
		titleEl.createSpan({ text: event.title });
		if (lod === "full" && event.description) {
			const description = el.createDiv({ cls: "vtl-card-description" });
			for (const paragraph of event.description.split("\n\n")) description.createEl("p", { text: paragraph });
		}

		if (preview !== "note") return;
		const { app } = this.host;
		const previewEl = el.createDiv({ cls: `${NOTE_PREVIEW_CLASS} markdown-rendered` });
		return renderNotePreview(app, previewEl, attachment!.file!, attachment!.subpath, (linktext, sourcePath, e) => {
			void app.workspace.openLinkText(linktext, sourcePath, paneTypeForEvent(e));
		});
	}

	/** The most an image is shown at, in pixels: its link's size, else the setting. `undefined`: no limit. */
	private imageMaxHeight(attachment: Attachment | null): number | undefined {
		return attachment?.link.height ?? (this.host.settings.imageMaxHeight || undefined);
	}

	/**
	 * A linked image, at the card's full width and its own height, up to its maximum height; a taller
	 * image is cropped to it, keeping its middle. One that can't be loaded is removed, with `onError`
	 * undoing the card's media layout.
	 */
	private renderImage(media: HTMLElement, attachment: Attachment, onError: () => void): void {
		const maxHeight = this.imageMaxHeight(attachment);
		media.addClass("vtl-card-media--image");
		if (maxHeight) media.style.setProperty("--vtl-image-max-height", `${maxHeight}px`);
		media.createEl("img", { attr: { src: attachment.src!, alt: "" } }).addEventListener("error", () => {
			media.remove();
			onError();
		});
	}

	/** A YouTube player. It's created and destroyed with the card, so it stops when the card scrolls away. */
	private renderVideo(media: HTMLElement, attachment: Attachment, title: string): void {
		media.createEl("iframe", {
			attr: {
				src: attachment.src!,
				title,
				loading: "lazy",
				allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
				referrerpolicy: "strict-origin-when-cross-origin",
				allowfullscreen: "",
			},
		});
	}

	/** The linked page of a PDF, drawn in the background; its top shows. */
	private renderPdfPage(media: HTMLElement, attachment: Attachment): void {
		media.addClass("vtl-card-media--pdf");
		// If the card is unmounted before the page is drawn, this fills a detached element: harmless.
		renderPdfPage(this.host.app, attachment.file!, pageOf(attachment.subpath)).then(
			(src) => media.createEl("img", { attr: { src, alt: "" } }),
			(error: unknown) => {
				console.error("Vertical Timeline: couldn't draw", attachment.file!.path, error);
				media.createDiv({ cls: "vtl-card-empty", text: `Couldn't show ${attachment.name}` });
			},
		);
	}

	/** Fit and full-screen buttons, top right. */
	private renderToolbar(frame: HTMLElement): void {
		const toolbar = frame.createDiv({ cls: "vtl-toolbar" });
		// In Live Preview, Obsidian puts its "edit source" button in the block's top-right corner.
		// Its size depends on the theme, so measure it when the toolbar is about to show.
		frame.addEventListener("mouseenter", () => moveLeftOfEditButton(toolbar, frame));

		const fit = toolbar.createEl("button", { cls: "clickable-icon" });
		setIcon(fit, "scan");
		setTooltip(fit, "Fit all events (Ctrl/Cmd + scroll to zoom)");
		fit.addEventListener("click", () => this.timeline?.setWindow(...this.initialRange()));

		// Not every platform allows it (iPhone only allows videos to go full screen).
		const doc = this.containerEl.ownerDocument;
		if (!doc.fullscreenEnabled) return;
		this.fullscreenButton = toolbar.createEl("button", { cls: "clickable-icon" });
		this.updateFullscreenButton();
		this.fullscreenButton.addEventListener("click", () => {
			if (doc.fullscreenElement === this.containerEl) void doc.exitFullscreen();
			else void this.containerEl.requestFullscreen();
		});
	}

	private updateFullscreenButton(): void {
		const button = this.fullscreenButton;
		if (!button) return;
		const fullscreen = this.containerEl.ownerDocument.fullscreenElement === this.containerEl;
		setIcon(button, fullscreen ? "minimize-2" : "maximize-2");
		setTooltip(button, fullscreen ? "Exit full screen (Esc)" : "Full screen");
	}

	/**
	 * vertical-timeline pans on every wheel event, which would trap the note's scrolling while the
	 * pointer is over a timeline. Once the timeline can't scroll further that way, the note scrolls.
	 */
	private chainWheelToNote(frame: HTMLElement, timeline: VerticalTimeline): void {
		frame.addEventListener(
			"wheel",
			(event) => {
				if (event.ctrlKey || event.metaKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
				// Try the pan and undo it: the viewport clamps to its limits.
				const { viewport } = timeline;
				const before = viewport.t0;
				const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.height : 1;
				viewport.panBy(event.deltaY * unit);
				const canPan = viewport.t0 !== before;
				viewport.t0 = before;
				// Keeping the event from vertical-timeline lets the note scroll instead.
				if (!canPan) event.stopPropagation();
			},
			{ capture: true },
		);
	}

	private renderErrors(): void {
		const { errors } = this.result;
		const details = this.containerEl.createEl("details", { cls: "vtl-errors" });
		details.createEl("summary", { text: `${errors.length} line${errors.length === 1 ? "" : "s"} couldn't be read` });
		const list = details.createEl("ul");
		for (const error of errors) {
			const item = list.createEl("li");
			const line = this.firstLine === null ? error.line + 1 : this.firstLine + error.line + 2;
			item.createSpan({ cls: "vtl-error-line", text: `Line ${line}: ` });
			item.createSpan({ text: error.message });
			item.createEl("code", { text: error.text });
		}
	}
}

type CardPreview = "image" | "note" | "video" | "pdf";

/** A guess at a full card's height, from its description and what its attachment shows. */
function estimatedHeight(description: string, preview: CardPreview | null, mediaHeight?: number): number {
	const paragraphs = description ? description.split("\n\n") : [];
	const lines = paragraphs.flatMap((p) => p.split("\n")).reduce((n, line) => n + Math.ceil(line.length / LINE_CHARS), 0);
	const extra = Math.max(0, lines - 1) * LINE_HEIGHT + Math.max(0, paragraphs.length - 1) * PARAGRAPH_GAP;
	const base = !preview
		? ESTIMATED_HEIGHT.text
		: preview === "note"
			? ESTIMATED_HEIGHT.note
			: preview === "image" && mediaHeight
				? ESTIMATED_HEIGHT.text + Math.min(mediaHeight, ESTIMATED_HEIGHT.media - ESTIMATED_HEIGHT.text)
				: ESTIMATED_HEIGHT.media;
	return base + extra;
}

/** vertical-timeline's canvas colors, from the Obsidian theme. */
function canvasTheme(colors: ColorResolver, el: HTMLElement): TimelineTheme {
	const variable = (name: string, fallback: string, alpha?: number) => colors.css(`var(${name})`, fallback, alpha);
	return {
		background: variable("--background-primary", "#fff"),
		axisText: variable("--text-muted", "#666"),
		gridMajor: variable("--background-modifier-border", "#ddd"),
		gridMinor: variable("--background-modifier-border", "#ddd", 0.45),
		track: variable("--background-modifier-border-hover", "#bbb"),
		item: variable("--interactive-accent", "#7c3aed"),
		minimapDensity: variable("--interactive-accent", "#7c3aed", 0.5),
		minimapViewport: variable("--interactive-accent", "#7c3aed", 0.12),
		font: colors.fontFamily("var(--font-interface)") || getComputedStyle(el).fontFamily,
	};
}

/**
 * vertical-timeline injects its base styles into the main window's document. Timelines in a popout
 * window need a copy in that window's document.
 */
function copyLibraryStyles(doc: Document): void {
	if (doc === document || doc.head.querySelector("style[data-vertical-timeline]")) return;
	const style = document.head.querySelector("style[data-vertical-timeline]");
	if (style) doc.head.prepend(style.cloneNode(true));
}

/** Shifts `toolbar` left of Obsidian's "edit source" button when the two would overlap. */
function moveLeftOfEditButton(toolbar: HTMLElement, frame: HTMLElement): void {
	toolbar.style.right = "";
	const edit = frame.closest(".cm-embed-block")?.querySelector(".edit-block-button");
	if (!edit) return;
	const editRect = edit.getBoundingClientRect();
	const toolbarRect = toolbar.getBoundingClientRect();
	const overlaps =
		editRect.width > 0 &&
		editRect.left < toolbarRect.right &&
		editRect.bottom > toolbarRect.top &&
		editRect.top < toolbarRect.bottom;
	if (overlaps) toolbar.style.right = `${frame.getBoundingClientRect().right - editRect.left + TOOLBAR_GAP}px`;
}

/** How much room to leave around a timeline with a single date, based on how precise it is. */
function singleDatePadding(date: TimelineDate): number {
	const DAY = 24 * 60 * 60 * 1000;
	switch (date.precision) {
		case "year":
			return 365 * DAY;
		case "month":
			return 30 * DAY;
		case "day":
			return 3 * DAY;
		case "hour":
			return DAY / 4;
		case "minute":
			return DAY / 48;
		default:
			return 60 * 1000;
	}
}
