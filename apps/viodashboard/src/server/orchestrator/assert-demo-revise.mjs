import { runRootTask } from './orchestrator.mjs';
import { createRuntimeAdapter } from './runtimeAdapter.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ASSERTIONS_PATH = path.join(process.cwd(), 'coms', 'multi-agent', 'demo-cases-assertions.json');

function getCaseAssertions(caseId) {
  const raw = fs.readFileSync(ASSERTIONS_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  const found = parsed.cases.find(item => item.case_id === caseId);
  if (!found) {throw new Error(`Assertion case not found: ${caseId}`);}
  return found;
}

function expectEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function collectRootTimeline(snapshot) {
  return (snapshot.events || [])
    .filter(event => event.type === 'root_transition')
    .map(event => `${event.from} -> ${event.to}`);
}

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

  const { finalResponse, snapshot } = await runRootTask(rootTask, { runtimeAdapter });
  const assertionCase = getCaseAssertions('success-revise-approve');

  const rootFinalStatus = snapshot.rootTasks?.[0]?.current_status;
  const reviewTaskCount = (snapshot.taskExecutions || []).filter(t => t.kind === 'review').length;
  const reviewVerdicts = (snapshot.taskExecutions || [])
    .filter(t => t.kind === 'review')
    .toSorted((a, b) => String(a.task_id).localeCompare(String(b.task_id)))
    .map(t => t.result_payload?.verdict)
    .filter(Boolean);
  const maxRetryCount = Math.max(0, ...(snapshot.taskExecutions || []).filter(t => t.kind !== 'review').map(t => t.retry_count || 0));
  const maxReviseCount = Math.max(0, ...(snapshot.taskExecutions || []).filter(t => t.kind !== 'review').map(t => t.revise_count || 0));
  const rootTimeline = collectRootTimeline(snapshot);

  expectEqual(rootFinalStatus, assertionCase.expected.root_final_status, 'root_final_status');
  expectEqual(reviewTaskCount, assertionCase.expected.review_task_count, 'review_task_count');
  expectEqual(reviewVerdicts, assertionCase.expected.review_verdicts, 'review_verdicts');
  expectEqual(maxRetryCount, assertionCase.expected.max_retry_count, 'max_retry_count');
  expectEqual(maxReviseCount, assertionCase.expected.max_revise_count, 'max_revise_count');

  for (const segment of assertionCase.expected.root_timeline_segments || []) {
    if (!rootTimeline.includes(segment)) {
      throw new Error(`root timeline missing required segment: ${segment}; got ${JSON.stringify(rootTimeline)}`);
    }
  }

  console.log('ASSERTION_PASS demo-run-revise');
  console.log(JSON.stringify({
    root_final_status: rootFinalStatus,
    review_task_count: reviewTaskCount,
    review_verdicts: reviewVerdicts,
    max_retry_count: maxRetryCount,
    max_revise_count: maxReviseCount,
    root_timeline: rootTimeline,
    final_response_status: finalResponse.status,
  }, null, 2));
}

main().catch(error => {
  console.error('ASSERTION_FAIL demo-run-revise');
  console.error(error?.stack || String(error));
  process.exit(1);
});
