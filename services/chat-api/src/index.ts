import dotenv from "dotenv";
import express, {Request, Response} from "express";
import cors from "cors";
import {initializeApp, applicationDefault} from "firebase-admin/app";
import {Firestore} from "@google-cloud/firestore";
import {PredictionServiceClient} from "@google-cloud/aiplatform";
import OpenAI from "openai";
import RateLimiter from "./rateLimiter";

// Load environment variables from .env file
dotenv.config();

// Initialize Firebase Admin
initializeApp({credential: applicationDefault()});

// Initialize clients
const db = new Firestore({
  preferRest: false,
  maxRetries: 3,
});
const aiplatform = new PredictionServiceClient({
  apiEndpoint: "us-central1-aiplatform.googleapis.com",
});
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 30000, // 30 second timeout
  maxRetries: 2,
});

// Initialize rate limiter (30 requests per minute per user)
const rateLimiter = new RateLimiter(60000, 30);

// Constants for resilience
const FIRESTORE_TIMEOUT_MS = 10000;
const EMBEDDING_TIMEOUT_MS = 15000;
const OPENAI_TIMEOUT_MS = 60000;

const app = express();

// CORS configuration
app.use(
  cors({
    origin: [
      /\.web\.app$/,
      /\.firebaseapp\.com$/,
      /localhost:5173$/,
      /localhost:5174$/,
      /localhost:5175$/,
      /localhost:5176$/,
      /localhost:3000$/,
    ],
    credentials: true,
  })
);

app.use(express.json({limit: "1mb"}));

// Request logging middleware
app.use((req: Request, res: Response, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "production",
  });
});

// Metrics endpoint
app.get("/metrics", (req: Request, res: Response) => {
  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();

  res.json({
    uptime,
    memory: {
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      external: Math.round(memoryUsage.external / 1024 / 1024),
    },
    timestamp: new Date().toISOString(),
  });
});

// Debug endpoint to list all users and their memos
app.get("/debug/users", async (req: Request, res: Response) => {
  try {
    const usersSnap = await db.collection("users").limit(10).get();
    const users: any[] = [];

    for (const userDoc of usersSnap.docs) {
      const uid = userDoc.id;
      const memosSnap = await db.collection("users").doc(uid).collection("memos").limit(5).get();
      const chunksSnap = await db.collection("users").doc(uid).collection("chunks").limit(5).get();

      users.push({
        uid,
        memoCount: memosSnap.size,
        chunkCount: chunksSnap.size,
      });
    }

    res.json({users});
  } catch (error: any) {
    res.status(500).json({error: error.message});
  }
});

// Helper: Timeout wrapper for promises
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

