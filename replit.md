# Replit.md

## Overview

This is an AI-powered recipe suggestion app called "What's in My Fridge?" (or similar). Users can upload photos of their fridge/pantry or type in ingredients they have, and the app uses OpenAI's vision capabilities to identify ingredients and suggest recipes. Users can then browse recipes, view detailed instructions, and chat with an AI assistant about specific recipes for cooking tips and substitutions.

Key features:
- Image upload (drag-and-drop or file picker) for ingredient identification via OpenAI Vision
- Manual text-based ingredient entry
- Cuisine filter/preference selection
- AI-generated recipe suggestions displayed in a grid
- Detailed recipe view with ingredients, steps, and difficulty/time info
- In-recipe AI chat assistant for cooking questions
- Shopping list for missing ingredients

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Full-Stack TypeScript Monorepo

The project uses a single repo with three main areas:
- `client/` — React frontend (Vite)
- `server/` — Express backend (Node.js)
- `shared/` — Shared types and database schema used by both sides

This avoids code duplication and keeps types consistent between frontend and backend.

### Frontend Architecture

- **Framework**: React with TypeScript, bundled by Vite
- **Routing**: Wouter (lightweight alternative to React Router)
- **State/Data fetching**: TanStack React Query for server state, local React state for UI
- **UI Components**: shadcn/ui (built on Radix UI primitives) with Tailwind CSS for styling
- **Animations**: Framer Motion for page transitions and card animations
- **Forms**: React Hook Form with Zod validation via `@hookform/resolvers`
- **Theme**: Custom warm/neutral color palette (orange primary, cream background) defined via CSS variables in `index.css`; supports dark mode via Tailwind's class strategy

The app has a single-page flow managed by a `View` state type (`"input" | "ingredients" | "recipes" | "detail"`) in the home page component rather than separate routes. This keeps navigation simple without URL changes.

### Backend Architecture

- **Framework**: Express.js on Node.js with TypeScript
- **Entry point**: `server/index.ts` creates an HTTP server and registers routes
- **Development**: Vite dev server runs as Express middleware (HMR via WebSocket at `/vite-hmr`)
- **Production**: Static files served from `dist/public/`, built via a custom `script/build.ts` that runs Vite for the client and esbuild for the server

**Route structure** (`server/routes.ts`):
- `POST /api/identify-ingredients` — accepts multipart image uploads (up to 10 images, 20MB each) via Multer and sends them to OpenAI Vision to identify ingredients; also accepts plain text ingredients
- Additional recipe generation endpoints are implied by the frontend's fetch calls

**Replit Integrations** (under `server/replit_integrations/` and `client/replit_integrations/`):
- `chat/` — Conversation and message storage + CRUD API routes
- `audio/` — Voice recording, PCM16 audio streaming, speech-to-text, text-to-speech via OpenAI Realtime-style streaming with AudioWorklet
- `image/` — Image generation via OpenAI `gpt-image-1`
- `batch/` — Generic batch processing with rate limiting (`p-limit`) and retry logic (`p-retry`)

### Data Storage

- **Database**: PostgreSQL via Drizzle ORM (`drizzle-orm/node-postgres`)
- **Schema** (`shared/schema.ts` + `shared/models/chat.ts`):
  - `users` table: `id` (UUID), `username`, `password`
  - `conversations` table: `id` (serial), `title`, `createdAt`
  - `messages` table: `id` (serial), `conversationId` (FK → conversations with cascade delete), `role`, `content`, `createdAt`
- **Migrations**: Drizzle Kit manages migrations in `./migrations/`, run via `npm run db:push`
- **In-memory fallback**: `server/storage.ts` exports a `MemStorage` class for users; currently the app uses this for user storage while chat uses the actual DB

### Authentication

A basic `users` table with username/password exists in the schema, and `connect-pg-simple` + `express-session` are listed as dependencies, suggesting session-based auth is planned or partially implemented but not fully wired in the visible code.

### Build & Deployment

- **Dev**: `tsx server/index.ts` — runs server directly with TypeScript via tsx
- **Build**: Custom `script/build.ts` — Vite builds the client to `dist/public/`, esbuild bundles the server to `dist/index.cjs` with selected deps inlined (to speed up cold starts)
- **Start**: `node dist/index.cjs` for production

### Path Aliases

| Alias | Resolves to |
|-------|-------------|
| `@/*` | `client/src/*` |
| `@shared/*` | `shared/*` |
| `@assets/*` | `attached_assets/*` |

## External Dependencies

### AI / OpenAI
- **OpenAI SDK** (`openai` package) — used for:
  - Vision API: identify ingredients from images (`POST /api/identify-ingredients`)
  - Chat completions: recipe generation and in-recipe chat assistant
  - Image generation: `gpt-image-1` model via `/api/generate-image`
  - Speech-to-text and text-to-speech for voice features
- **Environment variables required**:
  - `AI_INTEGRATIONS_OPENAI_API_KEY` — OpenAI API key
  - `AI_INTEGRATIONS_OPENAI_BASE_URL` — Base URL (allows routing through Replit's AI proxy)

### Database
- **PostgreSQL** — primary data store
- **Environment variable required**: `DATABASE_URL` — PostgreSQL connection string
- **Drizzle ORM** + **Drizzle Kit** — type-safe query builder and migration tool

### File Uploads
- **Multer** — handles multipart/form-data for image uploads, stored in memory (not disk)

### Session / Auth
- **express-session** + **connect-pg-simple** — session management backed by PostgreSQL

### Replit-Specific
- `@replit/vite-plugin-runtime-error-modal` — shows runtime errors as overlays in dev
- `@replit/vite-plugin-cartographer` — Replit's code navigation tool (dev only)
- `@replit/vite-plugin-dev-banner` — Replit dev banner (dev only)

### Frontend Libraries
- **Radix UI** — accessible, unstyled component primitives (full suite)
- **Tailwind CSS** — utility-first CSS
- **Framer Motion** — animations
- **Wouter** — client-side routing
- **TanStack React Query** — server state management
- **React Dropzone** — drag-and-drop file upload
- **date-fns** — date formatting
- **Recharts** — charting (available via shadcn/ui chart component)
- **Embla Carousel** — carousel component
- **Vaul** — drawer/bottom sheet component
- **cmdk** — command palette

### Backend Utilities
- **p-limit** + **p-retry** — concurrency control and retry logic for batch AI operations
- **nanoid** — unique ID generation
- **ws** — WebSocket support