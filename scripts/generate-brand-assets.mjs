import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const root = process.cwd();
const source = resolve(process.argv[2] || "assets/branding/seedenv-source.jpg");
await mkdir(resolve(root, "assets/branding"), { recursive: true });
await mkdir(resolve(root, "public/icons"), { recursive: true });
if (source !== resolve(root, "assets/branding/seedenv-source.jpg")) {
  await copyFile(source, resolve(root, "assets/branding/seedenv-source.jpg"));
}

const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
for (let offset = 0; offset < data.length; offset += 4) {
  const red = data[offset];
  const green = data[offset + 1];
  const blue = data[offset + 2];
  const minimum = Math.min(red, green, blue);
  const chroma = Math.max(red, green, blue) - minimum;
  const alpha = minimum >= 180 ? Math.max(0, Math.min(1, (chroma - 12) / 24)) : 1;
  if (alpha === 0) {
    data[offset] = 0;
    data[offset + 1] = 0;
    data[offset + 2] = 0;
  } else if (alpha < 1) {
    for (let channel = 0; channel < 3; channel++) {
      data[offset + channel] = Math.max(0, Math.min(255, Math.round((data[offset + channel] - 255 * (1 - alpha)) / alpha)));
    }
  }
  data[offset + 3] = Math.round(alpha * 255);
}

const foreground = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).trim({ background: "#00000000", threshold: 8 }).png().toBuffer();
const dark = "#0F1117";
async function logoCanvas(size, background, inset) {
  const mark = await sharp(foreground).resize(size - inset * 2, size - inset * 2, { fit: "inside" }).png().toBuffer();
  const dimensions = await sharp(mark).metadata();
  return sharp({ create: { width: size, height: size, channels: 4, background } }).composite([{ input: mark, left: Math.round((size - dimensions.width) / 2), top: Math.round((size - dimensions.height) / 2) }]).png().toBuffer();
}

const transparent = await logoCanvas(768, "#00000000", 36);
for (const path of ["seedenv-logo-v3.png", "seedenv-logo-v2.png", "seedenv-logo.png"]) {
  await writeFile(resolve(root, "public", path), transparent);
}
for (const size of [192, 512]) {
  const bytes = await logoCanvas(size, dark, Math.round(size * 0.1));
  await writeFile(resolve(root, `public/icon-${size}.png`), bytes);
  await writeFile(resolve(root, `public/icons/icon-${size}.png`), bytes);
}
const maskable = await logoCanvas(512, dark, 100);
await writeFile(resolve(root, "public/icons/icon-maskable-512.png"), maskable);
const apple = await logoCanvas(180, dark, 18);
await writeFile(resolve(root, "public/apple-touch-icon.png"), apple);
await writeFile(resolve(root, "public/icons/apple-touch-icon.png"), apple);
await writeFile(resolve(root, "app/apple-icon.png"), apple);
await writeFile(resolve(root, "app/icon.png"), await logoCanvas(576, dark, 58));

const sizes = [16, 32, 48, 64, 128, 256];
const frames = await Promise.all(sizes.map((size) => logoCanvas(size, dark, Math.max(1, Math.round(size * 0.06)))));
const header = Buffer.alloc(6 + frames.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(frames.length, 4);
let frameOffset = header.length;
frames.forEach((frame, index) => {
  const entry = 6 + index * 16;
  header[entry] = sizes[index] === 256 ? 0 : sizes[index];
  header[entry + 1] = header[entry];
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(frame.length, entry + 8);
  header.writeUInt32LE(frameOffset, entry + 12);
  frameOffset += frame.length;
});
const favicon = Buffer.concat([header, ...frames]);
for (const path of ["public/seedenv-favicon-2026.ico", "public/seedenv-favicon-v3.ico", "app/favicon.ico"]) {
  await writeFile(resolve(root, path), favicon);
}
await rm(resolve(root, "public/favicon.ico"), { force: true });

const shareMark = await logoCanvas(256, "#00000000", 12);
await writeFile(resolve(root, "lib/brand-image.ts"), `export const brandLogoDataUrl = "data:image/png;base64,${shareMark.toString("base64")}";\n`);
console.log("Generated transparent SeedEnv artwork, dark icons, maskable icon, Apple icons, ICO frames, and embedded social mark.");