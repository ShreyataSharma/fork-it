import { env } from "../env";

const BASE_URL = "https://api.spoonacular.com";

export class SpoonacularError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(`Spoonacular ${status}: ${message}`);
  }
}

type Params = Record<string, string | number | boolean | undefined>;

export async function spoonacularGet<T>(path: string, params: Params = {}): Promise<T> {
  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  // Send the key as a header so it never appears in logged URLs.
  const res = await fetch(url, { headers: { "x-api-key": env.SPOONACULAR_API_KEY } });
  if (!res.ok) throw new SpoonacularError(res.status, await res.text());
  return (await res.json()) as T;
}
