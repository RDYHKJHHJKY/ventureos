export { apiJson } from "../../api-client.js";

export async function issuePassport(softwareId) {
  return apiJson("/api/spr/passports/issue", {
    method: "POST",
    body: JSON.stringify({ softwareId }),
  });
}

export async function getPassport(softwareId) {
  return apiJson(`/api/spr/passports/${encodeURIComponent(softwareId)}`);
}
