export const CONFIGURE_WIZARD_SECTIONS = [
  "workspace",
  "model",
  "guard-model",
  "web",
  "gateway",
  "daemon",
  "channels",
  "skills",
  "health",
] as const;

export type WizardSection = (typeof CONFIGURE_WIZARD_SECTIONS)[number];

export function parseConfigureWizardSections(raw: unknown): {
  sections: WizardSection[];
  invalid: string[];
} {
  const sectionsRaw: string[] = Array.isArray(raw)
    ? raw.map((value: unknown) => (typeof value === "string" ? value.trim() : "")).filter(Boolean)
    : [];
  if (sectionsRaw.length === 0) {
    return { sections: [], invalid: [] };
  }

  const invalid = sectionsRaw.filter(
    (section) => !CONFIGURE_WIZARD_SECTIONS.includes(section as never),
  );
  const sections = sectionsRaw.filter((section): section is WizardSection =>
    CONFIGURE_WIZARD_SECTIONS.includes(section as never),
  );
  return { sections, invalid };
}
