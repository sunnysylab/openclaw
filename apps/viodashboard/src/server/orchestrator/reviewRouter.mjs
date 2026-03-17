import { transitionTask } from './transitionGuard.mjs';
import { resolveExecutionConfig } from './registryLoader.mjs';
import { seedTaskExecution } from './dispatchRunner.mjs';

export function needsReview(taskExecution) {
  return taskExecution?.review_required === true;
}

export function getNextReviewSequence(stores, parentTaskId) {
  const events = stores.listEvents({ task_id: parentTaskId, type: 'review_sequence' });
  return events.length + 1;
}

export function buildReviewDispatch(taskExecution, rootTask, registry, stores) {
  const reviewerAgentId = taskExecution.reviewer_agent_id;
  if (!reviewerAgentId) {throw new Error(`Task ${taskExecution.task_id} has no reviewer_agent_id`);}

  const resolved = resolveExecutionConfig(registry, reviewerAgentId);
  const sequence = getNextReviewSequence(stores, taskExecution.task_id);
  const reviewTaskId = `${taskExecution.task_id}::review::r${sequence}`;

  return {
    task_id: reviewTaskId,
    root_task_id: rootTask.root_task_id,
    parent_task_id: taskExecution.task_id,
    agent_id: reviewerAgentId,
    goal: `Review task ${taskExecution.task_id}`,
    inputs: {
      user_request: rootTask.user_request || rootTask.goal,
      context_summary: `Review output for ${taskExecution.task_id}`,
      artifacts: taskExecution.result_payload?.artifacts || [],
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
      timeout_s: 600,
      retry_limit: 0,
    },
    review: {
      required: false,
      reviewer_agent_id: null,
    },
    audit: {
      dispatch_kind: 'review',
      review_sequence: sequence,
      routing_reason: `review routed to ${reviewerAgentId}`,
      selected_from_policy: 'reviewer-default',
    },
  };
}

export function seedReviewTask(stores, rootTaskId, reviewDispatch) {
  return seedTaskExecution(stores, {
    task_id: reviewDispatch.task_id,
    root_task_id: rootTaskId,
    parent_task_id: reviewDispatch.parent_task_id,
    kind: 'review',
    agent_id: reviewDispatch.agent_id,
    review_required: false,
    reviewer_agent_id: null,
  });
}

// Precondition: caller must invoke this only after the parent work task has
// reached `completed`. This helper is responsible for opening the review window
// via `completed -> under_review` before the review verdict is consumed.
export function openReview(stores, taskExecution, reviewDispatch) {
  stores.appendEvent({
    type: 'review_sequence',
    root_task_id: taskExecution.root_task_id,
    task_id: taskExecution.task_id,
    review_task_id: reviewDispatch.task_id,
    sequence: reviewDispatch.audit?.review_sequence || null,
  });

  return transitionTask(stores, taskExecution.task_id, 'completed', 'under_review', {
    owner: 'orchestrator',
    review_required: true,
    reviewer_agent_id: taskExecution.reviewer_agent_id,
    reason: `review opened via ${reviewDispatch.task_id}`,
  });
}

// Precondition: caller must ensure the parent work task has already been moved
// to `under_review` (normally via `openReview(...)`) before accepting a review
// verdict here. This helper only closes the review path.
export function acceptReviewResult(stores, taskExecution, reviewTaskExecution, reviewPayload) {
  stores.saveReview(taskExecution.task_id, reviewPayload);

  stores.appendEvent({
    type: 'review',
    root_task_id: taskExecution.root_task_id,
    task_id: taskExecution.task_id,
    review_task_id: reviewTaskExecution.task_id,
    review_target: taskExecution.task_id,
    reviewer_agent_id: reviewPayload.agent_id,
    verdict: reviewPayload.verdict,
  });

  if (reviewPayload.verdict === 'approve') {
    return transitionTask(stores, taskExecution.task_id, 'under_review', 'approved', {
      owner: reviewPayload.agent_id,
      review: reviewPayload,
    });
  }

  if (reviewPayload.verdict === 'revise') {
    return transitionTask(stores, taskExecution.task_id, 'under_review', 'revise_requested', {
      owner: reviewPayload.agent_id,
      review: reviewPayload,
    });
  }

  if (reviewPayload.verdict === 'reject') {
    return transitionTask(stores, taskExecution.task_id, 'under_review', 'rejected', {
      owner: reviewPayload.agent_id,
      review: reviewPayload,
    });
  }

  throw new Error(`Unsupported review verdict: ${reviewPayload.verdict}`);
}
