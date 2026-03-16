#!/usr/bin/env node
/**
 * Build script for Node.js SEA (Single Executable Application).
 *
 * Produces a self-contained `openclaw` binary that bundles all JS/TS source
 * into a single CJS blob injected into a Node.js executable. Native addons
 * (.node files) are shipped alongside the binary and loaded at runtime.
 *
 * Usage:
 *   node scripts/build-sea.mjs [--target linux-arm64|linux-x64|darwin-arm64|darwin-x64]
 *
 * Prerequisites:
 *   - pnpm install (for node_modules)
 *
 * Output:
 *   dist-sea/
 *     openclaw-sea.cjs     — bundled CJS entrypoint (esbuild from src/)
 *     openclaw             — final binary (Node.js + injected SEA blob)
 *     addons/              — native .node addons to copy into container
 *     esm-modules/         — ESM-only deps that can't be bundled
 *     manifest.json        — build metadata
 *
 * Node.js SEA reference: https://nodejs.org/api/single-executable-applications.html
 * Requires Node.js 21.7+ (--build-sea flag, no postject needed)
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "dist-sea");
const BUNDLE = path.join(OUT_DIR, "openclaw-sea.cjs");
const BINARY = path.join(OUT_DIR, "openclaw");
const ADDONS_DIR = path.join(OUT_DIR, "addons");
const ESM_MODULES_DIR = path.join(OUT_DIR, "esm-modules");
const SEA_CONFIG = path.join(ROOT, "sea-config.json");

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const targetIdx = args.indexOf("--target");
const target = targetIdx !== -1 ? args[targetIdx + 1] : detectTarget();

function detectTarget() {
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  const os = process.platform === "darwin" ? "darwin" : "linux";
  return `${os}-${arch}`;
}

console.log(`\n🦞 OpenClaw SEA build — target: ${target}\n`);

// ---------------------------------------------------------------------------
// Native addons — cannot be bundled into SEA
// ---------------------------------------------------------------------------
const NATIVE_EXTERNALS = [
  "@lydell/node-pty", // Pseudo-terminal
  "sharp", // Image processing (libvips)
  "sqlite-vec", // SQLite vector extension
  "opusscript", // Opus audio codec
  "sodium-native", // Crypto (optional)
];

// ---------------------------------------------------------------------------
// Optional / large binary deps — skip for container deployment
// ---------------------------------------------------------------------------
const OPTIONAL_EXTERNALS = [
  "playwright-core", // Browser automation (pre-installed separately)
  "pdfjs-dist", // PDF parsing (large WASM)
  "ffmpeg-static", // ffmpeg binary (ship separately)
  "node-llama-cpp", // Local LLM inference (has top-level await)
  "qrcode-terminal", // Uses legacy octal escapes — strict mode error
  // @node-llama-cpp platform binaries
  "@node-llama-cpp/linux-arm64",
  "@node-llama-cpp/linux-armv7l",
  "@node-llama-cpp/linux-x64",
  "@node-llama-cpp/linux-x64-cuda",
  "@node-llama-cpp/linux-x64-cuda-ext",
  "@node-llama-cpp/linux-x64-vulkan",
  "@node-llama-cpp/mac-x64",
  "@node-llama-cpp/win-arm64",
  "@node-llama-cpp/win-x64",
  "@node-llama-cpp/win-x64-cuda",
  "@node-llama-cpp/win-x64-cuda-ext",
  "@node-llama-cpp/win-x64-vulkan",
];

// ---------------------------------------------------------------------------
// ESM-only packages — cannot be converted to CJS by esbuild
// These are shipped as node_modules alongside the binary (esm-modules/)
// ---------------------------------------------------------------------------
const ESM_ONLY_PACKAGES = [
  "@mariozechner/pi-coding-agent",
  "@mariozechner/pi-ai",
  "@mariozechner/pi-tui",
  "@mariozechner/pi-agent-core",
  "@buape/carbon",
  "file-type",
  "osc-progress",
];

// Wildcard patterns for esbuild --external: flags
const EXTERNAL_PATTERNS = ["@node-llama-cpp/*", "@mariozechner/*", "@buape/carbon/*"];

const allExternals = [...NATIVE_EXTERNALS, ...OPTIONAL_EXTERNALS, ...ESM_ONLY_PACKAGES];
const externalsFlags = [
  ...allExternals.map((e) => `--external:${e}`),
  ...EXTERNAL_PATTERNS.map((p) => `--external:${p}`),
].join(" ");

// ---------------------------------------------------------------------------
// Step 1: Ensure node_modules exists
// ---------------------------------------------------------------------------
if (!fs.existsSync(path.join(ROOT, "node_modules"))) {
  die("node_modules not found. Run: pnpm install");
}

// ---------------------------------------------------------------------------
// Step 2: Bundle src/entry-sea.ts → CJS single file via esbuild
// ---------------------------------------------------------------------------
fs.mkdirSync(OUT_DIR, { recursive: true });

console.log("▶ Bundling src/entry-sea.ts → CJS with esbuild...");

// Find esbuild binary in pnpm store (shipped with tsx devDependency)
const esbuildBin = findEsbuildBin(ROOT);
if (!esbuildBin) {
  die(
    "esbuild binary not found in node_modules. " +
      "Add esbuild to devDependencies: pnpm add -D esbuild",
  );
}

const esbuildCmd = [
  JSON.stringify(esbuildBin),
  path.join(ROOT, "src", "entry-sea.ts"),
  `--bundle`,
  `--platform=node`,
  `--format=cjs`,
  `--target=node22`,
  `--tsconfig=${path.join(ROOT, "tsconfig.json")}`,
  `--outfile=${BUNDLE}`,
  `--define:process.env.NODE_ENV='"production"'`,
  `--keep-names`,
  `--sourcemap=linked`,
  `--loader:.node=file`,
  externalsFlags,
].join(" ");

run(esbuildCmd, ROOT);

// Step 2b: Patch import.meta.url in the CJS bundle
// esbuild sets `import_metaN = {}` for CJS; we need `.url` to work correctly
// for modules that use fileURLToPath(import.meta.url) for path resolution.
console.log("▶ Patching import.meta.url shim...");
let bundleCode = fs.readFileSync(BUNDLE, "utf8");
const importMetaCount = (bundleCode.match(/\bimport_meta\d* = \{\}/g) ?? []).length;
bundleCode = bundleCode.replace(/\bimport_meta\d* = \{\}/g, (m) =>
  m.replace("= {}", `= {url: require("node:url").pathToFileURL(__filename).href}`),
);
fs.writeFileSync(BUNDLE, bundleCode);
console.log(`   Patched ${importMetaCount} import.meta.url instances`);

const bundleSizeKB = Math.round(fs.statSync(BUNDLE).size / 1024);
console.log(`   Bundle size: ${bundleSizeKB} KB`);

// ---------------------------------------------------------------------------
// Step 3: Build final binary using node --build-sea (Node 21.7+)
// ---------------------------------------------------------------------------
const nodeBinSrc = process.env.OPENCLAW_SEA_NODE_PATH ?? process.execPath;

if (!fs.existsSync(nodeBinSrc)) {
  die(`Node binary not found at ${nodeBinSrc}. Set OPENCLAW_SEA_NODE_PATH to override.`);
}

console.log(`▶ Building SEA binary (node --build-sea, base: ${path.basename(nodeBinSrc)})...`);

const seaCfgContent = {
  main: BUNDLE,
  output: BINARY,
  executable: nodeBinSrc,
  disableExperimentalSEAWarning: true,
  useSnapshot: false,
  useCodeCache: false,
};
fs.writeFileSync(SEA_CONFIG, JSON.stringify(seaCfgContent, null, 2));

run(`node --build-sea=${SEA_CONFIG}`, ROOT);

if (!fs.existsSync(BINARY)) {
  die(`Binary not created at ${BINARY}`);
}
fs.chmodSync(BINARY, 0o755);

const binarySize = Math.round(fs.statSync(BINARY).size / 1024 / 1024);
console.log(`   Binary size: ${binarySize} MB`);

// ---------------------------------------------------------------------------
// Step 4: Collect native addons alongside binary
// ---------------------------------------------------------------------------
console.log("▶ Collecting native .node addons...");
fs.mkdirSync(ADDONS_DIR, { recursive: true });

const nativeAddonPaths = findNativeAddons(path.join(ROOT, "node_modules"));
console.log(`   Found ${nativeAddonPaths.length} native addon(s)`);

for (const addonPath of nativeAddonPaths) {
  const rel = path.relative(path.join(ROOT, "node_modules"), addonPath);
  const dest = path.join(ADDONS_DIR, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(addonPath, dest);
}

// ---------------------------------------------------------------------------
// Step 5: Collect ESM-only packages (required at runtime)
// ---------------------------------------------------------------------------
console.log("▶ Collecting ESM-only packages...");
fs.mkdirSync(ESM_MODULES_DIR, { recursive: true });

for (const pkg of ESM_ONLY_PACKAGES) {
  const pkgDir = resolvePackageDir(ROOT, pkg);
  if (!pkgDir) {
    console.warn(`   ⚠ Package not found: ${pkg}`);
    continue;
  }
  const dest = path.join(ESM_MODULES_DIR, pkg);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  copyDirSync(pkgDir, dest);
  console.log(`   + ${pkg}`);
}

// ---------------------------------------------------------------------------
// Step 6: Write manifest
// ---------------------------------------------------------------------------
const manifest = {
  builtAt: new Date().toISOString(),
  target,
  nodeVersion: process.version,
  bundleSizeKB,
  binaryMB: binarySize,
  importMetaPatchCount: importMetaCount,
  nativeAddons: nativeAddonPaths.map((p) => path.relative(path.join(ROOT, "node_modules"), p)),
  esmOnlyPackages: ESM_ONLY_PACKAGES,
  externalPackages: [...NATIVE_EXTERNALS, ...OPTIONAL_EXTERNALS, ...ESM_ONLY_PACKAGES],
};
fs.writeFileSync(path.join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));

console.log(`\n✅ SEA build complete!\n`);
console.log(`   Binary:      ${BINARY}`);
console.log(`   Addons dir:  ${ADDONS_DIR}`);
console.log(`   ESM modules: ${ESM_MODULES_DIR}`);
console.log(`   Manifest:    ${path.join(OUT_DIR, "manifest.json")}`);
console.log(`\n📦 To use in a Dockerfile:`);
console.log(`   COPY dist-sea/openclaw /usr/local/bin/openclaw`);
console.log(`   COPY dist-sea/addons /app/addons`);
console.log(`   COPY dist-sea/esm-modules /app/node_modules`);
console.log(`   CMD ["openclaw", "gateway", "start"]\n`);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function run(cmd, cwd) {
  console.log(`   $ ${cmd.slice(0, 120)}${cmd.length > 120 ? "..." : ""}`);
  const result = spawnSync(cmd, { cwd, shell: true, stdio: "inherit" });
  if (result.status !== 0) {
    die(`Command failed with exit code ${result.status}`);
  }
}

function die(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

function findEsbuildBin(root) {
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  const os = process.platform === "linux" ? "linux" : "darwin";
  const pnpmDir = path.join(root, "node_modules/.pnpm");
  if (!fs.existsSync(pnpmDir)) {
    return null;
  }

  const pattern = `@esbuild+${os}-${arch}@`;
  try {
    const entries = fs.readdirSync(pnpmDir).filter((e) => e.startsWith(pattern));
    for (const entry of entries) {
      const bin = path.join(
        pnpmDir,
        entry,
        "node_modules",
        `@esbuild/${os}-${arch}`,
        "bin",
        "esbuild",
      );
      if (fs.existsSync(bin)) {
        return bin;
      }
    }
  } catch {
    /* ignore */
  }

  // Check for direct node_modules/.bin/esbuild
  const directBin = path.join(root, "node_modules/.bin/esbuild");
  if (fs.existsSync(directBin)) {
    return directBin;
  }

  return null;
}

