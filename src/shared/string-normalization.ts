export function normalizeStringEntries(list?: ReadonlyArray<unknown>) {
  return (list ?? []).map((entry) => String(entry).trim()).filter(Boolean);
}

export function normalizeStringEntriesLower(list?: ReadonlyArray<unknown>) {
  return normalizeStringEntries(list).map((entry) => entry.toLowerCase());
}

export function normalizeHyphenSlug(raw?: string | null) {
  const trimmed = raw?.trim().toLowerCase() ?? "";
  if (!trimmed) {
    return "";
  }
  const dashed = trimmed.replace(/\s+/g, "-");
  // Allow Unicode letters/digits (e.g. CJK, Cyrillic, Arabic) in addition to ASCII slug chars
  const cleaned = dashed.replace(/[^a-z0-9#@._+\-\p{L}\p{N}]+/gu, "-");
  return cleaned.replace(/-{2,}/g, "-").replace(/^[-.]+|[-.]+$/g, "");
}

export function normalizeAtHashSlug(raw?: string | null) {
  const trimmed = raw?.trim().toLowerCase() ?? "";
  if (!trimmed) {
    return "";
  }
  const withoutPrefix = trimmed.replace(/^[@#]+/, "");
  const dashed = withoutPrefix.replace(/[\s_]+/g, "-");
  const cleaned = dashed.replace(/[^a-z0-9-]+/g, "-");
  return cleaned.replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "");
}
