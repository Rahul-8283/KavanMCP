// Turns the screenshots in shots-src/ into the files the page serves.
//
//   npm run shots
//
// Input:  shots-src/<id>-<dark|light>.png, captured at 1600 px wide from the real app.
// Output: public/shots/<id>-<theme>-<800|1600>.<avif|webp>
//
// The page never ships a PNG. Run this again whenever a source screenshot changes.
import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(root, "shots-src");
const OUT = path.join(root, "public", "shots");
const WIDTHS = [800, 1600];

await mkdir(OUT, { recursive: true });

const sources = (await readdir(SRC)).filter((name) => /^[a-z]+-(dark|light)\.png$/.test(name));
if (sources.length === 0) {
  console.error(`No screenshots found in ${SRC}`);
  process.exit(1);
}

let total = 0;
for (const file of sources) {
  const base = file.replace(/\.png$/, "");
  for (const width of WIDTHS) {
    const resized = sharp(path.join(SRC, file)).resize({ width, withoutEnlargement: true });
    const webp = await resized.clone().webp({ quality: 82, effort: 5 }).toFile(path.join(OUT, `${base}-${width}.webp`));
    const avif = await resized.clone().avif({ quality: 55, effort: 5 }).toFile(path.join(OUT, `${base}-${width}.avif`));
    total += webp.size + avif.size;
    console.log(
      `${base}-${width}: webp ${(webp.size / 1024).toFixed(0)} kB, avif ${(avif.size / 1024).toFixed(0)} kB`,
    );
  }
}
console.log(`${sources.length} screenshots, ${(total / 1024 / 1024).toFixed(2)} MB written to public/shots`);
