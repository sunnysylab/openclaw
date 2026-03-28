import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import {
  collectAttackSurfaceSummaryFindings,
  collectSmallModelRiskFindings,
} from "./audit-extra.sync.js";
import { safeEqualSecret } from "./secret-equal.js";

describe("collectAttackSurfaceSummaryFindings", () => {
  it.each([
    {
      name: "distinguishes external webhooks from internal hooks when only internal hooks are enabled",
      cfg: {
        hooks: { internal: { enabled: true } },
      } satisfies OpenClawConfig,
      expectedDetail: ["hooks.webhooks: disabled", "hooks.internal: enabled"],
    },
    {
      name: "reports both hook systems as enabled when both are configured",
      cfg: {
        hooks: { enabled: true, internal: { enabled: true } },
      } satisfies OpenClawConfig,
      expectedDetail: ["hooks.webhooks: enabled", "hooks.internal: enabled"],
    },
    {
      name: "reports both hook systems as disabled when neither is configured",
      cfg: {} satisfies OpenClawConfig,
      expectedDetail: ["hooks.webhooks: disabled", "hooks.internal: disabled"],
    },
  ])("$name", ({ cfg, expectedDetail }) => {
    const [finding] = collectAttackSurfaceSummaryFindings(cfg);
    expect(finding.checkId).toBe("summary.attack_surface");
    for (const snippet of expectedDetail) {
      expect(finding.detail).toContain(snippet);
    }
  });
});

describe("safeEqualSecret", () => {
  it.each([
    ["secret-token", "secret-token", true],
    ["secret-token", "secret-tokEn", false],
    ["short", "much-longer", false],
    [undefined, "secret", false],
    ["secret", undefined, false],
    [null, "secret", false],
  ] as const)("compares %o and %o", (left, right, expected) => {
    expect(safeEqualSecret(left, right)).toBe(expected);
  });
});

describe("collectSmallModelRiskFindings web search key detection", () => {
  const baseCfg: OpenClawConfig = {
    agents: {
      defaults: {
        model: "qwen2.5-3b-instruct",
      },
    },
  };

  it("treats GEMINI_API_KEY as enabling web_search exposure", () => {
    const findings = collectSmallModelRiskFindings({
      cfg: baseCfg,
      env: { GEMINI_API_KEY: "gemini-key" } as NodeJS.ProcessEnv,
    });
    expect(findings[0]?.detail).toContain("web_search");
  });

  it("treats XAI_API_KEY as enabling web_search exposure", () => {
    const findings = collectSmallModelRiskFindings({
      cfg: baseCfg,
      env: { XAI_API_KEY: "xai-key" } as NodeJS.ProcessEnv,
    });
    expect(findings[0]?.detail).toContain("web_search");
  });

  it("treats KIMI_API_KEY as enabling web_search exposure", () => {
    const findings = collectSmallModelRiskFindings({
      cfg: baseCfg,
      env: { KIMI_API_KEY: "kimi-key" } as NodeJS.ProcessEnv,
    });
    expect(findings[0]?.detail).toContain("web_search");
  });

  it("does not treat OPENROUTER_API_KEY alone as enabling web_search exposure", () => {
    const findings = collectSmallModelRiskFindings({
      cfg: baseCfg,
      env: { OPENROUTER_API_KEY: "openrouter-key" } as NodeJS.ProcessEnv,
    });
    expect(findings[0]?.detail ?? "").not.toContain("web_search");
  });

  it("treats MOONSHOT_API_KEY as enabling web_search exposure", () => {
    const findings = collectSmallModelRiskFindings({
      cfg: baseCfg,
      env: { MOONSHOT_API_KEY: "moonshot-key" } as NodeJS.ProcessEnv,
    });
    expect(findings[0]?.detail).toContain("web_search");
  });

  it("respects explicit provider pin when evaluating key exposure", () => {
    const findings = collectSmallModelRiskFindings({
      cfg: {
        ...baseCfg,
        tools: {
          web: {
            search: {
              provider: "perplexity",
            },
          },
        },
      },
      env: { GEMINI_API_KEY: "gemini-key" } as NodeJS.ProcessEnv,
    });
    expect(findings[0]?.detail ?? "").not.toContain("web_search");
  });
});
