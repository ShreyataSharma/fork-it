import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env";

export const HAIKU_MODEL = "claude-haiku-4-5-20251001";

export const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
