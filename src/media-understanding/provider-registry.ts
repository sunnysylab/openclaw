import type { OpenClawConfig } from "../config/config.js";
import { resolvePluginCapabilityProviders } from "../plugins/capability-provider-runtime.js";
import { normalizeMediaProviderId } from "./provider-id.js";
import type { MediaUnderstandingCapability, MediaUnderstandingProvider } from "./types.js";

/**
 * Extract provider model config type from OpenClawConfig.
 * This ensures type safety when accessing cfg.models.providers.*.models.
 */
type ProviderModelConfig = NonNullable<
  NonNullable<
    NonNullable<OpenClawConfig["models"]>["providers"]
  >[string]
>["models"] extends (infer T)[] | undefined
  ? NonNullable<T>
  : never;

/**
 * Extract provider config type from OpenClawConfig.
 * This ensures type safety when accessing cfg.models.providers.*.
 */
type ProviderConfig = NonNullable<
  NonNullable<
    NonNullable<OpenClawConfig["models"]>["providers"]
  >[string]
>;

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

/**
 * Detect capabilities from configured provider models.
 * Scans cfg.models.providers.*.models to find models with input: ["image"], ["audio"], etc.
 *
 * NOTE: Only "image" capability is currently supported for auto-registration because
 * it has a runtime fallback (describeImageWithModel). Audio and video require explicit
 * provider functions (transcribeAudio, describeVideo) which are not available for
 * auto-registered providers. Registering audio/video without these functions would
 * cause runtime errors.
 */
function detectCapabilitiesFromConfig(
  providerConfig: ProviderConfig,
): MediaUnderstandingCapability[] {
  const capabilities: Set<MediaUnderstandingCapability> = new Set();
  const models = providerConfig.models ?? [];
  for (const model of models) {
    const input = model.input ?? [];
    // Only auto-register "image" capability - it has describeImageWithModel fallback
    // Audio and video require explicit provider functions that auto-registered providers lack
    if (input.includes("image")) {
      capabilities.add("image");
    }
  }
  return Array.from(capabilities);
}

export { normalizeMediaProviderId } from "./provider-id.js";

export function buildMediaUnderstandingRegistry(
  overrides?: Record<string, MediaUnderstandingProvider>,
  cfg?: OpenClawConfig,
): Map<string, MediaUnderstandingProvider> {
  const registry = new Map<string, MediaUnderstandingProvider>();

  // 1. Register providers from plugins
  for (const provider of resolvePluginCapabilityProviders({
    key: "mediaUnderstandingProviders",
    cfg,
  })) {
    mergeProviderIntoRegistry(registry, provider);
  }

  // 2. Auto-register custom providers from config with models that support media
  // This allows providers like "bailian" with models having input: ["image"] to work
  if (cfg?.models?.providers) {
    for (const [providerId, providerConfig] of Object.entries(cfg.models.providers)) {
      const normalizedId = normalizeMediaProviderId(providerId);

      // Skip if already registered via plugin
      if (registry.has(normalizedId)) {
        continue;
      }

      const capabilities = detectCapabilitiesFromConfig(providerConfig as ProviderConfig);
      if (capabilities.length > 0) {
        // Create a minimal provider entry - actual image/audio handling is done by
        // describeImageWithModel/transcribeAudio functions that read from config
        registry.set(normalizedId, {
          id: normalizedId,
          capabilities,
        });
      }
    }
  }

  // 3. Apply explicit overrides
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
