# 🗺️ Coupon System Architecture & File Map

## Overall System Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         CUSTOMER FLOW                            │
└─────────────────────────────────────────────────────────────────┘

CUSTOMER ON WEBSITE
        ↓
   [index.html]
   (Products page)
        ↓
   Enters Coupon Code
   (e.g., "TEST25")
        ↓
   Frontend calls:
   POST /api/validate-coupon
        ↓
   Backend validates
   (active, expiry, limit, min amount)
        ↓
   Returns: discount amount & final price
        ↓
   Customer sees discount
   Clicks "Pay"
        ↓
   Creates Razorpay order
   (with discounted amount)
        ↓
   Customer pays ₹750 (instead of ₹1000)
        ↓
   Payment verified
        ↓
   POST /api/apply-coupon
   (Records order in database)
        ↓
   ADMIN CAN NOW SEE:
   ├─ /admin-coupons.html
   │  ├─ Create Coupon
   │  ├─ Manage Coupons
   │  └─ Analytics
   │
   └─ /view-orders.html
      ├─ Order listed
      ├─ Customer visible
      ├─ Discount shown
      └─ Can export


┌─────────────────────────────────────────────────────────────────┐
│                     ADMIN DASHBOARDS                             │
└─────────────────────────────────────────────────────────────────┘

ADMIN WANTS TO:

1. CREATE COUPONS
   ↓
   [admin-coupons.html]
   ↓
   Tab: "Create Coupon"
   ↓
   Enter: Code (e.g., "ANKIT25")
   ↓
   POST /api/admin/create-coupon
   ↓
   Coupon created with 25% discount
   ↓
   See: ✅ Success message

2. VIEW & MANAGE COUPONS
   ↓
   [admin-coupons.html]
   ↓
   Tab: "Manage Coupons"
   ↓
   GET /api/admin/coupons
   ↓
   See: Table of all coupons
   ├─ Code
   ├─ Discount %
   ├─ Times Used
   └─ Active Status
   ↓
   Can: Enable/Disable each

3. VIEW ANALYTICS
   ↓
   [admin-coupons.html]
   ↓
   Tab: "Analytics"
   ↓
   GET /api/admin/analytics
   ↓
   See:
   ├─ Total coupons
   ├─ Active count
   ├─ Total orders
   ├─ Total discount ₹
   ├─ Total revenue ₹
   ├─ Conversion rate %
   └─ Top coupon

4. VIEW ALL ORDERS
   ↓
   [view-orders.html]
   ↓
   GET /api/admin/coupon-stats
   (all coupons)
   ↓
   See: Table with:
   ├─ Order ID
   ├─ Coupon Code
   ├─ Customer Name
   ├─ Customer Email
   ├─ Original Amount
   ├─ Discount (25%)
   ├─ Final Amount
   └─ Date & Time
   ↓
   Can: Filter, Search, Export CSV


┌─────────────────────────────────────────────────────────────────┐
│                      FILE STRUCTURE                              │
└─────────────────────────────────────────────────────────────────┘

