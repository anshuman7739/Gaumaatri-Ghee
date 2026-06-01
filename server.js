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
	const { setTimeout: sleep } = require('timers/promises');

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
const {
  RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET,
  PORT = 3000,
  SHEETS_API_URL,
  SHEETS_API_TOKEN,
} = process.env;

if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
  console.error('\n❌  Missing Razorpay credentials in .env file.');
  console.error('    Ensure RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are set.\n');
  process.exit(1);
}

const DEFAULT_SHEETS_API_URL =
  'https://script.google.com/macros/s/AKfycbzu7MvB-cE1oJ517NYxMyIxp7RaLfybK1rfTPutB_YBdgnbKIfL90xqLxdIQLCqaumpVg/exec';
const DEFAULT_SHEETS_API_TOKEN = 'GAUMAATRI_SECRET_2026';

const sheetsConfig = {
  url: SHEETS_API_URL || DEFAULT_SHEETS_API_URL,
  token: SHEETS_API_TOKEN || DEFAULT_SHEETS_API_TOKEN,
};

function sheetsEnabled() {
  return Boolean(sheetsConfig.url && sheetsConfig.token);
}

async function parseJsonResponse(response) {
  const text = await response.text();
  const trimmed = text.trim();
  if (trimmed.startsWith('<')) throw new Error('Sheets returned HTML (check deployment / permissions).');
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error('Sheets returned invalid JSON.');
  }
}

async function sheetsPost(payload, { attempts = 3 } = {}) {
  if (!sheetsEnabled()) throw new Error('Sheets API not configured.');

  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(sheetsConfig.url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ ...payload, token: sheetsConfig.token }),
      });
      const json = await parseJsonResponse(res);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `Sheets error (HTTP ${res.status})`);
      }
      return json;
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await sleep(250 * Math.pow(2, i));
    }
  }
  throw lastErr || new Error('Sheets request failed.');
}

async function sheetsGet(params, { attempts = 3 } = {}) {
  if (!sheetsEnabled()) throw new Error('Sheets API not configured.');

  const qs = new URLSearchParams({ ...params, token: sheetsConfig.token }).toString();
  const url = `${sheetsConfig.url}?${qs}`;

  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { method: 'GET' });
      const json = await parseJsonResponse(res);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `Sheets error (HTTP ${res.status})`);
      }
      return json;
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await sleep(250 * Math.pow(2, i));
    }
  }
  throw lastErr || new Error('Sheets request failed.');
}

