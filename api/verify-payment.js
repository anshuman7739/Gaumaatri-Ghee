import crypto from "crypto";
import Razorpay from "razorpay";

const DEFAULT_SHEETS_API_URL =
  "https://script.google.com/macros/s/AKfycbzu7MvB-cE1oJ517NYxMyIxp7RaLfybK1rfTPutB_YBdgnbKIfL90xqLxdIQLCqaumpVg/exec";
const DEFAULT_SHEETS_API_TOKEN = "GAUMAATRI_SECRET_2026";

const PRICES_INR = { "200ml": 356, "500ml": 789, "1L": 1599 };
const VARIANT_LABELS = { "200ml": "200ml Starter Pack", "500ml": "500ml Family Pack", "1L": "1 Litre Bulk Pack" };
const COUPONS = { GAUMAATRI10: 10, GHEE10: 10, WELCOME10: 10 };

function genOrderId() {
  const d = new Date();
  const dateStr =
    d.getFullYear() +
    String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `GM-${dateStr}-${rand}`;
}

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

async function sheetsSubmitOrder({ orderId, customer, product, quantity, total, paymentStatus }) {
  const url = process.env.SHEETS_API_URL || DEFAULT_SHEETS_API_URL;
  const token = process.env.SHEETS_API_TOKEN || DEFAULT_SHEETS_API_TOKEN;
  if (!url || !token) throw new Error("Sheets API not configured");

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({
      action: "submitOrder",
      token,
      orderId,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      address: customer.address,
      product,
      quantity,
      total,
      paymentMethod: "UPI",
      paymentStatus,
      orderStatus: "Order Received",
    }),
  });

  const json = await parseJsonResponse(res);
  if (!res.ok || !json?.success) throw new Error(json?.error || `Sheets error (HTTP ${res.status})`);
  return json;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    customer
  } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ success: false, error: "Missing Razorpay fields" });
  }
  if (!process.env.RAZORPAY_KEY_SECRET || !process.env.RAZORPAY_KEY_ID) {
    return res.status(500).json({ success: false, error: "Server not configured" });
  }
  if (!customer?.name || !customer?.email || !customer?.phone || !customer?.address) {
    return res.status(400).json({ success: false, error: "Missing customer details" });
  }

  const generated_signature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(razorpay_order_id + "|" + razorpay_payment_id)
    .digest("hex");

  const receivedBuf = Buffer.from(String(razorpay_signature), "hex");
  const expectedBuf = Buffer.from(generated_signature, "hex");
  const isValid =
    receivedBuf.length === expectedBuf.length &&
    crypto.timingSafeEqual(receivedBuf, expectedBuf);

  if (isValid) {
    // Create internal order id + save to Google Sheets
    try {
      const razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
      });

      const rpOrder = await razorpay.orders.fetch(razorpay_order_id);
      const variantKey = rpOrder?.notes?.variantKey || customer.variantKey;
      const qty = rpOrder?.notes?.qty || customer.quantity || customer.qty || 1;
      const couponCode = rpOrder?.notes?.couponCode || null;

      const pricing = computeTotalInr({ variantKey, qty, couponCode });
      const expectedPaise = Math.round(pricing.total * 100);
      if (Number(rpOrder?.amount) !== expectedPaise) {
        return res.status(400).json({ success: false, error: "Amount mismatch" });
      }

      const orderId = genOrderId();
      const productLabel = VARIANT_LABELS[variantKey] || customer.product || String(variantKey || "Product");

      await sheetsSubmitOrder({
        orderId,
        customer,
        product: productLabel,
        quantity: pricing.qty,
        total: pricing.total,
        paymentStatus: `Paid - ${razorpay_payment_id}`,
      });

      return res.status(200).json({ success: true, orderId });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ success: false, error: err.message || "Verification succeeded but order save failed" });
    }
  } else {
    return res.status(400).json({ success: false, error: "Invalid signature" });
  }
}
