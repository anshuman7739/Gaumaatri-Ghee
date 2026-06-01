# 🧪 Staging Setup & Testing Guide

## 1. Create Staging Environment

### Option A: Local Testing (Recommended First)
```bash
# Clone to staging folder
cd /Users/shubhamkumar/Desktop
cp -r RAZOR RAZOR-staging
cd RAZOR-staging

# Install dependencies
npm install

# Start server on different port
PORT=4000 npm start
```

Visit: `http://localhost:4000`

### Option B: Deploy to Vercel Staging
```bash
# Create staging branch
git checkout -b staging

# Make changes to staging branch
# All testing happens on staging branch
git push origin staging

# Deploy staging branch to different URL in Vercel
# Settings > Deployments > Configure branch
```

Staging URL: `https://gaumaatri-staging.vercel.app`

---

## 2. Where to Add/View Code

### 📁 File Structure for Coupon System

```
/Users/shubhamkumar/Desktop/RAZOR/
├── server.js                          👈 API ENDPOINTS (Lines 1-1100+)
│   ├── POST /api/validate-coupon      (Line ~800)
│   ├── POST /api/apply-coupon         (Line ~850)
│   ├── GET /api/admin/coupons         (Line ~900)
│   ├── POST /api/admin/create-coupon  (Line ~950)
│   ├── POST /api/admin/toggle-coupon  (Line ~1000)
│   ├── GET /api/admin/coupon-stats    (Line ~1050)
│   └── GET /api/admin/analytics       (Line ~1100)
│
├── admin-coupons.html                 👈 ADMIN DASHBOARD
│   ├── Create Coupon Tab
│   ├── Manage Coupons Tab
│   └── Analytics Tab
│
├── index.html                         👈 CHECKOUT PAGE (Need to integrate)
│   ├── Line ~1700: Checkout Form
│   ├── Line ~1750: Payment Integration
│   └── TODO: Add Coupon Field
│
├── coupons-db.js                      👈 COUPON DATABASE MODULE
│   └── 6 Async Functions
│
└── DATA STORAGE (In-Memory for now)
    ├── couponsDb (Map)
    └── couponUsageDb (Array)
```

---

## 3. Testing Workflow

### Step 1: Start Local Server
```bash
cd /Users/shubhamkumar/Desktop/RAZOR-staging
PORT=4000 npm start
```

### Step 2: Access Admin Dashboard
Open in browser: `http://localhost:4000/admin-coupons.html`

### Step 3: Create Test Coupons
- Code: `TEST25`
- Code: `PROMO50`
- Code: `WELCOME25` (with expiry date)

### Step 4: Test Coupon Validation
Use this curl command to test:

```bash
# Test valid coupon
curl -X POST http://localhost:4000/api/validate-coupon \
  -H "Content-Type: application/json" \
  -d '{"code":"TEST25","amount":1000}'

# Expected Response:
# { "valid": true, "discount": 25, "discountAmount": 250, "finalAmount": 750 }
```

### Step 5: Test Order with Coupon
```bash
# Create order with coupon
curl -X POST http://localhost:4000/api/create-order \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 1000,
    "couponCode": "TEST25",
    "customerName": "Test User",
    "customerEmail": "test@example.com"
  }'
```

### Step 6: View Analytics
- Access: `http://localhost:4000/admin-coupons.html`
- Click "Analytics" tab
- See all orders placed with coupons

---

## 4. View Order Data & Analytics

### Where Orders Are Stored

**Currently (In-Memory):**
```javascript
// In server.js (In-Memory)
const couponUsageDb = []; // Array of all orders with coupons
```

**Structure of each order:**
```javascript
{
  orderId: "ORDER_123",
  couponCode: "TEST25",
  originalAmount: 1000,
  discountAmount: 250,
  finalAmount: 750,
  customerName: "John Doe",
  customerEmail: "john@example.com",
  status: "completed",
  timestamp: "2026-06-01T10:30:00Z"
}
```