// ── Razorpay instance ────────────────────────────────────────
	const razorpay = new Razorpay({
	  key_id:     RAZORPAY_KEY_ID,
	  key_secret: RAZORPAY_KEY_SECRET,
	});

	// ── Server-side pricing (never trust client totals) ─────────
	// Keep these in sync with the frontend options in index.html.
	const PRICES_INR = { '200ml': 356, '500ml': 789, '1L': 1599 };
	const VARIANT_LABELS = { '200ml': '200ml Starter Pack', '500ml': '500ml Family Pack', '1L': '1 Litre Bulk Pack' };
	const COUPONS = { GAUMAATRI10: 10, GHEE10: 10, WELCOME10: 10 };

	// razorpay_order_id -> pending checkout context (kept until verification).
	const pendingPayments = new Map();

	// Store submitted reviews (in production, use database or Google Sheets)
	const reviews = [];

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
	  if (!Number.isInteger(qtyNum) || qtyNum < 1 || qtyNum > 10) {
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
      notes: {
        variantKey: String(variantKey),
        qty: String(pricing.qty),
        couponCode: pricing.couponCode || '',
      },
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
      error: err.error?.description || err.message || 'Order creation failed',
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
async function verifyPaymentHandler(req, res) {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, customer } = req.body;

    // ── Validate required fields ─────────────────────────
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: razorpay_order_id, razorpay_payment_id, razorpay_signature'
      });
    }
    if (!customer?.name || !customer?.email || !customer?.phone || !customer?.address) {
      return res.status(400).json({
        success: false,
        error: 'Missing customer details'
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
      return res.status(400).json({ success: false, error: 'Invalid signature' });
    }

    // Prefer in-memory pending checkout context, but fall back to Razorpay order notes
    // (handles server restarts / cold starts)
    let pending = pendingPayments.get(razorpay_order_id);
    if (!pending) {
      try {
        const rpOrder = await razorpay.orders.fetch(razorpay_order_id);
        const variantKey = rpOrder?.notes?.variantKey;
        const qty = rpOrder?.notes?.qty;
        const couponCode = rpOrder?.notes?.couponCode || null;
        const pricing = computeTotalInr({ variantKey, qty, couponCode });
        const expectedPaise = Math.round(pricing.total * 100);
        if (Number(rpOrder?.amount) !== expectedPaise) {
          return res.status(400).json({ success: false, error: 'Amount mismatch' });
        }
        pending = {
          createdAt: Date.now(),
          variantKey,
          qty: pricing.qty,
          base: pricing.base,
          discount: pricing.discount,
          total: pricing.total,
          couponCode: pricing.couponCode,
          couponPct: pricing.couponPct,
        };
      } catch (err) {
        return res.status(400).json({
          success: false,
          error: 'Unknown or expired order. Please refresh and try again.',
        });
      }
    }
    const variantLabel = VARIANT_LABELS[pending.variantKey] || pending.variantKey;

    // ✅ Verified: only now create an internal order record (use Google Sheets for storage)
    const internalOrderId = genOrderId();
    // Remove local file system write - use Google Sheets instead
    pendingPayments.delete(razorpay_order_id);

    let sheetsSaved = false;
    let sheetsError = null;
    if (sheetsEnabled()) {
      try {
        await sheetsPost({
          action: 'submitOrder',
          orderId: internalOrderId,
          name: customer?.name || '',
          email: customer?.email || '',
          phone: customer?.phone || '',
          address: customer?.address || '',
          product: variantLabel,
          quantity: pending.qty,
          total: pending.total,
          paymentMethod: 'UPI',
          paymentStatus: `Paid - ${razorpay_payment_id}`,
          orderStatus: 'Order Received',
        });
        sheetsSaved = true;
      } catch (err) {
        sheetsError = err.message;
        console.warn('⚠️ Sheets sync failed (payment verified, DB saved):', err.message);
      }
    }

    console.log(`✅ Payment verified + order saved: ${razorpay_payment_id} -> ${internalOrderId}`);
    return res.status(200).json({ success: true, orderId: internalOrderId, sheetsSaved, sheetsError });

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
app.post('/api/cod-order', async (req, res) => {
  try {
    const { orderId, variantKey, qty, couponCode, customer } = req.body;

    if (!orderId) {
      return res.status(400).json({ success: false, error: 'Missing orderId' });
    }
    if (!customer?.name || !customer?.email || !customer?.phone || !customer?.address) {
      return res.status(400).json({ success: false, error: 'Missing customer details' });
    }

    const pricing = computeTotalInr({ variantKey, qty, couponCode });

    const variantLabel = VARIANT_LABELS[variantKey] || variantKey;

    // Remove local file system write - use Google Sheets instead
    console.log(`✅ COD order being saved: ${orderId}  ₹${pricing.total}`);

    let sheetsSaved = false;
    let sheetsError = null;
    if (sheetsEnabled()) {
      try {
        await sheetsPost({
          action: 'submitOrder',
          orderId,
          name: customer?.name || '',
          email: customer?.email || '',
          phone: customer?.phone || '',
          address: customer?.address || '',
          product: variantLabel,
          quantity: pricing.qty,
          total: pricing.total,
          paymentMethod: 'COD',
          paymentStatus: 'COD – Pay on Delivery',
          orderStatus: 'Order Received',
        });
        sheetsSaved = true;
      } catch (err) {
        sheetsError = err.message;
        console.warn('⚠️ Sheets sync failed (COD saved, DB saved):', err.message);
      }
    }

    return res.status(200).json({
      success: true,
      order_id: orderId,
      amount: pricing.total,
      payment_method: 'COD',
      status: 'confirmed',
      message: 'Order confirmed. Payment will be collected on delivery.',
      sheetsSaved,
      sheetsError
    });

  } catch (err) {
    console.error('❌ COD order error:', err);
    return res.status(err.statusCode || 500).json({ success: false, error: err.message || 'Order creation failed' });
  }
});

// ──────────────────────────────────────────────────────────
//  Track Order (Proxy to Google Sheets; hides token from browser)
// ──────────────────────────────────────────────────────────
app.get('/api/track-order', async (req, res) => {
  try {
    const orderId = String(req.query.orderId || '').trim().toUpperCase();
    if (!orderId) return res.status(400).json({ success: false, error: 'Missing orderId' });

    if (!sheetsEnabled()) {
      return res.status(500).json({ success: false, error: 'Sheets API not configured' });
    }

    const qs = new URLSearchParams({ action: 'trackOrder', orderId, token: sheetsConfig.token }).toString();
    const sheetRes = await fetch(`${sheetsConfig.url}?${qs}`, { method: 'GET' });
    const json = await parseJsonResponse(sheetRes);
    return res.status(sheetRes.status).json(json);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Tracking failed' });
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
//  POST /api/submit-review
//  Submits a customer review
//  Body: { name, location, rating, review }
//  Returns: { success: true/false, message }
// ──────────────────────────────────────────────────────────
app.post('/api/submit-review', async (req, res) => {
  try {
    const { name, location, rating, review } = req.body;

    // Validation
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "Name is required" });
    }
    if (!location || !location.trim()) {
      return res.status(400).json({ success: false, message: "Location is required" });
    }
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: "Rating must be 1-5" });
    }
    if (!review || !review.trim()) {
      return res.status(400).json({ success: false, message: "Review is required" });
    }
    if (review.trim().length < 10) {
      return res.status(400).json({ success: false, message: "Review must be at least 10 characters" });
    }
    if (review.trim().length > 500) {
      return res.status(400).json({ success: false, message: "Review must be under 500 characters" });
    }

    const reviewData = {
      id: Date.now(),
      name: name.trim(),
      location: location.trim(),
      rating: parseInt(rating),
      review: review.trim(),
      date: new Date().toISOString(),
      approved: false // Default to unapproved for moderation
    };

    // Save to in-memory reviews array
    reviews.push(reviewData);
    console.log("✅ Review received and saved locally:", reviewData);

    // Try to save to Google Sheets
    let sheetsSaved = false;
    let sheetsError = null;
    if (sheetsEnabled()) {
      try {
        await sheetsPost({
          action: 'submitReview',
          reviewId: reviewData.id,
          name: reviewData.name,
          location: reviewData.location,
          rating: reviewData.rating,
          review: reviewData.review,
          date: reviewData.date,
          approved: reviewData.approved ? 'Yes' : 'No'
        });
        sheetsSaved = true;
        console.log("✅ Review also saved to Google Sheets");
      } catch (err) {
        sheetsError = err.message;
        console.warn("⚠️ Failed to save review to Sheets:", err.message);
      }
    }

    return res.status(200).json({ 
      success: true, 
      message: "Review submitted! Thank you for your feedback. It will appear after approval.",
      sheetsSaved,
      sheetsError
    });
  } catch (error) {
    console.error("❌ Error submitting review:", error);
    return res.status(500).json({ success: false, message: "Error submitting review" });
  }
});

