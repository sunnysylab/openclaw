#!/usr/bin/env node
/**
 * Downloads the official Node.js binary for a given target platform/arch,
 * for use as the base binary in a cross-compiled SEA build.
 *
 * Usage:
 *   node scripts/fetch-node-for-sea.mjs --target linux-arm64 [--version 22.14.0]
 *
 * The downloaded binary is placed at dist-sea/node-<target> and the path is
 * printed to stdout so it can be passed to OPENCLAW_SEA_NODE_PATH.
 *
 * Example (build linux-arm64 on macOS):
 *   export OPENCLAW_SEA_NODE_PATH=$(node scripts/fetch-node-for-sea.mjs --target linux-arm64)
 *   node scripts/build-sea.mjs --target linux-arm64
 */

import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "dist-sea");

const args = process.argv.slice(2);
const targetIdx = args.indexOf("--target");
const versionIdx = args.indexOf("--version");

const target = targetIdx !== -1 ? args[targetIdx + 1] : "linux-arm64";
const version = versionIdx !== -1 ? args[versionIdx + 1] : process.version.replace(/^v/, "");

// Map target → Node.js download platform/arch names
const TARGET_MAP = {
  "linux-arm64": { platform: "linux", arch: "arm64", ext: "tar.gz", binPath: "bin/node" },
  "linux-x64": { platform: "linux", arch: "x64", ext: "tar.gz", binPath: "bin/node" },
  "darwin-arm64": { platform: "darwin", arch: "arm64", ext: "tar.gz", binPath: "bin/node" },
  "darwin-x64": { platform: "darwin", arch: "x64", ext: "tar.gz", binPath: "bin/node" },
  "win32-x64": { platform: "win", arch: "x64", ext: "zip", binPath: "node.exe" },
};

const mapping = TARGET_MAP[target];
if (!mapping) {
  console.error(`Unknown target: ${target}. Available: ${Object.keys(TARGET_MAP).join(", ")}`);
  process.exit(1);
}

const { platform, arch, ext, binPath } = mapping;
const tarName = `node-v${version}-${platform}-${arch}.${ext}`;
const url = `https://nodejs.org/dist/v${version}/${tarName}`;
const destBin = path.join(OUT_DIR, `node-${target}`);

if (fs.existsSync(destBin)) {
  // Already downloaded
  process.stdout.write(destBin + "\n");
  process.exit(0);
}

console.error(`⬇ Downloading Node.js v${version} for ${target}...`);
console.error(`  ${url}`);

fs.mkdirSync(OUT_DIR, { recursive: true });

const tmpTar = path.join(OUT_DIR, tarName);
await downloadFile(url, tmpTar);

console.error("▶ Extracting node binary...");
await extractNodeBinary(tmpTar, `node-v${version}-${platform}-${arch}/${binPath}`, destBin);
fs.unlinkSync(tmpTar);
fs.chmodSync(destBin, 0o755);

console.error(`✅ Node binary saved to: ${destBin}`);
process.stdout.write(destBin + "\n");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          file.close();
          fs.unlinkSync(dest);
          return downloadFile(res.headers.location, dest).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        res.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve();
        });
        file.on("error", reject);
      })
      .on("error", reject);
  });
}

async function extractNodeBinary(tarPath, entryPath, destPath) {
  // Use system tar — available on Linux and macOS
  const { spawnSync } = await import("node:child_process");
  const result = spawnSync("tar", ["--strip-components=2", "-xzf", tarPath, "-O", entryPath], {
    encoding: "buffer",
  });
  if (result.status !== 0) {
    throw new Error(`tar failed: ${result.stderr?.toString()}`);
  }
  fs.writeFileSync(destPath, result.stdout);
}
