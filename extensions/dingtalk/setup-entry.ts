import { defineSetupPluginEntry } from "openclaw/plugin-sdk/core";
import { dingtalkSetupWizard } from "./src/setup-surface.js";

export { dingtalkSetupWizard } from "./src/setup-surface.js";

export default defineSetupPluginEntry(dingtalkSetupWizard);
