import {useState} from "react";
import {MdMic} from "react-icons/md";
import {setUserName} from "../utils/userManager";
import {validateUserName} from "../utils/validation";
import "../styles/LandingPage.css";

interface LandingPageProps {
  onNameSet: (name: string) => void;
}

export default function LandingPage({onNameSet}: LandingPageProps) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleContinue = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate user name
    const validation = validateUserName(name);
    if (!validation.valid) {
      setError(validation.error || "Invalid name");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Store name using user manager
      const success = setUserName(name);
      if (!success) {
        setError("Failed to save name");
        return;
      }

      onNameSet(name.trim());
    } catch (err: any) {
      setError(err.message || "Failed to save name");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="landing-container">
      <div className="landing-card">
        <h1><MdMic size={40} /> Welcome to VoiceGPT</h1>
        <p className="subtitle">Let's get started!</p>

        <form onSubmit={handleContinue} className="name-form">
          <div className="form-group">
            <label htmlFor="name">What's your name?</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              placeholder="Enter your name"
              disabled={loading}
              autoFocus
              maxLength={50}
            />
            <p className="char-count">{name.length}/50</p>
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" disabled={loading} className="continue-btn">
            {loading ? "Continuing..." : "Continue"}
          </button>
        </form>

        <div className="info-section">
          <h3>Your voice memos will be tagged with:</h3>
          <div className="info-box">
            <p>
              <strong>Name:</strong> {name || "Your name"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

