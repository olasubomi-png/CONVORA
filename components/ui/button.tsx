import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  children: ReactNode;
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" && "rounded-lg px-3 py-1.5 text-xs",
        size === "md" && "rounded-xl px-4 py-2.5 text-sm",
        size === "lg" && "rounded-xl px-5 py-3 text-sm",
        variant === "primary" &&
          "bg-[var(--cv-accent)] text-white shadow-sm hover:bg-[var(--cv-accent-hover)]",
        variant === "secondary" &&
          "border border-[var(--cv-border)] bg-white text-[var(--cv-fg)] hover:bg-[var(--cv-surface-muted)]",
        variant === "ghost" &&
          "text-[var(--cv-fg-secondary)] hover:bg-[var(--cv-surface-muted)] hover:text-[var(--cv-fg)]",
        variant === "danger" &&
          "bg-[var(--cv-danger-soft)] text-[var(--cv-danger)] hover:bg-red-100",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
