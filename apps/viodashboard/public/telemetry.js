// Observer/telemetry screen for VioDashboard on a secondary display.
const heroMoodEl = document.getElementById('heroMood');
const heroRoutingEl = document.getElementById('heroRouting');
const heroLightEl = document.getElementById('heroLight');
const heroQuietEl = document.getElementById('heroQuiet');
const heroModelEl = document.getElementById('heroModel');
const heroLastTokensEl = document.getElementById('heroLastTokens');
const heroTotalTokensEl = document.getElementById('heroTotalTokens');
const heroWindowEl = document.getElementById('heroWindow');
const environmentSummaryEl = document.getElementById('environmentSummary');
const environmentDetailEl = document.getElementById('environmentDetail');
const gestureSummaryEl = document.getElementById('gestureSummary');
const gestureDetailEl = document.getElementById('gestureDetail');
const cameraPreviewEl = document.getElementById('cameraPreview');
const cameraMetaEl = document.getElementById('cameraMeta');
const debugStreamEl = document.getElementById('debugStream');
const observerNotesMainEl = document.getElementById('observerNotesMain');
const observerNotesDetailEl = document.getElementById('observerNotesDetail');
const taskInputEl = document.getElementById('taskInput');
const taskListEl = document.getElementById('taskList');
const addTaskBtnEl = document.getElementById('addTaskBtn');
const taskBatchToolbarEl = document.getElementById('taskBatchToolbar');
const taskBatchCountEl = document.getElementById('taskBatchCount');
const taskBatchDeployBtnEl = document.getElementById('taskBatchDeployBtn');
const taskBatchClearBtnEl = document.getElementById('taskBatchClearBtn');
const packageListEl = document.getElementById('packageList');
const roadmapMetaEl = document.getElementById('roadmapMeta');
const roadmapBatchToolbarEl = document.getElementById('roadmapBatchToolbar');
const roadmapBatchCountEl = document.getElementById('roadmapBatchCount');
const roadmapBatchClaimBtnEl = document.getElementById('roadmapBatchClaimBtn');
const roadmapBatchClearBtnEl = document.getElementById('roadmapBatchClearBtn');
const roadmapHistoryListEl = document.getElementById('roadmapHistoryList');
const taskHistoryListEl = document.getElementById('taskHistoryList');
const deletedTaskListEl = document.getElementById('deletedTaskList');
const deletedTasksFoldEl = document.getElementById('deletedTasksFold');
const clearRoadmapHistoryBtnEl = document.getElementById('clearRoadmapHistoryBtn');
const clearTaskHistoryBtnEl = document.getElementById('clearTaskHistoryBtn');
const clearDeletedTasksBtnEl = document.getElementById('clearDeletedTasksBtn');
const telemetryVisionFoldEl = document.getElementById('telemetryVisionFold');

const TASKS_KEY = 'vio-telemetry-tasks-v2';
const TASKS_KEY_LEGACY = 'vio-telemetry-tasks-v1';
const TASK_HISTORY_KEY = 'vio-telemetry-task-history-v2';
const TASK_HISTORY_KEY_LEGACY = 'vio-telemetry-task-history-v1';
const DELETED_TASKS_KEY = 'vio-telemetry-deleted-tasks-v1';
const TELEMETRY_PREFS_KEY = 'vio-telemetry-prefs-v1';
const PACKAGE_IMPORTS_KEY = 'vio-telemetry-package-imports-v1';
const LAST_REPLY_ROADMAP_KEY = 'vio-wrapper-last-reply-roadmap-v1';
const STRUCTURED_ROADMAP_KEY = 'vio-wrapper-roadmap-v2';
const ACTIVE_TASK_STATUSES = new Set(['todo', 'doing', 'blocked', 'done_candidate']);
const TERMINAL_TASK_STATUSES = new Set(['done', 'deleted']);

let ws;
let tokenStats = { last: null, total: 0, modelName: null, modelUsagePercent: null };
let lastRouting = 'n/a';
let debugLines = [];
let lastVioBodyState = null;
let lastCameraState = null;
let pendingDeleteTaskId = null;
let pendingClearRoadmapHistory = false;
let pendingClearTaskHistory = false;
let pendingClearDeletedTasks = false;
let selectedTaskIds = new Set();
let selectedRoadmapItemIds = new Set();
const taskDeployInFlight = new Set();
let batchDeployInFlight = false;

