import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type BadgeProps = {
  children: ReactNode;
  tone?: "neutral" | "accent" | "success" | "warning" | "danger" | "whatsapp" | "webchat" | "email" | "instagram" | "facebook";
  className?: string;
};

export function Badge({ children, tone = "neutral", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium tracking-wide",
        tone === "neutral" && "bg-slate-100 text-slate-600",
        tone === "accent" && "bg-[var(--cv-accent-soft)] text-[var(--cv-accent)]",
        tone === "success" && "bg-[var(--cv-success-soft)] text-[var(--cv-success)]",
        tone === "warning" && "bg-[var(--cv-warning-soft)] text-[var(--cv-warning)]",
        tone === "danger" && "bg-[var(--cv-danger-soft)] text-[var(--cv-danger)]",
        tone === "whatsapp" && "bg-emerald-50 text-emerald-700",
        tone === "webchat" && "bg-blue-50 text-blue-700",
        tone === "email" && "bg-violet-50 text-violet-700",
        tone === "instagram" && "bg-pink-50 text-pink-700",
        tone === "facebook" && "bg-sky-50 text-sky-700",
        className,
      )}
    >
      {children}
    </span>
  );
}
