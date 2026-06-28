import { handleApiRequest } from "../../../lib/server/api-router.js";

export default function handler(req, res) {
  req.url = `/api/scans/${encodeURIComponent(req.query.id)}/results`;
  return handleApiRequest(req, res);
}

