const admin = require("firebase-admin");

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: "voice-gpt-chat",
});

const db = admin.firestore();

async function seedTestData() {
  try {
    console.log("Seeding test data...");

    // Create a test user
    const uid = "test-user-123";
    const memoId = "test-memo-001";

    // Create a test memo
    const memoRef = db.collection("users").doc(uid).collection("memos").doc(memoId);
    await memoRef.set({
      id: memoId,
      transcript: "The quick brown fox jumps over the lazy dog. This is a test memo.",
      createdAt: new Date(),
      memoDeleted: false,
    });

    console.log("✓ Test memo created");

    // Create test chunks with embeddings
    const chunksRef = db.collection("chunks");

    // Sample embeddings (1024 dimensions)
    const sampleEmbedding = Array(1024).fill(0).map(() => Math.random());

    const chunk1 = {
      uid,
      memoId,
      chunkIndex: 0,
      text: "The quick brown fox jumps over the lazy dog.",
      embedding: {
        value: sampleEmbedding,
      },
      memoDeleted: false,
      createdAt: new Date(),
    };

    const chunk2 = {
      uid,
      memoId,
      chunkIndex: 1,
      text: "This is a test memo.",
      embedding: {
        value: sampleEmbedding,
      },
      memoDeleted: false,
      createdAt: new Date(),
    };

    await chunksRef.add(chunk1);
    await chunksRef.add(chunk2);

    console.log("✓ Test chunks created with embeddings");
    console.log("✓ Test data seeded successfully!");

    process.exit(0);
  } catch (error) {
    console.error("Error seeding test data:", error);
    process.exit(1);
  }
}

seedTestData();