function findNativeAddons(nodeModulesDir) {
  const results = [];
  if (!fs.existsSync(nodeModulesDir)) {
    return results;
  }
  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".node")) {
        results.push(full);
      }
    }
  }
  walk(nodeModulesDir);
  return results;
}

function resolvePackageDir(root, pkgName) {
  // Look in pnpm symlinks first
  const direct = path.join(root, "node_modules", pkgName);
  if (fs.existsSync(direct)) {
    return direct;
  }

  // Search pnpm store
  const pnpmDir = path.join(root, "node_modules/.pnpm");
  if (!fs.existsSync(pnpmDir)) {
    return null;
  }

  const scope = pkgName.startsWith("@") ? pkgName.split("/")[0].replace("@", "") : null;
  const base = pkgName.replace("@", "").replace("/", "+");

  try {
    const entries = fs
      .readdirSync(pnpmDir)
      .filter((e) => e.startsWith(scope ? `@${scope}+` : `${base}@`));
    for (const entry of entries) {
      const pkgPath = path.join(pnpmDir, entry, "node_modules", pkgName);
      if (fs.existsSync(pkgPath)) {
        return pkgPath;
      }
    }
  } catch {
    /* ignore */
  }

  return null;
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  let entries;
  try {
    entries = fs.readdirSync(src, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
