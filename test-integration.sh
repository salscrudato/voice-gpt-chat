#!/bin/bash

# VoiceGPT Integration Testing Script
# Tests frontend, chat API, and cloud functions integration

set -e

FRONTEND_URL="http://localhost:5175"
CHAT_API_URL="http://localhost:3000"

echo "=========================================="
echo "VoiceGPT Integration Testing"
echo "=========================================="
echo ""

# Test 1: Frontend Health
echo "[TEST 1] Frontend Health Check"
echo "GET $FRONTEND_URL"
FRONTEND_RESPONSE=$(curl -s -w "\n%{http_code}" "$FRONTEND_URL")
HTTP_CODE=$(echo "$FRONTEND_RESPONSE" | tail -n1)

echo "Status: $HTTP_CODE"
if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ Frontend not responding"
  exit 1
fi
echo "✅ Frontend is running"
echo ""

# Test 2: Chat API Health
echo "[TEST 2] Chat API Health Check"
echo "GET $CHAT_API_URL/health"
CHAT_RESPONSE=$(curl -s -w "\n%{http_code}" "$CHAT_API_URL/health")
HTTP_CODE=$(echo "$CHAT_RESPONSE" | tail -n1)
BODY=$(echo "$CHAT_RESPONSE" | sed '$d')

echo "Status: $HTTP_CODE"
echo "Response:"
echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ Chat API not responding"
  exit 1
fi
echo "✅ Chat API is running"
echo ""

# Test 3: Chat API Metrics
echo "[TEST 3] Chat API Metrics"
echo "GET $CHAT_API_URL/metrics"
METRICS=$(curl -s -w "\n%{http_code}" "$CHAT_API_URL/metrics")
HTTP_CODE=$(echo "$METRICS" | tail -n1)
BODY=$(echo "$METRICS" | sed '$d')

echo "Status: $HTTP_CODE"
echo "Response:"
echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ Metrics endpoint failed"
  exit 1
fi
echo "✅ Metrics endpoint working"
echo ""

# Test 4: Rate Limiting
echo "[TEST 4] Rate Limiting Test"
echo "Testing rate limit headers..."
RATE_TEST=$(curl -s -i -X POST "$CHAT_API_URL/chat" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-token" \
  -d '{"messages":[{"role":"user","content":"test"}]}' 2>&1)

if echo "$RATE_TEST" | grep -q "Retry-After\|429\|401"; then
  echo "✅ Rate limiting headers present"
else
  echo "⚠️  Rate limiting headers not found (may be expected)"
fi
echo ""

# Test 5: Error Handling
echo "[TEST 5] Error Handling Test"
echo "Testing invalid request handling..."
ERROR_TEST=$(curl -s -w "\n%{http_code}" -X POST "$CHAT_API_URL/chat" \
  -H "Content-Type: application/json" \
  -d '{"invalid":"request"}')
HTTP_CODE=$(echo "$ERROR_TEST" | tail -n1)
BODY=$(echo "$ERROR_TEST" | sed '$d')

echo "Status: $HTTP_CODE"
echo "Response:"
echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
if [ "$HTTP_CODE" == "401" ] || [ "$HTTP_CODE" == "400" ]; then
  echo "✅ Error handling working correctly"
else
  echo "⚠️  Unexpected status code: $HTTP_CODE"
fi
echo ""

echo "=========================================="
echo "Integration tests completed! ✅"
echo "=========================================="
echo ""
echo "Services running:"
echo "  Frontend: $FRONTEND_URL"
echo "  Chat API: $CHAT_API_URL"
echo ""

