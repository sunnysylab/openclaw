import {
  createAccountListHelpers,
  normalizeAccountId,
  resolveMergedAccountConfig,
} from "openclaw/plugin-sdk/account-resolution";
import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import { isBlockedHostnameOrIp } from "openclaw/plugin-sdk/ssrf-runtime";
import { hasConfiguredSecretInput, normalizeSecretInputString } from "./secret-input.js";
import { normalizeBlueBubblesServerUrl, type BlueBubblesAccountConfig } from "./types.js";

export type ResolvedBlueBubblesAccount = {
  accountId: string;
  enabled: boolean;
  name?: string;
  config: BlueBubblesAccountConfig;
  configured: boolean;
  baseUrl?: string;
};

const {
  listAccountIds: listBlueBubblesAccountIds,
  resolveDefaultAccountId: resolveDefaultBlueBubblesAccountId,
} = createAccountListHelpers("bluebubbles");
export { listBlueBubblesAccountIds, resolveDefaultBlueBubblesAccountId };

function mergeBlueBubblesAccountConfig(
  cfg: OpenClawConfig,
  accountId: string,
): BlueBubblesAccountConfig {
  const merged = resolveMergedAccountConfig<BlueBubblesAccountConfig>({
    channelConfig: cfg.channels?.bluebubbles as BlueBubblesAccountConfig | undefined,
    accounts: cfg.channels?.bluebubbles?.accounts as
      | Record<string, Partial<BlueBubblesAccountConfig>>
      | undefined,
    accountId,
    omitKeys: ["defaultAccount"],
  });
  return { ...merged, chunkMode: merged.chunkMode ?? "length" };
}

export function resolveBlueBubblesAccount(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}): ResolvedBlueBubblesAccount {
  const accountId = normalizeAccountId(params.accountId);
  const baseEnabled = params.cfg.channels?.bluebubbles?.enabled;
  const merged = mergeBlueBubblesAccountConfig(params.cfg, accountId);
  const accountEnabled = merged.enabled !== false;
  const serverUrl = normalizeSecretInputString(merged.serverUrl);
  const password = normalizeSecretInputString(merged.password);
  const configured = Boolean(serverUrl && hasConfiguredSecretInput(merged.password));
  const baseUrl = serverUrl ? normalizeBlueBubblesServerUrl(serverUrl) : undefined;
  return {
    accountId,
    enabled: baseEnabled !== false && accountEnabled,
    name: merged.name?.trim() || undefined,
    config: merged,
    configured,
    baseUrl,
  };
}

export function resolveBlueBubblesEffectiveAllowPrivateNetwork(params: {
  baseUrl?: string;
  allowPrivateNetwork?: boolean;
}): boolean {
  if (params.allowPrivateNetwork === true) {
    return true;
  }
  if (params.allowPrivateNetwork === false) {
    return false;
  }
  if (!params.baseUrl) {
    return false;
  }
  try {
    const hostname = new URL(normalizeBlueBubblesServerUrl(params.baseUrl)).hostname.trim();
    return Boolean(hostname) && isBlockedHostnameOrIp(hostname);
  } catch {
    return false;
  }
}

export function listEnabledBlueBubblesAccounts(cfg: OpenClawConfig): ResolvedBlueBubblesAccount[] {
  return listBlueBubblesAccountIds(cfg)
    .map((accountId) => resolveBlueBubblesAccount({ cfg, accountId }))
    .filter((account) => account.enabled);
}
