# VoiceGPT Developer Guide

## Quick Start

### Development Environment
```bash
# Install dependencies
npm install
cd web && npm install
cd ../services/chat-api && npm install

# Start frontend dev server
cd web
npm run dev  # Runs on http://localhost:5174

# Build for production
npm run build

# Type checking
npm run lint
```

## Architecture Overview

### Frontend Stack
- **Framework**: React 19 + TypeScript
- **Build Tool**: Vite 7
- **Styling**: Tailwind CSS
- **State**: React hooks
- **HTTP**: Custom httpClient with retries

### Backend Stack
- **Cloud Functions**: Node.js 22 (Transcription + Embedding)
- **Cloud Run**: Express + TypeScript (RAG Chat API)
- **Database**: Firestore with vector search
- **Storage**: Firebase Storage
- **AI Services**: Google Cloud Speech-to-Text, Vertex AI, OpenAI

## Key Utilities

### Error Handling
```typescript
import {logInfo, logError, logWarning} from "@/utils/errorHandler";

logInfo("Operation started", {component: "MyComponent"});
logError("Operation failed", error, {component: "MyComponent"});
```

### HTTP Requests
```typescript
import {http} from "@/utils/httpClient";

const data = await http.post("/api/endpoint", {key: "value"});
const result = await http.get("/api/data", {timeout: 5000});
```

### Request Deduplication
```typescript
import {executeWithRetry} from "@/utils/requestManager";

const result = await executeWithRetry(
  () => fetch("/api/data"),
  {idempotencyKey: "unique-key"}
);
```

### Firestore Caching
```typescript
import {cachedQuery} from "@/utils/firestoreCache";

const data = await cachedQuery(
  "users",
  () => db.collection("users").get(),
  {userId: "123"},
  60000  // 60s TTL
);
```

### Health Checks
```typescript
import {healthChecker} from "@/utils/healthCheck";

healthChecker.registerService("chat-api");
const health = await healthChecker.checkHealth(
  "chat-api",
  () => fetch("/health")
);
```

### Monitoring
```typescript
import {monitoring, measureAsync} from "@/utils/monitoring";

const result = await measureAsync("operation-name", async () => {
  return await someAsyncOperation();
});

const metrics = monitoring.getSystemMetrics();
```

## Common Patterns

### Error Recovery
```typescript
import {errorRecovery, RecoveryStrategy} from "@/utils/errorRecovery";

const result = await errorRecovery.execute(
  () => riskyOperation(),
  {
    strategy: RecoveryStrategy.RETRY,
    maxAttempts: 3,
    delayMs: 1000
  }
);
```

### Input Validation
```typescript
import {validateAndSanitize, sanitizeInput} from "@/utils/validation";

const validation = validateAndSanitize(userInput);
if (!validation.valid) {
  console.error(validation.error);
}

const safe = sanitizeInput(userInput);
```

### Streaming Responses
```typescript
import {parseSSEStream} from "@/utils/streamingClient";

const events = await parseSSEStream(response, {
  timeout: 120000,
  onEvent: (event) => console.log(event),
  onComplete: () => console.log("Done")
});
```

## Environment Variables

### Frontend (.env)
```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_CHAT_API_URL=https://chat-api-xxx.run.app
```

### Backend (.env)
```
OPENAI_API_KEY=sk-...
GCLOUD_PROJECT=voice-gpt-chat
PORT=8080
NODE_ENV=production
```

## Testing

### Run Tests
```bash
./test-api.sh              # API tests
./test-integration.sh      # Integration tests
./test-enterprise-endpoints.sh  # Enterprise tests
```

### Manual Testing
```bash
# Test chat endpoint
curl -X POST https://chat-api-xxx.run.app/chat \
  -H "Content-Type: application/json" \
  -H "X-User-ID: test-user" \
  -d '{"messages": [{"role": "user", "content": "Hello"}]}'
```

## Deployment

### Frontend
```bash
cd web
npm run build
firebase deploy --only hosting
```

### Cloud Functions
```bash
cd functions
npm run build
firebase deploy --only functions
```

### Chat API
```bash
cd services/chat-api
npm run build
gcloud run deploy chat-api --source .
```

## Troubleshooting

### Build Errors
- Clear node_modules: `rm -rf node_modules && npm install`
- Check TypeScript: `npm run lint`
- Rebuild: `npm run build`

### Runtime Errors
- Check browser console for errors
- Review Cloud Functions logs
- Check Cloud Run logs
- Verify environment variables

### Performance Issues
- Check monitoring metrics
- Review Firestore queries
- Analyze bundle size
- Profile with DevTools

## Best Practices

1. **Always use error handlers** - Never let errors go unlogged
2. **Validate inputs** - Sanitize all user input
3. **Use request deduplication** - Prevent duplicate API calls
4. **Cache appropriately** - Use Firestore cache for queries
5. **Monitor metrics** - Track performance and errors
6. **Handle offline** - Queue requests when offline
7. **Test thoroughly** - Use provided test scripts
8. **Document changes** - Keep code well-commented

## Resources

- [Firebase Documentation](https://firebase.google.com/docs)
- [React Documentation](https://react.dev)
- [Vite Documentation](https://vitejs.dev)
- [TypeScript Documentation](https://www.typescriptlang.org)
- [Google Cloud Documentation](https://cloud.google.com/docs)

