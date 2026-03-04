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
      const { ingredients } = req.body;

      if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
        return res.status(400).json({ error: "Ingredients list is required" });
      }

      const prompt = `You are a world-class chef. Based on these main ingredients the user has: ${ingredients.join(", ")}

Generate exactly 10 diverse, delicious recipes. Assume the user has standard pantry staples (salt, pepper, olive oil, butter, garlic, onions, basic spices, soy sauce, vinegar, flour, sugar, eggs, milk, common condiments).

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

Make recipes varied - different cuisines, cooking methods, difficulty levels. Set userHas to true if the ingredient is in the user's list or is a common pantry staple. Set to false for specialty ingredients they may not have.`;

      const response = await openai.chat.completions.create({
        model: "gpt-5.2",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_completion_tokens: 8192,
      });

      const content = response.choices[0]?.message?.content || "{}";
      const parsed = JSON.parse(content);

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
You specialize in ingredient substitutions and cooking tips. Be conversational, helpful, and specific. 
Keep responses concise but complete. The user is cooking: ${recipe}.`;

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
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
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
