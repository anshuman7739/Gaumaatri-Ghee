// ============================================================
//  GAUMAATRI GHEE — Google Apps Script Backend
//  Paste this entire file into Google Apps Script editor
//  https://script.google.com
// ============================================================

// ── STEP 1: Set your secret token ──────────────────────────
// Run setSecretToken() ONCE from the script editor, then delete it.
// This stores the token in a secure server-side property.
function setSecretToken() {
  PropertiesService.getScriptProperties().setProperty('SECRET_TOKEN', 'GAUMAATRI_SECRET_2026');
  Logger.log('Token set successfully');
}

// ── STEP 2: Set admin email ─────────────────────────────────
// Run setAdminEmail() ONCE, then delete it.
function setAdminEmail() {
  PropertiesService.getScriptProperties().setProperty('ADMIN_EMAIL', 'gaumaatri@gmail.com');
  Logger.log('Admin email set');
}

// ── CONFIG (edit Sheet name if needed) ──────────────────────
const SHEET_NAME = 'Orders';
const HEADERS = [
  'Order ID', 'Timestamp', 'Name', 'Email', 'Phone',
  'Address', 'Product', 'Quantity', 'Total (₹)',
  'Coupon Code', 'Coupon Discount (₹)', 'Influencer/User',
  'Payment Method', 'Payment Status', 'Order Status', 'Notes'
];

// ── CONFIG: durable coupon + influencer catalogs ────────────
// The website backend runs on Vercel, which has a read-only/ephemeral disk.
// Coupons and influencers are therefore persisted here so they survive
// cold starts and redeploys.
const COUPON_SHEET_NAME     = 'Coupons';
const INFLUENCER_SHEET_NAME = 'Influencers';

// Headers mirror the engine's record shape exactly, so a Sheet row IS a
// coupon/influencer record (no field-name translation needed on hydration).
const COUPON_HEADERS = [
  'couponId', 'couponCode', 'influencerId', 'influencerName',
  'discountType', 'discountValue', 'expiryDate', 'maximumUses',
  'minimumCartValue', 'maximumDiscount', 'applicableProducts',
  'usageCount', 'enabled', 'createdDate'
];

const INFLUENCER_HEADERS = [
  'influencerId', 'influencerName', 'instagramUsername', 'couponCode',
  'couponDiscountPercent', 'commissionPercent', 'phone', 'email',
  'accessToken', 'status', 'totalOrders', 'totalRevenue', 'totalCommission',
  'lastOrderDate', 'notes', 'profilePicture', 'createdDate'
];

// Fields that need JSON <-> array conversion, and true/false conversion.
const CATALOG_ARRAY_FIELDS  = ['applicableProducts'];
const CATALOG_BOOL_FIELDS   = ['enabled'];
const CATALOG_NUMBER_FIELDS = [
  'discountValue', 'maximumUses', 'minimumCartValue', 'maximumDiscount', 'usageCount',
  'couponDiscountPercent', 'commissionPercent', 'totalOrders', 'totalRevenue', 'totalCommission',
];

// ============================================================
//  CORS HELPER — required for browser fetch() calls
// ============================================================
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function doOptions() {
  return ContentService.createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT)
    .setHeaders(corsHeaders());
}

// ============================================================
//  MAIN HANDLER — POST requests
// ============================================================
function doPost(e) {
  try {
    const data   = JSON.parse(e.postData.contents);
    const action = data.action;

    // ── Token Validation ──────────────────────────────────
    const storedToken = PropertiesService.getScriptProperties().getProperty('SECRET_TOKEN');
    if (!storedToken || data.token !== storedToken) {
      return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
    }

    // ── Route Actions ─────────────────────────────────────
    if (action === 'submitOrder')    return handleSubmitOrder(data);
    if (action === 'updatePayment')  return handleUpdatePayment(data);
    if (action === 'updateStatus')   return handleUpdateStatus(data);

    // Durable coupon / influencer catalogs (Vercel has no writable disk).
    if (action === 'getCoupons')      return handleGetCoupons();
    if (action === 'upsertCoupon')    return handleUpsertCoupon(data);
    if (action === 'getInfluencers')  return handleGetInfluencers();
    if (action === 'upsertInfluencer')return handleUpsertInfluencer(data);

    return jsonResponse({ success: false, error: 'Unknown action' }, 400);

  } catch (err) {
    Logger.log('doPost Error: ' + err.message);
    return jsonResponse({ success: false, error: 'Server error: ' + err.message }, 500);
  }
}

