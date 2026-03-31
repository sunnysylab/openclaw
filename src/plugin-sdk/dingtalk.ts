// Private helper surface for the bundled dingtalk plugin.
// Keep this list additive and scoped to symbols used under extensions/dingtalk.

import { createOptionalChannelSetupSurface } from "./channel-setup.js";

export {
  createActionGate,
  jsonResult,
  readNumberParam,
  readReactionParams,
  readStringParam,
} from "../agents/tools/common.js";
export {
  deleteAccountFromConfigSection,
  setAccountEnabledInConfigSection,
} from "../channels/plugins/config-helpers.js";
export { buildComputedAccountStatusSnapshot } from "./status-helpers.js";
export { buildChannelConfigSchema } from "../channels/plugins/config-schema.js";
export { createAccountStatusSink, runPassiveAccountLifecycle } from "./channel-lifecycle.js";
export { resolveChannelMediaMaxBytes } from "../channels/plugins/media-limits.js";
export {
  addWildcardAllowFrom,
  mergeAllowFromEntries,
  splitSetupEntries,
} from "../channels/plugins/setup-wizard-helpers.js";
export { PAIRING_APPROVED_MESSAGE } from "../channels/plugins/pairing-message.js";
export {
  applyAccountNameToChannelSection,
  applySetupAccountConfigPatch,
  migrateBaseNameToDefaultAccount,
} from "../channels/plugins/setup-helpers.js";
export { createAccountListHelpers } from "../channels/plugins/account-helpers.js";
export type {
  ChannelAccountSnapshot,
  ChannelMessageActionAdapter,
  ChannelMessageActionName,
  ChannelStatusIssue,
} from "../channels/plugins/types.js";
export type { ChannelPlugin } from "../channels/plugins/types.plugin.js";
export { createChannelReplyPipeline } from "./channel-reply-pipeline.js";
export type { OpenClawConfig } from "../config/config.js";
export type { DingTalkAccountConfig, DingTalkConfig } from "../config/types.dingtalk.js";
export { DingTalkConfigSchema } from "../config/zod-schema.providers-core.js";
export { missingTargetError } from "../infra/outbound/target-errors.js";
export { emptyPluginConfigSchema } from "../plugins/config-schema.js";
export type { PluginRuntime } from "../plugins/runtime/types.js";
export type { OpenClawPluginApi } from "../plugins/types.js";
export { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "../routing/session-key.js";
export { formatDocsLink } from "../terminal/links.js";
export type { WizardPrompter } from "../wizard/prompts.js";
export { resolveInboundRouteEnvelopeBuilderWithRuntime } from "./inbound-envelope.js";
export { createChannelPairingController } from "./channel-pairing.js";
export { extractToolSend } from "./tool-send.js";
export {
  beginWebhookRequestPipelineOrReject,
  createWebhookInFlightLimiter,
  readJsonWebhookBodyOrReject,
  registerWebhookTargetWithPluginRoute,
  resolveWebhookPath,
  resolveWebhookTargetWithAuthOrReject,
  resolveWebhookTargets,
  type WebhookInFlightLimiter,
  withResolvedWebhookRequestPipeline,
} from "./webhook-ingress.js";
export { buildPassiveProbedChannelStatusSummary } from "./extension-shared.js";
export {
  createComputedAccountStatusAdapter,
  createDefaultChannelRuntimeState,
} from "./status-helpers.js";
export {
  adaptScopedAccountAccessor,
  createScopedChannelConfigAdapter,
} from "./channel-config-helpers.js";
export { formatNormalizedAllowFromEntries } from "./allow-from.js";
export { createLazyRuntimeNamedExport } from "./lazy-runtime.js";
export { createChatChannelPlugin } from "./core.js";
export { describeAccountSnapshot } from "../channels/plugins/account-helpers.js";
export { resolveMergedAccountConfig } from "../channels/plugins/account-helpers.js";
export { resolveAccountEntry } from "../routing/account-lookup.js";
export { createPluginRuntimeStore } from "./runtime-store.js";

const dingtalkSetup = createOptionalChannelSetupSurface({
  channel: "dingtalk",
  label: "DingTalk",
  npmSpec: "@openclaw/dingtalk",
  docsPath: "/channels/dingtalk",
});

export const dingtalkSetupAdapter = dingtalkSetup.setupAdapter;
export const dingtalkSetupWizard = dingtalkSetup.setupWizard;
