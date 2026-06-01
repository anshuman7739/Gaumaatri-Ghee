# 🎯 Complete Coupon System - Testing & Verification Guide

**Status:** ✅ Ready for Staging Testing  
**Date:** June 1, 2026  
**System:** Gaumaatri Ghee - Coupon & Referral Tracking  

---

## 📋 What You Now Have

### ✅ Complete Backend System (Already Added to server.js)
- 7 API endpoints for coupon management
- In-memory database with sample coupons
- Usage tracking & analytics
- Coupon validation with limits & expiry

### ✅ 4 New Admin Tools

| Tool | File | Purpose |
|------|------|---------|
| **Admin Dashboard** | `admin-coupons.html` | Create & manage coupons, view analytics |
| **Order Viewer** | `view-orders.html` | See all customer orders with coupon codes |
| **Staging Guide** | `STAGING_SETUP.md` | How to set up local/staging testing |
| **Testing Guide** | `TESTING_GUIDE.md` | Quick reference for testing |

### ✅ 1 Automated Test Script
| Tool | File | Purpose |
|------|------|---------|
| **Test Suite** | `test-coupon-system.sh` | Runs 30+ automated tests on all endpoints |

---

## 🚀 How to Test Now

### Step 1: Start Local Server (30 seconds)

```bash
# Navigate to project
cd /Users/shubhamkumar/Desktop/RAZOR

# Start server on port 4000
PORT=4000 npm start
```

**Expected Output:**
```
Server running on http://localhost:4000
```

---

### Step 2: Access Admin Dashboard (30 seconds)

Open in browser:
```
http://localhost:4000/admin-coupons.html
```

**What you'll see:**
- Three tabs: Create Coupon, Manage Coupons, Analytics
- 4 pre-created sample coupons visible
- Golden Gaumaatri branding

---

### Step 3: Create a Test Coupon (1 minute)

1. Click "➕ Create Coupon" tab
2. Enter code: `TEST25`
3. Leave other fields empty
4. Click "Create Coupon with 25% Discount"
5. See: ✅ **"Coupon TEST25 created with 25% discount!"**

---

### Step 4: View Orders (1 minute)

Open in browser:
```
http://localhost:4000/view-orders.html
```

