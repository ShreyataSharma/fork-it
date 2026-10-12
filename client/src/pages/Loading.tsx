import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { CUISINES, type Cuisine, type MealType } from "@shared/recipes";
import { startRecipeSearch } from "@/lib/recipeSearch";

export default function Loading() {
  const [, setLocation] = useLocation();
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    async function processRecipes() {
      try {
        // Ingredients were already parsed and selected on the Home screen.
        const finalIngredients: string[] = JSON.parse(sessionStorage.getItem("current_ingredients") || "[]");
        if (finalIngredients.length === 0) {
          setLocation("/home");
          return;
        }

        const selectedCuisines: string[] = JSON.parse(sessionStorage.getItem("current_cuisines") || "[]");
        const mealType = sessionStorage.getItem("current_meal") || undefined;
        // "Other" and "I'm Feeling Lucky" aren't Spoonacular cuisines, so only send picker cuisines.
        const cuisine = selectedCuisines.filter((c) => (CUISINES as readonly string[]).includes(c));

        // Show the Spoonacular batch as soon as it's in; AI recipes load on the Recipes page.
        await startRecipeSearch({
          ingredients: finalIngredients,
          cuisine: cuisine as Cuisine[],
          mealType: mealType as MealType | undefined,
        });
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
