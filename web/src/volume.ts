import type { User } from "./session";

type VolumeUnit = User["volumeUnit"];
const litresPerUnit = { L: 1, usGal: 3.785411784, ukGal: 4.54609 };
export const volumeLabels = { L: "L", usGal: "US gal", ukGal: "UK gal" };
export const toLitres = (volume: number, unit: VolumeUnit) =>
  volume * litresPerUnit[unit];
export const fromLitres = (volume: number, unit: VolumeUnit) =>
  volume / litresPerUnit[unit];
// Only display rounds (lld.md → Unit conversion); stored litres keep full precision.
export const formatVolume = (litres: number, unit: VolumeUnit) =>
  `${Math.round(fromLitres(litres, unit))} ${volumeLabels[unit]}`;
