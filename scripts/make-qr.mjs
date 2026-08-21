#!/usr/bin/env node
/**
 * Generates the chapter's QR codes.
 *
 *   npm run qr
 *
 * Output goes to qr/ in the repo root — NOT public/, because these are print
 * assets for posters and Slack, not files the website needs to serve.
 *
 * WHY THIS IS A SCRIPT AND NOT A ONE-OFF DOWNLOAD
 * -----------------------------------------------
 * The E-Board told members the attendance QR stays the same all year, so it gets
 * printed on table tents and posters. That means two things matter more than
 * convenience:
 *
 * 1. It must point at a URL WE control. Never a shortener or a "dynamic QR"
 *    service — those expire, rate-limit, start charging, or disappear, and the
 *    code is already printed by then. Pointing at shpeosu.com means the
 *    destination can be changed from this repo without reprinting anything.
 *
 * 2. Someone has to be able to regenerate it. Next year's Digital Ops chair
 *    runs `npm run qr` instead of hunting for whichever website made the
 *    original and hoping it produces an identical code.
 *
 * DESIGN CHOICES
 * --------------
 * - URL uses `www.` deliberately. The apex domain 307-redirects to www, and a
 *   redirect is a wasted round trip on the congested wifi of a packed event.
 * - Error correction level H (30%). The highest level, because these get
 *   printed, taped to tables, smudged, scanned at an angle, and partly covered
 *   by someone's hand. A denser code that survives damage beats a sparse one
 *   that doesn't.
 * - 4-module quiet zone. Non-negotiable: QR readers need that white border, and
 *   it is the single most common thing a designer crops off.
 * - Pure black on white. Brand colours reduce contrast and cost scan reliability
 *   in bad lighting, which is exactly the condition at an indoor fair.
 * - SVG for print (scales to any poster size) and a large PNG for Slack.
 */
import QRCode from 'qrcode';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'qr');

const CODES = [
  {
    name: 'attendance',
    url: 'https://www.shpeosu.com/attendance',
    caption: 'Scan to check in',
  },
  {
    name: 'join',
    url: 'https://www.shpeosu.com/join',
    caption: 'Scan to learn about SHPE',
  },
];

const OPTIONS = {
  errorCorrectionLevel: 'H',
  margin: 4,
  color: { dark: '#000000', light: '#FFFFFF' },
};

await mkdir(OUT_DIR, { recursive: true });

for (const { name, url, caption } of CODES) {
  const svg = await QRCode.toString(url, { ...OPTIONS, type: 'svg' });
  await writeFile(join(OUT_DIR, `${name}.svg`), svg);

  // 1200px is comfortably past what any printer needs and looks sharp in Slack.
  await QRCode.toFile(join(OUT_DIR, `${name}.png`), url, { ...OPTIONS, width: 1200 });

  const { modules } = await QRCode.create(url, OPTIONS);
  console.log(`${name}`);
  console.log(`  url      ${url}`);
  console.log(`  caption  ${caption}`);
  console.log(`  grid     ${modules.size}x${modules.size} modules, EC level H`);
  console.log(`  files    qr/${name}.svg, qr/${name}.png`);
}

console.log(`
Printing notes
  - Minimum ~1.5 in (4 cm) for a table tent scanned at arm's length.
    Roughly 4 in (10 cm) for a poster people scan from a few feet back.
  - Print the URL underneath as text. Some phones fail, some people do not
    scan, and a readable fallback costs nothing.
  - Do NOT crop the white border, and do not place the code on a busy photo.
  - Test with at least one iPhone and one Android before sending to print.`);