/Users/shubhamkumar/Desktop/RAZOR/
│
├── 🖥️  FRONTEND (Customer Facing)
│   └── index.html ⏳ (Needs coupon field integration)
│
├── 📊 ADMIN DASHBOARDS (Fully Complete)
│   ├── admin-coupons.html ✅
│   │   ├─ Create Coupon Tab
│   │   ├─ Manage Coupons Tab
│   │   └─ Analytics Tab
│   │
│   └── view-orders.html ✅
│       ├─ Stats Cards
│       ├─ Orders Table
│       ├─ Search/Filter
│       └─ Export CSV
│
├── 🔧 BACKEND (API Endpoints)
│   └── server.js ✅
│       ├─ Lines 800-850: Validation endpoint
│       ├─ Lines 850-900: Apply coupon endpoint
│       ├─ Lines 900-950: List all coupons
│       ├─ Lines 950-1000: Create coupon
│       ├─ Lines 1000-1050: Toggle status
│       ├─ Lines 1050-1100: Per-coupon stats
│       └─ Lines 1100-1150: Overall analytics
│
├── 💾 DATABASE (In-Memory for Testing)
│   └── coupons-db.js ✅
│       ├─ validateCoupon()
│       ├─ createCoupon()
│       ├─ toggleCouponStatus()
│       ├─ getCouponStats()
│       ├─ getAllCoupons()
│       └─ recordOrderWithCoupon()
│
├── 🧪 TESTING
│   ├── test-coupon-system.sh ✅
│   │   └─ 30+ automated tests
│   │
│   ├── TESTING_GUIDE.md ✅
│   │   └─ Quick reference
│   │
│   ├── STAGING_SETUP.md ✅
│   │   └─ How to setup local testing
│   │
│   └── COUPON_TESTING_COMPLETE.md ✅
│       └─ Full documentation
│
└── 📚 DOCUMENTATION
    └── COUPON_SYSTEM_READY.md ✅
        └─ Quick summary


┌─────────────────────────────────────────────────────────────────┐
│                    API ENDPOINT MAP                              │
└─────────────────────────────────────────────────────────────────┘

POST /api/validate-coupon
├─ Input: { code, amount }
├─ Process: Check active, expiry, limit, min amount
├─ Output: { valid, discount%, discountAmount, finalAmount }
└─ Location: server.js line ~800

POST /api/apply-coupon
├─ Input: { code, orderId, amount, name, email }
├─ Process: Record order with coupon
├─ Output: { success, message }
└─ Location: server.js line ~850

GET /api/admin/coupons
├─ Input: None
├─ Process: List all coupons
├─ Output: { coupons: [{ code, discount, used, active, ... }] }
└─ Location: server.js line ~900

POST /api/admin/create-coupon
├─ Input: { code, expiryDate?, usageLimit?, minAmount? }
├─ Process: Create new coupon (25% auto)
├─ Output: { success, coupon }
└─ Location: server.js line ~950

POST /api/admin/toggle-coupon
├─ Input: { code, active }
├─ Process: Enable/disable coupon
├─ Output: { success, message }
└─ Location: server.js line ~1000

GET /api/admin/coupon-stats/:code
├─ Input: Coupon code in URL
├─ Process: Get stats for one coupon
├─ Output: { timesUsed, totalDiscount, totalRevenue, recentUsage[] }
└─ Location: server.js line ~1050

GET /api/admin/analytics
├─ Input: None
├─ Process: Aggregate all stats
├─ Output: { totalOrders, totalDiscount, revenue, topCoupon, ... }
└─ Location: server.js line ~1100


┌─────────────────────────────────────────────────────────────────┐
│                  DATA STORAGE (In-Memory)                        │
└─────────────────────────────────────────────────────────────────┘

Memory Structure:

┌─ couponsDb (Map)
│  ├─ "ANKIT25" → { code, discount: 25, used: 5, active: true, ... }
│  ├─ "FITNESS25" → { code, discount: 25, used: 12, active: true, ... }
│  └─ "WELCOME25" → { code, discount: 25, used: 3, active: true, ... }
│
└─ couponUsageDb (Array)
   ├─ { orderId: "ORD001", code: "ANKIT25", amount: 1000, discount: 250, ... }
   ├─ { orderId: "ORD002", code: "ANKIT25", amount: 1500, discount: 375, ... }
   └─ { orderId: "ORD003", code: "FITNESS25", amount: 2000, discount: 500, ... }

⚠️ Note: Data lost on server restart
💾 Future: Migrate to Google Sheets


┌─────────────────────────────────────────────────────────────────┐
│                 USER FLOWS (VISUAL)                              │
└─────────────────────────────────────────────────────────────────┘

