// Google Sheets config comes from env only (SHEETS_API_URL / SHEETS_API_TOKEN).
// No hardcoded default deployment — a baked-in URL silently pointed at a
// different, private script. See server.js for the full note.

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

    const url = (process.env.SHEETS_API_URL || "").trim();
    const token = (process.env.SHEETS_API_TOKEN || "").trim();
    if (!url || !token) {
      return res.status(503).json({
        success: false,
        error: "Sheets not configured: set SHEETS_API_URL and SHEETS_API_TOKEN.",
      });
    }

    const qs = new URLSearchParams({ action: "trackOrder", orderId, token }).toString();
    const sheetRes = await fetch(`${url}?${qs}`, { method: "GET" });
    const json = await parseJsonResponse(sheetRes);
    return res.status(sheetRes.status).json(json);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: err.message || "Tracking failed" });
  }
}
