import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, Flame, Users, ChefHat, CheckCircle2, ArrowLeft, MessageSquare, Send, Loader2, X, ShoppingBag, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Recipe, RecipeIngredient } from "@/pages/home";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  recipe: Recipe;
  onBack: () => void;
}

const difficultyColors: Record<string, string> = {
  Easy: "bg-green-100 text-green-700 border-green-200",
  Medium: "bg-amber-100 text-amber-700 border-amber-200",
  Hard: "bg-red-100 text-red-700 border-red-200",
};

function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s+/gm, "")
    .replace(/\*{3}(.+?)\*{3}/gs, "$1")
    .replace(/\*{2}(.+?)\*{2}/gs, "$1")
    .replace(/\*(.+?)\*/gs, "$1")
    .replace(/_{2}(.+?)_{2}/gs, "$1")
    .replace(/_(.+?)_/gs, "$1")
    .replace(/`{3}[\s\S]*?`{3}/g, "")
    .replace(/`(.+?)`/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*(\d+)\.\s+/gm, "$1) ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*+/g, "")
    .replace(/_{2,}/g, "")
    .replace(/^#+\s*/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const ALWAYS_SKIP = [
  "salt", "pepper", "black pepper", "white pepper", "sea salt", "kosher salt",
  "water", "ice", "ice water", "tap water",
];

function isAlwaysSkip(name: string): boolean {
  const lower = name.toLowerCase().trim();
  if (lower.includes("oil")) return true;
  return ALWAYS_SKIP.some((s) => lower === s || lower.startsWith(s + " ") || lower.endsWith(" " + s));
}

function isUserIngredient(name: string, mainIngredients: string[] | undefined): boolean {
  if (!Array.isArray(mainIngredients)) return false;
  const lower = name.toLowerCase();
  return mainIngredients.some((main) => {
    const m = main.toLowerCase();
    return lower === m || lower.includes(m) || m.includes(lower.split(/[\s,(]/)[0]);
  });
}

function canSubstitute(ing: RecipeIngredient, mainIngredients: string[] | undefined): boolean {
  if (isAlwaysSkip(ing.name)) return false;
  if (isUserIngredient(ing.name, mainIngredients)) return false;
  return true;
}

// ── Serving scaler ──────────────────────────────────────────────────────────

const NO_SCALE_KEYWORDS = ["to taste", "as needed", "pinch", "a pinch", "handful", "a handful", "optional", "for garnish", "garnish"];

function parseFraction(s: string): number | null {
  const t = s.trim();
  const mixed = t.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return +mixed[1] + +mixed[2] / +mixed[3];
  const frac = t.match(/^(\d+)\/(\d+)$/);
  if (frac) return +frac[1] / +frac[2];
  const n = parseFloat(t);
  return isNaN(n) ? null : n;
}

function formatNumber(n: number): string {
  if (n <= 0) return "0";
  const rounded = Math.round(n * 100) / 100;
  const str = rounded.toFixed(2);
  return str.replace(/\.?0+$/, "");
}

function scaleAmount(amount: string, scale: number): string {
  if (scale === 1) return amount;
  const lower = amount.toLowerCase();
  if (NO_SCALE_KEYWORDS.some((k) => lower.includes(k))) return amount;

  // Range like "3-4" or "2–3"
  const rangeMatch = amount.match(/^([\d ./]+?)\s*[-–]\s*([\d ./]+)([\s\S]*)$/);
  if (rangeMatch) {
    const lo = parseFraction(rangeMatch[1]);
    const hi = parseFraction(rangeMatch[2]);
    if (lo !== null && hi !== null) {
      return `${formatNumber(lo * scale)}–${formatNumber(hi * scale)}${rangeMatch[3]}`;
    }
  }

  // Leading number: integer, decimal, fraction, or mixed  e.g. "1 1/2 cups"
  const numMatch = amount.match(/^((?:\d+\s+)?\d+(?:[./]\d+)?)\s*([\s\S]*)$/);
  if (numMatch) {
    const n = parseFraction(numMatch[1]);
    if (n !== null) {
      const rest = numMatch[2].trim();
      return rest ? `${formatNumber(n * scale)} ${rest}` : formatNumber(n * scale);
    }
  }

  return amount;
}

// ────────────────────────────────────────────────────────────────────────────

export default function RecipeDetail({ recipe, onBack }: Props) {
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedIngredients, setSelectedIngredients] = useState<Set<string>>(new Set());
  const [servings, setServings] = useState(recipe.servings);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scale = servings / recipe.servings;
  const substitutableIngredients = recipe.allIngredients.filter((ing) => canSubstitute(ing, recipe.mainIngredients));

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages]);

  const toggleIngredient = (name: string) => {
    setSelectedIngredients((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const streamSubstitution = async (userMessage: string, historyMessages: ChatMessage[]) => {
    const newUserMsg: ChatMessage = { role: "user", content: userMessage };
    const newMessages = [...historyMessages, newUserMsg];
    setChatMessages(newMessages);
    setChatInput("");
    setIsStreaming(true);
    setChatOpen(true);

    try {
      const res = await fetch("/api/substitution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipe: recipe.name,
          context: userMessage,
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) throw new Error("Failed");

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantContent = "";

      setChatMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.content) {
              assistantContent += event.content;
              setChatMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: assistantContent };
                return updated;
              });
            }
          } catch {}
        }
      }
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, I couldn't get a substitution suggestion right now. Please try again." },
      ]);
    } finally {
      setIsStreaming(false);
    }
  };

  const askSingleSubstitute = (ing: RecipeIngredient) => {
    const msg = `I don't have ${ing.name} (${ing.amount}). What can I substitute for it in this recipe?`;
    streamSubstitution(msg, chatMessages);
  };

  const askSelectedSubstitutes = () => {
    if (selectedIngredients.size === 0) return;
    const selected = recipe.allIngredients.filter((ing) => selectedIngredients.has(ing.name));
    const list = selected.map((ing) => `${ing.name} (${ing.amount})`).join(", ");
    const msg =
      selected.length === 1
        ? `I don't have ${list}. What can I substitute for it?`
        : `I don't have these ingredients: ${list}. Can you suggest substitutes for each of them?`;
    streamSubstitution(msg, chatMessages);
    setSelectedIngredients(new Set());
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || isStreaming) return;
    await streamSubstitution(chatInput.trim(), chatMessages);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="space-y-6 pb-28">
      {/* Header */}
      <div className="bg-card border border-card-border rounded-2xl p-6 shadow-sm">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4 hover-elevate active-elevate-2 rounded-md px-2 py-1 -ml-2"
          data-testid="button-back-recipes"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to recipes
        </button>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1">
            <div className="flex flex-wrap gap-2 mb-2">
              <Badge variant="outline" className={difficultyColors[recipe.difficulty] || ""} data-testid="badge-recipe-difficulty">
                {recipe.difficulty}
              </Badge>
              <Badge variant="outline" className="text-muted-foreground" data-testid="badge-recipe-cuisine">
                {recipe.cuisine}
              </Badge>
              {recipe.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs" data-testid={`badge-tag-${tag}`}>
                  {tag}
                </Badge>
              ))}
            </div>
            <h1 className="text-3xl font-bold text-foreground mb-2" data-testid="text-recipe-title">
              {recipe.name}
            </h1>
            <p className="text-muted-foreground text-base" data-testid="text-recipe-description">
              {recipe.description}
            </p>
          </div>
          <div className="w-16 h-16 rounded-2xl bg-accent flex items-center justify-center flex-shrink-0">
            <ChefHat className="w-9 h-9 text-primary" />
          </div>
        </div>

        <div className="flex flex-wrap gap-6 mt-5 pt-5 border-t border-border">
          <div className="flex items-center gap-2" data-testid="text-detail-prep">
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
              <Clock className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Prep time</p>
              <p className="text-sm font-semibold">{recipe.prepTime}</p>
            </div>
          </div>
          <div className="flex items-center gap-2" data-testid="text-detail-cook">
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
              <Flame className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Cook time</p>
              <p className="text-sm font-semibold">{recipe.cookTime}</p>
            </div>
          </div>
          <div className="flex items-center gap-2" data-testid="text-detail-servings">
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
              <Users className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Servings</p>
              <div className="flex items-center gap-2 mt-0.5">
                <button
                  onClick={() => setServings((s) => Math.max(1, s - 1))}
                  disabled={servings <= 1}
                  className="w-6 h-6 rounded-full border border-border flex items-center justify-center text-muted-foreground hover-elevate active-elevate-2 disabled:opacity-30 disabled:cursor-not-allowed"
                  data-testid="button-decrease-servings"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <span className="text-sm font-semibold min-w-[2ch] text-center" data-testid="text-servings-count">
                  {servings}
                </span>
                <button
                  onClick={() => setServings((s) => Math.min(50, s + 1))}
                  disabled={servings >= 50}
                  className="w-6 h-6 rounded-full border border-border flex items-center justify-center text-muted-foreground hover-elevate active-elevate-2 disabled:opacity-30 disabled:cursor-not-allowed"
                  data-testid="button-increase-servings"
                >
                  <Plus className="w-3 h-3" />
                </button>
                {scale !== 1 && (
                  <button
                    onClick={() => setServings(recipe.servings)}
                    className="text-xs text-primary underline underline-offset-2 hover-elevate active-elevate-2"
                    data-testid="button-reset-servings"
                  >
                    reset
                  </button>
                )}
              </div>
              {scale !== 1 && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  (default: {recipe.servings})
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        {/* Ingredients */}
        <div className="md:col-span-2">
          <div className="bg-card border border-card-border rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between gap-2 mb-1">
              <h2 className="font-bold text-lg text-foreground">Ingredients</h2>
              {substitutableIngredients.length > 0 && (
                <span className="text-xs text-muted-foreground">Tick what you're missing</span>
              )}
            </div>

            {substitutableIngredients.length > 0 && (
              <p className="text-xs text-muted-foreground mb-3">
                Select ingredients below or click "Substitute?" on any one to ask the AI for alternatives.
              </p>
            )}

            <div className="space-y-2">
              {recipe.allIngredients.map((ing, idx) => {
                const substitutable = canSubstitute(ing, recipe.mainIngredients);
                const isSelected = selectedIngredients.has(ing.name);
                const isOwn = isUserIngredient(ing.name, recipe.mainIngredients);
                const isSkip = isAlwaysSkip(ing.name);

                let rowClass = "bg-muted/40";
                if (isSelected) rowClass = "bg-primary/10 border border-primary/30";
                else if (isOwn) rowClass = "bg-green-50 border border-green-100";
                else if (!isSkip && !ing.userHas) rowClass = "bg-amber-50 border border-amber-100";

                return (
                  <div
                    key={idx}
                    className={`flex items-center gap-3 p-2.5 rounded-lg transition-colors ${rowClass}`}
                    data-testid={`row-ingredient-${idx}`}
                  >
                    {/* Checkbox for substitutable items, lock for user's own, dot for basics */}
                    {substitutable ? (
                      <button
                        onClick={() => toggleIngredient(ing.name)}
                        className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border-2 transition-colors ${
                          isSelected
                            ? "bg-primary border-primary"
                            : "border-muted-foreground/40 hover:border-primary"
                        }`}
                        data-testid={`checkbox-ingredient-${idx}`}
                        aria-label={`Select ${ing.name} for substitution`}
                      >
                        {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-primary-foreground" />}
                      </button>
                    ) : (
                      <CheckCircle2
                        className={`w-5 h-5 flex-shrink-0 ${isOwn ? "text-green-500" : "text-muted-foreground/25"}`}
                      />
                    )}

                    {/* Name + amount */}
                    <div className="min-w-0 flex-1">
                      <span
                        className={`text-sm font-medium block ${
                          isSelected ? "text-primary"
                          : isOwn ? "text-green-800"
                          : !ing.userHas && !isSkip ? "text-amber-800"
                          : "text-foreground"
                        }`}
                        data-testid={`text-ingredient-name-${idx}`}
                      >
                        {ing.name}
                        {isOwn && <span className="ml-1.5 text-xs font-normal text-green-600">(your ingredient)</span>}
                      </span>
                      <span className="text-xs text-muted-foreground" data-testid={`text-ingredient-amount-${idx}`}>
                        {scaleAmount(ing.amount, scale)}
                      </span>
                    </div>

                    {/* Single substitute button */}
                    {substitutable && (
                      <button
                        onClick={() => askSingleSubstitute(ing)}
                        className={`text-xs px-2 py-1 rounded-md flex-shrink-0 hover-elevate active-elevate-2 transition-colors ${
                          isSelected
                            ? "bg-primary/20 text-primary"
                            : !ing.userHas
                            ? "bg-amber-100 text-amber-800"
                            : "bg-muted text-muted-foreground"
                        }`}
                        data-testid={`button-substitute-${idx}`}
                      >
                        Substitute?
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Multi-select action */}
            {substitutableIngredients.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-xs text-muted-foreground">
                    {selectedIngredients.size > 0
                      ? `${selectedIngredients.size} ingredient${selectedIngredients.size !== 1 ? "s" : ""} selected`
                      : "Or ask about all missing at once"}
                  </p>
                  {selectedIngredients.size > 0 && (
                    <button
                      onClick={() => setSelectedIngredients(new Set())}
                      className="text-xs text-muted-foreground hover-elevate active-elevate-2 rounded px-1"
                      data-testid="button-clear-selection"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <Button
                  variant={selectedIngredients.size > 0 ? "default" : "outline"}
                  size="sm"
                  className="w-full gap-1.5"
                  onClick={
                    selectedIngredients.size > 0
                      ? askSelectedSubstitutes
                      : () => {
                          const all = substitutableIngredients.map((i) => i.name);
                          setSelectedIngredients(new Set(all));
                        }
                  }
                  disabled={isStreaming}
                  data-testid="button-ask-substitutes"
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  {selectedIngredients.size > 0
                    ? `Ask for ${selectedIngredients.size} substitute${selectedIngredients.size !== 1 ? "s" : ""}`
                    : "Select all missing"}
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Steps */}
        <div className="md:col-span-3">
          <div className="bg-card border border-card-border rounded-2xl p-6 shadow-sm">
            <h2 className="font-bold text-lg text-foreground mb-4">Instructions</h2>
            <div className="space-y-4">
              {recipe.steps.map((step, idx) => {
                const stepText = step.replace(/^Step\s*\d+:\s*/i, "");
                return (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="flex gap-4"
                    data-testid={`step-${idx}`}
                  >
                    <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0 text-sm font-bold mt-0.5">
                      {idx + 1}
                    </div>
                    <p className="text-sm text-foreground leading-relaxed pt-1" data-testid={`text-step-${idx}`}>
                      {stepText}
                    </p>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* AI Chat panel */}
      <AnimatePresence>
        {chatOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
          >
            <Card className="border-card-border shadow-md" data-testid="panel-ai-chat">
              <CardContent className="p-0">
                <div className="flex items-center justify-between p-4 border-b border-border">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                      <MessageSquare className="w-4 h-4 text-primary-foreground" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-foreground">Chef Assistant</h3>
                      <p className="text-xs text-muted-foreground">Substitutions and cooking tips</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setChatOpen(false)}
                    className="text-muted-foreground hover-elevate active-elevate-2 rounded-md p-1"
                    data-testid="button-close-chat"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <ScrollArea className="h-[300px] p-4">
                  {chatMessages.length === 0 && (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <ChefHat className="w-10 h-10 text-muted-foreground/40 mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">
                          Ask me about ingredient substitutions, cooking tips, or anything about this recipe!
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="space-y-3">
                    {chatMessages.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                        data-testid={`chat-message-${idx}`}
                      >
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                          msg.role === "user" ? "bg-primary" : "bg-accent"
                        }`}>
                          {msg.role === "user" ? (
                            <span className="text-xs text-primary-foreground font-bold">You</span>
                          ) : (
                            <ChefHat className="w-4 h-4 text-accent-foreground" />
                          )}
                        </div>
                        <div className={`max-w-[78%] rounded-xl px-3.5 py-2.5 text-sm ${
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground"
                        }`}>
                          {msg.content ? (
                            <p className="whitespace-pre-wrap leading-relaxed">{stripMarkdown(msg.content)}</p>
                          ) : (
                            isStreaming && <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          )}
                        </div>
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>
                </ScrollArea>

                <div className="p-4 border-t border-border">
                  <div className="flex gap-2">
                    <Textarea
                      ref={textareaRef}
                      placeholder="Ask about a substitution or cooking tip..."
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      className="min-h-[44px] max-h-[120px] text-sm resize-none"
                      disabled={isStreaming}
                      data-testid="input-chat"
                    />
                    <Button
                      size="icon"
                      onClick={handleSendMessage}
                      disabled={!chatInput.trim() || isStreaming}
                      data-testid="button-send-chat"
                    >
                      {isStreaming ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5">Press Enter to send, Shift+Enter for new line</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating chat button */}
      {!chatOpen && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="fixed bottom-6 right-6 z-10"
        >
          <Button
            size="lg"
            onClick={() => setChatOpen(true)}
            className="gap-2 rounded-full shadow-lg"
            data-testid="button-floating-chat"
          >
            <MessageSquare className="w-5 h-5" />
            Ask Chef AI
            {chatMessages.length > 0 && (
              <span className="bg-primary-foreground text-primary text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                {Math.floor(chatMessages.filter((m) => m.role === "assistant").length)}
              </span>
            )}
          </Button>
        </motion.div>
      )}
    </div>
  );
}
