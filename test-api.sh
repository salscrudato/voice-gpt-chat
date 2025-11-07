#!/bin/bash

# VoiceGPT API Test Suite
# Tests Chat API endpoints with various scenarios
# Requires Firebase ID token for authentication

set -e

# Configuration
CHAT_API_URL="${CHAT_API_URL:-http://localhost:8080}"
FIREBASE_PROJECT="${FIREBASE_PROJECT:-voice-gpt-chat}"

echo "🧪 VoiceGPT API Test Suite"
echo "================================"
echo "Chat API URL: $CHAT_API_URL"
echo "Firebase Project: $FIREBASE_PROJECT"
echo ""

# Test 1: Health Check (no auth required)
echo "✓ Test 1: Health Check"
curl -s "$CHAT_API_URL/health" | jq . || echo "Health check failed"
echo ""

# Test 2: Metrics (no auth required)
echo "✓ Test 2: Metrics"
curl -s "$CHAT_API_URL/metrics" | jq . || echo "Metrics check failed"
echo ""

# Test 3: Missing Authorization Header (should fail)
echo "✓ Test 3: Missing Authorization Header (should fail with 401)"
curl -s -X POST "$CHAT_API_URL/chat" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"test"}]}' | jq . || true
echo ""

# Test 4: Invalid Token (should fail)
echo "✓ Test 4: Invalid Token (should fail with 401)"
curl -s -X POST "$CHAT_API_URL/chat" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer invalid_token_here" \
  -d '{"messages":[{"role":"user","content":"test"}]}' | jq . || true
echo ""

echo "✅ Smoke tests completed!"
echo ""
echo "📝 Note: Full integration tests require valid Firebase ID tokens."
echo "   Run the frontend app to generate valid tokens for testing."

