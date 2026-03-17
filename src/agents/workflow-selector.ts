export type WorkflowCandidate = {
  workflowId: string;
  name: string;
  confidence: number;
  reasons: string[];
};

export type WorkflowSelectionResult = {
  taskType: string;
  repoArea: string;
  riskLevel: "low" | "medium" | "high" | "mixed";
  touchedPaths: string[];
  candidates: WorkflowCandidate[];
  selectedWorkflowId: string | null;
  selectedWorkflowName: string | null;
  reviewStatus: "pending";
  nextAction: string;
};

type WorkflowDefinition = {
  workflowId: string;
  name: string;
  taskCategory: string;
  repoAreas: string[];
  touchedAreaKeywords: string[];
  riskLevels: Array<"low" | "medium" | "high" | "mixed">;
  taskKeywords: string[];
  antiKeywords?: string[];
};

const WORKFLOWS: WorkflowDefinition[] = [
  {
    workflowId: "bug_fix_minimal_change",
    name: "Bug Fix with Minimal Sufficient Change",
    taskCategory: "bug_fix",
    repoAreas: ["src", "ui", "extensions", "packages", "test"],
    touchedAreaKeywords: [
      "bug",
      "fix",
      "error",
      "issue",
      "wrong",
      "broken",
      "regression",
      "failing",
    ],
    riskLevels: ["low", "medium"],
    taskKeywords: ["fix", "bug", "repair", "correct", "wrong", "error", "failure"],
    antiKeywords: ["redesign", "architecture", "refactor whole", "rewrite subsystem"],
  },
  {
    workflowId: "project_architecture_map_build",
    name: "Build a Project Architecture Map",
    taskCategory: "architecture_mapping",
    repoAreas: ["src", "ui", "extensions", "packages", "docs"],
    touchedAreaKeywords: [
      "architecture",
      "map",
      "module",
      "project map",
      "layer",
      "boundary",
      "c4",
      "readme",
    ],
    riskLevels: ["low", "medium", "mixed"],
    taskKeywords: ["map", "architecture", "structure", "module", "c4", "readme", "understand"],
  },
];

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function toLower(text: string | undefined | null): string {
  return normalizeWhitespace(String(text || "")).toLowerCase();
}

