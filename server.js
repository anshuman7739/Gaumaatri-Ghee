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
	const engine   = require('./backend/influencer-engine');

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
  ADMIN_TOKEN,
  EMAILJS_ACCESS_TOKEN,
  EMAILJS_SERVICE_ID,
  EMAILJS_USER_ID,
  EMAILJS_STATUS_TEMPLATE_ID,
} = process.env;

if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
  console.error('\n❌  Missing Razorpay credentials in .env file.');
  console.error('    Ensure RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are set.\n');
  process.exit(1);
}

// Admin API token. Prefer env var; generate a random one otherwise and log it.
// Trimmed: Vercel dashboard pastes often carry a trailing space/newline,
// which would otherwise make every login 401 even with the right token.
const adminToken = (ADMIN_TOKEN || '').trim() || crypto.randomBytes(24).toString('hex');
if (!ADMIN_TOKEN) {
  console.warn('⚠️  ADMIN_TOKEN not set — generated a temporary one: ' + adminToken);
  console.warn('    Set ADMIN_TOKEN in your environment/production.');
}

// Normalise a token for comparison: strip ALL whitespace and ignore case.
// Real-world wins with zero practical loss of secrecy:
//   • mobile keyboards auto-capitalise the first letter (case flip)
//   • copy/paste from dashboards adds/normalises whitespace
// Length is still effectively preserved, so the secret keeps its entropy.
function normalizeToken(v) {
  return String(v == null ? '' : v).replace(/\s+/g, '').toLowerCase();
}

const ADMIN_TOKEN_NORM = normalizeToken(adminToken);

function bearerToken(req) {
  const m = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || ''));
  return m ? m[1] : '';
}

function cookieToken(req) {
  const m = /(?:^|;\s*)gaumaatri_admin=([^;]*)/.exec(String(req.headers.cookie || ''));
  return m ? decodeURIComponent(m[1]) : '';
}

function requireAdmin(req, res, next) {
  const provided =
    req.headers['x-admin-token'] || bearerToken(req) || cookieToken(req) || req.query.token || '';

  if (!adminToken || normalizeToken(provided) !== ADMIN_TOKEN_NORM) {
    // Safe debug: lengths + whether the prefix matched. Never logs values.
    const p = normalizeToken(provided);
    console.warn(`🔒 admin reject: haveHeader=${Boolean(req.headers['x-admin-token'])} haveQuery=${Boolean(req.query.token)} providedLen=${p.length} expectedLen=${ADMIN_TOKEN_NORM.length} prefixMatch=${ADMIN_TOKEN_NORM ? p.slice(0, 3) === ADMIN_TOKEN_NORM.slice(0, 3) : false}`);
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  next();
}

function requireInfluencer(req, res, next) {
  const token = (req.query.token || req.headers['x-influencer-token'] || '').toString().trim();
  const inf = engine.getInfluencerByToken(token);
  if (!inf) return res.status(401).json({ success: false, error: 'Unauthorized' });
  req.influencer = inf;
  next();
}

// Google Sheets (Apps Script Web App) mirror — CONFIG ONLY, no hardcoded URLs.
// Previously these had baked-in default deployments, which meant a missing env
// var silently pointed at a DIFFERENT (and private) script, so orders vanished
// with no clear error. Now the env var is the single source of truth and a
// missing config fails loudly and visibly in /api/health.
const sheetsConfig = {
  url: (SHEETS_API_URL || '').trim(),
  token: (SHEETS_API_TOKEN || '').trim(),
};

if (!sheetsConfig.url || !sheetsConfig.token) {
  console.warn('⚠️  Google Sheets mirror DISABLED — set SHEETS_API_URL and SHEETS_API_TOKEN.');
  console.warn('    The Apps Script must be deployed as a Web app with "Who has access: Anyone".');
}

function sheetsEnabled() {
  return Boolean(sheetsConfig.url && sheetsConfig.token);
}

// Hydration reads BACK from Sheets, so it must only run when Sheets is
// explicitly configured via env. The hardcoded defaults may point at a stale
// Apps Script deployment, and local dev should never call out to it.
function sheetsExplicitlyConfigured() {
  return Boolean((SHEETS_API_URL || '').trim() && (SHEETS_API_TOKEN || '').trim());
}

async function parseJsonResponse(response) {
  const text = await response.text();
  const trimmed = text.trim();
  if (trimmed.startsWith('<')) {
    // A 302 is the classic symptom of an Apps Script web app that is NOT
    // deployed with "Who has access: Anyone" (Google redirects to a login page).
    const hint = response.status === 302 || response.status === 301
      ? 'Apps Script redirected to a login page — redeploy it as a Web app with "Who has access: Anyone".'
      : 'check deployment / permissions.';
    throw new Error(`Sheets returned HTML (HTTP ${response.status}) — ${hint}`);
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error('Sheets returned invalid JSON.');
  }
}

// Wrap fetch with a hard timeout so a slow/unreachable Sheets endpoint can never
// hang an admin request (used by order hydration, which runs on dashboard load).
async function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function sheetsPost(payload, { attempts = 3, timeoutMs = 5000 } = {}) {
  if (!sheetsEnabled()) throw new Error('Sheets API not configured.');

  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetchWithTimeout(sheetsConfig.url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ ...payload, token: sheetsConfig.token }),
      }, timeoutMs);
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

