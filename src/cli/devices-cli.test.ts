import { Command } from "commander";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const callGateway = vi.fn();
const buildGatewayConnectionDetails = vi.fn(() => ({
  url: "ws://127.0.0.1:18789",
  urlSource: "local loopback",
  message: "",
}));
const resolveGatewayCredentialsWithSecretInputs = vi.fn(
  async (params?: { explicitAuth?: { token?: string; password?: string } }) =>
    params?.explicitAuth ?? {},
);
const listDevicePairing = vi.fn();
const approveDevicePairing = vi.fn();
const summarizeDeviceTokens = vi.fn();
const loadDeviceAuthToken = vi.fn(() => null);
const loadDeviceIdentityIfPresent = vi.fn(() => null);
const withProgress = vi.fn(async (_opts: unknown, fn: () => Promise<unknown>) => await fn());
const loadConfig = vi.fn(() => ({}));
const runtime = {
  log: vi.fn(),
  error: vi.fn(),
  exit: vi.fn(),
};

vi.mock("../gateway/call.js", () => ({
  callGateway,
  buildGatewayConnectionDetails,
  resolveGatewayCredentialsWithSecretInputs,
}));

vi.mock("./progress.js", () => ({
  withProgress,
}));

vi.mock("../config/config.js", () => ({
  loadConfig,
}));

vi.mock("../infra/device-pairing.js", () => ({
  listDevicePairing,
  approveDevicePairing,
  summarizeDeviceTokens,
}));

vi.mock("../infra/device-auth-store.js", () => ({
  loadDeviceAuthToken,
}));

vi.mock("../infra/device-identity.js", () => ({
  loadDeviceIdentityIfPresent,
}));

vi.mock("../runtime.js", () => ({
  defaultRuntime: runtime,
}));

let registerDevicesCli: typeof import("./devices-cli.js").registerDevicesCli;

beforeAll(async () => {
  ({ registerDevicesCli } = await import("./devices-cli.js"));
});

async function runDevicesApprove(argv: string[]) {
  await runDevicesCommand(["approve", ...argv]);
}

async function runDevicesCommand(argv: string[]) {
  const program = new Command();
  registerDevicesCli(program);
  await program.parseAsync(["devices", ...argv], { from: "user" });
}

describe("devices cli approve", () => {
  it("approves an explicit request id without listing", async () => {
    callGateway.mockResolvedValueOnce({ device: { deviceId: "device-1" } });

    await runDevicesApprove(["req-123"]);

    expect(callGateway).toHaveBeenCalledTimes(1);
    expect(callGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "device.pair.approve",
        params: { requestId: "req-123" },
      }),
    );
  });

  it.each([
    {
      name: "id is omitted",
      args: [] as string[],
      pending: [
        { requestId: "req-1", ts: 1000 },
        { requestId: "req-2", ts: 2000 },
      ],
      expectedRequestId: "req-2",
    },
    {
      name: "--latest is passed",
      args: ["req-old", "--latest"] as string[],
      pending: [
        { requestId: "req-2", ts: 2000 },
        { requestId: "req-3", ts: 3000 },
      ],
      expectedRequestId: "req-3",
    },
  ])("uses latest pending request when $name", async ({ args, pending, expectedRequestId }) => {
    callGateway
      .mockResolvedValueOnce({
        pending,
      })
      .mockResolvedValueOnce({ device: { deviceId: "device-2" } });

    await runDevicesApprove(args);

    expect(callGateway).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ method: "device.pair.list" }),
    );
    expect(callGateway).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        method: "device.pair.approve",
        params: { requestId: expectedRequestId },
      }),
    );
  });

  it("prints an error and exits when no pending requests are available", async () => {
    callGateway.mockResolvedValueOnce({ pending: [] });

    await runDevicesApprove([]);

    expect(callGateway).toHaveBeenCalledTimes(1);
    expect(callGateway).toHaveBeenCalledWith(
      expect.objectContaining({ method: "device.pair.list" }),
    );
    expect(runtime.error).toHaveBeenCalledWith("No pending device pairing requests to approve");
    expect(runtime.exit).toHaveBeenCalledWith(1);
    expect(callGateway).not.toHaveBeenCalledWith(
      expect.objectContaining({ method: "device.pair.approve" }),
    );
  });
});

