function formatTaskLine(task) {
  return `- ${task.task_id} | kind=${task.kind || 'work'} | agent=${task.agent_id} | status=${task.status} | model=${task.model_used || 'n/a'} | retry=${task.retry_count || 0} | revise=${task.revise_count || 0}`;
}

function collectRootTransitions(events = []) {
  return events
    .filter(event => event.type === 'root_transition')
    .map(event => `${event.from} -> ${event.to}`);
}

function collectTaskTransitions(events = [], taskId) {
  return events
    .filter(event => event.type === 'transition' && event.task_id === taskId)
    .map(event => `${event.from} -> ${event.to}`);
}

export function formatDemoSummary(result) {
  const snapshot = result?.snapshot || {};
  const rootTask = Array.isArray(snapshot.rootTasks) ? snapshot.rootTasks[0] : null;
  const tasks = Array.isArray(snapshot.taskExecutions) ? snapshot.taskExecutions : [];
  const events = Array.isArray(snapshot.events) ? snapshot.events : [];
  const finalResponse = result?.finalResponse || null;

  const workTasks = tasks.filter(task => task.kind !== 'review');
  const reviewTasks = tasks.filter(task => task.kind === 'review');

  const lines = [];

  lines.push('=== DEMO SUMMARY ===');

  if (rootTask) {
    lines.push(`Root Task: ${rootTask.root_task_id}`);
    lines.push(`Goal: ${rootTask.goal}`);
    lines.push(`Final Root Status: ${rootTask.current_status}`);
    lines.push(`Root Timeline: ${collectRootTransitions(events).join(' | ') || 'n/a'}`);
  }

  lines.push('');
  lines.push('Work Tasks:');
  if (workTasks.length === 0) {
    lines.push('- none');
  } else {
    for (const task of workTasks) {
      lines.push(formatTaskLine(task));
      lines.push(`  timeline: ${collectTaskTransitions(events, task.task_id).join(' | ') || 'n/a'}`);
    }
  }

  lines.push('');
  lines.push('Review Tasks:');
  if (reviewTasks.length === 0) {
    lines.push('- none');
  } else {
    for (const task of reviewTasks) {
      lines.push(formatTaskLine(task));
      lines.push(`  timeline: ${collectTaskTransitions(events, task.task_id).join(' | ') || 'n/a'}`);
    }
  }

  if (finalResponse) {
    lines.push('');
    lines.push('Final Response:');
    lines.push(`- status: ${finalResponse.status}`);
    lines.push(`- review verdict: ${finalResponse.review_summary?.verdict || 'n/a'}`);
    lines.push(`- risks: ${(finalResponse.risks || []).length}`);
    lines.push(`- recommended next action: ${finalResponse.recommended_next_action || 'n/a'}`);
  }

  return `${lines.join('\n')}\n`;
}
