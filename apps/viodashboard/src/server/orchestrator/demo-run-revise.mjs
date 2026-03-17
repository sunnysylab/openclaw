import { runRootTask } from './orchestrator.mjs';
import { createRuntimeAdapter } from './runtimeAdapter.mjs';
import { formatDemoSummary } from './demoSummaryFormatter.mjs';

async function main() {
  const rootTask = {
    root_task_id: 'demo-revise-001',
    goal: 'Update Token Saver L2 so tool output inside the last 5 turns is not compressed.',
    user_request: '再改一下token saver里L2节流的压缩规则，最后5 turns的tool output不压缩',
    constraints: [
      'Do not change non-tool message ordering',
      'Update rule doc together with implementation',
    ],
    task_type: 'implementation',
    artifacts: [
      'coms/token-saver.mjs',
      'coms/token-saver-phase2-rule.md',
    ],
  };

  const runtimeAdapter = createRuntimeAdapter({
    mode: 'stub-success',
    reviewVerdicts: ['revise', 'approve'],
  });

  const result = await runRootTask(rootTask, { runtimeAdapter });

  console.log(formatDemoSummary(result));
  console.log(JSON.stringify(result.finalResponse, null, 2));
  console.log(JSON.stringify(result.snapshot, null, 2));
}

main().catch(error => {
  console.error('[demo-run-revise] failed:', error);
  process.exit(1);
});
