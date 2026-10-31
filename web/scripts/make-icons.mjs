// Builds the favicon set from the Kavan mark.
//
//   npm run icons
//
// app/icon.svg is the mark itself (the SVG favicon). This writes app/apple-icon.png (180 px) and app/favicon.ico,
// an ICO file that holds a 32 px and a 16 px PNG, for crawlers and old browsers that ask for /favicon.ico.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const svg = await readFile(path.join(root, "public", "kavan-mark.svg"));

const png = (size) => sharp(svg, { density: 384 }).resize(size, size).png().toBuffer();

await writeFile(path.join(root, "app", "apple-icon.png"), await png(180));

// ICO: a 6-byte header, one 16-byte directory entry per image, then the PNG data (PNG-in-ICO is valid since Vista)
const images = [await png(32), await png(16)];
const sizes = [32, 16];
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(images.length, 4);

let offset = 6 + 16 * images.length;
const entries = images.map((data, i) => {
  const entry = Buffer.alloc(16);
  entry.writeUInt8(sizes[i], 0); // width
  entry.writeUInt8(sizes[i], 1); // height
  entry.writeUInt8(0, 2); // palette
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(data.length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += data.length;
  return entry;
});

await writeFile(path.join(root, "app", "favicon.ico"), Buffer.concat([header, ...entries, ...images]));
console.log("wrote app/apple-icon.png and app/favicon.ico");
