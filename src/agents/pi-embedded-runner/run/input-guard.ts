import type { OpenClawConfig } from "../../../config/config.js";
import { applyGuardToInput, type GuardModelConfig, type ReplyPayload } from "../../guard-model.js";

export type EmbeddedInputGuardResult =
  | {
      blocked: true;
      payloads: ReplyPayload[];
    }
  | {
      blocked: false;
      prompt: string;
    };

export async function applyEmbeddedInputGuardForAttempt(params: {
  prompt: string;
  inputGuardConfig: GuardModelConfig;
  cfg: OpenClawConfig;
  agentDir?: string;
}): Promise<EmbeddedInputGuardResult> {
  const inputCheck = await applyGuardToInput(params.prompt, params.inputGuardConfig, {
    cfg: params.cfg,
    agentDir: params.agentDir,
  });
  if (inputCheck.blocked) {
    return {
      blocked: true,
      payloads: inputCheck.payloads,
    };
  }
  return {
    blocked: false,
    prompt: inputCheck.rewrittenText ?? params.prompt,
  };
}
