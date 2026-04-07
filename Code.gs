// ============================================================
//  GAUMAATRI GHEE — Google Apps Script Backend
//  Paste this entire file into Google Apps Script editor
//  https://script.google.com
// ============================================================

// ── STEP 1: Set your secret token ──────────────────────────
// Run setSecretToken() ONCE from the script editor, then delete it.
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

// ── CONFIG ──────────────────────────────────────────────────
const SHEET_NAME       = 'Orders';
const PROMO_SHEET_NAME = 'Promo Codes';

// Orders sheet columns (in order)
const HEADERS = [
  'Order ID', 'Timestamp', 'Name', 'Email', 'Phone',
  'Address', 'Product', 'Quantity',
  'Original Price (₹)', 'Promo Code', 'Discount %', 'Discounted Price (₹)',
  'Payment Method', 'Payment Status', 'Order Status', 'Notes'
];

// Promo Codes sheet columns
const PROMO_HEADERS = ['Promo Code', 'Discount %', 'Max Uses', 'Expiry Date', 'Times Used', 'Last Used'];

// ── Pre-defined promo codes (mirrors frontend PROMO_CODES) ──
// Edit here to add / change codes server-side too.
const PROMO_CODES_MASTER = {
  'GAU25':       { discount: 25, maxUses: 50,  expiry: '2026-12-31' },
  'FIRST25':     { discount: 25, maxUses: 100, expiry: '2026-12-31' },
  'FESTIVE25':   { discount: 25, maxUses: 200, expiry: '2026-10-31' },
  'GAUMAATRI10': { discount: 10, maxUses: null, expiry: null },
  'WELCOME10':   { discount: 10, maxUses: null, expiry: null },
};

// ============================================================
//  CORS HELPER
// ============================================================
function doOptions() {
  return ContentService.createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT);
}

// ============================================================
//  MAIN HANDLER — POST requests
// ============================================================
function doPost(e) {
  try {
    const data   = JSON.parse(e.postData.contents);
    const action = data.action;

    // Token Validation
    const storedToken = PropertiesService.getScriptProperties().getProperty('SECRET_TOKEN');
    if (!storedToken || data.token !== storedToken) {
      return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
    }

    if (action === 'submitOrder')   return handleSubmitOrder(data);
    if (action === 'updatePayment') return handleUpdatePayment(data);
    if (action === 'updateStatus')  return handleUpdateStatus(data);

    return jsonResponse({ success: false, error: 'Unknown action' }, 400);

  } catch (err) {
    Logger.log('doPost Error: ' + err.message);
    return jsonResponse({ success: false, error: 'Server error: ' + err.message }, 500);
  }
}

// ============================================================
//  MAIN HANDLER — GET requests (order tracking)
// ============================================================
function doGet(e) {
  try {
    const action  = e.parameter.action;
    const token   = e.parameter.token;
    const orderId = e.parameter.orderId;

    const storedToken = PropertiesService.getScriptProperties().getProperty('SECRET_TOKEN');
    if (!storedToken || token !== storedToken) {
      return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
    }

    if (action === 'trackOrder' && orderId) return handleTrackOrder(orderId);

    return jsonResponse({ success: false, error: 'Unknown action' }, 400);

  } catch (err) {
    Logger.log('doGet Error: ' + err.message);
    return jsonResponse({ success: false, error: 'Server error' }, 500);
  }
}

