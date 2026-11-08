// Draws the install icons (a fish on the theme colour) as PNGs into web/public.
// Rerun after changing the drawing: node web/scripts/icons.mjs
import { Buffer } from "node:buffer";
import { writeFileSync } from "node:fs";
import { URL } from "node:url";
import { deflateSync } from "node:zlib";

const background = [0x12, 0x3d, 0x37];
const fish = [0xe6, 0xf4, 0xf1];

// Coverage of the fish at (x, y) in 0..1 units. Everything sits inside the
// central 80% circle, so the same image is safe as a maskable icon.
function inFish(x, y) {
  const body = ((x - 0.45) / 0.22) ** 2 + ((y - 0.5) / 0.14) ** 2 <= 1;
  const tail = x >= 0.62 && x <= 0.78 && Math.abs(y - 0.5) <= (x - 0.62) * 0.9;
  const eye = (x - 0.33) ** 2 + (y - 0.47) ** 2 <= 0.022 ** 2;
  return (body || tail) && !eye;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function png(size) {
  const samples = 4; // 4x4 supersampling for smooth edges
  const rows = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    rows[y * (1 + size * 3)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      let hits = 0;
      for (let sy = 0; sy < samples; sy++)
        for (let sx = 0; sx < samples; sx++)
          if (
            inFish(
              (x + (sx + 0.5) / samples) / size,
              (y + (sy + 0.5) / samples) / size,
            )
          )
            hits++;
      const t = hits / samples ** 2;
      for (let c = 0; c < 3; c++)
        rows[y * (1 + size * 3) + 1 + x * 3 + c] = Math.round(
          background[c] + (fish[c] - background[c]) * t,
        );
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB, no alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const out = new URL("../public/", import.meta.url);
for (const [name, size] of [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180],
])
  writeFileSync(new URL(name, out), png(size));
