'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

// Storage location.
// Prefer the repo-root database file when it already has data. The old
// `data/influencers-data.json` file was being used as the default even after a
// valid root JSON file existed, which caused the admin dashboard to appear empty
// after a restart. Keep a fallback to the data/ folder for compatibility, and
// allow explicit overrides via INFLUENCER_DB_PATH.
const ROOT_DB_PATH = path.resolve(__dirname, '..', 'influencers-data.json');
const LEGACY_DB_PATH = path.resolve(__dirname, '..', 'data', 'influencers-data.json');
const DB_PATH = process.env.INFLUENCER_DB_PATH
  ? process.env.INFLUENCER_DB_PATH
  : (() => {
      const rootExists = fs.existsSync(ROOT_DB_PATH) && fs.statSync(ROOT_DB_PATH).size > 0;
      const legacyExists = fs.existsSync(LEGACY_DB_PATH) && fs.statSync(LEGACY_DB_PATH).size > 0;

      if (rootExists) return ROOT_DB_PATH;
      if (legacyExists) return LEGACY_DB_PATH;
      if (!process.env.VERCEL && fs.existsSync(path.resolve(__dirname, '..'))) return ROOT_DB_PATH;

      if (process.env.VERCEL) {
        console.warn('⚠️ Vercel detected: using /tmp for influencer DB. Set INFLUENCER_DB_PATH or Upstash env vars to durable storage.');
      }
      return path.join('/tmp', 'influencers-data.json');
    })();
const REDIS_KEY = process.env.INFLUENCER_DB_KEY || 'gaumaatri:influencer-db';

function getUpstashConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ''), token, key: REDIS_KEY };
}

function unwrapUpstashValue(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return unwrapUpstashValue(parsed);
    } catch (e) {
      return value;
    }
  }
  if (typeof value === 'object') {
    if (Object.prototype.hasOwnProperty.call(value, 'value') && value.value !== undefined) {
      return unwrapUpstashValue(value.value);
    }
    return value;
  }
  return value;
}

function readUpstashDbSync() {
  const cfg = getUpstashConfig();
  if (!cfg) return null;
  try {
    const script = `
      (async () => {
        const url = process.env.UPSTASH_REDIS_REST_URL;
        const token = process.env.UPSTASH_REDIS_REST_TOKEN;
        const key = process.env.INFLUENCER_DB_KEY || 'gaumaatri:influencer-db';
        const res = await fetch(url + '/get/' + encodeURIComponent(key), {
          headers: { Authorization: 'Bearer ' + token }
        });
        const text = await res.text();
        if (!res.ok) throw new Error('Upstash get failed: ' + res.status + ' ' + text);
        const json = JSON.parse(text || '{}');
        process.stdout.write(JSON.stringify(json && Object.prototype.hasOwnProperty.call(json, 'result') ? json.result : null));
      })().catch(err => { console.error(err.message); process.exit(1); });
    `;
    const out = execFileSync(process.execPath, ['-e', script], {
      encoding: 'utf8',
      env: { ...process.env, UPSTASH_REDIS_REST_URL: cfg.url, UPSTASH_REDIS_REST_TOKEN: cfg.token, INFLUENCER_DB_KEY: cfg.key },
    });
    const parsed = JSON.parse(out || 'null');
    const raw = parsed && Object.prototype.hasOwnProperty.call(parsed, 'result') ? parsed.result : parsed;
    const value = unwrapUpstashValue(raw);
    if (!value || typeof value !== 'object') return null;
    return value;
  } catch (e) {
    console.warn('⚠️ Upstash read failed — falling back to file cache:', e.message);
    return null;
  }
}

function writeUpstashDbSync(db) {
  const cfg = getUpstashConfig();
  if (!cfg) return false;
  try {
    const script = `
      (async () => {
        const url = process.env.UPSTASH_REDIS_REST_URL;
        const token = process.env.UPSTASH_REDIS_REST_TOKEN;
        const key = process.env.INFLUENCER_DB_KEY || 'gaumaatri:influencer-db';
        const value = process.argv[1];
        const res = await fetch(url + '/set/' + encodeURIComponent(key), {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ value })
        });
        const text = await res.text();
        if (!res.ok) throw new Error('Upstash set failed: ' + res.status + ' ' + text);
        process.stdout.write(text || '{}');
      })().catch(err => { console.error(err.message); process.exit(1); });
    `;
    const payload = JSON.stringify(db);
    execFileSync(process.execPath, ['-e', script, payload], {
      encoding: 'utf8',
      env: { ...process.env, UPSTASH_REDIS_REST_URL: cfg.url, UPSTASH_REDIS_REST_TOKEN: cfg.token, INFLUENCER_DB_KEY: cfg.key },
    });
    return true;
  } catch (e) {
    console.warn('⚠️ Upstash write failed — file persistence preserved:', e.message);
    return false;
  }
}

