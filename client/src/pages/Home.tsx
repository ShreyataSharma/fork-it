import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useLocation } from "wouter";
import { ImagePlus, Info, Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { CUISINES } from "@shared/recipes";
import arrowRightIcon from "@/assets/home/arrow-right.svg";

const MEALS = [
  { id: "Breakfast", icon: "🍳" },
  { id: "Lunch", icon: "🥗" },
  { id: "Dinner", icon: "🥘" },
  { id: "Snacks", icon: "🍿" }
];

function timeOfDay(): string {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

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
  const [firstName, setFirstName] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      if (!user) return;
      const full = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "";
      setFirstName(String(full).split(" ")[0]);
    });
  }, []);

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

  const sectionLabel = "text-[10px] font-bold uppercase leading-[15px] tracking-[1.5px] text-espresso/75";

  return (
    <div className="flex flex-col gap-8 px-6 pb-12 pt-6">
      {/* Greeting */}
      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-bold uppercase leading-[15px] tracking-[1.5px] text-olive">
          Good {timeOfDay()}{firstName && `, ${firstName}`}
        </span>
        <h1 className="font-serif text-[36px] font-bold leading-[45px] text-espresso">
          What's in your <span className="font-normal text-olive">fridge</span> today?
        </h1>
        <p className="text-[16px] leading-6 text-espresso/75">
          Tell us your ingredients and we'll find the perfect recipes
        </p>
      </div>

      {/* Chat-style ingredient input */}
      <div className="flex flex-col">
        <div className="rounded-[12px] border border-mist/10 bg-white p-3 drop-shadow-[0px_12px_16px_rgba(27,28,24,0.04)]">
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
              rows={3}
              maxLength={2000}
              placeholder="e.g. chicken breast, garlic, lemon, spinach..."
              aria-label="Ingredients"
              className="block w-full resize-none bg-transparent px-2 pt-1 text-[18px] font-medium leading-7 text-espresso placeholder:text-espresso/40 focus:outline-none"
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
      </div>

      {/* Pantry staples note */}
      <div className="flex items-start gap-3 rounded-[8px] border border-[rgba(107,122,58,0.2)] bg-[rgba(107,122,58,0.05)] p-4">
        <Info size={17} className="mt-0.5 shrink-0 text-espresso/75" />
        <p className="text-[12px] leading-[19.5px] text-espresso/75">
          We'll assume you have basic pantry staples — salt, pepper, olive oil, garlic, onions and common spices.
        </p>
      </div>

      {/* Cuisine preference */}
      <div className="flex flex-col gap-4">
        <h3 className={sectionLabel}>Cuisine preference — optional</h3>
        <div className="grid grid-cols-3 gap-2">
          {CUISINES.map((cuisine) => (
            <button
              key={cuisine}
              type="button"
              onClick={() => toggleCuisine(cuisine)}
              aria-pressed={selectedCuisines.includes(cuisine)}
              className={`h-12 rounded-[8px] px-1 text-[14px] font-semibold leading-5 transition-colors ${
                selectedCuisines.includes(cuisine)
                  ? "bg-olive text-white shadow-[0px_0px_0px_2px_#fbf9f3,0px_0px_0px_4px_#536124,0px_4px_6px_-1px_rgba(0,0,0,0.1)]"
                  : "bg-stone text-espresso hover:bg-olive-pale"
              }`}
            >
              {cuisine}
            </button>
          ))}
          <button
            type="button"
            onClick={() => toggleCuisine("Other")}
            aria-pressed={selectedCuisines.includes("Other")}
            className={`h-12 rounded-[8px] border text-[14px] font-bold leading-5 transition-colors ${
              selectedCuisines.includes("Other")
                ? "border-olive bg-olive text-white"
                : "border-olive/20 bg-olive/10 text-olive hover:bg-olive/15"
            }`}
          >
            Other
          </button>

          <button
            type="button"
            onClick={() => toggleCuisine("I'm Feeling Lucky")}
            aria-pressed={selectedCuisines.includes("I'm Feeling Lucky")}
            className={`col-span-3 mt-1 flex h-12 items-center justify-center gap-2 rounded-[8px] border-2 border-dashed text-[14px] font-bold leading-5 transition-colors ${
              selectedCuisines.includes("I'm Feeling Lucky")
                ? "border-olive bg-olive text-white"
                : "border-[#6b7a3a] bg-gradient-to-r from-olive/5 to-olive/10 text-olive"
            }`}
          >
            <Sparkles size={16} />
            I'm Feeling Lucky
          </button>
        </div>

        {selectedCuisines.includes("Other") && (
          <Input
            placeholder="What cuisine are you craving?"
            className="h-11 border-olive-pale text-[15px] focus-visible:ring-olive"
            value={otherCuisine}
            onChange={(e) => setOtherCuisine(e.target.value)}
          />
        )}
      </div>

      {/* Meal type */}
      <div className="flex flex-col gap-4">
        <h3 className={sectionLabel}>Meal type — optional</h3>
        <div className="grid grid-cols-2 gap-3">
          {MEALS.map((meal) => (
            <button
              key={meal.id}
              type="button"
              onClick={() => setSelectedMeal(selectedMeal === meal.id ? null : meal.id)}
              aria-pressed={selectedMeal === meal.id}
              className={`flex flex-col items-center justify-center gap-2 rounded-[12px] py-[25px] transition-colors ${
                selectedMeal === meal.id
                  ? "border-2 border-olive bg-olive/5 text-olive"
                  : "border border-mist/20 bg-white text-espresso hover:border-olive-mid"
              }`}
            >
              <span className="text-[24px] leading-8">{meal.icon}</span>
              <span className="text-[14px] font-bold leading-5">{meal.id}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Primary CTA */}
      <div className="flex flex-col gap-3 pt-4">
        <Button
          onClick={handleFindRecipes}
          className="h-auto w-full gap-2 rounded-full border-olive bg-olive py-5 font-serif text-[18px] font-bold leading-7 text-white shadow-[0px_20px_25px_-5px_rgba(0,0,0,0.1),0px_8px_10px_-6px_rgba(0,0,0,0.1)]"
        >
          Find My Recipes
          <img src={arrowRightIcon} alt="" width={16} height={16} />
        </Button>
        {error && <span className="text-center text-[13px] font-medium text-red-600">{error}</span>}
      </div>
    </div>
  );
}
