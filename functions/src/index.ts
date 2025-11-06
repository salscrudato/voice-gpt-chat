import * as admin from "firebase-admin";
import {onObjectFinalized} from "firebase-functions/v2/storage";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {setGlobalOptions} from "firebase-functions/v2";
import {defineSecret} from "firebase-functions/params";
import {v2 as speech} from "@google-cloud/speech";
import {PredictionServiceClient} from "@google-cloud/aiplatform";
import * as logger from "firebase-functions/logger";

// Initialize Firebase Admin
admin.initializeApp();

// Set global options for all functions
setGlobalOptions({
  region: "us-central1",
  memory: "1GiB",
  timeoutSeconds: 540,
  maxInstances: 10,
});

// Define secrets
const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

// Initialize clients
const aiplatform = new PredictionServiceClient({
  apiEndpoint: "us-central1-aiplatform.googleapis.com",
});
const speechClient = new speech.SpeechClient();

/**
 * Helper: chunk text with overlap
 * @param {string} s - The text to chunk
 * @param {number} targetLen - Target length of each chunk
 * @param {number} overlap - Overlap between chunks
 * @return {string[]} Array of text chunks
 */
function chunkText(s: string, targetLen = 1200, overlap = 200): string[] {
  if (!s || typeof s !== "string") return [];
  const strips = s.replace(/\s+/g, " ").trim();
  if (strips.length === 0) return [];

  const out: string[] = [];
  let i = 0;
  let lastI = -1;

  while (i < strips.length) {
    // Prevent infinite loops
    if (i === lastI) {
      break;
    }
    lastI = i;

    const end = Math.min(i + targetLen, strips.length);
    const chunk = strips.slice(i, end);
    if (chunk.length > 0) {
      out.push(chunk);
    }

    // If we've reached the end, break
    if (end >= strips.length) {
      break;
    }

    // Move forward by targetLen - overlap, but at least by 1
    i = Math.max(i + 1, end - overlap);
  }
  return out;
}

