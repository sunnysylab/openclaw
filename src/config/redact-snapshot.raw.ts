import { isDeepStrictEqual } from "node:util";
import JSON5 from "json5";

export function replaceSensitiveValuesInRaw(params: {
  raw: string;
  sensitiveValues: string[];
  redactedSentinel: string;
}): string {
  const values = [...params.sensitiveValues].toSorted((a, b) => b.length - a.length);
  let result = params.raw;
  for (const value of values) {
    result = result.replaceAll(value, params.redactedSentinel);
  }
  return result;
}

/**
 * Strip keys with `undefined` values so that objects materialized with
 * `void 0` assignments compare cleanly against JSON-parsed objects
 * (which can never contain `undefined`).
 */
function stripUndefinedKeys(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

export function shouldFallbackToStructuredRawRedaction(params: {
  redactedRaw: string;
  originalConfig: unknown;
  /** Source (pre-materialize) config for comparison; falls back to originalConfig. */
  sourceConfig?: unknown;
  restoreParsed: (parsed: unknown) => { ok: boolean; result?: unknown };
}): boolean {
  try {
    const parsed = JSON5.parse(params.redactedRaw);
    const restored = params.restoreParsed(parsed);
    if (!restored.ok) {
      return true;
    }
    const compareTarget = params.sourceConfig ?? params.originalConfig;
    return !isDeepStrictEqual(
      stripUndefinedKeys(restored.result),
      stripUndefinedKeys(compareTarget),
    );
  } catch {
    return true;
  }
}
