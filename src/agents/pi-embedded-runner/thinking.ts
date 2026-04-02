import type { AgentMessage } from "@mariozechner/pi-agent-core";

type AssistantContentBlock = Extract<AgentMessage, { role: "assistant" }>["content"][number];
type AssistantMessage = Extract<AgentMessage, { role: "assistant" }>;

export function isAssistantMessageWithContent(message: AgentMessage): message is AssistantMessage {
  return (
    !!message &&
    typeof message === "object" &&
    message.role === "assistant" &&
    Array.isArray(message.content)
  );
}

function isThinkingBlock(block: AssistantContentBlock): boolean {
  return (
    !!block &&
    typeof block === "object" &&
    ((block as { type?: unknown }).type === "thinking" ||
      (block as { type?: unknown }).type === "redacted_thinking")
  );
}

/**
 * Strip `type: "thinking"` and `type: "redacted_thinking"` content blocks from
 * all assistant messages except the latest one.
 *
 * Thinking blocks in the latest assistant turn are preserved verbatim so
 * providers that require replay signatures can continue the conversation.
 *
 * If a non-latest assistant message becomes empty after stripping, it is
 * replaced with a synthetic `{ type: "text", text: "" }` block to preserve
 * turn structure (some providers require strict user/assistant alternation).
 *
 * Returns the original array reference when nothing was changed (callers can
 * use reference equality to skip downstream work).
 */
export function dropThinkingBlocks(messages: AgentMessage[]): AgentMessage[] {
  let latestAssistantIndex = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (isAssistantMessageWithContent(messages[i])) {
      latestAssistantIndex = i;
      break;
    }
  }

  let touched = false;
  const out: AgentMessage[] = [];
  for (let i = 0; i < messages.length; i += 1) {
    const msg = messages[i];
    if (!isAssistantMessageWithContent(msg)) {
      out.push(msg);
      continue;
    }
    if (i === latestAssistantIndex) {
      out.push(msg);
      continue;
    }
    const nextContent: AssistantContentBlock[] = [];
    let changed = false;
    for (const block of msg.content) {
      if (isThinkingBlock(block)) {
        touched = true;
        changed = true;
        continue;
      }
      nextContent.push(block);
    }
    if (!changed) {
      out.push(msg);
      continue;
    }
    // Preserve the assistant turn even if all blocks were thinking-only.
    const content =
      nextContent.length > 0 ? nextContent : [{ type: "text", text: "" } as AssistantContentBlock];
    out.push({ ...msg, content });
  }
  return touched ? out : messages;
}

/**
 * Convert unsigned `type: "thinking"` blocks into plain text blocks.
 *
 * Some providers require signatures for reasoning/thinking blocks on replay.
 * When a signature is missing but textual thinking content exists, downgrade
 * to `type: "text"` to preserve content while avoiding provider rejection.
 *
 * Returns the original array reference when nothing was changed.
 */
export function downgradeUnsignedThinkingBlocks(messages: AgentMessage[]): AgentMessage[] {
  let touched = false;
  const out: AgentMessage[] = [];
  for (const msg of messages) {
    if (!isAssistantMessageWithContent(msg)) {
      out.push(msg);
      continue;
    }

    let changed = false;
    const nextContent: AssistantContentBlock[] = [];
    for (const block of msg.content) {
      if (block && typeof block === "object" && (block as { type?: unknown }).type === "thinking") {
        const thinking = (block as { thinking?: unknown }).thinking;
        const thinkingSignature = (block as { thinkingSignature?: unknown }).thinkingSignature;
        const hasThinking = typeof thinking === "string" && thinking.length > 0;
        const hasSignature =
          thinkingSignature != null &&
          (typeof thinkingSignature !== "string" || thinkingSignature.length > 0);
        if (hasThinking && !hasSignature) {
          touched = true;
          changed = true;
          nextContent.push({ type: "text", text: thinking } as AssistantContentBlock);
          continue;
        }
      }
      nextContent.push(block);
    }

    if (!changed) {
      out.push(msg);
      continue;
    }

    out.push({ ...msg, content: nextContent });
  }

  return touched ? out : messages;
}