const DEFAULT_DB = {
  influencers: [],
  coupons: [],
  referrals: [],
  orders: [],
  commissions: [],
  notifications: [],
  meta: {
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
};

function normalizeDbShape(raw = {}) {
  return {
    ...DEFAULT_DB,
    ...raw,
    influencers: Array.isArray(raw.influencers) ? raw.influencers : [],
    coupons: Array.isArray(raw.coupons) ? raw.coupons : [],
    referrals: Array.isArray(raw.referrals) ? raw.referrals : [],
    orders: Array.isArray(raw.orders) ? raw.orders : [],
    commissions: Array.isArray(raw.commissions) ? raw.commissions : [],
    notifications: Array.isArray(raw.notifications) ? raw.notifications : [],
    pendingSync: Array.isArray(raw.pendingSync) ? raw.pendingSync : [],
    meta: {
      ...DEFAULT_DB.meta,
      ...(raw.meta || {}),
    },
  };
}

function nowIso() {
  return new Date().toISOString();
}

function safeNumber(n, fallback = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

function ensureDbFile() {
  // NOTE: serverless hosts (Vercel) can have an ephemeral filesystem. If the
  // configured DB path is not writable, fail gracefully and keep serving from
  // memory instead of blanking the DB.
  try {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(DB_PATH)) {
      fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_DB, null, 2), 'utf8');
    }
  } catch (e) {
    console.warn('⚠️ Order DB not writable (read-only filesystem or ephemeral store) — continuing in memory:', e.message);
  }
}

// In-process cache. Without it every request re-read the file from disk, so
// two concurrent requests (e.g. an incoming order + a dashboard hydration)
// could each load, mutate, and save — the last writer wins and silently
// erases the other's orders ("orders vanish"). With the cache, mutations
// always build on the newest in-memory state; the disk write is best-effort.
let dbCache = null;

// On serverless (read-only disk) the JSON file may be missing/unwritable:
// fall back to an in-memory empty DB instead of crashing the request.
function loadDb() {
  if (dbCache) return dbCache;

  try {
    const redisDb = readUpstashDbSync();
    if (redisDb && typeof redisDb === 'object') {
      dbCache = normalizeDbShape(redisDb);
      return dbCache;
    }
  } catch (e) {
    console.warn('⚠️ Redis DB read failed — falling back to file cache:', e.message);
  }

  try {
    ensureDbFile();
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    const parsed = raw ? JSON.parse(raw) : {};
    dbCache = normalizeDbShape(parsed);
    return dbCache;
  } catch (e) {
    console.warn('⚠️ File-based DB read failed — bootstrapping empty DB:', e.message);
  }

  // NEVER blank the database during a transient storage outage.
  // If there is no durable data to load, keep the app on a bootstrap state
  // rather than overwriting the in-memory cache with an empty default.
  if (!dbCache) {
    dbCache = normalizeDbShape(DEFAULT_DB);
  }

  return dbCache;
}

function saveDb(db) {
  db.meta = db.meta || {};
  db.meta.updatedAt = nowIso();
  dbCache = db; // in-memory state is always the newest — never reload stale disk

  try {
    // Atomic write: a concurrent read must never catch a half-written file
    // (which used to parse-fail and blank the whole DB).
    const tmp = DB_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
    fs.renameSync(tmp, DB_PATH);
  } catch (e) {
    console.warn('⚠️ Order DB persist skipped (read-only filesystem):', e.message);
  }

  try {
    writeUpstashDbSync(db);
  } catch (e) {
    console.warn('⚠️ Upstash sync skipped:', e.message);
  }

  return db;
}

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

function normalizeCouponCode(code) {
  return String(code || '').trim().toUpperCase();
}

function createInfluencer(payload = {}) {
  const db = loadDb();
  if (safeNumber(payload.commissionPercent, 0) < 0) throw new Error('Commission must be >= 0');
  if (safeNumber(payload.commissionPercent, 0) > 100) throw new Error('Commission must be <= 100');
  const influencer = {
    influencerId: id('inf'),
    influencerName: String(payload.influencerName || '').trim(),
    instagramUsername: String(payload.instagramUsername || '').trim(),
    couponCode: normalizeCouponCode(payload.couponCode),
    couponDiscountPercent: safeNumber(payload.couponDiscountPercent, 0),
    commissionPercent: safeNumber(payload.commissionPercent, 0),
    phone: String(payload.phone || '').trim(),
    email: String(payload.email || '').trim().toLowerCase(),
    status: payload.status === 'Disabled' ? 'Disabled' : 'Active',
    accessToken: String(payload.accessToken || '').trim() || crypto.randomBytes(16).toString('hex'),
    createdDate: nowIso(),
    totalOrders: 0,
    totalRevenue: 0,
    totalCommission: 0,
    lastOrderDate: null,
    notes: String(payload.notes || '').trim(),
    profilePicture: String(payload.profilePicture || '').trim(),
  };

  if (!influencer.influencerName) throw new Error('Influencer name is required');
  if (!influencer.couponCode) throw new Error('Coupon code is required');

  const exists = db.influencers.find(i => normalizeCouponCode(i.couponCode) === influencer.couponCode);
  if (exists) throw new Error('Coupon code already exists');

  db.influencers.push(influencer);
  saveDb(db);
  return influencer;
}

