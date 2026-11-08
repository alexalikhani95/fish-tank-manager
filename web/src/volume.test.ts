import { expect, test } from "vitest";
import { formatVolume, fromLitres, toLitres } from "./volume";

test("volume uses exact, distinct gallon factors and retains round-trip precision", () => {
  expect(toLitres(12.5, "L")).toBe(12.5);
  expect(toLitres(10, "usGal")).toBeCloseTo(37.85411784, 10);
  expect(toLitres(10, "ukGal")).toBeCloseTo(45.4609, 10);
  expect(fromLitres(37.85411784, "usGal")).toBeCloseTo(10, 10);
  expect(fromLitres(45.4609, "ukGal")).toBeCloseTo(10, 10);
  for (const unit of ["L", "usGal", "ukGal"] as const) {
    expect(fromLitres(toLitres(12.3456789, unit), unit)).toBeCloseTo(
      12.3456789,
      12,
    );
  }
});

test("display rounds to whole units and never conflates the two gallons", () => {
  expect(formatVolume(80.25, "L")).toBe("80 L");
  expect(formatVolume(100, "usGal")).toBe("26 US gal");
  expect(formatVolume(100, "ukGal")).toBe("22 UK gal");
  expect(formatVolume(toLitres(10.25, "ukGal"), "ukGal")).toBe("10 UK gal");
});