async function sheetsGet(params, { attempts = 3, timeoutMs = 5000 } = {}) {
  if (!sheetsEnabled()) throw new Error('Sheets API not configured.');

  const qs = new URLSearchParams({ ...params, token: sheetsConfig.token }).toString();
  const url = `${sheetsConfig.url}?${qs}`;

  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetchWithTimeout(url, { method: 'GET' }, timeoutMs);
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

// ============================================================
//  Order status-change confirmation emails (server-side)
//  Sends to the customer's email when the admin changes an
//  order's status (Pending -> Confirmed -> Shipped -> Delivered).
//  Config-gated by EMAILJS_* env vars. If not configured, this is
//  a harmless no-op and NEVER blocks the status update in the DB.
//  No secrets are exposed to the browser.
// ============================================================
const emailConfig = {
  accessToken: (EMAILJS_ACCESS_TOKEN || '').trim(),        // EmailJS private key (server-only)
  serviceId:   (EMAILJS_SERVICE_ID || '').trim(),
  userId:      (EMAILJS_USER_ID || '').trim(),
  templateId:  (EMAILJS_STATUS_TEMPLATE_ID || '').trim(),
};

function emailEnabled() {
  return Boolean(emailConfig.accessToken && emailConfig.serviceId && emailConfig.templateId);
}

async function sendStatusEmail(order, newStatus) {
  if (!emailEnabled()) return false;
  const product = (order.purchasedProducts && order.purchasedProducts[0]) || {};
  const params = {
    to_email:         order.email,
    customer_name:    order.customerName || '',
    order_id:         order.orderId,
    product_name:     product.name || '',
    quantity:         order.quantity || product.qty || '',
    total_amount:     '₹' + Number(order.finalPaidAmount || 0).toLocaleString('en-IN'),
    shipping_address: order.address || '',
    order_date:       new Date(order.timestamp).toLocaleString('en-IN'),
    status:           newStatus,
    email_subject:    `Your Gaumaatri order ${order.orderId} is now ${newStatus}`,
  };
  try {
    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accessToken:   emailConfig.accessToken,
        service_id:    emailConfig.serviceId,
        template_id:   emailConfig.templateId,
        user_id:       emailConfig.userId,
        template_params: params,
      }),
    });
    const text = await res.text();
    if (res.ok) {
      console.log(`✅ Status email sent to ${order.email} (order ${order.orderId} -> ${newStatus})`);
      return true;
    }
    console.warn(`⚠️ Status email rejected (HTTP ${res.status}): ${text}`);
    return false;
  } catch (e) {
    console.warn('⚠️ Status email failed:', e.message);
    return false;
  }
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

function resolveCouponOwner(couponCode) {
  const code = String(couponCode || "").trim().toUpperCase();

  if (!code) return "";

  return code;
}
async function computeTotalInr({ variantKey, qty, couponCode })  {
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

const code = String(couponCode || "").trim().toUpperCase();

let pct = 0;
let influencer = "";
let influencerId = null;
let commissionPercent = 0;
let valid = false;

if (code) {
  // Coupon validation happens SERVER-SIDE against the DB (source of truth).
  // Discount %/amount, eligibility, expiry, usage limit and influencer are all
  // resolved here — never trusted from the client.
  const v = engine.validateCoupon({ couponCode: code, cartValue: base, productKey: variantKey });

  if (v.valid) {
    pct = v.coupon.discountType === 'fixed'
      ? Math.round((v.discount / base) * 100)
      : safePct(v.coupon.discountValue);
    const r = engine.resolveInfluencerForCoupon(code);
    influencer = r.influencer ? r.influencer.influencerName : (v.coupon.influencerName || "");
    influencerId = r.influencer ? r.influencer.influencerId : null;
    commissionPercent = r.influencer ? r.influencer.commissionPercent : 0;
    influencer = influencer || "";
    valid = true;
  }
}

const discount = Math.round(base * pct / 100);
const total = base - discount;

	  return { base, discount, total, qty: qtyNum, couponCode: valid ? code : null, couponPct: pct, influencer, influencerId, commissionPercent };
	}

