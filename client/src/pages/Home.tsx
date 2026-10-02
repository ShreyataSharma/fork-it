import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

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

export default function Home() {
  const [, setLocation] = useLocation();
  const [userName, setUserName] = useState("Chef");
  const [activeTab, setActiveTab] = useState<"Type" | "Photo" | "Voice">("Type");
  const [ingredients, setIngredients] = useState("");
  const [error, setError] = useState("");
  const [selectedCuisines, setSelectedCuisines] = useState<string[]>([]);
  const [otherCuisine, setOtherCuisine] = useState("");
  const [selectedMeal, setSelectedMeal] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.user_metadata?.name) {
        setUserName(data.user.user_metadata.name.split(" ")[0]);
      }
    });
  }, []);

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

  const handleFindRecipes = async () => {
    if (!ingredients.trim()) {
      setError("Please add at least one ingredient");
      return;
    }
    setError("");
    
    sessionStorage.setItem("current_ingredients_text", ingredients);
    sessionStorage.setItem("current_cuisines", JSON.stringify(selectedCuisines));
    sessionStorage.setItem("current_other_cuisine", otherCuisine);
    sessionStorage.setItem("current_meal", selectedMeal || "");
    
    setLocation("/loading");
  };

  return (
    <div className="p-5 pb-24 flex flex-col gap-6">
      <div className="flex flex-col gap-1 mt-2">
        <h2 className="text-[11px] font-semibold text-olive-mid uppercase tracking-widest">
          Good evening, {userName}
        </h2>
        <h1 className="text-[34px] font-serif text-espresso leading-[1.1] tracking-tight mt-1">
          What's in your <span className="italic text-olive">fridge</span> today?
        </h1>
        <p className="text-[15px] font-sans text-espresso/80 mt-1">
          Tell us your ingredients and we'll find the perfect recipes
        </p>
      </div>

      {/* Tabs */}
      <div className="flex w-full rounded-lg overflow-hidden border border-olive-pale">
        {["Type", "Photo", "Voice"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={`flex-1 py-2.5 text-[13px] font-medium transition-colors ${
              activeTab === tab 
                ? "bg-olive text-white" 
                : "bg-cream text-espresso hover:bg-olive-pale"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Input Area */}
      <div className="bg-white p-3 rounded-xl border border-olive-pale shadow-sm">
        {activeTab === "Type" ? (
          <Textarea 
            placeholder="e.g. chicken breast, garlic, lemon, spinach..." 
            className="min-h-[100px] border-none shadow-none resize-none focus-visible:ring-0 p-1 text-espresso text-[15px]"
            value={ingredients}
            onChange={(e) => {
              setIngredients(e.target.value);
              if (error) setError("");
            }}
          />
        ) : (
          <div className="min-h-[100px] flex items-center justify-center text-sm text-olive-mid font-medium">
            {activeTab} input coming soon...
          </div>
        )}
      </div>

      {/* Staples Box */}
      <div className="bg-olive-pale p-3.5 rounded-r-lg border-l-4 border-olive flex text-[13px] text-olive-mid font-medium leading-relaxed">
        We'll assume you have basic pantry staples — salt, pepper, olive oil, garlic, onions and common spices.
      </div>

      {/* Cuisine Chips */}
      <div className="flex flex-col gap-3 mt-2">
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
      <div className="flex flex-col gap-3 mt-1">
        <div className="grid grid-cols-2 gap-3">
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
      </div>

      {/* CTA Layer */}
      <div className="mt-6 flex flex-col gap-2">
        <Button 
          onClick={handleFindRecipes}
          className="w-full bg-olive hover:bg-olive-mid text-white font-serif text-[18px] h-[52px] rounded-xl shadow-md"
        >
          Find My Recipes →
        </Button>
        {error && (
          <span className="text-red-500 text-[13px] font-medium text-center">{error}</span>
        )}
      </div>
    </div>
  );
}
