import { handleApiRequest } from "../lib/server/api-router.js";

export default function handler(req, res) {
  return handleApiRequest(req, res);
}
