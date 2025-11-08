#!/bin/bash

# Enterprise-Grade API Testing Script
# Tests all endpoints with comprehensive validation

set -e

API_URL="http://localhost:3000"
HEALTH_ENDPOINT="$API_URL/health"
METRICS_ENDPOINT="$API_URL/metrics"
DEBUG_ENDPOINT="$API_URL/debug/users"

echo "=========================================="
echo "VoiceGPT Enterprise API Testing"
echo "=========================================="
echo ""

# Test 1: Health Check
echo "[TEST 1] Health Check Endpoint"
echo "GET $HEALTH_ENDPOINT"
HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" "$HEALTH_ENDPOINT")
HTTP_CODE=$(echo "$HEALTH_RESPONSE" | tail -n1)
BODY=$(echo "$HEALTH_RESPONSE" | sed '$d')

echo "Status: $HTTP_CODE"
echo "Response:"
echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
echo ""

if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ Health check failed"
  exit 1
fi
echo "✅ Health check passed"
echo ""

# Test 2: Metrics Endpoint
echo "[TEST 2] Metrics Endpoint"
echo "GET $METRICS_ENDPOINT"
METRICS_RESPONSE=$(curl -s -w "\n%{http_code}" "$METRICS_ENDPOINT")
HTTP_CODE=$(echo "$METRICS_RESPONSE" | tail -n1)
BODY=$(echo "$METRICS_RESPONSE" | sed '$d')

echo "Status: $HTTP_CODE"
echo "Response:"
echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
echo ""

if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ Metrics endpoint failed"
  exit 1
fi
echo "✅ Metrics endpoint passed"
echo ""

# Test 3: Debug Users Endpoint
echo "[TEST 3] Debug Users Endpoint"
echo "GET $DEBUG_ENDPOINT"
DEBUG_RESPONSE=$(curl -s -w "\n%{http_code}" "$DEBUG_ENDPOINT")
HTTP_CODE=$(echo "$DEBUG_RESPONSE" | tail -n1)
BODY=$(echo "$DEBUG_RESPONSE" | sed '$d')

echo "Status: $HTTP_CODE"
echo "Response:"
echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
echo ""

if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ Debug endpoint failed"
  exit 1
fi
echo "✅ Debug endpoint passed"
echo ""

# Test 4: Invalid Request (Missing Auth)
echo "[TEST 4] Chat Endpoint - Missing Authorization"
echo "POST $API_URL/chat (no auth header)"
INVALID_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/chat" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"test"}]}')
HTTP_CODE=$(echo "$INVALID_RESPONSE" | tail -n1)
BODY=$(echo "$INVALID_RESPONSE" | sed '$d')

echo "Status: $HTTP_CODE"
echo "Response:"
echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
echo ""

if [ "$HTTP_CODE" != "401" ]; then
  echo "❌ Should return 401 for missing auth"
  exit 1
fi
echo "✅ Correctly rejected unauthorized request"
echo ""

# Test 5: Invalid Request (Bad JSON)
echo "[TEST 5] Chat Endpoint - Invalid JSON"
echo "POST $API_URL/chat (invalid body)"
INVALID_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/chat" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer invalid-token" \
  -d '{"invalid":"json"')
HTTP_CODE=$(echo "$INVALID_RESPONSE" | tail -n1)

echo "Status: $HTTP_CODE"
if [ "$HTTP_CODE" != "401" ] && [ "$HTTP_CODE" != "400" ]; then
  echo "❌ Should return 401 or 400 for invalid request"
  exit 1
fi
echo "✅ Correctly rejected invalid request"
echo ""

echo "=========================================="
echo "All tests passed! ✅"
echo "=========================================="

