import {
  createAccountListHelpers,
  DEFAULT_ACCOUNT_ID,
  normalizeAccountId,
  resolveMergedAccountConfig,
} from "openclaw/plugin-sdk/account-resolution";
import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import type { DingTalkAccountConfig } from "./types.config.js";

export type DingTalkCredentialSource = "appKey" | "env" | "none";

export type ResolvedDingTalkAccount = {
  accountId: string;
  name?: string;
  enabled: boolean;
  config: DingTalkAccountConfig;
  credentialSource: DingTalkCredentialSource;
  appKey?: string;
  appSecret?: string;
  clientId?: string;
  clientSecret?: string;
};

const ENV_APP_KEY = "DINGTALK_APP_KEY";
const ENV_APP_SECRET = "DINGTALK_APP_SECRET";
const ENV_CLIENT_ID = "DINGTALK_CLIENT_ID";
const ENV_CLIENT_SECRET = "DINGTALK_CLIENT_SECRET";

const {
  listAccountIds: listDingTalkAccountIds,
  resolveDefaultAccountId: resolveDefaultDingTalkAccountId,
} = createAccountListHelpers("dingtalk");
export { listDingTalkAccountIds, resolveDefaultDingTalkAccountId };

function mergeDingTalkAccountConfig(cfg: OpenClawConfig, accountId: string): DingTalkAccountConfig {
  const raw = cfg.channels?.["dingtalk"] ?? {};
  return resolveMergedAccountConfig<DingTalkAccountConfig>({
    channelConfig: raw as DingTalkAccountConfig,
    accounts: (raw as { accounts?: Record<string, Partial<DingTalkAccountConfig>> }).accounts,
    accountId,
    omitKeys: ["defaultAccount"],
  });
}

function resolveCredentials(params: { accountId: string; account: DingTalkAccountConfig }): {
  appKey?: string;
  appSecret?: string;
  clientId?: string;
  clientSecret?: string;
  source: DingTalkCredentialSource;
} {
  const { account, accountId } = params;

  // New Stream API uses clientId/clientSecret
  const clientId = account.clientId?.trim();
  const clientSecret = account.clientSecret?.trim();
  if (clientId && clientSecret) {
    return { clientId, clientSecret, source: "appKey" };
  }

  // Legacy webhook mode uses appKey/appSecret
  const appKey = account.appKey?.trim();
  const appSecret = account.appSecret?.trim();
  if (appKey && appSecret) {
    return { appKey, appSecret, source: "appKey" };
  }

  // Fall back to environment variables for default account
  if (accountId === DEFAULT_ACCOUNT_ID) {
    const envClientId = process.env[ENV_CLIENT_ID]?.trim();
    const envClientSecret = process.env[ENV_CLIENT_SECRET]?.trim();
    if (envClientId && envClientSecret) {
      return { clientId: envClientId, clientSecret: envClientSecret, source: "env" };
    }
    const envKey = process.env[ENV_APP_KEY]?.trim();
    const envSecret = process.env[ENV_APP_SECRET]?.trim();
    if (envKey && envSecret) {
      return { appKey: envKey, appSecret: envSecret, source: "env" };
    }
  }

  return { source: "none" };
}

export function resolveDingTalkAccount(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}): ResolvedDingTalkAccount {
  const accountId = normalizeAccountId(params.accountId);
  const baseEnabled =
    (params.cfg.channels?.["dingtalk"] as { enabled?: boolean } | undefined)?.enabled !== false;
  const merged = mergeDingTalkAccountConfig(params.cfg, accountId);
  const accountEnabled = merged.enabled !== false;
  const enabled = baseEnabled && accountEnabled;
  const creds = resolveCredentials({ accountId, account: merged });

  return {
    accountId,
    name: merged.name?.trim() || undefined,
    enabled,
    config: merged,
    credentialSource: creds.source,
    appKey: creds.appKey,
    appSecret: creds.appSecret,
    clientId: creds.clientId,
    clientSecret: creds.clientSecret,
  };
}

export function listEnabledDingTalkAccounts(cfg: OpenClawConfig): ResolvedDingTalkAccount[] {
  return listDingTalkAccountIds(cfg)
    .map((accountId) => resolveDingTalkAccount({ cfg, accountId }))
    .filter((account) => account.enabled);
}
