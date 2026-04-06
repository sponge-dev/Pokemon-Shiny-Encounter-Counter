const fs = require("fs");
const http = require("http");
const path = require("path");
const express = require("express");

const START_PORT = Number(process.env.PORT) || 3847;
const MAX_PORT_TRIES = 30;
const ROOT = __dirname;
const CACHE_FILE = path.join(ROOT, "encounters-cache.txt");

const app = express();
app.use(express.json({ limit: "12mb" }));
app.use(express.static(path.join(ROOT, "public")));

function readState() {
  try {
    const raw = fs.readFileSync(CACHE_FILE, "utf8");
    const data = JSON.parse(raw);
    if (data && typeof data === "object" && Array.isArray(data.counters)) {
      return data;
    }
  } catch (_) {
    /* missing or invalid — start fresh */
  }
  return { counters: [] };
}

function writeState(state) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(state, null, 2), "utf8");
}

app.get("/api/state", (_req, res) => {
  res.json(readState());
});

app.post("/api/state", (req, res) => {
  const body = req.body;
  if (!body || typeof body !== "object" || !Array.isArray(body.counters)) {
    return res.status(400).json({ error: "Invalid state: expected { counters: [] }" });
  }
  if (body.pastCounters != null && !Array.isArray(body.pastCounters)) {
    return res.status(400).json({ error: "Invalid state: pastCounters must be an array" });
  }
  if (body.trackerHistory != null && !Array.isArray(body.trackerHistory)) {
    return res.status(400).json({ error: "Invalid state: trackerHistory must be an array" });
  }
  writeState(body);
  res.json({ ok: true });
});

const server = http.createServer(app);

function listen(port, attempt) {
  server.removeAllListeners("error");
  server.removeAllListeners("listening");
  server.once("error", (err) => {
    if (err.code === "EADDRINUSE" && attempt < MAX_PORT_TRIES) {
      const next = port + 1;
      console.warn(`Port ${port} in use, trying ${next}…`);
      server.close(() => listen(next, attempt + 1));
    } else {
      console.error(err);
      process.exit(1);
    }
  });
  server.once("listening", () => {
    const addr = server.address();
    const p = typeof addr === "object" && addr ? addr.port : port;
    console.log(`Encounter counter: http://127.0.0.1:${p}`);
    console.log(`Cache file: ${CACHE_FILE}`);
  });
  server.listen(port);
}

listen(START_PORT, 0);
