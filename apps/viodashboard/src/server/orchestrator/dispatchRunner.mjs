import { resolveExecutionConfig } from './registryLoader.mjs';
import { transitionTask } from './transitionGuard.mjs';

export function seedTaskExecution(stores, payload) {
  if (!payload?.task_id) {throw new Error('payload.task_id is required');}

  const existing = stores.getTaskExecution(payload.task_id);
  if (existing) {return existing;}

  return stores.saveTaskExecution({
    task_id: payload.task_id,
    root_task_id: payload.root_task_id,
    parent_task_id: payload.parent_task_id || null,
    kind: payload.kind || 'work',
    agent_id: payload.agent_id,
    model_used: null,
    fallback_used: false,
    retry_count: 0,
    revise_count: 0,
    status: 'planned',
    result_payload: null,
    review_required: payload.review_required === true,
    reviewer_agent_id: payload.reviewer_agent_id || null,
    required_fixes: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

export function buildDispatch(taskNode, rootTask, registry, options = {}) {
  if (!taskNode?.task_id) {throw new Error('taskNode.task_id is required');}
  if (!rootTask?.root_task_id) {throw new Error('rootTask.root_task_id is required');}

  const resolved = resolveExecutionConfig(
    registry,
    taskNode.agent_id,
    taskNode.proposed_execution || null
  );

  return {
    task_id: taskNode.task_id,
    root_task_id: rootTask.root_task_id,
    parent_task_id: taskNode.parent_task_id || null,
    agent_id: taskNode.agent_id,
    goal: taskNode.goal,
    inputs: {
      user_request: rootTask.user_request || rootTask.goal,
      context_summary: taskNode.inputs_summary || rootTask.goal,
      artifacts: taskNode.artifacts_hint || [],
      references: [],
    },
    constraints: {
      must_preserve_behavior: rootTask.constraints || [],
      avoid: [],
      style_requirements: [],
    },
    execution: {
      model: resolved.model,
      thinking: resolved.thinking,
      tool_mode: resolved.tool_mode,
      budget_class: taskNode.proposed_execution?.budget_class || 'normal',
      timeout_s: options.timeout_s || 900,
      retry_limit: options.retry_limit ?? 1,
    },
    review: {
      required: taskNode.review_required === true,
      reviewer_agent_id: taskNode.reviewer_agent_id || null,
    },
    audit: {
      dispatch_kind: 'initial',
      routing_reason: `task routed to ${taskNode.agent_id}`,
      selected_from_policy: taskNode.proposed_execution ? 'plan-proposed' : 'role-default',
    },
  };
}

export function buildRedispatch(taskExecution, rootTask, registry, options = {}) {
  const resolved = resolveExecutionConfig(
    registry,
    taskExecution.agent_id,
    options.executionOverride || null
  );

  return {
    task_id: taskExecution.task_id,
    root_task_id: rootTask.root_task_id,
    parent_task_id: taskExecution.parent_task_id || null,
    agent_id: taskExecution.agent_id,
    goal: options.goal || rootTask.goal,
    inputs: {
      user_request: rootTask.user_request || rootTask.goal,
      context_summary: options.context_summary || 'Redispatch after failure or review.',
      artifacts: options.artifacts || [],
      references: [],
    },
    constraints: {
      must_preserve_behavior: rootTask.constraints || [],
      avoid: [],
      style_requirements: [],
    },
    execution: {
      model: resolved.model,
      thinking: resolved.thinking,
      tool_mode: resolved.tool_mode,
      budget_class: 'normal',
      timeout_s: options.timeout_s || 900,
      retry_limit: options.retry_limit ?? 1,
    },
    review: {
      required: taskExecution.review_required === true,
      reviewer_agent_id: taskExecution.reviewer_agent_id || null,
    },
    audit: {
      dispatch_kind: options.dispatchKind || 'retry',
      routing_reason: 'redispatch after failure or revise request',
      selected_from_policy: options.executionOverride ? 'override' : 'role-default',
    },
  };
}

export async function runDispatch(stores, dispatch, runtimeAdapter, context = {}) {
  const task = stores.getTaskExecution(dispatch.task_id);
  if (!task) {throw new Error(`Task not seeded: ${dispatch.task_id}`);}

  const fromState = context.fromState || 'planned';

  transitionTask(stores, dispatch.task_id, fromState, 'dispatched', {
    owner: 'orchestrator',
    dispatch,
    reason: context.reason || dispatch.audit?.dispatch_kind || 'dispatch',
    required_fixes: context.required_fixes || [],
  });

  transitionTask(stores, dispatch.task_id, 'dispatched', 'running', {
    owner: 'runtime',
    reason: 'execution started',
  });

  stores.updateTaskExecution(dispatch.task_id, {
    model_used: dispatch.execution.model,
    updated_at: new Date().toISOString(),
  });

  stores.appendEvent({
    type: 'dispatch',
    root_task_id: dispatch.root_task_id,
    task_id: dispatch.task_id,
    agent_id: dispatch.agent_id,
    model: dispatch.execution.model,
    retry_count: task.retry_count || 0,
    revise_count: task.revise_count || 0,
    dispatch_kind: dispatch.audit?.dispatch_kind || 'initial',
  });

  return runtimeAdapter.executeDispatch(dispatch, context);
}
