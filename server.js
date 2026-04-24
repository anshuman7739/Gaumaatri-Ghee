// ============================================================
//  GAUMAATRI GHEE — Express + Razorpay Backend
//  Run: node server.js
//  Serves static index.html + Razorpay API endpoints
// ============================================================

	'use strict';
	require('dotenv').config();

	const express  = require('express');
	const cors     = require('cors');
	const crypto   = require('crypto');
	const path     = require('path');
	const Razorpay = require('razorpay');
	const ordersDb = require('./orders-db');

	const app = express();
	app.disable('x-powered-by');

	// If CORS_ORIGIN is set, restrict origins to that comma-separated list.
	// Otherwise allow all origins (useful for local development).
	const { CORS_ORIGIN } = process.env;
	app.use(cors({
	  origin: CORS_ORIGIN ? CORS_ORIGIN.split(',').map(s => s.trim()).filter(Boolean) : true,
	  credentials: false,
	}));
	app.use(express.json());
	app.use(express.urlencoded({ extended: true }));

// ── Validate env vars on startup ────────────────────────────
const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, PORT = 3000 } = process.env;

if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
  console.error('\n❌  Missing Razorpay credentials in .env file.');
  console.error('    Ensure RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are set.\n');
  process.exit(1);
}

// ── Razorpay instance ────────────────────────────────────────
	const razorpay = new Razorpay({
	  key_id:     RAZORPAY_KEY_ID,
	  key_secret: RAZORPAY_KEY_SECRET,
	});

	// ── Server-side pricing (never trust client totals) ─────────
	// Keep these in sync with the frontend options in index.html.
	const PRICES_INR = { '200ml': 356, '500ml': 789, '1L': 1599 };
	const COUPONS = { GAUMAATRI10: 10, GHEE10: 10, WELCOME10: 10 };

	// razorpay_order_id -> pending checkout context (kept until verification).
	const pendingPayments = new Map();

	function genOrderId() {
	  const d = new Date();
	  const dateStr =
	    d.getFullYear() +
	    String(d.getMonth() + 1).padStart(2, '0') +
	    String(d.getDate()).padStart(2, '0');
	  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
	  return `GM-${dateStr}-${rand}`;
	}

	function computeTotalInr({ variantKey, qty, couponCode }) {
	  if (!PRICES_INR[variantKey]) {
	    const err = new Error('Invalid variant');
	    err.statusCode = 400;
	    throw err;
	  }
	  const qtyNum = Number(qty);
	  if (!Number.isInteger(qtyNum) || qtyNum < 1 || qtyNum > 20) {
	    const err = new Error('Invalid quantity');
	    err.statusCode = 400;
	    throw err;
	  }

	  const base = PRICES_INR[variantKey] * qtyNum;
	  const code = String(couponCode || '').trim().toUpperCase();
	  const pct = code && COUPONS[code] ? COUPONS[code] : 0;
	  const discount = pct ? Math.round(base * pct / 100) : 0;
	  const total = base - discount;

	  return { base, discount, total, qty: qtyNum, couponCode: code || null, couponPct: pct };
	}

// ⚠️ IMPORTANT: Define API routes BEFORE static files middleware
// This ensures /api/* requests are handled as JSON, not served as static files

// ============================================================
//  POST /api/create-order
//  Creates a Razorpay order on the server side.
//  Body: { variantKey, qty, couponCode? }
//  Returns: { id, amount, currency }
//  ⚠️ Does NOT create a DB order here.
// ============================================================
async function createOrderHandler(req, res) {
  try {
    const { variantKey, qty, couponCode } = req.body;
    const pricing = computeTotalInr({ variantKey, qty, couponCode });

    const amountPaise = Math.round(pricing.total * 100);
    const orderOptions = {
      amount: amountPaise,
      currency: 'INR',
      receipt: `rcpt_${Date.now()}`,
      payment_capture: 1,
    };

    const order = await razorpay.orders.create(orderOptions);

    pendingPayments.set(order.id, {
      createdAt: Date.now(),
      variantKey,
      qty: pricing.qty,
      base: pricing.base,
      discount: pricing.discount,
      total: pricing.total,
      couponCode: pricing.couponCode,
      couponPct: pricing.couponPct,
    });

    console.log(`✅ Razorpay order created: ${order.id}  ₹${pricing.total}`);

    return res.status(200).json({
      success: true,
      id: order.id,
      amount: order.amount,
      currency: order.currency,
      key: RAZORPAY_KEY_ID,
      // Backward compat for existing frontend code
      order_id: order.id,
      key_id: RAZORPAY_KEY_ID,
    });

  } catch (err) {
    console.error('❌ create-order error:', err);
    return res.status(err.statusCode || 500).json({
      success: false,
      error: err.statusCode ? err.message : (err.error?.description || err.message || 'Order creation failed'),
    });
  }
}

app.post('/api/create-order', createOrderHandler);
app.post('/create-order', createOrderHandler);

