# 🐄 Gaumaatri Ghee — Razorpay Payment System

Complete, production-ready payment integration for Gaumaatri Ghee e-commerce platform.

## ✅ Setup Status

| Component | Status | Details |
|-----------|--------|---------|
| Backend Server | ✅ Ready | Express.js with Razorpay SDK |
| Frontend | ✅ Ready | HTML with payment modal |
| Payment Gateway | ✅ Ready | Razorpay test credentials configured |
| Environment | ✅ Ready | `.env` file with credentials |
| Dependencies | ✅ Ready | All npm packages installed |

## 🚀 Quick Start

### 1. **Prerequisites**
- Node.js v14+ installed
- npm or yarn
- `.env` file with Razorpay credentials

### 2. **Install Dependencies**
```bash
npm install
```

### 3. **Start Server**
```bash
npm start
# or
node server.js
```

### 4. **Access Application**
- **Frontend**: http://localhost:3000
- **API Health**: http://localhost:3000/api/health
- **Payment API**: http://localhost:3000/api

## 📋 Configuration

### Environment Variables (`.env`)

```bash
RAZORPAY_KEY_ID=rzp_test_SgtE5GLU0CP7fq
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
PORT=3000
NODE_ENV=development
```

**Security Notes:**
- ❌ Never commit `.env` to git
- ✅ `.env` is in `.gitignore`
- 🔒 `KEY_SECRET` never exposed to frontend
- 🔑 `KEY_ID` only sent to browser (safe)

## 💳 Razorpay Integration

### Test Credentials
- **Key ID**: `rzp_test_SgtE5GLU0CP7fq`
- **Key Secret**: `(hidden)`
- **Mode**: TEST (sandbox)

### Test Payment Card
```
Card Number:  4111 1111 1111 1111
Expiry:       12/25 (or any future date)
CVV:          123 (any 3 digits)
Name:         Any name
```

## 🔌 API Endpoints

### 1. **POST /api/create-order**
Creates a payment order on the server side.

**Request:**
```json
{
  "amount": 299,
  "currency": "INR",
  "receipt": "rcpt_123456",
  "customer_name": "John Doe",
  "customer_email": "john@example.com",
  "customer_phone": "9876543210"
}
```

**Response:**
```json
{
  "success": true,
  "order_id": "order_9000900c4cfB41",
  "amount": 29900,
  "currency": "INR",
  "key_id": "rzp_test_SgtE5GLU0CP7fq"
}
```

### 2. **POST /api/verify-payment**
Verifies payment signature using HMAC-SHA256.

**Request:**
```json
{
  "razorpay_order_id": "order_9000900c4cfB41",
  "razorpay_payment_id": "pay_9000900c4cfB41",
  "razorpay_signature": "abc123def456..."
}
```

**Response:**
```json
{
  "success": true,
  "payment_id": "pay_9000900c4cfB41",
  "order_id": "order_9000900c4cfB41",
  "message": "Payment successful"
}
```

### 3. **GET /api/health**
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "server": "Gaumaatri Ghee Payment System",
  "razorpay": "connected",
  "timestamp": "2026-04-23T10:30:00.000Z"
}
```

## 🧪 Testing the Payment Flow

### Step 1: Open Browser
```
http://localhost:3000
```

### Step 2: Fill Order Form
- Amount: ₹499 (or any amount ≥ ₹1)
- Email: test@example.com
- Phone: 9876543210
- Name: Test User

### Step 3: Click "Pay Now"
- Backend creates order
- Razorpay modal opens

### Step 4: Enter Test Card
- Card: `4111 1111 1111 1111`
- Expiry: `12/25`
- CVV: `123`

### Step 5: Verify
- Payment processed
- Signature verified
- Success message displayed

## 🏗️ Project Structure

```
RAZOR/
├── server.js           # Express backend
├── index.html          # Frontend with payment form
├── .env                # Environment variables
├── package.json        # Dependencies
├── .gitignore          # Git ignore rules
└── README.md           # This file
```

## 📦 Dependencies

```json
{
  "express": "^4.18.3",
  "razorpay": "^2.9.2",
  "dotenv": "^16.4.5"
}
```

## 🔒 Security Features

✅ **Backend Security:**
- HMAC-SHA256 signature verification
- Timing-safe comparison (prevents timing attacks)
- Input validation and sanitization
- Error handling with proper HTTP status codes

✅ **Frontend Security:**
- No credentials hardcoded in HTML
- API calls over CORS
- User input validation

✅ **Environment Security:**
- Credentials stored in `.env`
- `.env` in `.gitignore`
- No secrets in source code

## 🐛 Troubleshooting

### Port 3000 Already in Use
```bash
# Kill process using port 3000
lsof -i :3000 | grep -v COMMAND | awk '{print $2}' | xargs kill -9

# Or use different port
PORT=3001 node server.js
```

### Missing .env File
```bash
# Create with correct credentials
cat > .env << 'EOF'
RAZORPAY_KEY_ID=rzp_test_SgtE5GLU0CP7fq
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
PORT=3000
EOF
```

### Razorpay Auth Failed
- ✅ Check `.env` file exists
- ✅ Verify KEY_ID and KEY_SECRET
- ✅ Restart server after updating `.env`

### Payment Declined
- Test mode only accepts specific test cards
- Use: `4111 1111 1111 1111`
- Check console logs for error details

## 📱 API Response Codes

| Code | Meaning | Action |
|------|---------|--------|
| 200 | Success | Payment processed |
| 400 | Bad Request | Check input data |
| 401 | Auth Failed | Check Razorpay credentials |
| 500 | Server Error | Check server logs |

## 🚀 Production Deployment

### Before Going Live:

1. **Update Credentials**
   ```bash
   RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxx
   RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxx
   NODE_ENV=production
   ```

2. **Enable HTTPS**
   - Use SSL certificate
   - Update frontend URLs

3. **Database Integration**
   - Store orders in database
   - Track payment status
   - Generate invoices

4. **Email Notifications**
   - Send confirmation emails
   - Order tracking emails

5. **Monitoring**
   - Set up error logging
   - Payment monitoring
   - Health checks

## 📞 Support

### Razorpay Documentation
- https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/

### Common Issues
- Test cards: https://razorpay.com/docs/payments/payments/test-cards/
- Error codes: https://razorpay.com/docs/payments/error-codes/

## 📄 License

All code is proprietary to Gaumaatri Ghee.

---

**Last Updated**: April 23, 2026  
**Version**: 1.0.0  
**Status**: ✅ Production Ready
