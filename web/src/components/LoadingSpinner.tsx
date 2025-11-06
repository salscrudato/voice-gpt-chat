/**
 * Loading Spinner Component - Modern loading indicator
 */

import React from "react";
import "../styles/components/LoadingSpinner.css";

export type SpinnerSize = "sm" | "md" | "lg";
export type SpinnerVariant = "primary" | "secondary" | "success" | "error";

interface LoadingSpinnerProps {
  size?: SpinnerSize;
  variant?: SpinnerVariant;
  label?: string;
  fullScreen?: boolean;
}

export const LoadingSpinner = React.forwardRef<HTMLDivElement, LoadingSpinnerProps>(
  ({size = "md", variant = "primary", label, fullScreen = false}, ref) => {
    const spinnerContent = (
      <div className={`spinner spinner-${size} spinner-${variant}`}>
        <div className="spinner-ring"></div>
        <div className="spinner-ring"></div>
        <div className="spinner-ring"></div>
        <div className="spinner-ring"></div>
        {label && <p className="spinner-label">{label}</p>}
      </div>
    );

    if (fullScreen) {
      return (
        <div ref={ref} className="spinner-fullscreen">
          <div className="spinner-overlay"></div>
          {spinnerContent}
        </div>
      );
    }

    return <div ref={ref}>{spinnerContent}</div>;
  }
);

LoadingSpinner.displayName = "LoadingSpinner";

/**
 * Skeleton Loader Component - Placeholder while loading
 */
interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  count?: number;
  circle?: boolean;
  className?: string;
}

export const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({width = "100%", height = "20px", count = 1, circle = false, className = ""}, ref) => {
    const items = Array.from({length: count});

    return (
      <div ref={ref}>
        {items.map((_, idx) => (
          <div
            key={idx}
            className={`skeleton ${circle ? "skeleton-circle" : ""} ${className}`}
            style={{
              width: typeof width === "number" ? `${width}px` : width,
              height: typeof height === "number" ? `${height}px` : height,
              marginBottom: idx < count - 1 ? "12px" : "0",
            }}
          />
        ))}
      </div>
    );
  }
);

Skeleton.displayName = "Skeleton";