function listInfluencers(filters = {}) {
  const db = loadDb();
  let out = [...db.influencers];
  if (filters.status) out = out.filter(i => i.status === filters.status);
  return out.sort((a, b) => String(a.influencerName).localeCompare(String(b.influencerName)));
}

function updateInfluencer(influencerId, patch = {}) {
  const db = loadDb();
  const inf = db.influencers.find(i => i.influencerId === influencerId);
  if (!inf) throw new Error('Influencer not found');

  if (patch.influencerName != null) inf.influencerName = String(patch.influencerName).trim();
  if (patch.instagramUsername != null) inf.instagramUsername = String(patch.instagramUsername).trim();
  if (patch.phone != null) inf.phone = String(patch.phone).trim();
  if (patch.email != null) inf.email = String(patch.email).trim().toLowerCase();
  if (patch.commissionPercent != null) {
    const c = safeNumber(patch.commissionPercent, -1);
    if (c < 0 || c > 100) throw new Error('Commission must be between 0 and 100');
    inf.commissionPercent = c;
  }
  if (patch.status != null) inf.status = patch.status === 'Disabled' ? 'Disabled' : 'Active';
  if (patch.notes != null) inf.notes = String(patch.notes).trim();

  saveDb(db);
  return inf;
}

function getInfluencerByToken(token) {
  if (!token) return null;
  const db = loadDb();
  return db.influencers.find(i => i.accessToken && i.accessToken === String(token).trim()) || null;
}

function createCoupon(payload = {}) {
  const db = loadDb();
  const couponCode = normalizeCouponCode(payload.couponCode || payload.code);
  if (!couponCode) throw new Error('couponCode is required');

  const exists = db.coupons.find(c => normalizeCouponCode(c.couponCode) === couponCode);
  if (exists) throw new Error('Coupon already exists');

  const coupon = {
    couponId: id('cpn'),
    couponCode,
    influencerId: String(payload.influencerId || '').trim() || null,
    influencerName: String(payload.influencerName || '').trim() || null,
    discountType: payload.discountType === 'fixed' ? 'fixed' : 'percentage',
    discountValue: safeNumber(payload.discountValue, 0),
    expiryDate: payload.expiryDate ? new Date(payload.expiryDate).toISOString() : null,
    maximumUses: payload.maximumUses == null ? null : Math.max(0, parseInt(payload.maximumUses, 10) || 0),
    minimumCartValue: safeNumber(payload.minimumCartValue, 0),
    maximumDiscount: payload.maximumDiscount == null ? null : safeNumber(payload.maximumDiscount, 0),
    applicableProducts: Array.isArray(payload.applicableProducts) ? payload.applicableProducts : [],
    usageCount: 0,
    enabled: payload.enabled === false ? false : true,
    createdDate: nowIso(),
  };

  db.coupons.push(coupon);
  saveDb(db);
  return coupon;
}

function updateCoupon(couponCode, patch = {}) {
  const db = loadDb();
  const code = normalizeCouponCode(couponCode);
  const coupon = db.coupons.find(c => normalizeCouponCode(c.couponCode) === code);
  if (!coupon) throw new Error('Coupon not found');

  if (patch.discountValue != null) coupon.discountValue = safeNumber(patch.discountValue, 0);
  if (patch.discountType != null) coupon.discountType = patch.discountType === 'fixed' ? 'fixed' : 'percentage';
  if (patch.expiryDate !== undefined) coupon.expiryDate = patch.expiryDate ? new Date(patch.expiryDate).toISOString() : null;
  if (patch.minimumCartValue != null) coupon.minimumCartValue = safeNumber(patch.minimumCartValue, 0);
  if (patch.maximumDiscount !== undefined) coupon.maximumDiscount = patch.maximumDiscount == null ? null : safeNumber(patch.maximumDiscount, 0);
  if (patch.maximumUses !== undefined) coupon.maximumUses = patch.maximumUses == null ? null : Math.max(0, parseInt(patch.maximumUses, 10) || 0);
  if (patch.applicableProducts !== undefined) coupon.applicableProducts = Array.isArray(patch.applicableProducts) ? patch.applicableProducts : [];
  if (patch.influencerId !== undefined) coupon.influencerId = String(patch.influencerId || '').trim() || null;
  if (patch.influencerName !== undefined) coupon.influencerName = String(patch.influencerName || '').trim() || null;

  saveDb(db);
  return coupon;
}

