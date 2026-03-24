import { describe, expect, it } from "vitest";
import { toTrimmedUtf8 } from "../scripts/openclaw-npm-release-check.js";

describe("toTrimmedUtf8", () => {
  it("decodes plain Uint8Array values as UTF-8 text", () => {
    const encoded = new TextEncoder().encode("npm publish failed\n");

    expect(toTrimmedUtf8(encoded)).toBe("npm publish failed");
  });
});
