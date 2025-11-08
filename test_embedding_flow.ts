import * as admin from "firebase-admin";

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: "voice-gpt-chat",
});

const db = admin.firestore();

async function testEmbeddingFlow() {
  try {
    console.log("Testing embedding flow...\n");

    // Test 1: Call the embedding API directly
    console.log("1. Testing Vertex AI Embeddings API via REST...");
    const token = await admin.credential.applicationDefault().getAccessToken();
    const accessToken = token.access_token;

    const url =
      "https://us-central1-aiplatform.googleapis.com/v1/projects/voice-gpt-chat/locations/us-central1/publishers/google/models/gemini-embedding-001:predict";

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        instances: [{
          content: "The quick brown fox jumps over the lazy dog",
          task_type: "RETRIEVAL_DOCUMENT",
        }],
        parameters: {
          outputDimensionality: 1024,
          autoTruncate: true,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`API error ${response.status}: ${await response.text()}`);
    }

    const result = await response.json();
    const embedding = result.predictions[0].embeddings.values;

    console.log(`✓ Embedding API works! Generated ${embedding.length}-dimensional vector\n`);

    // Test 2: Seed test data
    console.log("2. Seeding test data to Firestore...");
    const uid = "test-user-" + Date.now();
    const memoId = "test-memo-" + Date.now();

    const chunksRef = db.collection("chunks");
    const chunk = {
      uid,
      memoId,
      chunkIndex: 0,
      text: "The quick brown fox jumps over the lazy dog",
      embedding: {
        value: embedding,
      },
      memoDeleted: false,
      createdAt: new Date(),
    };

    const docRef = await chunksRef.add(chunk);
    console.log(`✓ Test chunk created: ${docRef.id}\n`);

    // Test 3: Verify chunk can be retrieved
    console.log("3. Verifying chunk retrieval...");
    const snap = await chunksRef.doc(docRef.id).get();
    const data = snap.data();

    if (data && data.embedding && Array.isArray(data.embedding.value)) {
      console.log(`✓ Chunk retrieved successfully with embedding\n`);
    } else {
      throw new Error("Chunk retrieval failed");
    }

    console.log("✅ All tests passed!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  }
}

testEmbeddingFlow();

