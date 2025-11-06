import React from "react";
import "../styles/components/Card.css";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  hoverable?: boolean;
  clickable?: boolean;
  padding?: "sm" | "md" | "lg";
}

interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

interface CardBodyProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

// Define subcomponents first
const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(
  ({children, className = "", ...props}, ref) => (
    <div ref={ref} className={`card-header ${className}`} {...props}>
      {children}
    </div>
  )
);
CardHeader.displayName = "CardHeader";

const CardBody = React.forwardRef<HTMLDivElement, CardBodyProps>(
  ({children, className = "", ...props}, ref) => (
    <div ref={ref} className={`card-body ${className}`} {...props}>
      {children}
    </div>
  )
);
CardBody.displayName = "CardBody";

const CardFooter = React.forwardRef<HTMLDivElement, CardFooterProps>(
  ({children, className = "", ...props}, ref) => (
    <div ref={ref} className={`card-footer ${className}`} {...props}>
      {children}
    </div>
  )
);
CardFooter.displayName = "CardFooter";

// Define main Card component
const CardComponent = React.forwardRef<HTMLDivElement, CardProps>(
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
CardComponent.displayName = "Card";

// Attach subcomponents and export
export const Card = Object.assign(CardComponent, {
  Header: CardHeader,
  Body: CardBody,
  Footer: CardFooter,
});

export { CardHeader, CardBody, CardFooter };

