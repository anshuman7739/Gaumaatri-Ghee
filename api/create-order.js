import Razorpay from "razorpay";

const PRICES_INR = { "200ml": 356, "500ml": 789, "1L": 1599 };
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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const { variantKey, qty, couponCode } = req.body || {};
    const { total, qty: qtyNum } = computeTotalInr({ variantKey, qty, couponCode });

    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const order = await razorpay.orders.create({
      amount: Math.round(total * 100),
      currency: "INR",
      receipt: "order_" + Date.now(),
      notes: {
        variantKey: String(variantKey),
        qty: String(qtyNum),
        couponCode: couponCode ? String(couponCode) : "",
      },
      payment_capture: 1,
    });

    return res.status(200).json({
      success: true,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error(error);
    return res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || "Order creation failed",
    });
  }
}