**What you'll see:**
- Dashboard with stats cards at top
- Empty orders table (no orders yet - that's normal)
- Filter & search options
- Export to CSV button

---

### Step 5: Test API Endpoints (2 minutes)

In terminal, run one of these commands:

```bash
# ✅ Validate a coupon
curl -X POST http://localhost:4000/api/validate-coupon \
  -H "Content-Type: application/json" \
  -d '{"code":"TEST25","amount":1000}'

# ✅ Record an order with coupon
curl -X POST http://localhost:4000/api/apply-coupon \
  -H "Content-Type: application/json" \
  -d '{
    "code":"TEST25",
    "orderId":"ORD001",
    "amount":1000,
    "customerName":"John Doe",
    "customerEmail":"john@example.com"
  }'

# ✅ View all coupons
curl http://localhost:4000/api/admin/coupons

# ✅ View analytics
curl http://localhost:4000/api/admin/analytics
```

---

### Step 6: Refresh and See Orders Update (1 minute)

1. Go back to: `http://localhost:4000/view-orders.html`
2. Click "🔄 Refresh" button
3. See: Order appears in table with your customer name!

**You'll see:**
| Order ID | Coupon | Customer | Original | Discount | Final |
|----------|--------|----------|----------|----------|-------|
| ORD001 | TEST25 | John Doe | ₹1000 | ₹250 | ₹750 |

---

### Step 7: Run Automated Tests (3 minutes)

In terminal:

```bash
cd /Users/shubhamkumar/Desktop/RAZOR

# Run all tests
./test-coupon-system.sh

# Expected output:
# ✅ ALL TESTS PASSED!
# 30+ tests validating all functionality
```

---

## 🎯 What Each Tool Does

### 1️⃣ Admin Dashboard (`admin-coupons.html`)

**Create Coupon Tab:**
- Enter coupon code (auto-25% OFF)
- Set optional: expiry date, usage limit, minimum amount
- See: Sample influencer coupons (ANKIT25, FITNESS25, etc.)

**Manage Coupons Tab:**
- See all coupons in a table
- Show: Code, discount %, times used, active status
- Actions: Enable/Disable toggle, view stats

**Analytics Tab:**
- 6 stat cards: Total coupons, active, orders, discount, revenue, conversion
- Table: Top performing coupon
- Table: All coupons performance

---

### 2️⃣ Order Viewer (`view-orders.html`)

**Stats Cards at Top:**
- Total Orders (with coupons)
- Total Discount Given (₹)
- Total Revenue (₹)
- Active Coupons
- Conversion Rate (%)

**Orders Table:**
- Order ID, Coupon Code, Customer Name, Email
- Original Amount, Discount (25%), Final Amount
- Date & Time

**Filter & Search:**
- Filter by coupon code
- Filter by date
- Search by name, email, coupon, order ID
- Pagination (15 orders per page)

**Export:**
- Download CSV file for Excel/Sheets analysis
- Includes all columns in spreadsheet format

---

### 3️⃣ API Endpoints (in `server.js`)

```
POST   /api/validate-coupon          → Check if coupon is valid
POST   /api/apply-coupon             → Record order with coupon
GET    /api/admin/coupons            → List all coupons
POST   /api/admin/create-coupon      → Create new coupon
POST   /api/admin/toggle-coupon      → Enable/disable coupon
GET    /api/admin/coupon-stats/:code → Stats for one coupon
GET    /api/admin/analytics          → Overall analytics
```

All support 25% fixed discount on all coupons.

---

## 📊 Order Data You Can View

When customers use coupons, system tracks:

```
✓ Order ID (unique identifier)
✓ Coupon Code Used (which discount)
✓ Customer Name (who purchased)
✓ Customer Email (contact)
✓ Original Amount (before discount)
✓ Discount Amount (25% of original)
✓ Final Amount (what they paid)
✓ Date & Time (when ordered)
✓ Status (pending/completed)
```

**Example Order:**
```
Order: ORD001
Coupon: TEST25
Customer: John Doe (john@example.com)
Original: ₹1000
Discount: ₹250 (25% OFF)
Final: ₹750 (what paid)
Date: June 1, 2026, 3:30 PM
```

---

## 🔧 File Locations

| File | What It Does | Status |
|------|--------------|--------|
| `server.js` | Backend API (lines 800-1100) | ✅ Complete |
| `admin-coupons.html` | Admin management UI | ✅ Complete |
| `view-orders.html` | Order tracking dashboard | ✅ Complete |
| `coupons-db.js` | Database module (future) | ✅ Complete |
| `index.html` | Customer checkout page | ⏳ Needs integration |
| `test-coupon-system.sh` | Automated test suite | ✅ Complete |
| `STAGING_SETUP.md` | Setup guide | ✅ Complete |
| `TESTING_GUIDE.md` | Quick reference | ✅ Complete |

---

## ✅ Testing Checklist

### Quick Test (5 minutes)

```
[ ] Start server: PORT=4000 npm start
[ ] Open admin: http://localhost:4000/admin-coupons.html
[ ] Create coupon: TEST25
[ ] See success message
[ ] Click "Manage Coupons" tab
[ ] See TEST25 in list with Used=0
[ ] Click "Analytics" tab
[ ] See stat cards
```

### API Test (5 minutes)

```
[ ] Validate coupon (curl command)
[ ] See response with discount amount
[ ] Apply coupon (curl command)
[ ] See success response
[ ] View all coupons (curl)
[ ] See TEST25 in list
[ ] View analytics (curl)
[ ] See numbers updated
```

### Order Viewer Test (3 minutes)

```
[ ] Open: http://localhost:4000/view-orders.html
[ ] See stat cards at top
[ ] Click "Refresh"
[ ] See orders table populated
[ ] Filter by coupon code
[ ] Search by customer name
[ ] Click "Export CSV"
[ ] File downloads successfully
```

### Automated Tests (3 minutes)

```
[ ] Run: ./test-coupon-system.sh
[ ] See 30+ tests running
[ ] See: ✅ ALL TESTS PASSED!
[ ] All endpoints verified working
```

---

## 📈 Example Test Scenario

### Scenario: Testing with Real Workflow

```bash
# 1. Create 3 coupons
curl -X POST http://localhost:4000/api/admin/create-coupon \
  -d '{"code":"ANKIT25"}' ...

curl -X POST http://localhost:4000/api/admin/create-coupon \
  -d '{"code":"FITNESS25","usageLimit":50}' ...

curl -X POST http://localhost:4000/api/admin/create-coupon \
  -d '{"code":"WELCOME25","minAmount":500}' ...

# 2. Place orders using coupons
for customer in John Jane Bob Alice; do
  curl -X POST http://localhost:4000/api/apply-coupon \
    -d "{\"code\":\"ANKIT25\",...,\"customerName\":\"$customer\"}" ...
done

# 3. View results
# Admin Dashboard → Analytics: See 4 orders, ₹250 discount per order
# Order Viewer: See all 4 orders with customer names

# 4. Export data
# Order Viewer → "Export CSV" → Open in Excel
```

---

## 🎓 Learning Path

### For Admin/Manager:
1. Read: `TESTING_GUIDE.md` (15 min)
2. Open: `admin-coupons.html` (5 min)
3. Create a test coupon (2 min)
4. View orders in `view-orders.html` (3 min)
5. **Done!** You know how to manage coupons

### For Developer:
1. Read: `STAGING_SETUP.md` (15 min)
2. Review: `server.js` lines 800-1100 (15 min)
3. Run: `test-coupon-system.sh` (5 min)
4. Test APIs manually (10 min)
5. Review: `coupons-db.js` (10 min)
6. **Ready to integrate** with checkout

### For Testing:
1. Read: `TESTING_GUIDE.md` (10 min)
2. Follow: Testing Checklist (10 min)
3. Run: Automated tests (5 min)
4. Test manually: Admin + Order Viewer (10 min)
5. **Everything verified!**

---

## 🚫 What's NOT Live Yet

⏳ **Still TODO:**
- Checkout form integration (need to add coupon field to `index.html`)
- Razorpay integration (link discount to payment)
- Google Sheets persistence (currently in-memory)
- Production deployment (test on staging first)

✅ **Ready Now:**
- Admin dashboard (fully functional)
- Order viewer (fully functional)
- All APIs (fully functional)
- Test suite (ready to run)

---

## 🚀 Next Steps

### Today (Testing):
1. ✅ Run through all tests above
2. ✅ Verify everything works locally
3. ✅ Check all dashboards are accessible

### This Week (Integration):
1. Add coupon field to checkout (`index.html`)
2. Link with Razorpay payment system
3. Test end-to-end workflow

### Next Week (Deployment):
1. Create staging branch in Git
2. Deploy to staging URL
3. Full staging testing
4. Production deployment

---

## 💡 Pro Tips

### View All Orders Quickly:
```bash
# See top 5 orders
curl http://localhost:4000/api/admin/analytics | grep -A 5 "totalOrders"
```

### Test Multiple Coupons Fast:
```bash
# Create 5 coupons in loop
for i in {1..5}; do
  curl -X POST http://localhost:4000/api/admin/create-coupon \
    -d "{\"code\":\"PROMO$i\"}"
done
```

### See Real-Time Stats:
```bash
# Watch analytics update (every 2 sec)
watch -n 2 'curl -s http://localhost:4000/api/admin/analytics | jq'
```

---

## 📞 Support

### If Server Won't Start:
```bash
# Check if port 4000 is busy
lsof -i :4000

# Kill and restart
kill -9 <PID>
PORT=4000 npm start
```

### If Orders Don't Show:
```bash
# Make sure coupon exists
curl http://localhost:4000/api/admin/coupons

# Create a test coupon
curl -X POST http://localhost:4000/api/admin/create-coupon \
  -d '{"code":"TEST25"}'

# Record test order
curl -X POST http://localhost:4000/api/apply-coupon \
  -d '{"code":"TEST25",...}'
```

### If Tests Fail:
```bash
# Run with verbose output
bash -x test-coupon-system.sh 2>&1 | tee test-output.log

# Check logs for specific failures
grep "FAIL" test-output.log
```

---

## 🎯 Success Criteria

You'll know it's working when:

✅ Admin dashboard loads without errors  
✅ Can create new coupons with "✅ Success" message  
✅ Order viewer shows orders that were created  
✅ Analytics show correct totals  
✅ CSV export downloads a file  
✅ API endpoints respond in curl  
✅ Test script passes all 30+ tests  

---

## 📊 System Architecture

```
┌─────────────────────────────────────────┐
│         Customer (index.html)           │
│      (Checkout with coupon field)       │
└────────────┬────────────────────────────┘
             │ Uses coupon code
             ▼
┌─────────────────────────────────────────┐
│         API Endpoints (server.js)       │
│  validate | apply | create | toggle     │
└────────────┬────────────────────────────┘
             │ Reads/writes to
             ▼
┌─────────────────────────────────────────┐
│    In-Memory Database (For Testing)     │
│  couponsDb (Map) | couponUsageDb (Array)│
└────────────┬────────────────────────────┘
             │ Viewed via
             ▼
┌─────────────────────────────────────────┐
│    Admin Tools (HTML Dashboards)        │
│   admin-coupons.html | view-orders.html │
└─────────────────────────────────────────┘

Future: Replace In-Memory DB with Google Sheets
```

---

## 🎉 You're Ready!

Everything is set up and ready to test. Start with the **Step-by-Step Guide** above.

**Questions?** Check the relevant guide:
- **How do I test?** → `TESTING_GUIDE.md`
- **How do I set up staging?** → `STAGING_SETUP.md`
- **How do APIs work?** → `server.js` comments
- **Quick start?** → This document, "How to Test Now"

