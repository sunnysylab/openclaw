#!/usr/bin/env node
import fs from "node:fs";
/**
 * Bundle src/entry.ts → dist-sea/openclaw-sea.cjs using rolldown directly.
 * This creates a TRUE single-file CJS bundle (no code splitting).
 * Called by build-sea.mjs.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = process.env.SEA_OUT_DIR ?? path.join(ROOT, "dist-sea");
const BUNDLE = path.join(OUT_DIR, "openclaw-sea.cjs");

const externals = process.env.SEA_EXTERNALS
  ? process.env.SEA_EXTERNALS.split(",").map((s) => s.trim())
  : [];

fs.mkdirSync(OUT_DIR, { recursive: true });

// Find rolldown inside pnpm's virtual store (it's a dep of tsdown)
const ROLLDOWN_PATH = path.join(
  ROOT,
  "node_modules/.pnpm/rolldown@1.0.0-rc.3/node_modules/rolldown/dist/index.mjs",
);

if (!fs.existsSync(ROLLDOWN_PATH)) {
  // Fallback: scan for any rolldown installation
  const { execSync } = await import("node:child_process");
  const found = execSync(
    `find "${ROOT}/node_modules/.pnpm" -name "index.mjs" -path "*/rolldown/dist/*" 2>/dev/null | head -1`,
    { encoding: "utf8" },
  ).trim();
  if (!found) {
    console.error("rolldown not found in node_modules/.pnpm");
    process.exit(1);
  }
  console.log("Found rolldown at:", found);
}

const { rolldown } = await import(ROLLDOWN_PATH);

console.log("▶ rolldown single-file CJS bundle...");
const build = await rolldown({
  input: {
    "openclaw-sea": path.join(ROOT, "src", "entry.ts"),
  },
  cwd: ROOT,
  platform: "node",
  external: externals,
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  resolve: {
    tsconfigFilename: path.join(ROOT, "tsconfig.json"),
  },
});

await build.write({
  dir: OUT_DIR,
  format: "cjs",
  entryFileNames: "[name].cjs",
  sourcemap: true,
});

await build.close();

if (!fs.existsSync(BUNDLE)) {
  console.error(`Bundle not found at ${BUNDLE}`);
  process.exit(1);
}

const sizeKB = Math.round(fs.statSync(BUNDLE).size / 1024);
console.log(`   Bundle: ${BUNDLE} (${sizeKB} KB)`);
