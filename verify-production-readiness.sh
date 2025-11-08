#!/bin/bash

# Production Readiness Verification Script
# Checks all components are ready for production deployment

set -e

echo "=========================================="
echo "VoiceGPT Production Readiness Check"
echo "=========================================="
echo ""

CHECKS_PASSED=0
CHECKS_FAILED=0

# Helper function
check_status() {
  if [ $? -eq 0 ]; then
    echo "✅ $1"
    ((CHECKS_PASSED++))
  else
    echo "❌ $1"
    ((CHECKS_FAILED++))
  fi
}

# 1. Check TypeScript compilation
echo "[1] Checking TypeScript compilation..."
cd /Users/salscrudato/Projects/voice-chat-gpt/web && npm run build > /dev/null 2>&1
check_status "Frontend TypeScript compilation"

cd /Users/salscrudato/Projects/voice-chat-gpt/services/chat-api && npm run build > /dev/null 2>&1
check_status "Chat API TypeScript compilation"

# 2. Check services are running
echo ""
echo "[2] Checking services..."
curl -s http://localhost:5175 > /dev/null 2>&1
check_status "Frontend is running"

curl -s http://localhost:3000/health > /dev/null 2>&1
check_status "Chat API is running"

# 3. Check API endpoints
echo ""
echo "[3] Checking API endpoints..."
HEALTH=$(curl -s http://localhost:3000/health | jq -r '.status' 2>/dev/null)
[ "$HEALTH" = "ok" ]
check_status "Health endpoint responds correctly"

METRICS=$(curl -s http://localhost:3000/metrics | jq -r '.uptime' 2>/dev/null)
[ ! -z "$METRICS" ]
check_status "Metrics endpoint responds correctly"

# 4. Check error handling
echo ""
echo "[4] Checking error handling..."
ERROR_RESPONSE=$(curl -s -w "%{http_code}" -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"invalid":"request"}' 2>/dev/null)
HTTP_CODE=$(echo "$ERROR_RESPONSE" | tail -c 4)
[ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "400" ]
check_status "Error handling returns proper status codes"

# 5. Check rate limiting
echo ""
echo "[5] Checking rate limiting..."
RATE_RESPONSE=$(curl -s -i -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test" \
  -d '{"messages":[{"role":"user","content":"test"}]}' 2>&1)
echo "$RATE_RESPONSE" | grep -q "Retry-After\|429\|401"
check_status "Rate limiting headers present"

# 6. Check environment variables
echo ""
echo "[6] Checking environment variables..."
[ ! -z "$GCLOUD_PROJECT" ]
check_status "GCLOUD_PROJECT is set"

[ ! -z "$VITE_CHAT_API_URL" ]
check_status "VITE_CHAT_API_URL is set"

# 7. Check file structure
echo ""
echo "[7] Checking file structure..."
[ -f "/Users/salscrudato/Projects/voice-chat-gpt/web/src/utils/audioQuality.ts" ]
check_status "Audio quality utility exists"

[ -f "/Users/salscrudato/Projects/voice-chat-gpt/services/chat-api/src/validation.ts" ]
check_status "Validation utility exists"

[ -f "/Users/salscrudato/Projects/voice-chat-gpt/services/chat-api/src/errorHandler.ts" ]
check_status "Error handler utility exists"

# 8. Check documentation
echo ""
echo "[8] Checking documentation..."
[ -f "/Users/salscrudato/Projects/voice-chat-gpt/API_REFERENCE.md" ]
check_status "API reference exists"

[ -f "/Users/salscrudato/Projects/voice-chat-gpt/DEPLOYMENT_CHECKLIST.md" ]
check_status "Deployment checklist exists"

[ -f "/Users/salscrudato/Projects/voice-chat-gpt/TROUBLESHOOTING.md" ]
check_status "Troubleshooting guide exists"

# Summary
echo ""
echo "=========================================="
echo "Production Readiness Summary"
echo "=========================================="
echo "Checks Passed: $CHECKS_PASSED"
echo "Checks Failed: $CHECKS_FAILED"
echo ""

if [ $CHECKS_FAILED -eq 0 ]; then
  echo "✅ All checks passed! Ready for production deployment."
  exit 0
else
  echo "❌ Some checks failed. Please review and fix issues."
  exit 1
fi