### API to View Orders with Coupons

**1. View All Coupons:**
```bash
curl http://localhost:4000/api/admin/coupons
```

Response shows:
- Coupon code
- Discount percentage
- Times used
- Active status
- Created date

**2. View Per-Coupon Analytics:**
```bash
curl http://localhost:4000/api/admin/coupon-stats/TEST25
```

Response shows:
- Times used
- Total discount given
- Total revenue
- Recent usage (last 10 orders)

**3. View Overall Analytics:**
```bash
curl http://localhost:4000/api/admin/analytics
```

Response shows:
- Total coupons created
- Active coupons count
- Total orders with coupons
- Total discount given
- Total revenue
- Conversion rate
- Top performing coupon

---

## 5. Real-Time Testing Checklist

### ✅ Create Coupon Test
```
[ ] Open http://localhost:4000/admin-coupons.html
[ ] Click "Create Coupon" tab
[ ] Enter code: TEST25
[ ] Click "Create Coupon"
[ ] See success message ✅
```

### ✅ List All Coupons Test
```
[ ] Click "Manage Coupons" tab
[ ] Click "Refresh List"
[ ] See TEST25 in table
[ ] See: Used=0, Status=Active
```

### ✅ Validate Coupon Test
```bash
[ ] Run: curl -X POST http://localhost:4000/api/validate-coupon \
      -H "Content-Type: application/json" \
      -d '{"code":"TEST25","amount":1000}'
[ ] See: { "valid": true, "discount": 25, "discountAmount": 250 }
```

### ✅ Apply Coupon Test
```bash
[ ] Run: curl -X POST http://localhost:4000/api/apply-coupon \
      -H "Content-Type: application/json" \
      -d '{"code":"TEST25","orderId":"ORD123","amount":1000}'
[ ] See: Success response
```

### ✅ View Analytics Test
```
[ ] Click "Analytics" tab
[ ] See stat cards with updated numbers
[ ] "Total Orders with Coupon" should increase
[ ] "Total Discount Given" should increase
```

### ✅ Toggle Coupon Test
```
[ ] Click "Manage Coupons" tab
[ ] Click "Disable" button on TEST25
[ ] See status change to "❌ Inactive"
[ ] Run validate-coupon again - should fail
[ ] Click "Enable" button
[ ] See status change back to "✅ Active"
```

---

## 6. View Coupon Usage Data

### Method 1: Admin Dashboard (Easiest)
1. Go to: `http://localhost:4000/admin-coupons.html`
2. Click "Analytics" tab
3. See all metrics:
   - Total orders placed with coupons
   - Customer names (in coupon stats)
   - Discount amounts per coupon
   - Revenue generated

### Method 2: API Endpoint (For Integration)
```bash
# Get per-coupon stats
curl http://localhost:4000/api/admin/coupon-stats/TEST25

# Returns:
# {
#   "timesUsed": 5,
#   "totalDiscountGiven": 1250,
#   "totalRevenue": 4750,
#   "recentUsage": [
#     { "orderId": "ORD1", "customerName": "John", "amount": 1000, "timestamp": "..." },
#     ...
#   ]
# }
```

### Method 3: Browser Console
```javascript
// In browser at http://localhost:4000/admin-coupons.html
// Open DevTools (F12) > Console > paste:

fetch('http://localhost:4000/api/admin/analytics')
  .then(r => r.json())
  .then(d => console.table(d.allCouponsStats))
```

---

## 7. Next: Integrate Coupon Field in Checkout

### Location: `/index.html` around Line 1700

```html
<!-- Add this before the payment section -->
<div class="form-group">
  <label for="couponCode">Coupon Code (Optional)</label>
  <input 
    type="text" 
    id="couponCode" 
    placeholder="e.g., TEST25"
    style="text-transform: uppercase;"
  />
  <button onclick="validateAndApplyCoupon()">Apply Coupon</button>
  <div id="couponMessage"></div>
  <div id="discountDisplay" style="display:none;">
    Discount: ₹<span id="discountAmount">0</span>
    <br>
    Final Amount: ₹<span id="finalAmount">0</span>
  </div>
</div>
```

