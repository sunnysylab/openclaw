export function createRuntimeAdapter(options = {}) {
  let callIndex = 0;
  let reviewIndex = 0;
  const sequenceState = new WeakMap();

  function nextReviewVerdict() {
    if (Array.isArray(options.reviewVerdicts) && options.reviewVerdicts.length > 0) {
      const verdict = options.reviewVerdicts[Math.min(reviewIndex, options.reviewVerdicts.length - 1)];
      reviewIndex += 1;
      return verdict;
    }
    return options.reviewVerdict || 'approve';
  }

  function matchesRule(dispatch, rule = {}) {
    if (rule.kind && rule.kind !== (dispatch.agent_id === 'reviewer' ? 'review' : 'work')) {return false;}
    if (rule.task_id && rule.task_id !== dispatch.task_id) {return false;}
    if (rule.taskId && rule.taskId !== dispatch.task_id) {return false;}
    if (rule.agent_id && rule.agent_id !== dispatch.agent_id) {return false;}
    if (rule.agentId && rule.agentId !== dispatch.agent_id) {return false;}
    if (rule.parent_task_id && rule.parent_task_id !== dispatch.parent_task_id) {return false;}
    if (rule.dispatch_kind && rule.dispatch_kind !== dispatch.audit?.dispatch_kind) {return false;}
    if (rule.dispatchKind && rule.dispatchKind !== dispatch.audit?.dispatch_kind) {return false;}
    return true;
  }

  function nextSequenceEntry(dispatch) {
    if (Array.isArray(options.sequence) && options.sequence.length > 0) {
      const entry = options.sequence[Math.min(callIndex, options.sequence.length - 1)];
      callIndex += 1;
      return entry;
    }

    if (Array.isArray(options.sequenceRules) && options.sequenceRules.length > 0) {
      for (const rule of options.sequenceRules) {
        if (!matchesRule(dispatch, rule)) {continue;}
        const used = sequenceState.get(rule) || 0;
        const maxUses = Number(rule.maxUses ?? rule.max_uses ?? 1);
        if (used >= maxUses) {continue;}
        sequenceState.set(rule, used + 1);
        return rule;
      }
    }

    return null;
  }

  return {
    async executeDispatch(dispatch, context = {}) {
      const sequenceEntry = options.mode === 'sequence' ? nextSequenceEntry(dispatch) : null;

      if (sequenceEntry?.kind === 'work' && sequenceEntry.status === 'failed') {
        return {
          task_id: dispatch.task_id,
          agent_id: dispatch.agent_id,
          status: 'failed',
          error: {
            code: 'stub_failure',
            message: `Sequence stub forced failure for ${dispatch.task_id}`,
          },
        };
      }

      if (sequenceEntry?.kind === 'work' && sequenceEntry.status === 'blocked') {
        return {
          task_id: dispatch.task_id,
          agent_id: dispatch.agent_id,
          status: 'blocked',
          reason_code: 'stub_blocked',
          reason_text: `Sequence stub blocked ${dispatch.task_id}`,
        };
      }

      if (dispatch.agent_id === 'reviewer') {
        const verdict = sequenceEntry?.kind === 'review'
          ? (sequenceEntry.verdict || 'approve')
          : nextReviewVerdict();

        return {
          task_id: dispatch.task_id,
          agent_id: dispatch.agent_id,
          review_target: context.review_target || 'unknown',
          verdict,
          confidence: 'medium',
          findings: [`Stub review for ${dispatch.task_id}`],
          risks: verdict === 'revise' ? ['Further validation requested before approval.'] : [],
          required_fixes: verdict === 'revise'
            ? ['Apply requested fixes and redispatch once.']
            : [],
          final_recommendation: verdict === 'revise'
            ? 'Revise once before approval.'
            : 'Looks acceptable for v1 stub flow.',
          review_trace: {
            model_used: dispatch.execution.model,
            compared_artifacts: dispatch.inputs?.artifacts || [],
          },
        };
      }

      if (options.mode === 'stub-failure') {
        return {
          task_id: dispatch.task_id,
          agent_id: dispatch.agent_id,
          status: 'failed',
          error: {
            code: 'stub_failure',
            message: `Stub runtime forced failure for ${dispatch.task_id}`,
          },
        };
      }

      if (options.mode === 'stub-blocked') {
        return {
          task_id: dispatch.task_id,
          agent_id: dispatch.agent_id,
          status: 'blocked',
          reason_code: 'stub_blocked',
          reason_text: `Stub runtime blocked ${dispatch.task_id}`,
        };
      }

      return {
        task_id: dispatch.task_id,
        agent_id: dispatch.agent_id,
        status: 'completed',
        goal: dispatch.goal,
        summary: `Stub result for ${dispatch.task_id}`,
        assumptions: [],
        changes: [],
        artifacts: dispatch.inputs?.artifacts || [],
        risks: [],
        next_action: 'Replace stub runtime with real session/runtime binding.',
        execution_trace: {
          model_used: dispatch.execution.model,
          fallback_used: false,
          tool_calls: [],
        },
      };
    },
  };
}
