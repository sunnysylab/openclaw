import { buildChannelConfigSchema, DingTalkConfigSchema } from "../runtime-api.js";

export const DingTalkChannelConfigSchema = buildChannelConfigSchema(DingTalkConfigSchema);
