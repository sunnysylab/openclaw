import type { StreamFn } from "@mariozechner/pi-agent-core";
import { streamSimple } from "@mariozechner/pi-ai";
import { streamWithPayloadPatch } from "./stream-payload-utils.js";

function stripBoundaryMarker(text: string, delimiter: string): string {
  return text.replace(delimiter, "\n");
}

export function createSystemPromptCacheBoundaryWrapper(
  baseStreamFn: StreamFn | undefined,
  delimiter: string,
  splitAndCache = false,
): StreamFn {
  const underlying = baseStreamFn ?? streamSimple;
  return (model, context, options) =>
    streamWithPayloadPatch(underlying, model, context, options, (payloadObj) => {
      const system = payloadObj.system;

      if (Array.isArray(system)) {
        const newBlocks: Array<Record<string, unknown>> = [];
        for (const block of system as Array<Record<string, unknown>>) {
          if (typeof block?.text !== "string" || !block.text.includes(delimiter)) {
            newBlocks.push(block);
            continue;
          }

          if (!splitAndCache) {
            newBlocks.push({
              ...block,
              text: stripBoundaryMarker(block.text, delimiter),
            });
            continue;
          }

          const idx = block.text.indexOf(delimiter);
          const staticPart = block.text.slice(0, idx).trimEnd();
          const dynamicPart = block.text.slice(idx + delimiter.length).trimStart();
          const { cache_control: cacheControl, ...rest } = block;

          if (staticPart) {
            newBlocks.push({
              ...rest,
              text: staticPart,
              ...(cacheControl ? { cache_control: cacheControl } : {}),
            });
          }
          if (dynamicPart) {
            newBlocks.push({
              ...rest,
              text: dynamicPart,
            });
          }
        }
        payloadObj.system = newBlocks;
        return;
      }

      if (typeof system === "string" && system.includes(delimiter)) {
        // Even when the caller wants cache splitting, plain-string system prompts
        // cannot be split into discrete cacheable content blocks safely here.
        payloadObj.system = stripBoundaryMarker(system, delimiter);
      }
    });
}
