import React from "react";
import "../styles/components/TypingIndicator.css";

interface TypingIndicatorProps {
  variant?: "default" | "compact";
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({ variant = "default" }) => {
  return (
    <div className={`typing-indicator typing-indicator-${variant}`}>
      <div className="typing-dot" />
      <div className="typing-dot" />
      <div className="typing-dot" />
    </div>
  );
};

export default TypingIndicator;

