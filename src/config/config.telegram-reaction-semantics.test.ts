import { describe, expect, it } from "vitest";
import { OpenClawSchema } from "./zod-schema.js";

describe("telegram reaction semantics schema", () => {
  it("accepts raw emoji and custom emoji semantic mappings", () => {
    const res = OpenClawSchema.safeParse({
      channels: {
        telegram: {
          reactionSemantics: {
            "👍": "acknowledged",
            "custom_emoji:1234567890123456789": {
              meaning: "execute-approved-plan",
              instruction:
                "Treat this as operator approval to execute the previously proposed action set if policy allows.",
              action: "wake",
            },
          },
        },
      },
    });

    expect(res.success).toBe(true);
    if (!res.success) {
      return;
    }

    expect(res.data.channels?.telegram?.reactionSemantics).toEqual({
      "👍": "acknowledged",
      "custom_emoji:1234567890123456789": {
        meaning: "execute-approved-plan",
        instruction:
          "Treat this as operator approval to execute the previously proposed action set if policy allows.",
        action: "wake",
      },
    });
  });

  it("rejects invalid reaction semantic actions", () => {
    const res = OpenClawSchema.safeParse({
      channels: {
        telegram: {
          reactionSemantics: {
            "emoji:✅": {
              meaning: "completed",
              action: "execute-now",
            },
          },
        },
      },
    });

    expect(res.success).toBe(false);
  });
});
