import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { brandLogoDataUrl } from "../lib/brand-image";

test("new artwork is transparent and legacy logo URLs contain the same new mark", async () => {
  const current = await readFile("public/seedenv-logo-v3.png");
  for (const alias of ["seedenv-logo.png", "seedenv-logo-v2.png"]) assert.deepEqual(await readFile(`public/${alias}`), current);
  const { data, info } = await sharp(current).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 768);
  assert.equal(info.height, 768);
  let transparent = 0;
  let green = 0;
  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] === 0) transparent++;
    if (data[offset + 3] > 128 && data[offset + 1] > data[offset] + 20) green++;
  }
  assert.ok(transparent > info.width * info.height / 2);
  assert.ok(green > 10000);
  const embedded = await sharp(Buffer.from(brandLogoDataUrl.split(",")[1], "base64")).metadata();
  assert.equal(embedded.width, 256);
  assert.equal(embedded.hasAlpha, true);
});

test("app and home-screen icons have opaque dark backgrounds and correct dimensions", async () => {
  for (const [path, size] of [["app/icon.png", 576], ["app/apple-icon.png", 180], ["public/icons/icon-192.png", 192], ["public/icons/icon-512.png", 512], ["public/icons/icon-maskable-512.png", 512]] as const) {
    const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, size);
    assert.equal(info.height, size);
    assert.deepEqual(Array.from(data.subarray(0, 4)), [15, 17, 23, 255]);
    if (path.includes("maskable")) {
      for (let row = 0; row < size; row++) for (let column = 0; column < size; column++) {
        const offset = (row * size + column) * 4;
        if (data[offset] !== 15 || data[offset + 1] !== 17 || data[offset + 2] !== 23) assert.ok(Math.hypot(column - size / 2, row - size / 2) <= size * 0.4, "Maskable artwork extends outside the safe circle.");
      }
    }
  }
});

test("browser-tab icons are transparent and fill the frame", async () => {
  const ico = await readFile("app/favicon.ico");
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 6);
  for (const alias of ["seedenv-favicon-v4.ico", "seedenv-favicon-v3.ico"]) assert.deepEqual(ico, await readFile(`public/${alias}`));
  const frames = Array.from({ length: 6 }, (_, index) => {
    const entry = 6 + index * 16;
    return ico.subarray(ico.readUInt32LE(entry + 12), ico.readUInt32LE(entry + 12) + ico.readUInt32LE(entry + 8));
  });
  for (const input of [...frames, await readFile("public/icons/favicon-192.png"), await readFile("public/icons/favicon-512.png")]) {
    const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(data[3], 0, "Tab icon corners must be transparent.");
    let top = info.height;
    let bottom = -1;
    for (let row = 0; row < info.height; row++) for (let column = 0; column < info.width; column++) {
      if (data[(row * info.width + column) * 4 + 3] > 0) {
        top = Math.min(top, row);
        bottom = Math.max(bottom, row);
      }
    }
    assert.ok(bottom - top + 1 >= info.height * 0.94, `Tab icon artwork only spans ${bottom - top + 1}/${info.height}px.`);
  }
});

test("UI and email logo references use v3 without crop or oversized zoom", async () => {
  async function check(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await check(path);
      else if (/\.(tsx?|css)$/.test(entry.name)) {
        const text = await readFile(path, "utf8");
        assert.doesNotMatch(text, /seedenv-logo-v2\.png|seedenv-favicon-2026\.ico/, path);
        for (const line of text.split("\n").filter((value) => value.includes("seedenv-logo-v3.png"))) assert.doesNotMatch(line, /object-cover|scale-125|scale-\[2\.4\]|object-fit:cover/, path);
      }
    }
  }
  await check("app");
  await check("components");
});