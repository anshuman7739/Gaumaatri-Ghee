const Razorpay = require('razorpay');
const crypto = require('crypto');
 
// ── CONFIGURATION ────────────────────────────────────────────────
// Replace these with your actual Razorpay keys from https://dashboard.razorpay.com/
const RAZORPAY_KEY_ID = 'rzp_live_Sho4UtyJcaqCgh';      // ← Your Key ID
const RAZORPAY_KEY_SECRET = 'YOUR_RAZORPAY_KEY_SECRET'; // ← Your Key Secret (KEEP SECRET!)
 
// Product pricing (must match frontend)
const PRICES = {
  '200ml': 356,
  '500ml': 789,
  '1L': 1599
};
 
// Coupon codes
const COUPONS = {
  'GAUMAATRI10': 10,
  'GHEE10': 10,
  'WELCOME10': 10
};
 
// ── RAZORPAY INSTANCE ────────────────────────────────────────────
const razorpay = new Razorpay({
  key_id: RAZORPAY_KEY_ID,
  key_secret: RAZORPAY_KEY_SECRET
});
 
// ── CORS HEADERS ─────────────────────────────────────────────────
const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // In production, replace with your domain
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};
 
// ── MAIN HANDLER ─────────────────────────────────────────────────
module.exports = async (req, res) => {
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).json({});
  }
 
  // Only accept POST
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed. Use POST.' 
    });
  }
 
  try {
    const body = req.body;
    
    // ═══════════════════════════════════════════════════════════
    // ROUTE 1: CREATE RAZORPAY ORDER
    // ═══════════════════════════════════════════════════════════
    if (body.variantKey && body.qty) {
      
      const { variantKey, qty, couponCode } = body;
 
      // Validate variant
      if (!PRICES[variantKey]) {
        return res.status(400).json({
          success: false,
          error: `Invalid product variant: ${variantKey}`
        });
      }
 
      // Calculate amount
      let baseAmount = PRICES[variantKey] * qty;
      let discount = 0;
 
      if (couponCode && COUPONS[couponCode.toUpperCase()]) {
        discount = Math.round(baseAmount * COUPONS[couponCode.toUpperCase()] / 100);
        baseAmount -= discount;
      }
 
      // Razorpay expects amount in paise (smallest currency unit)
      const amountInPaise = baseAmount * 100;
 
      // Create Razorpay order
      const razorpayOrder = await razorpay.orders.create({
        amount: amountInPaise,
        currency: 'INR',
        receipt: `receipt_${Date.now()}`,
        notes: {
          product: variantKey,
          quantity: qty,
          discount: discount,
          coupon: couponCode || 'None'
        }
      });
 
      return res.status(200).json({
        success: true,
        order_id: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        key_id: RAZORPAY_KEY_ID
      });
    }
    
    // ═══════════════════════════════════════════════════════════
    // ROUTE 2: VERIFY PAYMENT SIGNATURE
    // ═══════════════════════════════════════════════════════════
    else if (body.razorpay_order_id && body.razorpay_payment_id && body.razorpay_signature) {
      
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature, customer } = body;
 
      // Generate expected signature
      const generatedSignature = crypto
        .createHmac('sha256', RAZORPAY_KEY_SECRET)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');
 
      // Verify signature
      if (generatedSignature !== razorpay_signature) {
        return res.status(400).json({
          success: false,
          error: 'Invalid payment signature'
        });
      }
 
      // Generate order ID for your system
      const orderId = `GM-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
 
      // ─────────────────────────────────────────────────────────
      // TODO: Save order to your database here
      // ─────────────────────────────────────────────────────────
      // Example:
      // await db.orders.create({
      //   orderId,
      //   razorpayOrderId: razorpay_order_id,
      //   razorpayPaymentId: razorpay_payment_id,
      //   customer,
      //   status: 'paid'
      // });
 
      console.log('✅ Payment verified successfully:', {
        orderId,
        razorpayPaymentId: razorpay_payment_id,
        customer: customer?.email
      });
 
      return res.status(200).json({
        success: true,
        orderId,
        message: 'Payment verified successfully'
      });
    }
    
    // ═══════════════════════════════════════════════════════════
    // INVALID REQUEST
    // ═══════════════════════════════════════════════════════════
    else {
      return res.status(400).json({
        success: false,
        error: 'Invalid request. Provide either order creation or verification parameters.'
      });
    }
 
  } catch (error) {
    console.error('❌ API Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
};
 
// ════════════════════════════════════════════════════════════════
// Set CORS headers for all responses
// ════════════════════════════════════════════════════════════════
module.exports = ((handler) => {
  return async (req, res) => {
    Object.entries(corsHeaders).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    return handler(req, res);
  };
})(module.exports);
 