// ============================================================
//  MAIN HANDLER — GET requests (for order tracking)
// ============================================================
function doGet(e) {
  try {
    const action  = e.parameter.action;
    const token   = e.parameter.token;
    const orderId = e.parameter.orderId;

    // Token validation
    const storedToken = PropertiesService.getScriptProperties().getProperty('SECRET_TOKEN');
    if (!storedToken || token !== storedToken) {
      return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
    }

    if (action === 'trackOrder' && orderId) return handleTrackOrder(orderId);
    if (action === 'getOrders') return handleGetOrders();
    if (action === 'getCoupons') return handleGetCoupons();
    if (action === 'getInfluencers') return handleGetInfluencers();

    return jsonResponse({ success: false, error: 'Unknown action' }, 400);

  } catch (err) {
    Logger.log('doGet Error: ' + err.message);
    return jsonResponse({ success: false, error: 'Server error' }, 500);
  }
}

// ============================================================
//  ACTION: Submit new order
// ============================================================
function handleSubmitOrder(data) {
  // Apps Script runs concurrent executions: without a lock, two simultaneous
  // submits of the same Order ID both passed the duplicate check below and
  // the row got appended twice. Serialize the whole check-then-append.
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return jsonResponse({ success: false, error: 'Server busy — please retry in a moment' }, 503);
  }
  try {
    return handleSubmitOrderLocked(data);
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function handleSubmitOrderLocked(data) {
  // ── Field Validation ──────────────────────────────────────
  const required = ['orderId','name','email','phone','address','product','quantity','total','paymentMethod'];
  for (const field of required) {
    // NOTE: must not use a falsy check here — a 100%-off coupon legitimately
    // produces total = 0, and `!0` is true, which used to reject valid orders
    // with "Missing field: total".
    const v = data[field];
    if (v === undefined || v === null || String(v).trim() === '') {
      return jsonResponse({ success: false, error: 'Missing field: ' + field }, 400);
    }
  }

  // ── Basic Format Checks ───────────────────────────────────
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return jsonResponse({ success: false, error: 'Invalid email' }, 400);
  }
  if (!/^[6-9]\d{9}$/.test(data.phone)) {
    return jsonResponse({ success: false, error: 'Invalid phone' }, 400);
  }
  if (data.quantity < 1 || data.quantity > 10) {
    return jsonResponse({ success: false, error: 'Quantity out of range' }, 400);
  }

  // ── Duplicate Check (same Order ID) ──────────────────────
  const sheet = getOrCreateSheet();
  const existing = findRowByOrderId(sheet, data.orderId);
  if (existing > 0) {
    return jsonResponse({ success: false, error: 'Order ID already exists' }, 409);
  }

  // ── Write to Sheet ────────────────────────────────────────
  const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const paymentStatus = data.paymentStatus
    ? String(data.paymentStatus)
    : (String(data.paymentMethod || '').toUpperCase() === 'UPI' ? 'Paid' : (String(data.paymentMethod || '').toUpperCase() === 'COD' ? 'COD – Pay on Delivery' : 'Pending'));
  const orderStatus = data.orderStatus ? String(data.orderStatus) : 'Order Received';
  const row = [
    data.orderId,
    timestamp,
    data.name,
    data.email,
    data.phone,
    data.address,
    data.product,
    data.quantity,
    data.total,
    data.couponCode || '',
    Number(data.couponDiscount || 0),
    data.influencerName || 'No Coupon',
    data.paymentMethod,
    paymentStatus,      // Payment Status
    orderStatus,        // Order Status
    ''                  // Notes
  ];
  sheet.appendRow(row);

  // ── Auto-format new row ───────────────────────────────────
  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow, 1, 1, HEADERS.length)
       .setBorder(true, true, true, true, true, true);

  // ── Send Emails ───────────────────────────────────────────
  try { sendCustomerEmail(data, orderStatus); }     catch(e) { Logger.log('Customer email failed: ' + e); }
  try { sendAdminEmail(data, orderStatus); }         catch(e) { Logger.log('Admin email failed: ' + e); }

  Logger.log('Order saved: ' + data.orderId);
  return jsonResponse({
    success: true,
    orderId: data.orderId,
    message: 'Order saved successfully'
  });
}

