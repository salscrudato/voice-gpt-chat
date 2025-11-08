# VoiceGPT Testing Guide

## Quick Start

### Frontend Testing
```bash
# Start dev server
cd web
npm run dev

# Build for production
npm run build

# Run type checking
npm run lint
```

### API Testing with curl

#### 1. Test Chat Endpoint
```bash
curl -X POST https://chat-api-YOUR_PROJECT.run.app/chat \
  -H "Content-Type: application/json" \
  -H "X-User-ID: test-user-123" \
  -d '{
    "messages": [
      {"role": "user", "content": "Hello, what can you help me with?"}
    ],
    "sessionId": "session-123"
  }'
```

#### 2. Test Health Check
```bash
curl https://chat-api-YOUR_PROJECT.run.app/health
```

#### 3. Test Debug Endpoint
```bash
curl https://chat-api-YOUR_PROJECT.run.app/debug/users
```

#### 4. Test Rate Limiting
```bash
# Make multiple requests to trigger rate limit
for i in {1..35}; do
  curl -X POST https://chat-api-YOUR_PROJECT.run.app/chat \
    -H "Content-Type: application/json" \
    -H "X-User-ID: rate-test" \
    -d '{"messages": [{"role": "user", "content": "Test"}], "sessionId": "test"}'
done
```

## Automated Test Scripts

### Run All Tests
```bash
# Basic API tests
./test-api.sh

# Integration tests
./test-integration.sh

# Enterprise endpoint tests
./test-enterprise-endpoints.sh
```

## Testing Checklist

- [ ] Frontend loads without errors
- [ ] Chat interface is responsive
- [ ] Audio recording works
- [ ] File upload succeeds
- [ ] Chat API responds to requests
- [ ] Rate limiting is enforced
- [ ] Error messages are user-friendly
- [ ] Streaming responses work
- [ ] Offline queue functions
- [ ] Error recovery mechanisms work

## Performance Metrics

Monitor these metrics in production:
- Average response time: < 2s
- Error rate: < 0.1%
- Uptime: > 99.9%
- Chat API latency: < 5s

## Troubleshooting

### Chat API not responding
1. Check Cloud Run deployment status
2. Verify environment variables are set
3. Check service account permissions
4. Review Cloud Run logs

### Frontend not loading
1. Check Vite dev server is running
2. Verify Firebase configuration
3. Check browser console for errors
4. Clear browser cache

### Audio upload failing
1. Check Firebase Storage permissions
2. Verify audio file size (< 500MB)
3. Check supported audio formats
4. Review Cloud Functions logs

