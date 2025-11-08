#!/bin/bash

# Test Chat API endpoints

echo "=== Testing Chat API ==="
echo ""

# Test 1: Health endpoint
echo "1. Testing /health endpoint..."
curl -s http://localhost:3000/health | jq .
echo ""

# Test 2: Metrics endpoint
echo "2. Testing /metrics endpoint..."
curl -s http://localhost:3000/metrics | jq .
echo ""

# Test 3: Chat endpoint with test data
echo "3. Testing /chat endpoint with streaming response..."
curl -s -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-token" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "What is in my voice memos?"
      }
    ]
  }' | head -20

echo ""
echo "=== Chat API Tests Complete ==="

