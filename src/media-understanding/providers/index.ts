import { normalizeProviderId } from "../../agents/model-selection.js";
import type { OpenClawConfig } from "../../config/config.js";
import { loadOpenClawPlugins } from "../../plugins/loader.js";
import { getActivePluginRegistry } from "../../plugins/runtime.js";
import type { MediaUnderstandingProvider } from "../types.js";
import { deepgramProvider } from "./deepgram/index.js";
import { groqProvider } from "./groq/index.js";
import {
  describeImageWithModel,
  describeImagesWithModel,
} from "./image.js";

const PROVIDERS: MediaUnderstandingProvider[] = [groqProvider, deepgramProvider];

function mergeProviderIntoRegistry(
  registry: Map<string, MediaUnderstandingProvider>,
  provider: MediaUnderstandingProvider,
) {
  const normalizedKey = normalizeMediaProviderId(provider.id);
  const existing = registry.get(normalizedKey);
  const merged = existing
    ? {
        ...existing,
        ...provider,
        capabilities: provider.capabilities ?? existing.capabilities,
      }
    : provider;
  registry.set(normalizedKey, merged);
}

export function normalizeMediaProviderId(id: string): string {
  const normalized = normalizeProviderId(id);
  if (normalized === "gemini") {
    return "google";
  }
  return normalized;
}

export function buildMediaUnderstandingRegistry(
  overrides?: Record<string, MediaUnderstandingProvider>,
  cfg?: OpenClawConfig,
): Map<string, MediaUnderstandingProvider> {
  const registry = new Map<string, MediaUnderstandingProvider>();
  for (const provider of PROVIDERS) {
    mergeProviderIntoRegistry(registry, provider);
  }
  const active = getActivePluginRegistry();
  const pluginRegistry =
    (active?.mediaUnderstandingProviders?.length ?? 0) > 0
      ? active
      : loadOpenClawPlugins({ config: cfg });
  for (const entry of pluginRegistry?.mediaUnderstandingProviders ?? []) {
    mergeProviderIntoRegistry(registry, entry.provider);
  }
  // Auto-register media-understanding for config providers with image-capable models (#51392)
  const configProviders = cfg?.models?.providers;
  if (configProviders && typeof configProviders === "object") {
    for (const [providerKey, providerCfg] of Object.entries(configProviders)) {
      if (!providerKey?.trim()) continue;
      const normalizedKey = normalizeMediaProviderId(providerKey);
      if (registry.has(normalizedKey)) continue;
      const models = (providerCfg as { models?: Array<{ input?: string[] }> })?.models ?? [];
      const hasImageModel = models.some(
        (m) => Array.isArray(m?.input) && m.input.includes("image"),
      );
      if (hasImageModel) {
        const autoProvider: MediaUnderstandingProvider = {
          id: normalizedKey,
          capabilities: ["image"],
          describeImage: describeImageWithModel,
          describeImages: describeImagesWithModel,
        };
        mergeProviderIntoRegistry(registry, autoProvider);
      }
    }
  }
  if (overrides) {
    for (const [key, provider] of Object.entries(overrides)) {
      const normalizedKey = normalizeMediaProviderId(key);
      const existing = registry.get(normalizedKey);
      const merged = existing
        ? {
            ...existing,
            ...provider,
            capabilities: provider.capabilities ?? existing.capabilities,
          }
        : provider;
      registry.set(normalizedKey, merged);
    }
  }
  return registry;
}

export function getMediaUnderstandingProvider(
  id: string,
  registry: Map<string, MediaUnderstandingProvider>,
): MediaUnderstandingProvider | undefined {
  return registry.get(normalizeMediaProviderId(id));
}
