import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env";

export const HAIKU_MODEL = "claude-haiku-4-5-20251001";

// Rate-limit (429) responses seen, counted before the SDK retries them, so retried ones show too.
export const anthropicStats = { rateLimited: 0 };

export const anthropic = new Anthropic({
  apiKey: env.ANTHROPIC_API_KEY,
  fetch: async (input, init) => {
    const res = await fetch(input, init);
    if (res.status === 429) anthropicStats.rateLimited++;
    return res;
  },
});
