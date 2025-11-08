#!/bin/bash

# Test script for VoiceGPT API endpoints
# Tests all major endpoints with curl

set -e

CHAT_API_URL="https://chat-api-653896399291.us-central1.run.app"
TIMESTAMP=$(date +%s%N)

echo "=========================================="
echo "VoiceGPT API Endpoint Tests"
echo "=========================================="
echo ""

# Test 1: Health check
echo "[TEST 1] Health Check"
echo "Endpoint: GET $CHAT_API_URL/health"
curl -s -X GET "$CHAT_API_URL/health" \
  -H "Content-Type: application/json" | jq . || echo "Health check failed"
echo ""

# Test 2: Chat endpoint with test data
echo "[TEST 2] Chat Endpoint"
echo "Endpoint: POST $CHAT_API_URL/chat"
curl -s -X POST "$CHAT_API_URL/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-'$TIMESTAMP'",
    "query": "What is machine learning?",
    "memoIds": [],
    "sessionId": "test-session-'$TIMESTAMP'"
  }' | jq . || echo "Chat request failed"
echo ""

# Test 3: Debug users endpoint
echo "[TEST 3] Debug Users"
echo "Endpoint: GET $CHAT_API_URL/debug/users"
curl -s -X GET "$CHAT_API_URL/debug/users" \
  -H "Content-Type: application/json" | jq . || echo "Debug users failed"
echo ""

echo "=========================================="
echo "Tests Complete"
echo "=========================================="