// ============================================================
//  ACTION: Update payment status (after "I HAVE PAID")
// ============================================================
function handleUpdatePayment(data) {
  if (!data.orderId) return jsonResponse({ success: false, error: 'Missing orderId' }, 400);

  const sheet = getOrCreateSheet();
  const row   = findRowByOrderId(sheet, data.orderId);
  if (!row) return jsonResponse({ success: false, error: 'Order not found' }, 404);

  // Column 14 = Payment Status
  sheet.getRange(row, 14).setValue('Payment Submitted – Verification Pending');
  // Column 16 = Notes
  sheet.getRange(row, 16).setValue('Payment proof uploaded by customer at ' + new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }));

  // Notify admin of payment submission
  try {
    const orderData = getOrderDataFromRow(sheet, row);
    sendAdminPaymentAlert(orderData);
  } catch(e) { Logger.log('Payment alert email failed: ' + e); }

  return jsonResponse({ success: true, message: 'Payment status updated' });
}

// ============================================================
//  ACTION: Update order status (admin use)
// ============================================================
function handleUpdateStatus(data) {
  if (!data.orderId || !data.status) {
    return jsonResponse({ success: false, error: 'Missing orderId or status' }, 400);
  }

  const sheet = getOrCreateSheet();
  const row   = findRowByOrderId(sheet, data.orderId);
  if (!row) return jsonResponse({ success: false, error: 'Order not found' }, 404);

  sheet.getRange(row, 15).setValue(data.status); // Column 15 = Order Status
  return jsonResponse({ success: true, message: 'Order status updated to: ' + data.status });
}

// ============================================================
//  ACTION: Track order by Order ID
// ============================================================
function handleTrackOrder(orderId) {
  const sheet = getOrCreateSheet();
  const row   = findRowByOrderId(sheet, orderId.toUpperCase());

  if (!row) {
    return jsonResponse({ success: false, error: 'Order not found. Please check your Order ID.' }, 404);
  }

  const r = sheet.getRange(row, 1, 1, HEADERS.length).getValues()[0];
  return jsonResponse({
    success:        true,
    orderId:        r[0],
    timestamp:      r[1],
    name:           r[2],
    product:        r[6],
    quantity:       r[7],
    total:          r[8],
    couponCode:     r[9],
    couponDiscount: r[10],
    influencerName: r[11] || 'No Coupon',
    paymentMethod:  r[12],
    paymentStatus:  r[13],
    orderStatus:    r[14]
  });
}

function handleGetOrders() {
  const sheet = getOrCreateSheet();
  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) return jsonResponse({ success: true, orders: [] });

  const orders = [];
  const seen = new Set();
  for (let i = data.length - 1; i >= 1; i--) {
    const r = data[i];
    // Historic double-submits left duplicate rows with the same Order ID.
    // Return only the newest row per Order ID so readers never see two orders.
    const oid = String(r[0] || '').trim().toUpperCase();
    if (oid && seen.has(oid)) continue;
    if (oid) seen.add(oid);
    orders.push({
      orderId: r[0] || '',
      timestamp: r[1] || '',
      name: r[2] || '',
      email: r[3] || '',
      phone: r[4] || '',
      address: r[5] || '',
      product: r[6] || '',
      quantity: r[7] || '',
      total: r[8] || '',
      couponCode: r[9] || '',
      couponDiscount: r[10] || 0,
      influencerName: r[11] || 'No Coupon',
      paymentMethod: r[12] || '',
      paymentStatus: r[13] || '',
      orderStatus: r[14] || '',
      notes: r[15] || ''
    });
  }
  return jsonResponse({ success: true, orders: orders });
}

