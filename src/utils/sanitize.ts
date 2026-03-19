/**
 * Sanitize user-provided text to prevent log injection and other attacks.
 * Removes control characters, limits length, prevents log forgery.
 */
export function sanitizeUserText(text: string | undefined, maxLength = 256): string | undefined {
  if (!text) {
    return undefined;
  }

  // Remove control characters (including newlines, tabs, etc.)
  // Keep only printable ASCII + common Unicode
  // eslint-disable-next-line no-control-regex
  let sanitized = text.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");

  // Trim whitespace
  sanitized = sanitized.trim();

  // Limit length to prevent memory exhaustion.
  // Use Intl.Segmenter for grapheme-aware truncation so multi-codepoint
  // characters (emoji, combining marks) are never split mid-character.
  const segmenter = new Intl.Segmenter();
  const segments = Array.from(segmenter.segment(sanitized));
  if (segments.length > maxLength) {
    sanitized =
      segments
        .slice(0, maxLength)
        .map((s) => s.segment)
        .join("") + "...";
  }

  return sanitized.length > 0 ? sanitized : undefined;
}
