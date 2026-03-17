import { resolveExecutionConfig } from './registryLoader.mjs';

function buildSingleAgentPlan(rootTask, registry) {
  const agentId = rootTask.task_type === 'research' ? 'researcher' : 'coder';
  const exec = resolveExecutionConfig(registry, agentId);

  return {
    root_task_id: rootTask.root_task_id,
    planner_agent_id: 'orchestrator',
    goal: rootTask.goal,
    strategy_summary: `Single-agent execution via ${agentId}; review derived from task metadata if required.`,
    global_constraints: rootTask.constraints || [],
    tasks: [
      {
        task_id: `${rootTask.root_task_id}::task-1`,
        agent_id: agentId,
        parent_task_id: null,
        goal: rootTask.goal,
        depends_on: [],
        parallel_group: null,
        inputs_summary: rootTask.user_request || rootTask.goal,
        artifacts_hint: rootTask.artifacts || [],
        proposed_execution: {
          model: exec.model,
          thinking: exec.thinking,
          tool_mode: exec.tool_mode,
          budget_class: 'normal',
        },
        review_required: agentId !== 'reviewer',
        reviewer_agent_id: agentId === 'reviewer' ? null : 'reviewer',
        success_criteria: [
          'Task goal is addressed',
          'Output matches structured result format',
        ],
      },
    ],
    execution_order: [
      [`${rootTask.root_task_id}::task-1`],
    ],
    final_aggregation: {
      aggregator_agent_id: 'orchestrator',
      requires_final_review: false,
    },
    audit: {
      multi_model_requested: true,
      multi_model_effective: true,
      planning_notes: 'simple-single-agent',
      review_mode: 'derived',
    },
  };
}

function buildResearchCodeReviewPlan(rootTask, registry) {
  const researcherExec = resolveExecutionConfig(registry, 'researcher');
  const coderExec = resolveExecutionConfig(registry, 'coder');

  return {
    root_task_id: rootTask.root_task_id,
    planner_agent_id: 'orchestrator',
    goal: rootTask.goal,
    strategy_summary: 'Research current state, implement changes, then derive review from work-task metadata.',
    global_constraints: rootTask.constraints || [],
    tasks: [
      {
        task_id: `${rootTask.root_task_id}::research`,
        agent_id: 'researcher',
        parent_task_id: null,
        goal: `Inspect current context for: ${rootTask.goal}`,
        depends_on: [],
        parallel_group: null,
        inputs_summary: rootTask.user_request || rootTask.goal,
        artifacts_hint: rootTask.artifacts || [],
        proposed_execution: {
          model: researcherExec.model,
          thinking: researcherExec.thinking,
          tool_mode: researcherExec.tool_mode,
          budget_class: 'normal',
        },
        review_required: false,
        reviewer_agent_id: null,
        success_criteria: ['Current state summarized'],
      },
      {
        task_id: `${rootTask.root_task_id}::code`,
        agent_id: 'coder',
        parent_task_id: null,
        goal: rootTask.goal,
        depends_on: [`${rootTask.root_task_id}::research`],
        parallel_group: null,
        inputs_summary: 'Use research output and apply requested change.',
        artifacts_hint: rootTask.artifacts || [],
        proposed_execution: {
          model: coderExec.model,
          thinking: coderExec.thinking,
          tool_mode: coderExec.tool_mode,
          budget_class: 'normal',
        },
        review_required: true,
        reviewer_agent_id: 'reviewer',
        success_criteria: [
          'Requested change implemented',
          'Relevant artifacts updated',
        ],
      },
    ],
    execution_order: [
      [`${rootTask.root_task_id}::research`],
      [`${rootTask.root_task_id}::code`],
    ],
    final_aggregation: {
      aggregator_agent_id: 'orchestrator',
      requires_final_review: false,
    },
    audit: {
      multi_model_requested: true,
      multi_model_effective: true,
      planning_notes: 'research-code-review',
      review_mode: 'derived',
    },
  };
}

export function selectPlanMode(rootTask) {
  if (rootTask?.plan_mode) {return rootTask.plan_mode;}
  if (rootTask?.task_type === 'implementation') {return 'research-code-review';}
  return 'simple-single-agent';
}

export function buildPlan(rootTask, registry) {
  if (!rootTask?.root_task_id) {throw new Error('root_task_id is required');}
  if (!rootTask?.goal) {throw new Error('goal is required');}

  const mode = selectPlanMode(rootTask);

  if (mode === 'research-code-review') {
    return buildResearchCodeReviewPlan(rootTask, registry);
  }

  if (mode === 'simple-single-agent') {
    return buildSingleAgentPlan(rootTask, registry);
  }

  throw new Error(`Unsupported plan mode: ${mode}`);
}
