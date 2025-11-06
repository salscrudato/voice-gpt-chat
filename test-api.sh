#!/bin/bash

# VoiceGPT API Test Suite
# Tests Chat API endpoints with various scenarios

set -e

# Configuration
CHAT_API_URL="${CHAT_API_URL:-http://localhost:8080}"
TEST_USER_ID="user_12345678-1234-1234-1234-123456789012"

echo "🧪 VoiceGPT API Test Suite"
echo "================================"
echo "Chat API URL: $CHAT_API_URL"
echo "Test User ID: $TEST_USER_ID"
echo ""

# Test 1: Health Check
echo "✓ Test 1: Health Check"
curl -s "$CHAT_API_URL/health" | jq . || echo "Health check failed"
echo ""

# Test 2: Metrics
echo "✓ Test 2: Metrics"
curl -s "$CHAT_API_URL/metrics" | jq . || echo "Metrics check failed"
echo ""

# Test 3: Invalid User ID
echo "✓ Test 3: Invalid User ID (should fail)"
curl -s -X POST "$CHAT_API_URL/chat" \
  -H "Content-Type: application/json" \
  -H "x-user-id: invalid" \
  -d '{"messages":[{"role":"user","content":"test"}]}' | jq . || true
echo ""

# Test 4: Valid Chat Request (no context)
echo "✓ Test 4: Valid Chat Request (no context)"
curl -s -X POST "$CHAT_API_URL/chat" \
  -H "Content-Type: application/json" \
  -H "x-user-id: $TEST_USER_ID" \
  -d '{"messages":[{"role":"user","content":"Hello, what can you do?"}]}' \
  --max-time 30 | head -100 || echo "Chat request failed"
echo ""

# Test 5: Rate Limiting
echo "✓ Test 5: Rate Limiting (send 35 requests)"
for i in {1..35}; do
  response=$(curl -s -w "\n%{http_code}" -X POST "$CHAT_API_URL/chat" \
    -H "Content-Type: application/json" \
    -H "x-user-id: $TEST_USER_ID" \
    -d "{\"messages\":[{\"role\":\"user\",\"content\":\"test $i\"}]}" \
    --max-time 5)
  
  http_code=$(echo "$response" | tail -1)
  if [ "$http_code" = "429" ]; then
    echo "Rate limit hit at request $i ✓"
    break
  fi
done
echo ""

echo "✅ All tests completed!"

