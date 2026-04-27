#!/bin/bash

# Test Razorpay Payment System
# Run: bash test-razorpay.sh

BASE_URL="http://localhost:3000"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🧪 Razorpay Payment System Tests${NC}\n"

# Test 1: Health Check
echo "1️⃣  Testing Health Check..."
HEALTH=$(curl -s "$BASE_URL/api/health")
if echo "$HEALTH" | grep -q '"status":"ok"'; then
    echo -e "${GREEN}✅ Health check passed${NC}\n"
else
    echo -e "${RED}❌ Health check failed${NC}"
    echo "Response: $HEALTH\n"
fi

# Test 2: Create Order (Valid)
echo "2️⃣  Testing Create Order (200ml × 1)..."
ORDER=$(curl -s -X POST "$BASE_URL/api/create-order" \
  -H "Content-Type: application/json" \
  -d '{"variantKey":"200ml","qty":1,"couponCode":null}')

if echo "$ORDER" | grep -q '"success":true'; then
    ORDER_ID=$(echo "$ORDER" | grep -o '"order_id":"[^"]*"' | cut -d'"' -f4)
    echo -e "${GREEN}✅ Order created: $ORDER_ID${NC}\n"
    echo "Full Response:"
    echo "$ORDER" | jq . 2>/dev/null || echo "$ORDER"
    echo ""
else
    echo -e "${RED}❌ Order creation failed${NC}"
    echo "Response: $ORDER\n"
fi

# Test 3: Create Order (Invalid - bad variant)
echo "3️⃣  Testing Create Order (Invalid - bad variant)..."
INVALID=$(curl -s -X POST "$BASE_URL/api/create-order" \
  -H "Content-Type: application/json" \
  -d '{"variantKey":"BAD","qty":1}')

if echo "$INVALID" | grep -q '"success":false'; then
    echo -e "${GREEN}✅ Correctly rejected invalid amount${NC}\n"
    echo "Response: $(echo "$INVALID" | jq .error)\n"
else
    echo -e "${RED}❌ Should have rejected invalid amount${NC}\n"
fi

# Test 4: Verify Payment (Mock - will fail but tests endpoint)
echo "4️⃣  Testing Verify Payment (Mock signature)..."
VERIFY=$(curl -s -X POST "$BASE_URL/api/verify-payment" \
  -H "Content-Type: application/json" \
  -d '{
    "razorpay_order_id": "order_test",
    "razorpay_payment_id": "pay_test",
    "razorpay_signature": "invalid_signature"
  }')

if echo "$VERIFY" | grep -q '"success":false'; then
    echo -e "${GREEN}✅ Correctly rejected invalid signature${NC}\n"
    echo "Response: $(echo "$VERIFY" | jq .error)\n"
else
    echo -e "${RED}❌ Should have rejected invalid signature${NC}\n"
fi

echo -e "${YELLOW}✅ All tests completed!${NC}"
echo ""
echo "📝 Next steps:"
echo "1. Open http://localhost:3000 in browser"
echo "2. Navigate to checkout"
echo "3. Click 'PROCEED TO PAY'"
echo "4. Complete payment in Razorpay checkout"
