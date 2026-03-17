import { transitionTask } from './transitionGuard.mjs';

function assert(condition, message) {
  if (!condition) {throw new Error(message);}
}

export function normalizeTaskResult(rawResult) {
  return rawResult;
}

export function acceptTaskResult(stores, rawResult) {
  const result = normalizeTaskResult(rawResult);
  assert(result?.task_id, 'rawResult.task_id is required');
  const task = stores.getTaskExecution(result.task_id);
  assert(task, `Task not found: ${result.task_id}`);

  if (result.status === 'completed') {
    const updated = transitionTask(stores, result.task_id, 'running', 'completed', {
      owner: result.agent_id || 'runtime',
      result,
    });

    stores.updateTaskExecution(result.task_id, {
      result_payload: result,
      updated_at: new Date().toISOString(),
    });

    return updated;
  }

  if (result.status === 'failed') {
    const updated = transitionTask(stores, result.task_id, 'running', 'failed', {
      owner: result.agent_id || 'runtime',
      reason: result?.error?.message || 'execution failed',
    });

    stores.updateTaskExecution(result.task_id, {
      result_payload: result,
      updated_at: new Date().toISOString(),
    });

    return updated;
  }

  if (result.status === 'blocked') {
    const updated = transitionTask(stores, result.task_id, 'running', 'blocked', {
      owner: result.agent_id || 'runtime',
      reason_code: result.reason_code || 'blocked',
      reason_text: result.reason_text || 'execution blocked',
    });

    stores.updateTaskExecution(result.task_id, {
      result_payload: result,
      updated_at: new Date().toISOString(),
    });

    return updated;
  }

  if (result.status === 'timed_out') {
    const updated = transitionTask(stores, result.task_id, 'running', 'timed_out', {
      owner: result.agent_id || 'runtime',
      reason: result?.error?.message || 'execution timed out',
    });

    stores.updateTaskExecution(result.task_id, {
      result_payload: result,
      updated_at: new Date().toISOString(),
    });

    return updated;
  }

  throw new Error(`Unsupported result status: ${result.status}`);
}
