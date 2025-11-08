#!/usr/bin/env node

/**
 * Smoke Test for VoiceGPT Chat API
 * Tests deployed Cloud Run /health and /chat endpoints
 * 
 * Usage:
 *   npm run smoke
 *   CHAT_API_URL=https://your-api.run.app npm run smoke
 * 
 * Requires:
 *   - CHAT_API_URL environment variable (or uses default)
 *   - Firebase credentials for ID token generation
 */

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const CHAT_API_URL = process.env.CHAT_API_URL || "http://localhost:8080";
const TEST_USER_EMAIL = "smoke-test@voicegpt.local";

console.log("🧪 VoiceGPT Chat API Smoke Test");
console.log(`📍 API URL: ${CHAT_API_URL}`);
console.log("");

// Initialize Firebase Admin
let auth;
try {
  const app = initializeApp({ credential: applicationDefault() });
  auth = getAuth(app);
  console.log("✅ Firebase Admin initialized");
} catch (error) {
  console.error("❌ Failed to initialize Firebase Admin:", error.message);
  console.log("   Make sure GOOGLE_APPLICATION_CREDENTIALS is set");
  process.exit(1);
}

async function getTestIdToken() {
  try {
    // Create or get test user
    let user;
    try {
      user = await auth.getUserByEmail(TEST_USER_EMAIL);
    } catch (e) {
      user = await auth.createUser({ email: TEST_USER_EMAIL });
      console.log(`✅ Created test user: ${TEST_USER_EMAIL}`);
    }

    // Generate ID token
    const token = await auth.createCustomToken(user.uid);
    return token;
  } catch (error) {
    console.error("❌ Failed to get ID token:", error.message);
    throw error;
  }
}

async function testHealth() {
  console.log("\n📋 Testing /health endpoint...");
  try {
    const response = await fetch(`${CHAT_API_URL}/health`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    console.log("✅ Health check passed");
    console.log(`   Status: ${data.status}`);
    console.log(`   Uptime: ${Math.round(data.uptime)}s`);
    return true;
  } catch (error) {
    console.error("❌ Health check failed:", error.message);
    return false;
  }
}

async function testChat(idToken) {
  console.log("\n💬 Testing /chat endpoint...");
  try {
    const response = await fetch(`${CHAT_API_URL}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        messages: [
          { role: "user", content: "Hello, what can you tell me about my voice memos?" }
        ]
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text.substring(0, 100)}`);
    }

    if (!response.body) {
      throw new Error("No response body");
    }

    // Read SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let receivedCitations = false;
    let receivedDelta = false;
    let receivedDone = false;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      const lines = text.split("\n");

      for (const line of lines) {
        if (line.startsWith("data:")) {
          try {
            const data = JSON.parse(line.slice(5));
            if (data.type === "citations") receivedCitations = true;
            if (data.type === "delta") receivedDelta = true;
            if (data.type === "done") receivedDone = true;
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    }

    if (receivedCitations && receivedDone) {
      console.log("✅ Chat endpoint working");
      console.log(`   Received citations: ${receivedCitations}`);
      console.log(`   Received deltas: ${receivedDelta}`);
      return true;
    } else {
      throw new Error("Incomplete SSE stream");
    }
  } catch (error) {
    console.error("❌ Chat test failed:", error.message);
    return false;
  }
}

async function main() {
  try {
    const healthOk = await testHealth();
    if (!healthOk) {
      console.error("\n❌ Health check failed. Aborting.");
      process.exit(1);
    }

    const idToken = await getTestIdToken();
    const chatOk = await testChat(idToken);

    console.log("\n" + "=".repeat(50));
    if (healthOk && chatOk) {
      console.log("✅ All smoke tests passed!");
      process.exit(0);
    } else {
      console.log("❌ Some tests failed");
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Smoke test error:", error.message);
    process.exit(1);
  }
}

main();