// ============================================================
//  ACTION: Durable coupon catalog (Coupons tab)
//  The website backend runs on Vercel (read-only disk), so coupons
//  are persisted here and re-loaded on every cold start.
// ============================================================
function handleGetCoupons() {
  const sheet = getOrCreateCatalogSheet(COUPON_SHEET_NAME, COUPON_HEADERS);
  const data  = sheet.getDataRange().getValues();

  if (data.length <= 1) return jsonResponse({ success: true, coupons: [] });

  const coupons = [];
  for (let i = 1; i < data.length; i++) {
    const obj = catalogRowToObject(COUPON_HEADERS, data[i]);
    if (obj.couponCode) coupons.push(obj);
  }
  return jsonResponse({ success: true, coupons: coupons });
}

function handleUpsertCoupon(data) {
  const coupon = data.coupon;
  if (!coupon || !coupon.couponCode) {
    return jsonResponse({ success: false, error: 'Missing coupon.couponCode' }, 400);
  }

  const sheet  = getOrCreateCatalogSheet(COUPON_SHEET_NAME, COUPON_HEADERS);
  const values = sheet.getDataRange().getValues();
  const code   = String(coupon.couponCode).trim().toUpperCase();
  const cid    = String(coupon.couponId || '').trim();

  // Match by couponId when present, else by couponCode (upsert semantics).
  let targetRow = 0;
  for (let i = 1; i < values.length; i++) {
    const rowId   = String(values[i][0] || '').trim();
    const rowCode = String(values[i][1] || '').trim().toUpperCase();
    if ((cid && rowId === cid) || (!cid && rowCode === code)) { targetRow = i + 1; break; }
  }

  const rowValues = objectToCatalogRow(COUPON_HEADERS, coupon);
  if (targetRow) {
    sheet.getRange(targetRow, 1, 1, COUPON_HEADERS.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }
  return jsonResponse({ success: true, message: 'Coupon saved', couponCode: code });
}

// ============================================================
//  ACTION: Durable influencer catalog (Influencers tab)
// ============================================================
function handleGetInfluencers() {
  const sheet = getOrCreateCatalogSheet(INFLUENCER_SHEET_NAME, INFLUENCER_HEADERS);
  const data  = sheet.getDataRange().getValues();

  if (data.length <= 1) return jsonResponse({ success: true, influencers: [] });

  const influencers = [];
  for (let i = 1; i < data.length; i++) {
    const obj = catalogRowToObject(INFLUENCER_HEADERS, data[i]);
    if (obj.influencerId || obj.accessToken) influencers.push(obj);
  }
  return jsonResponse({ success: true, influencers: influencers });
}

function handleUpsertInfluencer(data) {
  const inf = data.influencer;
  if (!inf || !inf.influencerId) {
    return jsonResponse({ success: false, error: 'Missing influencer.influencerId' }, 400);
  }

  const sheet  = getOrCreateCatalogSheet(INFLUENCER_SHEET_NAME, INFLUENCER_HEADERS);
  const values = sheet.getDataRange().getValues();
  const id     = String(inf.influencerId).trim();

  let targetRow = 0;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === id) { targetRow = i + 1; break; }
  }

  const rowValues = objectToCatalogRow(INFLUENCER_HEADERS, inf);
  if (targetRow) {
    sheet.getRange(targetRow, 1, 1, INFLUENCER_HEADERS.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }
  return jsonResponse({ success: true, message: 'Influencer saved', influencerId: id });
}

// ============================================================
//  CATALOG HELPERS (Coupons / Influencers tabs)
//  A Sheet row IS a record: header names match the engine's object
//  keys exactly, so hydration needs no field-name translation.
// ============================================================
// Number fields where an empty cell legitimately means `null`
// (everything else defaults to 0).
const CATALOG_NULLABLE_NUMBER_FIELDS = ['maximumUses', 'maximumDiscount'];

