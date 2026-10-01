import { describe, expect, it } from "vitest";
import { youtubeEmbedUrl } from "../src/youtube";

const ID = "dQw4w9WgXcQ";
const EMBED = `https://www.youtube.com/embed/${ID}`;

describe("youtubeEmbedUrl", () => {
	it("recognises every kind of video link", () => {
		for (const url of [
			`https://www.youtube.com/watch?v=${ID}`,
			`https://youtube.com/watch?feature=share&v=${ID}`,
			`https://m.youtube.com/watch?v=${ID}`,
			`https://music.youtube.com/watch?v=${ID}&list=RD${ID}`,
			`https://youtu.be/${ID}`,
			`https://www.youtube.com/shorts/${ID}`,
			`https://www.youtube.com/live/${ID}?si=abc`,
			`https://www.youtube.com/embed/${ID}`,
			`https://www.youtube-nocookie.com/embed/${ID}`,
		]) {
			expect(youtubeEmbedUrl(url), url).toBe(EMBED);
		}
	});

	it("keeps the start time", () => {
		expect(youtubeEmbedUrl(`https://youtu.be/${ID}?t=90`)).toBe(`${EMBED}?start=90`);
		expect(youtubeEmbedUrl(`https://youtu.be/${ID}?t=90s`)).toBe(`${EMBED}?start=90`);
		expect(youtubeEmbedUrl(`https://www.youtube.com/watch?v=${ID}&t=1h2m3s`)).toBe(`${EMBED}?start=3723`);
		expect(youtubeEmbedUrl(`https://www.youtube.com/embed/${ID}?start=42`)).toBe(`${EMBED}?start=42`);
		expect(youtubeEmbedUrl(`https://youtu.be/${ID}?t=soon`)).toBe(EMBED);
	});

	it("rejects other links", () => {
		for (const url of [
			"https://www.youtube.com/",
			"https://www.youtube.com/@channel",
			"https://www.youtube.com/playlist?list=PL123",
			"https://www.youtube.com/watch?v=short",
			"https://notyoutube.com/watch?v=dQw4w9WgXcQ",
			"https://vimeo.com/123456",
			"not a url",
		]) {
			expect(youtubeEmbedUrl(url), url).toBeNull();
		}
	});
});