function safePct(n) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(0, Math.min(v, 100)) : 0;
}

// ============================================================
//  Order persistence (DB = source of truth) + Google Sheets sync
//  Sheets is only a MIRROR. If Sheets fails, the order still
//  succeeds and the row is queued for retry (outbox pattern).
// ============================================================
function cityStateFromAddress(address) {
  const parts = String(address || '').split(',').map(s => s.trim()).filter(Boolean);
  const state = parts.length >= 2 ? parts[parts.length - 2] : '';
  const city = parts.length >= 3 ? parts[parts.length - 3] : '';
  return { city, state };
}

// ── Hydrate orders from the Google Sheets mirror ────────────
// On serverless hosts the local JSON DB is ephemeral (/tmp), so after a cold
// start or redeploy the admin dashboard would otherwise show zero orders.
// Google Sheets is the durable mirror (written at order creation and on every
// status update), so we map its rows back into order records and add any that
// are missing locally. Existing local records are never overwritten, so local
// status changes + history always win. Throttled to avoid hammering Sheets.
let lastHydrateAt = 0;
let hydrateBackoffUntil = 0;
const HYDRATE_TTL_MS = 10000;
const HYDRATE_FAIL_BACKOFF_MS = 60000;

function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function sheetRowToOrder(r = {}) {
  const address = String(r.address || '').trim();
  const { city, state } = cityStateFromAddress(address);
  const product = String(r.product || '').trim();
  const quantity = safeNum(r.quantity, 1);
  const total = safeNum(r.total, 0);
  const discount = safeNum(r.couponDiscount, 0);
  const couponUsed = String(r.couponCode || '').trim();
  const influencerName = String(r.influencerName || '').trim();
  return {
    orderId: String(r.orderId || '').trim(),
    customerName: String(r.name || '').trim(),
    phone: String(r.phone || '').trim(),
    email: String(r.email || '').trim(),
    address,
    city,
    state,
    purchasedProducts: product ? [{ name: product, qty: quantity, price: total + discount }] : [],
    quantity,
    couponUsed,
    discountGiven: discount,
    originalPrice: total + discount,
    finalPaidAmount: total,
    paymentMethod: String(r.paymentMethod || '').trim(),
    paymentStatus: String(r.paymentStatus || '').trim(),
    orderStatus: String(r.orderStatus || '').trim(),
    timestamp: r.timestamp || '',
    influencerName: (influencerName && influencerName !== 'No Coupon') ? influencerName : null,
  };
}

async function hydrateOrdersFromSheets({ force = false } = {}) {
  if (!sheetsExplicitlyConfigured()) return 0;
  const now = Date.now();
  // After a failure, back off so a broken/slow Sheets endpoint can't add latency
  // to every dashboard request. Successful loads use the short TTL above.
  if (!force && now < hydrateBackoffUntil) return 0;
  if (!force && now - lastHydrateAt < HYDRATE_TTL_MS) return 0;
  lastHydrateAt = now;
  try {
    // Single attempt + short timeout: hydration must never delay the dashboard.
    const json = await sheetsGet({ action: 'getOrders' }, { attempts: 1, timeoutMs: 3000 });
    const rows = Array.isArray(json && json.orders) ? json.orders : [];
    hydrateBackoffUntil = 0;
    if (!rows.length) return 0;
    return engine.upsertOrdersBulk(rows.map(sheetRowToOrder));
  } catch (e) {
    hydrateBackoffUntil = Date.now() + HYDRATE_FAIL_BACKOFF_MS;
    console.warn('⚠️ Sheets order hydration skipped:', e.message);
    return 0;
  }
}

// ============================================================
//  Shared serverless-safe store (Vercel: read-only disk, no shared
//  filesystem between invocations). When ORDER_STORE_URL is set, order
//  records are mirrored to this HTTP JSON store so all instances share
//  state. Local dev keeps using the JSON file via the engine.
//  Endpoint contract (POST): { secret, op, record? } where op is
//  'upsert' | 'list'. Keep it minimal on purpose.
// ============================================================
const ORDER_STORE_URL = (process.env.ORDER_STORE_URL || '').trim();
const ORDER_STORE_SECRET = (process.env.ORDER_STORE_SECRET || '').trim();

