# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   └── api-server/         # Express API server
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /health` (full path: `/api/health`)
- Depends on: `@workspace/db`, `@workspace/api-zod`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/index.cjs`)
- Build bundles an allowlist of deps (express, cors, pg, drizzle-orm, zod, etc.) and externalizes the rest

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `src/schema/<modelname>.ts` — table definitions with `drizzle-zod` insert schemas (no models definitions exist right now)
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`, automatically provided by Replit)
- Exports: `.` (pool, db, schema), `./schema` (schema only)

Production migrations are handled by Replit when publishing. In development, we just use `pnpm --filter @workspace/db run push`, and we fallback to `pnpm --filter @workspace/db run push-force`.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec (e.g. `HealthCheckResponse`). Used by `api-server` for response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec (e.g. `useHealthCheck`, `healthCheck`).

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.

### `artifacts/monopoly-game` (`@workspace/monopoly-game`)

Full-featured Monopoly Online multiplayer game. Architecture:

- **Frontend**: Vite + React (for routing/redirect only) + vanilla JS game in `public/game/`
  - `public/game/index.html` — main game HTML (loaded via redirect from React App.tsx)
  - `public/game/game.js` — full game engine client (~1965 lines)
  - `public/game/game.css` — vibrant dark theme styling with 8 group colors
  - `src/App.tsx` — simple redirect to `/game/index.html`
- **Backend**: Node.js + Express + Socket.IO server (`server/server.js`, `server/engine.js`)
  - Runs on port 8001 (GAME_PORT env var)
  - Engine: `server/engine.js` — 27 countries, city prices $20–$510, railways, airports, hazards, surprises, full bank/auction logic (complete ES module port from Python)
- **Startup**: `pnpm run dev` launches Node.js backend (port 8001) then Vite (PORT env var)
- **Proxy**: Vite proxies `/socket.io/` (ws:true, secure:false) and `/mapi/` to Node.js backend on port 8001
  - NOTE: `/api/` prefix is claimed by the api-server artifact (Express), so the monopoly game uses `/mapi/` prefix for all REST routes
  - Countries API returns `base` field so client can compute city price = `base + index * 10`

**Key features**: 27 countries, real-time Socket.IO multiplayer, map editor (drag & drop), bank system (full modal with tabs), custom avatars, 8 board types (standard/worldwide/random/domestic), railways, airports, hazards (dedicated modal with insurance claim), auctions (SVG countdown ring), surprise card flip animation, gov protection modal, credit-card property purchase, votekick, spectator mode, reconnection grace (2 min), 8 themes.

**City prices**: `price = country.base + cityIndex * 10` — lowest $20 (Nigeria tier 1, city 0), highest ~$510 (Singapore tier 6, city 14).

**Bank modal**: Full overlay (`m-bank`) with 4 tabs (Deposits, Loans, Credit Card, Insurance). Opened by clicking "🏦 Bank" header in right sidebar. Sidebar keeps mini balance summary.

**Event modals**: `m-haz` for hazard events (themed icons, insurance claim button), `m-surp` for surprise events (card-flip animation), `m-gov` for government protection events.

- `pnpm --filter @workspace/monopoly-game run dev` — starts both Node.js backend and Vite dev server
