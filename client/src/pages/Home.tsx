import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useLocation } from "wouter";
import { ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import kitchenHero from "@/assets/home/kitchen-hero.png";
import utensilsIcon from "@/assets/home/utensils.svg";
import arrowRightIcon from "@/assets/home/arrow-right.svg";

const CUISINES = [
  "Indian", "Italian", "Asian", "Mexican", "Mediterranean", "French",
  "Middle Eastern", "Japanese", "Korean", "Thai", "Chinese", "Greek", "Spanish", "Other"
];

const MEALS = [
  { id: "Breakfast", icon: "🌅" },
  { id: "Lunch", icon: "🥗" },
  { id: "Dinner", icon: "🍽️" },
  { id: "Snacks", icon: "🍿" }
];

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type Ingredient = {
  name: string;
  description: string;
  selected: boolean;
  confidence: number | null;
  source: "text" | "photo";
};

type ParseResponse = { ingredients: Ingredient[]; staples: Ingredient[]; message: string };

// Add newly parsed items without duplicating names already in the list.
function mergeByName(existing: Ingredient[], incoming: Ingredient[]): Ingredient[] {
  const names = new Set(existing.map((i) => i.name));
  return [...existing, ...incoming.filter((i) => !names.has(i.name))];
}

export default function Home() {
  const [, setLocation] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [staples, setStaples] = useState<Ingredient[]>([]);
  const [parseMessage, setParseMessage] = useState("");
  const [parseError, setParseError] = useState("");
  const [error, setError] = useState("");

  const [selectedCuisines, setSelectedCuisines] = useState<string[]>([]);
  const [otherCuisine, setOtherCuisine] = useState("");
  const [selectedMeal, setSelectedMeal] = useState<string | null>(null);

  useEffect(() => {
    if (!image) return setImagePreview(null);
    const url = URL.createObjectURL(image);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  const pickImage = (file: File | undefined) => {
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) return setParseError("Photos must be JPEG, PNG, or WebP.");
    if (file.size > MAX_IMAGE_BYTES) return setParseError("Photos must be 5 MB or smaller.");
    setParseError("");
    setText("");
    setImage(file);
  };

  const canSend = !parsing && (text.trim().length > 0 || image !== null);

  const handleSend = async () => {
    if (!canSend) return;
    setParsing(true);
    setParseError("");
    setParseMessage("");
    try {
      let res: Response;
      if (image) {
        const form = new FormData();
        form.append("image", image);
        res = await fetch("/api/parse", { method: "POST", body: form });
      } else {
        res = await fetch("/api/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: text.trim() }),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "We couldn't read your ingredients.");

      const parsed = data as ParseResponse;
      setIngredients((prev) => mergeByName(prev, parsed.ingredients));
      if (parsed.ingredients.length > 0) setError("");
      setStaples((prev) => mergeByName(prev, parsed.staples));
      if (parsed.ingredients.length === 0) setParseMessage(parsed.message);
      setText("");
      setImage(null);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setParsing(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleIngredient = (name: string) => {
    setIngredients((prev) => prev.map((i) => (i.name === name ? { ...i, selected: !i.selected } : i)));
  };

  const toggleCuisine = (cuisine: string) => {
    if (cuisine === "I'm Feeling Lucky") {
      setSelectedCuisines(["I'm Feeling Lucky"]);
      return;
    }

    // Remove "feeling lucky" if we select a specific one
    let newSelection = selectedCuisines.filter(c => c !== "I'm Feeling Lucky");

    if (newSelection.includes(cuisine)) {
      newSelection = newSelection.filter(c => c !== cuisine);
    } else {
      newSelection.push(cuisine);
    }
    setSelectedCuisines(newSelection);
  };

  const selectedNames = ingredients.filter((i) => i.selected).map((i) => i.name);

  const handleFindRecipes = () => {
    if (selectedNames.length === 0) {
      setError("Add at least one ingredient first.");
      return;
    }
    setError("");

    sessionStorage.setItem("current_ingredients", JSON.stringify(selectedNames));
    sessionStorage.setItem("current_cuisines", JSON.stringify(selectedCuisines));
    sessionStorage.setItem("current_other_cuisine", otherCuisine);
    sessionStorage.setItem("current_meal", selectedMeal || "");

    setLocation("/loading");
  };

  return (
    <div className="flex flex-col">
      <div className="px-8 pt-8 pb-16 flex flex-col">
        {/* Hero illustration */}
        <div className="relative mx-auto w-full max-w-[326px]">
          <div className="absolute inset-[8px] rounded-full bg-[rgba(107,122,58,0.1)] blur-[32px]" aria-hidden />
          <div className="relative aspect-square w-full rotate-1 overflow-hidden rounded-[16px] shadow-[0px_12px_32px_0px_rgba(27,28,24,0.04)]">
            <img src={kitchenHero} alt="Warm, cozy kitchen" className="h-full w-full object-cover" />
          </div>
          <div className="absolute -bottom-[13px] -right-[5px] flex items-center gap-2 rounded-full border border-mist/15 bg-white px-[21px] py-[13px] drop-shadow-[0px_12px_16px_rgba(27,28,24,0.04)]">
            <img src={utensilsIcon} alt="" width={8.75} height={11.6667} />
            <span className="text-[12px] font-semibold uppercase leading-4 tracking-[1.2px] text-olive">
              Made at home
            </span>
          </div>
        </div>

        {/* Copy */}
        <div className="mt-12 flex flex-col items-center gap-[15px] text-center">
          <h1 className="max-w-[240px] font-serif text-[36px] leading-[45px] tracking-[-0.9px] text-espresso">
            Cook something amazing tonight
          </h1>
          <p className="max-w-[280px] text-[18px] leading-[29.25px] text-olive/70">
            Tell us what's in your fridge — we'll do the rest
          </p>
        </div>

        {/* Chat-style ingredient input */}
        <div className="mt-16 rounded-[28px] border border-mist/40 bg-white p-3 shadow-[0px_12px_32px_0px_rgba(27,28,24,0.06)]">
          {imagePreview ? (
            <div className="relative mb-2 ml-1 inline-block">
              <img src={imagePreview} alt="Selected photo" className="h-20 w-20 rounded-[12px] object-cover" />
              <button
                type="button"
                onClick={() => setImage(null)}
                aria-label="Remove photo"
                className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-espresso text-white"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (parseError) setParseError("");
              }}
              onKeyDown={handleKeyDown}
              rows={2}
              maxLength={2000}
              placeholder="e.g. chicken, spinach, half a lemon…"
              aria-label="Ingredients"
              className="block w-full resize-none bg-transparent px-2 pt-1 text-[16px] leading-6 text-espresso placeholder:text-espresso/40 focus:outline-none"
            />
          )}
          <div className="mt-1 flex items-center justify-between">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={parsing}
              aria-label="Upload a photo"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-stone text-espresso transition-colors hover:bg-olive-pale disabled:opacity-50"
            >
              <ImagePlus size={20} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={IMAGE_TYPES.join(",")}
              className="hidden"
              onChange={(e) => {
                pickImage(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              aria-label="Send"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-olive shadow-[0px_10px_15px_-3px_rgba(0,0,0,0.1),0px_4px_6px_-4px_rgba(0,0,0,0.1)] transition-opacity disabled:opacity-40"
            >
              {parsing ? (
                <Loader2 size={18} className="animate-spin text-white" />
              ) : (
                <img src={arrowRightIcon} alt="" width={16} height={16} />
              )}
            </button>
          </div>
        </div>

        {parseError && <p className="mt-3 text-center text-[13px] font-medium text-red-600">{parseError}</p>}

        {/* Parsed ingredients */}
        {ingredients.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Your ingredients">
            {ingredients.map((i) => (
              <button
                key={i.name}
                type="button"
                onClick={() => toggleIngredient(i.name)}
                aria-pressed={i.selected}
                title={i.description}
                className={`rounded-full border px-[18px] py-[10px] text-[12px] font-semibold uppercase leading-4 tracking-[1.2px] transition-colors ${
                  i.selected
                    ? "border-olive bg-olive text-white"
                    : "border-olive/60 bg-transparent text-olive"
                }`}
              >
                {i.name}
              </button>
            ))}
          </div>
        )}

        {staples.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[10px] uppercase tracking-[1px] text-espresso/40">Pantry staples</span>
            {staples.map((s) => (
              <span
                key={s.name}
                className="rounded-full bg-stone px-2.5 py-1 text-[11px] font-medium text-espresso/60"
              >
                {s.name}
              </span>
            ))}
          </div>
        )}

        {parseMessage && (
          <p className="mt-4 text-center text-[14px] leading-5 text-olive/80">{parseMessage}</p>
        )}

        {/* Cuisine Chips */}
        <div className="mt-10 flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {CUISINES.map((cuisine) => (
              <button
                key={cuisine}
                onClick={() => toggleCuisine(cuisine)}
                className={`px-4 py-2 rounded-full text-[13px] font-medium border transition-colors ${
                  selectedCuisines.includes(cuisine)
                    ? "bg-olive text-white border-olive"
                    : "bg-cream text-espresso border-olive-pale hover:bg-olive-pale"
                }`}
              >
                {cuisine}
              </button>
            ))}

            <button
              onClick={() => toggleCuisine("I'm Feeling Lucky")}
              className={`w-full mt-1.5 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium border-2 border-dashed transition-colors ${
                selectedCuisines.includes("I'm Feeling Lucky")
                  ? "bg-olive text-white border-olive"
                  : "bg-cream text-olive border-olive hover:bg-olive-pale"
              }`}
            >
              ✨ I'm Feeling Lucky
            </button>
          </div>

          {/* Other Cuisine Input */}
          {selectedCuisines.includes("Other") && (
            <Input
              placeholder="What cuisine are you craving?"
              className="mt-1 focus-visible:ring-olive border-olive-pale h-11 text-[15px]"
              value={otherCuisine}
              onChange={(e) => setOtherCuisine(e.target.value)}
            />
          )}
        </div>

        {/* Meal Type Grid */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          {MEALS.map((meal) => (
            <button
              key={meal.id}
              onClick={() => setSelectedMeal(selectedMeal === meal.id ? null : meal.id)}
              className={`flex flex-col items-center justify-center gap-1.5 p-4 rounded-xl border-2 transition-colors ${
                selectedMeal === meal.id
                  ? "bg-olive-pale border-olive"
                  : "bg-white border-olive-pale hover:border-olive-mid"
              }`}
            >
              <span className="text-3xl mb-1">{meal.icon}</span>
              <span className="text-sm font-semibold text-espresso">{meal.id}</span>
            </button>
          ))}
        </div>

        {/* Primary CTA */}
        <div className="mt-10 flex flex-col gap-3">
          <Button
            onClick={handleFindRecipes}
            className="h-auto w-full gap-2 rounded-full border-olive bg-olive py-5 text-[18px] font-bold leading-7 text-white shadow-[0px_10px_15px_-3px_rgba(0,0,0,0.1),0px_4px_6px_-4px_rgba(0,0,0,0.1)]"
          >
            Find my recipes
            <img src={arrowRightIcon} alt="" width={16} height={16} />
          </Button>
          {error && <span className="text-center text-[13px] font-medium text-red-600">{error}</span>}
        </div>
      </div>

      {/* Footer */}
      <footer className="flex flex-col items-center gap-6 bg-cream px-8 py-12">
        <span className="font-serif text-[18px] italic leading-7 text-espresso">Fork It</span>
        <div className="flex gap-6 text-[12px] uppercase leading-4 tracking-[1.2px] text-espresso/40">
          <span>Privacy</span>
          <span>Terms</span>
          <span>Support</span>
        </div>
        <span className="text-[10px] uppercase leading-[15px] tracking-[1px] text-espresso/30">
          © 2024 Fork It. Crafted for the modern kitchen.
        </span>
      </footer>
    </div>
  );
}
