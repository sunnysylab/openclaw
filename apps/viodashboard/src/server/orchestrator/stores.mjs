function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function createStores() {
  const rootTasks = new Map();
  const plans = new Map();
  const taskExecutions = new Map();
  const reviews = new Map();
  const events = [];

  return {
    createRootTask(rootTask) {
      if (!rootTask?.root_task_id) {throw new Error('root_task_id is required');}
      if (rootTasks.has(rootTask.root_task_id)) {
        throw new Error(`Root task already exists: ${rootTask.root_task_id}`);
      }
      rootTasks.set(rootTask.root_task_id, clone(rootTask));
      return clone(rootTask);
    },

    getRootTask(rootTaskId) {
      return clone(rootTasks.get(rootTaskId) || null);
    },

    updateRootTask(rootTaskId, patch = {}) {
      const current = rootTasks.get(rootTaskId);
      if (!current) {throw new Error(`Root task not found: ${rootTaskId}`);}
      const next = { ...current, ...clone(patch) };
      rootTasks.set(rootTaskId, next);
      return clone(next);
    },

    savePlan(rootTaskId, plan) {
      if (!rootTaskId) {throw new Error('rootTaskId is required');}
      plans.set(rootTaskId, clone(plan));
      return clone(plan);
    },

    getPlan(rootTaskId) {
      return clone(plans.get(rootTaskId) || null);
    },

    saveTaskExecution(taskRecord) {
      if (!taskRecord?.task_id) {throw new Error('task_id is required');}
      taskExecutions.set(taskRecord.task_id, clone(taskRecord));
      return clone(taskRecord);
    },

    getTaskExecution(taskId) {
      return clone(taskExecutions.get(taskId) || null);
    },

    updateTaskExecution(taskId, patch = {}) {
      const current = taskExecutions.get(taskId);
      if (!current) {throw new Error(`Task execution not found: ${taskId}`);}
      const next = { ...current, ...clone(patch) };
      taskExecutions.set(taskId, next);
      return clone(next);
    },

    listTasksByRoot(rootTaskId) {
      return Array.from(taskExecutions.values())
        .filter(task => task.root_task_id === rootTaskId)
        .map(clone);
    },

    saveReview(taskId, review) {
      if (!taskId) {throw new Error('taskId is required');}
      reviews.set(taskId, clone(review));
      return clone(review);
    },

    getReview(taskId) {
      return clone(reviews.get(taskId) || null);
    },

    listReviewsByRoot(rootTaskId) {
      const tasks = new Set(
        Array.from(taskExecutions.values())
          .filter(task => task.root_task_id === rootTaskId)
          .map(task => task.task_id)
      );

      return Array.from(reviews.entries())
        .filter(([taskId]) => tasks.has(taskId))
        .map(([, review]) => clone(review));
    },

    appendEvent(event) {
      const row = {
        at: new Date().toISOString(),
        ...clone(event),
      };
      events.push(row);
      return clone(row);
    },

    listEvents(filter = {}) {
      return events
        .filter(event => {
          if (filter.root_task_id && event.root_task_id !== filter.root_task_id) {return false;}
          if (filter.task_id && event.task_id !== filter.task_id) {return false;}
          if (filter.type && event.type !== filter.type) {return false;}
          return true;
        })
        .map(clone);
    },

    snapshot() {
      return {
        rootTasks: Array.from(rootTasks.values()).map(clone),
        plans: Array.from(plans.values()).map(clone),
        taskExecutions: Array.from(taskExecutions.values()).map(clone),
        reviews: Array.from(reviews.values()).map(clone),
        events: events.map(clone),
      };
    },
  };
}
