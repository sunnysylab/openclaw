import { getFlowById } from "./flow-registry.js";
import type { FlowRecord } from "./flow-registry.types.js";
import {
  appendFlowOutput,
  createFlow,
  emitFlowUpdate,
  failFlow,
  finishFlow,
  resumeFlow,
  runTaskInFlow,
  setFlowOutput,
  setFlowWaiting,
} from "./flow-runtime.js";

type CreateFlowParams = Parameters<typeof createFlow>[0];
type RunTaskInFlowParams = Omit<Parameters<typeof runTaskInFlow>[0], "flowId">;
type SetFlowWaitingParams = Omit<Parameters<typeof setFlowWaiting>[0], "flowId">;
type SetFlowOutputParams = Omit<Parameters<typeof setFlowOutput>[0], "flowId">;
type AppendFlowOutputParams = Omit<Parameters<typeof appendFlowOutput>[0], "flowId">;
type EmitFlowUpdateParams = Omit<Parameters<typeof emitFlowUpdate>[0], "flowId">;
type ResumeFlowParams = Omit<Parameters<typeof resumeFlow>[0], "flowId">;
type FinishFlowParams = Omit<Parameters<typeof finishFlow>[0], "flowId">;
type FailFlowParams = Omit<Parameters<typeof failFlow>[0], "flowId">;

export type FlowAuthoringHelper = {
  flowId: string;
  getFlow(): FlowRecord;
  runTask(params: RunTaskInFlowParams): ReturnType<typeof runTaskInFlow>;
  wait(params: SetFlowWaitingParams): ReturnType<typeof setFlowWaiting>;
  setOutput(params: SetFlowOutputParams): ReturnType<typeof setFlowOutput>;
  appendOutput(params: AppendFlowOutputParams): ReturnType<typeof appendFlowOutput>;
  emitUpdate(params: EmitFlowUpdateParams): ReturnType<typeof emitFlowUpdate>;
  resume(params?: ResumeFlowParams): ReturnType<typeof resumeFlow>;
  finish(params?: FinishFlowParams): ReturnType<typeof finishFlow>;
  fail(params?: FailFlowParams): ReturnType<typeof failFlow>;
};

function requireLinearFlow(flowId: string): FlowRecord {
  const flow = getFlowById(flowId);
  if (!flow) {
    throw new Error(`Flow not found: ${flowId}`);
  }
  if (flow.shape !== "linear") {
    throw new Error(`Flow is not linear: ${flowId}`);
  }
  return flow;
}

export function bindFlowAuthoringHelper(flowId: string): FlowAuthoringHelper {
  requireLinearFlow(flowId);
  return {
    flowId,
    getFlow() {
      return requireLinearFlow(flowId);
    },
    runTask(params) {
      return runTaskInFlow({
        flowId,
        ...params,
      });
    },
    wait(params) {
      return setFlowWaiting({
        flowId,
        ...params,
      });
    },
    setOutput(params) {
      return setFlowOutput({
        flowId,
        ...params,
      });
    },
    appendOutput(params) {
      return appendFlowOutput({
        flowId,
        ...params,
      });
    },
    emitUpdate(params) {
      return emitFlowUpdate({
        flowId,
        ...params,
      });
    },
    resume(params) {
      return resumeFlow({
        flowId,
        ...params,
      });
    },
    finish(params) {
      return finishFlow({
        flowId,
        ...params,
      });
    },
    fail(params) {
      return failFlow({
        flowId,
        ...params,
      });
    },
  };
}

export function createFlowAuthoringHelper(params: CreateFlowParams): {
  flow: FlowRecord;
  helper: FlowAuthoringHelper;
} {
  const flow = createFlow(params);
  return {
    flow,
    helper: bindFlowAuthoringHelper(flow.flowId),
  };
}
