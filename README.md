# VoiceGPT - Voice Memo Chat with RAG

A full-stack application that lets users record voice memos, transcribe them with Google Cloud Speech-to-Text, embed them with Vertex AI, and chat with their memo history using RAG (Retrieval-Augmented Generation) powered by GPT-4.

## Architecture

- **Frontend**: React + Vite + TypeScript (Firebase Hosting)
- **Cloud Functions**: Transcription + Embedding pipeline (Node.js 22)
- **Cloud Run**: RAG chat service with vector search (Express + TypeScript)
- **Database**: Firestore with vector search indexes
- **Storage**: Firebase Storage for audio files
- **AI**: Google Cloud Speech-to-Text v2, Vertex AI Embeddings, OpenAI GPT-4

## Prerequisites

1. **Google Cloud Project** with Blaze plan (required for Cloud Functions secrets)
2. **Firebase Project** (same as GCP project)
3. **APIs enabled**:
   - Cloud Speech-to-Text API
   - Vertex AI API
   - Cloud Firestore API
   - Cloud Storage API
   - Cloud Functions API
   - Cloud Run API
   - Secret Manager API

4. **Tools installed**:
   - `gcloud` CLI
   - `firebase` CLI
   - Node.js 22+
   - npm or yarn

## Setup Instructions

### 1. Upgrade to Blaze Plan

Your Firebase project must be on the Blaze (pay-as-you-go) plan to use Cloud Functions with secrets.

Visit: https://console.firebase.google.com/project/YOUR_PROJECT_ID/usage/details

### 2. Set OpenAI API Key

```bash
firebase functions:secrets:set OPENAI_API_KEY --project YOUR_PROJECT_ID
# Paste your OpenAI API key when prompted
```

### 3. Configure Service Account Permissions

```bash
PROJECT_ID=YOUR_PROJECT_ID
DEFAULT_SA="$PROJECT_ID@appspot.gserviceaccount.com"

# Grant necessary roles
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$DEFAULT_SA" \
  --role="roles/aiplatform.user"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$DEFAULT_SA" \
  --role="roles/secretmanager.secretAccessor"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$DEFAULT_SA" \
  --role="roles/storage.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$DEFAULT_SA" \
  --role="roles/datastore.user"
```

### 4. Deploy Firestore Rules and Indexes

```bash
firebase deploy --only firestore:rules
# Wait for vector index to be created (may take a few minutes)
```

### 5. Deploy Cloud Functions

```bash
cd functions
npm run build
firebase deploy --only functions
```

### 6. Build and Deploy Chat API to Cloud Run

```bash
cd services/chat-api
npm install
npm run build

# Deploy to Cloud Run
gcloud run deploy chat-api \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars OPENAI_API_KEY=YOUR_KEY_HERE,GCLOUD_PROJECT=YOUR_PROJECT_ID
```

Note the Cloud Run service URL (e.g., `https://chat-api-xxxxx-uc.a.run.app`)

### 7. Configure and Deploy Web App

```bash
cd web

# Create .env.local with your Firebase config
cp .env.example .env.local
# Edit .env.local with your Firebase credentials and Chat API URL

npm run build
firebase deploy --only hosting
```

## Environment Variables

