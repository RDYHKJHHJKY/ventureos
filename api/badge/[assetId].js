import { handleApiRequest } from "../../lib/server/api-router.js";

export default function handler(req, res) {
  req.url = `/api/badge/${encodeURIComponent(req.query.assetId)}`;
  return handleApiRequest(req, res);
}

