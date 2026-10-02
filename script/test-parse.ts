// Step 2 test: POST /api/parse against a real in-process server and live Haiku.
// Run with: npx tsx script/test-parse.ts
import express from "express";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { parseRouter } from "../server/routes/parse";

const CASES = [
  { name: "text list", text: "chicken breast, broccoli, rice, eggs, olive oil, cheddar" },
  {
    name: "messy sentence",
    text: "ok so i've got like 2 tomatoes, some leftover basmati rice from yesterday, half a bag of baby spinach, a couple garlic cloves and uh salt and pepper obviously",
  },
  { name: "non-food", text: "Can you help me fix my Python code? It keeps throwing a KeyError." },
];

async function main() {
  const app = express();
  app.use(express.json());
  app.use(parseRouter);
  const server: Server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;

  let failed = false;
  for (const c of CASES) {
    console.log(`=== ${c.name} ===`);
    console.log(`input: ${c.text}`);
    const res = await fetch(`http://localhost:${port}/api/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: c.text }),
    });
    const body = await res.json();
    console.log(`status: ${res.status}`);
    console.log(JSON.stringify(body, null, 2), "\n");
    if (!res.ok) failed = true;
  }

  server.close();
  process.exit(failed ? 1 : 0);
}

main();
