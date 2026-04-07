# Fork It Rebuild Plan

## Goal Description
Rebuild the "Fork It" multimodal AI recipe app from scratch using the existing package setup. The app generates customized recipes based on what ingredients the user already has in their fridge. It features a modern, mobile-first design, 4 collaborative AI agents powered by Claude Haiku 4.5, Supabase for backend DB & Auth, and Vercel for hosting.

## User Review Required
> [!IMPORTANT]
> Please review the project structure cleanup:
> - I will keep the base Vite/Express setup but delete all existing application logic (routes, components, schemas) that do not fit the new spec.
> - We have Drizzle ORM currently installed. Do you want me to keep using Drizzle to interact with the new Supabase Postgres database, or switch to using the official `@supabase/supabase-js` client completely for both Auth and Database interactions? I recommend using `@supabase/supabase-js` for simplicity unless you specifically want a Drizzle SQL layer.
> - Should I generate the SQL script to create the Supabase tables, or will you set them up manually in the Supabase dashboard?

## Proposed Changes

### 1. Cleanup Step
- **Keep**: `package.json`, `.config/`, `vite.config.ts`, `tailwind.config.ts`, `postcss.config.js`, `tsconfig.json`.
- **Modify**:
  - `client/src/App.tsx`, `client/src/main.tsx` (reset layout)
  - `server/index.ts` (remove unneeded setup)
- **Delete**: 
  - Everything inside `client/src/pages/` and old components.
  - `server/routes.ts`, `server/storage.ts`.
  - `shared/schema.ts` (will be recreated if using Drizzle, or deleted if using Supabase standard client).

### 2. File Organization Plan
```
/client/src/
  /components/     # UI design system components (buttons, cards, layout, drawer)
  /lib/            # Supabase client setup, API helper functions
  /pages/          # React components corresponding to Screens 1-7
  /hooks/          # Custom hooks (auth, data fetching)
  /assets/         # Fonts, icons, static illustrations

/server/
  /agents/         # Logic for the 4 AI Agents calling Anthropic/APIs
  /routes/         # Express API route handlers mapped to Agents & DB
  /lib/            # Supabase admin client, utility functions
```

### 3. Build Order
1. **Infrastructure & Auth**: Setup environment variables, configure the global design system (fonts, colors in Tailwind), initialize Supabase client, and build **Screen 1 (Auth)**.
2. **Layout & Navigation**: Create the responsive mobile-first shell and the Hamburger Drawer.
3. **Core Agents & API Foundation**: Write the Express endpoints for Agent 1 (Parser), Agent 2 (Curator), and Agent 4 (Fallback). Connect to Spoonacular and TheMealDB.
4. **Input & Results**: Build **Screen 2 (Input)**, **Screen 2.5 (Loading Animation)**, and **Screen 3 (Results Grid)**.
5. **Recipe Deep Dive & Chat**: Build **Screen 4 (Recipe Detail)** and implement Agent 3 (Sous Chef streaming responses). 
6. **Social & Personal**: Develop **Screen 5 (Saved)**, **Screen 6 (Explore)**, and **Screen 7 (Profile)**.

## Verification Plan
### Automated Tests
- Type checking with `tsc`.
- Linter checks if available. 

### Manual Verification
- After we finish step 1, we will test the local dev server and ensure login/signup flows work with Supabase locally.
- For each UI screen, we will visually verify the specific style guidelines (e.g. olive green accents, Georgia headers, Pinterest grid layout).
- We will test all multimodal inputs (text, and mocked image/audio if browser tools don't natively support easy uploads via tests).
- We will manually trigger a chat query with the "Sous Chef" to ensure the streaming connection works end-to-end.
