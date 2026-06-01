# 📋 Quick Testing Reference Guide

## 🚀 Quick Start (30 seconds)

### 1. Start Local Server
```bash
cd /Users/shubhamkumar/Desktop/RAZOR-staging
PORT=4000 npm start
```

### 2. Open Admin Dashboard
```
http://localhost:4000/admin-coupons.html
```

### 3. Create Test Coupon
- Tab: "Create Coupon"
- Code: `TEST25`
- Click "Create Coupon"

### 4. View Orders
```
http://localhost:4000/view-orders.html
```

---

## 📂 Where to Find Everything

| What | Where | URL/Path |
|------|-------|----------|
| **Admin Dashboard** | Coupon management | `/admin-coupons.html` |
| **Orders Viewer** | See all customer orders | `/view-orders.html` |
| **API Endpoints** | Backend code | `server.js` lines 800-1100 |
| **Database Module** | Coupon logic | `coupons-db.js` |
| **Checkout Page** | Customer purchase | `index.html` (needs integration) |
| **Test Script** | Automated testing | `test-coupon-system.sh` |

---

## 🧪 Testing Checklist

### ✅ Admin Dashboard Tests

```
[ ] Create Coupon
    - Go to: http://localhost:4000/admin-coupons.html
    - Tab: "Create Coupon"
    - Enter: TEST25
    - Result: ✅ Coupon created with 25% OFF

[ ] View Coupons
    - Tab: "Manage Coupons"
    - Click: "Refresh List"
    - See: TEST25 in table with Used=0, Active=✅

[ ] View Analytics
    - Tab: "Analytics"
    - See: Stat cards and coupon performance
```

### ✅ Order Viewer Tests

```
[ ] Load Orders Page
    - Go to: http://localhost:4000/view-orders.html
    - See: Stats cards at top

[ ] Filter Orders
    - Select coupon from dropdown
    - Enter search term
    - Click "Refresh"
    - See: Filtered results

[ ] Export Orders
    - Click: "Export CSV"
    - File: coupon-orders-YYYY-MM-DD.csv
    - Opens in Excel/Sheets
```

### ✅ API Tests (Using curl)

```bash
# 1. Create Coupon
curl -X POST http://localhost:4000/api/admin/create-coupon \
  -H "Content-Type: application/json" \
  -d '{"code":"TEST25"}'

# 2. Validate Coupon
curl -X POST http://localhost:4000/api/validate-coupon \
  -H "Content-Type: application/json" \
  -d '{"code":"TEST25","amount":1000}'

# 3. Apply Coupon (Record Order)
curl -X POST http://localhost:4000/api/apply-coupon \
  -H "Content-Type: application/json" \
  -d '{
    "code":"TEST25",
    "orderId":"ORD001",
    "amount":1000,
    "customerName":"John Doe",
    "customerEmail":"john@example.com"
  }'

# 4. View All Coupons
curl http://localhost:4000/api/admin/coupons

# 5. View Coupon Stats
curl http://localhost:4000/api/admin/coupon-stats/TEST25

# 6. View Analytics
curl http://localhost:4000/api/admin/analytics

# 7. Toggle Coupon
curl -X POST http://localhost:4000/api/admin/toggle-coupon \
  -H "Content-Type: application/json" \
  -d '{"code":"TEST25","active":false}'
```

---

## 🔍 How to View Order Data

### Method 1: Order Viewer Dashboard (Easiest)
```
1. Open: http://localhost:4000/view-orders.html
2. See all orders with:
   - Coupon code used
   - Customer name
   - Customer email
   - Original amount
   - Discount given (25%)
   - Final amount
   - Date & time

3. Filter by:
   - Coupon code
   - Date
   - Search term

4. Export to CSV for spreadsheet analysis
```

### Method 2: Admin Dashboard Analytics
```
1. Open: http://localhost:4000/admin-coupons.html
2. Click "Analytics" tab
3. See:
   - Total orders placed
   - Total discount given
   - Total revenue
   - Per-coupon statistics
   - Top performing coupon
```

### Method 3: API Direct (For integration)
```bash
# Get all coupons with usage count
curl http://localhost:4000/api/admin/coupons

# Get detailed stats for one coupon
curl http://localhost:4000/api/admin/coupon-stats/TEST25

# Get overall analytics
curl http://localhost:4000/api/admin/analytics
```

---

## 📊 Order Data Structure

Each order stored in system contains:

```javascript
{
  orderId: "ORD001",              // Unique order ID
  couponCode: "TEST25",           // Which coupon was used
  originalAmount: 1000,           // Amount before discount
  discountAmount: 250,            // 25% of original
  finalAmount: 750,               // Amount after discount
  customerName: "John Doe",       // Who placed order
  customerEmail: "john@email.com",// Contact email
  timestamp: "2026-06-01T10:30Z"  // When order was placed
}
```

