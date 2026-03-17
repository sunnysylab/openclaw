import { describe, expect, it } from "vitest";
import {
  buildWorkflowPlanningGateText,
  extractTouchedPaths,
  selectWorkflowForPlanning,
  shouldRequireWorkflowPlanningGate,
} from "./workflow-selector.js";

describe("workflow selector", () => {
  it("selects architecture map workflow for architecture mapping tasks", () => {
    const result = selectWorkflowForPlanning({
      userTask:
        "Build a project map for VioDashboard by reading README, src/config.mjs, and src/server.mjs and summarize the architecture.",
      workspaceDir: "/Users/visen24/MAS/openclaw_fork",
    });
    expect(result.taskType).toBe("architecture_mapping");
    expect(result.selectedWorkflowId).toBe("project_architecture_map_build");
    expect(result.candidates[0]?.workflowId).toBe("project_architecture_map_build");
  });

  it("extracts touched paths from task text", () => {
    const paths = extractTouchedPaths(
      "Inspect `src/config.mjs`, src/auto-reply/reply/get-reply-run.ts and docs/index.md",
    );
    expect(paths).toContain("src/config.mjs");
    expect(paths).toContain("src/auto-reply/reply/get-reply-run.ts");
    expect(paths).toContain("docs/index.md");
  });

  it("enables planning gate for repo coding tasks", () => {
    expect(
      shouldRequireWorkflowPlanningGate({
        userTask: "Implement a selector in the source repo and modify src/server-methods/chat.ts",
        workspaceDir: "/Users/visen24/MAS/openclaw_fork",
      }),
    ).toBe(true);
  });

  it("renders explicit reviewable planning output", () => {
    const result = selectWorkflowForPlanning({
      userTask: "Fix a bug in src/gateway/server-methods/chat.ts where a wrong error is returned",
      workspaceDir: "/Users/visen24/MAS/openclaw_fork",
    });
    const text = buildWorkflowPlanningGateText(result);
    expect(text).toContain("workflow 选择结果");
    expect(text).toContain("review 状态");
    expect(text).toContain("pending");
  });
});