function getOrCreateCatalogSheet(name, headers) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let   sheet = ss.getSheetByName(name);

  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  if (sheet.getLastRow() === 0) {
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setValues([headers]);
    headerRange.setBackground('#3D2B1F');
    headerRange.setFontColor('#E8B84B');
    headerRange.setFontWeight('bold');
    headerRange.setFontSize(11);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// Sheet row (array) -> record object, coercing JSON / bool / number cells.
function catalogRowToObject(headers, row) {
  const obj = {};
  for (let i = 0; i < headers.length; i++) {
    const key = headers[i];
    const val = row[i];

    if (CATALOG_ARRAY_FIELDS.indexOf(key) !== -1) {
      obj[key] = parseCatalogArray(val);
    } else if (CATALOG_BOOL_FIELDS.indexOf(key) !== -1) {
      obj[key] = parseCatalogBool(val);
    } else if (CATALOG_NUMBER_FIELDS.indexOf(key) !== -1) {
      obj[key] = parseCatalogNumber(val, CATALOG_NULLABLE_NUMBER_FIELDS.indexOf(key) !== -1);
    } else {
      obj[key] = (val === null || val === undefined) ? '' : String(val);
    }
  }

  // Empty cells that mean "not set" -> null, matching the engine's shape.
  if (obj.expiryDate === '')     obj.expiryDate = null;
  if (obj.lastOrderDate === '')  obj.lastOrderDate = null;
  if (obj.influencerId === '')   obj.influencerId = null;
  if (obj.influencerName === '') obj.influencerName = null;
  return obj;
}

// Record object -> Sheet row (array), coercing arrays / bools / nulls.
function objectToCatalogRow(headers, obj) {
  const row = [];
  for (let i = 0; i < headers.length; i++) {
    const key = headers[i];
    const val = obj ? obj[key] : undefined;

    if (CATALOG_ARRAY_FIELDS.indexOf(key) !== -1) {
      row.push(Array.isArray(val) && val.length ? JSON.stringify(val) : '');
    } else if (CATALOG_BOOL_FIELDS.indexOf(key) !== -1) {
      row.push(val === false ? false : true);
    } else if (CATALOG_NUMBER_FIELDS.indexOf(key) !== -1) {
      if (val === null || val === undefined || val === '') {
        row.push('');
      } else {
        const n = Number(val);
        row.push(Number.isFinite(n) ? n : '');
      }
    } else {
      row.push((val === null || val === undefined) ? '' : val);
    }
  }
  return row;
}

function parseCatalogArray(val) {
  if (Array.isArray(val)) return val;
  const s = String(val === null || val === undefined ? '' : val).trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    // Tolerate hand-typed comma-separated values.
    return s.split(',').map(x => x.trim()).filter(Boolean);
  }
}

function parseCatalogBool(val) {
  if (typeof val === 'boolean') return val;
  const s = String(val === null || val === undefined ? '' : val).trim().toLowerCase();
  if (s === 'false' || s === '0' || s === 'no' || s === 'off' || s === 'disabled') return false;
  return true; // blank defaults to enabled
}

function parseCatalogNumber(val, nullable) {
  if (val === null || val === undefined || val === '') return nullable ? null : 0;
  const n = Number(String(val).replace(/[^0-9.\-]/g, ''));
  if (!Number.isFinite(n)) return nullable ? null : 0;
  return n;
}

// ============================================================
//  SHEET HELPERS
// ============================================================
function getOrCreateSheet() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let   sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    // Write headers with styling
    const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
    headerRange.setValues([HEADERS]);
    headerRange.setBackground('#3D2B1F');
    headerRange.setFontColor('#E8B84B');
    headerRange.setFontWeight('bold');
    headerRange.setFontSize(11);
    sheet.setFrozenRows(1);

    // Set column widths
    sheet.setColumnWidth(1, 180);  // Order ID
    sheet.setColumnWidth(2, 160);  // Timestamp
    sheet.setColumnWidth(3, 140);  // Name
    sheet.setColumnWidth(4, 180);  // Email
    sheet.setColumnWidth(5, 120);  // Phone
    sheet.setColumnWidth(6, 260);  // Address
    sheet.setColumnWidth(7, 160);  // Product
    sheet.setColumnWidth(10, 140); // Coupon Code
    sheet.setColumnWidth(11, 150); // Coupon Discount
    sheet.setColumnWidth(12, 180); // Influencer/User
    sheet.setColumnWidth(13, 120); // Payment Method
    sheet.setColumnWidth(14, 240); // Payment Status
    sheet.setColumnWidth(15, 160); // Order Status
    sheet.setColumnWidth(16, 200); // Notes
  }
  return sheet;
}

function findRowByOrderId(sheet, orderId) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim().toUpperCase() === orderId.trim().toUpperCase()) {
      return i + 1; // 1-indexed row
    }
  }
  return 0;
}

