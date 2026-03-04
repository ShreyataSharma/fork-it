import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import OpenAI from "openai";
import multer from "multer";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.post("/api/identify-ingredients", upload.array("images", 10), async (req: Request, res: Response) => {
    try {
      const files = req.files as Express.Multer.File[];
      const textIngredients = req.body.ingredients as string | undefined;

      const messages: any[] = [];

      if (files && files.length > 0) {
        const imageContents: any[] = [
          {
            type: "text",
            text: `You are a culinary expert. Look at these fridge/pantry images and identify all visible ingredients. List them clearly, one per line. Only list actual food ingredients and condiments you can see. Be specific (e.g. "chicken breast" not just "meat"). ${textIngredients ? `The user also mentioned they have: ${textIngredients}` : ""}`,
          },
        ];

        for (const file of files) {
          const base64 = file.buffer.toString("base64");
          const mimeType = file.mimetype;
          imageContents.push({
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${base64}`,
            },
          });
        }

        messages.push({ role: "user", content: imageContents });
      } else if (textIngredients) {
        messages.push({
          role: "user",
          content: `The user has these ingredients: ${textIngredients}. List them back clearly, one per line, cleaned up and formatted properly.`,
        });
      } else {
        return res.status(400).json({ error: "No ingredients or images provided" });
      }

      const response = await openai.chat.completions.create({
        model: "gpt-5.2",
        messages,
        max_completion_tokens: 1000,
      });

      const identified = response.choices[0]?.message?.content || "";
      const ingredients = identified
        .split("\n")
        .map((line: string) => line.replace(/^[-•*]\s*/, "").trim())
        .filter((line: string) => line.length > 0);

      res.json({ ingredients });
    } catch (error) {
      console.error("Error identifying ingredients:", error);
      res.status(500).json({ error: "Failed to identify ingredients" });
    }
  });

  app.post("/api/get-recipes", async (req: Request, res: Response) => {
    try {
      const { ingredients, cuisines } = req.body;

      if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
        return res.status(400).json({ error: "Ingredients list is required" });
      }

      const similarCuisines: Record<string, string[]> = {
        "Indian": ["Pakistani", "Sri Lankan", "Bangladeshi", "Nepali"],
        "Asian": ["Chinese", "Japanese", "Korean", "Thai", "Vietnamese", "Filipino", "Malaysian"],
        "Chinese": ["Japanese", "Korean", "Thai", "Vietnamese"],
        "Japanese": ["Korean", "Chinese", "Thai"],
        "Korean": ["Japanese", "Chinese", "Thai", "Vietnamese"],
        "Thai": ["Vietnamese", "Malaysian", "Indonesian", "Filipino"],
        "Mediterranean": ["Greek", "Turkish", "Lebanese", "Moroccan", "Spanish"],
        "French": ["Italian", "Belgian", "Swiss"],
        "Italian": ["French", "Spanish", "Greek"],
        "Mexican": ["Peruvian", "Colombian", "Brazilian", "Latin American"],
        "American": ["Canadian", "Australian", "British"],
        "Spanish": ["Portuguese", "Italian", "Mexican"],
        "Middle Eastern": ["Lebanese", "Turkish", "Persian", "Israeli", "Moroccan"],
        "Greek": ["Turkish", "Lebanese", "Italian", "Mediterranean"],
      };

      const cuisineInstruction = Array.isArray(cuisines) && cuisines.length > 0
        ? (() => {
            const fallbacks = [...new Set(cuisines.flatMap(c => similarCuisines[c] || []))].filter(f => !cuisines.includes(f));
            return `CUISINE CONSTRAINT — follow these rules in order, no exceptions:

SELECTED CUISINES: ${cuisines.join(", ")}

RULE 1: Generate as many recipes as possible using ONLY the selected cuisines above. Spread them evenly across the selections.
RULE 2: If you reach 10 recipes using only the selected cuisines, STOP — do not add any other cuisine. Return exactly those 10.
RULE 3: Only if you cannot reach 10 recipes from the selected cuisines alone, fill the remaining slots using ONLY these similar cuisines: ${fallbacks.length > 0 ? fallbacks.join(", ") : "the closest culturally related cuisines"}. Never use cuisines unrelated to the selection.
RULE 4: Every recipe's "cuisine" field must reflect its actual cuisine — do not label a recipe with a selected cuisine if it belongs to a fallback cuisine.

VIOLATION CHECK: Before returning, verify every recipe belongs to either a selected cuisine or an approved fallback. Remove and replace any that do not.`;
          })()
        : `Generate a diverse mix of cuisines (Italian, Asian, Mexican, American, Indian, Mediterranean, and others).`;

      const prompt = `You are a world-class chef. Based on these main ingredients the user has: ${ingredients.join(", ")}

Generate exactly 10 delicious recipes. Assume the user has standard pantry staples (salt, pepper, olive oil, butter, garlic, onions, basic spices, soy sauce, vinegar, flour, sugar, eggs, milk, common condiments).

${cuisineInstruction}

For each recipe, respond in this EXACT JSON format:
{
  "recipes": [
    {
      "id": 1,
      "name": "Recipe Name",
      "description": "A 1-2 sentence enticing description",
      "prepTime": "15 mins",
      "cookTime": "30 mins",
      "servings": 4,
      "difficulty": "Easy|Medium|Hard",
      "cuisine": "Italian|Asian|Mexican|American|Indian|Mediterranean|etc",
      "mainIngredients": ["ingredient1", "ingredient2"],
      "allIngredients": [
        {"name": "ingredient name", "amount": "2 cups", "userHas": true},
        {"name": "dry mango powder", "amount": "1 tsp", "userHas": false}
      ],
      "steps": [
        "Step 1: ...",
        "Step 2: ..."
      ],
      "tags": ["Quick", "Healthy", "Comfort Food"]
    }
  ]
}

Make recipes varied in cooking methods and difficulty levels. Set userHas to true if the ingredient is in the user's list or is a common pantry staple. Set to false for specialty ingredients they may not have.`;

      const response = await openai.chat.completions.create({
        model: "gpt-5.2",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_completion_tokens: 8192,
      });

      const content = response.choices[0]?.message?.content || "{}";
      const parsed = JSON.parse(content);

      // Post-processing: filter out recipes that don't match selected cuisines or their fallbacks
      if (Array.isArray(cuisines) && cuisines.length > 0 && Array.isArray(parsed.recipes)) {
        const fallbacks = [...new Set(cuisines.flatMap((c: string) => similarCuisines[c] || []))];
        const allowedSet = [...cuisines.map((c: string) => c.toLowerCase()), ...fallbacks.map((f: string) => f.toLowerCase())];
        const filtered = parsed.recipes.filter((r: any) => {
          const rc = (r.cuisine || "").toLowerCase();
          return allowedSet.some(allowed => rc.includes(allowed) || allowed.includes(rc));
        });
        // Only replace if filter removed some recipes (keep original if all pass — preserves order)
        if (filtered.length < parsed.recipes.length) {
          console.log(`[cuisine-filter] Removed ${parsed.recipes.length - filtered.length} off-cuisine recipe(s). Kept ${filtered.length}.`);
          parsed.recipes = filtered;
        }
      }

      res.json(parsed);
    } catch (error) {
      console.error("Error getting recipes:", error);
      res.status(500).json({ error: "Failed to get recipes" });
    }
  });

  app.post("/api/substitution", async (req: Request, res: Response) => {
    try {
      const { ingredient, recipe, context, messages: chatHistory } = req.body;

      const systemPrompt = `You are a friendly, knowledgeable cooking assistant helping someone make a recipe with what they have at home. 
You specialize in ingredient substitutions and cooking tips. Be conversational, warm, and specific.
Keep responses concise but complete. The user is cooking: ${recipe}.

IMPORTANT: Write in plain, natural conversational language only. Do not use any markdown formatting whatsoever — no asterisks, no pound signs, no bullet dashes, no bold, no headers, no lists with symbols. Just write as if you are speaking directly to a friend in the kitchen. Use numbered options inline if listing alternatives, like "1) lemon juice 2) tamarind paste". Never use *, **, #, ##, -, or any other markdown symbols.`;

      const msgs: any[] = [{ role: "system", content: systemPrompt }];

      if (chatHistory && chatHistory.length > 0) {
        msgs.push(...chatHistory);
      }

      if (ingredient && !chatHistory?.length) {
        msgs.push({
          role: "user",
          content: `I don't have ${ingredient}. What can I substitute it with in this recipe? Give me 2-3 practical alternatives with how they affect the dish.`,
        });
      } else if (context) {
        msgs.push({ role: "user", content: context });
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const stream = await openai.chat.completions.create({
        model: "gpt-5.2",
        messages: msgs,
        stream: true,
        max_completion_tokens: 8192,
      });

      for await (const chunk of stream) {
        const raw = chunk.choices[0]?.delta?.content || "";
        if (raw) {
          const content = raw
            .replace(/#{1,6}\s*/g, "")
            .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
            .replace(/_{1,2}([^_]+)_{1,2}/g, "$1")
            .replace(/^\s*[-*+]\s+/gm, "")
            .replace(/^\s*\d+\.\s+/gm, (m) => m.trim().replace(/\.\s*$/, ") "))
            .replace(/`{1,3}([^`]*)`{1,3}/g, "$1")
            .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
          if (content) {
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
          }
        }
      }

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Error getting substitution:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Failed to get substitution" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to get substitution" });
      }
    }
  });

  return httpServer;
}
