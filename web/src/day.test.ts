import { afterEach, expect, test } from "vitest";
import { formatDay, localToday } from "./day";

const originalTz = process.env.TZ;
afterEach(() => {
  process.env.TZ = originalTz;
});

test("formats a day the same in every timezone", () => {
  for (const tz of ["Pacific/Kiritimati", "Pacific/Pago_Pago", "UTC"]) {
    process.env.TZ = tz;
    expect(formatDay("2026-11-08")).toBe("8 Nov 2026");
    expect(formatDay("2024-02-29")).toBe("29 Feb 2024");
    expect(formatDay("2027-01-01")).toBe("1 Jan 2027");
  }
});

test("local today is the local calendar day, not the UTC one", () => {
  const instant = new Date("2026-11-08T12:00:00Z");
  process.env.TZ = "Pacific/Kiritimati"; // UTC+14
  expect(localToday(instant)).toBe("2026-11-09");
  process.env.TZ = "Pacific/Pago_Pago"; // UTC−11
  expect(localToday(instant)).toBe("2026-11-08");
  process.env.TZ = "Europe/London"; // 23:30 UTC is already tomorrow in BST
  expect(localToday(new Date("2026-06-30T23:30:00Z"))).toBe("2026-07-01");
});
