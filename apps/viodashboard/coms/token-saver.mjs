const DEFAULTS = {
  maxRecentTurns: 4,
  maxSummaryChars: 900,
  maxMessageChars: 1600,
  maxCombinedChars: 2200,
  maxToolChars: 1200,
  maxToolHeadChars: 420,
  maxToolTailChars: 280,
};

function cleanText(value = '') {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripReplyTag(text = '') {
  return String(text || '').replace(/^\[\[[^\]]+\]\]\s*/i, '').trim();
}

export function hasRoadmapBlock(text = '') {
  return /```vio-roadmap\s*[\r\n]/i.test(String(text || ''));
}

function stripRoadmapBlock(text = '') {
  return String(text || '').replace(/\n?```vio-roadmap\s*\n[\s\S]*?\n```\s*$/i, '').trim();
}

function stripRoadmapProtocolLeak(text = '') {
  return String(text || '')
    .replace(/\n?\[VioWrapper roadmap protocol\][\s\S]*$/i, '')
    .trim();
}

function stripNoise(text = '') {
  return cleanText(stripRoadmapProtocolLeak(stripRoadmapBlock(stripReplyTag(text))));
}

function truncate(text = '', limit = 1000) {
  const source = cleanText(text);
  if (source.length <= limit) return source;
  const head = Math.max(200, Math.floor(limit * 0.7));
  const tail = Math.max(120, limit - head - 24);
  return `${source.slice(0, head).trim()}\n…\n${source.slice(-tail).trim()}`;
}

function hashish(text = '') {
  return cleanText(text).toLowerCase();
}

function summarizeTurns(turns = [], maxChars = 1200) {
  const lines = [];
  for (const turn of turns) {
    const role = turn.role === 'assistant' ? 'Assistant' : turn.role === 'tool' ? 'Tool' : 'User';
    const text = truncate(turn.text, 240);
    if (!text) continue;
    lines.push(`${role}: ${text}`);
  }
  return truncate(lines.join('\n'), maxChars);
}

function summarizeToolOutput(text = '', options = {}) {
  const source = stripNoise(text);
  const maxToolChars = options.maxToolChars || DEFAULTS.maxToolChars;
  const maxToolHeadChars = options.maxToolHeadChars || DEFAULTS.maxToolHeadChars;
  const maxToolTailChars = options.maxToolTailChars || DEFAULTS.maxToolTailChars;
  if (!source) return '';
  const lines = source.split('\n');
  const nonEmpty = lines.filter(Boolean).length;
  const head = source.slice(0, maxToolHeadChars).trim();
  const tail = source.length > maxToolHeadChars ? source.slice(-maxToolTailChars).trim() : '';
  const summaryBits = [];
  summaryBits.push(`lines=${lines.length}`);
  summaryBits.push(`nonEmpty=${nonEmpty}`);
  summaryBits.push(`chars=${source.length}`);
  let compact = `Tool output summary (${summaryBits.join(', ')}).`;
  if (head) compact += `\nHead:\n${head}`;
  if (tail && tail !== head) compact += `\nTail:\n${tail}`;
  return truncate(compact, maxToolChars);
}

export class TokenSaver {
  constructor(options = {}) {
    this.options = { ...DEFAULTS, ...options };
    this.rules = {
      phase1Summary: false,
      phase2ToolCompression: true,
    };
    this.turns = [];
    this.summary = '';
    this.lastAssistantFinal = null;
    this.lastSend = null;
    this.stats = {
      sendCount: 0,
      totalOriginalChars: 0,
      totalOutboundMessageChars: 0,
      totalContextChars: 0,
      totalSavedChars: 0,
      totalNaiveChars: 0,
      totalEffectiveSentChars: 0,
      totalSavedPctWeighted: 0,
      last: null,
      toolEvents: 0,
    };
  }

  refreshToolCompressionWindow() {
    const uncompressedStart = Math.max(0, this.turns.length - 5);
    for (let index = 0; index < this.turns.length; index += 1) {
      const turn = this.turns[index];
      if (turn?.role !== 'tool' || turn?.kind !== 'tool') continue;
      const label = turn.toolLabel || 'tool';
      const rawBody = cleanText(turn.fullText || turn.text || '');
      if (!rawBody) continue;
      const shouldCompress = this.rules.phase2ToolCompression && index < uncompressedStart;
      const nextBody = shouldCompress
        ? summarizeToolOutput(rawBody, this.options)
        : truncate(rawBody, this.options.maxMessageChars);
      turn.text = `${label}\n${nextBody}`;
      turn.compressed = shouldCompress;
    }
  }

  ingest(role, text, meta = {}) {
    if (role === 'assistant' && hasRoadmapBlock(text)) {
      console.warn('[token-saver] roadmap block reached assistant ingest; stripping before memory compaction.');
    }
    const normalized = stripNoise(text);
    if (!normalized) return null;
    const entry = {
      role,
      text: truncate(normalized, this.options.maxMessageChars),
      rawLength: String(text || '').length,
      kind: meta.kind || 'message',
      at: new Date().toISOString(),
      ...(meta.kind === 'tool'
        ? {
            toolLabel: meta.toolLabel || 'tool',
            fullText: meta.fullText || normalized,
            compressed: false,
          }
        : {}),
    };
    const last = this.turns[this.turns.length - 1];
    if (last && last.role === entry.role && hashish(last.text) === hashish(entry.text)) {
      return last;
    }
    this.turns.push(entry);
    this.refreshToolCompressionWindow();
    if (role === 'assistant') {
      this.lastAssistantFinal = {
        text: entry.text,
        rawLength: entry.rawLength,
        at: entry.at,
      };
    }
    this.compact();
    this.refreshToolCompressionWindow();
    return entry;
  }

  setRules(next = {}) {
    this.rules = {
      ...this.rules,
      ...next,
    };
    this.refreshToolCompressionWindow();
  }

  getRules() {
    return { ...this.rules };
  }

  ingestTool(label, text, meta = {}) {
    const normalized = stripNoise(text);
    if (!normalized) return null;
    const safeLabel = label || 'tool';
    const body = truncate(normalized, this.options.maxMessageChars);
    if (!body) return null;
    this.stats.toolEvents += 1;
    return this.ingest('tool', `${safeLabel}\n${body}`, {
      ...meta,
      kind: 'tool',
      toolLabel: safeLabel,
      fullText: normalized,
    });
  }

  compact() {
    const maxTurns = Math.max(2, this.options.maxRecentTurns * 2);
    if (this.turns.length <= maxTurns) return;
    const overflow = this.turns.splice(0, this.turns.length - maxTurns);
    const merged = summarizeTurns(overflow, this.options.maxSummaryChars);
    if (!merged) return;
    this.summary = this.summary
      ? truncate(`${this.summary}\n${merged}`, this.options.maxSummaryChars)
      : merged;
  }

  buildContextEnvelope(currentUserText) {
    const current = stripNoise(currentUserText);
    const recentTurns = this.turns.slice(-Math.max(2, this.options.maxRecentTurns * 2));
    const filteredTurns = recentTurns.filter(turn => {
      if (turn.role !== 'user') return true;
      return hashish(turn.text) !== hashish(current);
    });
    const recentText = filteredTurns
      .map(turn => `${turn.role === 'assistant' ? 'Assistant' : turn.role === 'tool' ? 'Tool' : 'User'}: ${truncate(turn.text, 220)}`)
      .join('\n');

    const sections = [];
    sections.push('You are continuing an active wrapper conversation. Be concise and avoid repeating stale context.');
    if (this.summary) sections.push(`Working summary:\n${truncate(this.summary, this.options.maxSummaryChars)}`);
    if (recentText) sections.push(`Recent conversation:\n${truncate(recentText, Math.floor(this.options.maxCombinedChars * 0.6))}`);
    sections.push(`Current user message:\n${truncate(current, Math.min(this.options.maxMessageChars, 800))}`);
    return truncate(sections.join('\n\n'), this.options.maxCombinedChars);
  }

  recordSend({ originalUserText = '', outboundMessage = '', contextEnvelope = '', roadmapInstruction = '' } = {}) {
    const originalChars = String(originalUserText || '').length;
    const outboundMessageChars = String(outboundMessage || '').length;
    const contextChars = String(contextEnvelope || '').length;
    const effectiveSentChars = outboundMessageChars + contextChars;
    const rawTurns = this.turns.map(turn => `${turn.role === 'assistant' ? 'Assistant' : turn.role === 'tool' ? 'Tool' : 'User'}: ${turn.text}`).join('\n');
    const naiveEnvelope = [
      'You are continuing an active wrapper conversation. Be concise and avoid repeating stale context.',
      this.summary ? `Working summary:\n${this.summary}` : '',
      rawTurns ? `Recent conversation:\n${rawTurns}` : '',
      `Current user message:\n${originalUserText}`,
      cleanText(roadmapInstruction),
    ].filter(Boolean).join('\n\n');
    const naiveChars = outboundMessageChars + naiveEnvelope.length;
    const savedChars = Math.max(0, naiveChars - effectiveSentChars);
    const savedPct = naiveChars > 0 ? Number(((savedChars / naiveChars) * 100).toFixed(2)) : 0;
    this.stats.sendCount += 1;
    this.stats.totalOriginalChars += originalChars;
    this.stats.totalOutboundMessageChars += outboundMessageChars;
    this.stats.totalContextChars += contextChars;
    this.stats.totalSavedChars += savedChars;
    this.stats.totalNaiveChars += naiveChars;
    this.stats.totalEffectiveSentChars += effectiveSentChars;
    this.stats.totalSavedPctWeighted = this.stats.totalNaiveChars > 0
      ? Number(((this.stats.totalSavedChars / this.stats.totalNaiveChars) * 100).toFixed(2))
      : 0;
    this.stats.last = {
      at: new Date().toISOString(),
      originalChars,
      outboundMessageChars,
      contextChars,
      effectiveSentChars,
      naiveChars,
      savedChars,
      savedPct,
      actualContextChars: contextChars,
      actualOutboundChars: outboundMessageChars,
    };
    this.lastSend = {
      originalUserText,
      outboundMessage,
      contextEnvelope,
      roadmapInstruction: cleanText(roadmapInstruction),
      stats: { ...this.stats.last },
    };
    return this.stats.last;
  }

  buildSystemPrompt(currentUserText, roadmapInstruction = '') {
    const envelope = this.buildContextEnvelope(currentUserText);
    const source = [envelope, cleanText(roadmapInstruction)].filter(Boolean).join('\n\n');
    return truncate(source, Math.max(this.options.maxCombinedChars, 3200));
  }

  getSnapshot() {
    return {
      lastSend: this.lastSend,
      memory: {
        summary: this.summary,
        turnCount: this.turns.length,
        recentTurns: this.turns.slice(-6),
      },
      lastAssistantFinal: this.lastAssistantFinal,
      options: { ...this.options },
      rules: this.getRules(),
      stats: { ...this.stats },
    };
  }
}

export function sanitizeVisibleText(text = '') {
  return stripNoise(text);
}

export function summarizeToolOutputForTransport(label = '', text = '', options = {}) {
  const summary = summarizeToolOutput(text, { ...DEFAULTS, ...options });
  return summary ? `${label || 'tool'}\n${summary}` : '';
}

export function simulateTokenSaverView(snapshot = {}, currentUserText = '', roadmapInstruction = '') {
  const recentTurns = Array.isArray(snapshot?.memory?.recentTurns) ? snapshot.memory.recentTurns : [];
  const roles = recentTurns.map(turn => turn.role || 'unknown');
  const toolNames = recentTurns
    .filter(turn => turn.role === 'tool')
    .map(turn => String(turn.text || '').split('\n')[0])
    .filter(Boolean);
  const simulatedSystemPrompt = [
    snapshot?.memory?.summary ? `Working summary:\n${snapshot.memory.summary}` : '',
    cleanText(roadmapInstruction),
  ].filter(Boolean).join('\n\n');
  const simulatedOutboundMessage = cleanText(currentUserText);
  return {
    messageCount: recentTurns.length + (simulatedOutboundMessage ? 1 : 0),
    roles: [...roles, ...(simulatedOutboundMessage ? ['user'] : [])],
    recentThreeRoles: [...roles, ...(simulatedOutboundMessage ? ['user'] : [])].slice(-3),
    toolCallIds: [],
    toolNames,
    systemMessageRewritten: Boolean(snapshot?.memory?.summary),
    outboundMessage: simulatedOutboundMessage,
    extraSystemPrompt: truncate(simulatedSystemPrompt, Math.max(DEFAULTS.maxCombinedChars, 3200)),
  };
}

export function buildPhaseOneCompressedPrompt(snapshot = {}, currentUserText = '', roadmapInstruction = '') {
  const rules = snapshot?.rules || {};
  const recentTurns = Array.isArray(snapshot?.memory?.recentTurns) ? snapshot.memory.recentTurns : [];
  const current = cleanText(currentUserText);
  const recentText = recentTurns
    .map(turn => `${turn.role === 'assistant' ? 'Assistant' : turn.role === 'tool' ? 'Tool' : 'User'}: ${truncate(turn.text, 220)}`)
    .join('\n');
  const sections = [
    'You are continuing an active wrapper conversation. Be concise and avoid repeating stale context.',
  ];
  if (rules.phase1Summary && snapshot?.memory?.summary) sections.push(`Working summary:\n${truncate(snapshot.memory.summary, DEFAULTS.maxSummaryChars)}`);
  if (recentText) sections.push(`Recent conversation:\n${truncate(recentText, Math.floor(DEFAULTS.maxCombinedChars * 0.6))}`);
  sections.push(cleanText(roadmapInstruction));
  return truncate(sections.filter(Boolean).join('\n\n'), Math.max(DEFAULTS.maxCombinedChars, 3200));
}
