# Encounter counter

A small **Node + Express** app that serves a static shiny-hunt **encounter counter** in the browser. Counts and hunt metadata are saved to `encounters-cache.txt` in the project folder (JSON).

## Requirements

- [Node.js](https://nodejs.org/) 18+ (or any recent LTS)

## Run

```bash
npm install
npm start
```

Open the URL printed in the terminal (default **http://127.0.0.1:3847**). If the port is busy, the server tries the next ports automatically.

## Features

- **Counters** — per-hunt encounter totals, custom increments, optional odds presets and shiny probability hints.
- **Hunt details** — game title, method, notes, and **target Pokémon** (species list loaded from [PokéAPI](https://pokeapi.co/) using a per-title Pokédex map in `public/game-data.js`).
- **Catch** — marks a hunt complete (moves to **past counters**) with confetti + sound.
- **Graphs & history** — dashboard cumulative chart, up to three compare charts (cumulative or rate), and tracker history tables.
- **Graph filters** — narrow dashboard stats, charts, and history by **game**, **odds preset**, **hunting method**, and whether the hunt **includes odds**.
- **Images** — box art (optional URLs in `GAME_BOX_ART`) and **2D shiny battle sprites** from the [PokeAPI sprites repository](https://github.com/PokeAPI/sprites) for the first target species.

## Configuration

- **Port:** set `PORT` (e.g. `PORT=4000 npm start`).
- **Box art:** edit `GAME_BOX_ART` in `public/game-data.js`. Keys must match the exact **Pokémon game** strings used in the game dropdown. You can use direct image URLs (for example from [LaunchBox Games Database](https://gamesdb.launchbox-app.com/) image pages). Games without an entry simply hide box art.
- **Cache file:** `encounters-cache.txt` at the repo root (listed in `.gitignore` so local data is not committed by default).

## Legal

Pokémon and related trademarks are property of Nintendo, The Pokémon Company, and Game Freak. This project is an independent fan tool and is not affiliated with or endorsed by them. Box art is linked from third-party databases for convenience; respect their terms and your local copyright rules.
