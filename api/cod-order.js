const DEFAULT_SHEETS_API_URL =
  "https://script.google.com/macros/s/AKfycbzu7MvB-cE1oJ517NYxMyIxp7RaLfybK1rfTPutB_YBdgnbKIfL90xqLxdIQLCqaumpVg/exec";
const DEFAULT_SHEETS_API_TOKEN = "GAUMAATRI_SECRET_2026";

const PRICES_INR = { "200ml": 356, "500ml": 789, "1L": 1599 };
const VARIANT_LABELS = { "200ml": "200ml Starter Pack", "500ml": "500ml Family Pack", "1L": "1 Litre Bulk Pack" };
const COUPONS = { GAUMAATRI10: 10, GHEE10: 10, WELCOME10: 10 };

function computeTotalInr({ variantKey, qty, couponCode }) {
  if (!PRICES_INR[variantKey]) {
    const err = new Error("Invalid variant");
    err.statusCode = 400;
    throw err;
  }
  const qtyNum = Number(qty);
  if (!Number.isInteger(qtyNum) || qtyNum < 1 || qtyNum > 10) {
    const err = new Error("Invalid quantity");
    err.statusCode = 400;
    throw err;
  }
  const base = PRICES_INR[variantKey] * qtyNum;
  const code = String(couponCode || "").trim().toUpperCase();
  const pct = code && COUPONS[code] ? COUPONS[code] : 0;
  const discount = pct ? Math.round((base * pct) / 100) : 0;
  const total = base - discount;
  return { base, discount, total, qty: qtyNum, couponCode: code || null, couponPct: pct };
}

function genOrderId() {
  const d = new Date();
  const dateStr =
    d.getFullYear() +
    String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `GM-${dateStr}-${rand}`;
}

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
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const { orderId, variantKey, qty, couponCode, customer } = req.body || {};
    const oid = String(orderId || "").trim() || genOrderId();
    if (!customer?.name || !customer?.email || !customer?.phone || !customer?.address) {
      return res.status(400).json({ success: false, error: "Missing customer details" });
    }

    const pricing = computeTotalInr({ variantKey, qty, couponCode });
    const url = process.env.SHEETS_API_URL || DEFAULT_SHEETS_API_URL;
    const token = process.env.SHEETS_API_TOKEN || DEFAULT_SHEETS_API_TOKEN;
    const product = VARIANT_LABELS[variantKey] || String(variantKey);

    const sheetRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({
        action: "submitOrder",
        token,
        orderId: oid,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
        product,
        quantity: pricing.qty,
        total: pricing.total,
        paymentMethod: "COD",
        paymentStatus: "COD – Pay on Delivery",
        orderStatus: "Order Received",
      }),
    });
    const sheetJson = await parseJsonResponse(sheetRes);
    if (!sheetRes.ok || !sheetJson?.success) {
      throw new Error(sheetJson?.error || `Sheets error (HTTP ${sheetRes.status})`);
    }

    return res.status(200).json({
      success: true,
      order_id: oid,
      amount: pricing.total,
      payment_method: "COD",
      status: "confirmed",
    });
  } catch (err) {
    console.error(err);
    return res.status(err.statusCode || 500).json({ success: false, error: err.message || "COD order failed" });
  }
}