function escapeHtml(value = '') {
  return String(value).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function addLog(text) {
  debugLines.unshift(`[${new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'})}] ${text}`);
  debugLines = debugLines.slice(0, 28);
  debugStreamEl.innerHTML = debugLines.map(line => `<div class="log-line">${escapeHtml(line)}</div>`).join('');
}

function loadTelemetryPrefs() {
  try {
    return JSON.parse(localStorage.getItem(TELEMETRY_PREFS_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveTelemetryPrefs(prefs) {
  localStorage.setItem(TELEMETRY_PREFS_KEY, JSON.stringify(prefs));
}

function bindFoldPersistence(detailsEl, prefKey, defaultOpen = false) {
  if (!detailsEl) {return;}
  const prefs = loadTelemetryPrefs();
  detailsEl.open = typeof prefs[prefKey] === 'boolean' ? prefs[prefKey] : defaultOpen;
  detailsEl.addEventListener('toggle', () => {
    const nextPrefs = loadTelemetryPrefs();
    nextPrefs[prefKey] = !!detailsEl.open;
    saveTelemetryPrefs(nextPrefs);
  });
}

function nowIso() {
  return new Date().toISOString();
}

function formatTraceLabel(action = '') {
  return String(action || '').replace(/_/g, ' ');
}

function buildTraceEvent(action, detail = '', at = nowIso()) {
  return {
    at,
    action: String(action || 'updated'),
    detail: String(detail || '').trim(),
  };
}

function ensureTrace(task = {}) {
  const trace = Array.isArray(task.trace) ? task.trace.filter(Boolean).map(entry => ({
    at: entry.at || nowIso(),
    action: String(entry.action || 'updated'),
    detail: String(entry.detail || '').trim(),
  })) : [];
  if (!trace.length) {trace.push(buildTraceEvent('created', `status ${task.status || (task.done ? 'done' : 'todo')}`, task.createdAt || nowIso()));}
  return trace;
}

function normalizeTask(task = {}, index = 0) {
  const title = String(task.title || task.text || '').trim();
  if (!title) {return null;}
  const createdAt = task.createdAt || nowIso();
  const status = String(task.status || (task.done ? 'done' : 'todo'));
  const normalized = {
    id: String(task.id || `task-${Date.now()}-${index}`),
    title,
    text: title,
    description: String(task.description || '').trim(),
    done: task.done === true || status === 'done',
    deployedAt: task.deployedAt || null,
    completedAt: task.completedAt || null,
    blockedAt: task.blockedAt || null,
    reopenedAt: task.reopenedAt || null,
    candidateAt: task.candidateAt || null,
    createdAt,
    updatedAt: task.updatedAt || createdAt,
    status,
    priority: String(task.priority || 'normal'),
    source: String(task.source || 'manual'),
    packageId: task.packageId || null,
    roadmapItemId: task.roadmapItemId || null,
    batchId: task.batchId || null,
    trace: ensureTrace({ ...task, createdAt, status }),
  };
  normalized.done = normalized.status === 'done';
  return normalized;
}

function loadJsonArray(primaryKey, legacyKey = null) {
  for (const key of [primaryKey, legacyKey].filter(Boolean)) {
    try {
      const raw = JSON.parse(localStorage.getItem(key) || '[]');
      if (Array.isArray(raw)) {return raw;}
    } catch {}
  }
  return [];
}

function loadTasks() {
  return loadJsonArray(TASKS_KEY, TASKS_KEY_LEGACY).map((task, index) => normalizeTask(task, index)).filter(Boolean);
}

function saveTasks(tasks) {
  localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
}

function loadTaskHistory() {
  return loadJsonArray(TASK_HISTORY_KEY, TASK_HISTORY_KEY_LEGACY).map((task, index) => normalizeTask(task, index)).filter(Boolean);
}

function saveTaskHistory(items) {
  localStorage.setItem(TASK_HISTORY_KEY, JSON.stringify(items));
}

function loadDeletedTasks() {
  return loadJsonArray(DELETED_TASKS_KEY).map((task, index) => normalizeTask(task, index)).filter(Boolean);
}

function saveDeletedTasks(items) {
  localStorage.setItem(DELETED_TASKS_KEY, JSON.stringify(items));
}


function updateHistoryClearButton(buttonEl, confirming) {
  if (!buttonEl) {return;}
  buttonEl.textContent = confirming ? 'confirm clear' : 'clear';
  buttonEl.classList.toggle('confirming', confirming);
}

function updateHistoryClearButtons() {
  updateHistoryClearButton(clearRoadmapHistoryBtnEl, pendingClearRoadmapHistory);
  updateHistoryClearButton(clearTaskHistoryBtnEl, pendingClearTaskHistory);
  updateHistoryClearButton(clearDeletedTasksBtnEl, pendingClearDeletedTasks);
}

function roadmapClaimKey(roadmapId, roadmapItemId) {
  if (!roadmapId || !roadmapItemId) {return null;}
  return `${String(roadmapId)}::${String(roadmapItemId)}`;
}


function roadmapSelectionKey(roadmapId, itemId) {
  if (!roadmapId || !itemId) {return null;}
  return `${String(roadmapId)}::${String(itemId)}`;
}

function pruneSelectedRoadmapItemIds(roadmap) {
  const availableKeys = new Set((roadmap?.items || []).map(item => roadmapSelectionKey(roadmap.id, item.id)).filter(Boolean));
  selectedRoadmapItemIds = new Set([...selectedRoadmapItemIds].filter(key => availableKeys.has(key)));
}

function clearSelectedRoadmapItems() {
  selectedRoadmapItemIds = new Set();
}

function toggleRoadmapSelection(roadmapId, itemId, checked) {
  const key = roadmapSelectionKey(roadmapId, itemId);
  if (!key) {return;}
  if (checked) {selectedRoadmapItemIds.add(key);}
  else {selectedRoadmapItemIds.delete(key);}
}

function getSelectedRoadmapItems(roadmap) {
  if (!roadmap || !Array.isArray(roadmap.items)) {return [];}
  pruneSelectedRoadmapItemIds(roadmap);
  return roadmap.items.filter(item => selectedRoadmapItemIds.has(roadmapSelectionKey(roadmap.id, item.id)));
}

function renderRoadmapBatchToolbar(roadmap) {
  if (!roadmapBatchToolbarEl) {return;}
  const count = getSelectedRoadmapItems(roadmap).length;
  roadmapBatchToolbarEl.hidden = count < 2;
  if (roadmapBatchCountEl) {roadmapBatchCountEl.textContent = String(count);}
  if (roadmapBatchClaimBtnEl) {roadmapBatchClaimBtnEl.disabled = count < 2;}
}

function collectClaimedRoadmapItemIds() {
  const ids = new Set();
  for (const item of loadTasks()) {
    const key = roadmapClaimKey(item?.packageId, item?.roadmapItemId);
    if (key) {ids.add(key);}
  }
  for (const item of loadTaskHistory()) {
    const key = roadmapClaimKey(item?.packageId, item?.roadmapItemId);
    if (key) {ids.add(key);}
  }
  for (const item of loadDeletedTasks()) {
    const key = roadmapClaimKey(item?.packageId, item?.roadmapItemId);
    if (key) {ids.add(key);}
  }
  return ids;
}

function pushTaskHistory(entry) {
  const history = loadTaskHistory();
  const archivedAt = entry.archivedAt || nowIso();
  const task = normalizeTask({ ...entry, archivedAt, updatedAt: archivedAt }, 0);
  history.unshift(task);
  saveTaskHistory(history.slice(0, 80));
}

function pushDeletedTask(entry) {
  const items = loadDeletedTasks();
  const deletedAt = entry.deletedAt || nowIso();
  const task = normalizeTask({ ...entry, deletedAt, archivedAt: deletedAt, updatedAt: deletedAt, status: 'deleted' }, 0);
  items.unshift(task);
  saveDeletedTasks(items.slice(0, 80));
}

function appendTaskTrace(task, action, detail = '', at = nowIso()) {
  task.trace = ensureTrace(task);
  task.trace.unshift(buildTraceEvent(action, detail, at));
  if (task.trace.length > 30) {task.trace = task.trace.slice(0, 30);}
  task.updatedAt = at;
  return task;
}

function removeTaskByIndex(index) {
  const tasks = loadTasks();
  const numericIndex = Number(index);
  if (!Number.isInteger(numericIndex) || numericIndex < 0 || numericIndex >= tasks.length) {return { tasks, task: null };}
  const [task] = tasks.splice(numericIndex, 1);
  return { tasks, task };
}

function pruneSelectedTaskIds(tasks = loadTasks()) {
  const availableIds = new Set(tasks.map(task => task?.id).filter(Boolean));
  selectedTaskIds = new Set([...selectedTaskIds].filter(id => availableIds.has(id)));
}

function clearSelectedTasks() {
  selectedTaskIds = new Set();
}

function toggleTaskSelection(taskId, checked) {
  if (!taskId) {return;}
  if (checked) {selectedTaskIds.add(taskId);}
  else {selectedTaskIds.delete(taskId);}
}

function getSelectedActiveTasks() {
  const tasks = loadTasks().filter(task => ACTIVE_TASK_STATUSES.has(task.status));
  pruneSelectedTaskIds(tasks);
  return tasks.filter(task => selectedTaskIds.has(task.id));
}

function renderTaskBatchToolbar() {
  if (!taskBatchToolbarEl) {return;}
  const selectedTasks = getSelectedActiveTasks();
  const count = selectedTasks.length;
  taskBatchToolbarEl.hidden = count < 2;
  if (taskBatchCountEl) {taskBatchCountEl.textContent = String(count);}
  if (taskBatchDeployBtnEl) {taskBatchDeployBtnEl.disabled = batchDeployInFlight || count < 2 || selectedTasks.some(task => task.status === 'doing' || taskDeployInFlight.has(task.id));}
}

function archiveTask(task, nextStatus = 'done', action = 'completed', detail = '') {
  const at = nowIso();
  const archivedTask = normalizeTask({ ...task, status: nextStatus, done: nextStatus === 'done', completedAt: nextStatus === 'done' ? (task.completedAt || at) : task.completedAt, archivedAt: at, updatedAt: at }, 0);
  appendTaskTrace(archivedTask, action, detail || `archived as ${nextStatus}`, at);
  pushTaskHistory(archivedTask);
}

function shouldAutoArchiveOnCompletion(task) {
  return task?.source === 'smoke-test';
}

function transitionTask(index, targetStatus) {
  const tasks = loadTasks();
  pendingDeleteTaskId = null;
  const item = tasks[Number(index)];
  if (!item) {return null;}
  const at = nowIso();
  const fromStatus = item.status || 'todo';

  if (targetStatus === 'doing') {
    item.status = 'doing';
    item.done = false;
    item.deployedAt = item.deployedAt || at;
    appendTaskTrace(item, 'deployed', `status ${fromStatus} → doing`, at);
  } else if (targetStatus === 'done_candidate') {
    item.status = 'done_candidate';
    item.done = false;
    item.candidateAt = at;
    appendTaskTrace(item, 'done_candidate', `status ${fromStatus} → done_candidate`, at);
  } else if (targetStatus === 'blocked') {
    item.status = 'blocked';
    item.done = false;
    item.blockedAt = at;
    appendTaskTrace(item, 'blocked', `status ${fromStatus} → blocked`, at);
  } else if (targetStatus === 'todo') {
    item.status = 'todo';
    item.done = false;
    item.reopenedAt = at;
    appendTaskTrace(item, 'reopened', `status ${fromStatus} → todo`, at);
  } else if (targetStatus === 'done') {
    item.status = 'done';
    item.done = true;
    item.completedAt = at;
    appendTaskTrace(item, 'completed', `status ${fromStatus} → done`, at);
    const [completed] = tasks.splice(Number(index), 1);
    if (completed) {archiveTask(completed, 'done', 'archived', shouldAutoArchiveOnCompletion(completed) ? 'auto-archived completion artifact' : 'completed and moved to Task History');}
    saveTasks(tasks);
    renderTasks();
    renderHistoryPanels();
    return item;
  }

  tasks[Number(index)] = normalizeTask(item, Number(index));
  saveTasks(tasks);
  renderTasks();
  renderHistoryPanels();
  return tasks[Number(index)];
}

function cleanupSmokeTestArtifacts() {
  const tasks = loadTasks();
  const active = [];
  let changed = false;
  for (const task of tasks) {
    if (task?.source === 'smoke-test' && task?.status === 'done') {
      const archived = normalizeTask({ ...task, completedAt: task.completedAt || nowIso(), updatedAt: nowIso() }, 0);
      appendTaskTrace(archived, 'archived', 'auto-archived smoke-test artifact after deploy dry-run support', nowIso());
      pushTaskHistory(archived);
      changed = true;
      continue;
    }
    active.push(task);
  }
  if (changed) {saveTasks(active);}
  return changed;
}

function loadPackageImports() {
  try {
    return JSON.parse(localStorage.getItem(PACKAGE_IMPORTS_KEY) || '{}');
  } catch {
    return {};
  }
}

function savePackageImports(imports) {
  localStorage.setItem(PACKAGE_IMPORTS_KEY, JSON.stringify(imports));
}

function loadLastReplyRoadmap() {
  try {
    return JSON.parse(localStorage.getItem(LAST_REPLY_ROADMAP_KEY) || 'null');
  } catch {
    return null;
  }
}

function normalizeRoadmapItem(item, index = 0) {
  if (!item) {return null;}
  const title = String(item.title || item.text || '').trim();
  if (!title) {return null;}
  return {
    id: String(item.id || `roadmap-item-${index + 1}`),
    title,
    description: String(item.description || item.detail || '').trim(),
    status: String(item.status || 'proposed'),
    priority: String(item.priority || 'normal'),
    source: String(item.source || 'assistant'),
  };
}

function buildLegacyStructuredRoadmap(legacy) {
  if (!legacy || !Array.isArray(legacy.steps) || !legacy.steps.length) {return null;}
  return {
    id: legacy.id || `roadmap-${Date.now()}`,
    title: legacy.title || 'Latest proposed next steps',
    summary: legacy.summary || 'Fallback roadmap reconstructed from the latest assistant reply.',
    sourceType: 'legacy-last-reply',
    items: legacy.steps.map((step, index) => normalizeRoadmapItem({ id: `legacy-${index + 1}`, title: String(step || '').trim() }, index)).filter(Boolean),
    updatedAt: legacy.updatedAt || nowIso(),
  };
}

async function loadStructuredRoadmap() {
  try {
    const res = await fetch('/api/roadmap');
    const data = await res.json();
    if (res.ok && data?.roadmap && Array.isArray(data.roadmap.items)) {
      return {
        ...data.roadmap,
        items: data.roadmap.items.map((item, index) => normalizeRoadmapItem(item, index)).filter(Boolean),
      };
    }
  } catch {}
  try {
    const raw = JSON.parse(localStorage.getItem(STRUCTURED_ROADMAP_KEY) || 'null');
    if (raw && Array.isArray(raw.items)) {
      return {
        ...raw,
        items: raw.items.map((item, index) => normalizeRoadmapItem(item, index)).filter(Boolean),
      };
    }
  } catch {}
  return buildLegacyStructuredRoadmap(loadLastReplyRoadmap());
}

function renderTaskControls(task, index) {
  const deployDisabled = task.status === 'doing' || taskDeployInFlight.has(task.id);
  const doneCandidateDisabled = task.status === 'done_candidate' || task.status === 'done';
  const blockedDisabled = task.status === 'blocked' || task.status === 'done';
  const reopenDisabled = task.status === 'todo';
  const completeDisabled = task.status === 'done';
  const selected = selectedTaskIds.has(task.id);
  return `
    <div class="task-card-actions">
      <label class="task-select-label" title="select for batch deploy">
        <input class="task-select-toggle" type="checkbox" data-task-select-id="${task.id}" ${selected ? 'checked' : ''} ${deployDisabled ? 'disabled' : ''} />
      </label>
      <button class="pill action-pill task-deploy-btn" type="button" data-action="deploy" data-index="${index}" ${deployDisabled ? 'disabled' : ''}>deploy</button>
      <button class="pill action-pill task-candidate-btn" type="button" data-action="done_candidate" data-index="${index}" ${doneCandidateDisabled ? 'disabled' : ''}>candidate</button>
      <button class="pill action-pill task-complete-btn" type="button" data-action="complete" data-index="${index}" ${completeDisabled ? 'disabled' : ''}>complete</button>
      <button class="pill action-pill task-block-btn" type="button" data-action="blocked" data-index="${index}" ${blockedDisabled ? 'disabled' : ''}>block</button>
      <button class="pill action-pill task-reopen-btn" type="button" data-action="reopen" data-index="${index}" ${reopenDisabled ? 'disabled' : ''}>reopen</button>
    </div>
  `;
}

function renderTasks() {
  if (!taskListEl) {return;}
  const tasks = loadTasks().filter(task => ACTIVE_TASK_STATUSES.has(task.status));
  pruneSelectedTaskIds(tasks);
  renderTaskBatchToolbar();
  if (!tasks.length) {
    taskListEl.innerHTML = '<div class="task-empty">今天的 todo 还没写。可以先把我们要做的事丢进来。</div>';
    return;
  }
  taskListEl.innerHTML = tasks.map((task, index) => {
    const title = escapeHtml(task.title || task.text || '');
    const description = escapeHtml(task.description || '');
    const source = escapeHtml(task.source || 'manual');
    const priority = escapeHtml(task.priority || 'normal');
    const status = escapeHtml(task.status || (task.done ? 'done' : 'todo'));
    const deployedLabel = task.deployedAt ? `deployed ${new Date(task.deployedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'not deployed';
    const updatedLabel = task.updatedAt ? `updated ${new Date(task.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'just now';
    const confirmDelete = pendingDeleteTaskId === task.id;
    const latestTrace = task.trace?.[0];
    const tracePreview = latestTrace ? `${formatTraceLabel(latestTrace.action)} · ${compactTime(latestTrace.at)}` : 'no trace yet';
    return `
    <article class="task-card status-${status} ${selectedTaskIds.has(task.id) ? 'selected' : ''}">
      <div class="task-card-top">
        <div class="task-title-row">
          <span class="task-title-text">${title}</span>
        </div>
        ${renderTaskControls(task, index)}
      </div>
      <div class="task-card-meta">
        <span class="roadmap-chip priority-${priority}">${priority}</span>
        <span class="roadmap-chip status-${status}">${status}</span>
        <span class="roadmap-chip">${source}</span>
        ${task.batchId ? `<span class="roadmap-chip">batch ${escapeHtml(task.batchId)}</span>` : ''}
        <span class="roadmap-chip">${escapeHtml(deployedLabel)}</span>
        <span class="roadmap-chip">${escapeHtml(updatedLabel)}</span>
      </div>
      ${description ? `<div class="task-card-desc">${description}</div>` : ''}
      <div class="task-trace-preview">trace · ${escapeHtml(tracePreview)}</div>
      <div class="task-card-footer">
        <button class="task-delete-secondary ${confirmDelete ? 'confirming' : ''}" type="button" data-delete-task-id="${task.id}" data-delete-index="${index}">${confirmDelete ? 'confirm delete' : 'delete'}</button>
      </div>
    </article>`;
  }).join('');
}

function addTask(text, meta = {}) {
  const value = String(text || '').trim();
  if (!value) {return;}
  const tasks = loadTasks();
  pendingDeleteTaskId = null;
  const createdAt = nowIso();
  const task = normalizeTask({
    title: value,
    text: value,
    description: meta.description || '',
    done: false,
    createdAt,
    updatedAt: createdAt,
    status: meta.status || 'todo',
    packageId: meta.packageId || meta.roadmapId || null,
    roadmapItemId: meta.roadmapItemId || null,
    priority: meta.priority || 'normal',
    source: meta.source || 'manual',
    trace: [buildTraceEvent(meta.traceAction || 'created', meta.traceDetail || `status ${meta.status || 'todo'}`, createdAt)],
  }, 0);
  tasks.unshift(task);
  saveTasks(tasks);
  renderTasks();
  if (taskInputEl && meta.source !== 'package' && meta.source !== 'roadmap') {taskInputEl.value = '';}
}

async function importRoadmapItems(roadmapId, itemIds = [], options = {}) {
  const roadmap = await loadStructuredRoadmap();
  if (!roadmap || roadmap.id !== roadmapId) {return { count: 0, claimGroupId: null };}
  const claimedIds = collectClaimedRoadmapItemIds();
  const wantedIds = new Set(itemIds.map(id => String(id)).filter(Boolean));
  const items = (roadmap.items || []).filter(item => wantedIds.has(String(item.id)) && !claimedIds.has(roadmapClaimKey(roadmapId, item.id)));
  if (!items.length) {return { count: 0, claimGroupId: null };}
  const grouped = items.length > 1;
  const claimGroupId = grouped ? String(options.claimGroupId || `claim-${Date.now()}`) : null;
  for (const item of items) {
    const importedStatus = item.status === 'done'
      ? 'done_candidate'
      : (item.status === 'proposed' || !item.status)
        ? 'todo'
        : item.status;
    addTask(item.title, {
      roadmapId,
      roadmapItemId: item.id,
      source: 'roadmap',
      priority: item.priority || 'normal',
      status: importedStatus,
      description: item.description || '',
      traceAction: grouped ? 'batch_claimed' : 'imported',
      traceDetail: grouped ? `claimed into task board as ${claimGroupId} from roadmap ${roadmapId}` : `imported from roadmap ${roadmapId}`,
    });
  }
  for (const item of items) {selectedRoadmapItemIds.delete(roadmapSelectionKey(roadmapId, item.id));}
  renderTasks();
  renderWorkingPackages();
  renderHistoryPanels();
  return { count: items.length, claimGroupId };
}

async function importRoadmapItem(roadmapId, itemId) {
  const result = await importRoadmapItems(roadmapId, [itemId]);
  if (result.count) {addLog(`imported roadmap item · ${itemId}`);}
}

async function importAllRoadmapItems(roadmapId) {
  const roadmap = await loadStructuredRoadmap();
  if (!roadmap || roadmap.id !== roadmapId) {return;}
  const result = await importRoadmapItems(roadmapId, (roadmap.items || []).map(item => item.id));
  if (result.count) {addLog(`claimed all roadmap items · ${result.count} tasks`);}
}

async function importSelectedRoadmapItems() {
  const roadmap = await loadStructuredRoadmap();
  if (!roadmap) {return;}
  const selectedItems = getSelectedRoadmapItems(roadmap);
  if (selectedItems.length < 2) {return;}
  const result = await importRoadmapItems(roadmap.id, selectedItems.map(item => item.id));
  if (result.count) {addLog(`claimed selected roadmap items · ${result.count} tasks${result.claimGroupId ? ` · ${result.claimGroupId}` : ''}`);}
}

async function deployTask(index) {
  const tasks = loadTasks();
  const task = tasks[Number(index)];
  if (!task || taskDeployInFlight.has(task.id) || task.status === 'doing') {return;}
  taskDeployInFlight.add(task.id);
  renderTasks();
  try {
    const res = await fetch('/api/tasks/deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task }),
    });
    const data = await res.json();
    if (!res.ok) {throw new Error(data.error || 'task deploy failed');}
    selectedTaskIds.delete(task.id);
    const updatedTask = transitionTask(index, 'doing');
    if (!updatedTask) {return;}
    addLog(`task deployed · ${task.title}`);
  } finally {
    taskDeployInFlight.delete(task.id);
    renderTasks();
  }
}

async function deploySelectedTasks() {
  if (batchDeployInFlight) {return;}
  const selectedTasks = getSelectedActiveTasks().filter(task => !taskDeployInFlight.has(task.id) && task.status !== 'doing');
  if (selectedTasks.length < 2) {return;}
  batchDeployInFlight = true;
  selectedTasks.forEach(task => taskDeployInFlight.add(task.id));
  renderTasks();
  try {
    const res = await fetch('/api/tasks/deploy-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tasks: selectedTasks }),
    });
    const data = await res.json();
    if (!res.ok) {throw new Error(data.error || 'batch deploy failed');}
    const batchId = data?.batchId || `batch-${Date.now()}`;
    const deployedAt = data?.deployedAt || nowIso();
    const tasks = loadTasks();
    let deployedCount = 0;
    for (const item of tasks) {
      if (!selectedTaskIds.has(item.id)) {continue;}
      const fromStatus = item.status || 'todo';
      item.status = 'doing';
      item.done = false;
      item.batchId = batchId;
      item.deployedAt = deployedAt;
      appendTaskTrace(item, 'batch_deployed', `batch ${batchId} · status ${fromStatus} → doing`, deployedAt);
      deployedCount += 1;
    }
    saveTasks(tasks.map((task, index) => normalizeTask(task, index)).filter(Boolean));
    clearSelectedTasks();
    renderTasks();
    renderHistoryPanels();
    addLog(`batch deployed · ${deployedCount} tasks · ${batchId}`);
  } finally {
    batchDeployInFlight = false;
    selectedTasks.forEach(task => taskDeployInFlight.delete(task.id));
    renderTasks();
  }
}

function formatRoadmapTime(value) {
  if (!value) {return 'unknown';}
  try { return new Date(value).toLocaleString([], { hour: '2-digit', minute: '2-digit', month: '2-digit', day: '2-digit' }); } catch { return String(value); }
}

function formatRoadmapSourceLabel(sourceType = '') {
  const value = String(sourceType || '').trim();
  if (!value) {return 'unknown source';}
  if (value === 'assistant-structured') {return 'structured JSON';}
  if (value === 'backend-extracted') {return 'fallback bullets';}
  if (value === 'legacy-last-reply') {return 'legacy cached reply';}
  return value;
}

async function renderWorkingPackages() {
  try {
    if (!packageListEl) {return;}
    const roadmap = await loadStructuredRoadmap();
    if (!roadmap || !Array.isArray(roadmap.items)) {
      if (roadmapMetaEl) {roadmapMetaEl.textContent = '0 open items · no roadmap loaded';}
      clearSelectedRoadmapItems();
      renderRoadmapBatchToolbar(null);
      packageListEl.innerHTML = '<div class="task-empty">No structured roadmap yet. Once roadmap JSON exists, proposed tasks will appear here.</div>';
      return;
    }

    const claimedIds = collectClaimedRoadmapItemIds();
    const visibleItems = roadmap.items.filter(item => !claimedIds.has(roadmapClaimKey(roadmap.id, item.id)));
    const visibleRoadmap = { ...roadmap, items: visibleItems };
    pruneSelectedRoadmapItemIds(visibleRoadmap);

    if (roadmapMetaEl) {roadmapMetaEl.textContent = `${visibleItems.length} open items · ${formatRoadmapSourceLabel(roadmap.sourceType)} · updated ${formatRoadmapTime(roadmap.updatedAt)}`;}
    renderRoadmapBatchToolbar(visibleRoadmap);
    if (!visibleItems.length) {
      packageListEl.innerHTML = '<div class="task-empty">All current roadmap items have already been claimed by Task Board or moved into history.</div>';
      return;
    }

    packageListEl.innerHTML = `
      <article class="package-card ready structured-roadmap-card">
        <div class="package-head">
          <div>
            <div class="package-title">${escapeHtml(roadmap.title || 'Road Map')}</div>
            <div class="package-summary">${escapeHtml(roadmap.summary || 'Structured roadmap data source.')}</div>
          </div>
          <button class="pill action-pill package-import-btn" type="button" data-roadmap-import-all="${roadmap.id}">claim all</button>
        </div>
        <div class="package-task-count">${visibleItems.length} open candidate tasks · source: ${escapeHtml(formatRoadmapSourceLabel(roadmap.sourceType))}</div>
        <div class="roadmap-item-list">
          ${visibleItems.map(item => `<div class="roadmap-item ${selectedRoadmapItemIds.has(roadmapSelectionKey(roadmap.id, item.id)) ? 'selected' : ''}">
            <label class="task-select-label roadmap-select-label" title="select for grouped claim">
              <input class="task-select-toggle roadmap-select-toggle" type="checkbox" data-roadmap-select-id="${item.id}" data-roadmap-id="${roadmap.id}" ${selectedRoadmapItemIds.has(roadmapSelectionKey(roadmap.id, item.id)) ? 'checked' : ''} />
            </label>
            <div class="roadmap-item-main">
              <div class="roadmap-item-title">${escapeHtml(item.title)}</div>
              <div class="roadmap-item-meta"><span class="roadmap-chip priority-${escapeHtml(item.priority || 'normal')}">${escapeHtml(item.priority || 'normal')}</span><span class="roadmap-chip status-${escapeHtml(item.status || 'proposed')}">${escapeHtml(item.status || 'proposed')}</span></div>
              ${item.description ? `<div class="roadmap-item-desc">${escapeHtml(item.description)}</div>` : ''}
            </div>
            <button class="pill action-pill roadmap-item-btn" type="button" data-roadmap-id="${roadmap.id}" data-roadmap-item-id="${item.id}">claim</button>
          </div>`).join('')}
        </div>
      </article>
    `;
  } catch (error) {
    if (roadmapMetaEl) {roadmapMetaEl.textContent = `roadmap render error: ${error?.message || error}`;}
    if (packageListEl) {packageListEl.innerHTML = '<div class="task-empty">Road Map render failed. Check error text above.</div>';}
    console.error('renderWorkingPackages failed', error);
  }
}

async function loadRoadmapHistory() {
  try {
    const res = await fetch('/api/roadmap/history');
    const data = await res.json();
    if (res.ok && Array.isArray(data?.items)) {return data.items;}
  } catch {}
  return [];
}

function compactTime(value) {
  if (!value) {return 'unknown';}
  try { return new Date(value).toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return String(value); }
}

function renderTaskHistoryBody(item) {
  const description = item.description ? `<div class="history-body-copy">${escapeHtml(item.description)}</div>` : '';
  const trace = Array.isArray(item.trace) && item.trace.length
    ? `<div class="history-trace-list">${item.trace.map(entry => `<div class="history-trace-item"><span class="history-trace-time">${escapeHtml(compactTime(entry.at))}</span><span class="history-trace-action">${escapeHtml(formatTraceLabel(entry.action))}</span>${entry.detail ? `<span class="history-trace-detail">${escapeHtml(entry.detail)}</span>` : ''}</div>`).join('')}</div>`
    : '<div class="history-trace-empty">No lifecycle trace recorded.</div>';
  return `${description}${trace}`;
}

async function clearRoadmapHistory() {
  const res = await fetch('/api/roadmap/history/clear', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm: true }),
  });
  const data = await res.json();
  if (!res.ok) {throw new Error(data.error || 'roadmap history clear failed');}
}

async function renderHistoryPanels() {
  if (roadmapHistoryListEl) {
    const items = await loadRoadmapHistory();
    roadmapHistoryListEl.innerHTML = items.length ? items.map(item => `
      <details class="history-item">
        <summary>
          <span class="history-title">${escapeHtml(item.title || 'Road Map')}</span>
          <span class="history-meta">${compactTime(item.updatedAt)} · ${(item.items || []).length} items</span>
        </summary>
        <div class="history-body">${escapeHtml(item.summary || '')}</div>
      </details>
    `).join('') : '<div class="task-empty">No roadmap history yet.</div>';
  }

  if (taskHistoryListEl) {
    const tasks = loadTaskHistory();
    taskHistoryListEl.innerHTML = tasks.length ? tasks.map(item => `
      <details class="history-item">
        <summary>
          <span class="history-title">${escapeHtml(item.title || item.text || 'Task')}</span>
          <span class="history-meta">${escapeHtml(item.status || 'done')} · ${compactTime(item.archivedAt || item.completedAt || item.updatedAt || item.createdAt)}</span>
        </summary>
        <div class="history-body">${renderTaskHistoryBody(item)}</div>
      </details>
    `).join('') : '<div class="task-empty">No task history yet.</div>';
  }

  if (deletedTaskListEl) {
    const items = loadDeletedTasks();
    deletedTaskListEl.innerHTML = items.length ? items.map(item => `
      <details class="history-item deleted-history-item">
        <summary>
          <span class="history-title">${escapeHtml(item.title || item.text || 'Task')}</span>
          <span class="history-meta">deleted · ${compactTime(item.deletedAt || item.archivedAt || item.createdAt)}</span>
        </summary>
        <div class="history-body">${renderTaskHistoryBody(item)}</div>
      </details>
    `).join('') : '<div class="task-empty">No deleted tasks.</div>';
  }
}

function renderHero() {
  heroRoutingEl.textContent = lastRouting;
  heroModelEl.textContent = tokenStats.modelName || 'n/a';
  heroLastTokensEl.textContent = tokenStats.last?.total != null ? String(tokenStats.last.total) : 'n/a';
  heroTotalTokensEl.textContent = String(tokenStats.total || 0);
  heroWindowEl.textContent = tokenStats.modelUsagePercent != null ? `${tokenStats.modelUsagePercent}%` : 'n/a';
}

function setEnvironment(data = {}) {
  const env = data.environment || {};
  const temp = env.temperatureC != null ? `${env.temperatureC}°C` : 'n/a';
  const band = env.lightBand || 'unknown';
  const raw = env.lightLevelRaw != null ? env.lightLevelRaw : 'n/a';
  const quiet = !!data.quiet_hours_active;
  const output = data.effective_light_output || data.light_output || 'n/a';
  const reason = data.light_reason || 'unknown';
  const motionActive = reason === 'motion-keepalive';
  const chatActive = reason === 'chat-keepalive';
  const cause = !quiet
    ? 'day mode'
    : output === 'off'
      ? 'quiet hours suppressing light output'
      : reason.startsWith('ambient-')
        ? `ambient override (${reason.replace('ambient-', '')})`
        : reason === 'motion-keepalive'
          ? 'motion keepalive is holding lights on'
          : reason === 'chat-keepalive'
            ? 'chat keepalive is holding lights on'
            : 'night override is holding lights on';
  environmentSummaryEl.textContent = `${temp} · ${band}`;
  environmentDetailEl.textContent = `raw ${raw} · dark=${env.dark ?? 'n/a'} · daylight=${env.daylight ?? 'n/a'}`;
  heroLightEl.textContent = `light ${output}`;
  heroQuietEl.textContent = quiet ? 'quiet hours' : 'day mode';
  if (observerNotesMainEl) {observerNotesMainEl.textContent = quiet ? (output === 'off' ? 'lights suppressed' : 'lights held awake') : 'lights in day mode';}
  if (observerNotesDetailEl) {observerNotesDetailEl.textContent = `${cause} · output ${output} · motion ${motionActive ? 'active' : 'inactive'} · chat ${chatActive ? 'active' : 'inactive'} · reason ${reason}`;}
}

function setGesture(camera = {}) {
  const vision = camera.vision || {};
  const runtime = camera.gestureRuntime || {};
  const provider = runtime.provider?.label || camera.provider?.label || 'unknown provider';
  const gesture = vision.gesture || 'none';
  const stable = vision.stable === false ? 'unstable' : vision.stable === true ? 'stable' : 'n/a';
  if (gestureSummaryEl) {gestureSummaryEl.textContent = `${gesture} · ${stable}`;}
  if (gestureDetailEl) {gestureDetailEl.textContent = `${provider} · watcher ${runtime.watcherEnabled ? 'on' : 'off'} · samples ${vision.detectedCount ?? 0}/${vision.sampleCount ?? 0}`;}
  if (camera.latestCapture?.url && cameraPreviewEl) {
    const nextUrl = camera.latestCapture.url;
    if (!cameraPreviewEl.dataset.currentSrc || cameraPreviewEl.dataset.currentSrc !== nextUrl) {
      cameraPreviewEl.src = nextUrl;
      cameraPreviewEl.dataset.currentSrc = nextUrl;
    }
    cameraPreviewEl.style.display = 'block';
    if (cameraMetaEl) {cameraMetaEl.textContent = `${camera.latestCapture.name} · ${Math.round((camera.latestCapture.size || 0)/1024)} KB`;}
  }
}

async function refreshEnvironment() {
  try {
    const res = await fetch('/api/vio-body-state');
    const data = await res.json();
    if (!res.ok) {throw new Error(data.error || 'state unavailable');}
    setEnvironment(data);
    if (lastVioBodyState) {
      if (lastVioBodyState.light_output !== data.light_output || lastVioBodyState.light_reason !== data.light_reason) {addLog(`light ${data.light_output || 'n/a'} · reason ${data.light_reason || 'n/a'}`);}
      if (lastVioBodyState.current_status !== data.current_status) {addLog(`body status ${lastVioBodyState.current_status || 'n/a'} -> ${data.current_status || 'n/a'}`);}
    }
    lastVioBodyState = data;
  } catch (error) {
    environmentSummaryEl.textContent = 'unavailable';
    environmentDetailEl.textContent = String(error.message || error);
  }
}

async function refreshCamera() {
  try {
    const res = await fetch('/api/camera');
    const data = await res.json();
    if (!res.ok) {throw new Error(data.error || 'camera unavailable');}
    setGesture(data);
    if (lastCameraState) {
      const prevGesture = `${lastCameraState.vision?.gesture || 'none'}:${lastCameraState.vision?.stable}`;
      const nextGesture = `${data.vision?.gesture || 'none'}:${data.vision?.stable}`;
      if (prevGesture !== nextGesture) {addLog(`gesture ${data.vision?.gesture || 'none'} · stable=${data.vision?.stable ?? 'n/a'}`);}
      if (lastCameraState.latestCapture?.name !== data.latestCapture?.name && data.latestCapture?.name) {addLog(`camera capture ${data.latestCapture.name}`);}
    }
    lastCameraState = data;
  } catch (error) {
    if (gestureSummaryEl) {gestureSummaryEl.textContent = 'camera unavailable';}
    if (gestureDetailEl) {gestureDetailEl.textContent = String(error.message || error);}
    if (cameraPreviewEl) {cameraPreviewEl.style.display = cameraPreviewEl.dataset.currentSrc ? 'block' : 'none';}
  }
}

function connect() {
  ws = new WebSocket(`ws://${location.host}/ws`);
  ws.addEventListener('message', event => {
    const packet = JSON.parse(event.data);
    if (packet.type === 'mood') {
      heroMoodEl.textContent = packet.mode || 'idle';
      lastRouting = packet.detail?.detail || packet.mode || 'n/a';
      renderHero();
      updateHistoryClearButtons();
      addLog(`phase ${packet.detail?.phase || packet.mode || 'n/a'} · mood ${packet.mode} · ${packet.detail?.detail || 'n/a'}`);
    }
    if (packet.type === 'tokens') {
      tokenStats = {
        last: packet.last || null,
        total: packet.total || 0,
        modelName: packet.modelName || null,
        modelUsagePercent: packet.modelUsagePercent ?? null,
      };
      renderHero();
      updateHistoryClearButtons();
    }
    if (packet.type === 'chat' && packet.event?.state === 'final') {addLog(`final · ${String(packet.event?.text || '').slice(0, 120)}`);}
    if (packet.type === 'chat' && packet.event?.state === 'error') {addLog(`error · ${packet.event?.payload?.errorMessage || 'chat error'}`);}
    if (packet.type === 'roadmap') {
      renderWorkingPackages();
      renderHistoryPanels();
      const decisionSuffix = packet.decision ? ` · ${packet.decision}` : '';
      const sourceLabel = formatRoadmapSourceLabel(packet.roadmap?.sourceType);
      addLog(`roadmap updated · ${(packet.roadmap?.items || []).length} items · ${sourceLabel}${decisionSuffix}`);
    }
  });
  ws.addEventListener('close', () => setTimeout(connect, 1200));
}

addTaskBtnEl?.addEventListener('click', () => addTask(taskInputEl?.value || ''));
taskInputEl?.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    addTask(taskInputEl.value);
  }
});

