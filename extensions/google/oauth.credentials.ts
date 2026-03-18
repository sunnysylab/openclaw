import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import type { Dirent } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { GEMINI_CLI_CLIENT_ID, GEMINI_CLI_CLIENT_SECRET } from "./constants.ts";
import { CLIENT_ID_KEYS, CLIENT_SECRET_KEYS } from "./oauth.shared.js";

type CredentialFs = {
  existsSync: (path: Parameters<typeof existsSync>[0]) => ReturnType<typeof existsSync>;
  readFileSync: (path: Parameters<typeof readFileSync>[0], encoding: "utf8") => string;
  realpathSync: (path: Parameters<typeof realpathSync>[0]) => string;
  readdirSync: (
    path: Parameters<typeof readdirSync>[0],
    options: { withFileTypes: true },
  ) => Dirent[];
};

const defaultFs: CredentialFs = {
  existsSync,
  readFileSync,
  realpathSync,
  readdirSync,
};

let credentialFs: CredentialFs = defaultFs;

function resolveEnv(keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}

let geminiCliCredentials: { clientId: string; clientSecret: string } | null = {
  clientId: GEMINI_CLI_CLIENT_ID,
  clientSecret: GEMINI_CLI_CLIENT_SECRET,
};

export function clearCredentialsCache(): void {
  geminiCliCredentials = null;
}

export function setOAuthCredentialsFsForTest(overrides?: Partial<CredentialFs>): void {
  credentialFs = overrides ? { ...defaultFs, ...overrides } : defaultFs;
}

export function extractGeminiCliCredentials(): { clientId: string; clientSecret: string } | null {
  geminiCliCredentials = { clientId: GEMINI_CLIENT_ID, clientSecret: GEMINI_CLIENT_SECRET };
  return geminiCliCredentials;
}

function resolveGeminiCliDirs(geminiPath: string, resolvedPath: string): string[] {
  const binDir = dirname(geminiPath);
  const candidates = [
    dirname(dirname(resolvedPath)),
    join(dirname(resolvedPath), "node_modules", "@google", "gemini-cli"),
    join(binDir, "node_modules", "@google", "gemini-cli"),
    join(dirname(binDir), "node_modules", "@google", "gemini-cli"),
    join(dirname(binDir), "lib", "node_modules", "@google", "gemini-cli"),
  ];

  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const key =
      process.platform === "win32" ? candidate.replace(/\\/g, "/").toLowerCase() : candidate;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(candidate);
  }
  return deduped;
}

function findInPath(name: string): string | null {
  const exts = process.platform === "win32" ? [".cmd", ".bat", ".exe", ""] : [""];
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    for (const ext of exts) {
      const path = join(dir, name + ext);
      if (credentialFs.existsSync(path)) {
        return path;
      }
    }
  }
  return null;
}

function findFile(dir: string, name: string, depth: number): string | null {
  if (depth <= 0) {
    return null;
  }
  try {
    for (const entry of credentialFs.readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isFile() && entry.name === name) {
        return path;
      }
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        const found = findFile(path, name, depth - 1);
        if (found) {
          return found;
        }
      }
    }
  } catch {}
  return null;
}

export function resolveOAuthClientConfig(): { clientId: string; clientSecret?: string } {
  const envClientId = resolveEnv(CLIENT_ID_KEYS);
  const envClientSecret = resolveEnv(CLIENT_SECRET_KEYS);
  if (envClientId) {
    return { clientId: envClientId, clientSecret: envClientSecret };
  }

  const extracted = extractGeminiCliCredentials();
  if (extracted) {
    return extracted;
  }

  throw new Error(
    "Gemini CLI not found. Install it first: brew install gemini-cli (or npm install -g @google/gemini-cli), or set GEMINI_CLI_OAUTH_CLIENT_ID.",
  );
}