function toggleCoupon(couponCode, enabled) {
  const db = loadDb();
  const code = normalizeCouponCode(couponCode);
  const coupon = db.coupons.find(c => normalizeCouponCode(c.couponCode) === code);
  if (!coupon) throw new Error('Coupon not found');
  coupon.enabled = enabled === false ? false : true;
  saveDb(db);
  return coupon;
}

function listCoupons(filters = {}) {
  const db = loadDb();
  let out = [...db.coupons];
  if (filters.status === 'active') out = out.filter(c => c.enabled);
  if (filters.status === 'inactive') out = out.filter(c => !c.enabled);
  return out.sort((a, b) => String(a.couponCode).localeCompare(String(b.couponCode)));
}

// Resolve the influencer (and commission) attached to a coupon, purely server-side.
function resolveInfluencerForCoupon(couponCode) {
  const db = loadDb();
  const code = normalizeCouponCode(couponCode);
  const coupon = db.coupons.find(c => normalizeCouponCode(c.couponCode) === code);
  if (!coupon) return { coupon: null, influencer: null };
  const influencer = coupon.influencerId
    ? db.influencers.find(i => i.influencerId === coupon.influencerId) || null
    : db.influencers.find(i => normalizeCouponCode(i.couponCode) === code) || null;
  return { coupon, influencer };
}

function validateCoupon({ couponCode, cartValue, productKey }) {
  const db = loadDb();
  const code = normalizeCouponCode(couponCode);
  const cart = safeNumber(cartValue, 0);

  const coupon = db.coupons.find(c => normalizeCouponCode(c.couponCode) === code);
  if (!coupon) return { valid: false, message: 'Invalid coupon' };
  if (!coupon.enabled) return { valid: false, message: 'Coupon disabled' };
  if (coupon.expiryDate && new Date(coupon.expiryDate).getTime() < Date.now()) return { valid: false, message: 'Coupon expired' };
  if (coupon.maximumUses != null && coupon.usageCount >= coupon.maximumUses) return { valid: false, message: 'Coupon usage limit reached' };
  if (cart < safeNumber(coupon.minimumCartValue, 0)) return { valid: false, message: `Minimum cart value is ₹${coupon.minimumCartValue}` };
  if (coupon.applicableProducts.length > 0 && productKey && !coupon.applicableProducts.includes(productKey)) {
    return { valid: false, message: 'Coupon not applicable for this product' };
  }

  let discount = 0;
  if (coupon.discountType === 'fixed') discount = safeNumber(coupon.discountValue, 0);
  else discount = Math.round((cart * safeNumber(coupon.discountValue, 0)) / 100);

  if (coupon.maximumDiscount != null) {
    discount = Math.min(discount, safeNumber(coupon.maximumDiscount, discount));
  }

  discount = Math.max(0, Math.min(discount, cart));
  const finalAmount = Math.max(0, cart - discount);

  return {
    valid: true,
    message: 'Coupon applied successfully',
    coupon,
    discount,
    finalAmount,
    savings: discount,
  };
}

function recordReferralClick({ couponCode, visitorId }) {
  const db = loadDb();
  const event = {
    referralId: id('ref'),
    couponCode: normalizeCouponCode(couponCode),
    visitorId: String(visitorId || '').trim() || null,
    timestamp: nowIso(),
  };
  db.referrals.push(event);
  saveDb(db);
  return event;
}

