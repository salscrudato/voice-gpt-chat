import React from "react";
import "../styles/components/Input.css";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: React.ReactNode;
  fullWidth?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      icon,
      fullWidth = false,
      className = "",
      ...props
    },
    ref
  ) => {
    return (
      <div className={`input-wrapper ${fullWidth ? "input-full-width" : ""}`}>
        {label && (
          <label className="input-label" htmlFor={props.id}>
            {label}
            {props.required && <span className="input-required">*</span>}
          </label>
        )}
        <div className="input-container">
          {icon && <span className="input-icon">{icon}</span>}
          <input
            ref={ref}
            className={`input ${error ? "input-error" : ""} ${icon ? "input-with-icon" : ""} ${className}`}
            {...props}
          />
        </div>
        {error && <span className="input-error-text">{error}</span>}
        {helperText && !error && (
          <span className="input-helper-text">{helperText}</span>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

