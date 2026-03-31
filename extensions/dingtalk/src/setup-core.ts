import { createPatchedAccountSetupAdapter, DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk/setup";

const channel = "dingtalk" as const;

export const dingtalkSetupAdapter = createPatchedAccountSetupAdapter({
  channelKey: channel,
  validateInput: ({ accountId, input }) => {
    if (input.useEnv && accountId !== DEFAULT_ACCOUNT_ID) {
      return "DINGTALK_CLIENT_ID env vars can only be used for the default account.";
    }
    if (!input.useEnv && !input.token && !input.botToken) {
      return "DingTalk requires --token (clientSecret) and --bot-token (clientId) or env vars.";
    }
    return null;
  },
  buildPatch: (input) => {
    if (input.useEnv) {
      return {};
    }
    const patch: Record<string, string> = {};
    // --bot-token = clientId (App Key), --token = clientSecret (App Secret)
    if (input.botToken) {
      patch["clientId"] = String(input.botToken).trim();
    }
    if (input.token) {
      patch["clientSecret"] = String(input.token).trim();
    }
    const webhookPath = input.webhookPath?.trim();
    const webhookUrl = input.webhookUrl?.trim();
    if (webhookPath) {
      patch["webhookPath"] = webhookPath;
    }
    if (webhookUrl) {
      patch["webhookUrl"] = webhookUrl;
    }
    return patch;
  },
});
