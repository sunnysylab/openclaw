import {
  applySetupAccountConfigPatch,
  createStandardChannelSetupStatus,
  DEFAULT_ACCOUNT_ID,
  formatDocsLink,
  type ChannelSetupWizard,
  type OpenClawConfig,
} from "openclaw/plugin-sdk/setup";
import { listDingTalkAccountIds, resolveDingTalkAccount } from "./accounts.js";

const channel = "dingtalk" as const;
const ENV_CLIENT_ID = "DINGTALK_CLIENT_ID";
const ENV_CLIENT_SECRET = "DINGTALK_CLIENT_SECRET";
const USE_ENV_FLAG = "__dingtalkUseEnv";

export { dingtalkSetupAdapter } from "./setup-core.js";

export const dingtalkSetupWizard: ChannelSetupWizard = {
  channel,
  status: createStandardChannelSetupStatus({
    channelLabel: "DingTalk",
    configuredLabel: "configured",
    unconfiguredLabel: "needs credentials",
    configuredHint: "configured",
    unconfiguredHint: "needs auth",
    includeStatusLine: true,
    resolveConfigured: ({ cfg }: { cfg: OpenClawConfig }) =>
      listDingTalkAccountIds(cfg).some(
        (accountId) => resolveDingTalkAccount({ cfg, accountId }).credentialSource !== "none",
      ),
  }),
  introNote: {
    title: "DingTalk setup",
    lines: [
      "DingTalk bots use a clientId (App Key) + clientSecret (App Secret) from the DingTalk Open Platform.",
      "The bot receives messages via an HTTPS webhook registered in your app's event subscription settings.",
      "Signature verification uses the appSecret from the security settings.",
      `Docs: ${formatDocsLink("/channels/dingtalk", "dingtalk")}`,
    ],
  },
  prepare: async ({ cfg, accountId, credentialValues, prompter }) => {
    const envReady =
      accountId === DEFAULT_ACCOUNT_ID &&
      Boolean(process.env[ENV_CLIENT_ID]) &&
      Boolean(process.env[ENV_CLIENT_SECRET]);

    if (envReady) {
      const useEnv = await prompter.confirm({
        message: "Use DINGTALK_CLIENT_ID / DINGTALK_CLIENT_SECRET env vars?",
        initialValue: true,
      });
      if (useEnv) {
        return {
          cfg: applySetupAccountConfigPatch({
            cfg,
            channelKey: channel,
            accountId,
            patch: {},
          }),
          credentialValues: { ...credentialValues, [USE_ENV_FLAG]: "1" },
        };
      }
    }

    return {
      credentialValues: { ...credentialValues, [USE_ENV_FLAG]: "0" },
    };
  },
  credentials: [],
  textInputs: [
    {
      inputKey: "botToken",
      message: "DingTalk App Key (clientId)",
      placeholder: "dingXXXXXXXXXXX",
      shouldPrompt: ({ credentialValues }) => credentialValues[USE_ENV_FLAG] !== "1",
      validate: ({ value }) => (String(value ?? "").trim() ? undefined : "Required"),
      normalizeValue: ({ value }) => String(value).trim(),
      applySet: async ({ cfg, accountId, value }) =>
        applySetupAccountConfigPatch({
          cfg,
          channelKey: channel,
          accountId,
          patch: { clientId: value },
        }),
    },
    {
      inputKey: "token",
      message: "DingTalk App Secret (clientSecret)",
      placeholder: "Your DingTalk app secret",
      shouldPrompt: ({ credentialValues }) => credentialValues[USE_ENV_FLAG] !== "1",
      validate: ({ value }) => (String(value ?? "").trim() ? undefined : "Required"),
      normalizeValue: ({ value }) => String(value).trim(),
      applySet: async ({ cfg, accountId, value }) =>
        applySetupAccountConfigPatch({
          cfg,
          channelKey: channel,
          accountId,
          patch: { clientSecret: value },
        }),
    },
  ],
  finalize: async ({ cfg, accountId, prompter }) => {
    const webhookUrl = await prompter.text({
      message: "Webhook URL (your public HTTPS endpoint for DingTalk events)",
      placeholder: "https://your-host/dingtalk",
      validate: (value) =>
        String(value ?? "").trim()
          ? undefined
          : "Required — must be an HTTPS URL accessible from DingTalk servers",
    });
    return {
      cfg: applySetupAccountConfigPatch({
        cfg,
        channelKey: channel,
        accountId,
        patch: { webhookUrl: String(webhookUrl).trim() },
      }),
    };
  },
};