// ============================================================
//  ACTION: Submit new order (with promo code support)
// ============================================================
function handleSubmitOrder(data) {
  // Required fields
  const required = ['orderId','name','email','phone','address','product','quantity','paymentMethod'];
  for (const field of required) {
    if (!data[field]) return jsonResponse({ success: false, error: 'Missing field: ' + field }, 400);
  }

  // Basic validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return jsonResponse({ success: false, error: 'Invalid email' }, 400);
  }
  if (!/^[6-9]\d{9}$/.test(data.phone)) {
    return jsonResponse({ success: false, error: 'Invalid phone' }, 400);
  }
  if (data.quantity < 1 || data.quantity > 10) {
    return jsonResponse({ success: false, error: 'Quantity out of range' }, 400);
  }

  // Promo code server-side validation (extra security layer)
  const promoCode    = (data.promoCode || '').trim().toUpperCase();
  const discountPct  = Number(data.discountPct) || 0;
  const originalPrice  = Number(data.originalPrice) || 0;
  const discountedPrice = Number(data.discountedPrice) || originalPrice;

  if (promoCode && promoCode !== 'NONE') {
    const validationError = validatePromoCode(promoCode, discountPct);
    if (validationError) {
      return jsonResponse({ success: false, error: validationError }, 400);
    }
  }

  // Duplicate check
  const sheet    = getOrCreateOrderSheet();
  const existing = findRowByOrderId(sheet, data.orderId);
  if (existing > 0) {
    return jsonResponse({ success: false, error: 'Order ID already exists' }, 409);
  }

  // Write order to sheet
  const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const row = [
    data.orderId,
    timestamp,
    data.name,
    data.email,
    data.phone,
    data.address,
    data.product,
    data.quantity,
    originalPrice,                          // Original Price
    promoCode || 'None',                    // Promo Code
    discountPct ? discountPct + '%' : '0%', // Discount %
    discountedPrice,                        // Discounted Price (what customer pays)
    data.paymentMethod,
    'Pending',                              // Payment Status
    'Order Received',                       // Order Status
    ''                                      // Notes
  ];
  sheet.appendRow(row);

  // Format new row
  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow, 1, 1, HEADERS.length).setBorder(true, true, true, true, true, true);

  // Highlight rows where a promo was applied (light green)
  if (promoCode && promoCode !== 'NONE') {
    sheet.getRange(lastRow, 10).setBackground('#e8f5e9'); // Promo Code cell
    sheet.getRange(lastRow, 12).setBackground('#e8f5e9'); // Discounted Price cell
    // Track usage in Promo Codes sheet
    trackPromoUsage(promoCode);
  }

  // Send emails
  try { sendCustomerEmail(data, originalPrice, discountedPrice, promoCode, discountPct); } catch(e) { Logger.log('Customer email failed: ' + e); }
  try { sendAdminEmail(data, originalPrice, discountedPrice, promoCode, discountPct); }    catch(e) { Logger.log('Admin email failed: ' + e); }

  Logger.log('Order saved: ' + data.orderId + (promoCode ? ' | Promo: ' + promoCode : ''));
  return jsonResponse({ success: true, orderId: data.orderId, message: 'Order saved successfully' });
}

// ============================================================
//  PROMO CODE VALIDATION (server-side)
// ============================================================
function validatePromoCode(code, claimedDiscount) {
  const master = PROMO_CODES_MASTER[code];
  if (!master) return 'Invalid promo code: ' + code;

  // Check expiry
  if (master.expiry) {
    const expDate = new Date(master.expiry + 'T23:59:59');
    if (new Date() > expDate) return 'Promo code has expired: ' + code;
  }

  // Verify discount matches server-side definition
  if (Number(claimedDiscount) !== master.discount) {
    return 'Promo code discount mismatch';
  }

  // Check usage limit against Promo Codes sheet
  if (master.maxUses !== null) {
    const promoSheet = getOrCreatePromoSheet();
    const row = findPromoCodeRow(promoSheet, code);
    if (row > 0) {
      const usedCount = promoSheet.getRange(row, 5).getValue() || 0;
      if (usedCount >= master.maxUses) return 'Promo code usage limit reached: ' + code;
    }
  }

  return null; // valid
}

// ============================================================
//  PROMO USAGE TRACKING (Promo Codes sheet)
// ============================================================
function trackPromoUsage(code) {
  const sheet = getOrCreatePromoSheet();
  const row   = findPromoCodeRow(sheet, code);
  const now   = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  if (row > 0) {
    // Increment existing count
    const currentCount = sheet.getRange(row, 5).getValue() || 0;
    sheet.getRange(row, 5).setValue(currentCount + 1);
    sheet.getRange(row, 6).setValue(now); // Last Used
  } else {
    // First use — add new row
    const master = PROMO_CODES_MASTER[code] || {};
    sheet.appendRow([
      code,
      master.discount ? master.discount + '%' : '—',
      master.maxUses  || 'Unlimited',
      master.expiry   || 'No Expiry',
      1,   // Times Used
      now  // Last Used
    ]);
  }
}

