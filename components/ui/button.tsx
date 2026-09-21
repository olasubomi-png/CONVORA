import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  children: ReactNode;
};

export function Button({
  variant = "primary",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" &&
          "bg-[#0a0a0a] text-white hover:bg-[#262626]",
        variant === "secondary" &&
          "border border-[#e5e5e5] bg-white text-[#0a0a0a] hover:border-[#0a0a0a]",
        variant === "ghost" && "text-[#525252] hover:text-[#0a0a0a]",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
