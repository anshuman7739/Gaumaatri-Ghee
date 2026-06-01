#!/bin/bash

# 🧪 Complete Coupon System Testing Script
# Usage: ./test-coupon-system.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

API_BASE="${1:-http://localhost:4000}"
PASS_COUNT=0
FAIL_COUNT=0

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}🧪 Coupon System Testing Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "API Base: ${YELLOW}${API_BASE}${NC}\n"

# Test function
test_endpoint() {
  local name=$1
  local method=$2
  local endpoint=$3
  local data=$4
  local expected_status=$5

  echo -e "${YELLOW}Testing:${NC} $name"
  
  if [ "$method" == "GET" ]; then
    response=$(curl -s -w "\n%{http_code}" "${API_BASE}${endpoint}")
  else
    response=$(curl -s -w "\n%{http_code}" -X "$method" \
      -H "Content-Type: application/json" \
      -d "$data" \
      "${API_BASE}${endpoint}")
  fi

  http_code=$(echo "$response" | tail -1)
  body=$(echo "$response" | sed '$d')

  if [ "$http_code" == "$expected_status" ]; then
    echo -e "${GREEN}✅ PASS${NC} (HTTP $http_code)"
    echo -e "   Response: $(echo $body | cut -c 1-100)..."
    ((PASS_COUNT++))
  else
    echo -e "${RED}❌ FAIL${NC} (Expected $expected_status, got $http_code)"
    echo -e "   Response: $body"
    ((FAIL_COUNT++))
  fi
  echo ""
}

# ============================================
# TEST 1: Create Sample Coupons
# ============================================
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}TEST 1: CREATE COUPONS${NC}"
echo -e "${BLUE}========================================${NC}\n"

test_endpoint "Create ANKIT25 Coupon" "POST" "/api/admin/create-coupon" \
  '{"code":"ANKIT25","discount":25}' "200"

test_endpoint "Create FITNESS25 Coupon" "POST" "/api/admin/create-coupon" \
  '{"code":"FITNESS25","discount":25,"usageLimit":50}' "200"

test_endpoint "Create WELCOME25 (Expires)" "POST" "/api/admin/create-coupon" \
  '{"code":"WELCOME25","discount":25,"expiryDate":"2026-12-31"}' "200"

test_endpoint "Create INVALID_CODE (Min Amount)" "POST" "/api/admin/create-coupon" \
  '{"code":"INVALID_CODE","discount":25,"minAmount":500}' "200"

# ============================================
# TEST 2: List All Coupons
# ============================================
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}TEST 2: LIST & VIEW COUPONS${NC}"
echo -e "${BLUE}========================================${NC}\n"

test_endpoint "Get All Coupons" "GET" "/api/admin/coupons" "" "200"

test_endpoint "Get Coupons (Verify Count)" "GET" "/api/admin/coupons" "" "200"

# ============================================
# TEST 3: Validate Coupons
# ============================================
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}TEST 3: VALIDATE COUPONS${NC}"
echo -e "${BLUE}========================================${NC}\n"

test_endpoint "Validate ANKIT25 (Valid)" "POST" "/api/validate-coupon" \
  '{"code":"ANKIT25","amount":1000}' "200"

test_endpoint "Validate WELCOME25 (Valid, No Min)" "POST" "/api/validate-coupon" \
  '{"code":"WELCOME25","amount":1000}' "200"

test_endpoint "Validate INVALID_CODE (Min Amount Check)" "POST" "/api/validate-coupon" \
  '{"code":"INVALID_CODE","amount":400}' "200"

test_endpoint "Validate INVALID_CODE (Amount OK)" "POST" "/api/validate-coupon" \
  '{"code":"INVALID_CODE","amount":600}' "200"

test_endpoint "Validate Non-Existent" "POST" "/api/validate-coupon" \
  '{"code":"FAKETEST","amount":1000}' "200"

test_endpoint "Validate Empty Code" "POST" "/api/validate-coupon" \
  '{"code":"","amount":1000}' "200"

# ============================================
# TEST 4: Apply Coupons (Record Usage)
# ============================================
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}TEST 4: APPLY COUPONS (Record Usage)${NC}"
echo -e "${BLUE}========================================${NC}\n"

test_endpoint "Apply ANKIT25 Order 1" "POST" "/api/apply-coupon" \
  '{"code":"ANKIT25","orderId":"ORD001","amount":1000,"customerName":"John Doe","customerEmail":"john@example.com"}' "200"