// ============================================================
//  POST /api/verify-payment
//  Verifies Razorpay payment signature (HMAC-SHA256).
//  Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
//  Returns: { success: true/false }
// ============================================================
function verifyPaymentHandler(req, res) {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, customer } = req.body;

    // ── Validate required fields ─────────────────────────
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: razorpay_order_id, razorpay_payment_id, razorpay_signature'
      });
    }

    // ── Generate expected signature ──────────────────────
    // Algorithm: HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET)
    const body      = razorpay_order_id + '|' + razorpay_payment_id;
    const expected  = crypto
      .createHmac('sha256', RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    // ── Constant-time comparison to prevent timing attacks ─
    const receivedBuf = Buffer.from(razorpay_signature, 'hex');
    const expectedBuf = Buffer.from(expected, 'hex');

    const isValid =
      receivedBuf.length === expectedBuf.length &&
      crypto.timingSafeEqual(receivedBuf, expectedBuf);

    if (!pendingPayments.has(razorpay_order_id)) {
      return res.status(400).json({ success: false, error: 'Unknown or expired order. Please refresh and try again.' });
    }

    if (!isValid) {
      console.warn(`⚠️  Signature mismatch for order ${razorpay_order_id}`);
      return res.status(400).json({ success: false });
    }

    const pending = pendingPayments.get(razorpay_order_id);

    // ✅ Verified: only now create an internal order record ("DB")
    const internalOrderId = genOrderId();
    ordersDb.insert({
      id: internalOrderId,
      createdAt: new Date().toISOString(),
      payment: {
        provider: 'razorpay',
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        amount_paise: Math.round(pending.total * 100),
        currency: 'INR',
      },
      items: [{ variantKey: pending.variantKey, qty: pending.qty }],
      pricing: {
        base_inr: pending.base,
        discount_inr: pending.discount,
        total_inr: pending.total,
        couponCode: pending.couponCode,
        couponPct: pending.couponPct,
      },
      customer: {
        name: customer?.name || null,
        email: customer?.email || null,
        phone: customer?.phone || null,
        address: customer?.address || null,
      },
    });

    pendingPayments.delete(razorpay_order_id);

    console.log(`✅ Payment verified + order saved: ${razorpay_payment_id} -> ${internalOrderId}`);
    return res.status(200).json({ success: true, orderId: internalOrderId });

  } catch (err) {
    console.error('❌ verify-payment error:', err);
    return res.status(500).json({ success: false, error: 'Verification error' });
  }
}

app.post('/api/verify-payment', verifyPaymentHandler);
app.post('/verify-payment', verifyPaymentHandler);

// ──────────────────────────────────────────────────────────
//  COD Order Endpoint (Cash on Delivery)
// ──────────────────────────────────────────────────────────
app.post('/api/cod-order', (req, res) => {
  try {
    const { orderId, variantKey, qty, couponCode, customer } = req.body;

    if (!orderId) {
      return res.status(400).json({ success: false, error: 'Missing orderId' });
    }

    const pricing = computeTotalInr({ variantKey, qty, couponCode });

    ordersDb.insert({
      id: orderId,
      createdAt: new Date().toISOString(),
      payment: { provider: 'cod' },
      items: [{ variantKey, qty: pricing.qty }],
      pricing: {
        base_inr: pricing.base,
        discount_inr: pricing.discount,
        total_inr: pricing.total,
        couponCode: pricing.couponCode,
        couponPct: pricing.couponPct,
      },
      customer: {
        name: customer?.name || null,
        email: customer?.email || null,
        phone: customer?.phone || null,
        address: customer?.address || null,
      },
    });

    console.log(`✅ COD order saved: ${orderId}  ₹${pricing.total}`);

    return res.status(200).json({
      success: true,
      order_id: orderId,
      amount: pricing.total,
      payment_method: 'COD',
      status: 'confirmed',
      message: 'Order confirmed. Payment will be collected on delivery.'
    });

  } catch (err) {
    console.error('❌ COD order error:', err);
    return res.status(err.statusCode || 500).json({ success: false, error: err.message || 'Order creation failed' });
  }
});

// ──────────────────────────────────────────────────────────
//  Get Order Status (Order Tracking)
// ──────────────────────────────────────────────────────────
app.get('/api/order-status/:orderId', (req, res) => {
  try {
    const { orderId } = req.params;

    // In production, fetch from database
    // For now, return mock status based on orderId
    const statuses = ['pending', 'confirmed', 'shipped', 'delivered'];
    const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];

    return res.json({
      success: true,
      order_id: orderId,
      status: randomStatus,
      estimated_delivery: 'Today',
      tracking_url: 'https://your-tracking-system.com/' + orderId
    });

  } catch (err) {
    console.error('❌ Order status error:', err);
    return res.status(500).json({ success: false, error: 'Failed to get order status' });
  }
});

// ──────────────────────────────────────────────────────────
//  Health Check Endpoint
// ──────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    server: 'Gaumaatri Ghee Payment System',
    razorpay: 'connected',
    timestamp: new Date().toISOString()
  });
});

// ──────────────────────────────────────────────────────────
//  Error Handling Middleware
// ──────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Server error'
  });
});

// ── Serve static files AFTER API routes (index.html, images, etc.) ───────────
app.use(express.static(path.join(__dirname)));

// ──────────────────────────────────────────────────────────
//  Catch-all: Serve index.html
// ──────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ──────────────────────────────────────────────────────────
//  Start Server
// ──────────────────────────────────────────────────────────
if (require.main === module) {
  app.listen(PORT, () => {
    console.log('\n╔════════════════════════════════════════════╗');
    console.log('║  🐄 GAUMAATRI GHEE PAYMENT SYSTEM 🐄  ║');
    console.log('╚════════════════════════════════════════════╝\n');
    console.log(`✅ Server Running`);
    console.log(`🌐 Local URL: http://localhost:${PORT}`);
    console.log(`💳 Razorpay:  ${RAZORPAY_KEY_ID}`);
    console.log(`📡 API:       http://localhost:${PORT}/api`);
    console.log(`🏥 Health:    http://localhost:${PORT}/api/health`);
    console.log(`🖥️  Frontend: http://localhost:${PORT}`);
    console.log('\n⌚ Press Ctrl+C to stop\n');
  });
}

module.exports = app;