// Chat endpoint with RAG and streaming
app.post("/chat", async (req: Request, res: Response) => {
  let streamStarted = false;

  try {
    // Get userId from header (required)
    const userId = (req.headers["x-user-id"] as string) || "";

    // Validate user ID format (user_<uuid>)
    if (!userId || !userId.match(/^user_[0-9a-f\-]{36}$/i)) {
      return res.status(400).json({error: "Invalid user ID format"});
    }

    // Rate limiting check
    if (!rateLimiter.isAllowed(userId)) {
      const resetTime = rateLimiter.getResetTime(userId);
      const retryAfter = Math.ceil((resetTime - Date.now()) / 1000);
      res.set("Retry-After", retryAfter.toString());
      return res.status(429).json({
        error: "Rate limit exceeded",
        retryAfter,
      });
    }

    const {messages} = req.body as {
      messages: Array<{role: "user" | "assistant" | "system"; content: string}>;
    };

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({error: "Invalid messages format"});
    }

    // Validate messages array
    if (messages.length === 0 || messages.length > 100) {
      return res.status(400).json({error: "Invalid message count"});
    }

    // Get the latest user message
    const latestUser = [...messages]
      .reverse()
      .find((m) => m.role === "user")?.content || "";

    if (!latestUser || latestUser.length === 0 || latestUser.length > 5000) {
      return res.status(400).json({error: "Invalid user message"});
    }

    console.log("Chat request from user:", userId, "Message length:", latestUser.length);

    // 1) Try to get chunks from Firestore first (with or without vector search)
    let contexts: Array<{text: string; memoId: string; chunkIndex: number}> = [];

    try {
      console.log("Looking for chunks for user:", userId);
      // Query chunks directly from user's collection instead of using collectionGroup
      const coll = db.collection("users").doc(userId).collection("chunks");

      // First, check if user has any chunks (excluding deleted memos)
      // We need to query chunks that belong to non-deleted memos
      // For now, just get all chunks and we'll filter by checking the memo status
      const checkSnap = await withTimeout(
        coll.limit(1).get(),
        FIRESTORE_TIMEOUT_MS,
        "Firestore chunk check"
      );
      console.log("User has chunks:", checkSnap.size > 0);

      if (checkSnap.size > 0) {
        console.log("Sample chunk data:", JSON.stringify(checkSnap.docs[0]?.data(), null, 2));
      } else {
        // Debug: try to see if user document exists
        try {
          const userDoc = await db.collection("users").doc(userId).get();
          console.log("User document exists:", userDoc.exists);
          if (userDoc.exists) {
            console.log("User data:", JSON.stringify(userDoc.data(), null, 2));
          }

          // Also check if there are any memos
          const memosRef = db.collection("users").doc(userId).collection("memos");
          const memosSnap = await memosRef.limit(1).get();
          console.log("User has memos:", memosSnap.size > 0);
          if (memosSnap.size > 0) {
            const memoData = memosSnap.docs[0]?.data();
            console.log("Sample memo data:", JSON.stringify(memoData, null, 2));
            console.log("Memo status:", memoData?.status, "Transcript length:", memoData?.transcript?.length || 0, "Deleted:", memoData?.isDeleted);
          }
        } catch (e) {
          console.log("Error checking user document:", e);
        }
      }

      if (checkSnap.size > 0) {
        // Try vector search first
        try {
          const endpoint = `projects/${process.env.GCLOUD_PROJECT}/locations/us-central1/publishers/google/models/gemini-embedding-001`;
          console.log("Attempting vector embedding with endpoint:", endpoint);

          const [pred] = await withTimeout(
            aiplatform.predict({
              endpoint,
              instances: [{
                content: latestUser,
                task_type: "RETRIEVAL_QUERY",
              } as any],
              parameters: {
                outputDimensionality: 1024,
                autoTruncate: true,
              } as any,
            }),
            EMBEDDING_TIMEOUT_MS,
            "Embedding generation"
          );

          const queryVec = (pred?.predictions?.[0] as any)?.embeddings
            ?.values as number[];

          if (!queryVec || !Array.isArray(queryVec) || queryVec.length === 0) {
            console.warn("Failed to generate query embedding, using fallback");
            throw new Error("No embedding generated");
          }

          console.log("Query embedded, vector dimension:", queryVec.length);

          // Vector search in Firestore
          try {
            // @ts-ignore - Vector types present in server SDK
            const vectorQuery = coll.findNearest({
              vectorField: "embedding",
              queryVector: queryVec,
              limit: 12,
              distanceMeasure: "COSINE",
            });

            // @ts-ignore
            const snap = await withTimeout(
              vectorQuery.get(),
              FIRESTORE_TIMEOUT_MS,
              "Vector search"
            );

            // @ts-ignore
            snap.forEach((doc: any) => {
              const data = doc.data();
              if (data.text && data.memoId && typeof data.chunkIndex === "number") {
                contexts.push({
                  text: String(data.text).substring(0, 2000), // Limit chunk size
                  memoId: String(data.memoId),
                  chunkIndex: data.chunkIndex,
                });
              }
            });

            console.log("Vector search successful, found", contexts.length, "chunks");
          } catch (vectorError: any) {
            console.warn("Vector search failed:", vectorError.message);
            throw vectorError;
          }
        } catch (embeddingError: any) {
          console.warn("Embedding/vector search failed, using fallback:", embeddingError.message);

          // Fallback: simple text search
          try {
            const snap = await withTimeout(
              coll.limit(10).get(),
              FIRESTORE_TIMEOUT_MS,
              "Fallback search"
            );
            snap.forEach((doc: any) => {
              const data = doc.data();
              if (data.text && data.memoId && typeof data.chunkIndex === "number") {
                contexts.push({
                  text: String(data.text).substring(0, 2000),
                  memoId: String(data.memoId),
                  chunkIndex: data.chunkIndex,
                });
              }
            });
            console.log("Fallback search found", contexts.length, "chunks");
          } catch (fallbackError: any) {
            console.warn("Fallback search also failed:", fallbackError.message);
          }
        }
      } else {
        console.log("No chunks found for user");
      }
    } catch (error: any) {
      console.warn("Error retrieving chunks:", error.message);
    }

    console.log("Found", contexts.length, "relevant chunks");

    // 3) Build context with citations
    const contextBlocks = contexts
      .map((c) => `— [memo:${c.memoId} #${c.chunkIndex}] ${c.text}`)
      .join("\n");

    const system = `You are VoiceGPT, an AI assistant that helps users understand and explore their voice memos.
Use the provided excerpts from the user's voice memo history to answer questions.
If you quote or reference information, cite it like [memo:<id>#<chunk>].
If the information needed to answer is not in the provided context, say so briefly.
Be concise and helpful.
Always provide accurate citations for any information you reference.`;

    // 4) Stream response via SSE with citations
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("X-Content-Type-Options", "nosniff");

    streamStarted = true;

    // Send initial context/citations
    res.write(`data: ${JSON.stringify({
      type: "citations",
      citations: contexts.map((c) => ({
        memoId: c.memoId,
        chunkIndex: c.chunkIndex,
        text: c.text,
      })),
    })}\n\n`);

    try {
      const stream = await withTimeout(
        openai.chat.completions.create({
          model: "gpt-4o-mini",
          stream: true,
          messages: [
            {role: "system", content: system},
            {
              role: "user",
              content: `Context from your voice memos:\n${contextBlocks}\n\nQuestion:\n${latestUser}`,
            },
          ],
        }),
        OPENAI_TIMEOUT_MS,
        "OpenAI streaming"
      );

      for await (const part of stream) {
        const delta = part.choices?.[0]?.delta?.content || "";
        if (delta) {
          res.write(`data: ${JSON.stringify({type: "delta", delta})}\n\n`);
        }
      }

      res.write(`data: ${JSON.stringify({type: "done"})}\n\n`);
      res.end();
    } catch (streamError: any) {
      console.error("Error during streaming:", streamError);
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({type: "error", error: "Stream processing failed"})}\n\n`);
        res.end();
      }
    }
  } catch (error: any) {
    console.error("Error in /chat:", error);
    if (!streamStarted && !res.headersSent) {
      res.status(500).json({error: "Internal server error"});
    } else if (streamStarted && !res.writableEnded) {
      res.write(`data: ${JSON.stringify({type: "error", error: "Request failed"})}\n\n`);
      res.end();
    }
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Chat API listening on port ${port}`);
});

