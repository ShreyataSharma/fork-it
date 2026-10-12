// The running recipe search, shared by the Loading page (which starts it) and the Recipes page
// (which shows its batches). POST /api/recipes streams newline-delimited JSON (see
// RecipeStreamMessage): the Spoonacular batch, each AI recipe as it passes, then the final list.
// Every update is saved to sessionStorage so a reload keeps the latest list.
import { useSyncExternalStore } from "react";
import type { Recipe, RecipeSearchRequest, RecipeStreamMessage } from "@shared/recipes";

export type RecipeSearchState = {
  recipes: Recipe[];
  // True while AI recipes are still being written.
  aiPending: boolean;
  // Set if the stream failed after the first batch; the recipes shown so far stay.
  error?: string;
};

const STORAGE_KEY = "found_recipes";

let state: RecipeSearchState | null = null;
const listeners = new Set<() => void>();
// Read through a function so TypeScript doesn't narrow `state` across awaits.
const current = () => state;

function setState(next: RecipeSearchState) {
  state = next;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next.recipes));
  listeners.forEach((l) => l());
}

function savedState(): RecipeSearchState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return { recipes: raw ? (JSON.parse(raw) as Recipe[]) : [], aiPending: false };
  } catch {
    return { recipes: [], aiPending: false };
  }
}

// Starts a search. Resolves once the first batch is in, and keeps reading the rest in the
// background. Rejects if the search fails before any recipes arrive.
export async function startRecipeSearch(request: RecipeSearchRequest): Promise<void> {
  state = null;
  const res = await fetch("/api/recipes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "We couldn't find recipes right now.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let resolveFirst!: () => void;
  let rejectFirst!: (err: Error) => void;
  const first = new Promise<void>((resolve, reject) => {
    resolveFirst = resolve;
    rejectFirst = reject;
  });
  let gotFirst = false;

  const handle = (msg: RecipeStreamMessage) => {
    switch (msg.type) {
      case "first":
        setState({ recipes: msg.recipes, aiPending: msg.aiPending });
        gotFirst = true;
        resolveFirst();
        return;
      case "ai": {
        // Each AI recipe goes after every card already shown.
        const s = current() ?? savedState();
        setState({ ...s, recipes: [...s.recipes, msg.recipe] });
        return;
      }
      case "done":
        setState({ recipes: msg.recipes, aiPending: false });
        return;
      case "error":
        if (!gotFirst) return rejectFirst(new Error(msg.error));
        setState({ ...(current() ?? savedState()), aiPending: false, error: msg.error });
    }
  };

  (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (line) handle(JSON.parse(line) as RecipeStreamMessage);
        }
      }
      if (!gotFirst) rejectFirst(new Error("We couldn't find recipes right now."));
      else {
        const s = current();
        if (s?.aiPending) setState({ ...s, aiPending: false });
      }
    } catch (err) {
      if (!gotFirst) rejectFirst(err instanceof Error ? err : new Error(String(err)));
      else setState({ ...(current() ?? savedState()), aiPending: false, error: "We couldn't load the rest of the recipes." });
    }
  })();

  return first;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// The current search, or the last saved list if no search is running (after a reload).
export function useRecipeSearch(): RecipeSearchState {
  return useSyncExternalStore(subscribe, () => (state ??= savedState()));
}