function recordInfluencerOrder(payload = {}) {
  const db = loadDb();
  const orderId = String(payload.orderId || id('ord'));

  // Prevent duplicate usage: if this order was already recorded, do NOT push a
  // new row, re-increment usage counts, or double-credit the influencer.
  const existing = db.orders.find(o => o.orderId === orderId);
  if (existing) return existing;

  const couponUsed = normalizeCouponCode(payload.couponUsed);
  const inf = influencerForOrder(db, couponUsed, payload.influencerId);

  const finalPaidAmount = safeNumber(payload.finalPaidAmount, 0);
  // Commission is ALWAYS recomputed server-side from the trusted influencer
  // record — never from the frontend/request. If no influencer, commission is 0.
  const commissionPercent = inf ? safeNumber(inf.commissionPercent, 0) : 0;
  const commissionAmount = Math.round((finalPaidAmount * commissionPercent) / 100);

  const order = {
    orderId,
    couponUsed,
    influencerId: inf ? inf.influencerId : (payload.influencerId || null),
    influencerName: inf ? inf.influencerName : (payload.influencerName || null),
    commissionPercent,
    commissionAmount,
    discountGiven: safeNumber(payload.discountGiven, 0),
    originalPrice: safeNumber(payload.originalPrice, 0),
    finalPaidAmount,
    paymentMethod: String(payload.paymentMethod || ''),
    paymentStatus: String(payload.paymentStatus || ''),
    orderStatus: String(payload.orderStatus || 'Order Received'),
    timestamp: nowIso(),
    customerName: String(payload.customerName || ''),
    phone: String(payload.phone || ''),
    email: String(payload.email || '').toLowerCase(),
    city: String(payload.city || ''),
    state: String(payload.state || ''),
    address: String(payload.address || '').trim(),
    purchasedProducts: Array.isArray(payload.purchasedProducts) ? payload.purchasedProducts : [],
    quantity: safeNumber(payload.quantity, 1),
    commissionPaid: false,
    paidDate: null,
    transactionId: null,
    payoutNotes: null,
  };

  db.orders.push(order);

  if (couponUsed) {
    const coupon = db.coupons.find(c => normalizeCouponCode(c.couponCode) === couponUsed);
    if (coupon) {
      coupon.usageCount += 1;
      if (coupon.maximumUses != null && coupon.usageCount >= coupon.maximumUses) {
        db.notifications.push({
          id: id('ntf'),
          type: 'coupon_limit_reached',
          message: `Coupon ${coupon.couponCode} usage limit reached`,
          createdAt: nowIso(),
        });
      }
    }

    if (inf) {
      inf.totalOrders += 1;
      inf.totalRevenue += finalPaidAmount;
      inf.totalCommission += commissionAmount;
      inf.lastOrderDate = nowIso();

      if (inf.totalRevenue >= 10000) {
        db.notifications.push({
          id: id('ntf'),
          type: 'influencer_revenue_milestone',
          message: `${inf.influencerName} reached ₹10,000 revenue`,
          createdAt: nowIso(),
        });
      }
      if (inf.totalOrders >= 50) {
        db.notifications.push({
          id: id('ntf'),
          type: 'influencer_orders_milestone',
          message: `${inf.influencerName} reached 50 orders`,
          createdAt: nowIso(),
        });
      }
    }

    db.notifications.push({
      id: id('ntf'),
      type: 'coupon_used',
      message: `Coupon ${couponUsed} used in order ${orderId}`,
      createdAt: nowIso(),
    });
  }

  saveDb(db);
  return order;
}

function influencerForOrder(db, couponUsed, influencerId) {
  if (influencerId) {
    const byId = db.influencers.find(i => i.influencerId === influencerId);
    if (byId) return byId;
  }
  if (couponUsed) {
    const byCode = db.influencers.find(i => normalizeCouponCode(i.couponCode) === couponUsed);
    if (byCode) return byCode;
  }
  return null;
}


function markCommissionPaid({ orderId, transactionId, notes }) {
  const db = loadDb();
  const order = db.orders.find(o => o.orderId === orderId);
  if (!order) throw new Error('Order not found');
  order.commissionPaid = true;
  order.paidDate = nowIso();
  order.transactionId = String(transactionId || '').trim() || null;
  order.payoutNotes = String(notes || '').trim() || null;
  saveDb(db);
  return order;
}

