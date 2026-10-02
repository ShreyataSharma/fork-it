import { useState } from "react";
import { useLocation } from "wouter";
import type { Recipe } from "@shared/recipes";
import RecipeGrid from "@/components/RecipeGrid";
import RecipeDetail from "@/components/RecipeDetail";

function readSession<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export default function Recipes() {
  const [, setLocation] = useLocation();
  const [recipes] = useState<Recipe[]>(() => readSession("found_recipes", []));
  const [ingredients] = useState<string[]>(() => readSession("current_ingredients", []));
  const [selected, setSelected] = useState<Recipe | null>(null);

  if (selected) {
    return (
      <div className="p-4">
        <RecipeDetail recipe={selected} onBack={() => setSelected(null)} userIngredients={ingredients} />
      </div>
    );
  }

  if (recipes.length === 0) {
    return (
      <div className="flex min-h-[calc(100vh-64px)] flex-col items-center justify-center p-6 text-center">
        <h2 className="font-serif text-2xl text-espresso">No recipes matched yet</h2>
        <p className="mt-3 max-w-[260px] text-[15px] text-olive/80">
          Try adding a few more ingredients or picking a different cuisine.
        </p>
        <button
          onClick={() => setLocation("/home")}
          className="mt-8 rounded-full bg-olive-pale px-6 py-2 font-medium text-olive transition-colors hover:bg-olive-mid hover:text-white"
        >
          Back to ingredients
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="font-serif text-[28px] leading-9 text-espresso">
        {recipes.length} {recipes.length === 1 ? "recipe" : "recipes"} for you
      </h1>
      <RecipeGrid recipes={recipes} onSelectRecipe={setSelected} />
    </div>
  );
}
