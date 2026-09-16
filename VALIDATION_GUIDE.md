# Influencer Coupon System — How to See & Validate
# Influencer Coupon System — How to See & Validate

The database is **`backend/influencer-engine.js`** → stored in **`influencers-data.json`** (gitignored). Google Sheets is only a **mirror**.

## 1. Run the server
```bash
cd /Users/shubhamkumar/Desktop/RAZOR
npm start        # or: node server.js
```
On boot it seeds the 4 default coupons (ANKIT25, FITNESS25, MOM25, WELCOME25) if the DB is empty.

Ensure `.env` has an `ADMIN_TOKEN` (I added `ADMIN_TOKEN=local_dev_admin_9f47d2` for local dev — **change it / set a strong one in production**).

## 2. Open the Admin Dashboard
```
http://localhost:3000/admin-coupons.html
```
Enter the admin token from `.env`. From here you can:
- **Overview** — totals, revenue, discounts, pending commission
- **Coupons** — create/edit/activate/deactivate, set %, min order, max discount, expiry, usage limit, assign influencer
- **Influencers** — create/edit, set commission %, and copy each influencer's dashboard link + token
- **Usage** — filter by coupon / influencer / customer / order / date / status; shows amount, discount, commission; mark commission **Paid**, or **Cancel/Refund** an order
- **Sheets Sync** — see the outbox (which Google Sheet rows are pending/success/failed) and force a retry

## 3. Influencer Dashboard (per influencer)
Copy the link from the admin → Influencers tab. It looks like:
```
http://localhost:3000/influencer-dashboard.html?token=<accessToken>
```
Shows coupon uses, orders, sales, commission, and Pending / Approved / Paid earnings.

## 4. Public coupon validation (storefront)
The checkout `applyCoupon()` now calls:
```
POST /api/validate-coupon
{ "couponCode":"RIYA10", "cartValue":789, "productKey":"500ml" }
```
Returns the exact discount % and amount resolved **server-side**.

## 5. Quick API smoke test
Use `ADMIN_TOKEN` from `.env`:
```bash
T=local_dev_admin_9f47d2
# auth is enforced
curl -s localhost:3000/api/admin/analytics -H "X-Admin-Token: $T"
# create influencer
curl -s -X POST localhost:3000/api/admin/influencers -H "X-Admin-Token: $T" -H 'Content-Type: application/json' \
  -d '{"influencerName":"Riya Sharma","couponCode":"RIYA10","commissionPercent":10}'
# create its coupon
curl -s -X POST localhost:3000/api/admin/coupons -H "X-Admin-Token: $T" -H 'Content-Type: application/json' \
  -d '{"code":"RIYA10","discountType":"percentage","discountValue":10,"influencerId":"<INF_ID>","influencerName":"Riya Sharma"}'
# place a COD order with the coupon (no Razorpay needed)
curl -s -X POST localhost:3000/api/cod-order -H 'Content-Type: application/json' \
  -d '{"orderId":"ORD1","variantKey":"500ml","qty":1,"couponCode":"RIYA10","customer":{"name":"Amit","email":"a@x.com","phone":"9","address":"Mumbai, MH - 400001"}}'
# influencer dashboard (use the accessToken returned when creating the influencer)
curl -s "localhost:3000/api/influencer/dashboard?token=<ACCESS_TOKEN>"
# usage + totals
curl -s "localhost:3000/api/admin/usage" -H "X-Admin-Token: $T"
```

## How security & the "only after success" rules work
- **Coupon counts as used only on success** — usage is recorded inside `/api/cod-order` and `/api/verify-payment` *after* order/payment is confirmed, via `engine.recordInfluencerOrder()`.
- **No frontend trust** — discount %, commission %, and influencer are always recomputed from the DB in the engine (`validateCoupon` + `resolveInfluencerForCoupon`).
- **No duplicates** — `recordInfluencerOrder` is idempotent on `orderId`.
- **Cancel/refund** — `engine.voidInfluencerOrder()` reverses coupon usage, sales, and commission for Cancelled/Refunded orders.
- **Sheets failure never blocks orders** — an "outbox" (`pendingSync`) queues rows; Retry + backoff re-syncs later.

> Note: `/api/create-order` (UPI flow) calls Razorpay, which currently returns "Authentication failed" for the live key in `.env`. That is a Razorpay credential issue, not the coupon code. Use the COD flow or valid test keys to exercise UPI.