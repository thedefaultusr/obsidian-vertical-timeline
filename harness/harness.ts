import { createApp, log, TFile } from "obsidian";
import { DEFAULT_SETTINGS } from "../src/settings";
import { TimelineBlock, TimelineHost } from "../src/timelineBlock";

const app = createApp([
	new TFile("Projects/Atlas.md", "# Project Atlas\n\nKick-off with the **whole** team. Budget lives in [[Budget]].\n\n- Scope agreed\n- Owners assigned\n- Risks logged\n\n## Milestones\n\nShip the first prototype by May, then iterate with the pilot customers until the summer.\n\n## Retro\n\nWent well overall."),
	new TFile("flat.jpg", "", "flat.svg"),
	new TFile("contract.pdf", "", "/test-vault/attachments/contract.pdf", 248_512),
]) as any;

const host: TimelineHost = {
	app,
	settings: { ...DEFAULT_SETTINGS, height: 520 },
	addBlock() {},
	removeBlock() {},
};
(window as any).__host = host;

// Many events, to see cards shrink and hide as you zoom out.
const many = Array.from({ length: 300 }, (_, i) => {
	const year = 1800 + Math.floor((i * 7919) % 220);
	const month = 1 + (i % 12);
	return `- [${year}-${String(month).padStart(2, "0")}] ${i % 17 === 0 ? "!5 " : ""}Event ${i}`;
}).join("\n");

const blocks: Record<string, string> = {
	attachments: `> STORYLINE {Job} #royalblue
@ [2024-01~2024-03] #royalblue Project Atlas
@ [2024-04-01~2024-04-15] #rgb(233 49 71 / 25%) Code freeze
- [2024-01-08~2024-02-10] {Job} !2 Planning | [[Atlas]]
- [2024-02-14] #seagreen {Home} Moved flats | new place ![[flat.jpg]]
- [2024-03-01~2024-03-20] {Job} Contract | signed copy [[contract.pdf]]
- [2024-04-10] {Home} Birthday | cake
- [2024-04-20~2024-05-10] #tomato {Home} Trip [link](https://example.com/trip)
- [2024-05-12] #var(--color-purple) {Job} Missing note [[Nope]]
- [2024-02-01] !3 Main-lane event | no storyline, no color`,
	history: `> HEIGHT fill
- [1945-07-17] {Europe} Potsdam Conference | where post-WWII Europe is divided
- [1947-03-12] {USA} Truman Doctrine | committing the U.S. to containing communism
- [1948-06-24~1949-05-12] {Europe} Berlin Blockade | and Airlift
@ [1957~1969] #cyan Space Race
- [1950-06-25~1953-07-27] #firebrick {Asia} Korean War | between North and South Korea
- [1962-10-16] {Cuba} Cuban Missile Crisis
- [1969-07-20] #cyan {USA} Apollo 11 Moon landing
- [1979-12-24~1989-02-15] #firebrick {USSR} Soviet-Afghan War
- [1989-11-09] {Europe} Fall of the Berlin Wall
= [1961-08-13] {Europe} Berlin Wall built
= [1957-10-04] #firebrick Sputnik
= [1991-12-26] End of the USSR`,
	bce: `> MINIMAP off
> HEIGHT 360
> WINDOW -400~600
@ [-300~250] #red Yayoi
- [-100] Introduction of rice cultivation
- [-57] Contact with China
@ [250~538] Kofun
- [369] Envoys to Korea
@ [538] needs an end`,
	bandsOnly: `> HEIGHT 240
@ [1914~1918] #red WWI
@ [1939~1945] #rgb(0 0 255 / 30%) WWII`,
	many: many,
	media: `> HEIGHT 640
- [1969-07-20] #slategray Apollo 11 | The lunar module Eagle lands in the Sea of Tranquility.
  Armstrong steps out six hours later.

  Watch the landing: https://www.youtube.com/watch?v=S9HdPi9Ikhk&t=12s.

  Third paragraph,
  with a line break.
- [1969-07-24] Splashdown | Columbia lands in the Pacific.`,
};
// Same source inside the wrappers Live Preview puts code blocks in (an editable region).
blocks.livePreview = blocks.attachments;
const LIVE_PREVIEW = new Set(["livePreview"]);

const toggle = document.getElementById("blocks")!.createEl("button", { text: "Toggle dark" });
const rendered: TimelineBlock[] = [];
toggle.addEventListener("click", () => {
	document.body.classList.toggle("theme-dark");
	rendered.forEach((block) => block.render());
});

for (const [name, source] of Object.entries(blocks)) {
	const section = document.getElementById("blocks")!.createDiv({ cls: "block" });
	section.createEl("h3", { text: name });
	const el = LIVE_PREVIEW.has(name)
		? section
				.createDiv({ cls: "cm-content", attr: { contenteditable: "true" } })
				.createDiv({ cls: "cm-embed-block", attr: { contenteditable: "false" } })
				.createDiv()
		: section.createDiv();
	const block = new TimelineBlock(host, el, source, "Timelines.md", 10);
	block.load();
	rendered.push(block);
	(window as any)[`__block_${name}`] = block;
}
(window as any).__logs = log;
