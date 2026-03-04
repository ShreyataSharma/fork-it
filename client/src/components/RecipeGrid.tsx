import { motion } from "framer-motion";
import { Clock, ChefHat, Users, Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { Recipe } from "@/pages/home";

const cuisineEmojis: Record<string, string> = {
  Italian: "🍝", Asian: "🍜", Mexican: "🌮", American: "🍔",
  Indian: "🍛", Mediterranean: "🫒", French: "🥖", Thai: "🌶️",
  Japanese: "🍱", Chinese: "🥢", Greek: "🧆", Spanish: "🥘",
};

const difficultyColors: Record<string, string> = {
  Easy: "bg-green-100 text-green-700 border-green-200",
  Medium: "bg-amber-100 text-amber-700 border-amber-200",
  Hard: "bg-red-100 text-red-700 border-red-200",
};

interface Props {
  recipes: Recipe[];
  onSelectRecipe: (recipe: Recipe) => void;
}

export default function RecipeGrid({ recipes, onSelectRecipe }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {recipes.map((recipe, idx) => (
        <motion.div
          key={recipe.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.06 }}
        >
          <Card
            className="cursor-pointer hover-elevate active-elevate-2 transition-all border-card-border group"
            onClick={() => onSelectRecipe(recipe)}
            data-testid={`card-recipe-${recipe.id}`}
          >
            <CardContent className="p-5">
              {/* Top row */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-lg">
                      {cuisineEmojis[recipe.cuisine] || "🍽️"}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-xs ${difficultyColors[recipe.difficulty] || ""}`}
                      data-testid={`badge-difficulty-${recipe.id}`}
                    >
                      {recipe.difficulty}
                    </Badge>
                    <Badge variant="outline" className="text-xs text-muted-foreground" data-testid={`badge-cuisine-${recipe.id}`}>
                      {recipe.cuisine}
                    </Badge>
                  </div>
                  <h3 className="font-bold text-foreground text-lg leading-tight group-hover:text-primary transition-colors" data-testid={`text-recipe-name-${recipe.id}`}>
                    {recipe.name}
                  </h3>
                </div>
                <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center flex-shrink-0">
                  <ChefHat className="w-6 h-6 text-accent-foreground" />
                </div>
              </div>

              {/* Description */}
              <p className="text-sm text-muted-foreground line-clamp-2 mb-4" data-testid={`text-recipe-desc-${recipe.id}`}>
                {recipe.description}
              </p>

              {/* Time row */}
              <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
                <div className="flex items-center gap-1.5" data-testid={`text-prep-time-${recipe.id}`}>
                  <Clock className="w-3.5 h-3.5 text-primary" />
                  <span>Prep: {recipe.prepTime}</span>
                </div>
                <div className="flex items-center gap-1.5" data-testid={`text-cook-time-${recipe.id}`}>
                  <Flame className="w-3.5 h-3.5 text-primary" />
                  <span>Cook: {recipe.cookTime}</span>
                </div>
                <div className="flex items-center gap-1.5" data-testid={`text-servings-${recipe.id}`}>
                  <Users className="w-3.5 h-3.5 text-primary" />
                  <span>Serves {recipe.servings}</span>
                </div>
              </div>

              {/* Ingredients preview */}
              <div className="flex flex-wrap gap-1.5">
                {recipe.mainIngredients.slice(0, 4).map((ing) => (
                  <span
                    key={ing}
                    className="text-xs bg-accent/60 text-accent-foreground rounded-md px-2 py-0.5"
                    data-testid={`tag-ingredient-${recipe.id}`}
                  >
                    {ing}
                  </span>
                ))}
                {recipe.mainIngredients.length > 4 && (
                  <span className="text-xs text-muted-foreground px-1 py-0.5">
                    +{recipe.mainIngredients.length - 4} more
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}
