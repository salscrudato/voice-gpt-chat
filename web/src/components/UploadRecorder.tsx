import {useRef, useState, useEffect} from "react";
import {db, storage} from "../firebase";
import {collection, serverTimestamp, query, where, getDocs, orderBy, doc, updateDoc, setDoc, getDoc, onSnapshot} from "firebase/firestore";
import {ref, uploadBytes} from "firebase/storage";
import {getFunctions, httpsCallable} from "firebase/functions";
import {MdMic, MdStop, MdBook, MdClose, MdDelete, MdCheckCircle, MdError} from "react-icons/md";
import {getUserUid} from "../utils/authManager";
import {validateAudioFile} from "../utils/validation";
import {generateMemoInsight} from "../services/insightService";
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

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

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
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const mediaRecorder = new MediaRecorder(stream, {mimeType: "audio/webm"});

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onerror = (e) => {
        console.error("MediaRecorder error:", e.error);
        setMessage({type: "error", text: `Recording error: ${e.error}`});
        setRecording(false);
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setRecording(true);
      setMessage(null);
    } catch (error: any) {
      setMessage({type: "error", text: error.message || "Failed to start recording"});
    }
  };

  const stopRecording = async () => {
    if (!mediaRecorderRef.current) return;

    const mediaRecorder = mediaRecorderRef.current;

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

    const blob = new Blob(chunksRef.current, {type: "audio/webm"});
    console.log("Audio blob created. Size:", blob.size, "bytes");
    chunksRef.current = [];
    setRecording(false);

    // Upload to Firebase Storage
    await uploadAudio(blob);
  };

  const uploadAudio = async (blob: Blob) => {
    setUploading(true);
    setProgress(0);
    const abortController = new AbortController();

    try {
      console.log("Starting audio upload. Blob size:", blob.size, "bytes, type:", blob.type);

      // Validate audio file
      const validation = validateAudioFile(blob);
      if (!validation.valid) {
        console.error("Audio validation failed:", validation.error);
        setMessage({type: "error", text: validation.error || "Invalid audio file"});
        setUploading(false);
        return;
      }

      console.log("Audio validation passed");

      // Get user ID
      const uid = getUserUid();
      if (!uid) {
        setMessage({type: "error", text: "User not authenticated"});
        setUploading(false);
        return;
      }

      const memoId = crypto.randomUUID();

      // Upload audio to Firebase Storage with timeout
      setProgress(25);
      const audioPath = `audio/${uid}/${memoId}.webm`;
      const audioRef = ref(storage, audioPath);

      const uploadPromise = uploadBytes(audioRef, blob, {
        customMetadata: {
          userName: userName,
          memoId: memoId,
        },
      });

      // Add timeout for upload
      const uploadWithTimeout = Promise.race([
        uploadPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Upload timeout after 5 minutes")), 300000)
        ),
      ]);

      await uploadWithTimeout;

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
        contentType: "audio/webm",
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
          const docSnapshot = await getDoc(memoDocRef);

          if (docSnapshot.exists()) {
            const memoData = docSnapshot.data();

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
              setMessage({
                type: "error",
                text: `Transcription failed: ${String(errorMsg).substring(0, 100)}`,
              });
            }
            // Check for successful transcription
            else if (memoData.transcript && memoData.status === "transcribed") {
              transcriptReceived = true;
              setProgress(100);
              const wordCount = memoData.wordCount || 0;
              const confidence = Math.round((memoData.confidence || 0) * 100);
              setMessage({
                type: "success",
                text: `Memo transcribed successfully! (${wordCount} words, ${confidence}% confidence)`,
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
        } catch (pollError) {
          console.error("Error during polling:", pollError);
          // Continue polling even if there's an error
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
            {recording ? "Recording..." : "Start Recording"}
          </Button>

          <Button
            variant="danger"
            size="md"
            onClick={stopRecording}
            disabled={!recording || uploading}
          >
            <span style={{display: "inline-flex", alignItems: "center", marginRight: "8px"}}>
              <MdStop size={20} />
            </span>
            Stop & Upload
          </Button>
        </div>

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