/**
 * Helper: Retry with exponential backoff
 * @param {Function} fn - The async function to retry
 * @param {number} maxAttempts - Maximum number of attempts
 * @param {number} initialDelayMs - Initial delay in milliseconds
 * @return {Promise<T>} The result of the function
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  initialDelayMs = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxAttempts - 1) {
        const delayMs = initialDelayMs * Math.pow(2, attempt);
        const msg = `Attempt ${attempt + 1} failed, retrying in ${delayMs}ms:`;
        logger.warn(msg, lastError.message);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError || new Error("Max retries exceeded");
}

// ---------- 1) Transcribe on audio upload ----------
export const onAudioUpload = onObjectFinalized(
  {
    secrets: [OPENAI_API_KEY],
    memory: "1GiB",
    timeoutSeconds: 540,
  },
  async (event) => {
    const file = event.data;

    // Only process audio files
    if (!file.name?.startsWith("audio/")) {
      logger.info("Skipping non-audio file:", file.name);
      return;
    }
    if (!file.contentType?.startsWith("audio/")) {
      logger.info("Skipping non-audio content type:", file.contentType);
      return;
    }

    let uid = "";
    let memoId = "";
    let userName = "";
    let gcsUri = "";

    try {
      // Parse path: audio/{uid}/{memoId}.webm
      const parts = file.name.split("/");
      if (parts.length < 3) {
        logger.error("Invalid audio path:", file.name);
        return;
      }

      uid = parts[1];
      const memoIdWithExt = parts[2];
      memoId = memoIdWithExt.replace(/\.[^/.]+$/, "");

      // Extract userName from custom metadata
      userName = file.metadata?.["userName"] || "Unknown";

      gcsUri = `gs://${file.bucket}/${file.name}`;
      const project = process.env.GCLOUD_PROJECT;
      const recognizer = `projects/${project}/locations/global/recognizers/_`;

      logger.info("Transcribing audio:", {uid, memoId, userName, gcsUri});

      // Update memo status to "transcribing"
      const docRef = admin
        .firestore()
        .collection("users")
        .doc(uid)
        .collection("memos")
        .doc(memoId);

      await docRef.set(
        {
          status: "transcribing",
          transcribingStartedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        {merge: true}
      );

      // Batch recognize - optimized for speed with retry logic
      logger.info("Starting Speech-to-Text transcription...", {
        uid,
        memoId,
        gcsUri,
      });
      const startTime = Date.now();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const request: any = {
        recognizer,
        config: {
          autoDecodingConfig: {},
          languageCodes: ["en-US"],
          features: {
            enableWordTimeOffsets: false, // Disable for faster processing
          },
          model: "latest_short", // Use faster model for quicker results
        },
        recognitionOutputConfig: {
          inlineResponseConfig: {},
        },
        files: [{uri: gcsUri}],
      };

      const [operation] = await retryWithBackoff(
        () => speechClient.batchRecognize(request),
        2,
        500
      );

      logger.info("Waiting for Speech-to-Text operation to complete...", {
        uid,
        memoId,
      });

      // Wait for operation with timeout
      const response = await Promise.race([
        operation.promise(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Speech-to-Text operation timeout")),
            540000
          )
        ),
      ]);

      const duration = Date.now() - startTime;
      logger.info("Speech-to-Text operation completed", {
        uid,
        memoId,
        durationMs: duration,
      });

      // Log the full response structure for debugging
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resp = response as any;

      // Log full response for debugging
      logger.info("Full Speech-to-Text response:", {
        uid,
        memoId,
        responseKeys: Object.keys(resp).slice(0, 10),
        responseStr: JSON.stringify(resp).substring(0, 500),
      });

      // Log response structure for debugging
      logger.info("Speech-to-Text response structure:", {
        hasResults: !!resp?.results,
        resultsType: typeof resp?.results,
        resultsKeys: resp?.results ? Object.keys(resp.results).slice(0, 5) : [],
      });

      // Extract transcript from the correct response structure
      // Response structure: response.results[gcsUri].transcript.results[0]
      // .alternatives[0].transcript
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let fileResults = resp?.results?.[gcsUri];

      // If not found with full URI, try to find any results
      if (!fileResults && resp?.results) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const resultsArray = Object.values(resp.results) as any[];
        if (resultsArray.length > 0) {
          fileResults = resultsArray[0];
          logger.info(
            "Found results using first available key instead of gcsUri"
          );
        }
      }

      if (!fileResults) {
        // Try alternative response structure
        const allResults = resp?.results;
        const allResultsStr = allResults ?
          JSON.stringify(allResults, null, 2).substring(0, 500) :
          "undefined";
        const msg = `No results found. Available: ${allResultsStr}`;
        logger.error(msg);
        throw new Error(`No transcription results found for ${gcsUri}`);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let transcriptResults = (fileResults as any)?.transcript?.results;

      // If transcript.results not found, try direct results
      if (!transcriptResults) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        transcriptResults = (fileResults as any)?.results;
      }

      if (!transcriptResults || transcriptResults.length === 0) {
        const fileResultsStr = JSON.stringify(fileResults, null, 2).substring(
          0,
          500
        );
        const msg = `No transcript results. FileResults: ${fileResultsStr}`;
        logger.error(msg);
        throw new Error(`No transcript results found for ${gcsUri}`);
      }

      // Get the first result's alternatives
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const alternatives = (transcriptResults[0] as any)?.alternatives;
      if (!alternatives || alternatives.length === 0) {
        logger.error("No alternatives found in transcript:", {
          uid,
          memoId,
          gcsUri,
        });
        throw new Error(`No alternatives found in transcript for ${gcsUri}`);
      }

      // Extract transcript text from the top alternative
      let transcript = alternatives[0]?.transcript || "";

      // Validate and sanitize transcript
      if (typeof transcript !== "string") {
        transcript = String(transcript);
      }
      transcript = transcript.trim();

      if (!transcript || transcript.length === 0) {
        logger.warn("Empty transcript extracted:", {uid, memoId, gcsUri});
        throw new Error("Transcription resulted in empty transcript");
      }

      if (transcript.length > 100000) {
        logger.warn("Transcript too long, truncating:", {
          uid,
          memoId,
          length: transcript.length,
        });
        transcript = transcript.substring(0, 100000);
      }

      // Extract word-level information if available
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const words = (alternatives[0] as any)?.words || [];

      logger.info("Transcription complete:", {
        uid,
        memoId,
        transcriptLength: transcript.length,
        wordCount: Array.isArray(words) ? words.length : 0,
        confidence: alternatives[0]?.confidence || 0,
      });

      // Calculate word count and quality metrics
      const wordCount = transcript
        .split(/\s+/)
        .filter((w: string) => w.length > 0).length;
      const confidence = alternatives[0]?.confidence || 0;
      const qualityScore = Math.round(
        Math.max(0, Math.min(100, confidence * 100))
      );

      await retryWithBackoff(
        () => docRef.set(
          {
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            storagePath: file.name,
            contentType: file.contentType,
            status: "transcribed",
            transcript,
            words: Array.isArray(words) ? words : [],
            userName,
            wordCount,
            confidence,
            qualityScore,
            transcribedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          {merge: true}
        ),
        2,
        500
      );

      logger.info("Memo document updated successfully:", {
        uid,
        memoId,
        userName,
        wordCount,
        qualityScore,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error("Error in onAudioUpload:", {
        uid,
        memoId,
        userName,
        gcsUri,
        error: errorMsg,
        stack: errorStack,
      });

      // Update memo document with error status
      try {
        const docRef = admin
          .firestore()
          .collection("users")
          .doc(uid)
          .collection("memos")
          .doc(memoId);

        const errMsg = error instanceof Error ? error.message : "Unknown error";
        await docRef.set(
          {
            status: "error",
            errorMessage: errMsg,
            errorAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          {merge: true}
        );
      } catch (updateError) {
        logger.error("Failed to update error status:", updateError);
      }

      throw error;
    }
  }
);

// ---------- 2) Chunk + embed on transcript write ----------
export const onTranscriptWrite = onDocumentWritten(
  {document: "users/{uid}/memos/{memoId}"},
  async (event) => {
    const after = event.data?.after?.data();
    if (!after?.transcript) {
      logger.info("No transcript found, skipping embedding");
      return;
    }

    const {uid, memoId} = event.params as {uid: string; memoId: string};
    const transcript: string = after.transcript;
    const userName: string = after.userName || "Unknown";

    try {
      logger.info("Starting embedding process:", {uid, memoId, userName});
      logger.info("Transcript details:", {
        uid,
        memoId,
        transcriptLength: transcript.length,
        transcriptPreview: transcript.substring(0, 100),
      });

      // Chunk transcript
      logger.info("About to chunk text...", {uid, memoId});
      const chunks = chunkText(transcript, 1200, 200);
      logger.info("Text chunked:", {
        uid,
        memoId,
        chunkCount: chunks.length,
        chunks: chunks.map((c) => c.substring(0, 50)),
      });

      // Generate embeddings using Vertex AI
      const project = process.env.GCLOUD_PROJECT;
      const modelPath =
        "locations/us-central1/publishers/google/models/gemini-embedding-001";
      const model = `projects/${project}/${modelPath}`;

      const vectors: number[][] = [];
      const failedChunks: number[] = [];

      for (let i = 0; i < chunks.length; i++) {
        const ch = chunks[i];
        logger.info("Embedding chunk:", {uid, memoId, chunkIndex: i});

        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const [result] = await retryWithBackoff(
            () => aiplatform.predict({
              endpoint: model,
              instances: [{
                content: ch,
                task_type: "RETRIEVAL_DOCUMENT",
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
              } as any],
              parameters: {
                outputDimensionality: 1024,
                autoTruncate: true,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
              } as any,
            }),
            2,
            500
          );

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const embeddings = (result?.predictions?.[0] as any)?.embeddings;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const values = embeddings?.values as number[];

          if (!Array.isArray(values) || values.length === 0) {
            logger.warn("Invalid embedding result for chunk:", {
              uid,
              memoId,
              chunkIndex: i,
            });
            failedChunks.push(i);
          } else {
            vectors.push(values);
          }
        } catch (error) {
          logger.error("Failed to embed chunk:", {
            uid,
            memoId,
            chunkIndex: i,
            error,
          });
          failedChunks.push(i);
        }
      }

      if (vectors.length === 0) {
        throw new Error("Failed to generate embeddings for any chunks");
      }

      logger.info("Embeddings generated:", {
        uid,
        memoId,
        vectorCount: vectors.length,
        failedCount: failedChunks.length,
      });

      // Store chunks with vector embeddings
      const db = admin.firestore();
      const batch = db.batch();
      const chunksColl = db
        .collection("users")
        .doc(uid)
        .collection("chunks");

      chunks.forEach((text, i) => {
        if (!failedChunks.includes(i) && vectors[i]) {
          const ref = chunksColl.doc(`${memoId}_${i}`);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const fsAny = admin.firestore as any;
          batch.set(ref, {
            uid,
            memoId,
            userName,
            chunkIndex: i,
            text,
            embedding: fsAny.FieldValue.vector(vectors[i]),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      });

      await retryWithBackoff(
        () => batch.commit(),
        2,
        500
      );
      logger.info("Chunks stored in Firestore:", {uid, memoId});

      // Mark memo as indexed
      await retryWithBackoff(
        () =>
          admin
            .firestore()
            .doc(`users/${uid}/memos/${memoId}`)
            .set(
              {indexed: true, embeddedChunkCount: vectors.length},
              {merge: true}
            ),
        2,
        500
      );

      logger.info("Memo marked as indexed:", {
        uid,
        memoId,
        embeddedChunkCount: vectors.length,
      });
    } catch (error) {
      logger.error("Error in onTranscriptWrite:", error);
      throw error;
    }
  }
);
