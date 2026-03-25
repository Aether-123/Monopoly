# Monopsony :- A Monopoly Alternative

Real-time multiplayer Monopoly-style strategy game with custom boards, bank systems, events, auctions, and live trading.

## What this project contains

This repository is a pnpm workspace. The game lives in:

- `artifacts/monopoly-game/public/game/` → main game client (`index.html`, `game.js`, `game.css`)
- `artifacts/monopoly-game/server/` → multiplayer backend (`server.js`, `engine.js`)

Other workspace packages (`artifacts/api-server`, `lib/*`, `scripts`) are separate monorepo modules.

## Core game features

- Real-time multiplayer via Socket.IO
- Public/private room system + quick match + browse rooms
- Multiple board modes:
  - Standard
  - Worldwide
  - Random (seeded)
  - Domestic presets (India / UK / USA)
- Property systems:
  - Countries/cities
  - Airports
  - Railways
  - Utilities/companies
- Auctions, banking, insurance, hazards, surprise cards
- Reconnect grace timer, spectator support, votekick
- Lobby host controls, host reassignment on disconnect
- Post-game restart options (same board or choose different board)

## Trading system (current behavior)

- Direct player-to-player trade offers (money + properties)
- Counter-offers between involved players
- Public trade visibility to room
- Third-party chip-ins:
  - A chipper can target Player A, Player B, or both
  - Multiple players can chip in on the same active trade
  - Parallel negotiations are supported
- Server-side canonical trade state (`activeTrades`) is used for execution
- Transfer execution logs are emitted by server:
  - `[TRADE_EXEC] ... type=direct ...`
  - `[TRADE_EXEC] ... type=chipin ...`

## Tech stack

- Node.js (ESM)
- Express
- Socket.IO
- Vite (frontend build/dev)
- pnpm workspaces

## Requirements

- Node.js 24+
- pnpm

## Install

From repository root:

```bash
pnpm install
```

## Run the game

### Option A: Start game package server script

```bash
pnpm --filter @workspace/monopoly-game run start
```

Then open:

- `http://127.0.0.1:8011`

### Option B: Windows PowerShell explicit host/port

```powershell
$env:GAME_HOST='127.0.0.1'
$env:GAME_PORT='8011'
node .\artifacts\monopoly-game\server\server.js
```

If `8011` is occupied, free the port or choose another value for `GAME_PORT`.

## Development scripts

From repo root:

- Typecheck workspace:

```bash
pnpm run typecheck
```

- Build workspace:

```bash
pnpm run build
```

From game package (`artifacts/monopoly-game`):

- `pnpm run start` → backend server
- `pnpm run build` → Vite production build
- `pnpm run serve` → preview built frontend

## Networking/API notes

- Frontend static assets are served by game server.
- Socket endpoint: `/socket.io/`
- Game REST endpoints use `/mapi/*` (board/countries/rooms related routes)

## Project layout (game-focused)

```text
artifacts/monopoly-game/
├── public/game/
│   ├── index.html        # Main UI shell + modals
│   ├── game.js           # Main client game logic
│   ├── game.css          # Styling and responsive layout
│   └── flags/            # Flag assets
├── server/
│   ├── server.js         # Express + Socket.IO room/state server
│   └── engine.js         # Core game engine and rule execution
├── vite.config.ts
└── package.json
```

## Gameplay flow summary

1. Create/join room
2. Configure board type and settings
3. Start game and take turns (roll → action)
4. Buy/build/mortgage/trade/auction
5. Survive hazards and events
6. Win by bankrupting opponents
7. Restart same board or switch board post-game

## Notes

- Utility/company tiles are supported in trading and mortgage flows.
- On small screens, trade compose uses modal fallback so trading remains usable.
- Trade execution correctness is validated server-side, not client-side.

---

If you want, I can also add a dedicated `artifacts/monopoly-game/README.md` with only game-package commands and leave this root README as monorepo overview.