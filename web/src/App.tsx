import {useEffect, useState} from "react";
import "./styles/tailwind.css";
import "./styles/design-system.css";
import "./styles/responsive.css";
import "./App.css";
import LandingPage from "./pages/LandingPage";
import ChatPage from "./pages/ChatPage";
import {initializeTheme} from "./utils/themeManager";
import {getUserName} from "./utils/userManager";

function App() {
  const [userName, setUserName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initialize theme
    initializeTheme();

    // Load user name from localStorage on app start
    const storedName = getUserName();
    setUserName(storedName);
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <div className="app-container">
        <div className="loading">Loading...</div>
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