function orderStoreEnabled() {
  return Boolean(ORDER_STORE_URL && ORDER_STORE_SECRET);
}

async function orderStoreUpsert(record) {
  if (!orderStoreEnabled() || !record) return;
  try {
    await fetch(ORDER_STORE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: ORDER_STORE_SECRET, op: 'upsert', record }),
    });
  } catch (e) {
    console.warn('⚠️ Order store mirror failed:', e.message);
  }
}

async function orderStoreList() {
  if (!orderStoreEnabled()) return null;
  try {
    const res = await fetch(ORDER_STORE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: ORDER_STORE_SECRET, op: 'list' }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray(data.records)) return data.records;
  } catch (e) {
    console.warn('⚠️ Order store read failed:', e.message);
  }
  return null;
}

// Record order in the DB (influencer/coupon engine) — idempotent by orderId.
function persistOrderToDb({ orderId, pricing, customer, paymentMethod, paymentStatus, orderStatus, productLabel }) {
  const { city, state } = cityStateFromAddress(customer.address);
  const rec = engine.recordInfluencerOrder({
    orderId,
    couponUsed: pricing.couponCode || '',
    influencerId: pricing.influencerId,
    influencerName: pricing.influencer,
    commissionPercent: pricing.commissionPercent,
    discountGiven: pricing.discount,
    originalPrice: pricing.base,
    finalPaidAmount: pricing.total,
    paymentMethod,
    paymentStatus,
    orderStatus,
    customerName: customer.name,
    phone: customer.phone,
    email: customer.email,
    city,
    state,
    address: customer.address,
    purchasedProducts: [{ name: productLabel, qty: pricing.qty, price: pricing.base }],
    quantity: pricing.qty,
  });
  // Fire-and-forget shared-store mirror (serverless-safe persistence).
  const stored = Array.isArray(rec) ? rec.find(o => o.orderId === orderId) : rec;
  if (stored && typeof stored === 'object') orderStoreUpsert(stored).catch(() => {});
  return rec;
}

// Build the payload that mirrors the order + coupon usage into Google Sheets.
function sheetsOrderPayload({ orderId, pricing, customer, paymentMethod, paymentStatus, orderStatus, productLabel }) {
  return {
    orderId,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    address: customer.address,
    product: productLabel,
    quantity: pricing.qty,
    total: pricing.total,
    couponCode: pricing.couponCode || '',
    couponDiscount: pricing.discount,
    influencerName: pricing.influencer || '',
    paymentMethod,
    paymentStatus,
    orderStatus,
  };
}

async function attemptSheetSync(entry) {
  const payload = entry.payload || {};
  try {
    if (!sheetsEnabled()) throw new Error('Sheets API not configured');
    // If not already the full submitOrder shape, wrap it.
    const body = payload.action ? payload : { ...payload, action: 'submitOrder' };
    // Apps Script cold starts + spreadsheet writes regularly exceed 5s; the old
    // 5s cap aborted valid syncs with "This operation was aborted". Retry once
    // with a generous timeout instead of hammering it three times quickly.
    await sheetsPost(body, { attempts: 2, timeoutMs: 25000 });
    engine.markSyncAttempt(entry.syncId, { success: true });
    return true;
  } catch (err) {
    engine.markSyncAttempt(entry.syncId, { success: false, error: err.message });
    return false;
  }
}

async function processPendingSyncs() {
  const due = engine.pendingSyncEntries();
  const results = [];
  for (const entry of due) {
    results.push(await attemptSheetSync(entry));
  }
  return { attempted: due.length, results };
}