function findPromoCodeRow(sheet, code) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim().toUpperCase() === code.toUpperCase()) return i + 1;
  }
  return 0;
}

// ============================================================
//  ACTION: Update payment status
// ============================================================
function handleUpdatePayment(data) {
  if (!data.orderId) return jsonResponse({ success: false, error: 'Missing orderId' }, 400);

  const sheet = getOrCreateOrderSheet();
  const row   = findRowByOrderId(sheet, data.orderId);
  if (!row) return jsonResponse({ success: false, error: 'Order not found' }, 404);

  // Col 14 = Payment Status, Col 16 = Notes
  sheet.getRange(row, 14).setValue('Payment Submitted – Verification Pending');
  sheet.getRange(row, 16).setValue('Payment proof uploaded at ' + new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }));

  try {
    const orderData = getOrderDataFromRow(sheet, row);
    sendAdminPaymentAlert(orderData);
  } catch(e) { Logger.log('Payment alert email failed: ' + e); }

  return jsonResponse({ success: true, message: 'Payment status updated' });
}

// ============================================================
//  ACTION: Update order status (admin)
// ============================================================
function handleUpdateStatus(data) {
  if (!data.orderId || !data.status) {
    return jsonResponse({ success: false, error: 'Missing orderId or status' }, 400);
  }
  const sheet = getOrCreateOrderSheet();
  const row   = findRowByOrderId(sheet, data.orderId);
  if (!row) return jsonResponse({ success: false, error: 'Order not found' }, 404);

  sheet.getRange(row, 15).setValue(data.status); // Col 15 = Order Status
  return jsonResponse({ success: true, message: 'Status updated to: ' + data.status });
}

// ============================================================
//  ACTION: Track order
// ============================================================
function handleTrackOrder(orderId) {
  const sheet = getOrCreateOrderSheet();
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
    originalPrice:  r[8],
    promoCode:      r[9],
    discountPct:    r[10],
    total:          r[11],
    paymentMethod:  r[12],
    paymentStatus:  r[13],
    orderStatus:    r[14]
  });
}

// ============================================================
//  SHEET HELPERS
// ============================================================
function getOrCreateOrderSheet() {
  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
    headerRange.setValues([HEADERS]);
    headerRange.setBackground('#3D2B1F');
    headerRange.setFontColor('#E8B84B');
    headerRange.setFontWeight('bold');
    headerRange.setFontSize(11);
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 160); // Order ID
    sheet.setColumnWidth(2, 160); // Timestamp
    sheet.setColumnWidth(3, 140); // Name
    sheet.setColumnWidth(4, 180); // Email
    sheet.setColumnWidth(5, 120); // Phone
    sheet.setColumnWidth(6, 260); // Address
    sheet.setColumnWidth(7, 160); // Product
    sheet.setColumnWidth(9, 120); // Original Price
    sheet.setColumnWidth(10, 120); // Promo Code
    sheet.setColumnWidth(11, 90);  // Discount %
    sheet.setColumnWidth(12, 140); // Discounted Price
  }
  return sheet;
}

function getOrCreatePromoSheet() {
  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(PROMO_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(PROMO_SHEET_NAME);
    const hr = sheet.getRange(1, 1, 1, PROMO_HEADERS.length);
    hr.setValues([PROMO_HEADERS]);
    hr.setBackground('#1B5E20');
    hr.setFontColor('#FFFFFF');
    hr.setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 140);
    sheet.setColumnWidth(5, 100);
    sheet.setColumnWidth(6, 160);
  }
  return sheet;
}

function findRowByOrderId(sheet, orderId) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim().toUpperCase() === orderId.trim().toUpperCase()) return i + 1;
  }
  return 0;
}

