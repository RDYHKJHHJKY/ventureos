import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleApiRequest } from "./lib/server/api-router.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST = path.join(__dirname, "dist");

function contentTypeFor(file) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".json")) return "application/json; charset=utf-8";
  if (file.endsWith(".png")) return "image/png";
  if (file.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

function applySecurityHeaders(req, res, url) {
  const isHttps = req.socket?.encrypted || req.headers["x-forwarded-proto"] === "https" || req.headers[":scheme"] === "https" || url.protocol === "https:";
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https: wss:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

  res.setHeader("Content-Security-Policy", csp);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()" );
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  if (isHttps) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname.replace(/\/+$/g, "") || "/";
    applySecurityHeaders(req, res, url);

    // API routes handled by existing router
    if (pathname.startsWith("/api/")) {
      try {
        const handled = await handleApiRequest(req, res);
        if (handled) return;
        // fallthrough to returning 404
      } catch (err) {
        res.writeHead(err.statusCode || 500, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, error: err.message }));
        return;
      }
    }

    // Serve static files from dist
    let filePath = pathname === "/" ? path.join(DIST, "index.html") : path.join(DIST, pathname.replace(/^\//, ""));
    try {
      const stat = await fs.stat(filePath);
      if (stat.isDirectory()) filePath = path.join(filePath, "index.html");
      const content = await fs.readFile(filePath);
      res.writeHead(200, { "content-type": contentTypeFor(filePath) });
      res.end(content);
      return;
    } catch (e) {
      // SPA fallback: serve index.html
      try {
        const index = await fs.readFile(path.join(DIST, "index.html"));
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(index);
        return;
      } catch (er) {
        res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, error: "Static files not found." }));
        return;
      }
    }
  } catch (err) {
    res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, error: String(err) }));
  }
});

const PORT = process.env.PORT || 5173;
server.listen(PORT, () => {
  console.log(`VentureOS server listening on http://localhost:${PORT}`);
});

// Improved logging for unexpected crashes and promise rejections
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err && err.stack ? err.stack : String(err));
  try {
    // attempt graceful shutdown
    server.close(() => process.exit(1));
  } catch (e) {
    process.exit(1);
  }
});

process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:", reason && reason.stack ? reason.stack : String(reason));
});

export default server;
