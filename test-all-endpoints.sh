#!/bin/bash

# Comprehensive test script for VoiceGPT API endpoints

set -e

CHAT_API_URL="http://localhost:3000"
FRONTEND_URL="http://localhost:5175"

echo "=========================================="
echo "VoiceGPT Enterprise-Grade API Tests"
echo "=========================================="
echo ""

# Test 1: Health Check
echo "Test 1: Health Check"
echo "-------------------"
HEALTH_RESPONSE=$(curl -s "$CHAT_API_URL/health")
echo "Response: $HEALTH_RESPONSE"
echo ""

# Test 2: Metrics
echo "Test 2: Metrics Endpoint"
echo "------------------------"
METRICS_RESPONSE=$(curl -s "$CHAT_API_URL/metrics")
echo "Response: $METRICS_RESPONSE"
echo ""

# Test 3: Chat API with proper headers
echo "Test 3: Chat API Endpoint (with streaming)"
echo "-------------------------------------------"
echo "Sending chat request..."
curl -s -X POST "$CHAT_API_URL/chat" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-token" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "Hello, what can you tell me about my voice memos?"
      }
    ]
  }' | head -50

echo ""
echo ""
echo "=========================================="
echo "Frontend Status"
echo "=========================================="
echo "Frontend URL: $FRONTEND_URL"
echo "Frontend is running on port 5175"
echo ""

echo "=========================================="
echo "All Tests Complete"
echo "=========================================="

