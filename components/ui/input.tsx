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
        className="block text-sm font-medium text-[#0a0a0a]"
      >
        {label}
      </label>
      <input
        id={inputId}
        className={cn(
          "w-full border border-[#e5e5e5] bg-white px-3 py-2.5 text-sm text-[#0a0a0a] placeholder:text-[#a3a3a3] transition-colors focus:border-[#0a0a0a] focus:outline-none focus:ring-1 focus:ring-[#0a0a0a] disabled:bg-[#fafafa] disabled:opacity-60",
          error && "border-[#b91c1c] focus:border-[#b91c1c] focus:ring-[#b91c1c]",
          className,
        )}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : undefined}
        {...props}
      />
      {error ? (
        <p id={`${inputId}-error`} className="text-sm text-[#b91c1c]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
