import { describe, expect, it, vi } from "vitest";
import type { ProgressReporter } from "../../cli/progress.js";
import { appendStatusAllDiagnosis } from "./diagnosis.js";

vi.mock("../../daemon/launchd.js", () => ({
  resolveGatewayLogPaths: () => {
    throw new Error("skip log inspection in unit tests");
  },
}));

function createProgress(): ProgressReporter {
  return {
    setLabel: () => {},
    setPercent: () => {},
    tick: () => {},
    done: () => {},
  };
}

function createBaseParams() {
  const lines: string[] = [];
  const params: Parameters<typeof appendStatusAllDiagnosis>[0] = {
    lines,
    progress: createProgress(),
    muted: (text: string) => text,
    ok: (text: string) => text,
    warn: (text: string) => text,
    fail: (text: string) => text,
    connectionDetailsForReport: "ws://127.0.0.1:18789",
    snap: null,
    remoteUrlMissing: false,
    secretDiagnostics: [],
    sentinel: null,
    lastErr: null,
    port: 18789,
    portUsage: null,
    tailscaleMode: "off",
    tailscale: {
      backendState: null,
      dnsName: null,
      ips: [],
      error: null,
    },
    tailscaleHttpsUrl: null,
    skillStatus: null,
    pluginCompatibility: [],
    channelsStatus: null,
    channelIssues: [],
    gatewayReachable: false,
    health: null,
  };
  return params;
}

describe("appendStatusAllDiagnosis", () => {
  it("treats healthy same-pid loopback dual-stack gateway listeners as ok", async () => {
    const params = createBaseParams();
    params.portUsage = {
      listeners: [
        {
          pid: 685632,
          commandLine: "openclaw-gateway run",
          address: "127.0.0.1:18789",
        },
        {
          pid: 685632,
          commandLine: "openclaw-gateway run",
          address: "[::1]:18789",
        },
      ],
    };
    params.gatewayReachable = true;

    await appendStatusAllDiagnosis(params);

    const output = params.lines.join("\n");
    expect(output).toContain("✓ Port 18789");
    expect(output).toContain("Loopback dual-stack gateway listener detected");
    expect(output).not.toContain("Port 18789 is already in use.");
  });

  it("keeps busy port warnings for non-benign listener sets", async () => {
    const params = createBaseParams();
    params.portUsage = {
      listeners: [
        {
          pid: 685632,
          commandLine: "openclaw-gateway run",
          address: "127.0.0.1:18789",
        },
        {
          pid: 685700,
          commandLine: "python -m http.server 18789",
          address: "0.0.0.0:18789",
        },
      ],
      port: 18789,
      status: "busy",
      hints: ["Another process is listening on this port."],
    } as never;

    await appendStatusAllDiagnosis(params);

    const output = params.lines.join("\n");
    expect(output).toContain("! Port 18789");
    expect(output).toContain("Port 18789 is already in use.");
  });
});