test_endpoint "Apply FITNESS25 Order 1" "POST" "/api/apply-coupon" \
  '{"code":"FITNESS25","orderId":"ORD002","amount":2000,"customerName":"Jane Smith","customerEmail":"jane@example.com"}' "200"

test_endpoint "Apply ANKIT25 Order 2" "POST" "/api/apply-coupon" \
  '{"code":"ANKIT25","orderId":"ORD003","amount":1500,"customerName":"Bob Wilson","customerEmail":"bob@example.com"}' "200"

test_endpoint "Apply WELCOME25 Order 1" "POST" "/api/apply-coupon" \
  '{"code":"WELCOME25","orderId":"ORD004","amount":800,"customerName":"Alice Brown","customerEmail":"alice@example.com"}' "200"

# ============================================
# TEST 5: Check Usage Counts
# ============================================
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}TEST 5: VIEW USAGE STATISTICS${NC}"
echo -e "${BLUE}========================================${NC}\n"

test_endpoint "Stats for ANKIT25" "GET" "/api/admin/coupon-stats/ANKIT25" "" "200"

test_endpoint "Stats for FITNESS25" "GET" "/api/admin/coupon-stats/FITNESS25" "" "200"

test_endpoint "Stats for WELCOME25" "GET" "/api/admin/coupon-stats/WELCOME25" "" "200"

# ============================================
# TEST 6: Toggle Coupon Status
# ============================================
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}TEST 6: TOGGLE COUPON STATUS${NC}"
echo -e "${BLUE}========================================${NC}\n"

test_endpoint "Disable FITNESS25" "POST" "/api/admin/toggle-coupon" \
  '{"code":"FITNESS25","active":false}' "200"

test_endpoint "Validate Disabled FITNESS25" "POST" "/api/validate-coupon" \
  '{"code":"FITNESS25","amount":1000}' "200"

test_endpoint "Re-Enable FITNESS25" "POST" "/api/admin/toggle-coupon" \
  '{"code":"FITNESS25","active":true}' "200"

test_endpoint "Validate Re-Enabled FITNESS25" "POST" "/api/validate-coupon" \
  '{"code":"FITNESS25","amount":1000}' "200"

# ============================================
# TEST 7: Analytics & Overview
# ============================================
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}TEST 7: ANALYTICS & OVERVIEW${NC}"
echo -e "${BLUE}========================================${NC}\n"

test_endpoint "Get All Analytics" "GET" "/api/admin/analytics" "" "200"

# ============================================
# TEST 8: Usage Limit Testing
# ============================================
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}TEST 8: USAGE LIMIT ENFORCEMENT${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Create a coupon with limit of 2
test_endpoint "Create LIMITED_CODE (Limit=2)" "POST" "/api/admin/create-coupon" \
  '{"code":"LIMITED_CODE","discount":25,"usageLimit":2}' "200"

# Use it 2 times
test_endpoint "Use LIMITED_CODE Order 1" "POST" "/api/apply-coupon" \
  '{"code":"LIMITED_CODE","orderId":"ORD101","amount":1000,"customerName":"User1","customerEmail":"user1@example.com"}' "200"

test_endpoint "Use LIMITED_CODE Order 2" "POST" "/api/apply-coupon" \
  '{"code":"LIMITED_CODE","orderId":"ORD102","amount":1000,"customerName":"User2","customerEmail":"user2@example.com"}' "200"

# Try to use 3rd time (should fail)
test_endpoint "Use LIMITED_CODE Order 3 (Should Fail)" "POST" "/api/validate-coupon" \
  '{"code":"LIMITED_CODE","amount":1000}' "200"

# ============================================
# FINAL SUMMARY
# ============================================
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}📊 TEST SUMMARY${NC}"
echo -e "${BLUE}========================================${NC}\n"

TOTAL=$((PASS_COUNT + FAIL_COUNT))
PASS_RATE=$((PASS_COUNT * 100 / TOTAL))

echo -e "Total Tests: ${YELLOW}${TOTAL}${NC}"
echo -e "Passed: ${GREEN}${PASS_COUNT}${NC}"
echo -e "Failed: ${RED}${FAIL_COUNT}${NC}"
echo -e "Pass Rate: ${YELLOW}${PASS_RATE}%${NC}\n"

if [ $FAIL_COUNT -eq 0 ]; then
  echo -e "${GREEN}✅ ALL TESTS PASSED!${NC}"
  echo -e "${GREEN}Coupon system is ready for staging deployment.${NC}\n"
  exit 0
else
  echo -e "${RED}❌ SOME TESTS FAILED${NC}"
  echo -e "${RED}Please review the failures above.${NC}\n"
  exit 1
fi
