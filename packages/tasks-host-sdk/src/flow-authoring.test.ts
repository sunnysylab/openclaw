import { afterEach, describe, expect, it, vi } from "vitest";
import { withTempDir } from "../../../src/test-helpers/temp-dir.js";
import { getFlowById, resetFlowRegistryForTests } from "./flow-registry.js";
import {
  bindFlowAuthoringHelper,
  createFlowAuthoringHelper,
} from "./flow-authoring.js";
import { createQueuedTaskRun } from "./task-executor.js";
import { listTasksForFlowId, resetTaskRegistryForTests } from "./task-registry.js";

const ORIGINAL_STATE_DIR = process.env.OPENCLAW_STATE_DIR;
const mocks = vi.hoisted(() => ({
  sendMessageMock: vi.fn(),
}));

vi.mock("./task-registry-delivery-runtime.js", () => ({
  sendMessage: (...args: unknown[]) => mocks.sendMessageMock(...args),
}));

vi.mock("../../../src/infra/agent-events.js", () => ({
  onAgentEvent: () => () => {},
}));

vi.mock("../../../src/infra/system-events.js", () => ({
  enqueueSystemEvent: vi.fn(),
}));

vi.mock("../../../src/infra/heartbeat-wake.js", () => ({
  requestHeartbeatNow: vi.fn(),
}));

vi.mock("../../../src/acp/control-plane/manager.js", () => ({
  getAcpSessionManager: () => ({
    cancelSession: vi.fn(),
  }),
}));

vi.mock("../../../src/agents/subagent-control.js", () => ({
  killSubagentRunAdmin: vi.fn(),
}));

async function withFlowAuthoringStateDir(run: (root: string) => Promise<void>): Promise<void> {
  await withTempDir({ prefix: "openclaw-flow-authoring-" }, async (root) => {
    process.env.OPENCLAW_STATE_DIR = root;
    resetTaskRegistryForTests();
    resetFlowRegistryForTests();
    try {
      await run(root);
    } finally {
      resetTaskRegistryForTests();
      resetFlowRegistryForTests();
    }
  });
}

describe("flow-authoring", () => {
  afterEach(() => {
    if (ORIGINAL_STATE_DIR === undefined) {
      delete process.env.OPENCLAW_STATE_DIR;
    } else {
      process.env.OPENCLAW_STATE_DIR = ORIGINAL_STATE_DIR;
    }
    resetTaskRegistryForTests();
    resetFlowRegistryForTests();
    mocks.sendMessageMock.mockReset();
  });

  it("creates a flow with a bound helper and keeps authoring calls scoped to that flow", async () => {
    await withFlowAuthoringStateDir(async () => {
      const { flow, helper } = createFlowAuthoringHelper({
        ownerSessionKey: "agent:main:main",
        requesterOrigin: {
          channel: "telegram",
          to: "telegram:123",
        },
        goal: "Triage inbox",
        currentStep: "classify",
      });

      const started = helper.runTask({
        runtime: "acp",
        childSessionKey: "agent:codex:acp:child",
        runId: "run-flow-authoring-1",
        task: "Classify inbox messages",
        currentStep: "wait_for_classification",
      });

      helper.setOutput({
        key: "classification",
        value: { route: "personal" },
      });
      helper.appendOutput({
        key: "eod_summary",
        value: { subject: "Newsletter" },
      });

      expect(started.task.parentFlowId).toBe(flow.flowId);
      expect(helper.getFlow()).toMatchObject({
        flowId: flow.flowId,
        status: "waiting",
        waitingOnTaskId: started.task.taskId,
        outputs: {
          classification: { route: "personal" },
          eod_summary: [{ subject: "Newsletter" }],
        },
      });
      expect(listTasksForFlowId(flow.flowId)).toHaveLength(1);
    });
  });

  it("binds to an existing flow and exposes the runtime verbs on that flow", async () => {
    await withFlowAuthoringStateDir(async () => {
      const { flow } = createFlowAuthoringHelper({
        ownerSessionKey: "agent:main:main",
        requesterOrigin: {
          channel: "telegram",
          to: "telegram:123",
          threadId: "42",
        },
        goal: "Review inbox",
      });
      const helper = bindFlowAuthoringHelper(flow.flowId);

      const started = helper.runTask({
        runtime: "subagent",
        childSessionKey: "agent:codex:subagent:child",
        runId: "run-flow-authoring-2",
        task: "Review inbox messages",
      });

      expect(
        helper.wait({
          currentStep: "wait_for_review",
          waitingOnTaskId: started.task.taskId,
        }),
      ).toMatchObject({
        flowId: flow.flowId,
        currentStep: "wait_for_review",
        waitingOnTaskId: started.task.taskId,
      });

      expect(helper.resume({ currentStep: "route_results" })).toMatchObject({
        flowId: flow.flowId,
        status: "running",
        currentStep: "route_results",
      });

      const update = await helper.emitUpdate({
        content: "Personal message needs your attention.",
        eventKey: "personal-alert",
      });

      expect(update.delivery).toBe("direct");
      expect(mocks.sendMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: `flow:${flow.flowId}:update:personal-alert`,
          mirror: expect.objectContaining({
            sessionKey: "agent:main:main",
          }),
        }),
      );

      expect(helper.finish({ currentStep: "done", endedAt: 200 })).toMatchObject({
        flowId: flow.flowId,
        status: "succeeded",
        currentStep: "done",
        endedAt: 200,
      });

      expect(getFlowById(flow.flowId)).toMatchObject({
        flowId: flow.flowId,
        status: "succeeded",
      });
    });
  });

  it("refuses to bind the authoring helper to one-task flows", async () => {
    await withFlowAuthoringStateDir(async () => {
      const task = createQueuedTaskRun({
        runtime: "acp",
        requesterSessionKey: "agent:main:main",
        requesterOrigin: {
          channel: "telegram",
          to: "telegram:123",
        },
        childSessionKey: "agent:codex:acp:child",
        runId: "run-flow-authoring-single-task",
        task: "Inspect a PR",
        deliveryStatus: "pending",
      });

      expect(() => bindFlowAuthoringHelper(task.parentFlowId!)).toThrow(
        `Flow is not linear: ${task.parentFlowId}`,
      );
    });
  });
});
