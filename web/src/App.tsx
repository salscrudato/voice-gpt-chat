import {useEffect, useState} from "react";
import "./styles/tailwind.css";
import "./styles/design-system.css";
import "./styles/responsive.css";
import "./App.css";
import LandingPage from "./pages/LandingPage";
import ChatPage from "./pages/ChatPage";
import {initializeTheme} from "./utils/themeManager";
import {getUserName} from "./utils/userManager";
import {ensureSignedIn} from "./utils/authManager";

function App() {
  const [userName, setUserName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Initialize theme
        initializeTheme();

        // Ensure user is authenticated (anonymous or otherwise)
        await ensureSignedIn();

        // Load user name from localStorage on app start
        const storedName = getUserName();
        setUserName(storedName);
      } catch (error) {
        console.error("Failed to initialize app:", error);
        setAuthError("Failed to initialize authentication. Please refresh the page.");
      } finally {
        setLoading(false);
      }
    };

    initializeApp();
  }, []);

  if (loading) {
    return (
      <div className="app-container">
        <div className="loading">Initializing...</div>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="app-container">
        <div style={{padding: "20px", color: "red", textAlign: "center"}}>
          <p>{authError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {!userName ? (
        <LandingPage onNameSet={setUserName} />
      ) : (
        <ChatPage userName={userName} onSignOut={() => setUserName(null)} />
      )}
    </div>
  );
}

export default App;

