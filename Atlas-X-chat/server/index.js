// Tiny zero-dependency backend: keeps the API key private and forwards chat to Claude.
// Run:  npm run server   (needs Node 20.6+ and a .env file, see .env.example)
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT) || 8787;
const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");

if (!API_KEY) console.warn("⚠  ANTHROPIC_API_KEY is not set: /api/chat will return an error.");

const SYSTEM = `You are the assistant inside "Epoch", a web app that shows how Earth changes over time using NASA satellite imagery.
The app has six views: Today, Explore (interactive globe), Compare (before/after), Timelapse, Places and Alerts.
Be concise, accurate and friendly. Always reply in the language the user writes in.
If you are unsure about a fact, say so instead of guessing.`;

// Naive in-memory rate limit: 20 requests / minute / IP.
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now > h.reset) {
    hits.set(ip, { n: 1, reset: now + 60_000 });
    return false;
  }
  return ++h.n > 20;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 100_000) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "Content-Type": type });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

async function chat(req, res) {
  if (!API_KEY) return send(res, 500, { error: "Server is missing ANTHROPIC_API_KEY." });
  if (limited(req.socket.remoteAddress)) return send(res, 429, { error: "Too many messages, slow down a little." });

  const { messages, context } = await readJson(req);
  let msgs = (Array.isArray(messages) ? messages : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }))
    .slice(-20);
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  if (!msgs.length || msgs.at(-1).role !== "user") return send(res, 400, { error: "No user message." });

  const ctx = context && typeof context === "object" ? `\nUser is currently on the "${String(context.view).slice(0, 30)}" view${context.place ? `, with "${String(context.place).slice(0, 60)}" selected` : ""}.` : "";

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 1000, system: SYSTEM + ctx, messages: msgs }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error("Anthropic API error:", r.status, data?.error?.message);
    return send(res, 502, { error: "The AI service is unavailable right now." });
  }
  const reply = (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  send(res, 200, { reply });
}

http
  .createServer(async (req, res) => {
    try {
      if (req.method === "POST" && req.url === "/api/chat") return await chat(req, res);
      if (req.method === "GET" && !req.url.startsWith("/api")) {
        // Production: serve the built single-file app (run `npm run build` first).
        return send(res, 200, await readFile(path.join(DIST, "index.html")), "text/html; charset=utf-8");
      }
      send(res, 404, { error: "Not found" });
    } catch (e) {
      send(res, e.code === "ENOENT" ? 404 : 400, { error: e.code === "ENOENT" ? "Run `npm run build` first." : e.message });
    }
  })
  .listen(PORT, () => console.log(`Epoch server on http://localhost:${PORT}`));
