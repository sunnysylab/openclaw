import {
  createChannelReplyPipeline,
  createWebhookInFlightLimiter,
  registerWebhookTargetWithPluginRoute,
  resolveInboundRouteEnvelopeBuilderWithRuntime,
  resolveWebhookPath,
} from "../runtime-api.js";
import { resolveDingTalkAccount, type ResolvedDingTalkAccount } from "./accounts.js";
import type { DingTalkMonitorOptions, DingTalkWebhookTarget } from "./monitor-types.js";
import { createDingTalkWebhookRequestHandler } from "./monitor-webhook.js";
import { getDingTalkRuntime } from "./runtime.js";
import { buildTextMessage, sendDingTalkSessionWebhookMessage } from "./send.js";
import type { DingTalkInboundEvent } from "./types.js";

const webhookTargets = new Map<string, DingTalkWebhookTarget[]>();
const webhookInFlightLimiter = createWebhookInFlightLimiter();

const dingtalkWebhookRequestHandler = createDingTalkWebhookRequestHandler({
  webhookTargets,
  webhookInFlightLimiter,
  processEvent: async (event, target) => {
    await processDingTalkEvent(event, target);
  },
});

export async function handleDingTalkWebhookRequest(
  req: import("node:http").IncomingMessage,
  res: import("node:http").ServerResponse,
): Promise<boolean> {
  return dingtalkWebhookRequestHandler(req, res);
}

export function registerDingTalkWebhookTarget(target: DingTalkWebhookTarget): () => void {
  return registerWebhookTargetWithPluginRoute({
    targetsByPath: webhookTargets,
    target,
    route: {
      auth: "plugin",
      match: "exact",
      pluginId: "dingtalk",
      source: "dingtalk-webhook",
      accountId: target.account.accountId,
      log: target.runtime.log,
      handler: async (req, res) => {
        const handled = await handleDingTalkWebhookRequest(req, res);
        if (!handled && !res.headersSent) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Not Found");
        }
      },
    },
  }).unregister;
}

export function resolveDingTalkWebhookPath(params: { account: ResolvedDingTalkAccount }): string {
  return (
    resolveWebhookPath({
      webhookPath: params.account.config.webhookPath,
      webhookUrl: params.account.config.webhookUrl,
      defaultPath: `/dingtalk/${params.account.accountId}`,
    }) ?? `/dingtalk/${params.account.accountId}`
  );
}

async function processDingTalkEvent(
  event: DingTalkInboundEvent,
  target: DingTalkWebhookTarget,
): Promise<void> {
  const { account, config, runtime, core } = target;

  // Only handle text messages for now; skip other event types.
  if (event.msgtype !== "text") {
    runtime.log?.(`[${account.accountId}] skipping non-text message type: ${event.msgtype}`);
    return;
  }

  const textContent = event.text?.content?.trim() ?? "";
  if (!textContent) {
    return;
  }

  // Identify sender - prefer staffId, fallback to dingtalkId
  const senderId = event.senderStaffId?.trim() || event.senderDingtalkId?.trim() || "unknown";
  const senderNick = event.senderNick?.trim() || senderId;
  // Group chat = conversationType "2"
  const isGroup = event.conversationType === "2";
  const chatId = event.conversationId?.trim() ?? senderId;

  const { route, buildEnvelope } = resolveInboundRouteEnvelopeBuilderWithRuntime({
    cfg: config,
    channel: "dingtalk",
    accountId: account.accountId,
    peer: {
      kind: isGroup ? ("group" as const) : ("direct" as const),
      id: chatId,
    },
    runtime: core.channel,
  });

  const fromLabel = isGroup ? event.conversationTitle?.trim() || `group:${chatId}` : senderNick;
  const { storePath, body } = buildEnvelope({
    channel: "DingTalk",
    from: fromLabel,
    body: textContent,
  });

  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: body,
    BodyForAgent: textContent,
    RawBody: textContent,
    CommandBody: textContent,
    From: `dingtalk:${senderId}`,
    To: `dingtalk:${chatId}`,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: isGroup ? "channel" : "direct",
    ConversationLabel: fromLabel,
    SenderName: senderNick,
    SenderId: senderId,
    Provider: "dingtalk",
    Surface: "dingtalk",
    MessageSid: event.msgId,
    MessageSidFull: event.msgId,
    OriginatingChannel: "dingtalk",
    OriginatingTo: `dingtalk:${chatId}`,
  });

  void core.channel.session
    .recordSessionMetaFromInbound({
      storePath,
      sessionKey: ctxPayload.SessionKey ?? route.sessionKey,
      ctx: ctxPayload,
    })
    .catch((err) => {
      runtime.error?.(`dingtalk: failed updating session meta: ${String(err)}`);
    });

  const { onModelSelected, ...replyPipeline } = createChannelReplyPipeline({
    cfg: config,
    agentId: route.agentId,
    channel: "dingtalk",
    accountId: route.accountId,
  });

  // Capture session webhook before async dispatch (it may expire)
  const sessionWebhook = event.sessionWebhook?.trim();
  const expiredAt = event.sessionWebhookExpiredTime ?? 0;

  await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: ctxPayload,
    cfg: config,
    dispatcherOptions: {
      ...replyPipeline,
      deliver: async (payload) => {
        const text =
          typeof payload === "string" ? payload : ((payload as { text?: string }).text ?? "");
        const now = Date.now();
        if (sessionWebhook && expiredAt > now) {
          await sendDingTalkSessionWebhookMessage({
            sessionWebhookUrl: sessionWebhook,
            message: buildTextMessage(text),
          });
          return;
        }
        runtime.error?.(
          `[${account.accountId}] session webhook expired or missing; cannot send reply to ${senderId}`,
        );
      },
      onError: (err: unknown, info: { kind: string }) => {
        runtime.error?.(
          `[${account.accountId}] DingTalk ${info.kind} reply failed: ${String(err)}`,
        );
      },
    },
  });
}

export function monitorDingTalkProvider(options: DingTalkMonitorOptions): () => void {
  const core = getDingTalkRuntime();
  const webhookPath = resolveWebhookPath({
    webhookPath: options.webhookPath,
    webhookUrl: options.webhookUrl,
    defaultPath: `/dingtalk/${options.account.accountId}`,
  });
  if (!webhookPath) {
    options.runtime.error?.(`[${options.account.accountId}] invalid webhook path`);
    return () => {};
  }

  const unregisterTarget = registerDingTalkWebhookTarget({
    account: options.account,
    config: options.config,
    runtime: options.runtime,
    core,
    path: webhookPath,
    statusSink: options.statusSink,
  });

  return () => {
    unregisterTarget();
  };
}

export async function startDingTalkMonitor(params: DingTalkMonitorOptions): Promise<() => void> {
  return monitorDingTalkProvider(params);
}

export { resolveDingTalkAccount };
