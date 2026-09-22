import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
};

export function Input({ label, error, id, className, ...props }: InputProps) {
  const inputId = id ?? props.name;
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={inputId}
        className="block text-sm font-medium text-[var(--cv-fg)]"
      >
        {label}
      </label>
      <input
        id={inputId}
        className={cn(
          "w-full rounded-xl border border-[var(--cv-border)] bg-white px-3.5 py-2.5 text-sm text-[var(--cv-fg)] placeholder:text-[var(--cv-fg-subtle)] shadow-sm transition-colors focus:border-[var(--cv-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--cv-accent-ring)] disabled:bg-[var(--cv-surface-muted)] disabled:opacity-60",
          error &&
            "border-[var(--cv-danger)] focus:border-[var(--cv-danger)] focus:ring-red-200",
          className,
        )}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : undefined}
        {...props}
      />
      {error ? (
        <p
          id={`${inputId}-error`}
          className="text-sm text-[var(--cv-danger)]"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
