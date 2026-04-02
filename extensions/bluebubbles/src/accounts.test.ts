import { describe, expect, it } from "vitest";
import { resolveBlueBubblesEffectiveAllowPrivateNetwork } from "./accounts.js";

describe("resolveBlueBubblesEffectiveAllowPrivateNetwork", () => {
  it("returns true when explicitly enabled", () => {
    expect(
      resolveBlueBubblesEffectiveAllowPrivateNetwork({
        baseUrl: "https://bluebubbles.example.com",
        allowPrivateNetwork: true,
      }),
    ).toBe(true);
  });

  it("returns false when explicitly disabled", () => {
    expect(
      resolveBlueBubblesEffectiveAllowPrivateNetwork({
        baseUrl: "http://localhost:1234",
        allowPrivateNetwork: false,
      }),
    ).toBe(false);
  });

  it("auto-enables loopback BlueBubbles server URLs", () => {
    expect(
      resolveBlueBubblesEffectiveAllowPrivateNetwork({
        baseUrl: "http://localhost:1234",
      }),
    ).toBe(true);
    expect(
      resolveBlueBubblesEffectiveAllowPrivateNetwork({
        baseUrl: "http://127.0.0.1:1234",
      }),
    ).toBe(true);
  });

  it("auto-enables private IP BlueBubbles server URLs", () => {
    expect(
      resolveBlueBubblesEffectiveAllowPrivateNetwork({
        baseUrl: "http://192.168.1.5:1234",
      }),
    ).toBe(true);
  });

  it("does not auto-enable public BlueBubbles server URLs", () => {
    expect(
      resolveBlueBubblesEffectiveAllowPrivateNetwork({
        baseUrl: "https://bluebubbles.example.com",
      }),
    ).toBe(false);
  });
});
