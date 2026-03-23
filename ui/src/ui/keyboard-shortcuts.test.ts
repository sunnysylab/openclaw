import { describe, expect, it } from "vitest";
import { commandPaletteShortcutLabel } from "./keyboard-shortcuts.ts";

describe("commandPaletteShortcutLabel", () => {
  it("returns the mac shortcut on Apple platforms", () => {
    expect(commandPaletteShortcutLabel({ platform: "MacIntel", userAgent: "Mozilla/5.0" })).toBe(
      "⌘K",
    );
    expect(commandPaletteShortcutLabel({ platform: "", userAgent: "iPhone" })).toBe("⌘K");
  });

  it("returns the control shortcut on non-Apple platforms", () => {
    expect(commandPaletteShortcutLabel({ platform: "Win32", userAgent: "Mozilla/5.0" })).toBe(
      "Ctrl+K",
    );
    expect(commandPaletteShortcutLabel({ platform: "Linux x86_64", userAgent: "Mozilla/5.0" })).toBe(
      "Ctrl+K",
    );
  });
});