function getOrderDataFromRow(sheet, row) {
  const r = sheet.getRange(row, 1, 1, HEADERS.length).getValues()[0];
  return {
    orderId: r[0], timestamp: r[1], name: r[2], email: r[3],
    phone: r[4], address: r[5], product: r[6], quantity: r[7],
    originalPrice: r[8], promoCode: r[9], discountPct: r[10],
    total: r[11], paymentMethod: r[12], paymentStatus: r[13], orderStatus: r[14]
  };
}

// ============================================================
//  EMAIL: Customer confirmation
// ============================================================
function sendCustomerEmail(data, originalPrice, discountedPrice, promoCode, discountPct) {
  const hasPromo  = promoCode && promoCode !== 'NONE' && promoCode !== 'None';
  const promoLine = hasPromo
    ? `Promo Code    : ${promoCode} (${discountPct}% off)\nOriginal Price : ₹${originalPrice}\nYou Saved      : ₹${originalPrice - discountedPrice}\nAmount to Pay  : ₹${discountedPrice}`
    : `Amount to Pay  : ₹${discountedPrice}`;

  const body = `
Dear ${data.name},

Thank you for ordering from Gaumaatri Ghee! 🐄

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ORDER DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Order ID     : ${data.orderId}
Product      : ${data.product}
Quantity     : ${data.quantity}
${promoLine}
Payment      : ${data.paymentMethod}
Status       : Order Received

DELIVERY ADDRESS
${data.address}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${data.paymentMethod === 'UPI'
  ? '📱 Please complete your UPI payment to: 9654270726@upi\n   Amount: ₹' + discountedPrice + '\n   Order confirmed after payment verification.'
  : '💵 Cash on Delivery — Please keep ₹' + discountedPrice + ' ready at delivery.'}

Track your order at: https://gaumaatri.co.in
Your Order ID: ${data.orderId}

Questions? WhatsApp: +91 9654270726

With love,
Team Gaumaatri 🙏
gaumaatri@gmail.com
  `.trim();

  MailApp.sendEmail({ to: data.email, subject: `✅ Order Confirmed – ${data.orderId} | Gaumaatri Ghee`, body, name: 'Gaumaatri' });
}

// ============================================================
//  EMAIL: Admin new order alert
// ============================================================
function sendAdminEmail(data, originalPrice, discountedPrice, promoCode, discountPct) {
  const adminEmail = PropertiesService.getScriptProperties().getProperty('ADMIN_EMAIL') || 'gaumaatri@gmail.com';
  const hasPromo   = promoCode && promoCode !== 'NONE' && promoCode !== 'None';

  const body = `
NEW ORDER — GAUMAATRI GHEE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Order ID      : ${data.orderId}
Timestamp     : ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}

CUSTOMER
Name          : ${data.name}
Email         : ${data.email}
Phone         : ${data.phone}
Address       : ${data.address}

ORDER
Product       : ${data.product} × ${data.quantity}
Original Price: ₹${originalPrice}
${hasPromo ? `Promo Code    : ${promoCode} (${discountPct}% off)\nDiscount Amt  : ₹${originalPrice - discountedPrice}\n` : ''}Amount Payable : ₹${discountedPrice}
Payment       : ${data.paymentMethod}

👉 View sheet: ${SpreadsheetApp.getActiveSpreadsheet().getUrl()}
  `.trim();

  MailApp.sendEmail({ to: adminEmail, subject: `🛒 New Order – ${data.orderId}${hasPromo ? ' 🎟️ Promo: ' + promoCode : ''}`, body, name: 'Gaumaatri' });
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
Customer has submitted UPI payment for order ${order.orderId}.

Name    : ${order.name}
Email   : ${order.email}
Phone   : ${order.phone}
Product : ${order.product} × ${order.quantity}
Amount  : ₹${order.total}
${order.promoCode && order.promoCode !== 'None' ? 'Promo   : ' + order.promoCode + '\n' : ''}
Please verify the payment and update status in Google Sheets.
View: ${SpreadsheetApp.getActiveSpreadsheet().getUrl()}
    `.trim(),
    name: 'Gaumaatri'
  });
}

// ============================================================
//  RESPONSE HELPER
// ============================================================
function jsonResponse(data, statusCode) {
  data.statusCode = statusCode || 200;
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
