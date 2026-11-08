// WaterChange dates are calendar days (`YYYY-MM-DD`), never instants (lld.md → Data model).
const pad = (n: number) => String(n).padStart(2, "0");

/** The day the User's own clock shows: the form default. */
export const localToday = (now = new Date()) =>
  `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

/** "1 Nov 2026" from the day's own components, so no timezone can shift it. */
export function formatDay(at: string) {
  const [year, month, day] = at.split("-").map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date.toLocaleDateString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
