import {useRef, useState, useEffect} from "react";
import {db, storage} from "../firebase";
import {collection, serverTimestamp, query, where, getDocs, orderBy, doc, updateDoc, setDoc, getDoc, onSnapshot} from "firebase/firestore";
import {ref, uploadBytes} from "firebase/storage";
import {getFunctions, httpsCallable} from "firebase/functions";
import {MdMic, MdStop, MdBook, MdClose, MdDelete, MdCheckCircle, MdError} from "react-icons/md";
import {getUserUid} from "../utils/authManager";
import {validateAudioFile} from "../utils/validation";
import {generateMemoInsight} from "../services/insightService";
import {analyzeAudioQuality, formatAudioMetrics, type AudioQualityMetrics} from "../utils/audioQuality";
import {executeWithRetry, generateIdempotencyKey} from "../utils/httpClient";
import {getNetworkManager} from "../utils/networkManager";
import {getBestCodec, validateAudioBlob, getFileExtension, logCodecInfo} from "../utils/audioCodec";
import {logError, logInfo} from "../utils/errorHandler";
import {Button, Card, Badge, Modal} from "./index";
import "../styles/UploadRecorder.css";

interface MemoItem {
  id: string;
  memoId: string;
  userName: string;
  transcript: string;
  createdAt: any;
  audioSize: number;
  tags?: string[];
  status?: string;
}

interface UploadRecorderProps {
  userName: string;
}

