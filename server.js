// ============================================================
//  GAUMAATRI GHEE — Express + Razorpay Backend
//  Run: node server.js
//  Serves static index.html + Razorpay API endpoints
// ============================================================

'use strict';
require('dotenv').config();

const express  = require('express');
const crypto   = require('crypto');
const path     = require('path');
const Razorpay = require('razorpay');

const app = express();
app.disable('x-powered-by');
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

// ⚠️ IMPORTANT: Define API routes BEFORE static files middleware
// This ensures /api/* requests are handled as JSON, not served as static files

// ============================================================
//  POST /api/create-order
//  Creates a Razorpay order on the server side.
//  Body: { amount (₹ in rupees), currency?, receipt? }
//  Returns: { order_id, amount, currency, key_id }
// ============================================================
app.post('/api/create-order', async (req, res) => {
  try {
    const { amount, currency = 'INR', receipt } = req.body;

    // ── Validate amount ──────────────────────────────────
    const amountNum = Number(amount);
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid amount' });
    }

    // Convert ₹ rupees → paise (Razorpay uses smallest currency unit)
    const amountPaise = Math.round(amountNum * 100);
    if (amountPaise < 100) {
      return res.status(400).json({
        success: false,
        error: 'Minimum order amount is ₹1 (100 paise)'
      });
    }

    // ── Create order via Razorpay API ────────────────────
    const orderOptions = {
      amount:   amountPaise,
      currency,
      receipt:  receipt || `rcpt_${Date.now()}`,
      payment_capture: 1,         // auto-capture payment
    };

    const order = await razorpay.orders.create(orderOptions);

    console.log(`✅ Razorpay order created: ${order.id}  ₹${amountNum}`);

    return res.status(200).json({
      success:   true,
      order_id:  order.id,
      amount:    order.amount,    // in paise
      currency:  order.currency,
      key_id:    RAZORPAY_KEY_ID, // safe to send to frontend
    });

  } catch (err) {
    console.error('❌ create-order error:', err);

    if (err.statusCode === 401) {
      return res.status(401).json({ success: false, error: 'Razorpay auth failed. Check your KEY_ID and KEY_SECRET.' });
    }
    return res.status(500).json({ success: false, error: err.error?.description || err.message || 'Order creation failed' });
  }
});

// ============================================================
//  POST /api/verify-payment
//  Verifies Razorpay payment signature (HMAC-SHA256).
//  Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
//  Returns: { success: true/false }
// ============================================================
app.post('/api/verify-payment', (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

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

    if (!isValid) {
      console.warn(`⚠️  Signature mismatch for order ${razorpay_order_id}`);
      return res.status(400).json({ success: false, error: 'Payment signature verification failed' });
    }

    console.log(`✅ Payment verified: ${razorpay_payment_id}  order: ${razorpay_order_id}`);
    return res.status(200).json({
      success:    true,
      payment_id: razorpay_payment_id,
      order_id:   razorpay_order_id,
      message:    'Payment verified successfully'
    });

  } catch (err) {
    console.error('❌ verify-payment error:', err);
    return res.status(500).json({ success: false, error: 'Verification error' });
  }
});

// ──────────────────────────────────────────────────────────
//  COD Order Endpoint (Cash on Delivery)
// ──────────────────────────────────────────────────────────
app.post('/api/cod-order', (req, res) => {
  try {
    const { orderId, amount, customerName, customerEmail, customerPhone, address, items } = req.body;

    if (!orderId || !amount || !customerName || !customerEmail || !customerPhone) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const amountNum = Number(amount);
    if (amountNum <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid amount' });
    }

    console.log(`✅ COD Order Created: ${orderId} | Amount: ₹${amountNum} | Customer: ${customerName}`);

    return res.status(200).json({
      success: true,
      order_id: orderId,
      amount: amountNum,
      payment_method: 'COD',
      status: 'pending',
      message: 'Order confirmed. Payment will be collected on delivery.'
    });

  } catch (err) {
    console.error('❌ COD order error:', err);
    return res.status(500).json({ success: false, error: 'Order creation failed' });
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
