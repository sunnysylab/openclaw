import { createStores } from './stores.mjs';
import { loadAgentRegistry } from './registryLoader.mjs';
import { buildPlan } from './planBuilder.mjs';
import { createRuntimeAdapter } from './runtimeAdapter.mjs';
import { acceptTaskResult } from './resultCollector.mjs';
import {
  buildDispatch,
  buildRedispatch,
  runDispatch,
  seedTaskExecution,
} from './dispatchRunner.mjs';
import {
  needsReview,
  buildReviewDispatch,
  seedReviewTask,
  openReview,
  acceptReviewResult,
} from './reviewRouter.mjs';
import { buildFinalResponse } from './finalAggregator.mjs';
import { transitionTask } from './transitionGuard.mjs';
import { transitionRootTask } from './rootTaskTransitionGuard.mjs';

function canRetry(taskExecution) {
  return Number(taskExecution.retry_count || 0) < 1;
}

function canRevise(taskExecution) {
  return Number(taskExecution.revise_count || 0) < 1;
}

function isBlockedLikeResult(taskExecution) {
  const payload = taskExecution?.result_payload || {};
  return taskExecution?.status === 'blocked' || payload?.reason_code === 'missing_artifact';
}

function rejectTaskAndRoot(stores, rootTaskId, taskId, reason) {
  const task = stores.getTaskExecution(taskId);

  if (task?.status === 'revise_requested') {
    transitionTask(stores, taskId, 'revise_requested', 'rejected', {
      owner: 'orchestrator',
      reason,
      review: {
        verdict: 'reject',
        required_fixes: task.required_fixes || [],
      },
    });
  } else if (task?.status === 'under_review') {
    transitionTask(stores, taskId, 'under_review', 'rejected', {
      owner: 'orchestrator',
      reason,
      review: {
        verdict: 'reject',
        required_fixes: task.required_fixes || [],
      },
    });
  }

  const root = stores.getRootTask(rootTaskId);
  if (root && !['approved', 'rejected', 'failed', 'blocked'].includes(root.current_status)) {
    transitionRootTask(stores, rootTaskId, root.current_status, 'rejected', {
      owner: 'orchestrator',
      reason,
    });
  }
}

function failOrBlockTaskAndRoot(stores, rootTaskId, taskId, reason, blocked = false) {
  const root = stores.getRootTask(rootTaskId);
  const target = blocked ? 'blocked' : 'failed';

  // Keep child-side failure semantics clean in v1: do not force a timed_out
  // task through a fake redispatch just to manufacture a harder terminal state.
  // The root task is closed explicitly here; child timeout terminalization can
  // be designed later with a dedicated legal path if needed.
  if (root && !['approved', 'rejected', 'failed', 'blocked'].includes(root.current_status)) {
    transitionRootTask(stores, rootTaskId, root.current_status, target, {
      owner: 'orchestrator',
      reason,
    });
  }
}

async function executeInitialAttempt(stores, taskNode, rootTask, registry, runtimeAdapter, options = {}) {
  const dispatch = buildDispatch(taskNode, rootTask, registry, options);
  const rawResult = await runDispatch(stores, dispatch, runtimeAdapter, {
    ...options,
    fromState: 'planned',
    reason: 'initial dispatch',
  });
  acceptTaskResult(stores, rawResult);
  return stores.getTaskExecution(taskNode.task_id);
}

async function executeReviewTaskOnce(stores, taskExecution, rootTask, registry, runtimeAdapter, options = {}) {
  const reviewDispatch = buildReviewDispatch(taskExecution, rootTask, registry, stores);
  seedReviewTask(stores, rootTask.root_task_id, reviewDispatch);

  openReview(stores, taskExecution, reviewDispatch);

  const rawReview = await runDispatch(stores, reviewDispatch, runtimeAdapter, {
    ...options,
    fromState: 'planned',
    reason: 'review dispatch',
    review_target: taskExecution.task_id,
  });

  acceptTaskResult(stores, {
    ...rawReview,
    task_id: reviewDispatch.task_id,
    status: 'completed',
  });

  const completedReviewTask = stores.getTaskExecution(reviewDispatch.task_id);
  acceptReviewResult(stores, stores.getTaskExecution(taskExecution.task_id), completedReviewTask, rawReview);

  return {
    reviewTask: completedReviewTask,
    reviewPayload: rawReview,
    parentTask: stores.getTaskExecution(taskExecution.task_id),
  };
}

