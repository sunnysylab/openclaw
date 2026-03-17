// NOTE: `blocked -> running` and `failed -> running` are currently retained as
// forward-compatibility transitions for future recovery/resume flows.
// Orchestrator v1 does not actively use these recovery paths yet.
const ALLOWED_ROOT_TRANSITIONS = {
  created: ['planned'],
  planned: ['running', 'blocked', 'failed'],
  running: ['partial', 'approved', 'revise_requested', 'blocked', 'failed', 'rejected'],
  partial: ['running', 'approved', 'revise_requested', 'blocked', 'failed', 'rejected'],
  revise_requested: ['running', 'blocked', 'failed', 'rejected'],
  blocked: ['running', 'rejected'],
  failed: ['running', 'rejected'],
  approved: [],
  rejected: [],
};

function assert(condition, message) {
  if (!condition) {throw new Error(message);}
}

export function canTransitionRoot(from, to) {
  return Array.isArray(ALLOWED_ROOT_TRANSITIONS[from]) && ALLOWED_ROOT_TRANSITIONS[from].includes(to);
}

export function runRootTransitionGuards({ from, to, context = {}, rootTask = null }) {
  assert(canTransitionRoot(from, to), `Illegal root transition: ${from} -> ${to}`);

  if (from === 'created' && to === 'planned') {
    assert(context.plan, 'created -> planned requires plan');
  }

  if ((from === 'planned' || from === 'partial' || from === 'revise_requested' || from === 'failed' || from === 'blocked') && to === 'running') {
    assert(context.reason, `${from} -> running requires reason`);
  }

  if ((to === 'blocked' || to === 'failed' || to === 'rejected') && !context.reason) {
    throw new Error(`${from} -> ${to} requires reason`);
  }

  if (to === 'approved') {
    assert(context.finalResponse, 'approved requires finalResponse');
  }

  if (to === 'revise_requested') {
    assert(Array.isArray(context.required_fixes) && context.required_fixes.length > 0,
      'revise_requested requires required_fixes');
  }

  return true;
}

export function transitionRootTask(stores, rootTaskId, from, to, context = {}) {
  const rootTask = stores.getRootTask(rootTaskId);
  assert(rootTask, `Root task not found: ${rootTaskId}`);
  assert(rootTask.current_status === from,
    `Root task ${rootTaskId} expected status ${from}, got ${rootTask.current_status}`);

  runRootTransitionGuards({ from, to, context, rootTask });

  const patch = {
    current_status: to,
    updated_at: new Date().toISOString(),
  };

  if (to === 'running' && !rootTask.started_at) {patch.started_at = patch.updated_at;}
  if (['approved', 'rejected', 'failed'].includes(to)) {patch.ended_at = patch.updated_at;}

  const updated = stores.updateRootTask(rootTaskId, patch);

  stores.appendEvent({
    type: 'root_transition',
    root_task_id: rootTaskId,
    from,
    to,
    owner: context.owner || 'orchestrator',
    reason: context.reason || null,
  });

  return updated;
}
