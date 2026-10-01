/**
 * The timeline draws on a canvas, which understands CSS color syntax but not `var(--…)`, and knows
 * nothing about the Obsidian theme. This resolves any CSS color (named, hex, rgb/hsl/oklch,
 * color-mix, theme variables…) in the context of the timeline element to concrete RGBA.
 */

type RGBA = [number, number, number, number];

export class ColorResolver {
	private readonly probe: HTMLElement;
	private readonly context: CanvasRenderingContext2D | null;
	private readonly cache = new Map<string, RGBA | null>();

	constructor(host: HTMLElement) {
		this.probe = host.createSpan({ cls: "vtl-color-probe" });
		const canvas = host.ownerDocument.createElement("canvas");
		canvas.width = canvas.height = 1;
		this.context = canvas.getContext("2d", { willReadFrequently: true });
	}

	/** Returns the color as RGBA, or `null` if the browser doesn't understand it. */
	rgba(value: string): RGBA | null {
		const cached = this.cache.get(value);
		if (cached !== undefined) return cached;

		let result: RGBA | null = null;
		this.probe.style.color = "";
		this.probe.style.color = value;
		if (this.probe.style.color && this.context) {
			const computed = getComputedStyle(this.probe).color;
			const ctx = this.context;
			ctx.clearRect(0, 0, 1, 1);
			ctx.fillStyle = "#000";
			ctx.fillStyle = computed;
			ctx.fillRect(0, 0, 1, 1);
			const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
			result = [r, g, b, a / 255];
		}
		this.cache.set(value, result);
		return result;
	}

	/** Resolves to an `rgba(…)` string the canvas can use, falling back when the value is invalid. */
	css(value: string | undefined, fallback: string, alpha?: number): string {
		const rgba = (value && this.rgba(value)) || this.rgba(fallback);
		if (!rgba) return fallback;
		const [r, g, b, a] = rgba;
		return `rgba(${r}, ${g}, ${b}, ${alpha === undefined ? a : a * alpha})`;
	}

	/** Reads a computed font property of a CSS variable, e.g. `var(--font-interface)`. */
	fontFamily(value: string): string {
		this.probe.style.fontFamily = value;
		return getComputedStyle(this.probe).fontFamily;
	}
}