// ──────────────────────────────────────────────────────────
//  GET /api/get-reviews
//  Fetches approved customer reviews
//  Returns: { success: true, reviews: [...] }
// ──────────────────────────────────────────────────────────
const sampleReviews = [
  {
    name: "Priya Sharma",
    location: "Delhi, NCR",
    rating: 5,
    review: "The ghee smells exactly like what my grandmother used to make. The golden colour, the grainy texture — it's 100% authentic. I've tried many brands but Gaumaatri is the best I've found in years!",
    date: "2026-04-25",
    approved: true
  },
  {
    name: "Rahul Mehta",
    location: "Mumbai, Maharashtra",
    rating: 5,
    review: "My doctor recommended A2 ghee for my digestion issues. After 3 weeks of using Gaumaatri ghee daily, the difference is night and day. Lighter stomach, better energy. Absolutely worth every rupee!",
    date: "2026-04-24",
    approved: true
  },
  {
    name: "Ananya Gupta",
    location: "Jaipur, Rajasthan",
    rating: 5,
    review: "Ordered the 1L pack for my parents who are very particular about their food. They loved it so much, they asked me to order 3 more! The packaging is also super premium with glass jars. Hats off!",
    date: "2026-04-23",
    approved: true
  },
  {
    name: "Vikram Singh",
    location: "Pune, Maharashtra",
    rating: 5,
    review: "As a fitness enthusiast, I put ghee in my morning coffee for energy. Gaumaatri ghee is so pure it melts perfectly with no weird taste. Been using it for 4 months and my performance has improved!",
    date: "2026-04-22",
    approved: true
  },
  {
    name: "Sunita Agarwal",
    location: "Lucknow, UP",
    rating: 5,
    review: "Switched from market ghee to Gaumaatri 6 months ago. My kids are healthier, my cooking tastes better and the whole house smells amazing when I cook with it. Will never go back!",
    date: "2026-04-21",
    approved: true
  },
  {
    name: "Karan Malhotra",
    location: "Bengaluru, Karnataka",
    rating: 5,
    review: "Free delivery was the reason I tried it first, but the quality is the reason I keep coming back. On my 5th order now. Customer support via WhatsApp is also very responsive. 10/10!",
    date: "2026-04-20",
    approved: true
  }
];