// Record order in DB + enqueue Sheets sync, then fire-and-forget an
// immediate attempt. The order's success never depends on Sheets.
async function recordOrderAndSync({ orderId, pricing, customer, paymentMethod, paymentStatus, orderStatus = 'Order Received', productLabel }) {
  const dbOrder = persistOrderToDb({ orderId, pricing, customer, paymentMethod, paymentStatus, orderStatus, productLabel });
  const sheetsPayload = sheetsOrderPayload({ orderId, pricing, customer, paymentMethod, paymentStatus, orderStatus, productLabel });
  const entry = engine.enqueueSync(sheetsPayload);
  if (entry) {
    attemptSheetSync(entry).catch(() => { /* outbox will retry */ });
  }
  return dbOrder;
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
    const pricing = await computeTotalInr({ variantKey, qty, couponCode });

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
      influencer: pricing.influencer,
      influencerId: pricing.influencerId,
      commissionPercent: pricing.commissionPercent,
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
        const pricing = await computeTotalInr({ variantKey, qty, couponCode });
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
          influencer: pricing.influencer,
          influencerId: pricing.influencerId,
          commissionPercent: pricing.commissionPercent,
        };
      } catch (err) {
        return res.status(400).json({
          success: false,
          error: 'Unknown or expired order. Please refresh and try again.',
        });
      }
    }
    const variantLabel = VARIANT_LABELS[pending.variantKey] || pending.variantKey;

    // ✅ Verified: only now create an internal order record
    const internalOrderId = genOrderId();
    pendingPayments.delete(razorpay_order_id);

    // DB is the source of truth; Sheets is synced as a mirror with retry (outbox).
    const pricing = {
      couponCode: pending.couponCode,
      discount: pending.discount,
      base: pending.base,
      total: pending.total,
      qty: pending.qty,
      influencer: pending.influencer,
      influencerId: pending.influencerId,
      commissionPercent: pending.commissionPercent,
    };
    const customerInfo = { name: customer.name, email: customer.email, phone: customer.phone, address: customer.address };

    let sheetsSaved = false;
    let sheetsError = null;
    try {
      await recordOrderAndSync({
        orderId: internalOrderId,
        pricing,
        customer: customerInfo,
        paymentMethod: 'UPI',
        paymentStatus: `Paid - ${razorpay_payment_id}`,
        orderStatus: 'Order Received',
        productLabel: variantLabel,
      });
      sheetsSaved = true;
    } catch (err) {
      sheetsError = err.message;
      console.warn('⚠️ order save/sync issue (payment verified; DB is still authoritative):', err.message);
    }
    // Fire-and-forget retry of any overdue outbox rows.
    processPendingSyncs().catch(() => {});

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

    const pricing = await computeTotalInr({ variantKey, qty, couponCode });

    const variantLabel = VARIANT_LABELS[variantKey] || variantKey;

    // Remove local file system write - use Google Sheets instead
    console.log(`✅ COD order being saved: ${orderId}  ₹${pricing.total}`);

    let sheetsSaved = false;
    let sheetsError = null;
    try {
      await recordOrderAndSync({
        orderId,
        pricing,
        customer,
        paymentMethod: 'COD',
        paymentStatus: 'COD – Pay on Delivery',
        orderStatus: 'Order Received',
        productLabel: variantLabel,
      });
      sheetsSaved = true;
    } catch (err) {
      sheetsError = err.message;
      console.warn('⚠️ COD save/sync issue (DB is authoritative, outbox will retry):', err.message);
    }
    processPendingSyncs().catch(() => {});

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
//  Orders List for Dashboard (Proxy to Google Sheets)
// ──────────────────────────────────────────────────────────
app.get('/api/orders', async (req, res) => {
  try {
    if (!sheetsEnabled()) {
      return res.status(500).json({ success: false, error: 'Sheets API not configured' });
    }

    const qs = new URLSearchParams({ action: 'getOrders', token: sheetsConfig.token }).toString();
    const sheetRes = await fetch(`${sheetsConfig.url}?${qs}`, { method: 'GET' });
    const json = await parseJsonResponse(sheetRes);
    return res.status(sheetRes.status).json(json);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to fetch orders' });
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
    // Non-secret presence flags only (never values): lets the owner verify
    // production env wiring without exposing anything.
    config: {
      adminTokenSet: Boolean(ADMIN_TOKEN),
      // Length only (never the value). A length alone does not help brute-force
      // a long random secret, but it instantly reveals a wrong-token paste.
      adminTokenLen: ADMIN_TOKEN_NORM.length,
      // Lets the owner confirm the forgiving-auth build is actually deployed
      // (whitespace-trimmed + case-insensitive compare). Not a secret.
      authMode: 'normalized-v1',
      dbPath: process.env.VERCEL ? '/tmp (ephemeral)' : 'local-file',
      sheetsSet: Boolean(SHEETS_API_URL && SHEETS_API_TOKEN),
      emailSet: Boolean(EMAILJS_ACCESS_TOKEN && EMAILJS_SERVICE_ID && EMAILJS_USER_ID && EMAILJS_STATUS_TEMPLATE_ID),
      orderStoreSet: Boolean((process.env.ORDER_STORE_URL || '').trim() && (process.env.ORDER_STORE_SECRET || '').trim()),
      // Non-secret diagnostics: confirms the coupon seed actually ran in the
      // live serverless bundle (coupon codes are public marketing codes).
      couponsTotal: (() => { try { return (engine.loadDb().coupons || []).length; } catch { return -1; } })(),
      couponsEnabled: (() => { try { return (engine.loadDb().coupons || []).filter(c => c.enabled !== false).length; } catch { return -1; } })(),
    },
    timestamp: new Date().toISOString()
  });
});

