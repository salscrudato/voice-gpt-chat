import {useState} from "react";
import {MdMic, MdChat} from "react-icons/md";
import UploadRecorder from "../components/UploadRecorder";
import ChatInterface from "../components/ChatInterface";
import "../styles/ChatPage.css";

interface ChatPageProps {
  userName: string;
  onSignOut: () => void;
}

export default function ChatPage({userName, onSignOut}: ChatPageProps) {
  const [activeTab, setActiveTab] = useState<"record" | "chat">("chat");

  const handleClearName = () => {
    localStorage.removeItem("userName");
    onSignOut();
  };

  return (
    <div className="chat-page">
      <header className="chat-header">
        <h1><MdMic size={32} /> VoiceGPT</h1>
        <div className="header-right">
          <span className="user-name">{userName}</span>
          <button onClick={handleClearName} className="clear-name-btn">
            Change Name
          </button>
        </div>
      </header>

      <div className="chat-tabs">
        <button
          className={`tab ${activeTab === "record" ? "active" : ""}`}
          onClick={() => setActiveTab("record")}
        >
          <MdMic size={20} /> Record Memo
        </button>
        <button
          className={`tab ${activeTab === "chat" ? "active" : ""}`}
          onClick={() => setActiveTab("chat")}
        >
          <MdChat size={20} /> Chat
        </button>
      </div>

      <div className="chat-content">
        {activeTab === "record" ? (
          <UploadRecorder userName={userName} />
        ) : (
          <ChatInterface />
        )}
      </div>
    </div>
  );
}