function uniq(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function extractTouchedPaths(text: string): string[] {
  const input = String(text || "");
  const matches =
    input.match(
      /(?:`([^`]+)`)|(?:\b(?:src|ui|extensions|packages|test|docs)\/[A-Za-z0-9_./-]+\b)|(?:\b[A-Za-z0-9_.-]+\.(?:ts|tsx|js|mjs|cjs|json|md)\b)/g,
    ) || [];
  const cleaned = matches
    .map((m) => m.replace(/^`|`$/g, ""))
    .map((m) => m.replace(/[),.;:]$/g, ""))
    .filter((m) => /\//.test(m) || /\.(ts|tsx|js|mjs|cjs|json|md)$/i.test(m));
  return uniq(cleaned).slice(0, 8);
}

export function inferTaskType(userTask: string): string {
  const text = toLower(userTask);
  if (/(architecture|project map|module map|c4|layer|boundary|structure)/.test(text)) {
    return "architecture_mapping";
  }
  if (/(bug|fix|regression|error|broken|wrong|failure)/.test(text)) {
    return "bug_fix";
  }
  if (/(refactor|restructure|cleanup)/.test(text)) {
    return "refactor";
  }
  if (/(feature|implement|add support|add)/.test(text)) {
    return "feature_addition";
  }
  return "general_development";
}

export function inferRiskLevel(userTask: string): "low" | "medium" | "high" | "mixed" {
  const text = toLower(userTask);
  if (
    /(core|security|migration|protocol|critical|production|dangerous|high-risk|high risk)/.test(
      text,
    )
  ) {
    return "high";
  }
  if (
    /(refactor|multi|multiple|cross-cutting|cross cutting|architecture|subsystem|fork core)/.test(
      text,
    )
  ) {
    return "mixed";
  }
  if (/(readme|docs|map|selector|planning|localized|small|minimal)/.test(text)) {
    return "low";
  }
  return "medium";
}

export function inferRepoArea(paths: string[], userTask: string, workspaceDir?: string): string {
  const first = paths[0] || "";
  const pathArea = first.split("/")[0];
  if (pathArea) {
    return pathArea;
  }
  const text = toLower(userTask);
  for (const area of ["src", "ui", "extensions", "packages", "docs", "test"]) {
    if (text.includes(area)) {
      return area;
    }
  }
  if (workspaceDir) {
    const parts = workspaceDir.split("/").filter(Boolean);
    return parts[parts.length - 1] || "repo-root";
  }
  return "repo-root";
}

function scoreWorkflow(
  def: WorkflowDefinition,
  params: {
    task: string;
    taskType: string;
    repoArea: string;
    riskLevel: "low" | "medium" | "high" | "mixed";
    touchedPaths: string[];
  },
): WorkflowCandidate {
  const reasons: string[] = [];
  let score = 0;
  const taskText = toLower(params.task);
  if (params.taskType === def.taskCategory) {
    score += 4;
    reasons.push(`task type matches ${def.taskCategory}`);
  }
  if (def.repoAreas.includes(params.repoArea)) {
    score += 1.5;
    reasons.push(`repo area ${params.repoArea} is compatible`);
  }
  if (def.riskLevels.includes(params.riskLevel)) {
    score += 1.5;
    reasons.push(`risk level ${params.riskLevel} is supported`);
  }
  const keywordHits = def.taskKeywords.filter((k) => taskText.includes(k));
  if (keywordHits.length) {
    score += Math.min(2, keywordHits.length * 0.5);
    reasons.push(`task keywords matched: ${keywordHits.slice(0, 3).join(", ")}`);
  }
  const touchedJoined = params.touchedPaths.join(" ").toLowerCase();
  const touchedHits = def.touchedAreaKeywords.filter(
    (k) => taskText.includes(k) || touchedJoined.includes(k),
  );
  if (touchedHits.length) {
    score += Math.min(1.5, touchedHits.length * 0.5);
    reasons.push(`touched-area signals matched: ${touchedHits.slice(0, 3).join(", ")}`);
  }
  const antiHits = (def.antiKeywords || []).filter((k) => taskText.includes(k));
  if (antiHits.length) {
    score -= 2;
    reasons.push(`anti-signals present: ${antiHits.slice(0, 2).join(", ")}`);
  }
  const confidence = Math.max(0, Math.min(0.99, score / 9));
  return {
    workflowId: def.workflowId,
    name: def.name,
    confidence: Math.round(confidence * 100) / 100,
    reasons: reasons.length ? reasons : ["weak partial match only"],
  };
}

export function selectWorkflowForPlanning(params: {
  userTask: string;
  workspaceDir?: string;
  repoArea?: string;
  riskLevel?: "low" | "medium" | "high" | "mixed";
  touchedPaths?: string[];
}): WorkflowSelectionResult {
  const userTask = String(params.userTask || "");
  const touchedPaths = uniq(
    params.touchedPaths?.length ? params.touchedPaths : extractTouchedPaths(userTask),
  );
  const taskType = inferTaskType(userTask);
  const riskLevel = params.riskLevel || inferRiskLevel(userTask);
  const repoArea = params.repoArea || inferRepoArea(touchedPaths, userTask, params.workspaceDir);
  const candidates = WORKFLOWS.map((def) =>
    scoreWorkflow(def, { task: userTask, taskType, repoArea, riskLevel, touchedPaths }),
  )
    .toSorted((a, b) => b.confidence - a.confidence)
    .slice(0, 3);
  const top = candidates[0];
  const selectedWorkflowId = top && top.confidence >= 0.35 ? top.workflowId : null;
  const selectedWorkflowName = top && top.confidence >= 0.35 ? top.name : null;
  return {
    taskType,
    repoArea,
    riskLevel,
    touchedPaths,
    candidates,
    selectedWorkflowId,
    selectedWorkflowName,
    reviewStatus: "pending",
    nextAction: selectedWorkflowId
      ? "Review the workflow selection result before workflow instantiation or implementation."
      : "No strong workflow match found; review manually before implementation.",
  };
}

export function shouldRequireWorkflowPlanningGate(params: {
  userTask: string;
  workspaceDir?: string;
}): boolean {
  const text = toLower(params.userTask);
  const looksLikeRepoTask =
    /(repo|repository|source|code|implement|fix|refactor|workflow|selector|architecture|readme|module|file|path|src\/|ui\/|packages\/|extensions\/|docs\/)/.test(
      text,
    );
  const looksLikeForkWorkspace = /(openclaw_fork|repo|workspace)/.test(
    toLower(params.workspaceDir || ""),
  );
  return looksLikeRepoTask || looksLikeForkWorkspace;
}

export function buildWorkflowPlanningGateText(result: WorkflowSelectionResult): string {
  const candidateLines = result.candidates.length
    ? result.candidates
        .map((c, i) => {
          const why = c.reasons.map((r) => `      - ${r}`).join("\n");
          return `${i + 1}. ${c.workflowId} (${c.confidence.toFixed(2)})\n${why}`;
        })
        .join("\n")
    : "1. no-match (0.00)\n      - no workflow candidate available";
  const selected = result.selectedWorkflowId
    ? `- **workflow 选择结果**: ${result.selectedWorkflowId}`
    : "- **workflow 选择结果**: no-match";
  const touched = result.touchedPaths.length
    ? result.touchedPaths.map((p) => `\`${p}\``).join(", ")
    : "none detected";
  return [
    "<!-- workflow-selection-result (informational only; does not block execution)",
    "- **任务分类**: " + result.taskType,
    "- **repo 区域**: " + result.repoArea,
    "- **风险等级**: " + result.riskLevel,
    "- **可能的 touched paths**: " + touched,
    "- **候选 workflow 列表**:",
    candidateLines,
    selected,
    "- **review 状态**: pending",
    "-->",
  ].join("\n");
}
