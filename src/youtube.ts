/** Hosts YouTube video links use, without a `www.` / `m.` / `music.` prefix. */
const HOSTS = new Set(["youtube.com", "youtube-nocookie.com", "youtu.be"]);
/** Paths whose next segment is the video id: `/embed/ID`, `/shorts/ID`, … */
const ID_PATHS = new Set(["embed", "shorts", "live", "v"]);

/**
 * The embedded-player URL for a YouTube video link, or `null` if `url` isn't one. Handles
 * `youtube.com/watch?v=ID`, `youtu.be/ID`, `/shorts/ID`, `/live/ID` and `/embed/ID`, and keeps a
 * start time given as `t=90`, `t=1m30s` or `start=90`.
 */
export function youtubeEmbedUrl(url: string): string | null {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return null;
	}
	const host = parsed.hostname.replace(/^(?:www|m|music)\./, "");
	if (!HOSTS.has(host)) return null;

	const [, first, second] = parsed.pathname.split("/");
	const id = host === "youtu.be" ? first : first === "watch" ? parsed.searchParams.get("v") : ID_PATHS.has(first) ? second : null;
	if (!id || !/^[\w-]{11}$/.test(id)) return null;

	const embed = new URL(`https://www.youtube.com/embed/${id}`);
	const start = seconds(parsed.searchParams.get("t") ?? parsed.searchParams.get("start"));
	if (start) embed.searchParams.set("start", String(start));
	return embed.toString();
}

/** `90`, `90s` or `1h2m30s` → seconds; 0 if absent or unreadable. */
function seconds(value: string | null): number {
	const match = value ? /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(value) : null;
	if (!match) return 0;
	const [, hours = "0", minutes = "0", secs = "0"] = match;
	return Number(hours) * 3600 + Number(minutes) * 60 + Number(secs);
}
