import type { IncomingMessage, ServerResponse } from "node:http";
import {
  readJsonWebhookBodyOrReject,
  withResolvedWebhookRequestPipeline,
  type WebhookInFlightLimiter,
} from "../runtime-api.js";
import type { DingTalkWebhookTarget } from "./monitor-types.js";
import { verifyDingTalkSignature } from "./sign.js";
import type { DingTalkInboundEvent } from "./types.js";

/** Parse and verify an inbound DingTalk webhook request. */
export function createDingTalkWebhookRequestHandler(params: {
  webhookTargets: Map<string, DingTalkWebhookTarget[]>;
  webhookInFlightLimiter: WebhookInFlightLimiter;
  processEvent: (event: DingTalkInboundEvent, target: DingTalkWebhookTarget) => Promise<void>;
}): (req: IncomingMessage, res: ServerResponse) => Promise<boolean> {
  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    return await withResolvedWebhookRequestPipeline({
      req,
      res,
      targetsByPath: params.webhookTargets,
      allowMethods: ["POST"],
      requireJsonContentType: true,
      inFlightLimiter: params.webhookInFlightLimiter,
      handle: async ({ targets }) => {
        // DingTalk sends signature headers: timestamp, nonce, sign
        const timestamp = String(
          req.headers["timestamp"] ?? req.headers["x-dingtalk-timestamp"] ?? "",
        );
        const nonce = String(req.headers["nonce"] ?? req.headers["x-dingtalk-nonce"] ?? "");
        const signature = String(req.headers["sign"] ?? req.headers["x-dingtalk-signature"] ?? "");

        const body = await readJsonWebhookBodyOrReject({
          req,
          res,
          profile: "post-auth",
          emptyObjectOnEmpty: false,
          invalidJsonMessage: "invalid payload",
        });
        if (!body.ok) {
          return true;
        }

        const raw = body.value;
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
          res.statusCode = 400;
          res.end("invalid payload");
          return true;
        }

        const event = raw as DingTalkInboundEvent;

        // Find the matching target and verify signature if appSecret is configured.
        let selectedTarget: DingTalkWebhookTarget | null = null;
        for (const target of targets) {
          const secret = target.account.appSecret ?? target.account.clientSecret;
          if (secret && timestamp && signature) {
            const valid = verifyDingTalkSignature({
              appSecret: secret,
              timestamp,
              nonce: nonce || undefined,
              signature,
            });
            if (!valid) {
              continue;
            }
          }
          // Accept first matching target when no signature check is configured.
          selectedTarget = target;
          break;
        }

        if (!selectedTarget) {
          res.statusCode = 401;
          res.end("unauthorized");
          return true;
        }

        const dispatchTarget = selectedTarget;
        dispatchTarget.statusSink?.({ lastInboundAt: Date.now() });

        params.processEvent(event, dispatchTarget).catch((err) => {
          dispatchTarget.runtime.error?.(
            `[${dispatchTarget.account.accountId}] DingTalk webhook failed: ${String(err)}`,
          );
        });

        // DingTalk expects a 200 empty body or {"msgtype":"empty"} on success.
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ msgtype: "empty" }));
        return true;
      },
    });
  };
}
