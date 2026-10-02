import dotenv from "dotenv";

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  ANTHROPIC_API_KEY: required("ANTHROPIC_API_KEY"),
  SPOONACULAR_API_KEY: required("SPOONACULAR_API_KEY"),
};