async function handleRetryBranch(stores, taskExecution, taskNode, rootTask, registry, runtimeAdapter, options) {
  const taskId = taskExecution.task_id;

  if (!canRetry(taskExecution)) {
    failOrBlockTaskAndRoot(
      stores,
      rootTask.root_task_id,
      taskId,
      `task ${taskId} exceeded retry limit`,
      isBlockedLikeResult(taskExecution)
    );
    return stores.getTaskExecution(taskId);
  }

  const rootCurrent = stores.getRootTask(rootTask.root_task_id);
  if (rootCurrent.current_status === 'running') {
    transitionRootTask(stores, rootTask.root_task_id, 'running', 'partial', {
      owner: 'orchestrator',
      reason: `task ${taskId} failed once; retry scheduled`,
    });
  }

  const retryDispatch = buildRedispatch(taskExecution, rootTask, registry, {
    ...options,
    context_summary: 'Retry after execution failure.',
    artifacts: taskNode.artifacts_hint || [],
    dispatchKind: 'retry',
  });

  const retryResult = await runDispatch(stores, retryDispatch, runtimeAdapter, {
    ...options,
    fromState: taskExecution.status,
    reason: 'retry redispatch',
  });

  acceptTaskResult(stores, retryResult);
  const afterRetry = stores.getTaskExecution(taskId);

  if (afterRetry.status === 'completed') {
    const rootAfterRetry = stores.getRootTask(rootTask.root_task_id);
    if (rootAfterRetry.current_status === 'partial') {
      transitionRootTask(stores, rootTask.root_task_id, 'partial', 'running', {
        owner: 'orchestrator',
        reason: `task ${taskId} recovered after retry`,
      });
    }
    return afterRetry;
  }

  failOrBlockTaskAndRoot(
    stores,
    rootTask.root_task_id,
    taskId,
    `task ${taskId} still not successful after retry`,
    isBlockedLikeResult(afterRetry)
  );

  return stores.getTaskExecution(taskId);
}

async function handleReviewBranch(stores, taskExecution, taskNode, rootTask, registry, runtimeAdapter, options) {
  const taskId = taskExecution.task_id;

  let reviewed = await executeReviewTaskOnce(
    stores,
    taskExecution,
    rootTask,
    registry,
    runtimeAdapter,
    options
  );

  let currentTask = reviewed.parentTask;

  if (currentTask.status !== 'revise_requested') {
    return currentTask;
  }

  const rootCurrent = stores.getRootTask(rootTask.root_task_id);
  if (rootCurrent.current_status === 'running') {
    transitionRootTask(stores, rootTask.root_task_id, 'running', 'revise_requested', {
      owner: 'orchestrator',
      required_fixes: currentTask.required_fixes || ['review requested changes'],
      reason: `task ${taskId} requires revision`,
    });
  }

  if (!canRevise(currentTask)) {
    rejectTaskAndRoot(
      stores,
      rootTask.root_task_id,
      taskId,
      `task ${taskId} exceeded revise limit`
    );
    return stores.getTaskExecution(taskId);
  }

  const revisedDispatch = buildRedispatch(currentTask, rootTask, registry, {
    ...options,
    context_summary: `Revise after review. Required fixes: ${(currentTask.required_fixes || []).join('; ')}`,
    artifacts: taskNode.artifacts_hint || [],
    dispatchKind: 'revise',
  });

  const rootCurrent2 = stores.getRootTask(rootTask.root_task_id);
  if (rootCurrent2.current_status === 'revise_requested') {
    transitionRootTask(stores, rootTask.root_task_id, 'revise_requested', 'running', {
      owner: 'orchestrator',
      reason: `redispatching revised task ${taskId}`,
    });
  }

  const revisedResult = await runDispatch(stores, revisedDispatch, runtimeAdapter, {
    ...options,
    fromState: 'revise_requested',
    reason: 'revise redispatch',
    required_fixes: currentTask.required_fixes || [],
  });

  acceptTaskResult(stores, revisedResult);
  currentTask = stores.getTaskExecution(taskId);

  if (currentTask.status !== 'completed') {
    return currentTask;
  }

  const secondReview = await executeReviewTaskOnce(
    stores,
    currentTask,
    rootTask,
    registry,
    runtimeAdapter,
    options
  );

  currentTask = secondReview.parentTask;

  if (currentTask.status === 'revise_requested') {
    rejectTaskAndRoot(
      stores,
      rootTask.root_task_id,
      taskId,
      `task ${taskId} exceeded revise limit`
    );
    return stores.getTaskExecution(taskId);
  }

  return currentTask;
}