### Web App (.env.local)

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_CHAT_API_URL=https://your-chat-api-url.run.app/chat
VITE_RECAPTCHA_V3_SITE_KEY=... (optional)
```

## Project Structure

```
voice-chat-gpt/
├── functions/              # Cloud Functions (transcription + embedding)
│   ├── src/
│   │   └── index.ts       # Main functions
│   └── package.json
├── services/
│   └── chat-api/          # Cloud Run service (RAG + streaming)
│       ├── src/
│       │   └── index.ts
│       ├── Dockerfile
│       └── package.json
├── web/                   # React frontend
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── styles/
│   │   └── firebase.ts
│   ├── index.html
│   └── vite.config.ts
├── firestore.rules        # Firestore security rules
├── storage.rules          # Storage security rules
└── firebase.json          # Firebase config
```

## How It Works

1. **Record**: User records a voice memo in the web app
2. **Upload**: Audio is uploaded to Firebase Storage
3. **Transcribe**: Cloud Function triggers on upload, transcribes with Speech-to-Text v2
4. **Embed**: Another Cloud Function chunks the transcript and generates 1024-dim embeddings with Vertex AI
5. **Index**: Chunks with embeddings are stored in Firestore with vector index
6. **Chat**: User asks questions; Chat API embeds the query, searches similar chunks, and streams GPT-4 response with citations

## Security

- **Firestore**: Per-user data isolation; chunks are backend-write only
- **Storage**: Owner-only audio uploads with size/type validation
- **Auth**: Firebase Authentication with ID token verification
- **App Check**: Optional reCAPTCHA v3 protection

## Monitoring

- **Cloud Logging**: Auto-captures Functions and Cloud Run logs
- **Error Alerts**: Set up log-based alerts for errors
- **Quotas**: Monitor Vertex AI, Speech-to-Text, and OpenAI usage

## Cost Optimization

- Global max instances: 10 (configurable per function)
- Batch embedding requests
- Vector search limited to 12 results
- Chunk size: ~1200 chars with 200-char overlap

## Troubleshooting

### Functions won't deploy
- Ensure project is on Blaze plan
- Check that all APIs are enabled
- Verify service account has required roles

### Chat API returns 401
- Verify ID token is being sent correctly
- Check Firebase Auth is configured
- Ensure user is authenticated

### Vector search returns no results
- Wait for vector index to be created (check Firestore console)
- Verify chunks have been created (check Firestore data)
- Check that query embedding was generated successfully

## Recent Enhancements

### Performance Optimization
- **Caching Service**: LRU cache with TTL support for memos, sessions, and queries
- **Code Splitting**: Optimized Vite configuration with manual chunks for React, Firebase, and services
- **Performance Monitoring**: Built-in performance metrics tracking and analysis

### Advanced Data Querying
- **Memo Service**: Advanced filtering, sorting, pagination, and full-text search
- **Composite Indexes**: Optimized Firestore indexes for efficient querying
- **Session Management**: Persistent chat sessions with message history

### Memo Management
- **Tagging System**: Add/remove tags for organization
- **Favorites**: Mark important memos
- **Soft Deletion**: Restore deleted memos
- **Bulk Operations**: Batch tagging and deletion
- **Title Updates**: Customize memo titles

### Error Handling & Resilience
- **Retry Logic**: Exponential backoff for failed operations
- **Offline Support**: Queue operations when offline, sync when online
- **Error Classification**: Categorized error types with user-friendly messages
- **Graceful Degradation**: Fallback behavior for network failures

### UI/UX Enhancements
- **Loading States**: Modern spinner and skeleton loaders
- **Animations**: Smooth transitions and visual feedback
- **Responsive Design**: Mobile-optimized layout
- **Accessibility**: ARIA labels and keyboard navigation support

### Security Hardening
- **Input Sanitization**: XSS prevention and HTML sanitization
- **Rate Limiting**: Client-side rate limiting for chat and uploads
- **Validation**: Email, URL, UUID, and user ID validation
- **SQL Injection Detection**: Pattern-based detection
- **Enhanced Firestore Rules**: Comprehensive field validation

### Monitoring & Analytics
- **Analytics Service**: Event tracking and usage analytics
- **Logging Service**: Structured logging with severity levels
- **Performance Metrics**: Track operation durations and performance
- **Error Tracking**: Centralized error logging and analysis

### Testing & Quality Assurance
- **Unit Tests**: Comprehensive test coverage for all services
- **Test Setup**: Vitest configuration with mocked dependencies
- **Service Tests**: Cache, security, error handling, and offline services

## Services Architecture

### Core Services

**cacheService.ts** - Client-side caching
- LRU cache with TTL support
- Separate caches for memos, sessions, and queries
- Cache statistics and management

**memoService.ts** - Advanced data querying
- Query memos with filtering, sorting, pagination
- Full-text search across titles and transcripts
- Composite index support

**chatSessionService.ts** - Chat session management
- Create and manage chat sessions
- Persist messages to Firestore
- Retrieve conversation history

**memoManagementService.ts** - Memo CRUD operations
- Tagging and favorites
- Soft deletion and restoration
- Bulk operations with batch writes

**errorService.ts** - Error handling
- Error classification and categorization
- Retry logic with exponential backoff
- User-friendly error messages

**offlineService.ts** - Offline support
- Operation queuing
- Sync when online
- Retry management

**securityService.ts** - Security utilities
- Input sanitization
- Validation functions
- Rate limiting

**analyticsService.ts** - Usage analytics
- Event tracking
- Performance metrics
- Analytics summary

**loggingService.ts** - Structured logging
- Multiple log levels
- Context-aware logging
- Log export functionality

**performanceService.ts** - Performance monitoring
- Operation timing
- Performance metrics
- Summary statistics

## Development

### Running Tests

```bash
cd web
npm test
```

### Running Development Server

```bash
cd web
npm run dev
```

The dev server runs on port 5174 and connects to live deployed functions.

### Building for Production

```bash
cd web
npm run build
```

## Next Steps

1. Add user preferences (language, model selection)
2. Implement advanced search with filters
3. Add conversation export (PDF, JSON)
4. Implement voice output (text-to-speech)
5. Add collaborative features
6. Support multiple languages
7. Implement advanced analytics dashboard

