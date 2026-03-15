export type TelegramReactionSemanticsCollision = {
  normalizedKey: string;
  firstRawKey: string;
  duplicateRawKey: string;
};

export function normalizeTelegramReactionKey(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const parts = /^([a-z_]+):(.*)$/i.exec(trimmed);
  if (!parts) {
    return `emoji:${trimmed}`;
  }
  const prefix = parts[1]?.toLowerCase();
  const value = parts[2]?.trim();
  if (!value) {
    return null;
  }
  if (prefix === "emoji" || prefix === "custom_emoji") {
    return `${prefix}:${value}`;
  }
  return null;
}

export function findTelegramReactionSemanticsCollisions(
  semantics?: Record<string, unknown> | null,
): TelegramReactionSemanticsCollision[] {
  if (!semantics) {
    return [];
  }
  const seen = new Map<string, string>();
  const collisions: TelegramReactionSemanticsCollision[] = [];
  for (const rawKey of Object.keys(semantics)) {
    const normalizedKey = normalizeTelegramReactionKey(rawKey);
    if (!normalizedKey) {
      continue;
    }
    const firstRawKey = seen.get(normalizedKey);
    if (!firstRawKey) {
      seen.set(normalizedKey, rawKey);
      continue;
    }
    if (firstRawKey === rawKey) {
      continue;
    }
    collisions.push({
      normalizedKey,
      firstRawKey,
      duplicateRawKey: rawKey,
    });
  }
  return collisions;
}
