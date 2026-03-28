import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { createCliRuntimeCapture } from "./test-runtime-capture.js";

const loadConfigMock = vi.fn<() => OpenClawConfig>(() => ({}));
const resolveDefaultAgentIdMock = vi.fn<(cfg: OpenClawConfig) => string>(() => "main");
const resolveAgentWorkspaceDirMock = vi.fn<(cfg: OpenClawConfig, agentId: string) => string>(
  () => "/tmp/workspace",
);
const resolveAgentIdByWorkspacePathMock = vi.fn<
  (cfg: OpenClawConfig, workspacePath: string) => string | undefined
>();
const searchSkillsFromClawHubMock = vi.fn();
const installSkillFromClawHubMock = vi.fn();
const updateSkillsFromClawHubMock = vi.fn();
const readTrackedClawHubSkillSlugsMock = vi.fn();

const { defaultRuntime, runtimeLogs, runtimeErrors, resetRuntimeCapture } =
  createCliRuntimeCapture();

vi.mock("../runtime.js", () => ({
  defaultRuntime,
}));

vi.mock("../config/config.js", () => ({
  loadConfig: () => loadConfigMock(),
}));

vi.mock("../agents/agent-scope.js", () => ({
  resolveDefaultAgentId: (cfg: OpenClawConfig) => resolveDefaultAgentIdMock(cfg),
  resolveAgentWorkspaceDir: (cfg: OpenClawConfig, agentId: string) =>
    resolveAgentWorkspaceDirMock(cfg, agentId),
  resolveAgentIdByWorkspacePath: (cfg: OpenClawConfig, workspacePath: string) =>
    resolveAgentIdByWorkspacePathMock(cfg, workspacePath),
}));

vi.mock("../agents/skills-clawhub.js", () => ({
  searchSkillsFromClawHub: (...args: unknown[]) => searchSkillsFromClawHubMock(...args),
  installSkillFromClawHub: (...args: unknown[]) => installSkillFromClawHubMock(...args),
  updateSkillsFromClawHub: (...args: unknown[]) => updateSkillsFromClawHubMock(...args),
  readTrackedClawHubSkillSlugs: (...args: unknown[]) => readTrackedClawHubSkillSlugsMock(...args),
}));

const { registerSkillsCli } = await import("./skills-cli.js");

describe("skills cli commands", () => {
  const createProgram = () => {
    const program = new Command();
    program.exitOverride();
    registerSkillsCli(program);
    return program;
  };

  const runCommand = (argv: string[]) => createProgram().parseAsync(argv, { from: "user" });

  beforeEach(() => {
    resetRuntimeCapture();
    loadConfigMock.mockReset();
    resolveDefaultAgentIdMock.mockReset();
    resolveAgentWorkspaceDirMock.mockReset();
    resolveAgentIdByWorkspacePathMock.mockReset();
    searchSkillsFromClawHubMock.mockReset();
    installSkillFromClawHubMock.mockReset();
    updateSkillsFromClawHubMock.mockReset();
    readTrackedClawHubSkillSlugsMock.mockReset();

    loadConfigMock.mockReturnValue({});
    resolveDefaultAgentIdMock.mockReturnValue("main");
    resolveAgentWorkspaceDirMock.mockReturnValue("/tmp/workspace");
    resolveAgentIdByWorkspacePathMock.mockReturnValue(undefined);
    searchSkillsFromClawHubMock.mockResolvedValue([]);
    installSkillFromClawHubMock.mockResolvedValue({
      ok: false,
      error: "install disabled in test",
    });
    updateSkillsFromClawHubMock.mockResolvedValue([]);
    readTrackedClawHubSkillSlugsMock.mockResolvedValue([]);
  });

  it("searches ClawHub skills from the native CLI", async () => {
    searchSkillsFromClawHubMock.mockResolvedValue([
      {
        slug: "calendar",
        displayName: "Calendar",
        summary: "CalDAV helpers",
        version: "1.2.3",
      },
    ]);

    await runCommand(["skills", "search", "calendar"]);

    expect(searchSkillsFromClawHubMock).toHaveBeenCalledWith({
      query: "calendar",
      limit: undefined,
    });
    expect(runtimeLogs.some((line) => line.includes("calendar v1.2.3  Calendar"))).toBe(true);
  });

  it("installs a skill from ClawHub into the active workspace", async () => {
    installSkillFromClawHubMock.mockResolvedValue({
      ok: true,
      slug: "calendar",
      version: "1.2.3",
      targetDir: "/tmp/workspace/skills/calendar",
    });

    await runCommand(["skills", "install", "calendar", "--version", "1.2.3"]);

    expect(installSkillFromClawHubMock).toHaveBeenCalledWith({
      workspaceDir: "/tmp/workspace",
      slug: "calendar",
      version: "1.2.3",
      force: false,
      logger: expect.any(Object),
    });
    expect(
      runtimeLogs.some((line) =>
        line.includes("Installed calendar@1.2.3 -> /tmp/workspace/skills/calendar"),
      ),
    ).toBe(true);
  });

  it("installs into the workspace inferred from cwd before falling back to the default agent", async () => {
    resolveAgentIdByWorkspacePathMock.mockReturnValue("writer");
    resolveAgentWorkspaceDirMock.mockImplementation((_cfg, agentId) => `/tmp/workspace-${agentId}`);
    installSkillFromClawHubMock.mockResolvedValue({
      ok: true,
      slug: "content-writer",
      version: "1.0.0",
      targetDir: "/tmp/workspace-writer/skills/content-writer",
    });

    await runCommand(["skills", "install", "content-writer"]);

    expect(resolveAgentIdByWorkspacePathMock).toHaveBeenCalledWith({}, process.cwd());
    expect(installSkillFromClawHubMock).toHaveBeenCalledWith({
      workspaceDir: "/tmp/workspace-writer",
      slug: "content-writer",
      version: undefined,
      force: false,
      logger: expect.any(Object),
    });
  });

  it("updates all tracked ClawHub skills", async () => {
    readTrackedClawHubSkillSlugsMock.mockResolvedValue(["calendar"]);
    updateSkillsFromClawHubMock.mockResolvedValue([
      {
        ok: true,
        slug: "calendar",
        previousVersion: "1.2.2",
        version: "1.2.3",
        changed: true,
        targetDir: "/tmp/workspace/skills/calendar",
      },
    ]);

    await runCommand(["skills", "update", "--all"]);

    expect(readTrackedClawHubSkillSlugsMock).toHaveBeenCalledWith("/tmp/workspace");
    expect(updateSkillsFromClawHubMock).toHaveBeenCalledWith({
      workspaceDir: "/tmp/workspace",
      slug: undefined,
      logger: expect.any(Object),
    });
    expect(runtimeLogs.some((line) => line.includes("Updated calendar: 1.2.2 -> 1.2.3"))).toBe(
      true,
    );
    expect(runtimeErrors).toEqual([]);
  });
});