app.get('/api/get-reviews', async (req, res) => {
  try {
    let allReviews = [];

    // Try to fetch from Google Sheets first
    if (sheetsEnabled()) {
      try {
        const sheetsResult = await sheetsGet({ action: 'getReviews' });
        if (sheetsResult.success && sheetsResult.reviews) {
          // Convert sheet data to review objects
          allReviews = sheetsResult.reviews.map(r => ({
            id: r.id || Date.now(),
            name: r.name,
            location: r.location,
            rating: parseInt(r.rating) || 5,
            review: r.review,
            date: r.date,
            approved: r.approved === 'Yes' || r.approved === true
          }));
          console.log("✅ Loaded reviews from Google Sheets:", allReviews.length);
        }
      } catch (err) {
        console.warn("⚠️ Failed to fetch from Sheets, using local data:", err.message);
      }
    }

    // Fallback to sample + in-memory reviews if Sheets fetch failed
    if (allReviews.length === 0) {
      allReviews = [...sampleReviews, ...reviews.filter(r => r.approved === true)];
      console.log("✅ Using local reviews:", allReviews.length);
    }
    
    // Sort by date (newest first) and get latest 10
    const approvedReviews = allReviews
      .filter(r => r.approved === true)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 10);

    return res.status(200).json({
      success: true,
      reviews: approvedReviews,
      source: sheetsEnabled() ? 'google-sheets' : 'local'
    });
  } catch (error) {
    console.error("❌ Error fetching reviews:", error);
    return res.status(500).json({ success: false, message: "Error fetching reviews" });
  }
});

