import { debounce, Editor, Plugin, TAbstractFile, TFile } from "obsidian";
import { updateLinksInMarkdown } from "./linkUpdater";
import { DEFAULT_SETTINGS, TimelineSettings, TimelineSettingTab } from "./settings";
import { TimelineBlock, TimelineHost } from "./timelineBlock";

/** The code block language: ```vtimeline */
const LANGUAGE = "vtimeline";

const EXAMPLE = `\`\`\`${LANGUAGE}
> STORYLINE {Job} #royalblue

@ [2024-01~2024-06] #royalblue Project Atlas
- [2024-01-08~2024-02-20] {Job} !2 Planning | [[Atlas]]
- [2024-02-14] #seagreen {Home} Moved flats | ![[flat.jpg]]
- [2024-03-01~2024-03-20] {Job} Contract | [[contract.pdf]]
- [2024-04-10] {Home} Birthday
- [2024-05-01] !3 Launch
\`\`\``;

export default class VerticalTimelinePlugin extends Plugin implements TimelineHost {
	settings: TimelineSettings = { ...DEFAULT_SETTINGS };
	private readonly blocks = new Set<TimelineBlock>();
	/** Files renamed since the last link update: old path → file. */
	private readonly renames = new Map<string, TFile>();
	// Moving a folder renames every file in it; handle them all in one pass over the vault.
	private readonly updateRenamedLinksSoon = debounce(() => void this.updateRenamedLinks(), 300, true);

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerMarkdownCodeBlockProcessor(LANGUAGE, (source, el, ctx) => {
			const section = ctx.getSectionInfo(el);
			ctx.addChild(new TimelineBlock(this, el, source, ctx.sourcePath, section ? section.lineStart : null));
		});

		this.addSettingTab(new TimelineSettingTab(this.app, this));

		this.addCommand({
			id: "insert-timeline",
			name: "Insert timeline",
			editorCallback: (editor: Editor) => editor.replaceSelection(`${EXAMPLE}\n`),
		});
		this.addCommand({
			id: "insert-empty-timeline",
			name: "Insert empty timeline",
			editorCallback: (editor: Editor) => {
				const cursor = editor.getCursor();
				editor.replaceSelection(`\`\`\`${LANGUAGE}\n\n\`\`\`\n`);
				editor.setCursor({ line: cursor.line + 1, ch: 0 });
			},
		});

		this.registerEvent(this.app.vault.on("rename", (file, oldPath) => this.onRename(file, oldPath)));
		this.register(() => this.updateRenamedLinksSoon.cancel());
	}

	addBlock(block: TimelineBlock): void {
		this.blocks.add(block);
	}

	removeBlock(block: TimelineBlock): void {
		this.blocks.delete(block);
	}

	async loadSettings(): Promise<void> {
		this.settings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) as Partial<TimelineSettings> | null) };
	}

	async saveSettings(redraw: boolean): Promise<void> {
		await this.saveData(this.settings);
		if (redraw) this.blocks.forEach((block) => block.render());
	}

	private onRename(file: TAbstractFile, oldPath: string): void {
		if (!(file instanceof TFile) || !this.settings.updateLinksOnRename) return;
		this.renames.set(oldPath, file);
		this.updateRenamedLinksSoon();
	}

	/** Keeps links in timeline blocks pointing at renamed/moved files. */
	private async updateRenamedLinks(): Promise<void> {
		const renamed = [...this.renames].map(([oldPath, file]) => ({ oldPath, oldWithoutMd: oldPath.replace(/\.md$/i, ""), file }));
		this.renames.clear();
		const { vault, metadataCache } = this.app;

		for (const note of vault.getMarkdownFiles()) {
			const content = await vault.cachedRead(note);
			if (!content.includes(LANGUAGE)) continue;

			const rewrite = (linkpath: string): string | null => {
				const withoutMd = linkpath.replace(/\.md$/i, "");
				const match = renamed.find(
					({ oldPath, oldWithoutMd }) =>
						linkpath === oldPath || withoutMd === oldWithoutMd || oldWithoutMd.endsWith(`/${withoutMd}`),
				);
				// If the link still resolves (e.g. the file only moved folders), it's fine as it is.
				if (!match || metadataCache.getFirstLinkpathDest(linkpath, note.path)) return null;

				const { file } = match;
				const keepMdExtension = /\.md$/i.test(linkpath);
				if (linkpath.includes("/")) return keepMdExtension ? file.path : file.path.replace(/\.md$/i, "");
				return metadataCache.fileToLinktext(file, note.path, !keepMdExtension);
			};

			if (updateLinksInMarkdown(content, LANGUAGE, rewrite) === null) continue;
			await vault.process(note, (data) => updateLinksInMarkdown(data, LANGUAGE, rewrite) ?? data);
		}
	}
}
