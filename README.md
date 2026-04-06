# Encounter counter

Browser-based **shiny hunt encounter counter** backed by a tiny **Node + Express** server. State is stored as JSON in `encounters-cache.txt` at the project root.

## Requirements

- [Node.js](https://nodejs.org/) 18+ (LTS recommended)

## Install & run

```bash
cd "Pokemon Shiny Encounter Counter"
npm install
npm start
```

Open the URL shown in the terminal (default **http://127.0.0.1:3847**). If that port is in use, the server increments until one is free.

**Custom port:** `PORT=4000 npm start` (Unix) or `set PORT=4000&& npm start` (Windows CMD).

## What’s included

- **Counters** — +/−, set value, custom increment buttons, optional odds presets and shiny odds hints.
- **Hunt details** — game, method, notes, **target Pokémon** (Pokédex from [PokéAPI](https://pokeapi.co/), mapped per title in `public/game-data.js`).
- **Catch** — completes a hunt (past captures), confetti, optional SFX; **toast with Undo** to restore the hunt.
- **Counter layout** — View dropdown: comfortable / compact column, 2- or 3-column grid (saved in state).
- **Target sprite** — shiny sprite for the first target, sized in the column above the green Catch button; sprites are **fetched once per species** and cached in memory for the session.
- **Graphs & history** — dashboard stats & charts (cumulative + rate), three compare slots, tracker history tables.
- **Captures** — tab under Graphs: list completed catches, **edit** metadata, **Restore** (same as Undo).
- **Graph filters** — game, odds preset, method, odds on/off; applied to dashboard, captures list, charts, and history.

## Configuration

| Item | Where |
|------|--------|
| Games, Pokédex IDs, box art URLs, odds presets, catch SFX path | `public/game-data.js` |
| Catch sound | Optional `public/sounds/catch.mp3` (or URL in `CATCH_SFX_URL`). If missing or blocked, a built-in tone plays. |
| Saved hunts | `encounters-cache.txt` (gitignored by default) |

Box art keys must match **exact** game strings from the dropdown. Shiny art uses [PokeAPI/sprites](https://github.com/PokeAPI/sprites) on GitHub.

## Legal

Pokémon and related marks are owned by Nintendo, The Pokémon Company, and Game Freak. This is an independent fan project, not affiliated or endorsed. Use third-party art and any exported audio under their terms and applicable law.
