# Influencer Coupon & Analytics Dashboard - TODO

## Phase 1: Foundation
- [ ] Create influencer/coupon data engine module with persistent JSON storage
- [ ] Define schemas for Influencer, Coupon, Commission records, Referral tracking
- [ ] Add utility methods: create/update/delete/disable influencer and coupon
- [ ] Add coupon validation engine (fixed/percent, expiry, max uses, min cart, max discount, product applicability)

## Phase 2: Backend APIs
- [ ] Integrate influencer/coupon engine into server.js
- [ ] Add admin-protected APIs for influencer CRUD
- [ ] Add admin-protected APIs for coupon CRUD and toggles
- [ ] Add live coupon validation endpoint for checkout
- [ ] Extend create-order and verify-payment to store influencer commission data
- [ ] Add analytics APIs (cards + chart aggregates + leaderboard)
- [ ] Add referral tracking endpoint (?ref=CODE and click tracking)
- [ ] Add commission payout endpoint (mark paid with transaction id/notes/date)
- [ ] Add filtered influencer-orders endpoint

## Phase 3: Dashboard UI
- [ ] Build premium admin-coupons.html from scratch (glassmorphism, responsive, dark/light)
- [ ] Add summary cards, filters, quick actions
- [ ] Add influencer management table with actions
- [ ] Add charts (monthly revenue/orders, coupon usage, influencer distribution)
- [ ] Add influencer detail panel/section
- [ ] Add export actions (CSV/Excel-friendly CSV, PDF placeholder flow)

## Phase 4: Checkout/Referral UX
- [ ] Add referral auto-apply logic on storefront from ?ref=COUPON
- [ ] Add instant coupon validation feedback (success/error, saved amount, final price)
- [ ] Ensure only one coupon per order and server-side validation parity

## Phase 5: Testing & Local Run
- [ ] Run API smoke tests for influencer/coupon lifecycle
- [ ] Run checkout tests for valid/invalid coupons
- [ ] Verify dashboard rendering and interactions locally
- [ ] Share local URLs and commands for your testing
