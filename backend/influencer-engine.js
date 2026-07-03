'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, '..', 'influencers-data.json');

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

function nowIso() {
  return new Date().toISOString();
}

function safeNumber(n, fallback = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

function ensureDbFile() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_DB, null, 2), 'utf8');
    return;
  }
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    const parsed = raw ? JSON.parse(raw) : {};
    const merged = {
      ...DEFAULT_DB,
      ...parsed,
      influencers: Array.isArray(parsed.influencers) ? parsed.influencers : [],
      coupons: Array.isArray(parsed.coupons) ? parsed.coupons : [],
      referrals: Array.isArray(parsed.referrals) ? parsed.referrals : [],
      orders: Array.isArray(parsed.orders) ? parsed.orders : [],
      commissions: Array.isArray(parsed.commissions) ? parsed.commissions : [],
      notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
      meta: {
        ...DEFAULT_DB.meta,
        ...(parsed.meta || {}),
      },
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(merged, null, 2), 'utf8');
  } catch {
    fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_DB, null, 2), 'utf8');
  }
}

function loadDb() {
  ensureDbFile();
  const raw = fs.readFileSync(DB_PATH, 'utf8');
  return JSON.parse(raw);
}

function saveDb(db) {
  db.meta = db.meta || {};
  db.meta.updatedAt = nowIso();
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
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

function createCoupon(payload = {}) {
  const db = loadDb();
  const couponCode = normalizeCouponCode(payload.couponCode);
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
  const order = {
    orderId: String(payload.orderId || id('ord')),
    couponUsed: normalizeCouponCode(payload.couponUsed),
    influencerId: payload.influencerId || null,
    influencerName: payload.influencerName || null,
    commissionPercent: safeNumber(payload.commissionPercent, 0),
    commissionAmount: safeNumber(payload.commissionAmount, 0),
    discountGiven: safeNumber(payload.discountGiven, 0),
    originalPrice: safeNumber(payload.originalPrice, 0),
    finalPaidAmount: safeNumber(payload.finalPaidAmount, 0),
    paymentMethod: String(payload.paymentMethod || ''),
    orderStatus: String(payload.orderStatus || 'Order Received'),
    timestamp: nowIso(),
    customerName: String(payload.customerName || ''),
    phone: String(payload.phone || ''),
    email: String(payload.email || ''),
    city: String(payload.city || ''),
    state: String(payload.state || ''),
    purchasedProducts: Array.isArray(payload.purchasedProducts) ? payload.purchasedProducts : [],
    quantity: safeNumber(payload.quantity, 1),
    commissionPaid: false,
    paidDate: null,
    transactionId: null,
    payoutNotes: null,
  };

  db.orders.push(order);

  if (order.couponUsed) {
    const coupon = db.coupons.find(c => normalizeCouponCode(c.couponCode) === order.couponUsed);
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

    const inf = db.influencers.find(i => normalizeCouponCode(i.couponCode) === order.couponUsed || i.influencerId === order.influencerId);
    if (inf) {
      inf.totalOrders += 1;
      inf.totalRevenue += order.finalPaidAmount;
      inf.totalCommission += order.commissionAmount;
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
      message: `Coupon ${order.couponUsed} used in order ${order.orderId}`,
      createdAt: nowIso(),
    });
  }

  saveDb(db);
  return order;
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

function listOrders(filters = {}) {
  const db = loadDb();
  let out = [...db.orders];

  if (filters.influencerId) out = out.filter(o => o.influencerId === filters.influencerId);
  if (filters.couponCode) out = out.filter(o => normalizeCouponCode(o.couponUsed) === normalizeCouponCode(filters.couponCode));
  if (filters.paymentMethod) out = out.filter(o => o.paymentMethod === filters.paymentMethod);
  if (filters.orderStatus) out = out.filter(o => o.orderStatus === filters.orderStatus);
  if (filters.city) out = out.filter(o => (o.city || '').toLowerCase() === String(filters.city).toLowerCase());
  if (filters.state) out = out.filter(o => (o.state || '').toLowerCase() === String(filters.state).toLowerCase());

  return out.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

module.exports = {
  loadDb,
  createInfluencer,
  createCoupon,
  validateCoupon,
  recordReferralClick,
  recordInfluencerOrder,
  markCommissionPaid,
  getAnalytics,
  listOrders,
  normalizeCouponCode,
};
