import { useEffect, useState } from "react";
import { useLocation } from "wouter";

export default function Loading() {
  const [, setLocation] = useLocation();
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    async function processRecipes() {
      try {
        const ingredientsText = sessionStorage.getItem("current_ingredients_text") || "";
        
        // Agent 1: Parse ingredients
        const parseRes = await fetch("/api/parse-ingredients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: ingredientsText })
        });
        
        if (!parseRes.ok) throw new Error("Ingredient parsing failed.");
        const parseData = await parseRes.json();
        let finalIngredients = parseData.ingredients || [];
        
        if (finalIngredients.length === 0) {
          finalIngredients = ingredientsText.split(",").map(s => s.trim());
        }

        // Agent 2/4: Retrieve Recipes
        const recipesRes = await fetch("/api/get-recipes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ingredients: finalIngredients })
        });
        
        if (!recipesRes.ok) throw new Error("Failed to fetch recipes from AI.");
        
        const recipesData = await recipesRes.json();
        
        if (!recipesData.recipes || recipesData.recipes.length === 0) {
          throw new Error("No readable recipes matched.");
        }

        sessionStorage.setItem("found_recipes", JSON.stringify(recipesData.recipes));
        setLocation("/recipes");

      } catch (err: any) {
        console.error("Error finding recipes:", err);
        setErrorMsg(err.message || "An unknown error occurred.");
      }
    }

    processRecipes();
  }, [setLocation]);

  return (
    <div className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center p-6 bg-cream">
      {errorMsg ? (
        <>
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="text-2xl font-serif text-espresso text-center">
            Something went wrong
          </h2>
          <p className="text-sm text-red-500 mt-4 text-center max-w-[250px] font-medium">
            {errorMsg}
          </p>
          <button 
            onClick={() => setLocation("/home")}
            className="mt-8 text-olive font-medium px-6 py-2 bg-olive-pale rounded-full hover:bg-olive-mid hover:text-white transition-colors"
          >
            Go Back
          </button>
        </>
      ) : (
        <>
          <div className="text-7xl mb-6 animate-bounce">👨‍🍳</div>
          <h2 className="text-2xl font-serif text-espresso text-center">
            Cooking up something <span className="italic text-olive">special</span>...
          </h2>
          <p className="text-[15px] font-medium text-olive-mid mt-5 text-center max-w-[250px] animate-pulse">
            Curating the absolute best recipes for you...
          </p>
        </>
      )}
    </div>
  );
}
