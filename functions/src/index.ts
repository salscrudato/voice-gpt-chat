import * as admin from "firebase-admin";
import {onObjectFinalized} from "firebase-functions/v2/storage";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {setGlobalOptions} from "firebase-functions/v2";
import {defineSecret} from "firebase-functions/params";
import {v2 as speech} from "@google-cloud/speech";
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
 * Helper: Retry with exponential backoff and jitter
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

      // Check if error is retryable
      const isRetryable = isRetryableError(lastError);
      if (!isRetryable) {
        throw lastError;
      }

      if (attempt < maxAttempts - 1) {
        const delayMs = calculateBackoffDelay(attempt, initialDelayMs);
        const msg = `Attempt ${attempt + 1} failed, retrying in ${delayMs}ms:`;
        logger.warn(msg, lastError.message);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError || new Error("Max retries exceeded");
}

/**
 * Determine if an error is retryable
 * @param {Error} error - The error to check
 * @return {boolean} True if error should be retried
 */
function isRetryableError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  // Don't retry validation errors
  if (msg.includes("invalid") || msg.includes("too small") ||
      msg.includes("too large")) {
    return false;
  }
  // Retry network, timeout, and server errors
  return msg.includes("network") || msg.includes("timeout") ||
         msg.includes("500") || msg.includes("503") ||
         msg.includes("unavailable");
}

/**
 * Calculate exponential backoff delay with jitter
 * @param {number} attempt - Current attempt number
 * @param {number} initialDelayMs - Initial delay in milliseconds
 * @return {number} Delay in milliseconds
 */
function calculateBackoffDelay(
  attempt: number,
  initialDelayMs: number
): number {
  const exponentialDelay = initialDelayMs * Math.pow(2, attempt);
  const cappedDelay = Math.min(exponentialDelay, 30000); // Max 30 seconds
  const jitter = cappedDelay * 0.1 * Math.random();
  return Math.round(cappedDelay + jitter);
}

/**
 * Extract key terms from text for hybrid search
 * Simple TF-IDF-like approach: extract nouns and important words
 * @param {string} text - The text to extract terms from
 * @param {number} maxTerms - Maximum number of terms to extract
 * @return {string[]} Array of extracted terms
 */
function extractTerms(text: string, maxTerms = 20): string[] {
  // Simple stopwords list
  const stopwords = new Set([
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "will", "would",
    "could", "should", "may", "might", "must", "can", "this", "that",
    "these", "those", "i", "you", "he", "she", "it", "we", "they",
  ]);

  // Split into words and filter
  const words = text
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3 && !stopwords.has(w));

  // Count frequency
  const freq = new Map<string, number>();
  words.forEach((w) => freq.set(w, (freq.get(w) || 0) + 1));

  // Sort by frequency and return top terms
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxTerms)
    .map(([term]) => term);
}

/**
 * Calculate comprehensive quality score for transcription
 * Considers confidence, word count, and content quality
 * @param {string} transcript - The transcribed text
 * @param {number} confidence - Confidence score from STT (0-1)
 * @param {number} wordCount - Number of words in transcript
 * @return {number} Quality score (0-100)
 */
function calculateQualityScore(
  transcript: string,
  confidence: number,
  wordCount: number
): number {
  let score = Math.round(Math.max(0, Math.min(100, confidence * 100)));

  // Adjust for word count - very short transcripts are lower quality
  if (wordCount < 5) {
    score = Math.max(0, score - 30);
  } else if (wordCount < 20) {
    score = Math.max(0, score - 15);
  }

  // Adjust for content diversity - check for repeated words
  const words = transcript.toLowerCase().split(/\s+/);
  if (words.length > 0) {
    const uniqueWords = new Set(words).size;
    const diversity = uniqueWords / words.length;
    if (diversity < 0.3) {
      score = Math.max(0, score - 20); // Penalize repetitive content
    }
  }

  // Ensure score is in valid range
  return Math.max(0, Math.min(100, score));
}

/**
 * Generate a summary from text
 * Simple approach: extract first 2-3 sentences
 * @param {string} text - The text to summarize
 * @param {number} maxLength - Maximum length of summary
 * @return {string} Generated summary
 */