// ============================================================
//  INFLUENCER COUPON SYSTEM — API
//  DB (backend/influencer-engine) is the source of truth.
// ============================================================
// Built-in default coupons. Kept in CODE (not only in coupons-data.json)
// because serverless bundlers (Vercel/@vercel/node) do not reliably include
// plain data files read via fs.readFileSync — which silently left production
// with ZERO valid coupons. The JSON file is still used as an optional overlay.
const DEFAULT_COUPONS = [
  { code: 'ANKIT25', discount: 25, expiryDate: null, usageLimit: null, minAmount: 0, active: true },
  { code: 'FITNESS25', discount: 25, expiryDate: null, usageLimit: 50, minAmount: 0, active: true },
  { code: 'MOM25', discount: 25, expiryDate: null, usageLimit: null, minAmount: 0, active: true },
  { code: 'WELCOME25', discount: 25, expiryDate: null, usageLimit: null, minAmount: 0, active: true },
];

// Returns the set of seed coupons: built-ins, plus any extra codes found in
// coupons-data.json when that file happens to be available.
function seedCouponList() {
  let fileSeed = [];
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'coupons-data.json'), 'utf8');
    const parsed = JSON.parse(raw);
    fileSeed = Array.isArray(parsed?.coupons) ? parsed.coupons : [];
  } catch { fileSeed = []; }

  const byCode = new Map();
  DEFAULT_COUPONS.forEach(c => byCode.set(String(c.code).toUpperCase(), c));
  fileSeed.forEach(c => {
    const code = String(c.code || c.couponCode || '').toUpperCase();
    if (code) byCode.set(code, c);
  });
  return Array.from(byCode.values());
}

function seedDefaultCoupons() {
  try {
    const db = engine.loadDb();
    for (const c of seedCouponList()) {
      const code = c.code || c.couponCode;
      if (!code) continue;
      // Idempotent: skip codes that already exist (avoids wiping usage counts).
      const exists = (db.coupons || []).some(
        x => String(x.couponCode).toUpperCase() === String(code).toUpperCase()
      );
      if (exists) continue;
      try {
        engine.createCoupon({
          couponCode: code,
          discountValue: c.discount || c.discountValue || 10,
          discountType: 'percentage',
          expiryDate: c.expiryDate || null,
          maximumUses: c.usageLimit == null ? null : c.usageLimit,
          minimumCartValue: c.minAmount || 0,
          enabled: c.active !== false,
        });
      } catch (e) { /* duplicate — skip */ }
    }
  } catch (e) { console.warn('⚠️ Coupon seed skipped:', e.message); }
}
seedDefaultCoupons();

// Public: live coupon validation for checkout (server-side, authoritative).
app.post('/api/validate-coupon', (req, res) => {
  try {
    const { couponCode, cartValue, productKey } = req.body || {};
    const base = Math.max(0, Number(cartValue) || 0);
    const v = engine.validateCoupon({ couponCode: couponCode || '', cartValue: base, productKey: productKey || '' });
    if (v.valid) {
      const discount = Math.min(v.discount, base);
      return res.status(200).json({
        success: true, valid: true, code: v.coupon.couponCode,
        discountPercent: v.coupon.discountType === 'fixed' ? Math.round((discount / base) * 100) : v.coupon.discountValue,
        discountAmount: discount, message: v.message || 'Coupon applied',
      });
    }
    return res.status(200).json({ success: false, valid: false, code: String(couponCode || '').toUpperCase(), message: v.message || 'Invalid coupon' });
  } catch (e) {
    return res.status(200).json({ success: false, valid: false, message: 'Coupon validation error' });
  }
});