clearRoadmapHistoryBtnEl?.addEventListener('click', async () => {
  if (!pendingClearRoadmapHistory) {
    pendingClearRoadmapHistory = true;
    pendingClearTaskHistory = false;
    pendingClearDeletedTasks = false;
    updateHistoryClearButtons();
    return;
  }
  try {
    await clearRoadmapHistory();
    addLog('roadmap history cleared');
  } catch (error) {
    addLog(`roadmap history clear failed · ${error.message || error}`);
  } finally {
    pendingClearRoadmapHistory = false;
    updateHistoryClearButtons();
    renderHistoryPanels();
  }
});

clearTaskHistoryBtnEl?.addEventListener('click', () => {
  if (!pendingClearTaskHistory) {
    pendingClearTaskHistory = true;
    pendingClearRoadmapHistory = false;
    pendingClearDeletedTasks = false;
    updateHistoryClearButtons();
    return;
  }
  saveTaskHistory([]);
  pendingClearTaskHistory = false;
  updateHistoryClearButtons();
  renderHistoryPanels();
  addLog('task history cleared');
});

clearDeletedTasksBtnEl?.addEventListener('click', () => {
  if (!pendingClearDeletedTasks) {
    pendingClearDeletedTasks = true;
    pendingClearRoadmapHistory = false;
    pendingClearTaskHistory = false;
    updateHistoryClearButtons();
    return;
  }
  saveDeletedTasks([]);
  pendingClearDeletedTasks = false;
  updateHistoryClearButtons();
  renderHistoryPanels();
  addLog('deleted tasks cleared');
});

