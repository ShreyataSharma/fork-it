import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDropzone } from "react-dropzone";
import { Upload, X, ChefHat, Sparkles, Camera, Type, ArrowRight, Loader2, CheckCircle2, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import RecipeGrid from "@/components/RecipeGrid";
import RecipeDetail from "@/components/RecipeDetail";

const CUISINES = [
  { label: "Italian", emoji: "🇮🇹" },
  { label: "Asian", emoji: "🥢" },
  { label: "Mexican", emoji: "🇲🇽" },
  { label: "American", emoji: "🍔" },
  { label: "Indian", emoji: "🇮🇳" },
  { label: "Mediterranean", emoji: "🫒" },
  { label: "French", emoji: "🇫🇷" },
  { label: "Middle Eastern", emoji: "🧆" },
  { label: "Japanese", emoji: "🇯🇵" },
  { label: "Korean", emoji: "🇰🇷" },
  { label: "Thai", emoji: "🇹🇭" },
  { label: "Chinese", emoji: "🇨🇳" },
  { label: "Greek", emoji: "🇬🇷" },
  { label: "Spanish", emoji: "🇪🇸" },
];

type View = "input" | "ingredients" | "recipes" | "detail";

export interface RecipeIngredient {
  name: string;
  amount: string;
  userHas: boolean;
}

export interface RecipeMacros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  servingWeightG: number;
}

export interface Recipe {
  id: number;
  name: string;
  description: string;
  prepTime: string;
  cookTime: string;
  servings: number;
  difficulty: "Easy" | "Medium" | "Hard";
  cuisine: string;
  mainIngredients: string[];
  allIngredients: RecipeIngredient[];
  steps: string[];
  tags: string[];
  macros?: RecipeMacros;
}