// ── INFLUENCER (self-service, gated by influencer access token) ──
app.get('/api/influencer/dashboard', requireInfluencer, (req, res) => {
  try {
    const data = engine.getInfluencerDashboard(req.influencer.influencerId);
    return res.status(200).json({ success: true, ...data });
  } catch (e) {
    return res.status(400).json({ success: false, error: e.message });
  }
});

app.get('/api/influencer/orders', requireInfluencer, (req, res) => {
  try {
    const data = engine.getInfluencerDashboard(req.influencer.influencerId);
    return res.status(200).json({ success: true, orders: data.orderList, totals: {
      couponUsed: data.couponUsed, orders: data.orders, sales: data.sales, commission: data.commission, earnings: data.earnings,
    } });
  } catch (e) {
    return res.status(400).json({ success: false, error: e.message });
  }
});


// ── ADMIN: lightweight auth probe (no DB/filesystem access) ──
// Used by admin dashboards to verify the token; isolates auth failures
// from order-DB failures (important on read-only serverless disks).
app.get('/api/admin/ping', requireAdmin, (req, res) => {
  return res.status(200).json({ success: true, message: 'Admin authenticated' });
});

// ── ADMIN: analytics + usage (filtered) ──
app.get('/api/admin/analytics', requireAdmin, async (req, res) => {
  try {
    await hydrateOrdersFromSheets();
    const a = engine.getAnalytics();
    return res.status(200).json({ success: true, ...a });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/admin/usage', requireAdmin, async (req, res) => {
  try {
    await hydrateOrdersFromSheets();
    const filters = {
      couponCode: req.query.coupon,
      influencerId: req.query.influencer,
      customer: req.query.customer,
      orderId: req.query.order,
      from: req.query.from,
      to: req.query.to,
      orderStatus: req.query.status,
    };
    const { records, totals } = engine.getUsageRecords(filters);
    return res.status(200).json({ success: true, records, totals, filters });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/admin/db', requireAdmin, async (req, res) => {
  try {
    // Serverless cold start: the /tmp JSON DB may be empty. Pull durable orders
    // back from the Google Sheets mirror before rendering the dashboard.
    await hydrateOrdersFromSheets();
    const view = engine.getDbView();
    if (orderStoreEnabled()) {
      const shared = await orderStoreList();
      if (Array.isArray(shared)) view.orders = shared;
    }
    return res.status(200).json({ success: true, ...view });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// ── ADMIN: coupon CRUD ──
app.post('/api/admin/coupons', requireAdmin, (req, res) => {
  try {
    const b = req.body || {};
    const coupon = engine.createCoupon({
      couponCode: b.couponCode || b.code,
      discountType: b.discountType === 'fixed' ? 'fixed' : 'percentage',
      discountValue: b.discountValue,
      expiryDate: b.expiryDate || null,
      minimumCartValue: b.minimumCartValue || 0,
      maximumDiscount: b.maximumDiscount ?? null,
      maximumUses: b.maximumUses ?? null,
      influencerId: b.influencerId || null,
      influencerName: b.influencerName || null,
      applicableProducts: b.applicableProducts || [],
      enabled: b.enabled !== false,
    });
    return res.status(201).json({ success: true, coupon });
  } catch (e) {
    return res.status(400).json({ success: false, error: e.message });
  }
});

app.put('/api/admin/coupons/:code', requireAdmin, (req, res) => {
  try {
    const b = req.body || {};
    const coupon = engine.updateCoupon(req.params.code, {
      discountType: b.discountType,
      discountValue: b.discountValue,
      expiryDate: b.expiryDate,
      minimumCartValue: b.minimumCartValue,
      maximumDiscount: b.maximumDiscount,
      maximumUses: b.maximumUses,
      influencerId: b.influencerId,
      influencerName: b.influencerName,
      applicableProducts: b.applicableProducts,
    });
    return res.status(200).json({ success: true, coupon });
  } catch (e) {
    return res.status(400).json({ success: false, error: e.message });
  }
});

app.patch('/api/admin/coupons/:code/toggle', requireAdmin, (req, res) => {
  try {
    const coupon = engine.toggleCoupon(req.params.code, req.body.enabled !== false);
    return res.status(200).json({ success: true, coupon });
  } catch (e) {
    return res.status(400).json({ success: false, error: e.message });
  }
});

// ── ADMIN: influencer CRUD ──
app.post('/api/admin/influencers', requireAdmin, (req, res) => {
  try {
    const b = req.body || {};
    const inf = engine.createInfluencer({
      influencerName: b.influencerName,
      instagramUsername: b.instagramUsername,
      couponCode: b.couponCode,
      couponDiscountPercent: b.couponDiscountPercent || 0,
      commissionPercent: b.commissionPercent || 0,
      phone: b.phone,
      email: b.email,
      notes: b.notes,
      status: b.status,
    });
    return res.status(201).json({ success: true, influencer: inf });
  } catch (e) {
    return res.status(400).json({ success: false, error: e.message });
  }
});

app.put('/api/admin/influencers/:id', requireAdmin, (req, res) => {
  try {
    const inf = engine.updateInfluencer(req.params.id, req.body || {});
    return res.status(200).json({ success: true, influencer: inf });
  } catch (e) {
    return res.status(400).json({ success: false, error: e.message });
  }
});

// ── ADMIN: commission payout ──
app.post('/api/admin/commission/:orderId/pay', requireAdmin, (req, res) => {
  try {
    const order = engine.markCommissionPaid({
      orderId: req.params.orderId,
      transactionId: (req.body || {}).transactionId,
      notes: (req.body || {}).notes,
    });
    return res.status(200).json({ success: true, order });
  } catch (e) {
    return res.status(400).json({ success: false, error: e.message });
  }
});

// ── ADMIN: void (cancel/refund) an order — reverses coupon usage ──
app.post('/api/admin/orders/:orderId/void', requireAdmin, (req, res) => {
  try {
    const status = (req.body || {}).status === 'Refunded' ? 'Refunded' : 'Cancelled';
    const order = engine.voidInfluencerOrder(req.params.orderId, status);
    return res.status(200).json({ success: true, order });
  } catch (e) {
    return res.status(400).json({ success: false, error: e.message });
  }
});

// ── ADMIN: update order status ──
// DB is authoritative. Google Sheets is mirrored best-effort and NEVER blocks the
// response (fire-and-forget), so admin status changes stay instant even if the
// Sheets endpoint is slow/unreachable.
app.patch('/api/admin/orders/:orderId/status', requireAdmin, async (req, res) => {
  try {
    const { status } = req.body || {};
    const note = (req.body || {}).note;
    let order;
    try {
      order = engine.updateOrderStatus(req.params.orderId, status, { note });
    } catch (err) {
      // Cold start / ephemeral DB: the order may only exist in the Sheets mirror.
      // Pull it in, then retry the update once.
      if (/not found/i.test(err.message)) {
        await hydrateOrdersFromSheets({ force: true });
        order = engine.updateOrderStatus(req.params.orderId, status, { note });
      } else {
        throw err;
      }
    }
    if (sheetsEnabled()) {
      Promise.resolve()
        .then(() => sheetsPost({ action: 'updateStatus', orderId: order.orderId, status: order.orderStatus }))
        .catch(() => { /* DB is authoritative; mirror is optional */ });
    }
    // Notify the customer of the new status (fire-and-forget; no-op if EMAILJS not configured).
    Promise.resolve()
      .then(() => sendStatusEmail(order, order.orderStatus))
      .catch(() => { /* email is best-effort */ });
    // Mirror to the shared store too (serverless-safe).
    if (orderStoreEnabled()) orderStoreUpsert(order).catch(() => {});
    return res.status(200).json({ success: true, order });
  } catch (e) {
    return res.status(400).json({ success: false, error: e.message });
  }
});

// ── ADMIN: Google Sheets outbox (retry) ──
app.get('/api/admin/sync', requireAdmin, (req, res) => {
  try {
    return res.status(200).json({ success: true, stats: engine.syncQueueStats(), queue: engine.pendingSyncList(100) });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/admin/sync/retry', requireAdmin, async (req, res) => {
  try {
    const result = await processPendingSyncs();
    return res.status(200).json({ success: true, ...result, stats: engine.syncQueueStats() });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
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

// Explicit dashboard routes (fix blank responses)
app.get('/view-orders.html', (req, res) => {
  return res.sendFile(path.join(__dirname, 'view-orders.html'));
});

app.get('/admin-coupons.html', (req, res) => {
  return res.sendFile(path.join(__dirname, 'admin-coupons.html'));
});

app.get('/influencer-dashboard.html', (req, res) => {
  return res.sendFile(path.join(__dirname, 'influencer-dashboard.html'));
});

app.get('/admin-orders.html', (req, res) => {
  return res.sendFile(path.join(__dirname, 'admin-orders.html'));
});

app.get('/admin-dashboard.html', (req, res) => {
  return res.sendFile(path.join(__dirname, 'admin-coupons.html'));
});

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