### JavaScript Handler (Add to index.html)
```javascript
async function validateAndApplyCoupon() {
  const code = document.getElementById('couponCode').value;
  const amount = parseInt(document.getElementById('amount').value);
  
  const response = await fetch('/api/validate-coupon', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, amount })
  });
  
  const data = await response.json();
  
  if (data.valid) {
    document.getElementById('discountAmount').textContent = data.discountAmount;
    document.getElementById('finalAmount').textContent = data.finalAmount;
    document.getElementById('discountDisplay').style.display = 'block';
    document.getElementById('couponMessage').textContent = '✅ Coupon applied!';
  } else {
    document.getElementById('couponMessage').textContent = '❌ Invalid coupon';
  }
}
```

---

## 8. Staging Environment Commands

### Start Staging Server
```bash
cd /Users/shubhamkumar/Desktop/RAZOR-staging
PORT=4000 npm start
```

### Run All Tests
```bash
chmod +x test-coupon-system.sh
./test-coupon-system.sh
```

### View Server Logs
```bash
# Check if server is running
lsof -i :4000

# Kill if needed
kill -9 <PID>
```

### Check Database State
```bash
curl http://localhost:4000/api/admin/coupons | json_pp
```

---

## 9. Before Going Live

### Pre-Production Checklist

- [ ] **Coupon Creation** - Can create new coupons in admin
- [ ] **Coupon Validation** - Coupons validate correctly
- [ ] **Order Tracking** - Orders recorded with coupon code
- [ ] **Analytics** - Dashboard shows correct data
- [ ] **Admin Access** - Secure access to dashboard
- [ ] **Checkout Integration** - Coupon field works in product page
- [ ] **Payment Integration** - Razorpay calculates correct final amount
- [ ] **Coupon Limits** - Expiry and usage limits enforced
- [ ] **Minimum Amount** - Minimum order amount enforced
- [ ] **Multiple Coupons** - Test 5+ different coupons

### Performance Check
```bash
# Test 100 coupon validations
for i in {1..100}; do
  curl -X POST http://localhost:4000/api/validate-coupon \
    -H "Content-Type: application/json" \
    -d "{\"code\":\"TEST25\",\"amount\":1000}" &
done
wait
```

---

## 10. Data Persistence (Future)

### Current: In-Memory (Testing Only)
- Data lost on server restart
- Good for: Development & staging testing

### Next: Google Sheets (Production)
- Use existing `coupons-db.js` module
- Replace in-memory storage with Sheets API
- Permanent data storage
- Accessible from anywhere

```javascript
// Replace in server.js:
// OLD: const couponsDb = new Map();
// NEW: const couponsDb = new GoogleSheets('coupons');
```

---

## Summary

| Task | Location | Command |
|------|----------|---------|
| **Start Local Server** | Terminal | `PORT=4000 npm start` |
| **Access Admin** | Browser | `http://localhost:4000/admin-coupons.html` |
| **Create Coupon** | Admin Dashboard | Click tab + fill form |
| **View All Orders** | Admin Dashboard | Analytics tab |
| **View Per-Coupon Stats** | API | `/api/admin/coupon-stats/CODE` |
| **Validate Coupon** | API | `/api/validate-coupon` (POST) |
| **Test Coupons** | Terminal | `./test-coupon-system.sh` |
| **Deploy Staging** | Git | `git push origin staging` |

---

## Need Help?

```bash
# Check all available endpoints
grep "app.post\|app.get" server.js | grep coupon

# View coupon database state
curl http://localhost:4000/api/admin/coupons | python -m json.tool

# Test single coupon
curl -X POST http://localhost:4000/api/validate-coupon \
  -H "Content-Type: application/json" \
  -d '{"code":"TEST25","amount":1000}'
```