// ──────────────────────────────────────────────────────────
//  GET /api/pending-reviews
//  View all pending (unapproved) reviews for moderation
// ──────────────────────────────────────────────────────────
app.get('/api/pending-reviews', async (req, res) => {
  try {
    let allReviews = [];

    // Try to fetch from Google Sheets first
    if (sheetsEnabled()) {
      try {
        const sheetsResult = await sheetsGet({ action: 'getReviews' });
        if (sheetsResult.success && sheetsResult.reviews) {
          // Convert sheet data to review objects
          allReviews = sheetsResult.reviews.map(r => ({
            id: r.id || Date.now(),
            name: r.name,
            location: r.location,
            rating: parseInt(r.rating) || 5,
            review: r.review,
            date: r.date,
            approved: r.approved === 'Yes' || r.approved === true
          }));
        }
      } catch (err) {
        console.warn("⚠️ Failed to fetch from Sheets for pending, using local data:", err.message);
      }
    }

    // Fallback to in-memory reviews if Sheets fetch failed
    if (allReviews.length === 0) {
      allReviews = reviews;
    }

    const pendingReviews = allReviews.filter(r => r.approved === false);
    return res.status(200).json({
      success: true,
      count: pendingReviews.length,
      reviews: pendingReviews,
      source: sheetsEnabled() ? 'google-sheets' : 'local'
    });
  } catch (error) {
    console.error("Error fetching pending reviews:", error);
    return res.status(500).json({ success: false, message: "Error fetching pending reviews" });
  }
});

// ──────────────────────────────────────────────────────────
//  POST /api/approve-review
//  Approve a review for display
// ──────────────────────────────────────────────────────────
app.post('/api/approve-review', async (req, res) => {
  try {
    const { reviewId } = req.body;
    const review = reviews.find(r => r.id === reviewId);
    
    if (!review) {
      return res.status(404).json({ success: false, message: "Review not found" });
    }
    
    review.approved = true;
    console.log("✅ Review approved locally:", reviewId);

    // Try to update in Google Sheets
    let sheetsSaved = false;
    let sheetsError = null;
    if (sheetsEnabled()) {
      try {
        await sheetsPost({
          action: 'approveReview',
          reviewId: reviewId
        });
        sheetsSaved = true;
        console.log("✅ Review approval also saved to Google Sheets");
      } catch (err) {
        sheetsError = err.message;
        console.warn("⚠️ Failed to update Sheets:", err.message);
      }
    }
    
    return res.status(200).json({
      success: true,
      message: "Review approved successfully",
      sheetsSaved,
      sheetsError
    });
  } catch (error) {
    console.error("Error approving review:", error);
    return res.status(500).json({ success: false, message: "Error approving review" });
  }
});

// ──────────────────────────────────────────────────────────
//  Health Check Endpoint
// ──────────────────────────────────────────────────────────
app.get('/api/debug', (req, res) => {
  try {
    const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.html'));
    res.json({
      __dirname,
      cwd: process.cwd(),
      env: process.env.NODE_ENV,
      htmlFiles: files.length,
      sampleFiles: files.slice(0, 5)
    });
  } catch (err) {
    res.json({
      error: err.message,
      __dirname
    });
  }
});

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
// This serves ALL files from the root directory and public directory
const fs = require('fs');
const staticDir = path.join(__dirname);
const publicDir = path.join(__dirname, 'public');
console.log('📁 __dirname:', __dirname);
console.log('📁 Serving static files from:', staticDir);
console.log('📁 Serving public files from:', publicDir);

// Log files in the directories for debugging
try {
  const rootFiles = fs.readdirSync(staticDir).filter(f => f.endsWith('.html'));
  const publicFiles = fs.readdirSync(publicDir).filter(f => f.endsWith('.html'));
  console.log('📄 HTML files in root:', rootFiles.length);
  console.log('📄 HTML files in public:', publicFiles.length);
} catch (err) {
  console.error('❌ Error reading directory:', err.message);
}

// ──────────────────────────────────────────────────────────
//  COUPON SYSTEM API ENDPOINTS (25% OFF coupons)
// ──────────────────────────────────────────────────────────
//  COUPON SYSTEM - Persistent File Storage (Production-Ready)
// ──────────────────────────────────────────────────────────

