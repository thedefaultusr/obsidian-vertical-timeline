// Minimal stand-in for the Obsidian API, enough to run the timeline block in a plain browser page.

type Attrs = { cls?: string | string[]; text?: string; attr?: Record<string, string> };

function applyAttrs(el: HTMLElement, o?: Attrs | string) {
	if (typeof o === "string") o = { cls: o };
	if (!o) return el;
	if (o.cls) el.classList.add(...(Array.isArray(o.cls) ? o.cls : o.cls.split(" ")).filter(Boolean));
	if (o.text !== undefined) el.textContent = o.text;
	if (o.attr) for (const [k, v] of Object.entries(o.attr)) el.setAttribute(k, v);
	return el;
}
const proto = HTMLElement.prototype as any;
proto.createEl = function (tag: string, o?: Attrs) {
	const el = applyAttrs(document.createElement(tag), o);
	this.appendChild(el);
	return el;
};
proto.createDiv = function (o?: Attrs) { return this.createEl("div", o); };
proto.createSpan = function (o?: Attrs) { return this.createEl("span", o); };
proto.empty = function () { this.replaceChildren(); };
proto.addClass = function (...c: string[]) { this.classList.add(...c); };
proto.toggleClass = function (c: string, v: boolean) { this.classList.toggle(c, v); };
proto.hasClass = function (c: string) { return this.classList.contains(c); };
proto.setText = function (t: string) { this.textContent = t; };
proto.setAttr = function (k: string, v: string) { this.setAttribute(k, v); };

export const log: string[] = [];
(window as any).__log = log;

export class Component {
	private cleanups: (() => void)[] = [];
	private children: Component[] = [];
	load() { this.onload(); }
	onload() {}
	onunload() {}
	unload() {
		this.children.forEach((c) => c.unload());
		this.cleanups.forEach((f) => f());
		this.cleanups = [];
		this.onunload();
	}
	register(cb: () => void) { this.cleanups.push(cb); }
	registerEvent(_ref: unknown) {}
	registerDomEvent(el: EventTarget, type: string, cb: EventListener) {
		el.addEventListener(type, cb);
		this.register(() => el.removeEventListener(type, cb));
	}
	addChild<T extends Component>(c: T) { this.children.push(c); c.load(); return c; }
}
export class MarkdownRenderChild extends Component {
	constructor(public containerEl: HTMLElement) { super(); }
}
export class MarkdownRenderer {
	static async render(_app: unknown, markdown: string, el: HTMLElement) {
		await new Promise((r) => setTimeout(r, 30));
		for (const block of markdown.split(/\n{2,}/)) {
			const h = /^(#{1,6})\s+(.*)/.exec(block);
			if (h) el.createEl(`h${h[1].length}`, { text: h[2] });
			else if (/^- /.test(block)) {
				const ul = el.createEl("ul");
				block.split("\n").forEach((l) => ul.createEl("li", { text: l.replace(/^- /, "") }));
			} else {
				const p = el.createEl("p");
				p.innerHTML = block.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, t, a) => `<a class="internal-link" data-href="${t}">${a ?? t}</a>`);
			}
		}
	}
}
export function setIcon(el: HTMLElement, name: string) {
	el.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="3" width="16" height="18" rx="2"/></svg>`;
	el.dataset.icon = name;
}
export function setTooltip(el: HTMLElement, text: string) { el.title = text; }
export class Keymap {
	static isModEvent(e?: MouseEvent | null) { return !!e && (e.metaKey || e.ctrlKey || e.button === 1) ? "tab" : false; }
}
export class Notice { constructor(msg: string) { log.push(`notice: ${msg}`); } }
export function parseLinktext(linktext: string) { const i = linktext.indexOf("#"); return i === -1 ? { path: linktext, subpath: "" } : { path: linktext.slice(0, i), subpath: linktext.slice(i) }; }
export function resolveSubpath() { return null; }
export const moment = { locale: () => "en" };

export class TFile {
	basename: string; extension: string; name: string;
	stat = { size: 0, ctime: 0, mtime: 0 };
	constructor(public path: string, public content = "", public url = "", size = 0) {
		this.name = path.split("/").pop()!;
		const dot = this.name.lastIndexOf(".");
		this.basename = this.name.slice(0, dot);
		this.extension = this.name.slice(dot + 1);
		this.stat.size = size || content.length;
	}
}

export function createApp(files: TFile[]) {
	const byName = (p: string) => files.find((f) => f.path === p || f.path === `${p}.md` || f.basename === p || f.name === p) ?? null;
	return {
		vault: {
			getResourcePath: (f: TFile) => f.url,
			cachedRead: async (f: TFile) => f.content,
		},
		metadataCache: {
			getFirstLinkpathDest: (p: string) => byName(p),
			getFileCache: () => null,
		},
		workspace: {
			on: () => ({}),
			trigger: (name: string, info: { linktext: string }) => { log.push(`${name}: ${info.linktext}`); },
			openLinkText: async (link: string, _src: string, newLeaf: unknown) => { log.push(`open: ${link} newLeaf=${newLeaf}`); },
		},
	};
}

export class PluginSettingTab {}
export class Setting {}