export default function UploadRecorder({userName}: UploadRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<{type: "success" | "error"; text: string} | null>(null);
  const [memos, setMemos] = useState<MemoItem[]>([]);
  const [selectedMemo, setSelectedMemo] = useState<MemoItem | null>(null);
  const [loadingMemos, setLoadingMemos] = useState(false);
  const [audioQuality, setAudioQuality] = useState<AudioQualityMetrics | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const recordingStartTimeRef = useRef<number>(0);
  const qualityCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load memos from Firestore
  const loadMemos = () => {
    try {
      setLoadingMemos(true);
      const uid = getUserUid();
      if (!uid) {
        setLoadingMemos(false);
        return;
      }

      const memosRef = collection(db, "users", uid, "memos");
      const q = query(memosRef, orderBy("createdAt", "desc"));

      // Use onSnapshot for real-time updates
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const loadedMemos: MemoItem[] = snapshot.docs.map((doc) => ({
          id: doc.id,
          memoId: doc.data().memoId,
          userName: doc.data().userName,
          transcript: doc.data().transcript,
          createdAt: doc.data().createdAt,
          audioSize: doc.data().audioSize,
          tags: doc.data().tags || [],
          status: doc.data().status || "pending",
        }));

        setMemos(loadedMemos);
        setLoadingMemos(false);
      }, (error) => {
        console.error("Failed to load memos:", error);
        setLoadingMemos(false);
      });

      return unsubscribe;
    } catch (error) {
      console.error("Failed to load memos:", error);
      setLoadingMemos(false);
    }
  };

  useEffect(() => {
    const unsubscribe = loadMemos();
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      // Log codec support for debugging
      logCodecInfo();

      // Request high-quality audio with professional settings
      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: {ideal: 48000, min: 16000},
          channelCount: {ideal: 1},
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      // Log actual audio settings for debugging
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        const settings = audioTrack.getSettings?.();
        logInfo("Audio recording settings", {
          component: "UploadRecorder",
          action: "startRecording",
          metadata: {
            sampleRate: settings?.sampleRate,
            channelCount: settings?.channelCount,
            echoCancellation: settings?.echoCancellation,
            noiseSuppression: settings?.noiseSuppression,
            autoGainControl: settings?.autoGainControl,
          },
        });
      }

      // Setup audio context for quality monitoring
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyzer = audioContext.createAnalyser();
      analyzer.fftSize = 2048;
      source.connect(analyzer);
      analyzerRef.current = analyzer;

      recordingStartTimeRef.current = Date.now();
      setRecordingDuration(0);

      // Use best supported codec with automatic fallback
      const bestCodec = getBestCodec();
      const selectedMime = bestCodec?.mimeType || "";

      logInfo(`Selected audio codec: ${selectedMime || "browser default"}`, {
        component: "UploadRecorder",
        action: "startRecording",
      });

      // Use timeslice for better streaming and error recovery
      const mediaRecorder = new MediaRecorder(stream, selectedMime ? {mimeType: selectedMime} : {});

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onerror = (e) => {
        console.error("MediaRecorder error:", e.error);
        setMessage({type: "error", text: `Recording error: ${e.error}`});
        setRecording(false);
        stream.getTracks().forEach((track) => track.stop());
        if (qualityCheckIntervalRef.current) {
          clearInterval(qualityCheckIntervalRef.current);
        }
      };

      mediaRecorder.start(1000);
      mediaRecorderRef.current = mediaRecorder;
      setRecording(true);
      setMessage(null);

      // Monitor audio quality in real-time
      if (analyzerRef.current) {
        qualityCheckIntervalRef.current = setInterval(() => {
          const analyzer = analyzerRef.current;
          if (analyzer) {
            const dataArray = new Uint8Array(analyzer.frequencyBinCount);
            analyzer.getByteFrequencyData(dataArray);
            const float32Data = new Float32Array(dataArray.length);
            for (let i = 0; i < dataArray.length; i++) {
              float32Data[i] = (dataArray[i] - 128) / 128;
            }
            const metrics = analyzeAudioQuality(float32Data, 48000);
            setAudioQuality(metrics);
          }
          const elapsed = Math.floor((Date.now() - recordingStartTimeRef.current) / 1000);
          setRecordingDuration(elapsed);
        }, 500);
      }
    } catch (error: any) {
      const errorMsg = error.message || "Failed to start recording";
      console.error("Recording start error:", error);

      // Provide specific error messages for common issues
      let userMessage = errorMsg;
      if (errorMsg.includes("NotAllowedError")) {
        userMessage = "Microphone access denied. Please allow microphone access in your browser settings.";
      } else if (errorMsg.includes("NotFoundError")) {
        userMessage = "No microphone found. Please connect a microphone and try again.";
      } else if (errorMsg.includes("NotReadableError")) {
        userMessage = "Microphone is in use by another application. Please close other apps using the microphone.";
      }

      setMessage({type: "error", text: userMessage});
    }
  };

  const stopRecording = async () => {
    if (!mediaRecorderRef.current) return;

    const mediaRecorder = mediaRecorderRef.current;

    // Clean up quality monitoring
    if (qualityCheckIntervalRef.current) {
      clearInterval(qualityCheckIntervalRef.current);
      qualityCheckIntervalRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    console.log("Stopping recording. Chunks collected:", chunksRef.current.length);

    // Stop all audio tracks to ensure clean shutdown
    mediaRecorder.stream.getTracks().forEach((track) => {
      track.stop();
    });

    await new Promise<void>((resolve) => {
      mediaRecorder.onstop = () => {
        console.log("MediaRecorder stopped. Final chunks:", chunksRef.current.length);
        resolve();
      };
      mediaRecorder.stop();
    });

    // Determine MIME type from mediaRecorder
    let mimeType = mediaRecorder.mimeType || "audio/webm";
    // Normalize MIME type by removing codec specifications (e.g., "audio/webm;codecs=opus" -> "audio/webm")
    const baseType = mimeType.split(";")[0];
    const blob = new Blob(chunksRef.current, {type: baseType});
    console.log("Audio blob created. Size:", blob.size, "bytes, MIME:", baseType);
    chunksRef.current = [];
    setRecording(false);

    // Upload to Firebase Storage
    await uploadAudio(blob);
  };

  const uploadAudio = async (blob: Blob) => {
    setUploading(true);
    setProgress(0);
    let uploadStartTime = Date.now();

    try {
      logInfo(`Starting audio upload. Size: ${blob.size} bytes, type: ${blob.type}`, {
        component: "UploadRecorder",
        action: "uploadAudio",
      });

      // Validate audio blob with codec-aware checks
      const blobValidation = validateAudioBlob(blob);
      if (!blobValidation.valid) {
        logError("Audio blob validation failed", new Error(blobValidation.error), {
          component: "UploadRecorder",
          action: "uploadAudio",
        });
        setMessage({type: "error", text: blobValidation.error || "Invalid audio file"});
        setUploading(false);
        return;
      }

      // Also validate with legacy validation for compatibility
      const validation = validateAudioFile(blob);
      if (!validation.valid) {
        logError("Audio file validation failed", new Error(validation.error), {
          component: "UploadRecorder",
          action: "uploadAudio",
        });
        setMessage({type: "error", text: validation.error || "Invalid audio file"});
        setUploading(false);
        return;
      }

      logInfo("Audio validation passed", {component: "UploadRecorder", action: "uploadAudio"});

      // Get user ID
      const uid = getUserUid();
      if (!uid) {
        setMessage({type: "error", text: "User not authenticated"});
        setUploading(false);
        return;
      }

      // Check network status
      const networkManager = getNetworkManager();
      const networkState = networkManager.getState();
      if (!networkState.isOnline) {
        setMessage({type: "error", text: "No internet connection. Please check your network."});
        setUploading(false);
        return;
      }

      if (!networkManager.isGoodForUploads()) {
        logInfo("Network quality is poor for uploads", {
          component: "UploadRecorder",
          action: "uploadAudio",
          metadata: networkState,
        });
      }

      const memoId = crypto.randomUUID();
      const idempotencyKey = generateIdempotencyKey({uid, memoId, blobSize: blob.size});

      // Determine file extension using codec-aware function
      const fileExt = getFileExtension(blob.type);

      // Upload audio to Firebase Storage with retry logic
      setProgress(25);
      const audioPath = `audio/${uid}/${memoId}.${fileExt}`;
      const audioRef = ref(storage, audioPath);

      // Use executeWithRetry for robust upload with deduplication
      await executeWithRetry(
        async () => {
          return uploadBytes(audioRef, blob, {
            customMetadata: {
              userName: userName,
              memoId: memoId,
              uploadStartTime: uploadStartTime.toString(),
              audioQuality: audioQuality ? audioQuality.qualityScore.toString() : "unknown",
            },
          });
        },
        {
          idempotencyKey,
          timeout: 300000, // 5 minutes
          retryConfig: {
            maxAttempts: 3,
            initialDelayMs: 1000,
            maxDelayMs: 10000,
            backoffMultiplier: 2,
            jitterFactor: 0.1,
          },
        }
      );

      console.log("Upload successful");

      setProgress(50);

      // Create memo document in Firestore with "pending" status
      // The Cloud Function will update it with the transcript
      // Use memoId as the document ID so Cloud Function can find it
      const memoDocRef = doc(db, "users", uid, "memos", memoId);
      console.log("Creating memo document:", {uid, memoId, audioPath});

      await setDoc(memoDocRef, {
        memoId: memoId,
        userName: userName,
        transcript: "", // Will be filled by Cloud Function
        contentType: blob.type,
        audioSize: blob.size,
        storagePath: audioPath,
        createdAt: serverTimestamp(),
        status: "pending", // Waiting for transcription
        indexed: false,
      });

      console.log("Memo document created successfully");
      setProgress(75);

      // Poll for transcript (Cloud Function will update the document)
      let attempts = 0;
      const maxAttempts = 600; // 10 minutes max
      let transcriptReceived = false;
      let transcriptionError = false;
      let lastProgressUpdate = 75;
      let lastStatusUpdate = 0;
      let cloudFunctionTriggered = false;
      let pollInterval = 1000; // Start with 1 second, increase with backoff
      let consecutiveErrors = 0;
      const maxConsecutiveErrors = 5;

      while (attempts < maxAttempts && !transcriptReceived && !transcriptionError) {
        try {
          // Exponential backoff: increase poll interval over time
          if (attempts > 30) {
            pollInterval = Math.min(5000, 1000 + attempts * 50); // Max 5 seconds
          }

          await new Promise((resolve) => setTimeout(resolve, pollInterval));
          attempts++;

          // Get the document directly by ID (memoId is now the document ID)
          const memoDocRef = doc(db, "users", uid, "memos", memoId);

          try {
            const docSnapshot = await getDoc(memoDocRef);

            if (docSnapshot.exists()) {
              const memoData = docSnapshot.data();
              consecutiveErrors = 0; // Reset error counter on success

              // Validate data structure
              if (!memoData || typeof memoData !== "object") {
                console.warn("Invalid memo data structure");
                continue;
              }

              // Check if Cloud Function has been triggered
              if (memoData.status === "transcribing" || memoData.status === "transcribed" || memoData.status === "error") {
                cloudFunctionTriggered = true;
              }

              // Check for transcription error
              if (memoData.status === "error") {
                transcriptionError = true;
                const errorMsg = memoData.errorMessage || "Unknown error";
                const errorDetails = memoData.errorDetails ? ` (${memoData.errorDetails})` : "";
                setMessage({
                  type: "error",
                  text: `Transcription failed: ${String(errorMsg).substring(0, 100)}${errorDetails}`,
                });
              }
              // Check for successful transcription
              else if (memoData.transcript && memoData.status === "transcribed") {
                transcriptReceived = true;
                setProgress(100);
                const wordCount = memoData.wordCount || 0;
                const confidence = Math.round((memoData.confidence || 0) * 100);
                const qualityScore = memoData.qualityScore || 0;
                setMessage({
                  type: "success",
                  text: `Memo transcribed successfully! (${wordCount} words, ${confidence}% confidence, quality: ${qualityScore}%)`,
                });
              }
              // Update progress while transcribing
              else if (memoData.status === "transcribing") {
                // Gradually increase progress from 75% to 95% while transcribing
                const progressIncrement = Math.min(20 / maxAttempts, 0.2);
                lastProgressUpdate = Math.min(lastProgressUpdate + progressIncrement, 95);
                setProgress(Math.round(lastProgressUpdate));

                // Log status every 10 seconds
                if (attempts - lastStatusUpdate >= 10) {
                  console.log(`Transcription in progress... (${attempts}s elapsed, progress: ${Math.round(lastProgressUpdate)}%)`);
                  lastStatusUpdate = attempts;
                }
              }
            } else {
              console.warn("Memo document not found yet");
            }

            // If Cloud Function hasn't been triggered after 30 seconds, warn user
            if (attempts === 30 && !cloudFunctionTriggered) {
              console.warn("Cloud Function may not have been triggered. Check Firebase logs.");
              setMessage({
                type: "error",
                text: "Upload processing is taking longer than expected. Cloud Function may not be deployed.",
              });
            }
          } catch (getDocError) {
            consecutiveErrors++;
            console.error(`Error fetching memo document (attempt ${consecutiveErrors}/${maxConsecutiveErrors}):`, getDocError);

            if (consecutiveErrors >= maxConsecutiveErrors) {
              throw new Error(`Failed to fetch memo status after ${maxConsecutiveErrors} consecutive attempts`);
            }
          }
        } catch (pollError: any) {
          console.error("Error during polling:", pollError);
          transcriptionError = true;
          setMessage({
            type: "error",
            text: `Polling error: ${pollError.message || "Unknown error"}. Please check the browser console for details.`,
          });
        }
      }

      if (!transcriptReceived && !transcriptionError) {
        if (!cloudFunctionTriggered) {
          // Cloud Function wasn't triggered
          console.error("Cloud Function not triggered. Cloud Functions may not be deployed.");
          setMessage({
            type: "error",
            text: "Transcription service is not available. Please ensure Cloud Functions are deployed.",
          });
        } else {
          const timeoutMsg = `Transcription timed out after ${Math.round(attempts / 60)} minutes. The audio file may be too long.`;
          setMessage({
            type: "error",
            text: timeoutMsg,
          });
        }
      }

      setProgress(0);
      // Refresh memo list
      await loadMemos();
    } catch (error: any) {
      setMessage({type: "error", text: error.message || "Upload failed"});
    } finally {
      setUploading(false);
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "Unknown";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"});
  };

  const deleteMemo = async (memo: MemoItem) => {
    try {
      const uid = getUserUid();
      if (!uid) {
        setMessage({type: "error", text: "User not authenticated"});
        return;
      }

      const functions = getFunctions();
      const deleteMemoCaller = httpsCallable(functions, "deleteMemo");
      await deleteMemoCaller({memoId: memo.memoId});

      // Remove from local state
      setMemos(memos.filter((m) => m.id !== memo.id));
      setMessage({type: "success", text: "Memo deleted successfully"});
    } catch (error) {
      console.error("Failed to delete memo:", error);
      setMessage({type: "error", text: "Failed to delete memo"});
    }
  };

  return (
    <div className="recorder-container">
      <div className="recorder-card">
        <h2>Record a Voice Memo</h2>

        {message && (
          <div className={`message ${message.type}`}>
            <div style={{display: "flex", alignItems: "center", gap: "8px"}}>
              {message.type === "success" ? (
                <MdCheckCircle size={20} />
              ) : (
                <MdError size={20} />
              )}
              {message.text}
            </div>
          </div>
        )}

        <div className="recorder-controls">
          <Button
            variant="primary"
            size="md"
            onClick={startRecording}
            disabled={recording || uploading}
          >
            <span style={{display: "inline-flex", alignItems: "center", marginRight: "8px"}}>
              <MdMic size={20} />
            </span>
            {recording ? "Recording..." : "Record"}
          </Button>

          <Button
            variant="success"
            size="md"
            onClick={stopRecording}
            disabled={!recording || uploading}
          >
            <span style={{display: "inline-flex", alignItems: "center", marginRight: "8px"}}>
              <MdStop size={20} />
            </span>
            Finish
          </Button>
        </div>

        {recording && audioQuality && (
          <div style={{
            marginTop: "16px",
            padding: "12px",
            backgroundColor: "#f5f5f5",
            borderRadius: "8px",
            fontSize: "12px",
            fontFamily: "monospace",
          }}>
            <div style={{marginBottom: "8px", fontWeight: "bold"}}>
              Recording: {recordingDuration}s | Quality: {audioQuality.qualityScore}% | Level: {audioQuality.audioLevel}
            </div>
            <div style={{fontSize: "11px", color: "#666"}}>
              SNR: {audioQuality.signalToNoise.toFixed(1)}dB | Clipping: {audioQuality.clipping.toFixed(1)}% |
              Silence: {audioQuality.silenceRatio.toFixed(1)}%
            </div>
          </div>
        )}

        {uploading && (
          <div className="progress-container">
            <div className="progress-bar">
              <div className="progress-fill" style={{width: `${progress}%`}}></div>
            </div>
            <p>{progress}%</p>
          </div>
        )}

        <div className="info">
          <p>Tip: Record your thoughts, ideas, or notes. They'll be transcribed and indexed for easy searching.</p>
        </div>
      </div>

      {/* Memo History Section */}
      <div className="memo-history">
        <div className="memo-history-header">
          <h3><MdBook size={24} /> Your Voice Memos ({memos.length})</h3>
        </div>
        {loadingMemos ? (
          <p className="loading">Loading memos...</p>
        ) : memos.length === 0 ? (
          <p className="empty-state">
            No memos yet. Start recording to create your first memo!
          </p>
        ) : (
          <div className="memos-list">
            {memos.map((memo) => {
              const insight = generateMemoInsight(memo);
              const transcriptPreview = memo.transcript ? memo.transcript.substring(0, 150) : "(No transcript yet)";
              const statusBadge = memo.status === "pending" ? "⏳ Pending" :
                                 memo.status === "transcribing" ? "🔄 Transcribing" :
                                 memo.status === "error" ? "❌ Error" : "✓ Done";

              return (
                <div
                  key={memo.id}
                  className="memo-item"
                  onClick={() => setSelectedMemo(memo)}
                  style={{
                    padding: "16px",
                    background: "#f7fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    cursor: "pointer",
                    transition: "all 0.3s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#edf2f7";
                    e.currentTarget.style.borderColor = "#667eea";
                    e.currentTarget.style.transform = "translateX(4px)";
                    e.currentTarget.style.boxShadow = "0 4px 12px rgba(102, 126, 234, 0.2)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#f7fafc";
                    e.currentTarget.style.borderColor = "#e2e8f0";
                    e.currentTarget.style.transform = "translateX(0)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  <div style={{display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px"}}>
                    <div>
                      <div style={{fontSize: "0.9em", color: "#718096", fontWeight: "600"}}>
                        {formatDate(memo.createdAt)}
                      </div>
                      <div style={{fontSize: "0.85em", color: "#a0aec0", marginTop: "4px"}}>
                        by {memo.userName}
                      </div>
                    </div>
                    <div style={{fontSize: "0.85em", padding: "4px 8px", background: "#667eea", color: "white", borderRadius: "4px"}}>
                      {statusBadge}
                    </div>
                  </div>
                  <p style={{color: "#4a5568", fontSize: "14px", margin: "8px 0", lineHeight: "1.4"}}>
                    {transcriptPreview}
                  </p>
                  <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px"}}>
                    <div style={{fontSize: "0.85em", color: "#718096"}}>
                      <span>{insight.wordCount} words</span>
                      <span style={{marginLeft: "16px"}}>{insight.readingTime} min read</span>
                    </div>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteMemo(memo);
                      }}
                      title="Delete memo"
                    >
                      <MdDelete size={18} />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Transcript Modal */}
      <Modal
        isOpen={!!selectedMemo}
        onClose={() => setSelectedMemo(null)}
        title="Memo Transcript"
        size="md"
      >
        {selectedMemo && (
          <div>
            <div style={{marginBottom: "16px", paddingBottom: "16px", borderBottom: "1px solid var(--border-color)"}}>
              <p style={{margin: "4px 0"}}>
                <strong>Date:</strong> {formatDate(selectedMemo.createdAt)}
              </p>
              <p style={{margin: "4px 0"}}>
                <strong>User:</strong> {selectedMemo.userName}
              </p>
            </div>
            <div style={{lineHeight: "1.6", whiteSpace: "pre-wrap", wordWrap: "break-word"}}>
              {selectedMemo.transcript}
            </div>
            <div style={{marginTop: "20px", display: "flex", gap: "8px", justifyContent: "flex-end"}}>
              <Button variant="primary" onClick={() => setSelectedMemo(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

