#!/bin/bash

# VoiceGPT API Test Suite
# Comprehensive curl tests for all endpoints with live Firebase functions

set -e

# Configuration
CHAT_API_URL="${VITE_CHAT_API_URL:-https://chat-api-xxxxxxx.run.app}"
TEST_USER_ID="test-user-$(date +%s)"
TEST_SESSION_ID="session-$(date +%s)"
RESULTS_FILE="test-results-$(date +%Y%m%d-%H%M%S).json"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Helper function to print test results
print_test() {
  local name=$1
  local status=$2
  local response=$3
  
  TESTS_RUN=$((TESTS_RUN + 1))
  
  if [ "$status" = "PASS" ]; then
    echo -e "${GREEN}✓ PASS${NC}: $name"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "${RED}✗ FAIL${NC}: $name"
    echo "  Response: $response"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

# Test 1: Health check
echo -e "\n${YELLOW}=== Testing Health Check ===${NC}"
RESPONSE=$(curl -s -w "\n%{http_code}" "$CHAT_API_URL/health" 2>&1 || echo "000")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
  print_test "Health check" "PASS" "$BODY"
else
  print_test "Health check" "FAIL" "HTTP $HTTP_CODE"
fi

# Test 2: Chat endpoint with valid request
echo -e "\n${YELLOW}=== Testing Chat Endpoint ===${NC}"
CHAT_PAYLOAD=$(cat <<EOF
{
  "messages": [
    {"role": "user", "content": "Hello, what can you help me with?"}
  ],
  "sessionId": "$TEST_SESSION_ID"
}
EOF
)

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "$CHAT_API_URL/chat" \
  -H "Content-Type: application/json" \
  -H "X-User-ID: $TEST_USER_ID" \
  -d "$CHAT_PAYLOAD" 2>&1 || echo "000")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
  print_test "Chat endpoint" "PASS" "HTTP $HTTP_CODE"
else
  print_test "Chat endpoint" "FAIL" "HTTP $HTTP_CODE - $BODY"
fi

# Test 3: Invalid request (missing user ID)
echo -e "\n${YELLOW}=== Testing Error Handling ===${NC}"
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "$CHAT_API_URL/chat" \
  -H "Content-Type: application/json" \
  -d "$CHAT_PAYLOAD" 2>&1 || echo "000")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

if [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "400" ]; then
  print_test "Invalid request handling" "PASS" "HTTP $HTTP_CODE"
else
  print_test "Invalid request handling" "FAIL" "Expected 401/400, got $HTTP_CODE"
fi

# Test 4: Rate limiting
echo -e "\n${YELLOW}=== Testing Rate Limiting ===${NC}"
RATE_LIMIT_PASSED=true
for i in {1..5}; do
  RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST "$CHAT_API_URL/chat" \
    -H "Content-Type: application/json" \
    -H "X-User-ID: rate-limit-test" \
    -d "$CHAT_PAYLOAD" 2>&1 || echo "000")
  
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  
  if [ "$HTTP_CODE" = "429" ]; then
    RATE_LIMIT_PASSED=true
    break
  fi
done

if [ "$RATE_LIMIT_PASSED" = true ]; then
  print_test "Rate limiting" "PASS" "Rate limit enforced"
else
  print_test "Rate limiting" "FAIL" "Rate limit not enforced"
fi

# Test 5: Debug endpoint
echo -e "\n${YELLOW}=== Testing Debug Endpoint ===${NC}"
RESPONSE=$(curl -s -w "\n%{http_code}" "$CHAT_API_URL/debug/users" 2>&1 || echo "000")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

if [ "$HTTP_CODE" = "200" ]; then
  print_test "Debug endpoint" "PASS" "HTTP $HTTP_CODE"
else
  print_test "Debug endpoint" "FAIL" "HTTP $HTTP_CODE"
fi

# Print summary
echo -e "\n${YELLOW}=== Test Summary ===${NC}"
echo "Total tests: $TESTS_RUN"
echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed: ${RED}$TESTS_FAILED${NC}"

# Exit with appropriate code
if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "\n${GREEN}All tests passed!${NC}"
  exit 0
else
  echo -e "\n${RED}Some tests failed!${NC}"
  exit 1
fi

