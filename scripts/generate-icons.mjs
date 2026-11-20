#!/usr/bin/env node
/**
 * Generates all PWA / iOS icon PNGs from public/icons/icon-source.svg (square, ideally 1024×1024).
 * Replace the SVG (or drop in a PNG named icon-source.png) and run:  npm run icons
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const src = fs.existsSync(path.join(root, 'icon-source.png')) ? path.join(root, 'icon-source.png') : path.join(root, 'icon-source.svg');
const BG = '#0c1210';

const render = (size, file) => sharp(src, { density: 384 }).resize(size, size).flatten({ background: BG }).png().toFile(path.join(root, file));

await render(180, 'apple-touch-icon.png'); // iOS applies its own rounded mask, so this must be full-bleed
await render(192, 'icon-192.png');
await render(512, 'icon-512.png');

// Maskable: artwork inside the central ~76% so Android's circular/squircle masks never clip it.
const inner = Math.round(512 * 0.76);
const art = await sharp(src, { density: 384 }).resize(inner, inner).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: BG } })
  .composite([{ input: art, gravity: 'center' }]).png().toFile(path.join(root, 'icon-maskable-512.png'));

console.log('Icons written to public/icons');