describe("devices cli remove", () => {
  it("removes a paired device by id", async () => {
    callGateway.mockResolvedValueOnce({ deviceId: "device-1" });

    await runDevicesCommand(["remove", "device-1"]);

    expect(callGateway).toHaveBeenCalledTimes(1);
    expect(callGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "device.pair.remove",
        params: { deviceId: "device-1" },
      }),
    );
  });
});

describe("devices cli clear", () => {
  it("requires --yes before clearing", async () => {
    await runDevicesCommand(["clear"]);

    expect(callGateway).not.toHaveBeenCalled();
    expect(runtime.error).toHaveBeenCalledWith("Refusing to clear pairing table without --yes");
    expect(runtime.exit).toHaveBeenCalledWith(1);
  });

  it("clears paired devices and optionally pending requests", async () => {
    callGateway
      .mockResolvedValueOnce({
        paired: [{ deviceId: "device-1" }, { deviceId: "device-2" }],
        pending: [{ requestId: "req-1" }],
      })
      .mockResolvedValueOnce({ deviceId: "device-1" })
      .mockResolvedValueOnce({ deviceId: "device-2" })
      .mockResolvedValueOnce({ requestId: "req-1", deviceId: "device-1" });

    await runDevicesCommand(["clear", "--yes", "--pending"]);

    expect(callGateway).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ method: "device.pair.list" }),
    );
    expect(callGateway).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ method: "device.pair.remove", params: { deviceId: "device-1" } }),
    );
    expect(callGateway).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ method: "device.pair.remove", params: { deviceId: "device-2" } }),
    );
    expect(callGateway).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({ method: "device.pair.reject", params: { requestId: "req-1" } }),
    );
  });
});

describe("devices cli tokens", () => {
  it.each([
    {
      label: "rotates a token for a device role",
      argv: [
        "rotate",
        "--device",
        "device-1",
        "--role",
        "main",
        "--scope",
        "messages:send",
        "--scope",
        "messages:read",
      ],
      expectedCall: {
        method: "device.token.rotate",
        params: {
          deviceId: "device-1",
          role: "main",
          scopes: ["messages:send", "messages:read"],
        },
      },
    },
    {
      label: "revokes a token for a device role",
      argv: ["revoke", "--device", "device-1", "--role", "main"],
      expectedCall: {
        method: "device.token.revoke",
        params: {
          deviceId: "device-1",
          role: "main",
        },
      },
    },
  ])("$label", async ({ argv, expectedCall }) => {
    callGateway.mockResolvedValueOnce({ ok: true });
    await runDevicesCommand(argv);
    expect(callGateway).toHaveBeenCalledWith(expect.objectContaining(expectedCall));
  });

  it("rejects blank device or role values", async () => {
    await runDevicesCommand(["rotate", "--device", " ", "--role", "main"]);

    expect(callGateway).not.toHaveBeenCalled();
    expect(runtime.error).toHaveBeenCalledWith("--device and --role required");
    expect(runtime.exit).toHaveBeenCalledWith(1);
  });
});

