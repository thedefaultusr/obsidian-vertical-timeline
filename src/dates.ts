/**
 * Timeline dates: `YYYY[-MM[-DD[Thh[:mm[:ss]]]]]`, with an optional leading `-` for BCE years.
 * Only the year is required; missing parts default to the earliest value (January, the 1st, midnight).
 */

export type DatePrecision = "year" | "month" | "day" | "hour" | "minute" | "second";

export interface TimelineDate {
	date: Date;
	precision: DatePrecision;
	/** The date exactly as written in the source. */
	text: string;
}

const DATE_RE = /^(-?\d{1,6})(?:-(\d{1,2})(?:-(\d{1,2})(?:[T ](\d{1,2})(?::(\d{1,2})(?::(\d{1,2}))?)?)?)?)?$/;

const PRECISIONS: DatePrecision[] = ["year", "month", "day", "hour", "minute", "second"];

/** Parses a timeline date. Returns `null` when the text is not a valid date. */
export function parseTimelineDate(text: string): TimelineDate | null {
	const trimmed = text.trim();
	const match = DATE_RE.exec(trimmed);
	if (!match) return null;

	const year = parseInt(match[1], 10);
	const month = match[2] ? parseInt(match[2], 10) : 1;
	const day = match[3] ? parseInt(match[3], 10) : 1;
	const hour = match[4] ? parseInt(match[4], 10) : 0;
	const minute = match[5] ? parseInt(match[5], 10) : 0;
	const second = match[6] ? parseInt(match[6], 10) : 0;

	if (month < 1 || month > 12) return null;
	if (day < 1 || day > daysInMonth(year, month)) return null;
	if (hour > 23 || minute > 59 || second > 59) return null;

	// `new Date(y, ...)` maps years 0-99 to 1900-1999, so the year is always set explicitly.
	const date = new Date(2000, 0, 1, 0, 0, 0, 0);
	date.setFullYear(year, month - 1, day);
	date.setHours(hour, minute, second, 0);
	if (isNaN(date.getTime())) return null;

	const filled = match.slice(1).filter((part) => part !== undefined).length;
	return { date, precision: PRECISIONS[filled - 1], text: trimmed };
}

function daysInMonth(year: number, month: number): number {
	const date = new Date(2000, 0, 1);
	date.setFullYear(year, month, 0);
	return date.getDate();
}

/** Formats a year for display, using a BCE suffix for negative years (`-550` → `550 BCE`). */
function formatYear(year: number): string {
	return year < 0 ? `${-year} BCE` : String(year);
}

/** Formats a date for a card, only showing as much detail as was written. */
function formatTimelineDate(value: TimelineDate, locale?: string): string {
	const { date, precision } = value;
	const year = formatYear(date.getFullYear());
	if (precision === "year") return year;

	const month = date.toLocaleString(locale, { month: "short" });
	if (precision === "month") return `${month} ${year}`;

	const dayPart = `${date.getDate()} ${month} ${year}`;
	if (precision === "day") return dayPart;

	const time = date.toLocaleTimeString(locale, {
		hour: "2-digit",
		minute: "2-digit",
		second: precision === "second" ? "2-digit" : undefined,
	});
	return `${dayPart}, ${time}`;
}

/** Formats a start/end pair, e.g. `1789 – 1799`. */
export function formatTimelineRange(start: TimelineDate, end?: TimelineDate, locale?: string): string {
	const from = formatTimelineDate(start, locale);
	return end ? `${from} – ${formatTimelineDate(end, locale)}` : from;
}
