import dotenv from "dotenv";

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

// Features that read these fall back to placeholder behavior when they're unset.
function optional(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

export const env = {
  ANTHROPIC_API_KEY: required("ANTHROPIC_API_KEY"),
  SPOONACULAR_API_KEY: required("SPOONACULAR_API_KEY"),
  // Server only. Never expose to the client.
  TYPESAFE_API_KEY: optional("TYPESAFE_API_KEY"),
  SUPABASE_URL: optional("SUPABASE_URL") ?? optional("VITE_SUPABASE_URL"),
  // Server only. The Jev cache tables have RLS on with no policies, so only this key can use them.
  SUPABASE_SERVICE_ROLE_KEY: optional("SUPABASE_SERVICE_ROLE_KEY"),
};
