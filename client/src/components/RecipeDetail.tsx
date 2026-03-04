import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, Flame, Users, ChefHat, CheckCircle2, XCircle, ArrowLeft, MessageSquare, Send, Loader2, X } from "lucide-react";
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

export default function RecipeDetail({ recipe, onBack }: Props) {
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeIngredient, setActiveIngredient] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const missingIngredients = recipe.allIngredients.filter((ing) => !ing.userHas);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages]);

  const askSubstitution = async (ingredient?: RecipeIngredient) => {
    const ing = ingredient?.name || activeIngredient;
    if (!ing && !chatInput.trim()) return;

    setChatOpen(true);

    const userMessage = ingredient
      ? `What can I substitute for ${ingredient.name} (${ingredient.amount}) in this recipe?`
      : chatInput.trim();

    const newUserMsg: ChatMessage = { role: "user", content: userMessage };
    const newMessages = [...chatMessages, newUserMsg];
    setChatMessages(newMessages);
    setChatInput("");
    setIsStreaming(true);

    try {
      const res = await fetch("/api/substitution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ingredient: ingredient?.name,
          recipe: recipe.name,
          context: ingredient ? undefined : userMessage,
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) throw new Error("Failed");

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantContent = "";

      const assistantMsg: ChatMessage = { role: "assistant", content: "" };
      setChatMessages((prev) => [...prev, assistantMsg]);

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

  const handleSendMessage = async () => {
    if (!chatInput.trim() || isStreaming) return;
    await askSubstitution();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="space-y-6">
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
              <Badge
                variant="outline"
                className={`${difficultyColors[recipe.difficulty] || ""}`}
                data-testid="badge-recipe-difficulty"
              >
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

        {/* Stats row */}
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
              <p className="text-sm font-semibold">{recipe.servings} people</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        {/* Ingredients */}
        <div className="md:col-span-2">
          <div className="bg-card border border-card-border rounded-2xl p-6 shadow-sm">
            <h2 className="font-bold text-lg text-foreground mb-4">Ingredients</h2>
            <div className="space-y-2">
              {recipe.allIngredients.map((ing, idx) => (
                <div
                  key={idx}
                  className={`flex items-center justify-between gap-3 p-2.5 rounded-lg transition-colors ${
                    !ing.userHas ? "bg-red-50 border border-red-100" : "bg-muted/40"
                  }`}
                  data-testid={`row-ingredient-${idx}`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {ing.userHas ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <span className={`text-sm font-medium block ${!ing.userHas ? "text-red-700" : "text-foreground"}`} data-testid={`text-ingredient-name-${idx}`}>
                        {ing.name}
                      </span>
                      <span className="text-xs text-muted-foreground" data-testid={`text-ingredient-amount-${idx}`}>
                        {ing.amount}
                      </span>
                    </div>
                  </div>
                  {!ing.userHas && (
                    <button
                      onClick={() => {
                        setActiveIngredient(ing.name);
                        askSubstitution(ing);
                      }}
                      className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-md flex-shrink-0 hover-elevate active-elevate-2"
                      data-testid={`button-substitute-${idx}`}
                    >
                      Substitute?
                    </button>
                  )}
                </div>
              ))}
            </div>

            {missingIngredients.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground mb-2">
                  Missing {missingIngredients.length} ingredient{missingIngredients.length !== 1 ? "s" : ""}? Ask the AI for substitutes.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-1.5"
                  onClick={() => {
                    setChatOpen(true);
                    if (chatMessages.length === 0) {
                      setChatInput(`I'm missing: ${missingIngredients.map((i) => i.name).join(", ")}. What can I substitute?`);
                    }
                  }}
                  data-testid="button-open-chat"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Ask for substitutions
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
                      <p className="text-xs text-muted-foreground">Ask about substitutions or cooking tips</p>
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

                <ScrollArea className="h-[280px] p-4">
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
                            <span className="text-xs text-primary-foreground font-bold">Y</span>
                          ) : (
                            <ChefHat className="w-4 h-4 text-accent-foreground" />
                          )}
                        </div>
                        <div className={`max-w-[75%] rounded-xl px-3.5 py-2.5 text-sm ${
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground"
                        }`}>
                          <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                          {isStreaming && idx === chatMessages.length - 1 && msg.role === "assistant" && msg.content === "" && (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
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
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Press Enter to send, Shift+Enter for new line
                  </p>
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
            {missingIngredients.length > 0 && (
              <span className="bg-primary-foreground text-primary text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                {missingIngredients.length}
              </span>
            )}
          </Button>
        </motion.div>
      )}
    </div>
  );
}