export async function runRootTask(rootTask, options = {}) {
  const stores = options.stores || createStores();
  const registry = options.registry || loadAgentRegistry(options.registryPath);
  const runtimeAdapter = options.runtimeAdapter || createRuntimeAdapter(options.runtimeOptions);

  stores.createRootTask({
    root_task_id: rootTask.root_task_id,
    goal: rootTask.goal,
    current_status: 'created',
    created_at: new Date().toISOString(),
    final_response_id: null,
  });

  const plan = buildPlan(rootTask, registry);
  stores.savePlan(rootTask.root_task_id, plan);

  transitionRootTask(stores, rootTask.root_task_id, 'created', 'planned', {
    owner: 'orchestrator',
    plan,
  });

  transitionRootTask(stores, rootTask.root_task_id, 'planned', 'running', {
    owner: 'orchestrator',
    reason: 'plan execution started',
  });

  stores.appendEvent({
    type: 'plan',
    root_task_id: rootTask.root_task_id,
    chosen_plan_mode: plan.audit?.planning_notes || 'unknown',
    task_count: plan.tasks.length,
    execution_order: plan.execution_order,
  });

  const workTasks = plan.tasks;
  const taskMap = new Map(workTasks.map(task => [task.task_id, task]));

  for (const taskNode of workTasks) {
    seedTaskExecution(stores, {
      task_id: taskNode.task_id,
      root_task_id: rootTask.root_task_id,
      parent_task_id: null,
      kind: 'work',
      agent_id: taskNode.agent_id,
      review_required:  taskNode.review_required,
      reviewer_agent_id: taskNode.reviewer_agent_id || null,
    });
  }

  for (const stage of plan.execution_order) {
    for (const taskId of stage) {
      const taskNode = taskMap.get(taskId);
      if (!taskNode) {continue;}

      let taskExecution = await executeInitialAttempt(
        stores,
        taskNode,
        rootTask,
        registry,
        runtimeAdapter,
        options
      );

      if (['failed', 'timed_out'].includes(taskExecution.status)) {
        taskExecution = await handleRetryBranch(
          stores,
          taskExecution,
          taskNode,
          rootTask,
          registry,
          runtimeAdapter,
          options
        );

        if (['failed', 'blocked', 'rejected'].includes(taskExecution.status)) {
          break;
        }
      }

      if (taskExecution.status === 'completed' && needsReview(taskExecution)) {
        taskExecution = await handleReviewBranch(
          stores,
          taskExecution,
          taskNode,
          rootTask,
          registry,
          runtimeAdapter,
          options
        );

        if (['rejected', 'failed', 'blocked'].includes(taskExecution.status)) {
          break;
        }
      }

      if (taskExecution.status === 'completed' && !needsReview(taskExecution)) {
        transitionTask(stores, taskExecution.task_id, 'completed', 'approved', {
          owner: 'orchestrator',
          review_required: false,
          reason: 'no review required',
        });
      }
    }

    const rootNow = stores.getRootTask(rootTask.root_task_id);
    if (['approved', 'rejected', 'failed', 'blocked'].includes(rootNow.current_status)) {
      break;
    }
  }

  const finalResponse = buildFinalResponse(stores, rootTask.root_task_id);
  const rootCurrent = stores.getRootTask(rootTask.root_task_id);

  if (rootCurrent.current_status !== finalResponse.status) {
    transitionRootTask(
      stores,
      rootTask.root_task_id,
      rootCurrent.current_status,
      finalResponse.status,
      {
        owner: 'orchestrator',
        reason: 'final aggregation completed',
        finalResponse,
        required_fixes: finalResponse.review_summary?.required_fixes || [],
      }
    );
  }

  stores.updateRootTask(rootTask.root_task_id, {
    final_response_id: `${rootTask.root_task_id}::final`,
    final_response: finalResponse,
  });

  return {
    plan,
    finalResponse,
    snapshot: stores.snapshot(),
  };
}
