import { describeAccountSnapshot } from "openclaw/plugin-sdk/account-helpers";
import { formatNormalizedAllowFromEntries } from "openclaw/plugin-sdk/allow-from";
import {
  adaptScopedAccountAccessor,
  createScopedChannelConfigAdapter,
} from "openclaw/plugin-sdk/channel-config-helpers";
import { createChatChannelPlugin } from "openclaw/plugin-sdk/core";
import { buildPassiveProbedChannelStatusSummary } from "openclaw/plugin-sdk/extension-shared";
import { createLazyRuntimeNamedExport } from "openclaw/plugin-sdk/lazy-runtime";
import {
  createComputedAccountStatusAdapter,
  createDefaultChannelRuntimeState,
} from "openclaw/plugin-sdk/status-helpers";
import {
  buildChannelConfigSchema,
  DEFAULT_ACCOUNT_ID,
  createAccountStatusSink,
  missingTargetError,
  PAIRING_APPROVED_MESSAGE,
  runPassiveAccountLifecycle,
  type ChannelStatusIssue,
} from "../runtime-api.js";
import { DingTalkConfigSchema } from "../runtime-api.js";
import {
  listDingTalkAccountIds,
  resolveDefaultDingTalkAccountId,
  resolveDingTalkAccount,
  type ResolvedDingTalkAccount,
} from "./accounts.js";
import { dingtalkSetupAdapter } from "./setup-core.js";
import { dingtalkSetupWizard } from "./setup-surface.js";

const loadDingTalkChannelRuntime = createLazyRuntimeNamedExport(
  () => import("./channel.runtime.js"),
  "dingtalkChannelRuntime",
);

const dingtalkConfigAdapter = createScopedChannelConfigAdapter<ResolvedDingTalkAccount>({
  sectionKey: "dingtalk",
  listAccountIds: listDingTalkAccountIds,
  resolveAccount: adaptScopedAccountAccessor(resolveDingTalkAccount),
  defaultAccountId: resolveDefaultDingTalkAccountId,
  clearBaseFields: [
    "clientId",
    "clientSecret",
    "appKey",
    "appSecret",
    "webhookPath",
    "webhookUrl",
    "robotCode",
    "name",
  ],
  resolveAllowFrom: (account: ResolvedDingTalkAccount) =>
    account.config.dm?.allowFrom as string[] | undefined,
  formatAllowFrom: (allowFrom) =>
    formatNormalizedAllowFromEntries({
      allowFrom,
      normalizeEntry: (entry) => entry.trim().toLowerCase() || null,
    }),
});

