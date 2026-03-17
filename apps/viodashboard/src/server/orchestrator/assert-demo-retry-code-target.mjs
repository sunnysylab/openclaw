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
    root_task_id: 'demo-retry-code-001',
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
    mode: 'sequence',
    sequenceRules: [
      {
        kind: 'work',
        task_id: 'demo-retry-code-001::code',
        dispatch_kind: 'initial',
        status: 'failed',
        maxUses: 1,
      },
      {
        kind: 'review',
        parent_task_id: 'demo-retry-code-001::code',
        verdict: 'approve',
        maxUses: 1,
      }
    ],
  });

  const { finalResponse, snapshot } = await runRootTask(rootTask, { runtimeAdapter });
  const assertionCase = getCaseAssertions('failed-retry-success-code-target');

  const rootFinalStatus = snapshot.rootTasks?.[0]?.current_status;
  const reviewTaskCount = (snapshot.taskExecutions || []).filter(t => t.kind === 'review').length;
  const reviewVerdicts = (snapshot.reviews || []).map(r => r.verdict);
  const codeRetryCount = ((snapshot.taskExecutions || []).find(t => t.task_id === 'demo-retry-code-001::code') || {}).retry_count || 0;
  const researchRetryCount = ((snapshot.taskExecutions || []).find(t => t.task_id === 'demo-retry-code-001::research') || {}).retry_count || 0;
  const maxReviseCount = Math.max(0, ...(snapshot.taskExecutions || []).filter(t => t.kind !== 'review').map(t => t.revise_count || 0));
  const rootTimeline = collectRootTimeline(snapshot);

  expectEqual(rootFinalStatus, assertionCase.expected.root_final_status, 'root_final_status');
  expectEqual(reviewTaskCount, assertionCase.expected.review_task_count, 'review_task_count');
  expectEqual(reviewVerdicts, assertionCase.expected.review_verdicts, 'review_verdicts');
  expectEqual(codeRetryCount, assertionCase.expected.code_retry_count, 'code_retry_count');
  expectEqual(researchRetryCount, assertionCase.expected.research_retry_count, 'research_retry_count');
  expectEqual(maxReviseCount, assertionCase.expected.max_revise_count, 'max_revise_count');

  const requiredRootSegments = [
    'created -> planned',
    'planned -> running',
    'running -> partial',
    'partial -> running',
    'running -> approved',
  ];

  for (const segment of requiredRootSegments) {
    if (!rootTimeline.includes(segment)) {
      throw new Error(`root timeline missing required segment: ${segment}; got ${JSON.stringify(rootTimeline)}`);
    }
  }

  console.log('ASSERTION_PASS demo-run-retry-code-target');
  console.log(JSON.stringify({
    root_final_status: rootFinalStatus,
    review_task_count: reviewTaskCount,
    review_verdicts: reviewVerdicts,
    code_retry_count: codeRetryCount,
    research_retry_count: researchRetryCount,
    max_revise_count: maxReviseCount,
    root_timeline: rootTimeline,
    final_response_status: finalResponse.status,
  }, null, 2));
}

main().catch(error => {
  console.error('ASSERTION_FAIL demo-run-retry-code-target');
  console.error(error?.stack || String(error));
  process.exit(1);
});
