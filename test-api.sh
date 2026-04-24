#!/bin/bash

# 🐄 Gaumaatri Ghee — API Testing Script
# Test all payment endpoints

BASE_URL="http://localhost:3000"

echo "🐄 Gaumaatri Ghee — Payment System Test Suite"
echo "================================================\n"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test 1: Health Check
echo "${BLUE}[TEST 1]${NC} Health Check"
echo "GET $BASE_URL/api/health"
curl -s "$BASE_URL/api/health" | jq '.' || echo "❌ Failed"
echo ""

# Test 2: Create Order (Valid)
echo "${BLUE}[TEST 2]${NC} Create Order (Valid)"
echo "POST $BASE_URL/api/create-order"
ORDER_RESPONSE=$(curl -s -X POST "$BASE_URL/api/create-order" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 100,
    "currency": "INR",
    "receipt": "test_'$(date +%s)'",
    "customer_name": "Test User",
    "customer_email": "test@example.com",
    "customer_phone": "9876543210"
  }')

echo "$ORDER_RESPONSE" | jq '.'

# Extract order_id for verification test
ORDER_ID=$(echo "$ORDER_RESPONSE" | jq -r '.order_id // empty')
echo ""

# Test 3: Create Order (Invalid Amount)
echo "${BLUE}[TEST 3]${NC} Create Order (Invalid - Zero Amount)"
echo "POST $BASE_URL/api/create-order"
curl -s -X POST "$BASE_URL/api/create-order" \
  -H "Content-Type: application/json" \
  -d '{"amount": 0}' | jq '.'
echo ""

# Test 4: Create Order (Too Small)
echo "${BLUE}[TEST 4]${NC} Create Order (Invalid - Amount < ₹1)"
echo "POST $BASE_URL/api/create-order"
curl -s -X POST "$BASE_URL/api/create-order" \
  -H "Content-Type: application/json" \
  -d '{"amount": 0.5}' | jq '.'
echo ""

# Test 5: Verify Payment (Invalid Signature)
echo "${BLUE}[TEST 5]${NC} Verify Payment (Invalid Signature)"
echo "POST $BASE_URL/api/verify-payment"
curl -s -X POST "$BASE_URL/api/verify-payment" \
  -H "Content-Type: application/json" \
  -d '{
    "razorpay_order_id": "order_invalid",
    "razorpay_payment_id": "pay_invalid",
    "razorpay_signature": "invalid_signature"
  }' | jq '.'
echo ""

# Test 6: Verify Payment (Missing Fields)
echo "${BLUE}[TEST 6]${NC} Verify Payment (Missing Fields)"
echo "POST $BASE_URL/api/verify-payment"
curl -s -X POST "$BASE_URL/api/verify-payment" \
  -H "Content-Type: application/json" \
  -d '{"razorpay_order_id": "order_123"}' | jq '.'
echo ""

echo "${GREEN}================================================${NC}"
echo "${GREEN}✅ Test suite complete!${NC}"
echo ""
echo "${BLUE}Next Steps:${NC}"
echo "1. Open browser: $BASE_URL"
echo "2. Fill order form"
echo "3. Click Pay Now"
echo "4. Use test card: 4111 1111 1111 1111"
echo "5. Check success message"
echo ""