export default function Home() {
  const [view, setView] = useState<View>("input");
  const [inputMode, setInputMode] = useState<"text" | "image">("text");
  const [textIngredients, setTextIngredients] = useState("");
  const [uploadedImages, setUploadedImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [identifiedIngredients, setIdentifiedIngredients] = useState<string[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [isIdentifying, setIsIdentifying] = useState(false);
  const [isLoadingRecipes, setIsLoadingRecipes] = useState(false);
  const [selectedCuisines, setSelectedCuisines] = useState<string[]>([]);
  const { toast } = useToast();

  const toggleCuisine = (label: string) => {
    setSelectedCuisines((prev) =>
      prev.includes(label) ? prev.filter((c) => c !== label) : [...prev, label]
    );
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles = [...uploadedImages, ...acceptedFiles].slice(0, 10);
    setUploadedImages(newFiles);
    const previews = newFiles.map((f) => URL.createObjectURL(f));
    setImagePreviews(previews);
  }, [uploadedImages]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [] },
    multiple: true,
    maxFiles: 10,
  });

  const removeImage = (idx: number) => {
    const newFiles = uploadedImages.filter((_, i) => i !== idx);
    const newPreviews = imagePreviews.filter((_, i) => i !== idx);
    setUploadedImages(newFiles);
    setImagePreviews(newPreviews);
  };

  const removeIngredient = (idx: number) => {
    setIdentifiedIngredients((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleIdentify = async () => {
    if (inputMode === "text" && !textIngredients.trim()) {
      toast({ title: "Please enter some ingredients first", variant: "destructive" });
      return;
    }
    if (inputMode === "image" && uploadedImages.length === 0) {
      toast({ title: "Please upload at least one photo", variant: "destructive" });
      return;
    }

    setIsIdentifying(true);
    try {
      const formData = new FormData();
      if (inputMode === "text") {
        formData.append("ingredients", textIngredients);
      } else {
        uploadedImages.forEach((file) => formData.append("images", file));
        if (textIngredients.trim()) {
          formData.append("ingredients", textIngredients);
        }
      }

      const res = await fetch("/api/identify-ingredients", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Failed to identify ingredients");
      const data = await res.json();
      setIdentifiedIngredients(data.ingredients);
      setView("ingredients");
    } catch {
      toast({ title: "Something went wrong", description: "Could not identify ingredients", variant: "destructive" });
    } finally {
      setIsIdentifying(false);
    }
  };

  const handleGetRecipes = async () => {
    if (identifiedIngredients.length === 0) {
      toast({ title: "No ingredients selected", variant: "destructive" });
      return;
    }

    setIsLoadingRecipes(true);
    try {
      const res = await fetch("/api/get-recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredients: identifiedIngredients, cuisines: selectedCuisines }),
      });

      if (!res.ok) throw new Error("Failed to get recipes");
      const data = await res.json();
      setRecipes(data.recipes || []);
      setView("recipes");
    } catch {
      toast({ title: "Something went wrong", description: "Could not generate recipes", variant: "destructive" });
    } finally {
      setIsLoadingRecipes(false);
    }
  };

  const handleSelectRecipe = (recipe: Recipe) => {
    setSelectedRecipe(recipe);
    setView("detail");
  };

  const handleBack = () => {
    if (view === "detail") {
      setView("recipes");
      setSelectedRecipe(null);
    } else if (view === "recipes") {
      setView("ingredients");
    } else if (view === "ingredients") {
      setView("input");
    }
  };

  const handleStartOver = () => {
    setView("input");
    setTextIngredients("");
    setUploadedImages([]);
    setImagePreviews([]);
    setIdentifiedIngredients([]);
    setRecipes([]);
    setSelectedRecipe(null);
    setSelectedCuisines([]);
  };

  return (
    <div className="min-h-screen chef-bg">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <header className="text-center mb-10">
          <div className="flex items-center justify-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-md">
              <ChefHat className="w-7 h-7 text-primary-foreground" />
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-foreground">
              FridgeChef
            </h1>
          </div>
          <p className="text-muted-foreground text-lg max-w-md mx-auto">
            Tell us what's in your fridge and we'll find the perfect recipes for you
          </p>
        </header>

        {/* Progress breadcrumb */}
        {view !== "input" && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 mb-6 text-sm"
          >
            <button
              onClick={handleStartOver}
              className="text-muted-foreground hover-elevate active-elevate-2 rounded-md px-2 py-1 cursor-pointer"
              data-testid="button-start-over"
            >
              Start Over
            </button>
            <span className="text-muted-foreground">/</span>
            {(view === "ingredients" || view === "recipes" || view === "detail") && (
              <button
                onClick={() => setView("ingredients")}
                className="text-muted-foreground hover-elevate active-elevate-2 rounded-md px-2 py-1 cursor-pointer"
                data-testid="button-nav-ingredients"
              >
                Ingredients
              </button>
            )}
            {(view === "recipes" || view === "detail") && (
              <>
                <span className="text-muted-foreground">/</span>
                <button
                  onClick={() => setView("recipes")}
                  className="text-muted-foreground hover-elevate active-elevate-2 rounded-md px-2 py-1 cursor-pointer"
                  data-testid="button-nav-recipes"
                >
                  Recipes
                </button>
              </>
            )}
            {view === "detail" && selectedRecipe && (
              <>
                <span className="text-muted-foreground">/</span>
                <span className="text-foreground font-medium truncate max-w-[200px]">{selectedRecipe.name}</span>
              </>
            )}
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {/* INPUT VIEW */}
          {view === "input" && (
            <motion.div
              key="input"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {/* Mode toggle */}
              <div className="flex gap-2 p-1 bg-muted rounded-xl w-fit mx-auto">
                <button
                  onClick={() => setInputMode("text")}
                  data-testid="button-mode-text"
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    inputMode === "text"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover-elevate active-elevate-2"
                  }`}
                >
                  <Type className="w-4 h-4" />
                  Type Ingredients
                </button>
                <button
                  onClick={() => setInputMode("image")}
                  data-testid="button-mode-image"
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    inputMode === "image"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover-elevate active-elevate-2"
                  }`}
                >
                  <Camera className="w-4 h-4" />
                  Upload Photos
                </button>
              </div>

              <div className="bg-card border border-card-border rounded-2xl p-8 shadow-sm">
                <AnimatePresence mode="wait">
                  {inputMode === "text" ? (
                    <motion.div
                      key="text-mode"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="space-y-4"
                    >
                      <div>
                        <h2 className="text-xl font-semibold text-foreground mb-1">
                          What's in your fridge?
                        </h2>
                        <p className="text-sm text-muted-foreground">
                          List your main ingredients — veggies, proteins, dairy. We'll assume you have basic pantry staples.
                        </p>
                      </div>
                      <Textarea
                        placeholder="e.g. chicken breast, broccoli, garlic, tomatoes, eggs, cheddar cheese..."
                        value={textIngredients}
                        onChange={(e) => setTextIngredients(e.target.value)}
                        className="min-h-[140px] text-base resize-none border-input focus-visible:ring-ring"
                        data-testid="input-ingredients"
                      />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="image-mode"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="space-y-4"
                    >
                      <div>
                        <h2 className="text-xl font-semibold text-foreground mb-1">
                          Show us your fridge
                        </h2>
                        <p className="text-sm text-muted-foreground">
                          Upload up to 10 photos of your fridge, pantry, or ingredients. Our AI will identify everything.
                        </p>
                      </div>

                      <div
                        {...getRootProps()}
                        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                          isDragActive
                            ? "border-primary bg-accent/40"
                            : "border-border hover:border-primary/50 hover:bg-muted/50"
                        }`}
                        data-testid="dropzone-images"
                      >
                        <input {...getInputProps()} data-testid="input-file-upload" />
                        <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                        <p className="text-sm font-medium text-foreground">
                          {isDragActive ? "Drop your photos here!" : "Drag & drop photos or click to browse"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">Up to 10 photos, any image format</p>
                      </div>

                      {imagePreviews.length > 0 && (
                        <div className="grid grid-cols-3 gap-3">
                          {imagePreviews.map((src, idx) => (
                            <div key={idx} className="relative group rounded-lg overflow-hidden aspect-square bg-muted" data-testid={`img-preview-${idx}`}>
                              <img src={src} alt={`Upload ${idx + 1}`} className="w-full h-full object-cover" />
                              <button
                                onClick={() => removeImage(idx)}
                                className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-foreground/80 text-background flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                data-testid={`button-remove-image-${idx}`}
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div>
                        <p className="text-xs text-muted-foreground mb-1.5 font-medium">Also add any ingredients you know you have (optional)</p>
                        <Textarea
                          placeholder="e.g. flour, eggs, olive oil..."
                          value={textIngredients}
                          onChange={(e) => setTextIngredients(e.target.value)}
                          className="min-h-[70px] text-sm resize-none"
                          data-testid="input-additional-ingredients"
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Cuisine preference */}
              <div className="bg-card border border-card-border rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <Globe className="w-4 h-4 text-primary" />
                  <h3 className="font-semibold text-foreground text-sm">Cuisine Preference</h3>
                  <span className="text-xs text-muted-foreground ml-1">(optional)</span>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  Pick one or more cuisines to focus the recipes, or leave it open for a global mix.
                </p>
                <div className="flex flex-wrap gap-2">
                  {CUISINES.map(({ label, emoji }) => {
                    const active = selectedCuisines.includes(label);
                    return (
                      <button
                        key={label}
                        onClick={() => toggleCuisine(label)}
                        data-testid={`button-cuisine-${label.toLowerCase().replace(/\s+/g, "-")}`}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all hover-elevate active-elevate-2 ${
                          active
                            ? "bg-primary text-primary-foreground border-primary shadow-sm"
                            : "bg-muted text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                        }`}
                      >
                        <span>{emoji}</span>
                        {label}
                      </button>
                    );
                  })}
                </div>
                {selectedCuisines.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      Recipes will lean toward: <span className="font-medium text-foreground">{selectedCuisines.join(", ")}</span>
                    </p>
                    <button
                      onClick={() => setSelectedCuisines([])}
                      className="text-xs text-muted-foreground hover-elevate active-elevate-2 rounded px-1.5 py-0.5"
                      data-testid="button-clear-cuisines"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>

              <div className="flex justify-center">
                <Button
                  size="lg"
                  onClick={handleIdentify}
                  disabled={isIdentifying}
                  className="gap-2 px-8 text-base"
                  data-testid="button-identify"
                >
                  {isIdentifying ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Identifying ingredients...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      Find My Recipes
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          )}

          {/* INGREDIENTS VIEW */}
          {view === "ingredients" && (
            <motion.div
              key="ingredients"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="bg-card border border-card-border rounded-2xl p-8 shadow-sm">
                <div className="flex items-start justify-between gap-4 mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-foreground">Your Ingredients</h2>
                    <p className="text-muted-foreground mt-1">
                      {identifiedIngredients.length} ingredient{identifiedIngredients.length !== 1 ? "s" : ""} identified. Remove any that don't look right.
                    </p>
                  </div>
                  <CheckCircle2 className="w-8 h-8 text-primary flex-shrink-0 mt-1" />
                </div>

                <div className="flex flex-wrap gap-2 mb-6">
                  {identifiedIngredients.map((ingredient, idx) => (
                    <motion.div
                      key={ingredient + idx}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: idx * 0.03 }}
                    >
                      <Badge
                        variant="secondary"
                        className="text-sm py-1.5 px-3 gap-1.5 cursor-pointer group"
                        data-testid={`badge-ingredient-${idx}`}
                      >
                        {ingredient}
                        <button
                          onClick={() => removeIngredient(idx)}
                          className="opacity-50 group-hover:opacity-100 transition-opacity ml-0.5"
                          data-testid={`button-remove-ingredient-${idx}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    </motion.div>
                  ))}
                </div>

                <div className="border-t border-border pt-4 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    We'll also assume you have basic pantry staples like salt, pepper, olive oil, garlic, onions, and common spices.
                  </p>
                  {selectedCuisines.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <Globe className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                      <span className="text-xs text-muted-foreground">Cuisine preference:</span>
                      {selectedCuisines.map((c) => (
                        <span key={c} className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-between gap-3">
                <Button variant="outline" onClick={handleBack} data-testid="button-back-input">
                  Back
                </Button>
                <Button
                  size="lg"
                  onClick={handleGetRecipes}
                  disabled={isLoadingRecipes || identifiedIngredients.length === 0}
                  className="gap-2 px-8"
                  data-testid="button-get-recipes"
                >
                  {isLoadingRecipes ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Finding recipes...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      Generate 10 Recipes
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          )}

          {/* RECIPES VIEW */}
          {view === "recipes" && (
            <motion.div
              key="recipes"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-foreground">Your Recipe Ideas</h2>
                <p className="text-muted-foreground mt-1">
                  10 recipes crafted from your ingredients. Click any card to see the full recipe.
                </p>
              </div>
              <RecipeGrid recipes={recipes} onSelectRecipe={handleSelectRecipe} />
            </motion.div>
          )}

          {/* DETAIL VIEW */}
          {view === "detail" && selectedRecipe && (
            <motion.div
              key="detail"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <RecipeDetail recipe={selectedRecipe} onBack={handleBack} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
