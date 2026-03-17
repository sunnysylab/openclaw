function uniq(values = []) {
  return [...new Set(values.filter(Boolean))];
}

export function buildFinalResponse(stores, rootTaskId) {
  const rootTask = stores.getRootTask(rootTaskId);
  if (!rootTask) {throw new Error(`Root task not found: ${rootTaskId}`);}

  const tasks = stores.listTasksByRoot(rootTaskId);
  const reviews = stores.listReviewsByRoot(rootTaskId);

  const workTasks = tasks.filter(task => task.kind !== 'review');
  const reviewTasks = tasks.filter(task => task.kind === 'review');

  const child_task_statuses = tasks.map(task => ({
    task_id: task.task_id,
    agent_id: task.agent_id,
    status: task.status,
    model_used: task.model_used || null,
    fallback_used: Boolean(task.fallback_used),
  }));

  const latestReview = reviews.length > 0 ? reviews[reviews.length - 1] : null;

  const allRisks = uniq([
    ...workTasks.flatMap(task => task.result_payload?.risks || []),
    ...reviews.flatMap(review => review.risks || []),
  ]);

  const artifacts = uniq(workTasks.flatMap(task => task.result_payload?.artifacts || []));

  let status = 'approved';
  if (workTasks.some(task => task.status === 'rejected')) {status = 'rejected';}
  else if (workTasks.some(task => task.status === 'revise_requested')) {status = 'revise_requested';}
  else if (workTasks.some(task => task.status === 'blocked')) {status = 'blocked';}
  else if (workTasks.some(task => ['failed', 'timed_out'].includes(task.status))) {status = 'failed';}
  else if (workTasks.some(task => ['planned', 'dispatched', 'running', 'under_review'].includes(task.status))) {status = 'partial';}

  const workModels = uniq(workTasks.map(task => task.model_used).filter(Boolean));
  const reviewModels = uniq(reviewTasks.map(task => task.model_used).filter(Boolean));
  const sameModelReview =
    workModels.length > 0 &&
    reviewModels.length > 0 &&
    reviewModels.some(model => workModels.includes(model));

  const finalResponse = {
    root_task_id: rootTaskId,
    status,
    summary: `Root task ${rootTask.goal} finished with status ${status}.`,
    child_task_statuses,
    review_summary: {
      verdict: latestReview?.verdict || 'not_required',
      confidence: latestReview?.confidence || null,
      key_findings: latestReview?.findings || [],
      required_fixes: latestReview?.required_fixes || [],
    },
    artifacts,
    risks: allRisks,
    recommended_next_action:
      latestReview?.verdict === 'revise'
        ? 'Apply required fixes and redispatch once.'
        : latestReview?.verdict === 'reject'
          ? 'Escalate to orchestrator or human for decision.'
          : status === 'blocked'
            ? 'Unblock dependencies or escalate.'
            : status === 'failed'
              ? 'Inspect failure path and retry or escalate.'
              : 'Proceed to real runtime integration or next task.',
    audit: {
      aggregated_by: 'orchestrator',
      multi_model_requested: true,
      multi_model_effective: true,
      same_model_review: sameModelReview,
    },
  };

  stores.appendEvent({
    type: 'final_aggregation',
    root_task_id: rootTaskId,
    final_status: status,
    review_summary_verdict: latestReview?.verdict || 'not_required',
    risk_count: allRisks.length,
  });

  return finalResponse;
}