function getOrderDataFromRow(sheet, row) {
  const r = sheet.getRange(row, 1, 1, HEADERS.length).getValues()[0];
  return {
    orderId: r[0], timestamp: r[1], name: r[2], email: r[3],
    phone: r[4], address: r[5], product: r[6], quantity: r[7],
    total: r[8], couponCode: r[9], couponDiscount: r[10], influencerName: r[11],
    paymentMethod: r[12], paymentStatus: r[13], orderStatus: r[14]
  };
}

// ============================================================
//  EMAIL: Customer confirmation
// ============================================================
function sendCustomerEmail(data, status) {
  const subject = status === 'Order Received'
    ? `✅ Order Confirmed – ${data.orderId} | Gaumaatri Ghee`
    : `📦 Order Update – ${data.orderId} | Gaumaatri Ghee`;

  const body = `
Dear ${data.name},

Thank you for ordering from Gaumaatri Ghee! 🐄

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ORDER DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Order ID     : ${data.orderId}
Product      : ${data.product}
Quantity     : ${data.quantity}
Total Amount : ₹${data.total}
Payment      : ${data.paymentMethod}
Status       : ${status}

DELIVERY ADDRESS
${data.address}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${data.paymentMethod === 'UPI'
  ? '📱 Please complete your UPI payment to: 9654270726@upi\n   Amount: ₹' + data.total + '\n   Your order will be confirmed after payment verification.'
  : '💵 Cash on Delivery — Please keep ₹' + data.total + ' ready at the time of delivery.'}

To track your order, visit: https://anshuman7739.github.io/Gaumaatri-Ghee/
Enter your Order ID: ${data.orderId}

Questions? WhatsApp us: +91 9654270726

With love,
Team Gaumaatri 🙏
gaumaatri@gmail.com
  `.trim();

  MailApp.sendEmail({
    to: data.email,
    subject: subject,
    body: body,
    name: 'Gaumaatri'
  });
  Logger.log('Customer email sent to: ' + data.email);
}

// ============================================================
//  EMAIL: Admin new order alert
// ============================================================
function sendAdminEmail(data, status) {
  const adminEmail = PropertiesService.getScriptProperties().getProperty('ADMIN_EMAIL') || 'gaumaatri@gmail.com';
  const subject    = `🛒 New Order Received – ${data.orderId} (${data.paymentMethod})`;

  const body = `
NEW ORDER RECEIVED — GAUMAATRI GHEE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Order ID      : ${data.orderId}
Timestamp     : ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}

CUSTOMER DETAILS
Name          : ${data.name}
Email         : ${data.email}
Phone         : ${data.phone}
Address       : ${data.address}

ORDER DETAILS
Product       : ${data.product}
Quantity      : ${data.quantity}
Total         : ₹${data.total}
Payment       : ${data.paymentMethod}
Status        : ${status}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👉 View all orders in Google Sheets:
${SpreadsheetApp.getActiveSpreadsheet().getUrl()}
  `.trim();

  MailApp.sendEmail({
    to: adminEmail,
    subject: subject,
    body: body,
    name: 'Gaumaatri'
  });
  Logger.log('Admin email sent for order: ' + data.orderId);
}

// ============================================================
//  EMAIL: Admin payment alert
// ============================================================
function sendAdminPaymentAlert(order) {
  const adminEmail = PropertiesService.getScriptProperties().getProperty('ADMIN_EMAIL') || 'gaumaatri@gmail.com';
  MailApp.sendEmail({
    to: adminEmail,
    subject: `💰 Payment Submitted – ${order.orderId} – Please Verify`,
    body: `
Customer has submitted payment for order ${order.orderId}.

Name    : ${order.name}
Email   : ${order.email}
Phone   : ${order.phone}
Product : ${order.product} × ${order.quantity}
Amount  : ₹${order.total}

Please verify the payment in your UPI app and update the status in Google Sheets.

View Sheet: ${SpreadsheetApp.getActiveSpreadsheet().getUrl()}
    `.trim(),
    name: 'Gaumaatri'
  });
}

// ============================================================
//  RESPONSE HELPER
// ============================================================
function jsonResponse(data, statusCode) {
  // Note: Apps Script doPost/doGet always returns 200.
  // Status codes are included in the JSON body for the frontend to read.
  data.statusCode = statusCode || 200;
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