export const dingtalkPlugin = createChatChannelPlugin({
  base: {
    id: "dingtalk",
    meta: {
      id: "dingtalk",
      label: "DingTalk",
      selectionLabel: "DingTalk (Stream API)",
      docsPath: "/channels/dingtalk",
      docsLabel: "dingtalk",
      blurb: "DingTalk enterprise messaging bot via Stream API or webhook.",
      aliases: ["dingding", "ding-talk"],
    },
    setup: dingtalkSetupAdapter,
    setupWizard: dingtalkSetupWizard,
    capabilities: {
      chatTypes: ["direct", "group"],
      reactions: false,
      threads: false,
      media: false,
      nativeCommands: false,
      blockStreaming: true,
    },
    streaming: {
      blockStreamingCoalesceDefaults: { minChars: 1000, idleMs: 1000 },
    },
    reload: { configPrefixes: ["channels.dingtalk"] },
    configSchema: buildChannelConfigSchema(DingTalkConfigSchema),
    config: {
      ...dingtalkConfigAdapter,
      isConfigured: (account) => account.credentialSource !== "none",
      describeAccount: (account) =>
        describeAccountSnapshot({
          account,
          configured: account.credentialSource !== "none",
          extra: {
            credentialSource: account.credentialSource,
          },
        }),
    },
    messaging: {
      normalizeTarget: (raw) => raw?.trim() || undefined,
      targetResolver: {
        looksLikeId: (raw) => Boolean(raw?.trim()),
        hint: "<staffId or dingtalkId>",
      },
    },
    status: createComputedAccountStatusAdapter<ResolvedDingTalkAccount>({
      defaultRuntime: createDefaultChannelRuntimeState(DEFAULT_ACCOUNT_ID),
      collectStatusIssues: (accounts): ChannelStatusIssue[] =>
        accounts.flatMap((entry) => {
          const accountId = String(entry.accountId ?? DEFAULT_ACCOUNT_ID);
          const enabled = entry.enabled !== false;
          const configured = entry.configured === true;
          if (!enabled || !configured) {
            return [];
          }
          const issues: ChannelStatusIssue[] = [];
          if (!entry.webhookPath && !entry.webhookUrl) {
            issues.push({
              channel: "dingtalk",
              accountId,
              kind: "config",
              message:
                "DingTalk webhook path is not configured (set channels.dingtalk.webhookUrl).",
              fix: "Set channels.dingtalk.webhookUrl to your HTTPS endpoint.",
            });
          }
          return issues;
        }),
      buildChannelSummary: ({ snapshot }) =>
        buildPassiveProbedChannelStatusSummary(snapshot, {
          credentialSource: snapshot.credentialSource ?? "none",
          webhookPath: snapshot.webhookPath ?? null,
          webhookUrl: snapshot.webhookUrl ?? null,
        }),
      probeAccount: async ({ account }) =>
        (await loadDingTalkChannelRuntime()).probeDingTalk(account),
      resolveAccountSnapshot: ({ account }) => ({
        accountId: account.accountId,
        name: account.name,
        enabled: account.enabled,
        configured: account.credentialSource !== "none",
        extra: {
          credentialSource: account.credentialSource,
          webhookPath: account.config.webhookPath,
          webhookUrl: account.config.webhookUrl,
          dmPolicy: (account.config.dm as { policy?: string } | undefined)?.policy ?? "pairing",
        },
      }),
    }),
    gateway: {
      startAccount: async (ctx) => {
        const account = ctx.account;
        const statusSink = createAccountStatusSink({
          accountId: account.accountId,
          setStatus: ctx.setStatus,
        });
        ctx.log?.info(`[${account.accountId}] starting DingTalk webhook`);
        const { resolveDingTalkWebhookPath, startDingTalkMonitor } =
          await loadDingTalkChannelRuntime();
        statusSink({
          running: true,
          lastStartAt: Date.now(),
          webhookPath: resolveDingTalkWebhookPath({ account }),
        });
        await runPassiveAccountLifecycle({
          abortSignal: ctx.abortSignal,
          start: async () =>
            await startDingTalkMonitor({
              account,
              config: ctx.cfg,
              runtime: ctx.runtime,
              abortSignal: ctx.abortSignal,
              webhookPath: account.config.webhookPath,
              webhookUrl: account.config.webhookUrl,
              statusSink,
            }),
          stop: async (_unregister: (() => void) | undefined) => {
            _unregister?.();
          },
          onStop: async () => {
            statusSink({ running: false, lastStopAt: Date.now() });
          },
        });
      },
    },
  },
  pairing: {
    text: {
      idLabel: "dingtalkStaffId",
      message: PAIRING_APPROVED_MESSAGE,
      normalizeAllowEntry: (entry) => entry.trim().toLowerCase(),
      notify: async ({ cfg, id }) => {
        // Proactive send is done via the OpenAPI; no-op here if not configured.
        const account = resolveDingTalkAccount({ cfg });
        if (account.credentialSource === "none") {
          return;
        }
        // Proactive pairing notify requires a stored context; log for now.
        void account;
        void id;
      },
    },
  },
  security: {
    dm: {
      channelKey: "dingtalk",
      resolvePolicy: (account) => (account.config.dm as { policy?: string } | undefined)?.policy,
      resolveAllowFrom: (account) =>
        (account.config.dm as { allowFrom?: string[] } | undefined)?.allowFrom,
      allowFromPathSuffix: "dm.",
      normalizeEntry: (raw) => raw.trim().toLowerCase(),
    },
  },
  outbound: {
    base: {
      deliveryMode: "direct",
      chunker: (text) => [text],
      chunkerMode: "text",
      textChunkLimit: 2000,
      resolveTarget: ({ to }) => {
        const trimmed = to?.trim() ?? "";
        if (trimmed) {
          return { ok: true, to: trimmed };
        }
        return {
          ok: false,
          error: missingTargetError("DingTalk", "<staffId or dingtalkId>"),
        };
      },
    },
    attachedResults: {
      channel: "dingtalk",
      sendText: async ({ cfg, to, text, accountId }) => {
        const account = resolveDingTalkAccount({ cfg, accountId });
        const { sendDingTalkProactiveMessage } = await loadDingTalkChannelRuntime();
        const result = await sendDingTalkProactiveMessage({
          account,
          staffId: to,
          message: { msgtype: "text", text: { content: text } },
        });
        return {
          messageId: result.processQueryKey ?? "",
          chatId: to,
        };
      },
    },
  },
});
