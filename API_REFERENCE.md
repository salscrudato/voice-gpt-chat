# VoiceGPT API Reference

## Chat API (localhost:3000)

### Health Check
```
GET /health
Response: { status: "ok", timestamp: string, uptime: number, environment: string }
```

### Metrics
```
GET /metrics
Response: { uptime: number, memory: { heapUsed, heapTotal, external }, timestamp: string }
```

### Chat Endpoint
```
POST /chat
Headers:
  - Authorization: Bearer <token>
  - Content-Type: application/json

Request Body:
{
  "messages": [
    { "role": "user|assistant|system", "content": "string (0-5000 chars)" }
  ],
  "sessionId": "string (optional, 0-256 chars)"
}

Response (Streaming):
- First event: { type: "citations", data: [...] }
- Subsequent events: { type: "delta", data: { content: "string" } }
- Final event: { type: "done" }

Error Responses:
- 400: Invalid request
- 401: Unauthorized
- 429: Rate limited (includes Retry-After header)
- 500: Internal server error
```

## Frontend (localhost:5175)

### Recording & Upload
- Records audio with quality monitoring
- Automatic retry with exponential backoff
- Idempotency key generation for deduplication
- Network state detection before upload

### Chat Interface
- Real-time streaming responses
- Citation tracking
- Conversation history management
- Error recovery with user feedback

## Error Handling

### Error Response Format
```json
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "status": 400,
  "timestamp": "2025-11-08T...",
  "requestId": "string",
  "details": {}
}
```

### Error Codes
- `INVALID_REQUEST`: Bad request format
- `UNAUTHORIZED`: Missing/invalid auth
- `RATE_LIMITED`: Too many requests
- `TIMEOUT`: Request timeout
- `CIRCUIT_BREAKER_OPEN`: Service unavailable
- `INTERNAL_ERROR`: Server error

## Rate Limiting

- 30 requests per 60 seconds per user
- Retry-After header included in 429 responses
- Distributed rate limiting via Firestore

## Audio Processing

### Quality Metrics
- RMS (Root Mean Square) level
- Peak level detection
- Signal-to-Noise Ratio (SNR)
- Clipping detection
- Silence ratio
- Quality score (0-100)

### STT Model Selection
- Short audio (≤60s): `latest_short` model
- Long audio (>60s): `latest_long` model
- Word-level timing enabled for long audio

## Testing

Run integration tests:
```bash
./test-integration.sh
./test-enterprise-endpoints.sh
```

## Performance Targets

- Recording latency: <100ms
- Upload latency: <5s (for 60s audio)
- Transcription latency: <30s (for 60s audio)
- Chat response latency: <3s
- Network latency: <200ms