function generateSummary(text: string, maxLength = 200): string {
  // Split into sentences
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);

  let summary = "";
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (summary.length + trimmed.length + 2 <= maxLength) {
      summary += (summary ? " " : "") + trimmed + ".";
    } else {
      break;
    }
  }

  return summary || text.substring(0, maxLength);
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

      // Validate UID and memoId format
      if (!uid || uid.length === 0 || !memoId || memoId.length === 0) {
        logger.error("Invalid UID or memoId:", {uid, memoId});
        return;
      }

      // Extract userName from custom metadata
      userName = file.metadata?.["userName"] || "Unknown";

      // Validate file size
      const fileSizeBytes = file.size || 0;
      const maxSizeBytes = 500 * 1024 * 1024; // 500 MB
      const minSizeBytes = 1024; // 1 KB

      if (fileSizeBytes < minSizeBytes) {
        logger.error("Audio file too small:", {uid, memoId, fileSizeBytes});
        throw new Error(`Audio file too small: ${fileSizeBytes} bytes`);
      }

      if (fileSizeBytes > maxSizeBytes) {
        logger.error("Audio file too large:", {uid, memoId, fileSizeBytes});
        const msg = `Audio file too large: ${fileSizeBytes} bytes ` +
          `(max: ${maxSizeBytes})`;
        throw new Error(msg);
      }

      // Validate content type
      const contentType = file.contentType || "";
      const validAudioTypes = [
        "audio/webm", "audio/mp4", "audio/m4a", "audio/wav",
        "audio/mp3", "audio/mpeg",
      ];
      if (!validAudioTypes.some((type) => contentType.startsWith(type))) {
        logger.error("Invalid audio content type:", {uid, memoId, contentType});
        throw new Error(`Invalid audio content type: ${contentType}`);
      }

      gcsUri = `gs://${file.bucket}/${file.name}`;
      const project = process.env.GCLOUD_PROJECT;
      const recognizer = `projects/${project}/locations/global/recognizers/_`;

      logger.info("Transcribing audio:", {
        uid,
        memoId,
        userName,
        gcsUri,
        fileSizeBytes,
        contentType,
      });

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

      // Determine audio duration from metadata to choose appropriate model
      // Short audio (≤60s) uses latest_short for speed, longer uses latest_long
      const audioSizeBytes = file.size || 0;
      // Rough estimate: 16kHz, 16-bit
      const estimatedDurationSeconds = Math.ceil(audioSizeBytes / (16000 * 2));
      const useShortModel = estimatedDurationSeconds <= 60;

      logger.info("Audio model selection:", {
        uid,
        memoId,
        estimatedDurationSeconds,
        useShortModel,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const request: any = {
        recognizer,
        config: {
          autoDecodingConfig: {},
          // TODO: Make configurable from user profile
          languageCodes: ["en-US"],
          features: {
            // Enable for longer audio to support future diarization
            enableWordTimeOffsets: !useShortModel,
          },
          model: useShortModel ? "latest_short" : "latest_long",
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
      const respStr = JSON.stringify(resp) || "undefined";
      const respKeys = Object.keys(resp);
      logger.info("Full Speech-to-Text response:", {
        uid,
        memoId,
        responseKeys: respKeys.slice(0, 20),
        responseStr: respStr.substring(0, 2000),
        allKeys: respKeys,
      });

      // Log response structure for debugging
      const firstResultKey = resp?.results ?
        Object.keys(resp.results)[0] :
        "none";
      const resultsKeys = resp?.results ?
        Object.keys(resp.results).slice(0, 10) :
        [];
      logger.info("Speech-to-Text response structure:", {
        hasResults: !!resp?.results,
        resultsType: typeof resp?.results,
        resultsKeys: resultsKeys,
        gcsUri: gcsUri,
        firstResultKey: firstResultKey,
      });

      // Extract transcript from the correct response structure
      // The response is an array where first element contains results
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let fileResults: any = null;

      // Check if response is an array (common for batch operations)
      if (Array.isArray(resp) && resp.length > 0) {
        const firstElement = resp[0];
        if (firstElement?.results && typeof firstElement.results === "object") {
          // Try with full gcsUri as key
          fileResults = firstElement.results[gcsUri];

          // If not found, try first available result
          if (!fileResults) {
            const resultsArray = Object.values(
              firstElement.results
            ) as Record<string, unknown>[];
            if (resultsArray.length > 0) {
              fileResults = resultsArray[0];
              logger.info("Using first available result key from array");
            }
          }
        }
      }

      // If response is an object with results property
      if (!fileResults && resp?.results &&
          typeof resp.results === "object") {
        // Try with full gcsUri as key
        fileResults = resp.results[gcsUri];

        // If not found, try first available result
        if (!fileResults) {
          const resultsArray = Object.values(
            resp.results
          ) as Record<string, unknown>[];
          if (resultsArray.length > 0) {
            fileResults = resultsArray[0];
            logger.info("Using first available result key from object");
          }
        }
      }

      // If still not found, check if response itself is the results
      if (!fileResults && resp?.results === undefined &&
          resp?.transcript !== undefined) {
        fileResults = resp;
        logger.info("Response is BatchRecognizeFileResult directly");
      }

      if (!fileResults) {
        // Log detailed error info
        const respStr2 = JSON.stringify(resp).substring(0, 500);
        const msg = `No results found. Response: ${respStr2}`;
        logger.error(msg);
        const errMsg = `No transcription results found for ${gcsUri}. ` +
          "Check Cloud Function logs for details.";
        throw new Error(errMsg);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let transcriptResults = (fileResults as any)?.transcript?.results;

      // If transcript.results not found, try direct results
      if (!transcriptResults) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        transcriptResults = (fileResults as any)?.results;
      }

      if (!transcriptResults || transcriptResults.length === 0) {
        const fileResultsJson = JSON.stringify(fileResults, null, 2) ||
          "undefined";
        const fileResultsStr = fileResultsJson.substring(0, 500);
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

      // Calculate word count and quality metrics
      const wordCount = transcript
        .split(/\s+/)
        .filter((w: string) => w.length > 0).length;
      const confidence = alternatives[0]?.confidence || 0;

      // Enhanced quality scoring
      const qualityScore = calculateQualityScore(
        transcript,
        confidence,
        wordCount
      );

      logger.info("Transcription complete:", {
        uid,
        memoId,
        transcriptLength: transcript.length,
        wordCount,
        confidence,
        qualityScore,
        wordLevelCount: Array.isArray(words) ? words.length : 0,
      });

      // Generate summary and extract terms
      const summary = generateSummary(transcript);
      const terms = extractTerms(transcript);

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
            language: "en-US", // Detected language
            summary, // Short extract for list previews
            terms, // Keywords for hybrid search
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

      // Update memo document with detailed error status
      try {
        const docRef = admin
          .firestore()
          .collection("users")
          .doc(uid)
          .collection("memos")
          .doc(memoId);

        const errMsg = error instanceof Error ? error.message : "Unknown error";
        const errorStack = error instanceof Error ? error.stack : undefined;
        const errorType = error?.constructor?.name || "UnknownError";

        // Classify error for better user feedback
        let errorCategory = "UNKNOWN";
        if (errMsg.includes("timeout")) {
          errorCategory = "TIMEOUT";
        } else if (
          errMsg.includes("too small") || errMsg.includes("too large")
        ) {
          errorCategory = "INVALID_FILE_SIZE";
        } else if (errMsg.includes("content type")) {
          errorCategory = "INVALID_CONTENT_TYPE";
        } else if (
          errMsg.includes("permission") || errMsg.includes("denied")
        ) {
          errorCategory = "PERMISSION_ERROR";
        } else if (
          errMsg.includes("quota") || errMsg.includes("rate limit")
        ) {
          errorCategory = "QUOTA_EXCEEDED";
        } else if (
          errMsg.includes("network") || errMsg.includes("connection")
        ) {
          errorCategory = "NETWORK_ERROR";
        }

        await docRef.set(
          {
            status: "error",
            errorMessage: errMsg,
            errorType,
            errorCategory,
            errorDetails: errorStack?.substring(0, 500),
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
          // Call the Vertex AI Embeddings API using REST
          // This is more reliable than the gRPC client
          let token = "";
          try {
            const cred = admin.credential.applicationDefault();
            const accessToken = await cred.getAccessToken();
            token = accessToken.access_token;
            logger.info("Got access token", {uid, memoId, chunkIndex: i});
          } catch (tokenError) {
            logger.error("Failed to get access token", {
              uid,
              memoId,
              chunkIndex: i,
              error: tokenError,
            });
            throw tokenError;
          }

          const url =
            `https://us-central1-aiplatform.googleapis.com/v1/${model}:predict`;

          const requestBody = {
            instances: [{
              content: ch,
              task_type: "RETRIEVAL_DOCUMENT",
            }],
            parameters: {
              outputDimensionality: 1024,
              autoTruncate: true,
            },
          };

          logger.info("Calling embedding API via REST", {
            uid,
            memoId,
            chunkIndex: i,
            url,
          });

          const response = await retryWithBackoff(
            async () => {
              const res = await fetch(url, {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${token}`,
                  "Content-Type":
                    "application/json",
                },
                body: JSON.stringify(requestBody),
              });

              if (!res.ok) {
                const errorText = await res.text();
                logger.error("Embedding API error response", {
                  uid,
                  memoId,
                  chunkIndex: i,
                  status: res.status,
                  errorText: errorText.substring(0, 200),
                });
                throw new Error(`API error ${res.status}: ${errorText}`);
              }

              return res.json();
            },
            2,
            500
          );

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const embeddings = (response?.predictions?.[0] as any)?.embeddings;
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

          // Approximate token count: ~4 characters per token (rough estimate)
          const tokenCount = Math.ceil(text.length / 4);

          // Extract terms for this chunk for hybrid search
          const chunkTerms = extractTerms(text, 10);

          batch.set(ref, {
            uid,
            memoId,
            userName,
            chunkIndex: i,
            text,
            embedding: fsAny.FieldValue.vector(vectors[i]),
            tokenCount, // For retriever budgeting
            terms: chunkTerms, // Keywords for hybrid search fallback
            memoDeleted: false, // Denormalized flag for filtering deleted memos
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

// ---------- 3) Delete memo with cascade (HTTPS callable) ----------
// Deletes a memo and all associated data: Storage audio, Firestore memo doc,
// and chunk docs
import {onCall} from "firebase-functions/v2/https";

export const deleteMemo = onCall(
  {
    memory: "512MiB",
    timeoutSeconds: 60,
  },
  async (request) => {
    const {memoId} = request.data as {memoId: string};
    const uid = request.auth?.uid;

    if (!uid) {
      throw new Error("Unauthenticated: User must be logged in");
    }

    if (!memoId || typeof memoId !== "string") {
      throw new Error("Invalid memoId");
    }

    logger.info("Starting memo deletion:", {uid, memoId});

    try {
      const db = admin.firestore();
      const storage = admin.storage();
      let deletedChunks = 0;

      // Get memo doc first to retrieve storage path
      const memoRef = db
        .collection("users")
        .doc(uid)
        .collection("memos")
        .doc(memoId);
      const memoSnap = await memoRef.get();
      const storagePath = memoSnap.data()?.storagePath;

      // 1) Delete Storage audio file
      try {
        const bucket = storage.bucket();
        if (storagePath) {
          // Use the stored path
          await bucket.file(storagePath).delete().catch(() => {
            logger.warn(
              "Audio file not found or already deleted:",
              {uid, memoId, storagePath}
            );
          });
        } else {
          // Fallback: try common extensions
          const extensions = ["webm", "m4a", "mp4", "wav", "mp3"];
          for (const ext of extensions) {
            const audioPath = `audio/${uid}/${memoId}.${ext}`;
            await bucket.file(audioPath).delete().catch(() => {
              // File may not exist, that's ok
            });
          }
        }
        logger.info("Storage audio deleted:", {uid, memoId});
      } catch (storageError) {
        logger.warn("Error deleting storage file:", storageError);
        // Continue with deletion even if storage fails
      }

      // 2) Delete Firestore memo document
      await memoRef.delete();
      logger.info("Memo document deleted:", {uid, memoId});

      // 3) Delete all chunk documents for this memo
      const chunksRef = db.collection("users").doc(uid).collection("chunks");
      const chunksQuery = chunksRef.where("memoId", "==", memoId);
      const chunksSnap = await chunksQuery.get();

      const batch = db.batch();
      chunksSnap.docs.forEach((doc) => {
        batch.delete(doc.ref);
        deletedChunks++;
      });

      if (deletedChunks > 0) {
        await batch.commit();
        logger.info("Chunk documents deleted:", {uid, memoId, deletedChunks});
      }

      // 4) Optional: Write tombstone for race condition prevention
      // (Useful if multiple deletes are in flight)
      const tombstoneRef = db
        .collection("users")
        .doc(uid)
        .collection("deletedMemos")
        .doc(memoId);
      await tombstoneRef.set({
        deletedAt: admin.firestore.FieldValue.serverTimestamp(),
        deletedChunks,
      });

      logger.info("Memo deletion completed successfully:", {
        uid,
        memoId,
        deletedChunks,
      });

      return {
        ok: true,
        deletedChunks,
        deletedStorage: true,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error("Error in deleteMemo:", {
        uid,
        memoId,
        error: errorMsg,
      });
      throw error;
    }
  }
);
