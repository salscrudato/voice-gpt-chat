#!/bin/bash

# VoiceGPT Chat API Startup Script
# This script starts the chat API with real OpenAI integration

set -e

echo "🚀 Starting VoiceGPT Chat API..."

# Check if OPENAI_API_KEY is set
if [ -z "$OPENAI_API_KEY" ]; then
    echo "❌ Error: OPENAI_API_KEY environment variable is not set"
    echo ""
    echo "Please set your OpenAI API key:"
    echo "  export OPENAI_API_KEY='your-api-key-here'"
    echo ""
    echo "Get your API key from: https://platform.openai.com/api-keys"
    exit 1
fi

# Set default GCLOUD_PROJECT if not set
if [ -z "$GCLOUD_PROJECT" ]; then
    export GCLOUD_PROJECT="voice-gpt-chat"
    echo "ℹ️  Using default GCLOUD_PROJECT: $GCLOUD_PROJECT"
fi

# Navigate to chat API directory
cd "$(dirname "$0")/services/chat-api"

echo "📦 Starting Chat API on port 8080..."
echo "🔑 Using OpenAI API key: ${OPENAI_API_KEY:0:10}..."
echo "☁️  Using Google Cloud Project: $GCLOUD_PROJECT"
echo ""
echo "✅ Chat API is ready!"
echo "📍 API URL: http://localhost:8080"
echo "🏥 Health check: http://localhost:8080/health"
echo ""

# Start the chat API
npm start

