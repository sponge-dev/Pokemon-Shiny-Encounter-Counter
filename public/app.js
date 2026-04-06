(() => {
  const board = document.getElementById("board");
  const addCounterBtn = document.getElementById("addCounter");
  const panelMain = document.getElementById("panelMain");
  const panelGraphs = document.getElementById("panelGraphs");
  const dashStats = document.getElementById("dashStats");
  const chartDashboardCumulative = document.getElementById("chartDashboardCumulative");
  const chartDashboardRate = document.getElementById("chartDashboardRate");
  const trackerHistoryMount = document.getElementById("trackerHistoryMount");
  const capturesDashboardMount = document.getElementById("capturesDashboardMount");

  const MAX_EVENTS_PER_COUNTER = 12000;
  const EPH_WINDOW_MS = 60 * 60 * 1000;
  const BOARD_LAYOUT_IDS = ["default", "compact", "grid2", "grid3"];
  /** Drop interval-rate points this many sample standard deviations above the current mean (recomputed iteratively). */
  const RATE_OUTLIER_STD_MULTIPLE = 5;
  const RATE_OUTLIER_MAX_ITERS = 6;

  const UI = window.__ENCOUNTER_UI || {
    POKEMON_GAME_GROUPS: [],
    HUNTING_METHODS: ["(not set)"],
    ODDS_PRESETS: [{ id: "full-auto", label: "Full odds (auto)" }],
    GAME_POKEDEX_MAP: {},
    GAME_BOX_ART: {},
    CATCH_SFX_URL: "",
  };

  const graphPanelDashboard = document.getElementById("graphPanelDashboard");
  const graphPanelCompare = document.getElementById("graphPanelCompare");
  const graphPanelHistory = document.getElementById("graphPanelHistory");
  const graphPanelCaptures = document.getElementById("graphPanelCaptures");
  const graphFilterGame = document.getElementById("graphFilterGame");
  const graphFilterOdds = document.getElementById("graphFilterOdds");
  const graphFilterMethod = document.getElementById("graphFilterMethod");
  const graphFilterOddsTracking = document.getElementById("graphFilterOddsTracking");

  const pokedexSpeciesCache = new Map();
  const speciesNationalIdCache = new Map();

  /** Dex national id → `blob:` URL (fetched once per session). */
  const shinySpriteBlobUrlByDex = new Map();
  /** In-flight fetches so concurrent callers share one network request. */
  const shinySpriteFetchByDex = new Map();
  /** Dex ids that failed fetch or decode — avoid repeat requests. */
  const shinySpriteFailedDex = new Set();

  function invalidateShinySpriteCache(dexId) {
    if (dexId == null) return;
    const u = shinySpriteBlobUrlByDex.get(dexId);
    if (u) {
      if (typeof u === "string" && u.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(u);
        } catch (_) {}
      }
      shinySpriteBlobUrlByDex.delete(dexId);
    }
    shinySpriteFailedDex.delete(dexId);
  }

  /**
   * Loads shiny sprite once per dex id; returns cached `blob:` URL (stable across re-renders, no image reload).
   * If `fetch` fails (e.g. CORS), caches the raw GitHub URL once so img still works via browser cache.
   */
  async function getCachedShinySpriteUrl(dexId) {
    if (!dexId || dexId < 1) return null;
    if (shinySpriteFailedDex.has(dexId)) return null;
    const cached = shinySpriteBlobUrlByDex.get(dexId);
    if (cached) return cached;
    let inflight = shinySpriteFetchByDex.get(dexId);
    if (!inflight) {
      const src = shinySpriteUrlByDexId(dexId);
      inflight = (async () => {
        try {
          const r = await fetch(src, { mode: "cors" });
          if (!r.ok) {
            shinySpriteFailedDex.add(dexId);
            return null;
          }
          const blob = await r.blob();
          const objUrl = URL.createObjectURL(blob);
          shinySpriteBlobUrlByDex.set(dexId, objUrl);
          return objUrl;
        } catch {
          shinySpriteBlobUrlByDex.set(dexId, src);
          return src;
        } finally {
          shinySpriteFetchByDex.delete(dexId);
        }
      })();
      shinySpriteFetchByDex.set(dexId, inflight);
    }
    return inflight;
  }

  function getBoxArtUrl(game) {
    const m = UI.GAME_BOX_ART;
    if (!m || !game) return "";
    return m[game] || "";
  }

  function shinySpriteUrlByDexId(id) {
    if (!id || id < 1) return "";
    return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/${id}.png`;
  }

  async function ensureSpeciesNationalId(slug) {
    if (!slug || typeof slug !== "string") return null;
    if (speciesNationalIdCache.has(slug)) return speciesNationalIdCache.get(slug);
    try {
      const r = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${encodeURIComponent(slug)}/`);
      if (!r.ok) {
        speciesNationalIdCache.set(slug, null);
        return null;
      }
      const j = await r.json();
      const id = j.id;
      speciesNationalIdCache.set(slug, id);
      return id;
    } catch {
      speciesNationalIdCache.set(slug, null);
      return null;
    }
  }

  function formatSpeciesDisplayName(slug) {
    if (!slug || typeof slug !== "string") return "";
    return slug
      .split("-")
      .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : ""))
      .join(" ");
  }

  function getPokedexIdsForGame(game) {
    const m = UI.GAME_POKEDEX_MAP;
    if (!m || !game || game === "(not set)") return null;
    return Array.isArray(m[game]) ? m[game] : null;
  }

  async function loadSpeciesForGame(game) {
    const ids = getPokedexIdsForGame(game);
    if (!ids || !ids.length) return { ok: false, list: [], error: "no-map" };
    const key = ids.slice().sort((a, b) => a - b).join(",");
    if (pokedexSpeciesCache.has(key)) return { ok: true, list: pokedexSpeciesCache.get(key) };
    try {
      const lists = await Promise.all(
        ids.map((id) =>
          fetch(`https://pokeapi.co/api/v2/pokedex/${id}/`).then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
          }),
        ),
      );
      const bySlug = new Map();
      for (const data of lists) {
        for (const e of data.pokemon_entries || []) {
          const slug = e.pokemon_species.name;
          if (!bySlug.has(slug)) bySlug.set(slug, { slug, display: formatSpeciesDisplayName(slug) });
        }
      }
      const arr = Array.from(bySlug.values()).sort((a, b) => a.display.localeCompare(b.display));
      pokedexSpeciesCache.set(key, arr);
      return { ok: true, list: arr };
    } catch (e) {
      return { ok: false, list: [], error: String(e && e.message ? e.message : e) };
    }
  }

  function formatTargetsCell(targets) {
    if (!Array.isArray(targets) || !targets.length) return "—";
    const names = targets.map(formatSpeciesDisplayName);
    if (names.length <= 2) return names.join(", ");
    return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
  }

  /**
   * Shiny battle sprite in a flex-grow zone under +/−/Set, filling down to the Catch row (with row-main spacing).
   * First target only (tooltip if multiple).
   */
  function appendCounterTargetSprite(stackEl, c) {
    const slugs = Array.isArray(c.targets) ? c.targets.filter((s) => typeof s === "string" && s) : [];
    if (!slugs.length) return;
    const slug = slugs[0];
    stackEl.classList.add("controls-sprite-stack--with-sprite");
    const zone = document.createElement("div");
    zone.className = "counter-target-sprite-zone";
    const spriteWrap = document.createElement("div");
    spriteWrap.className = "counter-target-sprite-wrap";
    if (slugs.length > 1) {
      const others = slugs.slice(1).map(formatSpeciesDisplayName).join(", ");
      spriteWrap.title = `Also hunting: ${others}`;
    }
    const img = document.createElement("img");
    img.className = "counter-target-sprite";
    img.alt = `Shiny ${formatSpeciesDisplayName(slug)}`;
    img.loading = "lazy";
    img.decoding = "async";
    spriteWrap.appendChild(img);
    zone.appendChild(spriteWrap);
    stackEl.appendChild(zone);
    void (async () => {
      const dex = await ensureSpeciesNationalId(slug);
      if (!dex) {
        zone.remove();
        stackEl.classList.remove("controls-sprite-stack--with-sprite");
        return;
      }
      const spriteUrl = await getCachedShinySpriteUrl(dex);
      if (!spriteUrl) {
        zone.remove();
        stackEl.classList.remove("controls-sprite-stack--with-sprite");
        return;
      }
      img.onerror = () => {
        invalidateShinySpriteCache(dex);
        zone.remove();
        stackEl.classList.remove("controls-sprite-stack--with-sprite");
      };
      img.src = spriteUrl;
    })();
  }

  function populateGameSelect(sel, currentValue) {
    const cur = currentValue || "(not set)";
    sel.innerHTML = "";
    const o0 = document.createElement("option");
    o0.value = "(not set)";
    o0.textContent = "(not set)";
    if (cur === "(not set)") o0.selected = true;
    sel.appendChild(o0);

    const seen = new Set(["(not set)"]);
    const groups = UI.POKEMON_GAME_GROUPS || [];
    for (const group of groups) {
      const og = document.createElement("optgroup");
      og.label = group.label;
      for (const g of group.games || []) {
        const o = document.createElement("option");
        o.value = g;
        o.textContent = g;
        if (cur === g) o.selected = true;
        og.appendChild(o);
        seen.add(g);
      }
      sel.appendChild(og);
    }
    if (cur && !seen.has(cur)) {
      const og = document.createElement("optgroup");
      og.label = "Other (from saved data)";
      const o = document.createElement("option");
      o.value = cur;
      o.textContent = cur;
      o.selected = true;
      og.appendChild(o);
      sel.appendChild(og);
    }
  }

  /** Gen II–V style full odds; Gen VI+ remakes / modern titles use 1/4096 (approximate). */
  function gameUses8192(game) {
    const g = (game || "").toLowerCase();
    if (!g || g.includes("(not set)")) return false;
    if (/(colosseum|xd:|gale of darkness)/i.test(g)) return true;
    if (
      /(x|y|omega|alpha|sun|moon|ultra|sword|shield|brilliant|shining|scarlet|violet|teal|indigo|mochi|legend|let'?s go|z-a|arceus)/i.test(
        g,
      )
    ) {
      return false;
    }
    if (
      /(red|blue|yellow|green|gold|silver|crystal|ruby|sapphire|emerald|firered|leafgreen|diamond|pearl|platinum|heartgold|soulsilver|black|white|battle revolution|stadium)/i.test(
        g,
      )
    ) {
      return true;
    }
    return false;
  }

  function getOddsDisplayLabel(c) {
    if (!c.includeOdds) return "";
    const id = c.oddsPresetId || "full-auto";
    if (id === "full-auto") {
      return gameUses8192(c.game) ? "Full odds — 1/8192" : "Full odds — 1/4096";
    }
    const p = UI.ODDS_PRESETS.find((x) => x.id === id);
    return p ? p.label : "Full odds";
  }

  /** One-line summary when Hunt details panel is collapsed. */
  function formatHuntCompact(c) {
    const bits = [];
    bits.push(c.game && c.game !== "(not set)" ? c.game : "Game —");
    bits.push(c.huntingMethod && c.huntingMethod !== "(not set)" ? c.huntingMethod : "Method —");
    if (Array.isArray(c.targets) && c.targets.length) {
      const first = formatSpeciesDisplayName(c.targets[0]);
      bits.push(c.targets.length === 1 ? `Target: ${first}` : `Targets: ${first} +${c.targets.length - 1}`);
    }
    bits.push(c.includeOdds ? getOddsDisplayLabel(c) : "Odds off");
    if (c.notes && c.notes.trim()) {
      const t = c.notes.trim().replace(/\s+/g, " ");
      bits.push(t.length > 48 ? t.slice(0, 48) + "…" : t);
    }
    return bits.join(" · ");
  }

  function formatIncrementsCompact(c) {
    const btns = c.customButtons || [];
    if (!btns.length) return "None";
    const s = btns.map((b) => b.label || `${b.delta >= 0 ? "+" : ""}${b.delta}`).join(", ");
    return s.length > 140 ? s.slice(0, 138) + "…" : s;
  }

  /** Per-encounter shiny probability p ∈ (0,1] from odds preset; null if unknown. */
  function getShinyProbabilityPerEncounter(c) {
    if (!c || !c.includeOdds) return null;
    const id = c.oddsPresetId || "full-auto";
    if (id === "full-auto") {
      const n = gameUses8192(c.game) ? 8192 : 4096;
      return 1 / n;
    }
    const table = {
      "full-8192": 1 / 8192,
      "full-4096": 1 / 4096,
      "shiny-charm": 1 / 1365.67,
      "masuda": 1 / 683.08,
      "masuda-charm": 1 / 512.44,
      "outbreak-sv-30": 1 / 2048.25,
      "outbreak-sv-60": 1 / 1365.67,
      "sandwich-sp3": 1 / 1024,
      "lets-go-combo": null,
      "custom": null,
    };
    return table[id] !== undefined ? table[id] : null;
  }

  function formatPercentShiny(x) {
    if (!Number.isFinite(x) || x < 0) return "—";
    const pct = x * 100;
    if (pct >= 10) return pct.toFixed(1) + "%";
    if (pct >= 0.1) return pct.toFixed(2) + "%";
    if (pct >= 0.001) return pct.toFixed(3) + "%";
    return pct.toFixed(4) + "%";
  }

  /** P(at least one success in n i.i.d. trials) = 1 − (1−p)^n */
  function probAtLeastOneShiny(p, n) {
    if (!Number.isFinite(p) || p <= 0 || p >= 1) return 0;
    const k = Math.max(0, Math.trunc(n));
    if (k === 0) return 0;
    return 1 - Math.exp(k * Math.log(1 - p));
  }

  function formatShinyChanceText(c) {
    if (!c.includeOdds) return "";
    const p = getShinyProbabilityPerEncounter(c);
    const n = Math.max(0, Math.trunc(c.value ?? 0));
    if (p == null || !Number.isFinite(p)) {
      return "Next shiny: use preset with a fixed rate, or estimate from notes (combo/custom vary).";
    }
    const next = formatPercentShiny(p);
    let s = `Next encounter: ~${next} shiny`;
    if (n > 0) {
      const cum = probAtLeastOneShiny(p, n);
      s += ` · P(≥1 shiny in ${n} enc.): ~${formatPercentShiny(cum)}`;
    }
    return s;
  }

  let state = {
    counters: [],
    trackerHistory: [],
    pastCounters: [],
    boardLayout: "default",
    graphUi: {
      subPanel: "dashboard",
      filters: {
        game: "",
        oddsPresetId: "",
        huntingMethod: "",
        oddsTracking: "all",
      },
    },
  };

  function getGraphFilters() {
    return state.graphUi?.filters || {};
  }

  function matchesGraphFilters(h) {
    const f = getGraphFilters();
    const game = f.game || "";
    if (game && (h.game || "") !== game) return false;
    const op = f.oddsPresetId || "";
    if (op && (h.oddsPresetId || "full-auto") !== op) return false;
    const hm = f.huntingMethod || "";
    if (hm && (h.huntingMethod || "(not set)") !== hm) return false;
    const ot = f.oddsTracking || "all";
    if (ot === "with" && !h.includeOdds) return false;
    if (ot === "without" && h.includeOdds) return false;
    return true;
  }

  let saveTimer = null;
  let statusEl = null;

  function uid() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function cssEsc(id) {
    return typeof CSS !== "undefined" && typeof CSS.escape === "function"
      ? CSS.escape(id)
      : id.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function normalizeState() {
    if (!Array.isArray(state.counters)) state.counters = [];
    if (!Array.isArray(state.trackerHistory)) state.trackerHistory = [];
    if (!Array.isArray(state.pastCounters)) state.pastCounters = [];
    for (const c of state.counters) {
      if (!c.id) c.id = uid();
      if (!Array.isArray(c.customButtons)) c.customButtons = [];
      delete c.caught;
      delete c.lastCaughtAt;
      c.game = c.game ?? "";
      c.huntingMethod = c.huntingMethod ?? "";
      c.includeOdds = c.includeOdds ?? false;
      c.oddsPresetId = c.oddsPresetId ?? "full-auto";
      c.notes = c.notes ?? "";
      c.huntPanelExpanded = c.huntPanelExpanded ?? false;
      c.incrementsPanelExpanded = c.incrementsPanelExpanded ?? false;
      c.targets = Array.isArray(c.targets) ? c.targets.filter((x) => typeof x === "string") : [];
      if (!c.createdAt) c.createdAt = c.lastUptickAt || new Date().toISOString();
      if (!Array.isArray(c.events)) c.events = [];
      if (c.events.length === 0 && c.value > 0) {
        c.events.push({
          t: c.lastUptickAt || c.createdAt,
          kind: "encounter",
          delta: Math.trunc(c.value),
        });
      }
    }
    for (const p of state.pastCounters) {
      if (!Array.isArray(p.events)) p.events = [];
      if (!Array.isArray(p.customButtons)) p.customButtons = [];
      if (!p.completedAt) p.completedAt = new Date().toISOString();
      p.game = p.game ?? "";
      p.huntingMethod = p.huntingMethod ?? "";
      p.includeOdds = p.includeOdds ?? false;
      p.oddsPresetId = p.oddsPresetId ?? "full-auto";
      p.notes = p.notes ?? "";
      p.targets = Array.isArray(p.targets) ? p.targets.filter((x) => typeof x === "string") : [];
    }
    if (!state.graphUi || typeof state.graphUi !== "object") state.graphUi = {};
    state.graphUi.subPanel = ["dashboard", "captures", "compare", "history"].includes(state.graphUi.subPanel)
      ? state.graphUi.subPanel
      : "dashboard";
    if (!state.graphUi.filters || typeof state.graphUi.filters !== "object") state.graphUi.filters = {};
    const gf = state.graphUi.filters;
    gf.game = typeof gf.game === "string" ? gf.game : "";
    gf.oddsPresetId = typeof gf.oddsPresetId === "string" ? gf.oddsPresetId : "";
    gf.huntingMethod = typeof gf.huntingMethod === "string" ? gf.huntingMethod : "";
    gf.oddsTracking =
      gf.oddsTracking === "with" || gf.oddsTracking === "without" ? gf.oddsTracking : "all";
    for (const h of state.trackerHistory) {
      if (!h || typeof h !== "object") continue;
      h.game = h.game ?? "";
      h.huntingMethod = h.huntingMethod ?? "";
      h.includeOdds = h.includeOdds ?? false;
      h.oddsPresetId = h.oddsPresetId ?? "full-auto";
    }
    state.boardLayout = BOARD_LAYOUT_IDS.includes(state.boardLayout) ? state.boardLayout : "default";
  }

  function applyBoardLayout() {
    const layout = BOARD_LAYOUT_IDS.includes(state.boardLayout) ? state.boardLayout : "default";
    state.boardLayout = layout;
    board.className = "board";
    if (layout !== "default") board.classList.add(`board--${layout}`);
    const appEl = document.querySelector(".app");
    if (appEl) {
      appEl.classList.toggle("app--board-wide2", layout === "grid2");
      appEl.classList.toggle("app--board-wide3", layout === "grid3");
    }
    const sel = document.getElementById("boardLayoutSelect");
    if (sel) sel.value = layout;
  }

  function trimEvents(c) {
    if (!c.events || c.events.length <= MAX_EVENTS_PER_COUNTER) return;
    c.events.splice(0, c.events.length - MAX_EVENTS_PER_COUNTER);
  }

  function pushEncounterEvents(c, delta, t) {
    const d = Math.trunc(delta);
    if (d <= 0) return;
    if (!c.events) c.events = [];
    c.events.push({ t: t || new Date().toISOString(), kind: "encounter", delta: d });
    trimEvents(c);
  }

  function counterById(id) {
    return state.counters.find((c) => c.id === id);
  }

  function pastCounterById(id) {
    return state.pastCounters.find((p) => p.id === id);
  }

  function getHuntEvents(id) {
    const a = counterById(id);
    if (a) return a.events || [];
    const p = pastCounterById(id);
    return p ? p.events || [] : [];
  }

  function formatRelativeAgo(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const sec = Math.round((Date.now() - d) / 1000);
    if (sec < 0) return "";
    if (sec < 45) return "just now";
    const min = Math.round(sec / 60);
    if (min < 60) return `${min} min ago`;
    const hr = Math.round(min / 60);
    if (hr < 48) return `${hr} hr ago`;
    const day = Math.round(hr / 24);
    return `${day} days ago`;
  }

  function formatLastUptick(iso) {
    if (!iso) return { line: "Last uptick: never", title: "" };
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return { line: "Last uptick: —", title: "" };
    const abs = d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    const rel = formatRelativeAgo(iso);
    const line = rel ? `Last uptick: ${rel} · ${abs}` : `Last uptick: ${abs}`;
    return { line, title: d.toISOString() };
  }

  function computeEph(c) {
    const now = Date.now();
    const enc = (c.events || []).filter((e) => e.kind === "encounter");
    let sum = 0;
    for (const e of enc) {
      const t = new Date(e.t).getTime();
      if (Number.isNaN(t) || now - t > EPH_WINDOW_MS || now - t < 0) continue;
      sum += e.delta != null ? e.delta : 1;
    }
    return sum;
  }

  function formatEph(eph) {
    if (!Number.isFinite(eph) || eph < 0) return "—";
    if (eph === 0) return "0 /hr";
    if (eph < 10) return eph.toFixed(1) + " /hr";
    return Math.round(eph) + " /hr";
  }

  /** Short “pokeball clamp” style SFX (original synthesis — not a recording). */
  function playCatchSoundSynth() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const t0 = ctx.currentTime;
      const master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(ctx.destination);

      const o1 = ctx.createOscillator();
      const g1 = ctx.createGain();
      o1.type = "square";
      o1.connect(g1);
      g1.connect(master);
      o1.frequency.setValueAtTime(920, t0);
      o1.frequency.exponentialRampToValueAtTime(110, t0 + 0.15);
      g1.gain.setValueAtTime(0.32, t0);
      g1.gain.exponentialRampToValueAtTime(0.01, t0 + 0.18);
      o1.start(t0);
      o1.stop(t0 + 0.2);

      const o2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      o2.type = "sine";
      o2.connect(g2);
      g2.connect(master);
      o2.frequency.setValueAtTime(540, t0 + 0.08);
      o2.frequency.exponentialRampToValueAtTime(200, t0 + 0.28);
      g2.gain.setValueAtTime(0, t0 + 0.08);
      g2.gain.linearRampToValueAtTime(0.22, t0 + 0.1);
      g2.gain.exponentialRampToValueAtTime(0.01, t0 + 0.34);
      o2.start(t0 + 0.06);
      o2.stop(t0 + 0.36);

      const o3 = ctx.createOscillator();
      const g3 = ctx.createGain();
      o3.type = "triangle";
      o3.connect(g3);
      g3.connect(master);
      o3.frequency.setValueAtTime(1320, t0 + 0.14);
      o3.frequency.exponentialRampToValueAtTime(330, t0 + 0.22);
      g3.gain.setValueAtTime(0, t0 + 0.14);
      g3.gain.linearRampToValueAtTime(0.12, t0 + 0.16);
      g3.gain.exponentialRampToValueAtTime(0.01, t0 + 0.26);
      o3.start(t0 + 0.14);
      o3.stop(t0 + 0.28);
    } catch (_) {}
  }

  /** Prefer `CATCH_SFX_URL` (e.g. MP3 in public/sounds/); fall back to synthesized chime. */
  function playCatchSound() {
    const url = typeof UI.CATCH_SFX_URL === "string" ? UI.CATCH_SFX_URL.trim() : "";
    if (!url) {
      playCatchSoundSynth();
      return;
    }
    try {
      const a = new Audio(url);
      a.volume = 0.88;
      const p = a.play();
      if (p !== undefined && typeof p.then === "function") p.catch(() => playCatchSoundSynth());
    } catch {
      playCatchSoundSynth();
    }
  }

  let catchToastAutoDismissTimer = null;

  function dismissCatchToast() {
    const region = document.getElementById("catchToastRegion");
    if (region) region.innerHTML = "";
    if (catchToastAutoDismissTimer) {
      clearTimeout(catchToastAutoDismissTimer);
      catchToastAutoDismissTimer = null;
    }
  }

  function showCatchToast(pastCounterId, huntName, encounterTotal) {
    dismissCatchToast();
    const region = document.getElementById("catchToastRegion");
    if (!region) return;
    const toast = document.createElement("div");
    toast.className = "catch-toast";
    toast.setAttribute("role", "status");

    const title = document.createElement("div");
    title.className = "catch-toast-title";
    title.textContent = "Shiny caught!";

    const sub = document.createElement("div");
    sub.className = "catch-toast-sub";
    const enc =
      encounterTotal != null && Number.isFinite(Number(encounterTotal))
        ? String(encounterTotal)
        : "—";
    sub.textContent = `${huntName || "(unnamed)"} · ${enc} encounters`;

    const actions = document.createElement("div");
    actions.className = "catch-toast-actions";

    const undoBtn = document.createElement("button");
    undoBtn.type = "button";
    undoBtn.className = "btn catch-toast-undo";
    undoBtn.textContent = "Undo";
    undoBtn.title = "Restore this hunt to active counters";
    undoBtn.addEventListener("click", () => {
      if (undoCatchRestoreActive(pastCounterId)) {
        dismissCatchToast();
        showStatus("Catch undone — hunt restored to Counters");
      }
    });

    const dismissBtn = document.createElement("button");
    dismissBtn.type = "button";
    dismissBtn.className = "btn small catch-toast-dismiss";
    dismissBtn.textContent = "Dismiss";
    dismissBtn.addEventListener("click", () => dismissCatchToast());

    actions.appendChild(undoBtn);
    actions.appendChild(dismissBtn);
    toast.appendChild(title);
    toast.appendChild(sub);
    toast.appendChild(actions);
    region.appendChild(toast);

    catchToastAutoDismissTimer = setTimeout(() => dismissCatchToast(), 14000);
  }

  function undoCatchRestoreActive(pastId) {
    const idx = state.pastCounters.findIndex((p) => p.id === pastId);
    if (idx === -1) return false;
    if (state.counters.some((c) => c.id === pastId)) return false;
    const p = state.pastCounters[idx];
    const events = JSON.parse(JSON.stringify(p.events || []));
    const doneAt = p.completedAt;
    const cleaned = events.filter((e) => !(e && e.kind === "catch" && e.t === doneAt));
    const counter = {
      id: p.id,
      name: p.name || "",
      value: Math.max(0, Math.trunc(Number(p.value)) || 0),
      createdAt: p.createdAt || new Date().toISOString(),
      lastUptickAt: p.lastUptickAt ?? null,
      events: cleaned,
      customButtons: Array.isArray(p.customButtons) ? JSON.parse(JSON.stringify(p.customButtons)) : [],
      game: p.game || "",
      huntingMethod: p.huntingMethod || "",
      includeOdds: !!p.includeOdds,
      oddsPresetId: p.oddsPresetId || "full-auto",
      notes: p.notes || "",
      huntPanelExpanded: false,
      incrementsPanelExpanded: false,
      targets: Array.isArray(p.targets) ? [...p.targets] : [],
    };
    state.pastCounters.splice(idx, 1);
    state.counters.push(counter);
    render();
    renderGraphsIfVisible();
    scheduleSave();
    return true;
  }

  function fireConfetti() {
    const fn = typeof window.confetti === "function" ? window.confetti : null;
    if (!fn) return;
    fn({ particleCount: 160, spread: 78, origin: { y: 0.62 }, scalar: 1.05 });
    fn({
      particleCount: 90,
      spread: 110,
      origin: { y: 0.68 },
      startVelocity: 32,
      colors: ["#22c55e", "#4ade80", "#86efac", "#fbbf24", "#38bdf8"],
    });
  }

  function showStatus(msg) {
    if (!statusEl) {
      statusEl = document.createElement("div");
      statusEl.className = "status";
      document.body.appendChild(statusEl);
    }
    statusEl.textContent = msg;
    statusEl.classList.add("visible");
    clearTimeout(showStatus._t);
    showStatus._t = setTimeout(() => statusEl.classList.remove("visible"), 1600);
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 300);
  }

  async function load() {
    const res = await fetch("/api/state");
    if (!res.ok) throw new Error("Load failed");
    state = await res.json();
    normalizeState();
    render();
  }

  async function save() {
    try {
      const res = await fetch("/api/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      });
      if (!res.ok) throw new Error("Save failed");
      showStatus("Saved");
    } catch (e) {
      showStatus("Save failed — check server");
      console.error(e);
    }
  }

  function addCounter() {
    const t = new Date().toISOString();
    state.counters.push({
      id: uid(),
      name: `Counter ${state.counters.length + 1}`,
      value: 0,
      lastUptickAt: null,
      createdAt: t,
      events: [],
      customButtons: [],
      game: "",
      huntingMethod: "",
      includeOdds: false,
      oddsPresetId: "full-auto",
      notes: "",
      huntPanelExpanded: false,
      incrementsPanelExpanded: false,
      targets: [],
    });
    render();
    scheduleSave();
  }

  function removeCounter(id) {
    const c = counterById(id);
    if (!c) return;
    state.trackerHistory.push({
      id: c.id,
      name: c.name || "(unnamed)",
      createdAt: c.createdAt || null,
      removedAt: new Date().toISOString(),
      lastEncounters: c.value,
      eventCount: (c.events || []).length,
      game: c.game || "",
      huntingMethod: c.huntingMethod || "",
      includeOdds: !!c.includeOdds,
      oddsPresetId: c.oddsPresetId || "full-auto",
      notes: c.notes || "",
      targets: Array.isArray(c.targets) ? [...c.targets] : [],
    });
    state.counters = state.counters.filter((x) => x.id !== id);
    render();
    scheduleSave();
  }

  function completeCatch(id) {
    const c = counterById(id);
    if (!c) return;
    playCatchSound();
    fireConfetti();
    const card = document.querySelector(`[data-counter-id="${cssEsc(id)}"]`);
    if (card) card.classList.add("card--catching");

    const t = new Date().toISOString();
    if (!c.events) c.events = [];
    c.events.push({ t, kind: "catch" });
    trimEvents(c);

    const snap = {
      id: c.id,
      name: c.name,
      value: c.value,
      createdAt: c.createdAt,
      lastUptickAt: c.lastUptickAt,
      events: JSON.parse(JSON.stringify(c.events)),
      completedAt: t,
      game: c.game || "",
      huntingMethod: c.huntingMethod || "",
      includeOdds: !!c.includeOdds,
      oddsPresetId: c.oddsPresetId || "full-auto",
      notes: c.notes || "",
      targets: Array.isArray(c.targets) ? [...c.targets] : [],
      customButtons: JSON.parse(JSON.stringify(c.customButtons || [])),
    };

    setTimeout(() => {
      state.pastCounters.push(snap);
      state.counters = state.counters.filter((x) => x.id !== id);
      render();
      scheduleSave();
      showCatchToast(snap.id, snap.name || "(unnamed)", snap.value);
    }, 900);
  }

  function setValue(id, value) {
    const c = counterById(id);
    if (!c) return;
    const prev = Math.trunc(c.value);
    const n = Number(value);
    const next = Number.isFinite(n) ? Math.trunc(n) : 0;
    c.value = next;
    const now = new Date().toISOString();
    if (next > prev) {
      pushEncounterEvents(c, next - prev, now);
      c.lastUptickAt = now;
    }
    render();
    scheduleSave();
  }

  function adjust(id, delta) {
    const c = counterById(id);
    if (!c) return;
    const n = Number(delta);
    if (!Number.isFinite(n)) return;
    const prev = Math.trunc(c.value);
    c.value = Math.trunc(c.value + n);
    const now = new Date().toISOString();
    if (c.value > prev) {
      pushEncounterEvents(c, c.value - prev, now);
      c.lastUptickAt = now;
    }
    render();
    scheduleSave();
  }

  function setName(id, name) {
    const c = counterById(id);
    if (!c) return;
    c.name = String(name).trim();
    scheduleSave();
  }

  function setHuntGame(id, game) {
    const c = counterById(id);
    if (!c) return;
    if (c.game !== game) c.targets = [];
    c.game = game;
    render();
    scheduleSave();
  }

  function addTargetSpecies(id, slug) {
    const c = counterById(id);
    if (!c || !slug || typeof slug !== "string") return;
    if (!c.targets) c.targets = [];
    if (c.targets.includes(slug)) return;
    c.targets.push(slug);
    render();
    scheduleSave();
  }

  function removeTargetSpecies(id, slug) {
    const c = counterById(id);
    if (!c || !c.targets) return;
    c.targets = c.targets.filter((s) => s !== slug);
    render();
    scheduleSave();
  }

  function setHuntingMethod(id, method) {
    const c = counterById(id);
    if (!c) return;
    c.huntingMethod = method;
    render();
    scheduleSave();
  }

  function setIncludeOdds(id, value) {
    const c = counterById(id);
    if (!c) return;
    c.includeOdds = !!value;
    if (c.includeOdds && !c.oddsPresetId) c.oddsPresetId = "full-auto";
    render();
    scheduleSave();
  }

  function setOddsPreset(id, presetId) {
    const c = counterById(id);
    if (!c) return;
    c.oddsPresetId = presetId;
    render();
    scheduleSave();
  }

  function setNotes(id, notes) {
    const c = counterById(id);
    if (!c) return;
    c.notes = String(notes);
    scheduleSave();
  }

  function addCustomButton(counterId) {
    const c = counterById(counterId);
    if (!c) return;
    const row = document.querySelector(`[data-increments-form="${counterId}"]`);
    const labelIn = row?.querySelector('[data-field="label"]');
    const deltaIn = row?.querySelector('[data-field="delta"]');
    const label = labelIn?.value?.trim() || "+";
    const delta = Number(deltaIn?.value);
    if (!Number.isFinite(delta) || delta === 0) {
      showStatus("Enter a non-zero step");
      return;
    }
    c.customButtons.push({ id: uid(), label, delta: Math.trunc(delta) });
    if (labelIn) labelIn.value = "";
    if (deltaIn) deltaIn.value = "";
    render();
    scheduleSave();
  }

  function removeCustomButton(counterId, btnId) {
    const c = counterById(counterId);
    if (!c) return;
    c.customButtons = c.customButtons.filter((b) => b.id !== btnId);
    render();
    scheduleSave();
  }

  function buildCumulativeSeries(events) {
    const enc = (events || [])
      .filter((e) => e.kind === "encounter")
      .slice()
      .sort((a, b) => new Date(a.t) - new Date(b.t));
    let cum = 0;
    const pts = [];
    for (const e of enc) {
      const dt = new Date(e.t).getTime();
      if (Number.isNaN(dt)) continue;
      cum += e.delta != null ? e.delta : 1;
      pts.push({ t: dt, y: cum });
    }
    return pts;
  }

  function buildGlobalCumulativeSeries() {
    const flat = [];
    for (const c of state.counters) {
      if (!matchesGraphFilters(c)) continue;
      for (const e of c.events || []) {
        if (e.kind !== "encounter") continue;
        flat.push({ t: e.t, delta: e.delta != null ? e.delta : 1 });
      }
    }
    for (const p of state.pastCounters) {
      if (!matchesGraphFilters(p)) continue;
      for (const e of p.events || []) {
        if (e.kind !== "encounter") continue;
        flat.push({ t: e.t, delta: e.delta != null ? e.delta : 1 });
      }
    }
    flat.sort((a, b) => new Date(a.t) - new Date(b.t));
    let cum = 0;
    const pts = [];
    for (const e of flat) {
      const dt = new Date(e.t).getTime();
      if (Number.isNaN(dt)) continue;
      cum += e.delta;
      pts.push({ t: dt, y: cum });
    }
    return pts;
  }

  function buildRateSeries(events) {
    const enc = (events || [])
      .filter((e) => e.kind === "encounter")
      .slice()
      .sort((a, b) => new Date(a.t) - new Date(b.t));
    const raw = [];
    for (let i = 1; i < enc.length; i++) {
      const t0 = new Date(enc[i - 1].t).getTime();
      const t1 = new Date(enc[i].t).getTime();
      if (Number.isNaN(t0) || Number.isNaN(t1)) continue;
      const dt = (t1 - t0) / 1000;
      if (dt <= 0) continue;
      const d = enc[i].delta != null ? enc[i].delta : 1;
      const ratePerHour = (d / dt) * 3600;
      if (!Number.isFinite(ratePerHour) || ratePerHour < 0) continue;
      raw.push({ t: (t0 + t1) / 2, y: ratePerHour });
    }
    return filterRateOutliers(raw);
  }

  /**
   * Remove implausible rate spikes (e.g. bad imports: huge delta or overlapping timestamps).
   * Iteratively: drop points with y > mean + k·σ, recompute mean/σ on survivors until stable.
   */
  function filterRateOutliers(points) {
    if (points.length < 3) return points;
    let kept = points.slice();
    for (let iter = 0; iter < RATE_OUTLIER_MAX_ITERS; iter++) {
      const ys = kept.map((p) => p.y);
      const n = ys.length;
      const mean = ys.reduce((a, b) => a + b, 0) / n;
      let variance = 0;
      if (n > 1) {
        for (let i = 0; i < n; i++) variance += (ys[i] - mean) ** 2;
        variance /= n - 1;
      }
      const std = Math.sqrt(Math.max(0, variance));
      if (!Number.isFinite(std) || std < 1e-9) break;
      const ceiling = mean + RATE_OUTLIER_STD_MULTIPLE * std;
      const next = kept.filter((p) => p.y <= ceiling);
      if (next.length === kept.length) break;
      if (next.length < 2) return points;
      kept = next;
    }
    return kept;
  }

  function downsample(points, maxN) {
    if (points.length <= maxN) return points;
    const step = Math.ceil(points.length / maxN);
    const out = [];
    for (let i = 0; i < points.length; i += step) out.push(points[i]);
    if (out[out.length - 1] !== points[points.length - 1]) out.push(points[points.length - 1]);
    return out;
  }

  function drawLineChart(container, points, opts) {
    const color = opts.color || "#3d9eff";
    const yFormat = opts.yFormat || ((y) => String(Math.round(y * 100) / 100));
    container.innerHTML = "";
    if (!points.length) {
      const p = document.createElement("p");
      p.className = "empty-hint";
      p.textContent = "No data for this series yet.";
      container.appendChild(p);
      return;
    }
    const pts = downsample(points, 2500);
    const W = 920;
    const H = 300;
    const pad = { l: 52, r: 16, t: 16, b: 44 };
    const xs = pts.map((p) => p.t);
    const ys = pts.map((p) => p.y);
    let minX = Math.min(...xs);
    let maxX = Math.max(...xs);
    let minY = Math.min(...ys);
    let maxY = Math.max(...ys);
    if (minX === maxX) {
      minX -= 1;
      maxX += 1;
    }
    if (minY === maxY) {
      minY -= 1;
      maxY += 1;
    }
    const dx = maxX - minX;
    const dy = maxY - minY;
    const sx = (t) => pad.l + ((t - minX) / dx) * (W - pad.l - pad.r);
    const sy = (y) => pad.t + (1 - (y - minY) / dy) * (H - pad.t - pad.b);

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("class", "chart-svg");
    svg.setAttribute("role", "img");

    const path = pts
      .map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.t).toFixed(2)} ${sy(p.y).toFixed(2)}`)
      .join(" ");
    const pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
    pathEl.setAttribute("d", path);
    pathEl.setAttribute("fill", "none");
    pathEl.setAttribute("stroke", color);
    pathEl.setAttribute("stroke-width", "2");
    pathEl.setAttribute("stroke-linejoin", "round");
    pathEl.setAttribute("stroke-linecap", "round");
    svg.appendChild(pathEl);

    const x0 = new Date(minX).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
    const x1 = new Date(maxX).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
    const cap = document.createElementNS("http://www.w3.org/2000/svg", "text");
    cap.setAttribute("x", String(pad.l));
    cap.setAttribute("y", String(H - 8));
    cap.setAttribute("fill", "#8b9cb3");
    cap.setAttribute("font-size", "11");
    cap.textContent = `${x0} → ${x1}`;
    svg.appendChild(cap);

    const yl = document.createElementNS("http://www.w3.org/2000/svg", "text");
    yl.setAttribute("x", "8");
    yl.setAttribute("y", String(pad.t + 8));
    yl.setAttribute("fill", "#8b9cb3");
    yl.setAttribute("font-size", "11");
    yl.textContent = opts.yAxisLabel || "";
    svg.appendChild(yl);

    const yMin = document.createElementNS("http://www.w3.org/2000/svg", "text");
    yMin.setAttribute("x", String(W - pad.r - 4));
    yMin.setAttribute("y", String(H - pad.b));
    yMin.setAttribute("fill", "#8b9cb3");
    yMin.setAttribute("font-size", "10");
    yMin.setAttribute("text-anchor", "end");
    yMin.textContent = yFormat(minY);
    svg.appendChild(yMin);

    const yMax = document.createElementNS("http://www.w3.org/2000/svg", "text");
    yMax.setAttribute("x", String(W - pad.r - 4));
    yMax.setAttribute("y", String(pad.t + 12));
    yMax.setAttribute("fill", "#8b9cb3");
    yMax.setAttribute("font-size", "10");
    yMax.setAttribute("text-anchor", "end");
    yMax.textContent = yFormat(maxY);
    svg.appendChild(yMax);

    container.appendChild(svg);
  }

  function computeBucketedMeanRate(seriesList, nBuckets) {
    const n = Math.max(8, Math.min(64, nBuckets | 0));
    if (!seriesList.length) return [];
    const allT = [];
    for (const s of seriesList) {
      for (const p of s.points) allT.push(p.t);
    }
    if (!allT.length) return [];
    let minT = Math.min(...allT);
    let maxT = Math.max(...allT);
    if (maxT <= minT) maxT = minT + 1;
    const out = [];
    for (let b = 0; b < n; b++) {
      const t0 = minT + (b / n) * (maxT - minT);
      const t1 = minT + ((b + 1) / n) * (maxT - minT);
      const tMid = (t0 + t1) / 2;
      const last = b === n - 1;
      const ys = [];
      for (const s of seriesList) {
        for (const p of s.points) {
          if (last ? p.t >= t0 && p.t <= t1 : p.t >= t0 && p.t < t1) ys.push(p.y);
        }
      }
      if (ys.length) out.push({ t: tMid, y: ys.reduce((a, x) => a + x, 0) / ys.length });
    }
    return out;
  }

  function buildDashboardRateSeriesList() {
    const out = [];
    let idx = 0;
    for (const c of state.counters) {
      if (!matchesGraphFilters(c)) continue;
      const pts = buildRateSeries(c.events);
      if (!pts.length) continue;
      out.push({
        id: c.id,
        name: c.name || "Counter",
        kind: "active",
        points: downsample(pts, 500),
        color: `hsl(${(idx * 41) % 360}, 72%, 58%)`,
      });
      idx++;
    }
    for (const p of state.pastCounters) {
      if (!matchesGraphFilters(p)) continue;
      const pts = buildRateSeries(p.events);
      if (!pts.length) continue;
      out.push({
        id: p.id,
        name: p.name || "Past",
        kind: "past",
        points: downsample(pts, 500),
        color: `hsl(${(idx * 41 + 28) % 360}, 42%, 52%)`,
      });
      idx++;
    }
    return out;
  }

  function drawMultiSeriesRateChart(container, series) {
    if (!container) return;
    container.innerHTML = "";
    const hasData = series.some((s) => s.points.length);
    if (!series.length || !hasData) {
      const p = document.createElement("p");
      p.className = "empty-hint";
      p.textContent =
        "No rate data yet — each hunt needs at least two encounter events to compute intervals.";
      container.appendChild(p);
      return;
    }

    const avgPts = series.length >= 2 ? computeBucketedMeanRate(series, 48) : [];
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const s of series) {
      for (const pt of s.points) {
        minX = Math.min(minX, pt.t);
        maxX = Math.max(maxX, pt.t);
        minY = Math.min(minY, pt.y);
        maxY = Math.max(maxY, pt.y);
      }
    }
    for (const pt of avgPts) {
      minX = Math.min(minX, pt.t);
      maxX = Math.max(maxX, pt.t);
      minY = Math.min(minY, pt.y);
      maxY = Math.max(maxY, pt.y);
    }
    if (!Number.isFinite(minX) || minX === maxX) {
      minX -= 1;
      maxX += 1;
    }
    const yPad = (maxY - minY) * 0.08 || 1;
    minY -= yPad;
    maxY += yPad;
    if (minY === maxY) {
      minY -= 1;
      maxY += 1;
    }

    const W = 920;
    const H = 300;
    const pad = { l: 52, r: 16, t: 16, b: 52 };
    const dx = maxX - minX;
    const dy = maxY - minY;
    const sx = (t) => pad.l + ((t - minX) / dx) * (W - pad.l - pad.r);
    const sy = (y) => pad.t + (1 - (y - minY) / dy) * (H - pad.t - pad.b);

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("class", "chart-svg chart-svg--multiline");
    svg.setAttribute("role", "img");
    svg.setAttribute(
      "aria-label",
      "Encounter rate over time: one line per hunt plus optional average",
    );

    const yFmt = (y) => (y < 100 ? y.toFixed(0) : String(Math.round(y)));

    function addPath(pts, color, dashed, strokeWidth) {
      if (pts.length < 2) return;
      const d = pts
        .map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.t).toFixed(2)} ${sy(p.y).toFixed(2)}`)
        .join(" ");
      const pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
      pathEl.setAttribute("d", d);
      pathEl.setAttribute("fill", "none");
      pathEl.setAttribute("stroke", color);
      pathEl.setAttribute("stroke-width", String(strokeWidth));
      pathEl.setAttribute("stroke-linejoin", "round");
      pathEl.setAttribute("stroke-linecap", "round");
      if (dashed) pathEl.setAttribute("stroke-dasharray", "6 4");
      svg.appendChild(pathEl);
    }

    if (avgPts.length >= 2) {
      addPath(avgPts, "rgba(230, 237, 243, 0.4)", true, 2.5);
    }
    for (const s of series) {
      addPath(s.points, s.color, s.kind === "past", 2);
    }

    const maxCirclesPerSeries = 36;
    for (const s of series) {
      const pts = s.points;
      const step = Math.max(1, Math.ceil(pts.length / maxCirclesPerSeries));
      for (let i = 0; i < pts.length; i += step) {
        const pt = pts[i];
        const cx = sx(pt.t);
        const cy = sy(pt.y);
        const circ = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circ.setAttribute("cx", cx.toFixed(2));
        circ.setAttribute("cy", cy.toFixed(2));
        circ.setAttribute("r", "5");
        circ.setAttribute("fill", s.color);
        circ.setAttribute("fill-opacity", "0.35");
        circ.setAttribute("stroke", s.color);
        circ.setAttribute("stroke-width", "1");
        circ.setAttribute("class", "chart-rate-hit");
        const when = new Date(pt.t).toLocaleString(undefined, {
          dateStyle: "short",
          timeStyle: "short",
        });
        const prefix = s.kind === "past" ? "Past" : "Active";
        const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
        title.textContent = `${prefix}: ${s.name} — ${formatDashboardRate(pt.y)} at ${when}`;
        circ.appendChild(title);
        svg.appendChild(circ);
      }
    }

    if (avgPts.length >= 2) {
      const step = Math.max(1, Math.ceil(avgPts.length / 24));
      for (let i = 0; i < avgPts.length; i += step) {
        const pt = avgPts[i];
        const circ = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circ.setAttribute("cx", sx(pt.t).toFixed(2));
        circ.setAttribute("cy", sy(pt.y).toFixed(2));
        circ.setAttribute("r", "4");
        circ.setAttribute("fill", "#e6edf3");
        circ.setAttribute("fill-opacity", "0.5");
        circ.setAttribute("stroke", "#94a3b8");
        circ.setAttribute("stroke-width", "1");
        const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
        title.textContent = `Mean (bucketed across sessions) — ${formatDashboardRate(pt.y)} at ${new Date(pt.t).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}`;
        circ.appendChild(title);
        svg.appendChild(circ);
      }
    }

    const x0 = new Date(minX).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
    const x1 = new Date(maxX).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
    const cap = document.createElementNS("http://www.w3.org/2000/svg", "text");
    cap.setAttribute("x", String(pad.l));
    cap.setAttribute("y", String(H - 10));
    cap.setAttribute("fill", "#8b9cb3");
    cap.setAttribute("font-size", "11");
    cap.textContent = `${x0} → ${x1}`;
    svg.appendChild(cap);

    const yl = document.createElementNS("http://www.w3.org/2000/svg", "text");
    yl.setAttribute("x", "8");
    yl.setAttribute("y", String(pad.t + 8));
    yl.setAttribute("fill", "#8b9cb3");
    yl.setAttribute("font-size", "11");
    yl.textContent = "Enc/h";
    svg.appendChild(yl);

    const yMin = document.createElementNS("http://www.w3.org/2000/svg", "text");
    yMin.setAttribute("x", String(W - pad.r - 4));
    yMin.setAttribute("y", String(H - pad.b));
    yMin.setAttribute("fill", "#8b9cb3");
    yMin.setAttribute("font-size", "10");
    yMin.setAttribute("text-anchor", "end");
    yMin.textContent = yFmt(minY);
    svg.appendChild(yMin);

    const yMax = document.createElementNS("http://www.w3.org/2000/svg", "text");
    yMax.setAttribute("x", String(W - pad.r - 4));
    yMax.setAttribute("y", String(pad.t + 12));
    yMax.setAttribute("fill", "#8b9cb3");
    yMax.setAttribute("font-size", "10");
    yMax.setAttribute("text-anchor", "end");
    yMax.textContent = yFmt(maxY);
    svg.appendChild(yMax);

    container.appendChild(svg);

    const leg = document.createElement("div");
    leg.className = "chart-legend chart-legend--rate";
    for (const s of series) {
      const span = document.createElement("span");
      span.className = "chart-legend-item";
      const sw = document.createElement("span");
      sw.className = "chart-legend-swatch";
      sw.style.background = s.color;
      const lab = document.createElement("span");
      lab.textContent = `${s.kind === "past" ? "Past" : "Active"}: ${s.name}`;
      span.appendChild(sw);
      span.appendChild(lab);
      leg.appendChild(span);
    }
    if (avgPts.length >= 2) {
      const span = document.createElement("span");
      span.className = "chart-legend-item chart-legend-item--avg";
      span.textContent = "Mean (bucketed)";
      leg.appendChild(span);
    }
    container.appendChild(leg);
  }

  function totalEncountersAcrossHunts() {
    let s = 0;
    for (const c of state.counters) {
      if (!matchesGraphFilters(c)) continue;
      s += Math.trunc(c.value);
    }
    for (const p of state.pastCounters) {
      if (!matchesGraphFilters(p)) continue;
      s += Math.trunc(p.value);
    }
    return s;
  }

  function avgEncountersPerShiny() {
    const past = state.pastCounters.filter((p) => matchesGraphFilters(p));
    const n = past.length;
    if (!n) return null;
    const sum = past.reduce((a, p) => a + Math.trunc(p.value), 0);
    return sum / n;
  }

  function countFilteredHunts() {
    const active = state.counters.filter((c) => matchesGraphFilters(c)).length;
    const past = state.pastCounters.filter((p) => matchesGraphFilters(p)).length;
    return { active, past, total: active + past };
  }

  function getFilteredHunts() {
    const a = state.counters.filter((c) => matchesGraphFilters(c));
    const p = state.pastCounters.filter((x) => matchesGraphFilters(x));
    return [...a, ...p];
  }

  function totalEncountersActiveFiltered() {
    let s = 0;
    for (const c of state.counters) {
      if (!matchesGraphFilters(c)) continue;
      s += Math.trunc(c.value);
    }
    return s;
  }

  function totalEncountersPastFiltered() {
    let s = 0;
    for (const p of state.pastCounters) {
      if (!matchesGraphFilters(p)) continue;
      s += Math.trunc(p.value);
    }
    return s;
  }

  function sumEphFiltered() {
    let s = 0;
    for (const h of getFilteredHunts()) {
      s += computeEph(h);
    }
    return s;
  }

  function getFilteredEncounterTimeSpan() {
    let minT = Infinity;
    let maxT = -Infinity;
    let totalEnc = 0;
    for (const h of getFilteredHunts()) {
      for (const e of h.events || []) {
        if (e.kind !== "encounter") continue;
        const t = new Date(e.t).getTime();
        if (Number.isNaN(t)) continue;
        minT = Math.min(minT, t);
        maxT = Math.max(maxT, t);
        totalEnc += e.delta != null ? e.delta : 1;
      }
    }
    if (!Number.isFinite(minT) || maxT <= minT) return null;
    return { minT, maxT, durationMs: maxT - minT, totalEnc };
  }

  function overallAvgEncountersPerHourFiltered() {
    const span = getFilteredEncounterTimeSpan();
    if (!span || span.durationMs <= 0) return null;
    const hrs = span.durationMs / (60 * 60 * 1000);
    if (hrs <= 0) return null;
    return span.totalEnc / hrs;
  }

  function medianMergedIntervalRateFiltered() {
    const ev = [];
    for (const h of getFilteredHunts()) {
      for (const e of h.events || []) {
        if (e.kind === "encounter") ev.push(e);
      }
    }
    ev.sort((a, b) => new Date(a.t) - new Date(b.t));
    if (ev.length < 2) return null;
    const pts = buildRateSeries(ev);
    if (!pts.length) return null;
    const ys = pts.map((p) => p.y).sort((a, b) => a - b);
    return ys[Math.floor(ys.length / 2)];
  }

  function aggregateByGameFiltered() {
    const m = new Map();
    for (const h of getFilteredHunts()) {
      const g = h.game && h.game !== "(not set)" ? h.game : "(not set)";
      if (!m.has(g)) m.set(g, { game: g, hunts: 0, encounters: 0, eph: 0, active: 0, past: 0 });
      const row = m.get(g);
      row.hunts += 1;
      row.encounters += Math.trunc(h.value ?? 0);
      row.eph += computeEph(h);
      if (state.counters.some((c) => c.id === h.id)) row.active += 1;
      else row.past += 1;
    }
    return Array.from(m.values()).sort((a, b) => b.encounters - a.encounters);
  }

  function formatDashboardRate(y) {
    if (y == null || !Number.isFinite(y)) return "—";
    if (y < 100) return y.toFixed(1) + " /hr";
    return Math.round(y) + " /hr";
  }

  async function updateDashboardArt() {
    const media = document.getElementById("dashHuntMedia");
    const box = document.getElementById("dashBoxArt");
    const strip = document.getElementById("dashShinyStrip");
    const figBox = box?.closest("figure");
    const f = getGraphFilters();
    const hunts = [...state.counters, ...state.pastCounters].filter(matchesGraphFilters);
    let game = f.game || "";
    if (!game && hunts.length) game = hunts[0].game || "";
    if (!f.game) {
      const activeG = state.counters.filter((c) => matchesGraphFilters(c)).map((c) => c.game).filter(Boolean);
      if (activeG.length) game = activeG[0];
    }
    const boxUrl = getBoxArtUrl(game);
    if (box && figBox) {
      if (boxUrl) {
        box.onerror = () => {
          box.hidden = true;
          figBox.hidden = true;
        };
        box.src = boxUrl;
        box.hidden = false;
        figBox.hidden = false;
        box.alt = game ? `${game} box art` : "Game box art";
      } else {
        box.hidden = true;
        box.removeAttribute("src");
        figBox.hidden = true;
      }
    }

    let anySprite = false;
    if (strip) {
      strip.innerHTML = "";
      const active = state.counters.filter((c) => matchesGraphFilters(c));
      for (const c of active) {
        for (const slug of c.targets || []) {
          const dexId = await ensureSpeciesNationalId(slug);
          if (!dexId) continue;
          const spriteUrl = await getCachedShinySpriteUrl(dexId);
          if (!spriteUrl) continue;
          const fig = document.createElement("figure");
          fig.className = "dash-shiny-figure";
          const img = document.createElement("img");
          img.className = "dash-shiny-sprite";
          img.src = spriteUrl;
          img.alt = `Shiny ${formatSpeciesDisplayName(slug)}`;
          img.width = 96;
          img.height = 96;
          img.loading = "lazy";
          img.decoding = "async";
          img.onerror = () => {
            invalidateShinySpriteCache(dexId);
            fig.hidden = true;
          };
          const cap = document.createElement("figcaption");
          cap.className = "dash-sprite-caption";
          const nameSpan = document.createElement("span");
          nameSpan.className = "dash-sprite-name";
          nameSpan.textContent = formatSpeciesDisplayName(slug);
          const huntSpan = document.createElement("span");
          huntSpan.className = "dash-sprite-hunt";
          huntSpan.textContent = c.name || "Hunt";
          cap.appendChild(nameSpan);
          cap.appendChild(huntSpan);
          fig.appendChild(img);
          fig.appendChild(cap);
          strip.appendChild(fig);
          anySprite = true;
        }
      }
      strip.hidden = !anySprite;
    }

    if (media) {
      const showBox = box && !box.hidden;
      const show = showBox || anySprite;
      media.hidden = !show;
    }
  }

  function renderDashboard() {
    if (!dashStats || !chartDashboardCumulative) return;
    const total = totalEncountersAcrossHunts();
    const pastFiltered = state.pastCounters.filter((p) => matchesGraphFilters(p));
    const shinies = pastFiltered.length;
    const avg = avgEncountersPerShiny();
    const hc = countFilteredHunts();
    const encActive = totalEncountersActiveFiltered();
    const encPast = totalEncountersPastFiltered();
    const ephSum = sumEphFiltered();
    const medRate = medianMergedIntervalRateFiltered();
    const overallRate = overallAvgEncountersPerHourFiltered();
    const span = getFilteredEncounterTimeSpan();
    const spanHrs =
      span && span.durationMs > 0 ? (span.durationMs / (60 * 60 * 1000)).toFixed(1) : null;
    const byGame = aggregateByGameFiltered();

    dashStats.innerHTML = "";

    const row1 = document.createElement("div");
    row1.className = "dash-stats-row";
    row1.innerHTML = `
      <div class="dash-stat"><span class="dash-stat-label">Total encounters</span><span class="dash-stat-value">${total}</span></div>
      <div class="dash-stat"><span class="dash-stat-label">Hunts (filters)</span><span class="dash-stat-value">${hc.total}</span></div>
      <div class="dash-stat"><span class="dash-stat-label">Completed shinies</span><span class="dash-stat-value">${shinies}</span></div>
      <div class="dash-stat"><span class="dash-stat-label">Avg enc / shiny</span><span class="dash-stat-value">${avg != null ? avg.toFixed(1) : "—"}</span></div>
      <div class="dash-stat" title="Sum of encounters in the last 60 minutes across all filtered hunts (same window as each counter’s rate)."><span class="dash-stat-label">Enc last 60 min (Σ)</span><span class="dash-stat-value">${Math.round(ephSum)}</span></div>
      <div class="dash-stat" title="Median interval-based enc/h after merging all filtered hunts’ encounter events in time order (same outlier rule as charts: drop rates &gt; mean + 5σ, iteratively)."><span class="dash-stat-label">Median pace (merged)</span><span class="dash-stat-value">${formatDashboardRate(medRate)}</span></div>
    `;
    dashStats.appendChild(row1);

    const rowCmp = document.createElement("div");
    rowCmp.className = "dash-stats-row dash-stats-row--compare";
    rowCmp.innerHTML = `
      <div class="dash-stat dash-stat--wide"><span class="dash-stat-label">Active (filtered)</span><span class="dash-stat-value">${hc.active} hunts · ${encActive} enc</span></div>
      <div class="dash-stat dash-stat--wide"><span class="dash-stat-label">Past (filtered)</span><span class="dash-stat-value">${hc.past} hunts · ${encPast} enc</span></div>
    `;
    dashStats.appendChild(rowCmp);

    const rowRate = document.createElement("div");
    rowRate.className = "dash-stats-row";
    rowRate.innerHTML = `
      <div class="dash-stat" title="All encounter event deltas ÷ wall-clock time from first to last encounter (filtered)."><span class="dash-stat-label">Avg enc/h (full timeline)</span><span class="dash-stat-value">${formatDashboardRate(overallRate)}</span></div>
      <div class="dash-stat"><span class="dash-stat-label">Encounter span</span><span class="dash-stat-value">${spanHrs != null ? `${spanHrs} hr` : "—"}</span></div>
    `;
    dashStats.appendChild(rowRate);

    if (byGame.length) {
      const wrap = document.createElement("div");
      wrap.className = "dash-by-game";
      const h3 = document.createElement("h3");
      h3.className = "dash-subtitle";
      h3.textContent = "By game";
      const tbl = document.createElement("table");
      tbl.className = "dash-table";
      const thead = document.createElement("thead");
      thead.innerHTML =
        "<tr><th>Game</th><th>Hunts</th><th>Active</th><th>Past</th><th>Encounters</th><th>Last 60m (Σ)</th></tr>";
      tbl.appendChild(thead);
      const tbody = document.createElement("tbody");
      const limit = 24;
      for (let i = 0; i < Math.min(byGame.length, limit); i++) {
        const r = byGame[i];
        const tr = document.createElement("tr");
        tr.innerHTML = `<td class="dash-td-game">${escapeHtml(r.game)}</td><td>${r.hunts}</td><td>${r.active}</td><td>${r.past}</td><td>${r.encounters}</td><td>${formatEph(r.eph)}</td>`;
        tbody.appendChild(tr);
      }
      tbl.appendChild(tbody);
      wrap.appendChild(h3);
      wrap.appendChild(tbl);
      if (byGame.length > limit) {
        const note = document.createElement("p");
        note.className = "dash-table-note";
        note.textContent = `Showing top ${limit} games by total encounters (${byGame.length} games total).`;
        wrap.appendChild(note);
      }
      dashStats.appendChild(wrap);
    }

    const glob = buildGlobalCumulativeSeries();
    drawLineChart(chartDashboardCumulative, glob, {
      color: "#5eb0ff",
      yAxisLabel: "Encounters (filtered hunts)",
      yFormat: (y) => String(Math.round(y)),
    });
    drawMultiSeriesRateChart(chartDashboardRate, buildDashboardRateSeriesList());
    void updateDashboardArt();
  }

  function fillCompareSelect(sel, keepValue) {
    if (!sel) return;
    const prev = keepValue !== undefined ? keepValue : sel.value;
    sel.innerHTML = "";
    const o0 = document.createElement("option");
    o0.value = "";
    o0.textContent = "(none)";
    sel.appendChild(o0);
    for (const c of state.counters) {
      if (!matchesGraphFilters(c)) continue;
      const o = document.createElement("option");
      o.value = c.id;
      o.textContent = "Active: " + (c.name || c.id.slice(0, 8));
      sel.appendChild(o);
    }
    for (const p of state.pastCounters) {
      if (!matchesGraphFilters(p)) continue;
      const o = document.createElement("option");
      o.value = p.id;
      o.textContent = "Past: " + (p.name || p.id.slice(0, 8));
      sel.appendChild(o);
    }
    const opts = [...sel.options].map((o) => o.value);
    if (prev && opts.includes(prev)) sel.value = prev;
    else sel.value = "";
  }

  async function updateCompareArt(slot, huntId) {
    const box = document.querySelector(`[data-compare-box="${slot}"]`);
    const shiny = document.querySelector(`[data-compare-shiny="${slot}"]`);
    if (!box || !shiny) return;
    const h = huntId ? counterById(huntId) || pastCounterById(huntId) : null;
    if (!h) {
      box.hidden = true;
      shiny.hidden = true;
      box.removeAttribute("src");
      shiny.removeAttribute("src");
      return;
    }
    const game = h.game || "";
    const boxUrl = getBoxArtUrl(game);
    if (boxUrl) {
      box.onerror = () => {
        box.hidden = true;
      };
      box.src = boxUrl;
      box.hidden = false;
      box.alt = game ? `${game} box art` : "Game box art";
    } else {
      box.hidden = true;
      box.removeAttribute("src");
    }
    const slug = Array.isArray(h.targets) && h.targets[0] ? h.targets[0] : null;
    if (!slug) {
      shiny.hidden = true;
      shiny.removeAttribute("src");
      return;
    }
    const dexId = await ensureSpeciesNationalId(slug);
    if (dexId) {
      const spriteUrl = await getCachedShinySpriteUrl(dexId);
      if (spriteUrl) {
        shiny.onerror = () => {
          invalidateShinySpriteCache(dexId);
          shiny.hidden = true;
        };
        shiny.src = spriteUrl;
        shiny.hidden = false;
        shiny.alt = `Shiny ${formatSpeciesDisplayName(slug)}`;
      } else {
        shiny.hidden = true;
        shiny.removeAttribute("src");
      }
    } else {
      shiny.hidden = true;
      shiny.removeAttribute("src");
    }
  }

  function renderCompareSlot(slot) {
    const pick = document.getElementById(`graphPick${slot}`);
    const chartCum = document.getElementById(`chartCompare${slot}`);
    const chartR = document.getElementById(`chartCompare${slot}Rate`);
    const rateCb = document.querySelector(`.graph-rate-cb[data-chart="${slot}"]`);
    if (!pick || !chartCum || !chartR) return;
    const id = pick.value;
    if (!id) {
      chartCum.innerHTML = '<p class="empty-hint">Select a hunt.</p>';
      chartR.innerHTML = "";
      chartR.classList.add("chart-container--hidden");
      void updateCompareArt(slot, "");
      return;
    }
    const events = getHuntEvents(id);
    const cum = buildCumulativeSeries(events);
    drawLineChart(chartCum, cum, {
      color: "#5eb0ff",
      yAxisLabel: "Encounters",
      yFormat: (y) => String(Math.round(y)),
    });
    if (rateCb && rateCb.checked) {
      chartR.classList.remove("chart-container--hidden");
      const rates = buildRateSeries(events);
      drawLineChart(chartR, rates, {
        color: "#4ade80",
        yAxisLabel: "Enc/h",
        yFormat: (y) => (y < 100 ? y.toFixed(0) : String(Math.round(y))),
      });
    } else {
      chartR.classList.add("chart-container--hidden");
      chartR.innerHTML = "";
    }
    void updateCompareArt(slot, id);
  }

  function renderCompareCharts() {
    fillCompareSelect(document.getElementById("graphPick1"));
    fillCompareSelect(document.getElementById("graphPick2"));
    fillCompareSelect(document.getElementById("graphPick3"));
    renderCompareSlot(1);
    renderCompareSlot(2);
    renderCompareSlot(3);
  }

  function renderTrackerHistoryTable() {
    if (!trackerHistoryMount) return;
    trackerHistoryMount.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "history-tables";

    const activeTitle = document.createElement("h3");
    activeTitle.className = "history-subtitle";
    activeTitle.textContent = "Active trackers";
    wrap.appendChild(activeTitle);

    const t1 = document.createElement("table");
    t1.className = "history-table";
    t1.innerHTML =
      "<thead><tr><th>Name</th><th>Game</th><th>Method</th><th>Targets</th><th>Created</th><th>Encounters</th><th>Events</th></tr></thead><tbody></tbody>";
    const b1 = t1.querySelector("tbody");
    for (const c of state.counters) {
      if (!matchesGraphFilters(c)) continue;
      const tr = document.createElement("tr");
      const created = c.createdAt ? new Date(c.createdAt).toLocaleString() : "—";
      const evn = (c.events || []).length;
      const g = c.game && c.game !== "(not set)" ? escapeHtml(c.game) : "—";
      const m = c.huntingMethod && c.huntingMethod !== "(not set)" ? escapeHtml(c.huntingMethod) : "—";
      const tg = escapeHtml(formatTargetsCell(c.targets));
      tr.innerHTML = `<td>${escapeHtml(c.name || "")}</td><td>${g}</td><td>${m}</td><td>${tg}</td><td>${created}</td><td>${c.value}</td><td>${evn}</td>`;
      b1.appendChild(tr);
    }
    const activeShown = b1.querySelectorAll("tr").length;
    if (activeShown === 0) {
      const tr = document.createElement("tr");
      tr.innerHTML =
        state.counters.length === 0
          ? '<td colspan="7" class="history-empty">No active counters</td>'
          : '<td colspan="7" class="history-empty">No active trackers match the current filters</td>';
      b1.appendChild(tr);
    }
    wrap.appendChild(t1);

    const pastTitle = document.createElement("h3");
    pastTitle.className = "history-subtitle";
    pastTitle.textContent = "Past catches (completed)";
    wrap.appendChild(pastTitle);

    const tPast = document.createElement("table");
    tPast.className = "history-table";
    tPast.innerHTML =
      "<thead><tr><th>Name</th><th>Game</th><th>Method</th><th>Targets</th><th>Encounters</th><th>Completed</th><th>Created</th></tr></thead><tbody></tbody>";
    const bp = tPast.querySelector("tbody");
    const pastSorted = [...state.pastCounters].sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
    let pastShown = 0;
    for (const p of pastSorted) {
      if (!matchesGraphFilters(p)) continue;
      pastShown++;
      const tr = document.createElement("tr");
      const cr = p.createdAt ? new Date(p.createdAt).toLocaleString() : "—";
      const done = p.completedAt ? new Date(p.completedAt).toLocaleString() : "—";
      const g = p.game && p.game !== "(not set)" ? escapeHtml(p.game) : "—";
      const m = p.huntingMethod && p.huntingMethod !== "(not set)" ? escapeHtml(p.huntingMethod) : "—";
      const tg = escapeHtml(formatTargetsCell(p.targets));
      tr.innerHTML = `<td>${escapeHtml(p.name || "")}</td><td>${g}</td><td>${m}</td><td>${tg}</td><td>${p.value}</td><td>${done}</td><td>${cr}</td>`;
      bp.appendChild(tr);
    }
    if (pastShown === 0) {
      const tr = document.createElement("tr");
      tr.innerHTML =
        pastSorted.length === 0
          ? '<td colspan="7" class="history-empty">No completed catches yet — use Catch on a counter.</td>'
          : '<td colspan="7" class="history-empty">No past catches match the current filters</td>';
      bp.appendChild(tr);
    }
    wrap.appendChild(tPast);

    const remTitle = document.createElement("h3");
    remTitle.className = "history-subtitle";
    remTitle.textContent = "Removed trackers";
    wrap.appendChild(remTitle);

    const t2 = document.createElement("table");
    t2.className = "history-table";
    t2.innerHTML =
      "<thead><tr><th>Name</th><th>Created</th><th>Removed</th><th>Last enc.</th></tr></thead><tbody></tbody>";
    const b2 = t2.querySelector("tbody");
    const hist = [...state.trackerHistory].sort((a, b) => new Date(b.removedAt) - new Date(a.removedAt));
    let remShown = 0;
    for (const h of hist) {
      if (!matchesGraphFilters(h)) continue;
      remShown++;
      const tr = document.createElement("tr");
      const cr = h.createdAt ? new Date(h.createdAt).toLocaleString() : "—";
      const rm = h.removedAt ? new Date(h.removedAt).toLocaleString() : "—";
      tr.innerHTML = `<td>${escapeHtml(h.name || "")}</td><td>${cr}</td><td>${rm}</td><td>${h.lastEncounters ?? "—"}</td>`;
      b2.appendChild(tr);
    }
    if (remShown === 0) {
      const tr = document.createElement("tr");
      tr.innerHTML =
        hist.length === 0
          ? '<td colspan="4" class="history-empty">No removed trackers yet</td>'
          : '<td colspan="4" class="history-empty">No removed trackers match the current filters</td>';
      b2.appendChild(tr);
    }
    wrap.appendChild(t2);

    trackerHistoryMount.appendChild(wrap);
  }

  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function isoToDatetimeLocalValue(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function openPastCaptureEditDialog(pastId) {
    const p = pastCounterById(pastId);
    if (!p) return;
    let dlg = document.getElementById("pastCaptureEditDialog");
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.id = "pastCaptureEditDialog";
      dlg.className = "past-capture-dialog";
      document.body.appendChild(dlg);
    }
    dlg.innerHTML = "";

    const head = document.createElement("h3");
    head.className = "past-capture-dialog-title";
    head.textContent = "Edit capture";

    const form = document.createElement("form");
    form.className = "past-capture-form";

    function field(labelText, control) {
      const w = document.createElement("div");
      w.className = "past-capture-field";
      const lab = document.createElement("label");
      lab.className = "field-label";
      lab.textContent = labelText;
      w.appendChild(lab);
      w.appendChild(control);
      return w;
    }

    const nameIn = document.createElement("input");
    nameIn.type = "text";
    nameIn.className = "counter-name";
    nameIn.value = p.name || "";
    nameIn.autocomplete = "off";

    const gameSel = document.createElement("select");
    gameSel.className = "hunt-select";
    populateGameSelect(gameSel, p.game);

    const methodSel = document.createElement("select");
    methodSel.className = "hunt-select";
    for (const m of UI.HUNTING_METHODS) {
      const o = document.createElement("option");
      o.value = m;
      o.textContent = m;
      if ((p.huntingMethod || "(not set)") === m) o.selected = true;
      methodSel.appendChild(o);
    }

    const valIn = document.createElement("input");
    valIn.type = "number";
    valIn.className = "value-input";
    valIn.min = "0";
    valIn.step = "1";
    valIn.value = String(Math.max(0, Math.trunc(Number(p.value)) || 0));

    const notesTa = document.createElement("textarea");
    notesTa.className = "hunt-notes";
    notesTa.rows = 3;
    notesTa.value = p.notes || "";

    const completedIn = document.createElement("input");
    completedIn.type = "datetime-local";
    completedIn.className = "counter-name";
    completedIn.value = isoToDatetimeLocalValue(p.completedAt);

    const oddsCb = document.createElement("input");
    oddsCb.type = "checkbox";
    oddsCb.id = "past-cap-odds";
    oddsCb.checked = !!p.includeOdds;

    const oddsCbLab = document.createElement("label");
    oddsCbLab.className = "odds-cb-label";
    oddsCbLab.htmlFor = "past-cap-odds";
    oddsCbLab.textContent = "Include odds (for charts / history)";

    const oddsCbRow = document.createElement("div");
    oddsCbRow.className = "odds-cb-row";
    oddsCbRow.appendChild(oddsCb);
    oddsCbRow.appendChild(oddsCbLab);

    const oddsSel = document.createElement("select");
    oddsSel.className = "hunt-select";
    oddsSel.disabled = !p.includeOdds;
    for (const op of UI.ODDS_PRESETS) {
      const o = document.createElement("option");
      o.value = op.id;
      o.textContent = op.label;
      if ((p.oddsPresetId || "full-auto") === op.id) o.selected = true;
      oddsSel.appendChild(o);
    }
    oddsCb.addEventListener("change", () => {
      oddsSel.disabled = !oddsCb.checked;
    });

    form.appendChild(field("Counter name", nameIn));
    form.appendChild(field("Pokémon game", gameSel));
    form.appendChild(field("Hunting method", methodSel));
    form.appendChild(field("Encounters at catch", valIn));
    form.appendChild(field("Caught at (local time)", completedIn));
    form.appendChild(field("Notes", notesTa));
    form.appendChild(oddsCbRow);
    form.appendChild(field("Odds preset", oddsSel));

    const hint = document.createElement("p");
    hint.className = "field-hint past-capture-edit-hint";
    hint.textContent =
      "Targets are unchanged here — restore the hunt to edit species. Changing encounters does not rewrite event history.";

    const actions = document.createElement("div");
    actions.className = "past-capture-dialog-actions";
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => dlg.close());
    const saveBtn = document.createElement("button");
    saveBtn.type = "submit";
    saveBtn.className = "btn primary";
    saveBtn.textContent = "Save";
    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);

    form.appendChild(hint);
    form.appendChild(actions);

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const cur = pastCounterById(pastId);
      if (!cur) {
        dlg.close();
        return;
      }
      cur.name = nameIn.value.trim();
      cur.game = gameSel.value;
      cur.huntingMethod = methodSel.value;
      const n = Math.trunc(Number(valIn.value));
      if (Number.isFinite(n) && n >= 0) cur.value = n;
      cur.notes = notesTa.value;
      const dt = new Date(completedIn.value);
      if (!Number.isNaN(dt.getTime())) cur.completedAt = dt.toISOString();
      cur.includeOdds = oddsCb.checked;
      cur.oddsPresetId = oddsSel.value || "full-auto";
      dlg.close();
      scheduleSave();
      renderGraphsIfVisible();
    });

    dlg.appendChild(head);
    dlg.appendChild(form);
    if (typeof dlg.showModal === "function") dlg.showModal();
    else dlg.setAttribute("open", "");
  }

  function renderCapturesDashboard() {
    if (!capturesDashboardMount) return;
    capturesDashboardMount.innerHTML = "";
    const sorted = [...state.pastCounters].sort(
      (a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0),
    );
    const rows = sorted.filter((p) => matchesGraphFilters(p));

    const t = document.createElement("table");
    t.className = "history-table captures-table";
    t.innerHTML =
      "<thead><tr><th>Name</th><th>Game</th><th>Method</th><th>Targets</th><th>Encounters</th><th>Caught</th><th>Actions</th></tr></thead><tbody></tbody>";
    const tb = t.querySelector("tbody");

    if (rows.length === 0) {
      const tr = document.createElement("tr");
      tr.innerHTML =
        sorted.length === 0
          ? '<td colspan="7" class="history-empty">No captures yet — use Catch on a counter.</td>'
          : '<td colspan="7" class="history-empty">No captures match the current filters</td>';
      tb.appendChild(tr);
    } else {
      for (const p of rows) {
        const tr = document.createElement("tr");
        const done = p.completedAt ? new Date(p.completedAt).toLocaleString() : "—";
        const g = p.game && p.game !== "(not set)" ? escapeHtml(p.game) : "—";
        const m = p.huntingMethod && p.huntingMethod !== "(not set)" ? escapeHtml(p.huntingMethod) : "—";
        const tg = escapeHtml(formatTargetsCell(p.targets));
        tr.innerHTML = `<td>${escapeHtml(p.name || "")}</td><td>${g}</td><td>${m}</td><td>${tg}</td><td>${Math.trunc(Number(p.value)) || 0}</td><td>${escapeHtml(done)}</td>`;
        const tdAct = document.createElement("td");
        tdAct.className = "captures-actions";
        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "btn small";
        editBtn.textContent = "Edit";
        editBtn.addEventListener("click", () => openPastCaptureEditDialog(p.id));
        const restoreBtn = document.createElement("button");
        restoreBtn.type = "button";
        restoreBtn.className = "btn small";
        restoreBtn.textContent = "Restore";
        restoreBtn.title = "Move this hunt back to active counters (same as Undo on the catch toast)";
        restoreBtn.addEventListener("click", () => {
          if (undoCatchRestoreActive(p.id)) {
            dismissCatchToast();
            showStatus("Hunt restored to Counters");
          }
        });
        tdAct.appendChild(editBtn);
        tdAct.appendChild(restoreBtn);
        tr.appendChild(tdAct);
        tb.appendChild(tr);
      }
    }
    capturesDashboardMount.appendChild(t);
  }

  function populateGraphFilterDropdowns() {
    if (!graphFilterGame || !state.graphUi) return;
    const f = state.graphUi.filters;
    const curGame = f.game || "";
    graphFilterGame.innerHTML = "";
    const oAny = document.createElement("option");
    oAny.value = "";
    oAny.textContent = "(any)";
    graphFilterGame.appendChild(oAny);
    const groups = UI.POKEMON_GAME_GROUPS || [];
    for (const group of groups) {
      const og = document.createElement("optgroup");
      og.label = group.label;
      for (const g of group.games || []) {
        const o = document.createElement("option");
        o.value = g;
        o.textContent = g;
        og.appendChild(o);
      }
      graphFilterGame.appendChild(og);
    }
    let found = false;
    for (const o of graphFilterGame.options) {
      if (o.value === curGame) {
        o.selected = true;
        found = true;
        break;
      }
    }
    if (!found && curGame) {
      const og = document.createElement("optgroup");
      og.label = "Other";
      const o = document.createElement("option");
      o.value = curGame;
      o.textContent = curGame;
      o.selected = true;
      og.appendChild(o);
      graphFilterGame.appendChild(og);
    }

    if (graphFilterOdds) {
      const curO = f.oddsPresetId || "";
      graphFilterOdds.innerHTML = "";
      const z = document.createElement("option");
      z.value = "";
      z.textContent = "(any)";
      graphFilterOdds.appendChild(z);
      for (const op of UI.ODDS_PRESETS) {
        const o = document.createElement("option");
        o.value = op.id;
        o.textContent = op.label;
        graphFilterOdds.appendChild(o);
      }
      graphFilterOdds.value = [...graphFilterOdds.options].some((x) => x.value === curO) ? curO : "";
    }

    if (graphFilterMethod) {
      const curM = f.huntingMethod || "";
      graphFilterMethod.innerHTML = "";
      const z = document.createElement("option");
      z.value = "";
      z.textContent = "(any)";
      graphFilterMethod.appendChild(z);
      for (const m of UI.HUNTING_METHODS) {
        const o = document.createElement("option");
        o.value = m;
        o.textContent = m;
        graphFilterMethod.appendChild(o);
      }
      graphFilterMethod.value = [...graphFilterMethod.options].some((x) => x.value === curM) ? curM : "";
    }

    if (graphFilterOddsTracking) {
      graphFilterOddsTracking.value = f.oddsTracking || "all";
    }
  }

  function syncGraphSubPanel() {
    const sub = state.graphUi?.subPanel || "dashboard";
    document.querySelectorAll("[data-graph-panel]").forEach((btn) => {
      const id = btn.dataset.graphPanel;
      const on = id === sub;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    if (graphPanelDashboard) {
      graphPanelDashboard.classList.toggle("graph-subpanel--hidden", sub !== "dashboard");
    }
    if (graphPanelCompare) {
      graphPanelCompare.classList.toggle("graph-subpanel--hidden", sub !== "compare");
    }
    if (graphPanelHistory) {
      graphPanelHistory.classList.toggle("graph-subpanel--hidden", sub !== "history");
    }
    if (graphPanelCaptures) {
      graphPanelCaptures.classList.toggle("graph-subpanel--hidden", sub !== "captures");
    }
  }

  function renderGraphs() {
    populateGraphFilterDropdowns();
    syncGraphSubPanel();
    renderDashboard();
    renderCapturesDashboard();
    renderCompareCharts();
    renderTrackerHistoryTable();
  }

  function renderGraphsIfVisible() {
    if (!panelGraphs.hidden) renderGraphs();
  }

  let graphNavBound = false;
  function setupGraphNav() {
    if (graphNavBound) return;
    graphNavBound = true;
    document.querySelectorAll("[data-graph-panel]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const panel = btn.dataset.graphPanel;
        if (!panel || !state.graphUi) return;
        state.graphUi.subPanel = panel;
        syncGraphSubPanel();
        scheduleSave();
      });
    });
  }

  let graphFiltersBound = false;
  function setupGraphFilters() {
    if (graphFiltersBound) return;
    graphFiltersBound = true;
    const onChange = () => {
      if (!state.graphUi) return;
      if (!state.graphUi.filters) state.graphUi.filters = {};
      const f = state.graphUi.filters;
      if (graphFilterGame) f.game = graphFilterGame.value || "";
      if (graphFilterOdds) f.oddsPresetId = graphFilterOdds.value || "";
      if (graphFilterMethod) f.huntingMethod = graphFilterMethod.value || "";
      if (graphFilterOddsTracking) f.oddsTracking = graphFilterOddsTracking.value || "all";
      scheduleSave();
      renderGraphs();
    };
    [graphFilterGame, graphFilterOdds, graphFilterMethod, graphFilterOddsTracking].forEach((el) => {
      if (el) el.addEventListener("change", onChange);
    });
  }

  function setupTabs() {
    document.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.dataset.tab;
        document.querySelectorAll("[data-tab]").forEach((b) => {
          const on = b === btn;
          b.classList.toggle("active", on);
          b.setAttribute("aria-selected", on ? "true" : "false");
        });
        if (tab === "main") {
          panelMain.hidden = false;
          panelGraphs.hidden = true;
        } else {
          panelMain.hidden = true;
          panelGraphs.hidden = false;
          renderGraphs();
        }
      });
    });
    [1, 2, 3].forEach((slot) => {
      const pick = document.getElementById(`graphPick${slot}`);
      if (pick) pick.addEventListener("change", () => renderCompareSlot(slot));
    });
    document.querySelectorAll(".graph-rate-cb").forEach((cb) => {
      cb.addEventListener("change", () => {
        const slot = cb.getAttribute("data-chart");
        if (slot) renderCompareSlot(slot);
      });
    });
  }

  function render() {
    applyBoardLayout();
    board.innerHTML = "";

    if (state.counters.length === 0) {
      const hint = document.createElement("div");
      hint.className = "empty-hint";
      hint.textContent = 'No counters yet. Click "Add counter" to start.';
      board.appendChild(hint);
      renderGraphsIfVisible();
      return;
    }

    for (const c of state.counters) {
      const card = document.createElement("section");
      card.className = "card";
      card.dataset.counterId = c.id;

      const head = document.createElement("div");
      head.className = "card-head";

      const nameField = document.createElement("div");
      nameField.className = "name-field";

      const nameLabel = document.createElement("label");
      nameLabel.className = "field-label";
      nameLabel.htmlFor = `counter-name-${c.id}`;
      nameLabel.textContent = "Counter name";

      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.id = `counter-name-${c.id}`;
      nameInput.className = "counter-name";
      nameInput.value = c.name || "";
      nameInput.placeholder = "e.g. Grass route, Gym 3";
      nameInput.autocomplete = "off";
      nameInput.setAttribute("aria-label", "Counter name");
      nameInput.addEventListener("change", () => setName(c.id, nameInput.value));
      nameInput.addEventListener("blur", () => setName(c.id, nameInput.value));

      nameField.appendChild(nameLabel);
      nameField.appendChild(nameInput);

      const actions = document.createElement("div");
      actions.className = "card-actions";
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "btn danger small";
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", () => removeCounter(c.id));
      actions.appendChild(removeBtn);

      head.appendChild(nameField);
      head.appendChild(actions);

      const huntDetails = document.createElement("details");
      huntDetails.className = "panel-disclosure hunt-disclosure";
      huntDetails.open = !!c.huntPanelExpanded;
      huntDetails.addEventListener("toggle", () => {
        const cc = counterById(c.id);
        if (cc) cc.huntPanelExpanded = huntDetails.open;
        scheduleSave();
      });

      const huntSum = document.createElement("summary");
      huntSum.className = "panel-disclosure-summary";
      const huntSumTitle = document.createElement("span");
      huntSumTitle.className = "panel-disclosure-title";
      huntSumTitle.textContent = "Hunt details";
      const huntSumMeta = document.createElement("span");
      huntSumMeta.className = "panel-disclosure-selected";
      huntSumMeta.textContent = formatHuntCompact(c);
      huntSum.appendChild(huntSumTitle);
      huntSum.appendChild(huntSumMeta);

      const huntBody = document.createElement("div");
      huntBody.className = "hunt-options hunt-options-body";

      const huntGrid = document.createElement("div");
      huntGrid.className = "hunt-options-grid";

      const gameWrap = document.createElement("div");
      gameWrap.className = "hunt-field";
      const gameLab = document.createElement("label");
      gameLab.className = "field-label";
      gameLab.htmlFor = `hunt-game-${c.id}`;
      gameLab.textContent = "Pokémon game";
      const gameSel = document.createElement("select");
      gameSel.id = `hunt-game-${c.id}`;
      gameSel.className = "hunt-select";
      populateGameSelect(gameSel, c.game);
      gameSel.addEventListener("change", () => setHuntGame(c.id, gameSel.value));
      gameWrap.appendChild(gameLab);
      gameWrap.appendChild(gameSel);

      const methodWrap = document.createElement("div");
      methodWrap.className = "hunt-field";
      const methodLab = document.createElement("label");
      methodLab.className = "field-label";
      methodLab.htmlFor = `hunt-method-${c.id}`;
      methodLab.textContent = "Hunting method";
      const methodSel = document.createElement("select");
      methodSel.id = `hunt-method-${c.id}`;
      methodSel.className = "hunt-select";
      for (const m of UI.HUNTING_METHODS) {
        const o = document.createElement("option");
        o.value = m;
        o.textContent = m;
        const cur = c.huntingMethod || "(not set)";
        if (cur === m) o.selected = true;
        methodSel.appendChild(o);
      }
      methodSel.addEventListener("change", () => setHuntingMethod(c.id, methodSel.value));
      methodWrap.appendChild(methodLab);
      methodWrap.appendChild(methodSel);

      huntGrid.appendChild(gameWrap);
      huntGrid.appendChild(methodWrap);

      const oddsBlock = document.createElement("div");
      oddsBlock.className = "hunt-field hunt-field--full odds-block";

      const oddsCbRow = document.createElement("div");
      oddsCbRow.className = "odds-cb-row";
      const oddsCb = document.createElement("input");
      oddsCb.type = "checkbox";
      oddsCb.id = `hunt-odds-${c.id}`;
      oddsCb.checked = !!c.includeOdds;
      oddsCb.addEventListener("change", () => setIncludeOdds(c.id, oddsCb.checked));
      const oddsCbLab = document.createElement("label");
      oddsCbLab.className = "odds-cb-label";
      oddsCbLab.htmlFor = `hunt-odds-${c.id}`;
      oddsCbLab.textContent = "Include odds (shown with encounters; default Full odds for selected game)";
      oddsCbRow.appendChild(oddsCb);
      oddsCbRow.appendChild(oddsCbLab);

      const oddsSelLab = document.createElement("label");
      oddsSelLab.className = "field-label";
      oddsSelLab.htmlFor = `hunt-odds-preset-${c.id}`;
      oddsSelLab.textContent = "Odds preset";

      const oddsSel = document.createElement("select");
      oddsSel.id = `hunt-odds-preset-${c.id}`;
      oddsSel.className = "hunt-select";
      oddsSel.disabled = !c.includeOdds;
      for (const op of UI.ODDS_PRESETS) {
        const o = document.createElement("option");
        o.value = op.id;
        o.textContent = op.label;
        if ((c.oddsPresetId || "full-auto") === op.id) o.selected = true;
        oddsSel.appendChild(o);
      }
      oddsSel.addEventListener("change", () => setOddsPreset(c.id, oddsSel.value));

      oddsBlock.appendChild(oddsCbRow);
      oddsBlock.appendChild(oddsSelLab);
      oddsBlock.appendChild(oddsSel);

      const targetsWrap = document.createElement("div");
      targetsWrap.className = "hunt-field hunt-field--full targets-field";
      const targetsLab = document.createElement("label");
      targetsLab.className = "field-label";
      targetsLab.htmlFor = `hunt-targets-search-${c.id}`;
      targetsLab.textContent = "Target Pokémon";
      const targetsHint = document.createElement("p");
      targetsHint.className = "field-hint";
      targetsHint.textContent =
        "Search and add species from your selected game’s Pokédex (loaded from PokéAPI). Changing the game clears targets.";
      const chipsRow = document.createElement("div");
      chipsRow.className = "target-chips";
      for (const slug of c.targets || []) {
        const chip = document.createElement("span");
        chip.className = "target-chip";
        const chipLabel = document.createElement("span");
        chipLabel.textContent = formatSpeciesDisplayName(slug);
        const chipRm = document.createElement("button");
        chipRm.type = "button";
        chipRm.className = "target-chip-remove";
        chipRm.setAttribute("aria-label", `Remove ${formatSpeciesDisplayName(slug)}`);
        chipRm.textContent = "×";
        chipRm.addEventListener("click", () => removeTargetSpecies(c.id, slug));
        chip.appendChild(chipLabel);
        chip.appendChild(chipRm);
        chipsRow.appendChild(chip);
      }
      const searchWrap = document.createElement("div");
      searchWrap.className = "target-search-wrap";
      const searchIn = document.createElement("input");
      searchIn.type = "text";
      searchIn.id = `hunt-targets-search-${c.id}`;
      searchIn.className = "target-search-input";
      searchIn.autocomplete = "off";
      searchIn.placeholder = "Search species…";
      searchIn.setAttribute("aria-label", "Search Pokémon species for targets");
      const sugList = document.createElement("ul");
      sugList.className = "target-suggestions";
      sugList.hidden = true;
      sugList.setAttribute("role", "listbox");
      const statusElTargets = document.createElement("p");
      statusElTargets.className = "target-status";

      const gameOk = c.game && c.game !== "(not set)";
      const hasMap = gameOk && getPokedexIdsForGame(c.game);
      if (!gameOk) {
        searchIn.disabled = true;
        statusElTargets.textContent = "Select a Pokémon game above to load a species list.";
      } else if (!hasMap) {
        searchIn.disabled = true;
        statusElTargets.textContent = "No Pokédex mapping for this title — name targets in notes.";
      } else {
        statusElTargets.textContent = "Focus the search box to load the dex, then type to filter.";
      }

      const pickerState = { list: null, loading: false };

      function renderSuggestions(query) {
        sugList.innerHTML = "";
        const q = (query || "").trim().toLowerCase();
        if (!pickerState.list || !q) {
          sugList.hidden = true;
          return;
        }
        const matches = pickerState.list
          .filter(
            (x) =>
              !c.targets.includes(x.slug) &&
              (x.display.toLowerCase().includes(q) || x.slug.includes(q)),
          )
          .slice(0, 24);
        if (!matches.length) {
          sugList.hidden = true;
          return;
        }
        for (const x of matches) {
          const li = document.createElement("li");
          li.className = "target-suggestion";
          li.setAttribute("role", "option");
          li.textContent = x.display;
          li.addEventListener("mousedown", (e) => {
            e.preventDefault();
            addTargetSpecies(c.id, x.slug);
            searchIn.value = "";
            sugList.hidden = true;
          });
          sugList.appendChild(li);
        }
        sugList.hidden = false;
      }

      searchIn.addEventListener("focus", async () => {
        if (!gameOk || !hasMap || pickerState.loading || pickerState.list) return;
        pickerState.loading = true;
        statusElTargets.textContent = "Loading Pokédex…";
        const res = await loadSpeciesForGame(c.game);
        pickerState.loading = false;
        if (!res.ok) {
          statusElTargets.textContent =
            res.error === "no-map"
              ? "No Pokédex mapping for this title."
              : `Could not load Pokédex (${res.error}). Check your connection.`;
          return;
        }
        pickerState.list = res.list;
        statusElTargets.textContent = `${res.list.length} species — type to search.`;
        renderSuggestions(searchIn.value);
      });

      searchIn.addEventListener("input", () => renderSuggestions(searchIn.value));
      searchIn.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          sugList.hidden = true;
        }
      });

      searchWrap.appendChild(searchIn);
      searchWrap.appendChild(sugList);
      targetsWrap.appendChild(targetsLab);
      targetsWrap.appendChild(targetsHint);
      targetsWrap.appendChild(chipsRow);
      targetsWrap.appendChild(searchWrap);
      targetsWrap.appendChild(statusElTargets);

      const notesWrap = document.createElement("div");
      notesWrap.className = "hunt-field hunt-field--full";
      const notesLab = document.createElement("label");
      notesLab.className = "field-label";
      notesLab.htmlFor = `hunt-notes-${c.id}`;
      notesLab.textContent = "Notes";
      const notesTa = document.createElement("textarea");
      notesTa.id = `hunt-notes-${c.id}`;
      notesTa.className = "hunt-notes";
      notesTa.rows = 3;
      notesTa.placeholder = "Route, ability, ball, targets, etc.";
      notesTa.value = c.notes || "";
      notesTa.addEventListener("blur", () => setNotes(c.id, notesTa.value));
      notesWrap.appendChild(notesLab);
      notesWrap.appendChild(notesTa);

      huntBody.appendChild(huntGrid);
      huntBody.appendChild(oddsBlock);
      huntBody.appendChild(targetsWrap);
      huntBody.appendChild(notesWrap);
      huntDetails.appendChild(huntSum);
      huntDetails.appendChild(huntBody);

      const rowMain = document.createElement("div");
      rowMain.className = "row-main";

      const displayCol = document.createElement("div");
      displayCol.className = "display-col";

      const encLabel = document.createElement("div");
      encLabel.className = "stat-label";
      encLabel.textContent = "Encounters";

      const display = document.createElement("div");
      display.className = "display";
      display.textContent = String(c.value);

      displayCol.appendChild(encLabel);
      displayCol.appendChild(display);

      const uptick = document.createElement("div");
      uptick.className = "last-uptick";
      uptick.dataset.uptickFor = c.id;
      const uptickText = formatLastUptick(c.lastUptickAt);
      uptick.textContent = uptickText.line;
      if (uptickText.title) uptick.title = uptickText.title;

      const ephLine = document.createElement("div");
      ephLine.className = "stat-meta";
      ephLine.dataset.ephFor = c.id;
      ephLine.textContent = `Encounters/h (last 60 min): ${formatEph(computeEph(c))}`;

      displayCol.appendChild(uptick);
      displayCol.appendChild(ephLine);

      if (c.includeOdds) {
        const shinyChance = document.createElement("div");
        shinyChance.className = "stat-meta shiny-chance";
        shinyChance.dataset.shinyChanceFor = c.id;
        shinyChance.textContent = formatShinyChanceText(c);
        shinyChance.title =
          "Next: p per encounter from your odds preset. P(≥1 in N enc.): 1−(1−p)^N for independent encounters (no pity).";
        displayCol.appendChild(shinyChance);
      }

      const controls = document.createElement("div");
      controls.className = "controls";

      const minusBtn = document.createElement("button");
      minusBtn.type = "button";
      minusBtn.className = "btn";
      minusBtn.textContent = "−1";
      minusBtn.addEventListener("click", () => adjust(c.id, -1));

      const plusBtn = document.createElement("button");
      plusBtn.type = "button";
      plusBtn.className = "btn primary";
      plusBtn.textContent = "+1";
      plusBtn.addEventListener("click", () => adjust(c.id, 1));

      const inputWrap = document.createElement("div");
      inputWrap.className = "input-wrap";
      const lab = document.createElement("label");
      lab.htmlFor = `val-${c.id}`;
      lab.textContent = "Set:";
      const valInput = document.createElement("input");
      valInput.id = `val-${c.id}`;
      valInput.type = "number";
      valInput.className = "value-input";
      valInput.value = String(c.value);
      valInput.addEventListener("change", () => setValue(c.id, valInput.value));
      valInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") valInput.blur();
      });

      inputWrap.appendChild(lab);
      inputWrap.appendChild(valInput);

      controls.appendChild(minusBtn);
      controls.appendChild(plusBtn);
      controls.appendChild(inputWrap);

      const controlsSpriteStack = document.createElement("div");
      controlsSpriteStack.className = "controls-sprite-stack";
      controlsSpriteStack.appendChild(controls);
      appendCounterTargetSprite(controlsSpriteStack, c);

      rowMain.appendChild(displayCol);
      rowMain.appendChild(controlsSpriteStack);

      const catchRow = document.createElement("div");
      catchRow.className = "catch-row";
      const catchBtn = document.createElement("button");
      catchBtn.type = "button";
      catchBtn.className = "btn btn-catch";
      catchBtn.textContent = "Catch";
      catchBtn.title = "Mark this shiny caught — moves to past counters";
      catchBtn.addEventListener("click", () => completeCatch(c.id));
      catchRow.appendChild(catchBtn);

      const incDetails = document.createElement("details");
      incDetails.className = "panel-disclosure increments-disclosure";
      incDetails.open = !!c.incrementsPanelExpanded;
      incDetails.addEventListener("toggle", () => {
        const cc = counterById(c.id);
        if (cc) cc.incrementsPanelExpanded = incDetails.open;
        scheduleSave();
      });

      const incSum = document.createElement("summary");
      incSum.className = "panel-disclosure-summary";
      const incSumTitle = document.createElement("span");
      incSumTitle.className = "panel-disclosure-title";
      incSumTitle.textContent = "Increments";
      const incSumMeta = document.createElement("span");
      incSumMeta.className = "panel-disclosure-selected";
      incSumMeta.textContent = formatIncrementsCompact(c);
      incSum.appendChild(incSumTitle);
      incSum.appendChild(incSumMeta);

      const incBody = document.createElement("div");
      incBody.className = "increments-body";

      const customGrid = document.createElement("div");
      customGrid.className = "custom-grid";

      for (const b of c.customButtons || []) {
        const wrap = document.createElement("span");
        wrap.className = "custom-step";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn small";
        btn.textContent = b.label;
        btn.title = `Add ${b.delta}`;
        btn.addEventListener("click", () => adjust(c.id, b.delta));
        const del = document.createElement("button");
        del.type = "button";
        del.className = "btn danger small";
        del.textContent = "×";
        del.title = "Remove this increment";
        del.addEventListener("click", () => removeCustomButton(c.id, b.id));
        wrap.appendChild(btn);
        wrap.appendChild(del);
        customGrid.appendChild(wrap);
      }

      const customAdd = document.createElement("div");
      customAdd.className = "custom-add";
      customAdd.dataset.incrementsForm = c.id;

      const deltaField = document.createElement("input");
      deltaField.type = "number";
      deltaField.placeholder = "Step";
      deltaField.dataset.field = "delta";
      deltaField.setAttribute("aria-label", "Step amount");

      const labelField = document.createElement("input");
      labelField.type = "text";
      labelField.placeholder = "Label (e.g. +6)";
      labelField.dataset.field = "label";
      labelField.setAttribute("aria-label", "Button label");

      const addCustomBtn = document.createElement("button");
      addCustomBtn.type = "button";
      addCustomBtn.className = "btn small";
      addCustomBtn.textContent = "Add increment";
      addCustomBtn.addEventListener("click", () => addCustomButton(c.id));

      customAdd.appendChild(deltaField);
      customAdd.appendChild(labelField);
      customAdd.appendChild(addCustomBtn);

      incBody.appendChild(customGrid);
      incBody.appendChild(customAdd);
      incDetails.appendChild(incSum);
      incDetails.appendChild(incBody);

      card.appendChild(head);
      card.appendChild(huntDetails);
      card.appendChild(rowMain);
      card.appendChild(catchRow);
      card.appendChild(incDetails);

      board.appendChild(card);
    }
    renderGraphsIfVisible();
  }

  addCounterBtn.addEventListener("click", addCounter);

  function refreshLiveLabels() {
    for (const c of state.counters) {
      const esc = cssEsc(c.id);
      const el = document.querySelector(`[data-uptick-for="${esc}"]`);
      if (el) {
        const t = formatLastUptick(c.lastUptickAt);
        el.textContent = t.line;
        el.title = t.title || "";
      }
      const ephEl = document.querySelector(`[data-eph-for="${esc}"]`);
      if (ephEl) ephEl.textContent = `Encounters/h (last 60 min): ${formatEph(computeEph(c))}`;
      const shinyEl = document.querySelector(`[data-shiny-chance-for="${esc}"]`);
      if (shinyEl && c.includeOdds) shinyEl.textContent = formatShinyChanceText(c);
    }
  }

  setInterval(() => {
    refreshLiveLabels();
    if (!panelGraphs.hidden) {
      renderDashboard();
      renderCompareSlot(1);
      renderCompareSlot(2);
      renderCompareSlot(3);
    }
  }, 5000);

  let boardLayoutBound = false;
  function setupBoardLayoutSelect() {
    if (boardLayoutBound) return;
    const sel = document.getElementById("boardLayoutSelect");
    if (!sel) return;
    boardLayoutBound = true;
    sel.addEventListener("change", () => {
      state.boardLayout = sel.value;
      scheduleSave();
      applyBoardLayout();
    });
  }

  setupTabs();
  setupGraphNav();
  setupGraphFilters();
  setupBoardLayoutSelect();
  applyBoardLayout();
  load().catch((e) => {
    console.error(e);
    board.innerHTML =
      '<div class="empty-hint">Could not load state. Is the server running? Run <code>npm start</code> in the project folder.</div>';
  });
})();
