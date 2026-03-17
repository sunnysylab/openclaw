export const TASK_STATES = [
  'created',
  'planned',
  'dispatched',
  'running',
  'completed',
  'under_review',
  'approved',
  'revise_requested',
  'rejected',
  'failed',
  'timed_out',
  'blocked',
];

export const TERMINAL_TASK_STATES = [
  'approved',
  'rejected',
  'failed',
  'blocked',
];

export const REVIEW_VERDICTS = [
  'approve',
  'revise',
  'reject',
  'not_required',
];

export const TASK_RESULT_STATUSES = [
  'completed',
  'failed',
  'blocked',
  'partial',
  'timed_out',
];

export const MAX_RETRY_PER_TASK = 1;
export const MAX_REVISE_PER_TASK = 1;

export const DEFAULT_PLAN_MODES = [
  'simple-single-agent',
  'research-code-review',
];

export function isTaskState(value) {
  return TASK_STATES.includes(value);
}

export function isTerminalTaskState(value) {
  return TERMINAL_TASK_STATES.includes(value);
}

export function isReviewVerdict(value) {
  return REVIEW_VERDICTS.includes(value);
}