describe("devices cli local fallback", () => {
  const fallbackNotice = "Direct scope access failed; using local fallback.";

  it("falls back to local pairing list when gateway returns pairing required on loopback", async () => {
    callGateway.mockRejectedValueOnce(new Error("gateway closed (1008): pairing required"));
    listDevicePairing.mockResolvedValueOnce({
      pending: [{ requestId: "req-1", deviceId: "device-1", publicKey: "pk", ts: 1 }],
      paired: [],
    });
    summarizeDeviceTokens.mockReturnValue(undefined);

    await runDevicesCommand(["list"]);

    expect(callGateway).toHaveBeenCalledWith(
      expect.objectContaining({ method: "device.pair.list" }),
    );
    expect(listDevicePairing).toHaveBeenCalledTimes(1);
    expect(runtime.log).toHaveBeenCalledWith(expect.stringContaining(fallbackNotice));
  });

  it.each(["gateway closed (1000 normal closure): no close reason"])(
    "falls back to local pairing list for loopback handshake close variant %s",
    async (message) => {
      loadConfig.mockReturnValueOnce({ gateway: { auth: { token: "cfg-token" } } });
      callGateway.mockRejectedValueOnce(new Error(message));
      listDevicePairing.mockResolvedValueOnce({
        pending: [{ requestId: "req-1", deviceId: "device-1", publicKey: "pk", ts: 1 }],
        paired: [],
      });
      summarizeDeviceTokens.mockReturnValue(undefined);

      await runDevicesCommand(["list"]);

      expect(callGateway).toHaveBeenCalledWith(
        expect.objectContaining({ method: "device.pair.list" }),
      );
      expect(listDevicePairing).toHaveBeenCalledTimes(1);
      expect(runtime.log).toHaveBeenCalledWith(expect.stringContaining(fallbackNotice));
    },
  );

  it("does not use loopback handshake fallback when gateway auth mode is none", async () => {
    loadConfig.mockReturnValue({ gateway: { auth: { mode: "none" } } });
    callGateway.mockRejectedValueOnce(
      new Error("gateway closed (1000 normal closure): no close reason"),
    );

    await expect(runDevicesCommand(["list"])).rejects.toThrow("no close reason");
    expect(listDevicePairing).not.toHaveBeenCalled();
  });

  it("does not use local list fallback for generic 1000 closes after connect", async () => {
    callGateway.mockRejectedValueOnce(new Error("gateway closed (1000): no close reason"));

    await expect(runDevicesCommand(["list"])).rejects.toThrow(
      "gateway closed (1000): no close reason",
    );
    expect(listDevicePairing).not.toHaveBeenCalled();
  });

  it("falls back to local approve when gateway returns pairing required on loopback", async () => {
    callGateway
      .mockRejectedValueOnce(new Error("gateway closed (1008): pairing required"))
      .mockRejectedValueOnce(new Error("gateway closed (1008): pairing required"));
    listDevicePairing.mockResolvedValueOnce({
      pending: [{ requestId: "req-latest", deviceId: "device-1", publicKey: "pk", ts: 2 }],
      paired: [],
    });
    approveDevicePairing.mockResolvedValueOnce({
      requestId: "req-latest",
      device: {
        deviceId: "device-1",
        publicKey: "pk",
        approvedAtMs: 1,
        createdAtMs: 1,
      },
    });
    summarizeDeviceTokens.mockReturnValue(undefined);

    await runDevicesApprove(["--latest"]);

    expect(approveDevicePairing).toHaveBeenCalledWith("req-latest");
    expect(runtime.log).toHaveBeenCalledWith(expect.stringContaining(fallbackNotice));
    expect(runtime.log).toHaveBeenCalledWith(expect.stringContaining("Approved"));
  });

  it("does not use local approve fallback for generic loopback 1000 closes", async () => {
    callGateway.mockRejectedValueOnce(
      new Error("gateway closed (1000 normal closure): no close reason"),
    );

    await expect(runDevicesApprove(["req-1"])).rejects.toThrow(
      "gateway closed (1000 normal closure): no close reason",
    );
    expect(approveDevicePairing).not.toHaveBeenCalled();
  });

  it("does not use loopback handshake list fallback for approve --latest", async () => {
    callGateway.mockRejectedValueOnce(
      new Error("gateway closed (1000 normal closure): no close reason"),
    );

    await expect(runDevicesApprove(["--latest"])).rejects.toThrow("no close reason");
    expect(listDevicePairing).not.toHaveBeenCalled();
    expect(approveDevicePairing).not.toHaveBeenCalled();
  });

  it.each([
    "gateway closed (1008): pairing required",
    "gateway closed (1000 normal closure): no close reason",
  ])("does not use local fallback when an explicit --url is provided (%s)", async (message) => {
    callGateway.mockRejectedValueOnce(new Error(message));

    await expect(
      runDevicesCommand(["list", "--json", "--url", "ws://127.0.0.1:18789"]),
    ).rejects.toThrow(
      message.includes("pairing required") ? "pairing required" : "no close reason",
    );
    expect(listDevicePairing).not.toHaveBeenCalled();
  });

  it.each([
    ["--token", "test-token"],
    ["--password", "test-password"],
  ])(
    "does not use generic loopback handshake fallback when explicit auth %s is provided",
    async (flag, value) => {
      callGateway.mockRejectedValueOnce(
        new Error("gateway closed (1000 normal closure): no close reason"),
      );

      await expect(runDevicesCommand(["list", flag, value])).rejects.toThrow("no close reason");
      expect(listDevicePairing).not.toHaveBeenCalled();
    },
  );

  it("does not use generic loopback handshake fallback when shared gateway auth resolves from config or SecretRef", async () => {
    loadConfig.mockReturnValueOnce({
      gateway: {
        auth: {
          mode: "token",
          token: { ref: "secrets.gateway-token" } as unknown as string,
        },
      },
    });
    callGateway.mockRejectedValueOnce(
      new Error("gateway closed (1000 normal closure): no close reason"),
    );
    resolveGatewayCredentialsWithSecretInputs.mockResolvedValueOnce({
      token: "resolved-secret-token",
    });

    await expect(runDevicesCommand(["list"])).rejects.toThrow("no close reason");
    expect(resolveGatewayCredentialsWithSecretInputs).toHaveBeenCalledTimes(1);
    expect(listDevicePairing).not.toHaveBeenCalled();
  });

  it("does not use generic loopback handshake fallback when a stored device token exists", async () => {
    callGateway.mockRejectedValueOnce(
      new Error("gateway closed (1000 normal closure): no close reason"),
    );
    loadDeviceIdentityIfPresent.mockReturnValueOnce({ deviceId: "device-identity-1" });
    loadDeviceAuthToken.mockReturnValueOnce({ token: "device-token" });

    await expect(runDevicesCommand(["list"])).rejects.toThrow("no close reason");
    expect(loadDeviceIdentityIfPresent).toHaveBeenCalledTimes(1);
    expect(loadDeviceAuthToken).toHaveBeenCalledWith({
      deviceId: "device-identity-1",
      role: "operator",
    });
    expect(listDevicePairing).not.toHaveBeenCalled();
  });

  it("falls back when the current device identity has no stored operator token", async () => {
    callGateway.mockRejectedValueOnce(
      new Error("gateway closed (1000 normal closure): no close reason"),
    );
    loadDeviceIdentityIfPresent.mockReturnValueOnce({ deviceId: "current-device" });
    loadDeviceAuthToken.mockReturnValueOnce(null);

    listDevicePairing.mockResolvedValueOnce({
      pending: [{ requestId: "req-1", deviceId: "device-1", publicKey: "pk", ts: 1 }],
      paired: [],
    });
    summarizeDeviceTokens.mockReturnValue(undefined);

    await runDevicesCommand(["list"]);

    expect(loadDeviceAuthToken).toHaveBeenCalledWith({
      deviceId: "current-device",
      role: "operator",
    });
    expect(listDevicePairing).toHaveBeenCalledTimes(1);
  });

  it("does not use loopback handshake fallback when auth mode is only defaulted", async () => {
    loadConfig.mockReturnValue({ gateway: { auth: { allowTailscale: true } } });
    callGateway.mockRejectedValueOnce(
      new Error("gateway closed (1000 normal closure): no close reason"),
    );

    await expect(runDevicesCommand(["list"])).rejects.toThrow("no close reason");
    expect(listDevicePairing).not.toHaveBeenCalled();
  });
});

