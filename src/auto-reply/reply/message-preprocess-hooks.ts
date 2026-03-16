import type { OpenClawConfig } from "../../config/config.js";
import { logVerbose } from "../../globals.js";
import { fireAndForgetHook } from "../../hooks/fire-and-forget.js";
import {
  createInternalHookEvent,
  hasEnrichHooks,
  triggerEnrichHook,
  triggerInternalHook,
} from "../../hooks/internal-hooks.js";
import {
  deriveInboundMessageHookContext,
  toInternalMessageEnrichContext,
  toInternalMessagePreprocessedContext,
  toInternalMessageTranscribedContext,
} from "../../hooks/message-hook-mappers.js";
import type { FinalizedMsgContext } from "../templating.js";

export async function emitPreAgentMessageHooks(params: {
  ctx: FinalizedMsgContext;
  cfg: OpenClawConfig;
  isFastTestEnv: boolean;
}): Promise<void> {
  if (params.isFastTestEnv) {
    return;
  }
  const sessionKey = params.ctx.SessionKey?.trim();
  if (!sessionKey) {
    return;
  }

  const canonical = deriveInboundMessageHookContext(params.ctx);
  if (canonical.transcript) {
    fireAndForgetHook(
      triggerInternalHook(
        createInternalHookEvent(
          "message",
          "transcribed",
          sessionKey,
          toInternalMessageTranscribedContext(canonical, params.cfg),
        ),
      ),
      "get-reply: message:transcribed internal hook failed",
    );
  }

  fireAndForgetHook(
    triggerInternalHook(
      createInternalHookEvent(
        "message",
        "preprocessed",
        sessionKey,
        toInternalMessagePreprocessedContext(canonical, params.cfg),
      ),
    ),
    "get-reply: message:preprocessed internal hook failed",
  );

  if (!hasEnrichHooks()) {
    return;
  }

  try {
    const enrichedMetadata = await triggerEnrichHook(
      createInternalHookEvent(
        "message",
        "enrich",
        sessionKey,
        toInternalMessageEnrichContext(canonical),
      ),
    );
    if (Object.keys(enrichedMetadata).length === 0) {
      return;
    }

    const enrichBlock = [
      "Enriched context (hook-injected metadata):",
      "```json",
      JSON.stringify(enrichedMetadata, null, 2),
      "```",
    ].join("\n");
    if (!Array.isArray(params.ctx.UntrustedContext)) {
      params.ctx.UntrustedContext = [];
    }
    params.ctx.UntrustedContext.push(enrichBlock);
    logVerbose(
      `get-reply: message:enrich injected ${Object.keys(enrichedMetadata).length} metadata key(s)`,
    );
  } catch (err) {
    logVerbose(`get-reply: message:enrich internal hook failed: ${String(err)}`);
  }
}