FLOW 1: ADMIN CREATES COUPON
┌──────────────┐
│  Open Admin  │
│  Dashboard   │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Click Tab:  │
│  "Create"    │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Enter Code: │
│  "TEST25"    │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   Click      │
│  "Create"    │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ POST API     │
│  Create      │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Coupon in DB │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  ✅ Success  │
│  Message     │
└──────────────┘


FLOW 2: CUSTOMER USES COUPON
┌──────────────┐
│   Customer   │
│   on site    │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Add to      │
│  cart        │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Enter       │
│  coupon code │
│  "TEST25"    │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  POST API    │
│  Validate    │
└──────┬───────┘
       │
       ▼
┌──────────────────────┐
│  Check:              │
│  - Active?           │
│  - Expired?          │
│  - Usage limit?      │
│  - Min amount?       │
└──────┬───────────────┘
       │
       ▼
┌──────────────┐
│ Valid ✅     │
│ Discount: ₹250
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Show final  │
│  amount      │
│  ₹750        │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Customer    │
│  pays ₹750   │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  POST API    │
│  Apply       │
│  Coupon      │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Order in DB │
│  with coupon │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Visible in  │
│  /view-      │
│  orders.html │
└──────────────┘


FLOW 3: ADMIN VIEWS ORDERS
┌──────────────┐
│  Open View   │
│  Orders      │
│  Dashboard   │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Load:       │
│  GET API     │
│  analytics   │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Display:    │
│  - Stats     │
│  - Orders    │
│  - Filter    │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Admin can:  │
│  - Filter    │
│  - Search    │
│  - Export    │
└──────────────┘


┌─────────────────────────────────────────────────────────────────┐
│                  TESTING FLOW                                    │
└─────────────────────────────────────────────────────────────────┘

Run Automated Tests:
┌─────────────────────────────────┐
│ $ ./test-coupon-system.sh       │
└──────────────┬──────────────────┘
               │
               ▼
       ┌───────────────────┐
       │  Create 4 coupons │
       └───────────┬───────┘
                   │
                   ▼
       ┌───────────────────────┐
       │  Test validation API  │
       │  (valid + invalid)    │
       └───────────┬───────────┘
                   │
                   ▼
       ┌───────────────────────┐
       │  Apply 4 test orders  │
       └───────────┬───────────┘
                   │
                   ▼
       ┌───────────────────────┐
       │  Check usage counts   │
       └───────────┬───────────┘
                   │
                   ▼
       ┌───────────────────────┐
       │  Test disable/enable  │
       └───────────┬───────────┘
                   │
                   ▼
       ┌───────────────────────┐
       │  Check analytics      │
       └───────────┬───────────┘
                   │
                   ▼
       ┌───────────────────────┐
       │  Report: 30 tests ✅  │
       │  PASSED               │
       └───────────────────────┘


┌─────────────────────────────────────────────────────────────────┐
│                    QUICK ACCESS MAP                              │
└─────────────────────────────────────────────────────────────────┘

WHAT DO YOU WANT TO DO?  →  WHERE TO GO?

Create/Manage Coupons     →  http://localhost:4000/admin-coupons.html
View Customer Orders      →  http://localhost:4000/view-orders.html
Check API Code            →  server.js, lines 800-1150
Read Quick Guide          →  TESTING_GUIDE.md
Read Full Guide           →  COUPON_TESTING_COMPLETE.md
Setup Staging             →  STAGING_SETUP.md
Run All Tests             →  ./test-coupon-system.sh
Test Single API           →  curl commands in TESTING_GUIDE.md

```

---

## Next Steps

1. **Start Server**: `PORT=4000 npm start`
2. **Open Dashboard**: `http://localhost:4000/admin-coupons.html`
3. **Create Coupon**: Use admin dashboard
4. **View Orders**: `http://localhost:4000/view-orders.html`
5. **Run Tests**: `./test-coupon-system.sh`
6. **Read Docs**: Pick a guide from file list above

