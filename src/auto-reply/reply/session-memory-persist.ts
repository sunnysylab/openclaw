import fs from "node:fs";
import path from "node:path";
import { resolveRequiredHomeDir } from "../../infra/home-dir.js";

const SESSION_MEMORY_FILENAME = "session_memory.json";

export type SessionMemory = {
  lastSessionId?: string;
  lastSessionKey?: string;
  summary?: string;
  lastActiveAt?: number;
  userPreferences?: {
    thinkingLevel?: string;
    verboseLevel?: string;
    reasoningLevel?: string;
    ttsAuto?: string;
    modelOverride?: string;
    providerOverride?: string;
  };
};

function resolveSessionMemoryPath(): string {
  const homeDir = resolveRequiredHomeDir(process.env, undefined);
  return path.join(homeDir, SESSION_MEMORY_FILENAME);
}

export async function saveSessionMemory(memory: SessionMemory): Promise<void> {
  const memoryPath = resolveSessionMemoryPath();
  try {
    const dir = path.dirname(memoryPath);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(memoryPath, JSON.stringify(memory, null, 2), "utf-8");
  } catch (error) {
    // Log but don't fail - session memory is best-effort
    console.warn(`Failed to save session memory: ${error}`);
  }
}

export async function loadSessionMemory(): Promise<SessionMemory | null> {
  const memoryPath = resolveSessionMemoryPath();
  try {
    const content = await fs.promises.readFile(memoryPath, "utf-8");
    return JSON.parse(content) as SessionMemory;
  } catch {
    return null;
  }
}

export async function clearSessionMemory(): Promise<void> {
  const memoryPath = resolveSessionMemoryPath();
  try {
    await fs.promises.unlink(memoryPath);
  } catch {
    // File doesn't exist - that's fine
  }
}

export async function updateSessionMemoryAfterRun(params: {
  sessionId: string;
  sessionKey: string;
  sessionEntry: {
    thinkingLevel?: string;
    verboseLevel?: string;
    reasoningLevel?: string;
    ttsAuto?: string;
    modelOverride?: string;
    providerOverride?: string;
  };
  summary?: string;
}): Promise<void> {
  const memory: SessionMemory = {
    lastSessionId: params.sessionId,
    lastSessionKey: params.sessionKey,
    summary: params.summary,
    lastActiveAt: Date.now(),
    userPreferences: {
      thinkingLevel: params.sessionEntry.thinkingLevel,
      verboseLevel: params.sessionEntry.verboseLevel,
      reasoningLevel: params.sessionEntry.reasoningLevel,
      ttsAuto: params.sessionEntry.ttsAuto,
      modelOverride: params.sessionEntry.modelOverride,
      providerOverride: params.sessionEntry.providerOverride,
    },
  };
  await saveSessionMemory(memory);
}