describe("devices cli list", () => {
  it("renders pending scopes when present", async () => {
    callGateway.mockResolvedValueOnce({
      pending: [
        {
          requestId: "req-1",
          deviceId: "device-1",
          displayName: "Device One",
          role: "operator",
          scopes: ["operator.admin", "operator.read"],
          ts: 1,
        },
      ],
      paired: [],
    });

    await runDevicesCommand(["list"]);

    const output = runtime.log.mock.calls.map((entry) => String(entry[0] ?? "")).join("\n");
    expect(output).toContain("Scopes");
    expect(output).toContain("operator.admin, operator.read");
  });
});

afterEach(() => {
  callGateway.mockClear();
  buildGatewayConnectionDetails.mockClear();
  buildGatewayConnectionDetails.mockReturnValue({
    url: "ws://127.0.0.1:18789",
    urlSource: "local loopback",
    message: "",
  });
  resolveGatewayCredentialsWithSecretInputs.mockClear();
  resolveGatewayCredentialsWithSecretInputs.mockImplementation(
    async (params?: { explicitAuth?: { token?: string; password?: string } }) =>
      params?.explicitAuth ?? {},
  );
  loadDeviceAuthToken.mockClear();
  loadDeviceAuthToken.mockReturnValue(null);
  loadDeviceIdentityIfPresent.mockClear();
  loadDeviceIdentityIfPresent.mockReturnValue(null);
  listDevicePairing.mockClear();
  listDevicePairing.mockResolvedValue({ pending: [], paired: [] });
  approveDevicePairing.mockClear();
  approveDevicePairing.mockResolvedValue(undefined);
  summarizeDeviceTokens.mockClear();
  summarizeDeviceTokens.mockReturnValue(undefined);
  withProgress.mockClear();
  loadConfig.mockClear();
  loadConfig.mockReturnValue({ gateway: { auth: { token: "cfg-token" } } });
  runtime.log.mockClear();
  runtime.error.mockClear();
  runtime.exit.mockClear();
});
