import crypto from 'node:crypto';

export function randomId() {
  return crypto.randomUUID();
}

export function parseMessageText(message) {
  if (!message || typeof message !== 'object') {return '';}
  if (typeof message.text === 'string') {return message.text;}
  if (Array.isArray(message.content)) {
    return message.content
      .filter(part => part && typeof part === 'object' && part.type === 'text' && typeof part.text === 'string')
      .map(part => part.text)
      .join('\n');
  }
  if (typeof message.content === 'string') {return message.content;}
  return '';
}

export function extractUsage(payload) {
  const usage = payload?.usage || payload?.tokenUsage || payload?.metrics?.usage || payload?.response?.usage || null;
  if (!usage || typeof usage !== 'object') {return null;}
  const input = Number(usage.inputTokens ?? usage.promptTokens ?? usage.input ?? usage.prompt ?? 0) || 0;
  const output = Number(usage.outputTokens ?? usage.completionTokens ?? usage.output ?? usage.completion ?? 0) || 0;
  const total = Number(usage.totalTokens ?? usage.total ?? (input + output)) || (input + output);
  return { input, output, total };
}


function countIndent(line = '') {
  const match = String(line).match(/^(\s*)/);
  return match ? match[1].length : 0;
}

function parseBullet(line = '') {
  const trimmed = String(line).trim();
  const match = trimmed.match(/^[-*•]\s+(.+)$/) || trimmed.match(/^\d+[.)]\s+(.+)$/);
  return match ? match[1].trim() : null;
}

function looksLikeSectionBoundary(line = '') {
  const trimmed = String(line).trim();
  if (!trimmed) {return false;}
  if (trimmed.startsWith('```')) {return true;}
  if (/^#{1,6}\s+/.test(trimmed)) {return true;}
  if (/^[A-Z][A-Z\s/&-]{2,}$/.test(trimmed)) {return true;}
  if (/^(summary|notes?|risks?|questions?|decisions?|context|implementation|progress|status)\s*:?$/i.test(trimmed)) {return true;}
  return false;
}

export function extractRoadmapItems(text = '') {
  const source = String(text || '').replace(/\r/g, '');
  const lines = source.split('\n');
  let headingIndex = lines.findIndex(line => /proposed next steps/i.test(line));
  if (headingIndex === -1) {headingIndex = lines.findIndex(line => /next steps/i.test(line));}
  if (headingIndex === -1) {return [];}

  const items = [];
  let current = null;
  let sawBody = false;

  for (let i = headingIndex + 1; i < lines.length; i += 1) {
    const line = lines[i] || '';
    const trimmed = line.trim();

    if (!trimmed) {
      if (current && sawBody) {current.description = current.description.trim();}
      continue;
    }

    if (looksLikeSectionBoundary(line) && items.length) {break;}

    const bulletText = parseBullet(line);
    const indent = countIndent(line);

    if (bulletText) {
      if (!current || indent <= current.baseIndent) {
        current = {
          id: `roadmap-item-${items.length + 1}`,
          title: bulletText,
          description: '',
          status: 'proposed',
          priority: 'normal',
          source: 'assistant',
          baseIndent: indent,
        };
        items.push(current);
        sawBody = false;
        continue;
      }

      current.description += `${current.description ? '\n' : ''}• ${bulletText}`;
      sawBody = true;
      continue;
    }

    if (!current) {continue;}

    current.description += `${current.description ? '\n' : ''}${trimmed}`;
    sawBody = true;
  }

  return items.map(({ baseIndent, ...item }) => ({
    ...item,
    description: String(item.description || '').trim(),
  }));
}


function normalizeRoadmapItem(item, index = 0) {
  if (!item || typeof item !== 'object') {return null;}
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

export function extractStructuredRoadmapPayload(text = '') {
  const source = String(text || '');
  const blockRe = /```vio-roadmap\s*\n([\s\S]*?)\n```/i;
  const match = source.match(blockRe);
  if (!match) {return null;}
  try {
    const parsed = JSON.parse(match[1]);
    const items = Array.isArray(parsed?.items)
      ? parsed.items.map((item, index) => normalizeRoadmapItem(item, index)).filter(Boolean)
      : [];
    return {
      id: String(parsed.id || `roadmap-${Date.now()}`),
      title: String(parsed.title || 'Road Map'),
      summary: String(parsed.summary || 'Structured roadmap provided by the assistant reply payload.'),
      sourceType: 'assistant-structured',
      updatedAt: String(parsed.updatedAt || new Date().toISOString()),
      items,
    };
  } catch {
    return null;
  }
}

export function stripStructuredRoadmapBlock(text = '') {
  const blockRe = /\n?```vio-roadmap\s*\n[\s\S]*?\n```\s*$/i;
  return String(text || '').replace(blockRe, '').trim();
}

export function buildRoadmapFromReply(text = '') {
  const structured = extractStructuredRoadmapPayload(text);
  if (structured) {return structured;}
  return {
    id: `roadmap-${Date.now()}`,
    title: 'Road Map',
    summary: 'Structured roadmap generated by the wrapper backend from next-step bullets in the latest assistant reply.',
    sourceType: 'backend-extracted',
    updatedAt: new Date().toISOString(),
    items: extractRoadmapItems(text),
  };
}