taskBatchClearBtnEl?.addEventListener('click', () => {
  clearSelectedTasks();
  renderTasks();
});

taskBatchDeployBtnEl?.addEventListener('click', async () => {
  try {
    await deploySelectedTasks();
  } catch (error) {
    addLog(`batch deploy failed · ${error.message || error}`);
  }
});

roadmapBatchClearBtnEl?.addEventListener('click', () => {
  clearSelectedRoadmapItems();
  renderWorkingPackages();
});

roadmapBatchClaimBtnEl?.addEventListener('click', async () => {
  try {
    await importSelectedRoadmapItems();
  } catch (error) {
    addLog(`roadmap batch claim failed · ${error.message || error}`);
  }
});

taskListEl?.addEventListener('click', async event => {
  const selectId = event.target?.getAttribute?.('data-task-select-id');
  if (selectId) {
    toggleTaskSelection(selectId, !!event.target.checked);
    renderTasks();
    return;
  }

  const action = event.target?.getAttribute?.('data-action');
  const index = event.target?.getAttribute?.('data-index');
  if (action && index != null) {
    try {
      if (action === 'deploy') {
        await deployTask(index);
      } else if (action === 'done_candidate') {
        const task = transitionTask(index, 'done_candidate');
        if (task) {addLog(`task candidate · ${task.title}`);}
      } else if (action === 'complete') {
        const task = transitionTask(index, 'done');
        if (task) {addLog(`task completed · ${task.title}`);}
      } else if (action === 'blocked') {
        const task = transitionTask(index, 'blocked');
        if (task) {addLog(`task blocked · ${task.title}`);}
      } else if (action === 'reopen') {
        const task = transitionTask(index, 'todo');
        if (task) {addLog(`task reopened · ${task.title}`);}
      }
    } catch (error) {
      addLog(`task action failed · ${error.message || error}`);
    }
    return;
  }

  const deleteTaskId = event.target?.getAttribute?.('data-delete-task-id');
  const deleteIndex = event.target?.getAttribute?.('data-delete-index');
  if (deleteTaskId != null && deleteIndex != null) {
    if (pendingDeleteTaskId !== deleteTaskId) {
      pendingDeleteTaskId = deleteTaskId;
      renderTasks();
      return;
    }
    const { tasks, task: removed } = removeTaskByIndex(deleteIndex);
    if (removed) {
      appendTaskTrace(removed, 'deleted', 'removed from active task board', nowIso());
      pushDeletedTask({ ...removed, description: removed.description || `Deleted task from ${removed.source || 'task-board'}` });
    }
    pendingDeleteTaskId = null;
    saveTasks(tasks);
    renderTasks();
    renderHistoryPanels();
    addLog('task deleted');
    return;
  }
});

