import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
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

function addNonceToInlineScripts(html, nonce) {
  return html.replace(/<script\b([^>]*?)>([\s\S]*?)<\/script>/gi, (match, attrs, body) => {
    if (/\bsrc\b/i.test(attrs)) return match;
    if (/\bnonce\b/i.test(attrs)) return match;
    return `<script${attrs} nonce="${nonce}">${body}</script>`;
  });
}

function getPreferredCompression(acceptEncoding) {
  if (!acceptEncoding) return null;
  if (/\bbr\b/.test(acceptEncoding)) return "br";
  if (/\bgzip\b/.test(acceptEncoding)) return "gzip";
  return null;
}

function compressContent(content, encoding) {
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
  if (encoding === "br") return zlib.brotliCompressSync(buffer);
  if (encoding === "gzip") return zlib.gzipSync(buffer);
  return buffer;
}

function cacheControlFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "no-store, max-age=0";
  if ([".js", ".css", ".json", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".avif", ".ico", ".woff2", ".woff", ".ttf", ".wasm"].includes(ext)) {
    return "public, max-age=31536000, immutable";
  }
  return "public, max-age=604800";
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function handleCspReport(req, res) {
  const body = await readRequestBody(req);
  let report = body;
  try {
    report = JSON.parse(body);
  } catch {
    // preserve raw payload for diagnostics
  }
  console.warn("CSP Violation Report:", report);
  res.writeHead(204);
  res.end();
}

function applySecurityHeaders(req, res, url) {
  const isHttps = req.socket?.encrypted || req.headers["x-forwarded-proto"] === "https" || req.headers[":scheme"] === "https" || url.protocol === "https:";
  const nonce = crypto.randomUUID();
  res.cspNonce = nonce;

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://app.secureprivacy.ai https://www.googletagmanager.com https://www.google-analytics.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https: wss: https://www.google-analytics.com https://www.googletagmanager.com https://app.secureprivacy.ai",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "report-uri /csp-report",
  ].join("; ");

  res.setHeader("Content-Security-Policy", csp);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
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
    const pathname = url.pathname.replace(/\/+$|/g, "") || "/";
    applySecurityHeaders(req, res, url);

    if (pathname === "/csp-report" && req.method === "POST") {
      await handleCspReport(req, res);
      return;
    }

    if (pathname.startsWith("/api/")) {
      try {
        const handled = await handleApiRequest(req, res);
        if (handled) return;
      } catch (err) {
        res.writeHead(err.statusCode || 500, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, error: err.message }));
        return;
      }
    }

    let filePath = pathname === "/" ? path.join(DIST, "index.html") : path.join(DIST, pathname.replace(/^\//, ""));
    try {
      const stat = await fs.stat(filePath);
      if (stat.isDirectory()) filePath = path.join(filePath, "index.html");
      let content = await fs.readFile(filePath);
      if (filePath.endsWith(".html") && res.cspNonce) {
        content = addNonceToInlineScripts(content.toString("utf8"), res.cspNonce);
      }
      const headers = {
        "content-type": contentTypeFor(filePath),
        "Cache-Control": cacheControlFor(filePath),
      };
      const encoding = getPreferredCompression(req.headers["accept-encoding"] || "");
      if (encoding) {
        content = compressContent(content, encoding);
        headers["Content-Encoding"] = encoding;
        headers["Vary"] = "Accept-Encoding";
      }
      res.writeHead(200, headers);
      res.end(content);
      return;
    } catch (e) {
      try {
        let index = await fs.readFile(path.join(DIST, "index.html"), "utf8");
        if (res.cspNonce) {
          index = addNonceToInlineScripts(index, res.cspNonce);
        }
        const headers = {
          "content-type": "text/html; charset=utf-8",
          "Cache-Control": cacheControlFor(path.join(DIST, "index.html")),
        };
        const encoding = getPreferredCompression(req.headers["accept-encoding"] || "");
        if (encoding) {
          const compressed = compressContent(index, encoding);
          headers["Content-Encoding"] = encoding;
          headers["Vary"] = "Accept-Encoding";
          res.writeHead(200, headers);
          res.end(compressed);
          return;
        }
        res.writeHead(200, headers);
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

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err && err.stack ? err.stack : String(err));
  try {
    server.close(() => process.exit(1));
  } catch (e) {
    process.exit(1);
  }
});

process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:", reason && reason.stack ? reason.stack : String(reason));
});

export default server;


