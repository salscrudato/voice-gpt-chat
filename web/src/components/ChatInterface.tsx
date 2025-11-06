import {useEffect, useRef, useState} from "react";
import {MdChat, MdSend, MdError, MdDelete, MdRefresh} from "react-icons/md";
import {getUserId} from "../utils/userManager";
import {validateChatMessage} from "../utils/validation";
import {Button, Card, Badge, Input} from "./index";
import {createChatSession, addMessageToSession, getChatSessions} from "../services/chatSessionService";
import {ChatSession, ChatMessage} from "../types";
import "../styles/ChatInterface.css";

const CHAT_API_URL = import.meta.env.VITE_CHAT_API_URL || "http://localhost:8080/chat";

export default function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [showSessions, setShowSessions] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const userId = getUserId();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({behavior: "smooth"});
  };

  // Load sessions on mount
  useEffect(() => {
    const loadSessions = async () => {
      try {
        const loadedSessions = await getChatSessions(userId);
        setSessions(loadedSessions);
        if (loadedSessions.length > 0 && !currentSession) {
          setCurrentSession(loadedSessions[0]);
          setMessages(loadedSessions[0].messages || []);
        }
      } catch (err) {
        console.error("Failed to load sessions:", err);
      }
    };
    loadSessions();
  }, [userId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Create new session
  const handleNewSession = async () => {
    try {
      const title = `Conversation ${new Date().toLocaleDateString()}`;
      const session = await createChatSession(userId, title);
      setCurrentSession(session);
      setMessages([]);
      setSessions([session, ...sessions]);
      setShowSessions(false);
    } catch (err) {
      setError("Failed to create new session");
    }
  };

  // Switch to session
  const handleSwitchSession = (session: ChatSession) => {
    setCurrentSession(session);
    setMessages(session.messages || []);
    setShowSessions(false);
  };

  // Clear current session
  const handleClearSession = () => {
    setMessages([]);
    setError(null);
  };



  const sendMessage = async () => {
    // Validate message
    const validation = validateChatMessage(input);
    if (!validation.valid) {
      setError(validation.error || "Invalid message");
      return;
    }

    // Create session if needed
    if (!currentSession) {
      try {
        const title = `Conversation ${new Date().toLocaleDateString()}`;
        const session = await createChatSession(userId, title);
        setCurrentSession(session);
        setSessions([session, ...sessions]);
      } catch (err) {
        setError("Failed to create session");
        return;
      }
    }

    const userMessage: ChatMessage = {role: "user", content: input, timestamp: new Date()};
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const payload = {messages: [...messages, userMessage]};
      let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout

        console.log("Sending chat request to:", CHAT_API_URL);

        let response: Response;
        try {
          response = await fetch(CHAT_API_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-user-id": userId,
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });
        } catch (fetchError: any) {
          clearTimeout(timeoutId);
          // Handle connection errors
          if (fetchError.name === "AbortError") {
            throw new Error("Chat API request timed out. The service may be overloaded.");
          }
          if (fetchError.message?.includes("Failed to fetch") || fetchError.message?.includes("ERR_CONNECTION_REFUSED")) {
            throw new Error(
              `Cannot connect to Chat API at ${CHAT_API_URL}. ` +
              `Make sure the Chat API service is running. ` +
              `Run: npm run dev in the services/chat-api directory.`
            );
          }
          throw fetchError;
        }

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API error: ${response.status} ${response.statusText} - ${errorText.substring(0, 100)}`);
        }

        if (!response.body) {
          throw new Error("No response body from API");
        }

        reader = response.body.getReader();
        const decoder = new TextDecoder();
        let assistantContent = "";
        let citations: any[] = [];
        let buffer = "";

        const assistantMessage: ChatMessage = {role: "assistant", content: "", citations: [], timestamp: new Date()};
        setMessages((prev) => [...prev, assistantMessage]);

        try {
          while (true) {
            const {value, done} = await reader.read();
            if (done) break;

            const text = decoder.decode(value, {stream: true});
            buffer += text;

            // Process complete lines
            const lines = buffer.split("\n\n");
            buffer = lines[lines.length - 1]; // Keep incomplete line in buffer

            for (let i = 0; i < lines.length - 1; i++) {
              const line = lines[i];
              if (!line.startsWith("data:")) continue;

              try {
                const jsonStr = line.slice(5).trim();
                if (!jsonStr) continue;

                const data = JSON.parse(jsonStr);

                if (data.type === "citations" && Array.isArray(data.citations)) {
                  citations = data.citations;
                } else if (data.type === "delta" && typeof data.delta === "string") {
                  assistantContent += data.delta;
                  setMessages((prev) => {
                    const copy = [...prev];
                    if (copy.length > 0) {
                      copy[copy.length - 1] = {
                        role: "assistant",
                        content: assistantContent,
                        citations,
                        timestamp: new Date(),
                      };
                    }
                    return copy;
                  });
                } else if (data.type === "done") {
                  console.log("Chat stream completed successfully");
                } else if (data.type === "error") {
                  console.error("Stream error from API:", data.error);
                  throw new Error(data.error || "Stream error");
                }
              } catch (parseError) {
                console.warn("Failed to parse stream data:", parseError);
              }
            }
          }
        } finally {
          reader?.cancel();
        }

        // Persist assistant message to session
        if (currentSession && assistantContent) {
          try {
            await addMessageToSession(userId, currentSession.id, {
              role: "assistant",
              content: assistantContent,
              citations,
            });
          } catch (err) {
            console.error("Failed to persist message:", err);
          }
        }
      } catch (apiError: any) {
        // Clean up reader on error
        if (reader) {
          try {
            reader.cancel();
          } catch (e) {
            // Ignore cancel errors
          }
        }

        // Re-throw API errors - no mock fallback
        throw apiError;
      }
    } catch (err: any) {
      const errorMsg = err.message || "Failed to send message";
      setError(errorMsg);
      setMessages((prev) => prev.slice(0, -1)); // Remove user message on error
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="chat-interface">
      <div className="chat-header-controls" style={{padding: "12px", borderBottom: "1px solid var(--border-color)", display: "flex", gap: "8px", alignItems: "center"}}>
        <Button size="sm" variant="secondary" onClick={() => setShowSessions(!showSessions)}>
          {showSessions ? "Hide" : "Sessions"} ({sessions.length})
        </Button>
        <Button size="sm" variant="primary" onClick={handleNewSession}>
          New Chat
        </Button>
        {messages.length > 0 && (
          <Button size="sm" variant="ghost" onClick={handleClearSession} icon={<MdRefresh />}>
            Clear
          </Button>
        )}
      </div>

      {showSessions && (
        <div style={{padding: "12px", borderBottom: "1px solid var(--border-color)", maxHeight: "200px", overflowY: "auto", backgroundColor: "var(--bg-secondary)"}}>
          {sessions.length === 0 ? (
            <p style={{margin: 0, fontSize: "0.9em", color: "var(--text-secondary)"}}>No sessions yet</p>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                onClick={() => handleSwitchSession(session)}
                style={{
                  padding: "8px",
                  marginBottom: "4px",
                  backgroundColor: currentSession?.id === session.id ? "var(--primary-color)" : "var(--card-bg)",
                  color: currentSession?.id === session.id ? "white" : "var(--text-primary)",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "0.9em",
                }}
              >
                {session.title}
              </div>
            ))
          )}
        </div>
      )}

      <div className="messages-container">
        {messages.length === 0 && (
          <div className="empty-state">
            <MdChat size={48} />
            <p>Start a conversation about your voice memos!</p>
            <p>Ask questions and get answers based on your recorded notes.</p>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`message message-${msg.role}`}
          >
            <div className={`message-content message-content-${msg.role}`}>
              <div className="message-text">{msg.content}</div>
              {msg.citations && msg.citations.length > 0 && (
                <div className="message-citations">
                  <div className="citations-label">Sources:</div>
                  <div className="citations-list">
                    {msg.citations.map((citation, cidx) => (
                      <Badge key={cidx} variant="secondary" size="sm">
                        Memo {citation.memoId.substring(0, 8)}... (chunk {citation.chunkIndex})
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {error && (
          <div className="error-message-container">
            <MdError size={20} />
            {error}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="input-container">
        <div className="chat-input">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && !loading && sendMessage()}
            placeholder="Ask about your voice memos..."
            disabled={loading}
            className="chat-input-field"
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="send-btn"
            title="Send message"
          >
            <MdSend size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

