const DEFAULT_SHEETS_API_URL =
  "https://script.google.com/macros/s/AKfycbzu7MvB-cE1oJ517NYxMyIxp7RaLfybK1rfTPutB_YBdgnbKIfL90xqLxdIQLCqaumpVg/exec";
const DEFAULT_SHEETS_API_TOKEN = "GAUMAATRI_SECRET_2026";

async function parseJsonResponse(response) {
  const text = await response.text();
  const trimmed = text.trim();
  if (trimmed.startsWith("<")) throw new Error("Sheets returned HTML.");
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error("Sheets returned invalid JSON.");
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const orderId = String(req.query?.orderId || "").trim().toUpperCase();
    if (!orderId) return res.status(400).json({ success: false, error: "Missing orderId" });

    const url = process.env.SHEETS_API_URL || DEFAULT_SHEETS_API_URL;
    const token = process.env.SHEETS_API_TOKEN || DEFAULT_SHEETS_API_TOKEN;

    const qs = new URLSearchParams({ action: "trackOrder", orderId, token }).toString();
    const sheetRes = await fetch(`${url}?${qs}`, { method: "GET" });
    const json = await parseJsonResponse(sheetRes);
    return res.status(sheetRes.status).json(json);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: err.message || "Tracking failed" });
  }
}
