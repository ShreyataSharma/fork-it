import { Express } from "express";
import { Server } from "http";
import { getCuratedRecipes, proxySousChefChat } from "./agents";
import { parseRouter } from "./routes/parse";

export async function registerRoutes(httpServer: Server, app: Express) {
  app.use(parseRouter);

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
