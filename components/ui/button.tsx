import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost"; children: ReactNode };

export function Button({ variant = "primary", className, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50",
        variant === "primary" && "bg-[#1f4e3d] text-white hover:bg-[#173b2e]",
        variant === "secondary" && "border border-[#141414] bg-white text-[#141414] hover:bg-[#f3f3f1]",
        variant === "ghost" && "text-[#3f3f3f] hover:text-[#141414]",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