---

## 🛠 Troubleshooting

### Server won't start?
```bash
# Check if port 4000 is in use
lsof -i :4000

# Kill any process on port 4000
kill -9 <PID>

# Try different port
PORT=5000 npm start
```

### No orders showing in viewer?
```bash
# Check if coupons exist
curl http://localhost:4000/api/admin/coupons

# Create test order
curl -X POST http://localhost:4000/api/apply-coupon \
  -H "Content-Type: application/json" \
  -d '{
    "code":"TEST25",
    "orderId":"ORD001",
    "amount":1000,
    "customerName":"Test User",
    "customerEmail":"test@example.com"
  }'

# Refresh viewer page
```

### API returning 404?
```bash
# Check if server is running
curl http://localhost:4000/api/admin/coupons

# If fails, server might be down
# Restart: PORT=4000 npm start
```

### Coupon validation says "invalid"?
```bash
# Make sure coupon is:
1. Created first: POST /api/admin/create-coupon
2. Active: Enabled in admin dashboard
3. Not expired: Check expiry date
4. Amount meets minimum: If set

# Test creation
curl -X POST http://localhost:4000/api/admin/create-coupon \
  -H "Content-Type: application/json" \
  -d '{"code":"TEST25"}'
```

---

## 📈 Analytics Metrics Explained

| Metric | What It Means | Example |
|--------|---------------|---------|
| **Total Orders** | How many customers used a coupon | 42 orders placed |
| **Total Discount** | Sum of all discounts given | ₹10,500 discounted |
| **Total Revenue** | Money earned after discounts | ₹42,000 revenue |
| **Active Coupons** | How many coupons are enabled | 5 active / 8 total |
| **Conversion Rate** | % of total orders using coupon | 15% conversion |
| **Top Coupon** | Most popular coupon code | "ANKIT25" used 15 times |

---

## 🚀 Before Going Live

### Pre-Live Checklist

```
✅ Local Testing
  [ ] Create multiple coupons
  [ ] Place test orders with coupons
  [ ] View orders in dashboard
  [ ] Export to CSV works
  [ ] Analytics show correct numbers

✅ API Testing
  [ ] All 7 endpoints respond correctly
  [ ] Validation works
  [ ] Limits are enforced
  [ ] Expiry dates work

✅ Integration Testing
  [ ] Checkout form shows coupon field
  [ ] Coupon applies discount in checkout
  [ ] Final amount matches calculation
  [ ] Order is recorded with coupon code

✅ Razorpay Testing
  [ ] Discounted amount sent to Razorpay
  [ ] Payment verification works
  [ ] Order recorded after payment

✅ Staging Deployment
  [ ] Deploy to staging URL
  [ ] Run all tests on staging
  [ ] Admin dashboard accessible
  [ ] No live data visible
```

---

## 🎯 Sample Test Workflow

### Complete Test (5 minutes)

```bash
# 1. Start server
PORT=4000 npm start

# 2. Create 3 test coupons
curl -X POST http://localhost:4000/api/admin/create-coupon \
  -H "Content-Type: application/json" \
  -d '{"code":"ANKIT25"}'

curl -X POST http://localhost:4000/api/admin/create-coupon \
  -H "Content-Type: application/json" \
  -d '{"code":"FITNESS25","usageLimit":10}'

curl -X POST http://localhost:4000/api/admin/create-coupon \
  -H "Content-Type: application/json" \
  -d '{"code":"WELCOME25","minAmount":500}'

# 3. Place 5 test orders
for i in {1..5}; do
  curl -X POST http://localhost:4000/api/apply-coupon \
    -H "Content-Type: application/json" \
    -d "{
      \"code\":\"ANKIT25\",
      \"orderId\":\"ORD$i\",
      \"amount\":$((1000 * i)),
      \"customerName\":\"Customer $i\",
      \"customerEmail\":\"cust$i@example.com\"
    }"
done

# 4. View in admin dashboard
# Open: http://localhost:4000/admin-coupons.html
# Click "Analytics" tab

# 5. View in order viewer
# Open: http://localhost:4000/view-orders.html
```

---

## 📞 Need Help?

| Issue | Solution |
|-------|----------|
| Can't find admin? | URL: `http://localhost:4000/admin-coupons.html` |
| Can't see orders? | Try `/view-orders.html` |
| API endpoints? | Check `server.js` lines 800-1100 |
| Test script? | Run: `chmod +x test-coupon-system.sh && ./test-coupon-system.sh` |
| Export orders? | Click "📥 Export CSV" button in `/view-orders.html` |

---

## ⏭️ Next Steps

1. **Test Locally** - Follow "Quick Start" above
2. **Integration** - Add coupon field to `index.html` checkout
3. **Staging Deploy** - Create staging branch and test
4. **Live Deploy** - When everything works

