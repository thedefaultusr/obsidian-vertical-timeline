import { App, PluginSettingTab, Setting } from "obsidian";
import type VerticalTimelinePlugin from "./main";

export interface TimelineSettings {
	height: number;
	showMinimap: boolean;
	density: number;
	showImages: boolean;
	showNotePreviews: boolean;
	showAttachmentIcons: boolean;
	updateLinksOnRename: boolean;
}

type BooleanSetting = { [K in keyof TimelineSettings]: TimelineSettings[K] extends boolean ? K : never }[keyof TimelineSettings];

export const DEFAULT_SETTINGS: TimelineSettings = {
	height: 500,
	showMinimap: true,
	density: 1.25,
	showImages: true,
	showNotePreviews: true,
	showAttachmentIcons: true,
	updateLinksOnRename: true,
};

/** The only setting that doesn't change how timelines are drawn. */
const NON_VISUAL_SETTINGS = new Set<keyof TimelineSettings>(["updateLinksOnRename"]);

export class TimelineSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: VerticalTimelinePlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Height")
			.setDesc("Height of a timeline in pixels, for timelines without a HEIGHT flag.")
			.addText((text) =>
				text
					.setPlaceholder(String(DEFAULT_SETTINGS.height))
					.setValue(String(this.plugin.settings.height))
					.onChange((value) => {
						const height = parseInt(value, 10);
						if (height >= 100) void this.save({ height });
					}),
			);

		this.toggle("showMinimap", "Minimap", "For timelines without a MINIMAP flag.");

		new Setting(containerEl)
			.setName("Card density")
			.setDesc(
				"How many cards to show at a given zoom, for timelines without a DENSITY flag. " +
					"Higher shows more cards and lets them push each other further from their dates.",
			)
			.addSlider((slider) =>
				slider
					.setLimits(0.5, 4, 0.25)
					.setDynamicTooltip()
					.setValue(this.plugin.settings.density)
					.onChange((value) => this.save({ density: value })),
			);

		this.toggle(
			"showNotePreviews",
			"Note previews",
			"Show the start of a linked note (or the linked heading or block) in its event's card.",
		);
		this.toggle("showImages", "Image cards", "Show a linked image as the background of its event's card.");
		this.toggle(
			"showAttachmentIcons",
			"Attachment icons",
			"Prefix the titles of events that link to a note, image, file or URL with an icon.",
		);
		this.toggle(
			"updateLinksOnRename",
			"Update links on rename",
			"When a note or file is renamed or moved, update links to it inside timeline blocks.",
		);
	}

	private toggle(key: BooleanSetting, name: string, description: string): void {
		new Setting(this.containerEl)
			.setName(name)
			.setDesc(description)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings[key]).onChange((value) => this.save({ [key]: value })),
			);
	}

	private async save(changes: Partial<TimelineSettings>): Promise<void> {
		Object.assign(this.plugin.settings, changes);
		const redraw = Object.keys(changes).some((key) => !NON_VISUAL_SETTINGS.has(key as keyof TimelineSettings));
		await this.plugin.saveSettings(redraw);
	}
}