const fs = require('fs');
const COUPONS_FILE = path.join(__dirname, 'coupons-data.json');

// Helper functions for persistent storage
function loadCouponsData() {
  try {
    if (fs.existsSync(COUPONS_FILE)) {
      const data = fs.readFileSync(COUPONS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error reading coupons file:', err.message);
  }
  return { coupons: [], usage: [] };
}

function saveCouponsData(data) {
  try {
    fs.writeFileSync(COUPONS_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error saving coupons file:', err.message);
  }
}

// Load data from file
let couponsData = loadCouponsData();

// Helper to get coupon by code
function getCoupon(code) {
  return couponsData.coupons.find(c => c.code === code.toUpperCase());
}

// Helper to find coupon index
function getCouponIndex(code) {
  return couponsData.coupons.findIndex(c => c.code === code.toUpperCase());
}

// Helper to update coupon
function updateCoupon(code, updates) {
  const idx = getCouponIndex(code);
  if (idx >= 0) {
    couponsData.coupons[idx] = { ...couponsData.coupons[idx], ...updates };
    saveCouponsData(couponsData);
    return couponsData.coupons[idx];
  }
  return null;
}

// Helper to add coupon
function addCoupon(coupon) {
  couponsData.coupons.push(coupon);
  saveCouponsData(couponsData);
  return coupon;
}

// Helper to add usage record
function recordUsage(usage) {
  couponsData.usage.push(usage);
  saveCouponsData(couponsData);
  return usage;
}

// Legacy names for compatibility
const couponsDb = {
  get: (code) => getCoupon(code),
  set: (code, coupon) => {
    const existing = getCoupon(code);
    if (existing) {
      return updateCoupon(code, coupon);
    } else {
      return addCoupon({ ...coupon, code });
    }
  },
  has: (code) => !!getCoupon(code),
  values: () => couponsData.coupons,
};

const couponUsageDb = {
  push: (usage) => recordUsage(usage),
  filter: (fn) => couponsData.usage.filter(fn),
  reduce: (fn, init) => couponsData.usage.reduce(fn, init),
};

console.log(`✅ Loaded ${couponsData.coupons.length} coupons from persistent storage`);

// ──────────────────────────────────────────────────────────
//  POST /api/validate-coupon
//  Validates a coupon code and returns discount percentage
// ──────────────────────────────────────────────────────────
app.post('/api/validate-coupon', (req, res) => {
  try {
    const { couponCode, orderAmount } = req.body;
    const code = String(couponCode || '').trim().toUpperCase();

    if (!code) {
      return res.status(400).json({ valid: false, message: 'Coupon code required' });
    }

    const coupon = couponsDb.get(code);

    if (!coupon) {
      return res.status(400).json({ valid: false, message: 'Invalid coupon code' });
    }

    if (!coupon.active) {
      return res.status(400).json({ valid: false, message: 'Coupon is inactive' });
    }

    if (coupon.expiryDate && new Date(coupon.expiryDate) < new Date()) {
      return res.status(400).json({ valid: false, message: 'Coupon has expired' });
    }

    if (coupon.usageLimit && coupon.used >= coupon.usageLimit) {
      return res.status(400).json({ valid: false, message: 'Coupon usage limit reached' });
    }

    if (coupon.minAmount && orderAmount < coupon.minAmount) {
      return res.status(400).json({
        valid: false,
        message: `Minimum order amount is ₹${coupon.minAmount}`,
      });
    }

    const discount = Math.round((orderAmount * coupon.discount) / 100);

    res.json({
      valid: true,
      couponCode: code,
      discount: coupon.discount,
      discountAmount: discount,
      finalAmount: orderAmount - discount,
      message: `✅ ${coupon.discount}% discount applied!`,
    });
  } catch (err) {
    console.error('Coupon validation error:', err);
    res.status(500).json({ valid: false, message: 'Validation error' });
  }
});

// ──────────────────────────────────────────────────────────
//  POST /api/apply-coupon
//  Records coupon usage in checkout
// ──────────────────────────────────────────────────────────
app.post('/api/apply-coupon', (req, res) => {
  try {
    const { couponCode, orderId, variantKey, qty, amount } = req.body;
    const code = String(couponCode || '').trim().toUpperCase();

    const coupon = couponsDb.get(code);
    if (!coupon || !coupon.active) {
      return res.status(400).json({ success: false, message: 'Invalid coupon' });
    }

    // Increment usage
    coupon.used = (coupon.used || 0) + 1;

    // Record usage
    couponUsageDb.push({
      orderId,
      couponCode: code,
      variantKey,
      qty,
      originalAmount: amount,
      discountPercentage: coupon.discount,
      discountAmount: Math.round((amount * coupon.discount) / 100),
      timestamp: new Date().toISOString(),
    });

    res.json({ success: true, message: 'Coupon applied' });
  } catch (err) {
    console.error('Apply coupon error:', err);
    res.status(500).json({ success: false, message: 'Error applying coupon' });
  }
});

// ──────────────────────────────────────────────────────────
//  GET /api/admin/coupons
//  Get all coupons (requires auth in production)
// ──────────────────────────────────────────────────────────
app.get('/api/admin/coupons', (req, res) => {
  try {
    const coupons = couponsData.coupons;
    res.json({
      success: true,
      count: coupons.length,
      coupons: coupons,
    });
  } catch (err) {
    console.error('Get coupons error:', err);
    res.status(500).json({ success: false, message: 'Error fetching coupons' });
  }
});

// ──────────────────────────────────────────────────────────
//  POST /api/admin/create-coupon
//  Create a new coupon (requires admin auth in production)
// ──────────────────────────────────────────────────────────
app.post('/api/admin/create-coupon', (req, res) => {
  try {
    const { code, expiryDate, usageLimit, minAmount } = req.body;
    const couponCode = String(code || '').trim().toUpperCase();

    if (!couponCode || couponCode.length < 3) {
      return res.status(400).json({ success: false, message: 'Code must be at least 3 characters' });
    }

    if (couponsDb.has(couponCode)) {
      return res.status(400).json({ success: false, message: 'Coupon already exists' });
    }

    couponsDb.set(couponCode, {
      code: couponCode,
      discount: 25, // Fixed 25% discount
      expiryDate: expiryDate || null,
      usageLimit: usageLimit ? parseInt(usageLimit) : null,
      minAmount: minAmount ? parseInt(minAmount) : 0,
      used: 0,
      active: true,
      createdAt: new Date().toISOString(),
    });

    res.json({
      success: true,
      message: `Coupon ${couponCode} created with 25% discount`,
      coupon: couponsDb.get(couponCode),
    });
  } catch (err) {
    console.error('Create coupon error:', err);
    res.status(500).json({ success: false, message: 'Error creating coupon' });
  }
});

// ──────────────────────────────────────────────────────────
//  POST /api/admin/toggle-coupon
//  Enable/disable a coupon
// ──────────────────────────────────────────────────────────
app.post('/api/admin/toggle-coupon', (req, res) => {
  try {
    const { code, active } = req.body;
    const couponCode = String(code || '').trim().toUpperCase();

    const coupon = getCoupon(couponCode);
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }

    const updatedCoupon = updateCoupon(couponCode, { active: Boolean(active) });

    res.json({
      success: true,
      message: `Coupon ${couponCode} ${updatedCoupon.active ? 'enabled' : 'disabled'}`,
      coupon: updatedCoupon,
    });
  } catch (err) {
    console.error('Toggle coupon error:', err);
    res.status(500).json({ success: false, message: 'Error toggling coupon' });
  }
});

// ──────────────────────────────────────────────────────────
//  GET /api/admin/coupon-stats/:couponCode
//  Get usage stats for a specific coupon
// ──────────────────────────────────────────────────────────
app.get('/api/admin/coupon-stats/:couponCode', (req, res) => {
  try {
    const code = String(req.params.couponCode).trim().toUpperCase();
    const coupon = couponsDb.get(code);

    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }

    const usage = couponUsageDb.filter((u) => u.couponCode === code);
    const totalDiscount = usage.reduce((sum, u) => sum + u.discountAmount, 0);
    const totalRevenue = usage.reduce((sum, u) => sum + (u.originalAmount - u.discountAmount), 0);

    res.json({
      success: true,
      couponCode: code,
      timesUsed: coupon.used,
      uniqueOrders: usage.length,
      totalDiscountGiven: totalDiscount,
      totalRevenue: totalRevenue,
      coupon: coupon,
      recentUsage: usage.slice(-10),
    });
  } catch (err) {
    console.error('Get coupon stats error:', err);
    res.status(500).json({ success: false, message: 'Error fetching stats' });
  }
});

// ──────────────────────────────────────────────────────────
//  GET /api/admin/analytics
//  Get overall coupon analytics
// ──────────────────────────────────────────────────────────
app.get('/api/admin/analytics', (req, res) => {
  try {
    const coupons = Array.from(couponsDb.values());
    const totalOrders = couponUsageDb.length;
    const totalDiscount = couponUsageDb.reduce((sum, u) => sum + u.discountAmount, 0);
    const totalRevenue = couponUsageDb.reduce((sum, u) => sum + (u.originalAmount - u.discountAmount), 0);

    // Find top coupon
    const couponStats = {};
    couponUsageDb.forEach((usage) => {
      if (!couponStats[usage.couponCode]) {
        couponStats[usage.couponCode] = { count: 0, discount: 0, revenue: 0 };
      }
      couponStats[usage.couponCode].count += 1;
      couponStats[usage.couponCode].discount += usage.discountAmount;
      couponStats[usage.couponCode].revenue += usage.originalAmount - usage.discountAmount;
    });

    const topCoupon = Object.entries(couponStats).sort((a, b) => b[1].count - a[1].count)[0];

    res.json({
      success: true,
      totalCoupons: coupons.length,
      activeCoupons: coupons.filter((c) => c.active).length,
      totalOrders: totalOrders,
      totalDiscountGiven: totalDiscount,
      totalRevenue: totalRevenue,
      conversionRate: coupons.length > 0 ? ((totalOrders / coupons.length) * 100).toFixed(2) : 0,
      topCoupon: topCoupon ? { code: topCoupon[0], ...topCoupon[1] } : null,
      allCouponsStats: couponStats,
    });
  } catch (err) {
    console.error('Get analytics error:', err);
    res.status(500).json({ success: false, message: 'Error fetching analytics' });
  }
});

// Serve from public directory first (for Vercel deployment)
app.use(express.static(publicDir, {
  index: 'index.html',
  dotfiles: 'allow'
}));

// Also serve from root directory (for local development)
app.use(express.static(staticDir, {
  index: 'index.html',
  dotfiles: 'allow'
}));

// ──────────────────────────────────────────────────────────
//  Catch-all: Handle all other requests
// ──────────────────────────────────────────────────────────
app.get('*', (req, res, next) => {
  const ext = path.extname(req.path);
  
  console.log('🔍 Request:', req.path, 'Extension:', ext);
  
  // For paths without extension, serve index.html (SPA fallback)
  if (!ext || ext === '') {
    console.log('➡️  Serving index.html');
    return res.sendFile(path.join(__dirname, 'index.html'));
  }
  
  // For files with extensions, try to serve them directly  
  const filePath = path.join(__dirname, req.path);
  console.log('📂 Looking for:', filePath);
  
  // Check if file exists before trying to serve
  if (fs.existsSync(filePath)) {
    console.log('✅ Found! Serving:', req.path);
    return res.sendFile(filePath);
  }
  
  console.log('❌ File not found:', req.path);
  res.status(404).send('Not Found');
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
