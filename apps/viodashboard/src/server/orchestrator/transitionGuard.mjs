import {
  MAX_RETRY_PER_TASK,
  MAX_REVISE_PER_TASK,
} from './types.mjs';

const ALLOWED_TRANSITIONS = {
  created: ['planned'],
  planned: ['dispatched', 'blocked'],
  dispatched: ['running', 'failed', 'timed_out'],
  running: ['completed', 'failed', 'timed_out', 'blocked'],
  completed: ['under_review', 'approved'],
  under_review: ['approved', 'revise_requested', 'rejected'],
  revise_requested: ['dispatched', 'blocked', 'rejected'],
  blocked: ['dispatched', 'rejected'],
  failed: ['dispatched'],
  timed_out: ['dispatched'],
  approved: [],
  rejected: [],
};

function assert(condition, message) {
  if (!condition) {throw new Error(message);}
}

function requireBlockedReason(context = {}) {
  assert(context.reason_code, 'blocked transition requires reason_code');
  assert(context.reason_text, 'blocked transition requires reason_text');
}

function requireReviewPayload(context = {}) {
  assert(context.review, 'review payload is required');
  assert(context.review.verdict, 'review.verdict is required');
}

export function canTransition(from, to) {
  return Array.isArray(ALLOWED_TRANSITIONS[from]) && ALLOWED_TRANSITIONS[from].includes(to);
}

export function runTransitionGuards({ from, to, context = {}, task = null }) {
  assert(canTransition(from, to), `Illegal transition: ${from} -> ${to}`);

  if (from === 'planned' && to === 'dispatched') {
    assert(context.dispatch, 'dispatch payload is required');
    assert(context.dispatch.agent_id, 'dispatch.agent_id is required');
    assert(context.dispatch.execution?.model, 'dispatch.execution.model is required');
  }

  if (from === 'failed' && to === 'dispatched') {
    const retryCount = Number(task?.retry_count || 0);
    assert(retryCount < MAX_RETRY_PER_TASK, 'retry budget exceeded');
    assert(context.dispatch, 'retry redispatch requires dispatch payload');
  }

  if (from === 'timed_out' && to === 'dispatched') {
    const retryCount = Number(task?.retry_count || 0);
    assert(retryCount < MAX_RETRY_PER_TASK, 'retry budget exceeded');
    assert(context.dispatch, 'timeout redispatch requires dispatch payload');
  }

  if (from === 'revise_requested' && to === 'dispatched') {
    const reviseCount = Number(task?.revise_count || 0);
    assert(reviseCount < MAX_REVISE_PER_TASK, 'revise budget exceeded');
    assert(Array.isArray(context.required_fixes) && context.required_fixes.length > 0,
      'redispatch after revise requires required_fixes');
    assert(context.dispatch, 'revise redispatch requires dispatch payload');
  }

  if (from === 'running' && to === 'completed') {
    assert(context.result, 'result payload is required');
    assert(context.result.status === 'completed', 'running -> completed requires result.status=completed');
  }

  if (from === 'completed' && to === 'under_review') {
    assert(context.review_required === true, 'completed -> under_review requires review_required=true');
    assert(context.reviewer_agent_id, 'completed -> under_review requires reviewer_agent_id');
  }

  if (from === 'completed' && to === 'approved') {
    assert(context.review_required === false, 'completed -> approved only allowed when review_required=false');
  }

  if (from === 'under_review' && to === 'approved') {
    requireReviewPayload(context);
    assert(context.review.verdict === 'approve', 'under_review -> approved requires verdict=approve');
  }

  if (from === 'under_review' && to === 'revise_requested') {
    requireReviewPayload(context);
    assert(context.review.verdict === 'revise', 'under_review -> revise_requested requires verdict=revise');
    assert(Array.isArray(context.review.required_fixes) && context.review.required_fixes.length > 0,
      'revise_requested requires required_fixes');
  }

  if (from === 'under_review' && to === 'rejected') {
    requireReviewPayload(context);
    assert(context.review.verdict === 'reject', 'under_review -> rejected requires verdict=reject');
  }

  if (to === 'blocked') {
    requireBlockedReason(context);
  }

  return true;
}

export function transitionTask(stores, taskId, from, to, context = {}) {
  const task = stores.getTaskExecution(taskId);
  assert(task, `Task not found: ${taskId}`);
  assert(task.status === from, `Task ${taskId} expected status ${from}, got ${task.status}`);

  runTransitionGuards({ from, to, context, task });

  const patch = {
    status: to,
    updated_at: new Date().toISOString(),
  };

  if (to === 'running') {patch.started_at = patch.updated_at;}
  if (to === 'completed') {patch.completed_at = patch.updated_at;}
  if (['approved', 'rejected', 'failed', 'blocked'].includes(to)) {patch.ended_at = patch.updated_at;}
  if ((from === 'failed' || from === 'timed_out') && to === 'dispatched') {
    patch.retry_count = Number(task.retry_count || 0) + 1;
  }
  if (from === 'under_review' && to === 'revise_requested') {
    patch.required_fixes = context.review.required_fixes;
  }
  if (from === 'revise_requested' && to === 'dispatched') {
    patch.revise_count = Number(task.revise_count || 0) + 1;
  }

  const updated = stores.updateTaskExecution(taskId, patch);

  stores.appendEvent({
    type: 'transition',
    root_task_id: updated.root_task_id,
    task_id: taskId,
    from,
    to,
    owner: context.owner || 'system',
    reason: context.reason_text || context.reason || null,
  });

  return updated;
}
