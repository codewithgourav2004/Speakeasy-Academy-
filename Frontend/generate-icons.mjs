/**
 * Generates PNG icons for the PWA manifest.
 * Run once from the Frontend folder: node generate-icons.mjs
 *
 * Requires: npm install -g @resvg/resvg-js   (or: npx resvg-js-cli)
 *
 * If you don't want to install anything, open Chrome, paste the SVG code
 * into https://svgtopng.com/ and download at 192, 512, and 512 (maskable).
 */
import { Resvg } from "@resvg/resvg-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const svgPath = path.join(__dir, "favicon.svg");
const outDir = path.join(__dir, "icons");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

const svgBase = fs.readFileSync(svgPath, "utf8");

// Normal icon (no extra padding)
const normalSvg = svgBase;

// Maskable icon: the "safe zone" is the inner 80% of the canvas,
// so we scale the artwork down and add a purple background fill.
const maskableSvg = svgBase.replace(
  '<rect width="64" height="64" rx="15" fill="url(#g)"/>',
  '<rect width="64" height="64" rx="0" fill="#4f46e5"/>' +
  '<g transform="translate(6.4 6.4) scale(0.8)">'
).replace("</svg>", "</g></svg>");

const sizes = [
  { name: "icon-192.png",         size: 192, svg: normalSvg },
  { name: "icon-512.png",         size: 512, svg: normalSvg },
  { name: "icon-maskable-512.png",size: 512, svg: maskableSvg },
  { name: "shortcut-speak.png",   size: 96,  svg: normalSvg },
  { name: "shortcut-grammar.png", size: 96,  svg: normalSvg },
  { name: "shortcut-test.png",    size: 96,  svg: normalSvg },
];

for (const { name, size, svg } of sizes) {
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: size } });
  const data = resvg.render();
  const png = data.asPng();
  fs.writeFileSync(path.join(outDir, name), png);
  console.log(`✓  icons/${name}  (${size}×${size})`);
}
console.log("\nDone! All icons saved to Frontend/icons/");
