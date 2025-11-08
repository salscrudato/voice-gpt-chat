import React from "react";
import "../styles/components/Card.css";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  hoverable?: boolean;
  clickable?: boolean;
  padding?: "sm" | "md" | "lg";
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  (
    {
      children,
      hoverable = false,
      clickable = false,
      padding = "md",
      className = "",
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={`card card-padding-${padding} ${hoverable ? "card-hoverable" : ""} ${
          clickable ? "card-clickable" : ""
        } ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);
Card.displayName = "Card";

