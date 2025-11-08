# VoiceGPT Troubleshooting Guide

## Common Issues and Solutions

### Frontend Issues

#### Issue: "Network connection failed"
**Cause**: Chat API not responding or network issue
**Solution**:
1. Check if Chat API is running: `curl http://localhost:3000/health`
2. Check browser console for CORS errors
3. Verify VITE_CHAT_API_URL environment variable
4. Check network connectivity

#### Issue: "Audio quality too low"
**Cause**: Microphone issues or background noise
**Solution**:
1. Check microphone permissions
2. Test microphone in system settings
3. Reduce background noise
4. Try different microphone
5. Check audio quality metrics in UI

#### Issue: "Upload failed - retrying"
**Cause**: Network issue or file too large
**Solution**:
1. Check file size (max 500MB)
2. Check network connection
3. Check browser console for errors
4. Try uploading smaller file
5. Check Firebase Storage quota

### Chat API Issues

#### Issue: "Rate limit exceeded"
**Cause**: Too many requests from user
**Solution**:
1. Wait for rate limit window to reset
2. Check Retry-After header
3. Reduce request frequency
4. Check for duplicate requests
5. Review rate limiter configuration

#### Issue: "Unauthorized: Missing authorization token"
**Cause**: No auth token provided
**Solution**:
1. Ensure user is authenticated
2. Check token validity
3. Verify auth middleware
4. Check token expiration

#### Issue: "Circuit breaker open"
**Cause**: Downstream service (embedding/OpenAI) failing
**Solution**:
1. Check Cloud Function logs
2. Verify API keys are valid
3. Check service quotas
4. Wait for circuit breaker to reset (30s)
5. Check network connectivity

### Cloud Functions Issues

#### Issue: "Transcription timeout"
**Cause**: Audio too long or service slow
**Solution**:
1. Check audio file size
2. Verify Speech-to-Text API is working
3. Check Cloud Function logs
4. Increase timeout if needed
5. Try shorter audio file

#### Issue: "No transcription results"
**Cause**: Speech-to-Text API error
**Solution**:
1. Check Cloud Function logs
2. Verify audio format is supported
3. Check audio quality
4. Verify API credentials
5. Check quota limits

## Debugging

### Enable Debug Logging
```bash
# Frontend
localStorage.setItem('DEBUG', 'true')

# Chat API
export LOG_LEVEL=debug
npm run dev
```

### Check Logs
```bash
# Cloud Functions
firebase functions:log

# Chat API
npm run dev 2>&1 | grep -i error

# Frontend
Open browser DevTools (F12)
```

### Test Endpoints
```bash
# Health check
curl http://localhost:3000/health

# Metrics
curl http://localhost:3000/metrics

# Chat (requires auth)
curl -X POST http://localhost:3000/chat \
  -H "Authorization: Bearer token" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"test"}]}'
```

## Performance Optimization

### Slow Uploads
- Check network speed
- Reduce audio quality
- Use shorter recordings
- Check browser cache

### Slow Transcription
- Use shorter audio files
- Check Cloud Function memory
- Verify Speech-to-Text quota
- Check Firestore performance

### Slow Chat Responses
- Check embedding API
- Verify OpenAI API quota
- Check Firestore query performance
- Review circuit breaker status

