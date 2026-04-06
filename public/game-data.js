/**
 * Shiny-huntable titles only: core RPG series + Colosseum / XD (see Bulbapedia / Serebii shiny mechanics).
 * Grouped by generation (community convention). Remakes sit in their release generation.
 */
window.__ENCOUNTER_UI = {
  POKEMON_GAME_GROUPS: [
    {
      label: "Generation I (Kanto)",
      games: [
        "Pokémon Red (international)",
        "Pokémon Blue (international)",
        "Pokémon Green (Japan)",
        "Pokémon Yellow",
        "Pokémon FireRed",
        "Pokémon LeafGreen",
      ],
    },
    {
      label: "Generation II (Johto)",
      games: [
        "Pokémon Gold",
        "Pokémon Silver",
        "Pokémon Crystal",
        "Pokémon HeartGold",
        "Pokémon SoulSilver",
      ],
    },
    {
      label: "Generation III (Hoenn)",
      games: ["Pokémon Ruby", "Pokémon Sapphire", "Pokémon Emerald"],
    },
    {
      label: "Generation IV (Sinnoh)",
      games: [
        "Pokémon Diamond",
        "Pokémon Pearl",
        "Pokémon Platinum",
        "Pokémon Brilliant Diamond",
        "Pokémon Shining Pearl",
      ],
    },
    {
      label: "Generation V (Unova)",
      games: ["Pokémon Black", "Pokémon White", "Pokémon Black 2", "Pokémon White 2"],
    },
    {
      label: "Generation VI (Kalos & Hoenn remakes)",
      games: ["Pokémon X", "Pokémon Y", "Pokémon Omega Ruby", "Pokémon Alpha Sapphire"],
    },
    {
      label: "Generation VII (Alola & Let's Go)",
      games: [
        "Pokémon Sun",
        "Pokémon Moon",
        "Pokémon Ultra Sun",
        "Pokémon Ultra Moon",
        "Pokémon: Let's Go, Pikachu!",
        "Pokémon: Let's Go, Eevee!",
      ],
    },
    {
      label: "Generation VIII (Galar & Hisui)",
      games: ["Pokémon Sword", "Pokémon Shield", "Pokémon Legends: Arceus"],
    },
    {
      label: "Generation IX (Paldea)",
      games: [
        "Pokémon Scarlet",
        "Pokémon Violet",
        "Pokémon Scarlet & Violet — The Teal Mask",
        "Pokémon Scarlet & Violet — The Indigo Disk",
        "Pokémon Scarlet & Violet — Mochi Mayhem",
      ],
    },
    {
      label: "Generation X (Lumiose)",
      games: ["Pokémon Legends: Z-A"],
    },
    {
      label: "GameCube (Colosseum series)",
      games: ["Pokémon Colosseum", "Pokémon XD: Gale of Darkness"],
    },
  ],

  HUNTING_METHODS: [
    "(not set)",
    "Auto battle (SV)",
    "Chain fishing",
    "DexNav (ORAS)",
    "Dynamax Adventure / Max Lair (SwSh)",
    "Egg / breeding (general)",
    "Friend Safari (XY)",
    "Horde encounters (XY)",
    "Mass outbreak / MMO (Legends Arceus, SV)",
    "Masuda method (breeding)",
    "Overworld / visible encounters (SV)",
    "Poké Radar (DPPt, BDSP, XY)",
    "Random encounters",
    "Raid / Tera Raid",
    "Sandwich + Sparkling Power (SV)",
    "Soft reset (SR) / stationary",
    "SOS chain (SM / USUM)",
    "Ultra Wormhole (USUM)",
    "Wonder Trade / other",
    "Other (see notes)",
  ],

  /**
   * Regional / combined Pokédex IDs (PokéAPI). Used to list species obtainable in that title’s dex.
   * National dex id 1 is used where no regional mapping exists (e.g. Orre).
   */
  GAME_POKEDEX_MAP: {
    "Pokémon Red (international)": [2],
    "Pokémon Blue (international)": [2],
    "Pokémon Green (Japan)": [2],
    "Pokémon Yellow": [2],
    "Pokémon FireRed": [2],
    "Pokémon LeafGreen": [2],
    "Pokémon Gold": [3],
    "Pokémon Silver": [3],
    "Pokémon Crystal": [3],
    "Pokémon HeartGold": [7],
    "Pokémon SoulSilver": [7],
    "Pokémon Ruby": [4],
    "Pokémon Sapphire": [4],
    "Pokémon Emerald": [4],
    "Pokémon Diamond": [5],
    "Pokémon Pearl": [5],
    "Pokémon Platinum": [6],
    "Pokémon Brilliant Diamond": [5],
    "Pokémon Shining Pearl": [5],
    "Pokémon Black": [8],
    "Pokémon White": [8],
    "Pokémon Black 2": [9],
    "Pokémon White 2": [9],
    "Pokémon X": [12, 13, 14],
    "Pokémon Y": [12, 13, 14],
    "Pokémon Omega Ruby": [15],
    "Pokémon Alpha Sapphire": [15],
    "Pokémon Sun": [16],
    "Pokémon Moon": [16],
    "Pokémon Ultra Sun": [21],
    "Pokémon Ultra Moon": [21],
    "Pokémon: Let's Go, Pikachu!": [26],
    "Pokémon: Let's Go, Eevee!": [26],
    "Pokémon Sword": [27, 28, 29],
    "Pokémon Shield": [27, 28, 29],
    "Pokémon Legends: Arceus": [30],
    "Pokémon Scarlet": [31],
    "Pokémon Violet": [31],
    "Pokémon Scarlet & Violet — The Teal Mask": [32],
    "Pokémon Scarlet & Violet — The Indigo Disk": [33],
    "Pokémon Scarlet & Violet — Mochi Mayhem": [31, 32, 33],
    "Pokémon Legends: Z-A": [34],
    "Pokémon Colosseum": [1],
    "Pokémon XD: Gale of Darkness": [1],
  },

  /**
   * Optional cover images (HTTPS). Keys must match "Pokémon game" strings exactly.
   * Add URLs from your own hosting or a database such as LaunchBox Games Database.
   */
  GAME_BOX_ART: {
    "Pokémon Sword":
      "https://images.launchbox-app.com/f7b74a44-86aa-41d4-b1e2-f50d0c7d5ed7.jpg",
    "Pokémon Shield":
      "https://images.launchbox-app.com/be9c86d5-7ce9-455a-9c4d-f2e0185a91e5.jpg",
    "Pokémon Scarlet":
      "https://images.launchbox-app.com/f7f3a4dd-6381-47f5-aa31-bf9a11ef5edf.jpg",
    "Pokémon Violet":
      "https://images.launchbox-app.com/c026989e-3907-40ef-af6b-51f977227d5a.png",
    "Pokémon Legends: Arceus":
      "https://images.launchbox-app.com/00e96255-20ed-49d2-9ae9-88aa143b2be6.png",
  },

  ODDS_PRESETS: [
    { id: "full-auto", label: "Full odds — auto (1/8192 old games, 1/4096 Gen VI+)" },
    { id: "full-8192", label: "Full odds — 1/8192 (typical Gen II–V)" },
    { id: "full-4096", label: "Full odds — 1/4096 (typical Gen VI+)" },
    { id: "shiny-charm", label: "Shiny Charm — ≈1/1365 (wild; varies)" },
    { id: "masuda", label: "Masuda method — ≈1/683 (Gen V+)" },
    { id: "masuda-charm", label: "Masuda + Shiny Charm — ≈1/512" },
    { id: "outbreak-sv-30", label: "SV outbreak (30–59 clears) — ≈1/2048" },
    { id: "outbreak-sv-60", label: "SV outbreak (60+ clears) — ≈1/1366" },
    { id: "sandwich-sp3", label: "SV Sparkling Power L3 — ≈1/1024 (stacked)" },
    { id: "lets-go-combo", label: "Let's Go catch combo — improves with chain" },
    { id: "custom", label: "Custom (describe in notes)" },
  ],

  /**
   * Catch button sound: played from this URL first (MP3/OGG/WAV in `public/` is fine).
   * Browsers cannot use a YouTube watch URL as audio — export the clip for personal use (e.g. from
   * https://www.youtube.com/watch?v=e7zMbX_0e5o ) and save as `public/sounds/catch.mp3`, or change the path.
   * If the file is missing or blocked, a built-in synthesized chime is used.
   */
  CATCH_SFX_URL: "/sounds/catch.mp3",
};
