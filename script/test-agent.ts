import dotenv from "dotenv";
dotenv.config();
import { getCuratedRecipes } from "../server/agents";

(async () => {
  const recipes = await getCuratedRecipes(["chicken", "broccoli", "garlic"]);
  console.log(JSON.stringify(recipes, null, 2));
})();
