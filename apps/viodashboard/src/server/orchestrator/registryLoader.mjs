import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_REGISTRY_PATH = path.join(
  process.cwd(),
  'coms',
  'multi-agent',
  'agents.json'
);

function assert(condition, message) {
  if (!condition) {throw new Error(message);}
}

export function loadAgentRegistry(filePath = DEFAULT_REGISTRY_PATH) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);

  assert(parsed?.version === 'v1', 'Unsupported agent registry version');
  assert(Array.isArray(parsed?.agents), 'agents must be an array');
  assert(parsed.agents.length > 0, 'agents registry cannot be empty');

  const agentsById = new Map();

  for (const agent of parsed.agents) {
    assert(agent?.id, 'agent.id is required');
    assert(!agentsById.has(agent.id), `duplicate agent id: ${agent.id}`);
    assert(agent?.default_model, `agent ${agent.id} missing default_model`);
    assert(agent?.thinking, `agent ${agent.id} missing thinking`);
    assert(agent?.tool_mode, `agent ${agent.id} missing tool_mode`);
    assert(Array.isArray(agent?.allowed_tools), `agent ${agent.id} missing allowed_tools`);

    agentsById.set(agent.id, agent);
  }

  return {
    version: parsed.version,
    agents: parsed.agents,
    agentsById,
    filePath,
  };
}

export function getAgentConfig(registry, agentId) {
  const agent = registry?.agentsById?.get(agentId) || null;
  if (!agent) {throw new Error(`Unknown agent: ${agentId}`);}
  return agent;
}

export function resolveExecutionConfig(registry, agentId, override = null) {
  const agent = getAgentConfig(registry, agentId);

  return {
    model: override?.model || agent.default_model,
    thinking: override?.thinking || agent.thinking,
    tool_mode: override?.tool_mode || agent.tool_mode,
    fallback_model: agent.fallback_model || null,
    allowed_tools: Array.isArray(agent.allowed_tools) ? [...agent.allowed_tools] : [],
  };
}
