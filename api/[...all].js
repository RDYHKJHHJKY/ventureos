import { handleApiRequest } from "../lib/server/api-router.js";

export default async function handler(req, res) {
  try {
    const handled = await handleApiRequest(req, res);
    if (!handled) {
      res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: "Not found" }));
    }
  } catch (err) {
    console.error("API handler error:", err && err.stack ? err.stack : String(err));
    res.writeHead(err.statusCode || 500, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, error: err.message }));
  }
}