const ORDER_STATUSES = new Set(['Pending', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled']);

// Update an order's status in the authoritative DB. Keeps a timestamped history.
// Cancellation/refund (which reverse coupon usage & commission) is intentionally
// left to voidInfluencerOrder() so this stays a pure status-change helper.
function updateOrderStatus(orderId, newStatus, { note } = {}) {
  const db = loadDb();
  const order = db.orders.find(o => o.orderId === String(orderId || '').trim());
  if (!order) throw new Error('Order not found');
  const status = String(newStatus || '').trim();
  if (!ORDER_STATUSES.has(status)) {
    throw new Error('Invalid order status. Allowed: ' + Array.from(ORDER_STATUSES).join(', '));
  }
  order.statusUpdatedAt = nowIso();
  if (!Array.isArray(order.statusHistory)) order.statusHistory = [];
  order.statusHistory.push({
    status,
    timestamp: order.statusUpdatedAt,
    note: note ? String(note).trim() : null,
  });
  order.orderStatus = status;
  saveDb(db);
  return order;
}

function getAnalytics() {
  const db = loadDb();
  const influencers = db.influencers;
  const coupons = db.coupons;
  const orders = db.orders;

  const totalRevenue = orders.reduce((s, o) => s + safeNumber(o.finalPaidAmount, 0), 0);
  const totalDiscountGiven = orders.reduce((s, o) => s + safeNumber(o.discountGiven, 0), 0);
  const totalCommissionPayable = orders.filter(o => !o.commissionPaid).reduce((s, o) => s + safeNumber(o.commissionAmount, 0), 0);

  const topInfluencer = [...influencers].sort((a, b) => safeNumber(b.totalRevenue, 0) - safeNumber(a.totalRevenue, 0))[0] || null;

  const couponMap = {};
  for (const o of orders) {
    if (!o.couponUsed) continue;
    couponMap[o.couponUsed] = (couponMap[o.couponUsed] || 0) + 1;
  }
  const topCoupon = Object.entries(couponMap).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  const aov = orders.length ? totalRevenue / orders.length : 0;
  const conversionRate = db.referrals.length ? (orders.length / db.referrals.length) * 100 : 0;

  return {
    cards: {
      totalInfluencers: influencers.length,
      activeCoupons: coupons.filter(c => c.enabled).length,
      ordersViaInfluencers: orders.length,
      totalRevenue,
      totalDiscountGiven,
      totalCommissionPayable,
      averageOrderValue: aov,
      conversionRate,
      topInfluencer: topInfluencer ? topInfluencer.influencerName : null,
      topCoupon,
    },
    influencers,
    coupons,
    orders,
    notifications: db.notifications.slice(-50).reverse(),
  };
}

const VOID_STATUSES = new Set(['Cancelled', 'Refunded']);

// Handle cancelled / refunded orders: reverse coupon usage + influencer credit
// so a coupon only "counts" toward successful (non-void) orders.
function voidInfluencerOrder(orderId, status = 'Cancelled') {
  const db = loadDb();
  const order = db.orders.find(o => o.orderId === orderId);
  if (!order) throw new Error('Order not found');
  if (VOID_STATUSES.has(order.orderStatus)) return order; // already void

  order.orderStatus = status;
  order.voidedAt = nowIso();

  if (order.couponUsed) {
    const coupon = db.coupons.find(c => normalizeCouponCode(c.couponCode) === order.couponUsed);
    if (coupon) coupon.usageCount = Math.max(0, safeNumber(coupon.usageCount, 0) - 1);

    const inf = db.influencers.find(i => i.influencerId === order.influencerId);
    if (inf) {
      inf.totalOrders = Math.max(0, safeNumber(inf.totalOrders, 0) - 1);
      inf.totalRevenue = Math.max(0, safeNumber(inf.totalRevenue, 0) - safeNumber(order.finalPaidAmount, 0));
      inf.totalCommission = Math.max(0, safeNumber(inf.totalCommission, 0) - safeNumber(order.commissionAmount, 0));
    }
  }

  saveDb(db);
  return order;
}

function isoOrNow(v) {
  try {
    const d = new Date(v);
    return isNaN(d.getTime()) ? nowIso() : d.toISOString();
  } catch {
    return nowIso();
  }
}

// Merge orders discovered in an external source (the Google Sheets mirror) into
// the local DB. Rows missing locally are added; rows whose incoming timestamp is
// NEWER than the local copy are refreshed (status, payment, totals, customer
// fields) — this is what keeps every serverless instance / device consistent
// after a cold start. Rows whose local copy is newer (a fresh admin status change
// not yet mirrored to Sheets) are NEVER overwritten, so local edits always win.
// Returns { added, updated }. This is what lets the admin dashboard show orders
// after a serverless cold start, where the /tmp JSON DB has been wiped.
function upsertOrdersBulk(records = []) {
  if (!Array.isArray(records) || !records.length) return { added: 0, updated: 0 };
  const db = loadDb();
  const byId = new Map(db.orders.map(o => [o.orderId, o]));
  let added = 0, updated = 0;
  for (const rec of records) {
    const orderId = String((rec && rec.orderId) || '').trim();
    if (!orderId) continue;
    const incomingStamp = isoOrNow(rec.timestamp);
    const existing = byId.get(orderId);
    if (!existing) {
      const status = String(rec.orderStatus || '').trim() || 'Pending';
      const stamp = incomingStamp;
      const created = {
        orderId,
        couponUsed: normalizeCouponCode(rec.couponUsed),
        influencerId: rec.influencerId || null,
        influencerName: rec.influencerName || null,
        commissionPercent: safeNumber(rec.commissionPercent, 0),
        commissionAmount: safeNumber(rec.commissionAmount, 0),
        discountGiven: safeNumber(rec.discountGiven, 0),
        originalPrice: safeNumber(rec.originalPrice, 0),
        finalPaidAmount: safeNumber(rec.finalPaidAmount, 0),
        paymentMethod: String(rec.paymentMethod || ''),
        paymentStatus: String(rec.paymentStatus || ''),
        orderStatus: status,
        timestamp: stamp,
        customerName: String(rec.customerName || ''),
        phone: String(rec.phone || ''),
        email: String(rec.email || '').toLowerCase(),
        city: String(rec.city || ''),
        state: String(rec.state || ''),
        address: String(rec.address || '').trim(),
        purchasedProducts: Array.isArray(rec.purchasedProducts) ? rec.purchasedProducts : [],
        quantity: safeNumber(rec.quantity, 1),
        commissionPaid: false,
        paidDate: null,
        transactionId: null,
        payoutNotes: null,
        // Seed history so the dashboard's timeline is never empty.
        statusHistory: [{ status, timestamp: stamp, note: 'Imported from Sheets mirror' }],
        importedFromSheets: true,
      };
      db.orders.push(created);
      byId.set(orderId, created);
      added++;
      continue;
    }
    // Existing record: only refresh when Sheets is strictly newer. This guards
    // the reverse race (admin just changed status locally; the mirror lags).
    let incomingTime = NaN, localTime = NaN;
    try { incomingTime = new Date(incomingStamp).getTime(); } catch { /* keep NaN */ }
    try { localTime = new Date(existing.timestamp).getTime(); } catch { /* keep NaN */ }
    const incomingStatus = String(rec.orderStatus || '').trim();
    const sameStatus = !incomingStatus || incomingStatus === existing.orderStatus;
    const sheetsIsNewer = Number.isFinite(incomingTime) && Number.isFinite(localTime)
      ? incomingTime > localTime
      : false;
    if (!sheetsIsNewer || sameStatus) continue;
    existing.orderStatus = incomingStatus;
    existing.timestamp = incomingStamp;
    if (rec.paymentStatus) existing.paymentStatus = String(rec.paymentStatus);
    if (rec.paymentMethod) existing.paymentMethod = String(rec.paymentMethod);
    if (Number.isFinite(Number(rec.finalPaidAmount)) && Number(rec.finalPaidAmount) > 0) {
      existing.finalPaidAmount = Number(rec.finalPaidAmount);
    }
    if (Number.isFinite(Number(rec.discountGiven))) existing.discountGiven = Number(rec.discountGiven);
    if (rec.customerName) existing.customerName = String(rec.customerName);
    if (rec.phone) existing.phone = String(rec.phone);
    if (rec.email) existing.email = String(rec.email).toLowerCase();
    if (rec.address) existing.address = String(rec.address).trim();
    if (Array.isArray(rec.purchasedProducts) && rec.purchasedProducts.length) {
      existing.purchasedProducts = rec.purchasedProducts;
    }
    if (!Array.isArray(existing.statusHistory)) existing.statusHistory = [];
    existing.statusHistory.push({ status: incomingStatus, timestamp: incomingStamp, note: 'Synced from Sheets mirror' });
    existing.statusUpdatedAt = incomingStamp;
    updated++;
  }
  if (added || updated) saveDb(db);
  return { added, updated };
}

// Backwards-compatible numeric form (older callers treat the return as a count).
function upsertOrdersBulkCount(records = []) {
  const r = upsertOrdersBulk(records);
  return (r && typeof r === 'object') ? (r.added + r.updated) : 0;
}

function listOrders(filters = {}) {
  const db = loadDb();
  let out = [...db.orders];

  if (filters.influencerId) out = out.filter(o => o.influencerId === filters.influencerId);
  if (filters.couponCode) out = out.filter(o => normalizeCouponCode(o.couponUsed) === normalizeCouponCode(filters.couponCode));
  if (filters.customer) {
    const q = String(filters.customer).trim().toLowerCase();
    out = out.filter(o => (o.customerName || '').toLowerCase().includes(q) || (o.email || '').includes(q) || (o.phone || '').includes(q) || (o.orderId || '').toLowerCase().includes(q));
  }
  if (filters.orderId) out = out.filter(o => (o.orderId || '').toLowerCase().includes(String(filters.orderId).toLowerCase()));
  if (filters.paymentMethod) out = out.filter(o => o.paymentMethod === filters.paymentMethod);
  if (filters.orderStatus) out = out.filter(o => o.orderStatus === filters.orderStatus);
  if (filters.from) out = out.filter(o => new Date(o.timestamp) >= new Date(filters.from));
  if (filters.to) {
    const to = new Date(filters.to);
    to.setHours(23, 59, 59, 999);
    out = out.filter(o => new Date(o.timestamp) <= to);
  }
  if (filters.city) out = out.filter(o => (o.city || '').toLowerCase() === String(filters.city).toLowerCase());
  if (filters.state) out = out.filter(o => (o.state || '').toLowerCase() === String(filters.state).toLowerCase());

  return out.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

// Coupon usage records + dashboard aggregates, with server-side filters.
function getUsageRecords(filters = {}) {
  const orders = listOrders(filters);
  const nonVoid = orders.filter(o => !VOID_STATUSES.has(o.orderStatus));
  const totals = {
    totalOrders: nonVoid.length,
    totalUsage: nonVoid.length,
    sales: nonVoid.reduce((s, o) => s + safeNumber(o.finalPaidAmount, 0), 0),
    discount: nonVoid.reduce((s, o) => s + safeNumber(o.discountGiven, 0), 0),
    commission: nonVoid.reduce((s, o) => s + safeNumber(o.commissionAmount, 0), 0),
  };
  return { records: orders, totals };
}


function getInfluencerDashboard(influencerId) {
  const db = loadDb();
  const inf = db.influencers.find(i => i.influencerId === influencerId);
  if (!inf) throw new Error('Influencer not found');

  const orders = db.orders
    .filter(o => o.influencerId === influencerId)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const nonVoid = orders.filter(o => !VOID_STATUSES.has(o.orderStatus));

  const earnings = {
    pending: nonVoid.filter(o => !o.commissionPaid).reduce((s, o) => s + safeNumber(o.commissionAmount, 0), 0),
    approved: nonVoid.filter(o => o.commissionPaid).reduce((s, o) => s + safeNumber(o.commissionAmount, 0), 0),
    paid: orders.filter(o => o.commissionPaid).reduce((s, o) => s + safeNumber(o.commissionAmount, 0), 0),
  };

  const coupon = db.coupons.find(c => normalizeCouponCode(c.couponCode) === normalizeCouponCode(inf.couponCode)) || null;

  return {
    influencer: { ...inf, accessToken: undefined },
    couponUsed: nonVoid.length,
    orders: nonVoid.length,
    sales: nonVoid.reduce((s, o) => s + safeNumber(o.finalPaidAmount, 0), 0),
    discounted: nonVoid.reduce((s, o) => s + safeNumber(o.discountGiven, 0), 0),
    commissionRate: safeNumber(inf.commissionPercent, 0),
    commission: nonVoid.reduce((s, o) => s + safeNumber(o.commissionAmount, 0), 0),
    earnings,
    couponStatus: coupon
      ? { enabled: coupon.enabled, usageCount: safeNumber(coupon.usageCount, 0), maximumUses: coupon.maximumUses, expiryDate: coupon.expiryDate }
      : null,
    orderList: orders.slice(0, 100),
  };
}

// The full DB root (used by admin to inspect influencers/coupons/usage).
function getDbView() {
  const db = loadDb();
  return {
    influencers: db.influencers.map(i => ({ ...i })),
    coupons: db.coupons,
    orders: db.orders,
    referrals: db.referrals,
    notifications: (db.notifications || []).slice(-50).reverse(),
    sync: syncQueueStats(),
    meta: db.meta,
  };
}

// =============================================================
//  Google Sheets outbox: DB is the source of truth; Sheets is a
//  mirror. Sync is async + retried; failures never block orders.
// =============================================================
function ensureSyncArray(db) {
  if (!Array.isArray(db.pendingSync)) db.pendingSync = [];
}

function enqueueSync(payload) {
  if (!payload || !payload.orderId) return null;
  const db = loadDb();
  ensureSyncArray(db);
  if (db.pendingSync.some(e => e.orderId === payload.orderId)) return db.pendingSync.find(e => e.orderId === payload.orderId);
  const entry = {
    syncId: id('sync'),
    orderId: payload.orderId,
    payload,
    attempts: 0,
    maxAttempts: 10,
    status: 'pending',
    lastAttempt: null,
    nextRetry: nowIso(),
    createdAt: nowIso(),
    error: null,
  };
  db.pendingSync.push(entry);
  saveDb(db);
  return entry;
}

function pendingSyncEntries() {
  const db = loadDb();
  ensureSyncArray(db);
  return db.pendingSync
    .filter(e => e.status === 'pending' && (!e.nextRetry || new Date(e.nextRetry) <= new Date()))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

function markSyncAttempt(syncId, { success, error }) {
  const db = loadDb();
  ensureSyncArray(db);
  const entry = db.pendingSync.find(e => e.syncId === syncId);
  if (!entry) return;
  entry.attempts += 1;
  entry.lastAttempt = nowIso();
  if (success) {
    entry.status = 'success';
    entry.error = null;
  } else {
    entry.error = error || 'Sync failed';
    entry.nextRetry = new Date(Date.now() + Math.min(6 * 60 * 60 * 1000, 60 * 1000 * Math.pow(2, entry.attempts))).toISOString();
    if (entry.attempts >= entry.maxAttempts) entry.status = 'failed';
  }
  saveDb(db);
}

function pendingSyncList(limit = 100) {
  const db = loadDb();
  ensureSyncArray(db);
  return db.pendingSync.slice().reverse().slice(0, limit);
}

function syncQueueStats() {
  const db = loadDb();
  ensureSyncArray(db);
  return {
    total: db.pendingSync.length,
    pending: db.pendingSync.filter(e => e.status === 'pending').length,
    success: db.pendingSync.filter(e => e.status === 'success').length,
    failed: db.pendingSync.filter(e => e.status === 'failed').length,
  };
}


module.exports = {
  loadDb,
  createInfluencer,
  listInfluencers,
  updateInfluencer,
  getInfluencerByToken,
  createCoupon,
  updateCoupon,
  toggleCoupon,
  listCoupons,
  resolveInfluencerForCoupon,
  validateCoupon,
  recordReferralClick,
  recordInfluencerOrder,
  upsertOrdersBulk,
  voidInfluencerOrder,
  markCommissionPaid,
  updateOrderStatus,
  getAnalytics,
  getInfluencerDashboard,
  getDbView,
  getUsageRecords,
  listOrders,
  enqueueSync,
  pendingSyncEntries,
  pendingSyncList,
  markSyncAttempt,
  syncQueueStats,
  normalizeCouponCode,
};
