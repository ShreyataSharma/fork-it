import { useState, useEffect } from "react";
import type { Recipe } from "@/pages/home";

const STORAGE_KEY = "forkit_history";
const MAX_HISTORY = 50;

export interface HistoryEntry {
  recipe: Recipe;
  viewedAt: string;
}

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {}
}

export function useRecipeHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);

  useEffect(() => {
    saveHistory(history);
  }, [history]);

  const addToHistory = (recipe: Recipe) => {
    setHistory((prev) => {
      const without = prev.filter((e) => e.recipe.name !== recipe.name);
      const updated = [{ recipe, viewedAt: new Date().toISOString() }, ...without];
      return updated.slice(0, MAX_HISTORY);
    });
  };

  const clearHistory = () => setHistory([]);

  return { history, addToHistory, clearHistory };
}
