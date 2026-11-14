// Regenerates src/data/chains.json: normalized names of brands that operate in
// the US, taken from OpenStreetMap's Name Suggestion Index (BSD-3-Clause).
// A name being in this list means "this is a multi-location brand", which is
// our chain-detection signal.
//
// Usage (from apps/web):
//   npm install --no-save name-suggestion-index
//   node scripts/build-chains.mjs
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const nsiPath = process.argv[2] ?? "name-suggestion-index/dist/json/nsi.json";
const { nsi } = require(nsiPath);

// Only categories a shopper would search for.
const TREES = /^brands\/(shop|amenity|craft|healthcare|leisure|office|tourism)\//;
const inUS = (loc) => /^(001|na|us(\b|-))/.test(String(loc).toLowerCase());

// Keep in sync with normalizeName() in src/lib/classify.ts.
const normalize = (s) =>
  s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&|\+/g, " and ")
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const names = new Set();
for (const [path, category] of Object.entries(nsi)) {
  if (!TREES.test(path)) continue;
  for (const item of category.items) {
    if (!(item.locationSet?.include ?? []).some(inUS)) continue;
    const candidates = [
      item.displayName,
      item.tags?.name,
      item.tags?.brand,
      item.tags?.["name:en"],
      item.tags?.["brand:en"],
      ...(item.matchNames ?? []),
    ];
    for (const c of candidates) {
      if (!c || !/^[\x20-\x7e\u00c0-\u024f’]+$/.test(c)) continue; // Latin names only
      const n = normalize(c);
      if (n.length >= 3) names.add(n);
    }
  }
}

const out = fileURLToPath(new URL("../src/data/chains.json", import.meta.url));
writeFileSync(out, JSON.stringify([...names].sort()) + "\n");
console.log(`wrote ${names.size} chain names to ${out}`);
