export function commandPaletteShortcutLabel(
  nav: Pick<Navigator, "platform" | "userAgent"> | undefined = globalThis.navigator,
): string {
  const fingerprint = `${nav?.platform ?? ""} ${nav?.userAgent ?? ""}`.toLowerCase();
  return fingerprint.includes("mac") || fingerprint.includes("iphone") || fingerprint.includes("ipad")
    ? "⌘K"
    : "Ctrl+K";
}