packageListEl?.addEventListener('click', event => {
  const selectId = event.target?.getAttribute?.('data-roadmap-select-id');
  const selectRoadmapId = event.target?.getAttribute?.('data-roadmap-id');
  if (selectId && selectRoadmapId) {
    toggleRoadmapSelection(selectRoadmapId, selectId, !!event.target.checked);
    renderWorkingPackages();
    return;
  }
  const roadmapId = event.target?.getAttribute?.('data-roadmap-import-all');
  if (roadmapId) {
    importAllRoadmapItems(roadmapId);
    return;
  }
  const itemId = event.target?.getAttribute?.('data-roadmap-item-id');
  const itemRoadmapId = event.target?.getAttribute?.('data-roadmap-id');
  if (!itemId || !itemRoadmapId) {return;}
  importRoadmapItem(itemRoadmapId, itemId);
});

window.addEventListener('storage', event => {
  if ([LAST_REPLY_ROADMAP_KEY, STRUCTURED_ROADMAP_KEY, TASKS_KEY, TASKS_KEY_LEGACY, TASK_HISTORY_KEY, TASK_HISTORY_KEY_LEGACY].includes(event.key)) {
    pruneSelectedTaskIds();
    pendingClearRoadmapHistory = false;
    pendingClearTaskHistory = false;
    pendingClearDeletedTasks = false;
    updateHistoryClearButtons();
    renderWorkingPackages();
    renderTasks();
    renderHistoryPanels();
  }
});

renderHero();
updateHistoryClearButtons();
bindFoldPersistence(telemetryVisionFoldEl, 'visionFoldOpen', false);
bindFoldPersistence(deletedTasksFoldEl, 'deletedTasksFoldOpen', false);
if (cleanupSmokeTestArtifacts()) {addLog('archived residual smoke-test tasks');}
renderTasks();
renderWorkingPackages();
renderHistoryPanels();
refreshEnvironment();
refreshCamera();
connect();
setInterval(refreshEnvironment, 5000);
setInterval(refreshCamera, 2500);
setInterval(renderWorkingPackages, 4000);
setInterval(renderHistoryPanels, 6000);
