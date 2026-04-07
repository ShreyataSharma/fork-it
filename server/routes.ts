import { Express } from "express";
import { Server } from "http";
import { getCleanIngredients, getCuratedRecipes, proxySousChefChat } from "./agents";

export async function registerRoutes(httpServer: Server, app: Express) {
  // Agent 1: Parse Text/Image into ingredients
  app.post("/api/parse-ingredients", async (req, res) => {
    try {
      const { text, imageBase64 } = req.body;
      const ingredients = await getCleanIngredients(text, imageBase64);
      res.json({ ingredients });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  // Agent 2 & Agent 4: Curate/Generate the dynamic top 10 recipes
  app.post("/api/get-recipes", async (req, res) => {
    try {
      const { ingredients } = req.body;
      if (!Array.isArray(ingredients)) {
        return res.status(400).json({ error: "ingredients must be an array" });
      }
      const recipes = await getCuratedRecipes(ingredients);
      res.json({ recipes });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  // Agent 3: Sous Chef Streaming endpoint
  app.post("/api/substitution", proxySousChefChat);
}
