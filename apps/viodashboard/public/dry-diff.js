const runsListEl = document.getElementById('runsList');
const refreshRunsBtnEl = document.getElementById('refreshRunsBtn');
const runTitleEl = document.getElementById('runTitle');
const runMetaEl = document.getElementById('runMeta');
const beforeJsonEl = document.getElementById('beforeJson');
const afterJsonEl = document.getElementById('afterJson');
const diffJsonEl = document.getElementById('diffJson');

let runs = [];
let activeRunId = null;

function fmt(obj) {
  return JSON.stringify(obj ?? null, null, 2);
}

async function loadRuns() {
  const res = await fetch('/api/coms/token-saver/runs');
  const data = await res.json();
  if (!res.ok) {throw new Error(data.error || 'failed to load runs');}
  runs = Array.isArray(data.items) ? data.items : [];
  renderRuns();
  if (!activeRunId && runs[0]?.runId) {loadRun(runs[0].runId);}
}

function renderRuns() {
  runsListEl.innerHTML = '';
  for (const item of runs) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `drydiff-item ${item.runId === activeRunId ? 'active' : ''}`.trim();
    btn.innerHTML = `<div><strong>${item.runId}</strong></div><div class="event-sub"><span class="semantic-value">${item.status || 'n/a'} · complete=${item.artifactsComplete === true ? 'yes' : 'no'}</span></div>`;
    btn.addEventListener('click', () => loadRun(item.runId));
    runsListEl.appendChild(btn);
  }
}

async function loadRun(runId) {
  activeRunId = runId;
  renderRuns();
  const res = await fetch(`/api/coms/token-saver/run?runId=${encodeURIComponent(runId)}`);
  const data = await res.json();
  if (!res.ok) {throw new Error(data.error || 'failed to load run');}
  const meta = runs.find(item => item.runId === runId) || {};
  runTitleEl.textContent = runId;
  runMetaEl.innerHTML = `<span class="semantic-value">${meta.status || 'n/a'} · artifacts=${meta.artifactsComplete === true ? 'complete' : 'incomplete'} · indexed=${meta.indexedAt || 'n/a'}</span>`;
  beforeJsonEl.textContent = fmt(data.before);
  afterJsonEl.textContent = fmt(data.after);
  diffJsonEl.textContent = fmt(data.diffSummary);
}

refreshRunsBtnEl?.addEventListener('click', () => loadRuns().catch(error => {
  beforeJsonEl.textContent = error.message || String(error);
}));

loadRuns().catch(error => {
  beforeJsonEl.textContent = error.message || String(error);
});
