import React from "react";
import "../styles/components/Badge.css";

export type BadgeVariant = "primary" | "secondary" | "success" | "warning" | "error" | "info";
export type BadgeSize = "sm" | "md" | "lg";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  icon?: React.ReactNode;
  removable?: boolean;
  onRemove?: () => void;
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  (
    {
      children,
      variant = "primary",
      size = "md",
      icon,
      removable = false,
      onRemove,
      className = "",
      ...props
    },
    ref
  ) => {
    return (
      <span
        ref={ref}
        className={`badge badge-${variant} badge-${size} ${className}`}
        {...props}
      >
        {icon && <span className="badge-icon">{icon}</span>}
        <span className="badge-text">{children}</span>
        {removable && (
          <button
            className="badge-remove"
            onClick={onRemove}
            aria-label="Remove badge"
          >
            ×
          </button>
        )}
      </span>
    );
  }
);

Badge.displayName = "Badge";

