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
  'Payment Method', 'Payment Status', 'Order Status', 'Notes'
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

    if (action === 'trackOrder' && orderId) {
      return handleTrackOrder(orderId);
    }

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
  // ── Field Validation ──────────────────────────────────────
  const required = ['orderId','name','email','phone','address','product','quantity','total','paymentMethod'];
  for (const field of required) {
    if (!data[field]) {
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
    data.paymentMethod,
    'Pending',          // Payment Status
    'Order Received',   // Order Status
    ''                  // Notes
  ];
  sheet.appendRow(row);

  // ── Auto-format new row ───────────────────────────────────
  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow, 1, 1, HEADERS.length)
       .setBorder(true, true, true, true, true, true);

  // ── Send Emails ───────────────────────────────────────────
  try { sendCustomerEmail(data, 'Order Received'); }     catch(e) { Logger.log('Customer email failed: ' + e); }
  try { sendAdminEmail(data, 'Order Received'); }         catch(e) { Logger.log('Admin email failed: ' + e); }

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

  // Column 11 = Payment Status
  sheet.getRange(row, 11).setValue('Payment Submitted – Verification Pending');
  // Column 13 = Notes
  sheet.getRange(row, 13).setValue('Payment proof uploaded by customer at ' + new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }));

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

  sheet.getRange(row, 12).setValue(data.status); // Column 12 = Order Status
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
    success:       true,
    orderId:       r[0],
    timestamp:     r[1],
    name:          r[2],
    product:       r[6],
    quantity:      r[7],
    total:         r[8],
    paymentMethod: r[9],
    paymentStatus: r[10],
    orderStatus:   r[11]
  });
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
    sheet.setColumnWidth(10, 120); // Payment Method
    sheet.setColumnWidth(11, 240); // Payment Status
    sheet.setColumnWidth(12, 160); // Order Status
    sheet.setColumnWidth(13, 200); // Notes
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
    total: r[8], paymentMethod: r[9], paymentStatus: r[10], orderStatus: r[11]
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
