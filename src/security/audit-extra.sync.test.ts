import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import {
  collectAttackSurfaceSummaryFindings,
  collectChineseDeploymentFindings,
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

// --------------------------------------------------------------------------
// Issue #7: Chinese deployment scenario checks
// --------------------------------------------------------------------------

describe("collectChineseDeploymentFindings", () => {
  it("returns empty for config without feishu channel", () => {
    const cfg: OpenClawConfig = {};
    const findings = collectChineseDeploymentFindings(cfg);
    expect(findings).toEqual([]);
  });

  it("returns empty for feishu websocket mode (default)", () => {
    const cfg: OpenClawConfig = {
      channels: {
        feishu: {
          enabled: true,
          connectionMode: "websocket",
          appId: "cli_test",
          appSecret: { source: "env", provider: "default", id: "FEISHU_APP_SECRET" },
        },
      },
    };
    const findings = collectChineseDeploymentFindings(cfg);
    expect(findings).toEqual([]);
  });

  it("flags feishu webhook mode without encryptKey", () => {
    const cfg: OpenClawConfig = {
      channels: {
        feishu: {
          enabled: true,
          connectionMode: "webhook",
          appId: "cli_test",
          appSecret: "secret", // pragma: allowlist secret
          verificationToken: "token_test",
        },
      },
    };
    const findings = collectChineseDeploymentFindings(cfg);
    const encryptKeyFinding = findings.find(
      (f) => f.checkId === "channels.feishu.webhook_no_encrypt_key",
    );
    expect(encryptKeyFinding).toBeDefined();
    expect(encryptKeyFinding!.severity).toBe("critical");
  });

  it("flags feishu webhook plaintext verificationToken", () => {
    const cfg: OpenClawConfig = {
      channels: {
        feishu: {
          enabled: true,
          connectionMode: "webhook",
          appId: "cli_test",
          appSecret: "secret", // pragma: allowlist secret
          verificationToken: "plaintext_token_value",
          encryptKey: "encrypt_key_value",
        },
      },
    };
    const findings = collectChineseDeploymentFindings(cfg);
    const tokenFinding = findings.find(
      (f) => f.checkId === "channels.feishu.webhook_verification_token_plaintext",
    );
    expect(tokenFinding).toBeDefined();
    expect(tokenFinding!.severity).toBe("warn");
  });

  it("does not flag verificationToken when using env ref", () => {
    const cfg: OpenClawConfig = {
      channels: {
        feishu: {
          enabled: true,
          connectionMode: "webhook",
          appId: "cli_test",
          appSecret: "secret", // pragma: allowlist secret
          verificationToken: "${FEISHU_VERIFICATION_TOKEN}",
          encryptKey: "encrypt_key_value",
        },
      },
    };
    const findings = collectChineseDeploymentFindings(cfg);
    const tokenFinding = findings.find(
      (f) => f.checkId === "channels.feishu.webhook_verification_token_plaintext",
    );
    expect(tokenFinding).toBeUndefined();
  });

  it("flags per-account webhook without encryptKey", () => {
    const cfg: OpenClawConfig = {
      channels: {
        feishu: {
          enabled: true,
          connectionMode: "websocket",
          accounts: {
            production: {
              connectionMode: "webhook",
              appId: "cli_prod",
              appSecret: "secret_prod", // pragma: allowlist secret
              verificationToken: "token_prod",
            },
          },
        },
      },
    };
    const findings = collectChineseDeploymentFindings(cfg);
    const accountFinding = findings.find((f) =>
      f.checkId.includes("accounts.production.webhook_no_encrypt_key"),
    );
    expect(accountFinding).toBeDefined();
    expect(accountFinding!.severity).toBe("critical");
  });

  it("does not flag per-account webhook when encryptKey is inherited from top-level", () => {
    const cfg: OpenClawConfig = {
      channels: {
        feishu: {
          enabled: true,
          connectionMode: "websocket",
          encryptKey: "inherited_encrypt_key",
          accounts: {
            production: {
              connectionMode: "webhook",
              appId: "cli_prod",
              appSecret: "secret_prod", // pragma: allowlist secret
              verificationToken: "token_prod",
            },
          },
        },
      },
    };
    const findings = collectChineseDeploymentFindings(cfg);
    const accountFinding = findings.find((f) =>
      f.checkId.includes("accounts.production.webhook_no_encrypt_key"),
    );
    expect(accountFinding).toBeUndefined();
  });

  it("flags non-loopback gateway without trustedProxies for Chinese cloud setups", () => {
    const cfg: OpenClawConfig = {
      gateway: {
        bind: "lan",
        controlUi: { enabled: true },
      },
    };
    const findings = collectChineseDeploymentFindings(cfg);
    const proxyFinding = findings.find((f) => f.checkId === "gateway.reverse_proxy_chinese_cloud");
    expect(proxyFinding).toBeDefined();
    expect(proxyFinding!.severity).toBe("warn");
    expect(proxyFinding!.detail).toContain("Tencent Cloud");
  });

  it("does not flag when trustedProxies are configured", () => {
    const cfg: OpenClawConfig = {
      gateway: {
        bind: "lan",
        trustedProxies: ["172.17.0.1"],
        controlUi: { enabled: true },
      },
    };
    const findings = collectChineseDeploymentFindings(cfg);
    const proxyFinding = findings.find((f) => f.checkId === "gateway.reverse_proxy_chinese_cloud");
    expect(proxyFinding).toBeUndefined();
  });

  it("does not flag loopback gateway even without trustedProxies", () => {
    const cfg: OpenClawConfig = {
      gateway: {
        bind: "loopback",
      },
    };
    const findings = collectChineseDeploymentFindings(cfg);
    const proxyFinding = findings.find((f) => f.checkId === "gateway.reverse_proxy_chinese_cloud");
    expect(proxyFinding).toBeUndefined();
  });
});
