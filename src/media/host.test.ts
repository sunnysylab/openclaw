import fs from "node:fs/promises";
import type { Server } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  saveMediaSource: vi.fn(),
  getTailnetHostname: vi.fn(),
  ensurePortAvailable: vi.fn(),
  startMediaServer: vi.fn(),
  logInfo: vi.fn(),
}));
const { saveMediaSource, getTailnetHostname, ensurePortAvailable, startMediaServer, logInfo } =
  mocks;

vi.mock("./store.js", () => ({ saveMediaSource }));
vi.mock("../infra/tailscale.js", () => ({ getTailnetHostname }));
vi.mock("../infra/ports.js", async () => {
  const actual = await vi.importActual<typeof import("../infra/ports.js")>("../infra/ports.js");
  return { ensurePortAvailable, PortInUseError: actual.PortInUseError };
});
vi.mock("./server.js", () => ({ startMediaServer }));
vi.mock("../logger.js", async () => {
  const actual = await vi.importActual<typeof import("../logger.js")>("../logger.js");
  return { ...actual, logInfo };
});

const { ensureMediaHosted } = await import("./host.js");
const { PortInUseError } = await import("../infra/ports.js");

describe("ensureMediaHosted", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws and cleans up when server not allowed to start", async () => {
    saveMediaSource.mockResolvedValue({
      id: "id1",
      path: "/tmp/file1",
      size: 5,
    });
    getTailnetHostname.mockResolvedValue("tailnet-host");
    ensurePortAvailable.mockResolvedValue(undefined);
    const rmSpy = vi.spyOn(fs, "rm").mockResolvedValue(undefined);

    await expect(ensureMediaHosted("/tmp/file1", { startServer: false })).rejects.toThrow(
      "requires the webhook/Funnel server",
    );
    expect(rmSpy).toHaveBeenCalledWith("/tmp/file1");
    rmSpy.mockRestore();
  });

  it("cleans up when hostname lookup fails after save", async () => {
    saveMediaSource.mockResolvedValue({
      id: "id-hostname",
      path: "/tmp/file-hostname",
      size: 5,
    });
    const err = new Error("hostname lookup failed");
    getTailnetHostname.mockRejectedValue(err);
    const rmSpy = vi.spyOn(fs, "rm").mockResolvedValue(undefined);

    await expect(ensureMediaHosted("/tmp/file-hostname", { startServer: false })).rejects.toThrow(
      err,
    );
    expect(rmSpy).toHaveBeenCalledWith("/tmp/file-hostname");
    rmSpy.mockRestore();
  });

  it("cleans up when port check fails unexpectedly", async () => {
    saveMediaSource.mockResolvedValue({
      id: "id-port",
      path: "/tmp/file-port",
      size: 5,
    });
    getTailnetHostname.mockResolvedValue("tail.net");
    const err = new Error("port check failed");
    ensurePortAvailable.mockRejectedValue(err);
    const rmSpy = vi.spyOn(fs, "rm").mockResolvedValue(undefined);

    await expect(ensureMediaHosted("/tmp/file-port", { startServer: false })).rejects.toThrow(err);
    expect(rmSpy).toHaveBeenCalledWith("/tmp/file-port");
    rmSpy.mockRestore();
  });

  it("cleans up when media server startup fails", async () => {
    saveMediaSource.mockResolvedValue({
      id: "id-start",
      path: "/tmp/file-start",
      size: 9,
    });
    getTailnetHostname.mockResolvedValue("tail.net");
    ensurePortAvailable.mockResolvedValue(undefined);
    const err = new Error("startup failed");
    startMediaServer.mockRejectedValue(err);
    const rmSpy = vi.spyOn(fs, "rm").mockResolvedValue(undefined);

    await expect(
      ensureMediaHosted("/tmp/file-start", { startServer: true, port: 1234 }),
    ).rejects.toThrow(err);
    expect(rmSpy).toHaveBeenCalledWith("/tmp/file-start");
    rmSpy.mockRestore();
  });

  it("starts media server when allowed", async () => {
    saveMediaSource.mockResolvedValue({
      id: "id2",
      path: "/tmp/file2",
      size: 9,
    });
    getTailnetHostname.mockResolvedValue("tail.net");
    ensurePortAvailable.mockResolvedValue(undefined);
    const fakeServer = { unref: vi.fn() } as unknown as Server;
    startMediaServer.mockResolvedValue(fakeServer);

    const result = await ensureMediaHosted("/tmp/file2", {
      startServer: true,
      port: 1234,
    });
    expect(startMediaServer).toHaveBeenCalledWith(1234, expect.any(Number), expect.anything());
    expect(logInfo).toHaveBeenCalled();
    expect(result).toEqual({
      url: "https://tail.net/media/id2",
      id: "id2",
      size: 9,
    });
  });

  it("skips server start when port already in use", async () => {
    saveMediaSource.mockResolvedValue({
      id: "id3",
      path: "/tmp/file3",
      size: 7,
    });
    getTailnetHostname.mockResolvedValue("tail.net");
    ensurePortAvailable.mockRejectedValue(new PortInUseError(3000, "proc"));

    const result = await ensureMediaHosted("/tmp/file3", {
      startServer: false,
      port: 3000,
    });
    expect(startMediaServer).not.toHaveBeenCalled();
    expect(result.url).toBe("https://tail.net/media/id3");
  });
});
